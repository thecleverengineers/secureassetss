import {
  User, Property, PropertySpace, PropertyMedia, Application, TenantKyc, TenantProfile, Occupant, TenantInterview,
  PropertyVisit, Tenancy, RentalInvoice, UtilityReading, AuditLog,
} from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { landlordUsage, usageWithLimits, assertLandlordLimit } from '../services/landlordSubscription.js';
import { assignedPropertyIds } from '../services/scope.js';
import { createNotification } from '../services/notifications.js';

function toCsv(rows) { if (!rows.length) return ''; const keys = Object.keys(rows[0]); const esc = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`; return [keys.map(esc).join(','), ...rows.map((row) => keys.map((key) => esc(row[key])).join(','))].join('\n'); }

const sameId = (a, b) => a && b && String(a?._id || a) === String(b?._id || b);
function canManageProperty(user, property) {
  if (user.role === 'admin') return true;
  if (user.role === 'manager') return sameId(property.manager, user._id) || (user.assignedProperties || []).some((id) => sameId(id, property._id));
  return user.role === 'tenant' && sameId(property.owner, user._id);
}
async function propertyForUser(user, propertyId) {
  const property = await Property.findOne({ _id: propertyId, deletedAt: null });
  if (!property || !canManageProperty(user, property)) throw new ApiError(403, 'Property management access denied');
  return property;
}

export const getPropertyTree = asyncHandler(async (req, res) => {
  const property = await propertyForUser(req.user, req.params.propertyId);
  const [spaces, media] = await Promise.all([
    PropertySpace.find({ property: property._id, deletedAt: null }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    PropertyMedia.find({ property: property._id, deletedAt: null }).sort({ cover: -1, sortOrder: 1 }).lean(),
  ]);
  const nodes = new Map(spaces.map((item) => [String(item._id), { ...item, children: [], media: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parentId = node.parent ? String(node.parent) : '';
    if (parentId && nodes.has(parentId)) nodes.get(parentId).children.push(node); else roots.push(node);
  }
  media.forEach((item) => { if (item.space && nodes.has(String(item.space))) nodes.get(String(item.space)).media.push(item); });
  res.json({ success: true, data: { property: property.toObject(), tree: roots, propertyMedia: media.filter((item) => !item.space) } });
});

export const getLandlordOverview = asyncHandler(async (req, res) => {
  if (req.user.role !== 'tenant' || !req.user.landlordEnabled) throw new ApiError(403, 'Landlord Mode is required');
  const owner = req.user._id; const now = new Date(); const month = now.toISOString().slice(0, 7);
  const usageData = await usageWithLimits(owner);
  const [occupiedRooms, vacantRooms, reservedRooms, applications, interviews, visits, invoices, promotions] = await Promise.all([
    PropertySpace.countDocuments({ owner, level: { $in: ['room', 'bed', 'apartment'] }, status: { $in: ['occupied', 'rented', 'leased'] }, deletedAt: null }),
    PropertySpace.countDocuments({ owner, level: { $in: ['room', 'bed', 'apartment'] }, status: 'available', deletedAt: null }),
    PropertySpace.countDocuments({ owner, level: { $in: ['room', 'bed', 'apartment'] }, status: 'reserved', deletedAt: null }),
    Application.countDocuments({ status: { $in: ['submitted', 'under_review', 'shortlisted', 'interview_requested', 'interview_scheduled', 'site_visit_scheduled', 'additional_documents_requested'] }, property: { $in: await Property.distinct('_id', { owner }) } }),
    TenantInterview.countDocuments({ landlord: owner, status: { $in: ['requested', 'scheduled', 'rescheduled'] } }),
    PropertyVisit.countDocuments({ landlord: owner, status: { $in: ['requested', 'pending_approval', 'approved', 'rescheduled', 'confirmed'] } }),
    RentalInvoice.find({ landlord: owner, billingMonth: month }).lean(),
    Property.countDocuments({ owner, 'promotion.endsAt': { $gt: now }, $or: [{ 'promotion.featured': true }, { 'promotion.topListing': true }, { 'promotion.urgentType': { $ne: 'none' } }] }),
  ]);
  const expected = invoices.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  const collected = invoices.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);
  const overdue = invoices.filter((item) => item.status === 'overdue').reduce((sum, item) => sum + Number(item.balanceAmount || 0), 0);
  res.json({ success: true, data: { ...usageData, kpis: { occupiedRooms, vacantRooms, reservedRooms, pendingApplications: applications, scheduledInterviews: interviews, scheduledSiteVisits: visits, monthlyRentExpected: expected, rentCollected: collected, pendingRent: Math.max(expected - collected, 0), overdueRent: overdue, activePromotions: promotions } } });
});

export const submitTenantKyc = asyncHandler(async (req, res) => {
  if (req.user.role !== 'tenant') throw new ApiError(403, 'Tenant account required');
  const body = req.body || {};
  const required = ['governmentId', 'addressProof', 'profilePhoto'];
  if (required.some((key) => !body[key])) throw new ApiError(422, 'Government ID, address proof and profile photograph are required');
  const record = await TenantKyc.findOneAndUpdate(
    { user: req.user._id },
    {
      $set: { ...body, user: req.user._id, status: 'submitted', submittedAt: new Date() },
      $push: { history: { status: 'submitted', by: req.user._id, at: new Date() } },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await User.findByIdAndUpdate(req.user._id, { kycStatus: 'submitted' });
  res.json({ success: true, data: record });
});

export const reviewTenantKyc = asyncHandler(async (req, res) => {
  if (!['admin', 'manager'].includes(req.user.role)) throw new ApiError(403, 'KYC reviewer access required');
  const status = String(req.body.status || '');
  if (!['changes_required', 'verified', 'rejected', 'suspended', 'expired'].includes(status)) throw new ApiError(422, 'Invalid KYC decision');
  const record = await TenantKyc.findById(req.params.id);
  if (!record) throw new ApiError(404, 'KYC record not found');
  record.status = status; record.reviewer = req.user._id; record.reviewedAt = new Date(); record.reason = req.body.reason;
  if (status === 'verified') { record.verifiedAt = new Date(); record.expiresAt = req.body.expiresAt || new Date(Date.now() + 365 * 86400000); }
  record.history.push({ status, reason: req.body.reason, by: req.user._id, at: new Date() }); await record.save();
  await User.findByIdAndUpdate(record.user, { kycStatus: status });
  res.json({ success: true, data: record });
});

export const createRentalApplication = asyncHandler(async (req, res) => {
  if (req.user.role !== 'tenant') throw new ApiError(403, 'Tenant account required');
  const kyc = await TenantKyc.findOne({ user: req.user._id, status: 'verified', $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }, { expiresAt: { $exists: false } }] });
  if (!kyc) throw new ApiError(403, 'Verified KYC is required before applying');
  const property = await Property.findOne({ _id: req.body.property, visibility: 'public', publicationStatus: 'published', status: { $in: ['available', 'partially_occupied'] } });
  if (!property) throw new ApiError(404, 'Listing is not available');
  const space = req.body.targetSpace ? await PropertySpace.findOne({ _id: req.body.targetSpace, property: property._id, visibility: 'public', publicationStatus: 'published', status: 'available' }) : null;
  if (req.body.targetSpace && !space) throw new ApiError(404, 'Selected room or unit is not available');
  const rules = space?.occupancyRules || property.occupancyRules || {}; const summary = req.body.occupantSummary || {};
  const exceeds = (rules.maxTotal && Number(summary.total || 0) > rules.maxTotal) || (rules.maxAdults && Number(summary.adults || 0) > rules.maxAdults) || (rules.maxChildren && Number(summary.children || 0) > rules.maxChildren);
  if (exceeds && !req.body.requestOccupancyException) throw new ApiError(422, 'Occupancy exceeds the landlord limit');
  const application = await Application.create({
    applicationNumber: `AP-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`, applicant: req.user._id, landlord: property.owner, property: property._id, targetSpace: space?._id,
    status: 'submitted', step: 9, personal: req.body.personal, employment: req.body.employment, identity: req.body.identity, documents: req.body.documents || [],
    occupantSummary: summary, occupantIds: req.body.occupantIds || [], moveInDate: req.body.moveInDate, expectedStayMonths: req.body.expectedStayMonths,
    monthlyIncome: req.body.monthlyIncome, rentalBudget: req.body.rentalBudget, vehicles: req.body.vehicles || [], pets: req.body.pets || [], references: req.body.references || [], messageToLandlord: req.body.messageToLandlord, submittedAt: new Date(), createdBy: req.user._id, updatedBy: req.user._id,
  });
  await Property.updateOne({ _id: property._id }, { $inc: { 'metrics.applications': 1 } });
  await createNotification({ user: property.owner, title: 'New tenant application', message: `${req.user.name} applied for ${space?.name || property.title}`, category: 'system', actionUrl: `/app/applications` });
  res.status(201).json({ success: true, data: application });
});

export const decideApplication = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id).populate('property');
  if (!application || !canManageProperty(req.user, application.property)) throw new ApiError(403, 'Application decision access denied');
  const status = String(req.body.status || '');
  const allowed = ['under_review', 'shortlisted', 'interview_requested', 'interview_scheduled', 'site_visit_scheduled', 'additional_documents_requested', 'approved', 'rejected', 'waiting_list', 'agreement_pending', 'deposit_pending', 'completed'];
  if (!allowed.includes(status)) throw new ApiError(422, 'Invalid application status');
  application.status = status; application.remarks = req.body.remarks; application.reviewedBy = req.user._id; application.updatedBy = req.user._id; await application.save();
  await createNotification({ user: application.applicant, title: 'Application updated', message: `Your application is now ${status.replaceAll('_', ' ')}`, category: 'system', actionUrl: '/app/applications' });
  res.json({ success: true, data: application });
});

export const createTenancyFromApplication = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id).populate('property');
  if (!application || !canManageProperty(req.user, application.property)) throw new ApiError(403, 'Application access denied');
  if (!['approved', 'agreement_pending', 'deposit_pending'].includes(application.status)) throw new ApiError(409, 'Approve the application before creating a tenancy');
  if (req.user.role === 'tenant') await assertLandlordLimit(req.user._id, 'activeTenants');
  const existing = await Tenancy.findOne({ application: application._id });
  if (existing) return res.json({ success: true, data: existing });
  const tenancy = await Tenancy.create({ tenant: application.applicant, landlord: application.property.owner, property: application.property._id, space: application.targetSpace, application: application._id, status: 'deposit_pending', startDate: req.body.startDate || application.moveInDate, endDate: req.body.endDate, monthlyRent: req.body.monthlyRent || application.property.pricing?.monthlyRent || application.property.price, securityDeposit: req.body.securityDeposit || application.property.pricing?.securityDeposit, dueDay: req.body.dueDay || 1, occupants: application.occupantIds || [], createdBy: req.user._id, updatedBy: req.user._id });
  if (application.targetSpace) await PropertySpace.findByIdAndUpdate(application.targetSpace, { status: 'reserved' }); else await Property.findByIdAndUpdate(application.property._id, { status: 'reserved' });
  application.status = 'deposit_pending'; await application.save();
  res.status(201).json({ success: true, data: tenancy });
});

export const calculateUtility = asyncHandler(async (req, res) => {
  const previousReading = Number(req.body.previousReading || 0); const currentReading = Number(req.body.currentReading || 0);
  if (currentReading < previousReading) throw new ApiError(422, 'Current reading cannot be lower than previous reading');
  const unitsConsumed = currentReading - previousReading;
  const totalAmount = unitsConsumed * Number(req.body.ratePerUnit || 0) + Number(req.body.fixedCharge || 0) + Number(req.body.tax || 0) + Number(req.body.otherCharge || 0);
  res.json({ success: true, data: { unitsConsumed, totalAmount } });
});

export const exportProperty = asyncHandler(async (req, res) => {
  const property = await propertyForUser(req.user, req.params.propertyId);
  const [spaces, applications, visits, tenancies, invoices, utilities] = await Promise.all([
    PropertySpace.find({ property: property._id, deletedAt: null }).lean(), Application.find({ property: property._id }).populate('applicant', 'name email phone').lean(),
    PropertyVisit.find({ property: property._id }).lean(), Tenancy.find({ property: property._id }).populate('tenant', 'name email phone').lean(),
    RentalInvoice.find({ property: property._id }).lean(), UtilityReading.find({ property: property._id }).lean(),
  ]);
  const payload = { property: property.toObject(), spaces, applications, visits, tenancies, invoices, utilities, exportedAt: new Date().toISOString() };
  if (req.query.format === 'csv') {
    const rows = spaces.map((space) => ({ property: property.title, space: space.name, level: space.level, status: space.status, purpose: space.purpose, price: space.price, visibility: space.visibility }));
    res.type('text/csv').attachment(`${property.code || property._id}-spaces.csv`).send(toCsv(rows)); return;
  }
  res.attachment(`${property.code || property._id}-backup.json`).json(payload);
});
