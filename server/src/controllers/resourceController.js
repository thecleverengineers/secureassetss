import mongoose from 'mongoose';
import { resources } from '../services/resources.js';
import { buildScope } from '../services/scope.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import {
  Tenant, Property, Lease, Application, Subscription, SurveyorProfile, SurveyorVerification, SurveyService, SurveyJob,
  SurveyQuotation, SurveyProject, SiteVisit, FieldData, SurveyEquipment, SurveyReport, SurveyTeamMember, SurveyClient, SurveyReview, SurveyDispute, SurveyPromotion,
  PropertySpace, PropertyMedia, TenantProfile, TenantKyc, Occupant, TenantInterview, PropertyVisit, Tenancy, RentalInvoice, UtilityReading, ReminderRule, PropertyPromotion, SiteSetting, PropertyTypeConfig, Facility, FacilityBooking, Payment, NotificationPreference,
} from '../models/index.js';
import { getActiveSurveyorSubscription, assertSurveyorLimit, assertSurveyorFeature } from '../services/surveyorSubscription.js';
import { getActiveLandlordSubscription, assertLandlordLimit } from '../services/landlordSubscription.js';
import { applyPaidPayment } from '../services/paymentLifecycle.js';
import { validateFacilityBookingWindow, validateFacilityScheduleDefinition } from '../services/facilityAvailability.js';
import { emitRealtime, emitSiteChanged } from '../services/realtime.js';

function configFor(req) {
  const config = resources[req.params.resource];
  if (!config) throw new ApiError(404, 'Unknown resource');
  if (!config.readRoles.includes(req.user.role)) throw new ApiError(403, 'This module is not available for your role');
  return config;
}
function pick(source, keys) { return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]])); }
function regexEscape(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function populate(query, config) {
  const paths = Array.isArray(config.populate) ? config.populate : config.populate ? [config.populate] : [];
  paths.forEach((path) => query.populate(path, '-password -refreshTokens -otpHash'));
  return query;
}
function makeNumber(prefix) { return `${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`; }

const siteConfigurationResources = new Set([
  'site-settings', 'seo-pages', 'home-carousel', 'home-sections', 'landlord-plans',
  'property-type-configs', 'area-units', 'platform-modules', 'content-pages', 'integration-settings',
]);

function collectRealtimeUsers(record = {}) {
  const fields = [
    'user', 'owner', 'manager', 'tenant', 'landlord', 'applicant', 'requester', 'raisedBy',
    'assignedTo', 'surveyor', 'client', 'payer', 'payee', 'uploadedBy', 'createdBy',
  ];
  const ids = [];
  for (const field of fields) {
    const value = record?.[field];
    if (!value) continue;
    if (Array.isArray(value)) ids.push(...value);
    else ids.push(value);
  }
  return [...new Set(ids.map((value) => String(value?._id || value)).filter(Boolean))];
}

function broadcastResourceMutation(resource, action, record) {
  emitRealtime(resource, action, record, { users: collectRealtimeUsers(record) });
  if (siteConfigurationResources.has(resource)) emitSiteChanged(resource);
}

async function publicApplicationTarget(propertyId, spaceId) {
  const property = await Property.findOne({
    _id: propertyId,
    visibility: 'public',
    publicationStatus: 'published',
    status: { $in: ['available', 'partially_occupied'] },
    deletedAt: null,
  }).lean();
  if (!property) throw new ApiError(404, 'Public property listing not found');
  if (property.requiresActiveSubscription) {
    const active = await Subscription.exists({ user: property.owner, status: 'active', expiresAt: { $gt: new Date() } });
    if (!active) throw new ApiError(404, 'Public property listing is no longer available');
  }
  let space = null;
  if (spaceId) {
    space = await PropertySpace.findOne({
      _id: spaceId,
      property: property._id,
      visibility: 'public',
      publicationStatus: 'published',
      status: 'available',
      deletedAt: null,
    }).lean();
    if (!space) throw new ApiError(422, 'Selected room or unit is not publicly available');
  }
  return { property, space };
}
function cleanOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function normalizePropertyWorkflowFields(body, existing = {}) {
  const merged = { ...existing, ...body };
  const specifications = { ...(existing.specifications || {}), ...(body.specifications || {}) };
  const pricing = { ...(existing.pricing || {}), ...(body.pricing || {}) };
  const address = { ...(existing.address || {}), ...(body.address || {}) };
  const map = { ...(existing.map || {}), ...(body.map || {}) };
  const listingType = body.purpose || body.listingType || existing.purpose || existing.listingType || 'rent';

  if (!existing._id) {
    const required = [
      ['title', merged.title], ['description', merged.description], ['type', merged.type], ['listingType', listingType],
      ['country', address.country], ['state', address.state], ['city', address.city], ['fullAddress', address.line1], ['pinCode', address.postalCode],
    ].filter(([, value]) => !String(value || '').trim()).map(([label]) => label);
    if (required.length) throw new ApiError(422, `Missing property fields: ${required.join(', ')}`);
  }

  const requiredPrice = listingType === 'sale' ? pricing.salePrice : listingType === 'lease' ? pricing.leaseAmount : pricing.monthlyRent;
  if ((body.pricing || !existing._id) && (!Number.isFinite(Number(requiredPrice)) || Number(requiredPrice) <= 0)) {
    throw new ApiError(422, `${listingType === 'sale' ? 'Sale price' : listingType === 'lease' ? 'Lease amount' : 'Monthly rent'} must be greater than zero`);
  }

  if (body.contactInformation) {
    const contact = { ...(existing.contactInformation || {}), ...body.contactInformation };
    contact.ownerName = String(contact.ownerName || '').trim();
    contact.agentName = String(contact.agentName || '').trim();
    contact.phoneNumber = String(contact.phoneNumber || '').trim();
    contact.emailAddress = String(contact.emailAddress || '').trim().toLowerCase();
    if (contact.emailAddress && !/^\S+@\S+\.\S+$/.test(contact.emailAddress)) throw new ApiError(422, 'Enter a valid contact email address');
    const phoneDigits = contact.phoneNumber.replace(/\D/g, '');
    if (contact.phoneNumber && (phoneDigits.length < 7 || phoneDigits.length > 15)) throw new ApiError(422, 'Enter a valid contact phone number');
    if (!contact.ownerName && !contact.agentName) throw new ApiError(422, 'Enter the owner name or agent name');
    if (!contact.phoneNumber && !contact.emailAddress) throw new ApiError(422, 'Enter a contact phone number or email address');
    body.contactInformation = contact;
  }

  if (body.specifications) {
    body.specifications = specifications;
    body.bedrooms = cleanOptionalNumber(specifications.bedrooms);
    body.bathrooms = cleanOptionalNumber(specifications.bathrooms);
    body.roomDetails = {
      ...(existing.roomDetails || {}), ...(body.roomDetails || {}),
      bedrooms: cleanOptionalNumber(specifications.bedrooms), bathrooms: cleanOptionalNumber(specifications.bathrooms),
      balconies: cleanOptionalNumber(specifications.balconies), totalRooms: cleanOptionalNumber(specifications.rooms),
    };
    body.listingDetails = {
      ...(existing.listingDetails || {}), ...(body.listingDetails || {}),
      floor: cleanOptionalNumber(specifications.floorNumber), totalFloors: cleanOptionalNumber(specifications.totalFloorsInBuilding),
      facing: specifications.facing, propertyAgeYears: cleanOptionalNumber(specifications.propertyAge), availableFrom: specifications.availableFrom,
    };
    body.furnishing = { ...(existing.furnishing || {}), ...(body.furnishing || {}), status: specifications.furnishingStatus };
    body.ageDetails = { ...(existing.ageDetails || {}), ...(body.ageDetails || {}), availableFrom: specifications.availableFrom };
  }

  if (body.areas) {
    const areas = { ...(existing.areas || {}), ...body.areas };
    body.areas = areas;
    body.area = cleanOptionalNumber(areas.builtUp ?? areas.superBuiltUp ?? areas.plot ?? areas.carpet ?? areas.total);
  }

  if (body.parking) {
    body.parking = { ...(existing.parking || {}), ...body.parking };
    body.roomDetails = { ...(existing.roomDetails || {}), ...(body.roomDetails || {}), coveredParking: cleanOptionalNumber(body.parking.carSpaces) };
    body.listingDetails = { ...(existing.listingDetails || {}), ...(body.listingDetails || {}), parkingSpaces: cleanOptionalNumber(body.parking.carSpaces) };
  }

  if (body.amenityDetails) {
    const labels = {
      lift: 'Lift', security: 'Security', cctv: 'CCTV', gatedCommunity: 'Gated Community', garden: 'Garden', swimmingPool: 'Swimming Pool', gym: 'Gym', clubhouse: 'Clubhouse',
      childrenPlayArea: "Children's Play Area", joggingTrack: 'Jogging Track', communityHall: 'Community Hall', terrace: 'Terrace', balcony: 'Balcony', airConditioning: 'Air Conditioning',
      modularKitchen: 'Modular Kitchen', storeRoom: 'Store Room', servantRoom: 'Servant Room', wheelchairAccess: 'Wheelchair Access',
    };
    body.amenityDetails = { ...(existing.amenityDetails || {}), ...body.amenityDetails };
    body.amenities = Object.entries(body.amenityDetails).filter(([, enabled]) => Boolean(enabled)).map(([key]) => labels[key]).filter(Boolean);
  }

  if (body.map) {
    body.map = map;
    const latitude = Number(map.latitude); const longitude = Number(map.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      body.location = { type: 'Point', coordinates: [longitude, latitude] };
    }
  }
  if (body.address) body.address = address;
  if (body.pricing) body.pricing = pricing;
}

async function applyPropertyTypeConfiguration(body, existing = {}) {
  const type = body.type || existing.type;
  const purpose = body.purpose || body.listingType || existing.purpose || existing.listingType || (body.isSale ? 'sale' : 'rent');
  if (!type) throw new ApiError(422, 'Select a property type');
  const config = await PropertyTypeConfig.findOne({ key: type, active: true }).lean();
  if (!config) throw new ApiError(422, 'The selected property type is not active');
  if (config.allowedPurposes?.length && !config.allowedPurposes.includes(purpose)) throw new ApiError(422, `${config.label} cannot be listed for ${purpose}`);
  if (type === 'other' && !String(body.customType || existing.customType || '').trim()) throw new ApiError(422, 'Enter the custom property type');
  body.type = type;
  body.purpose = purpose;
  body.listingType = purpose;
  body.isSale = purpose === 'sale';
  body.hierarchyMode = config.hierarchyMode;
  const pricing = body.pricing || existing.pricing || {};
  const legacyPrice = purpose === 'sale' ? pricing.salePrice : purpose === 'lease' ? pricing.leaseAmount : pricing.monthlyRent;
  if (legacyPrice !== undefined && legacyPrice !== null && legacyPrice !== '') body.price = Number(legacyPrice);
  normalizePropertyWorkflowFields(body, existing);
  return config;
}

function addGeneratedFields(resource, body) {
  const map = { properties: ['code', 'PR'], leases: ['leaseNumber', 'LS'], surveys: ['surveyNumber', 'SV'], applications: ['applicationNumber', 'AP'], payments: ['invoiceNumber', 'INV'], complaints: ['complaintNumber', 'CMP'], 'survey-jobs': ['jobNumber', 'SJ'], 'survey-quotations': ['quotationNumber', 'SQ'], 'survey-projects': ['projectNumber', 'SP'], 'survey-reports': ['reportNumber', 'SR'] };
  const target = map[resource]; if (target && !body[target[0]]) body[target[0]] = makeNumber(target[1]);
}

function sameId(a, b) { return a && b && String(a?._id || a) === String(b?._id || b); }
function slug(value) { return String(value || 'surveyor').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 70); }

async function prepareFacilityBooking(user, body, existing = null) {
  const facilityId = body.facility || existing?.facility;
  const facility = await Facility.findOne({ _id: facilityId, deletedAt: null });
  if (!facility || facility.status !== 'active') throw new ApiError(404, 'Facility is not available');
  const ownsFacility = sameId(facility.owner, user._id);
  if (user.role === 'tenant' && !ownsFacility) {
    if (facility.visibility === 'private') throw new ApiError(403, 'This facility is private');
    if (facility.visibility === 'tenant') {
      const hasTenancy = await Tenancy.exists({ tenant: user._id, property: facility.property, status: { $in: ['reserved', 'deposit_pending', 'agreement_pending', 'active', 'notice', 'move_out'] } });
      if (!hasTenancy) throw new ApiError(403, 'This facility is available only to current property tenants');
    }
  }
  const startAt = new Date(body.startAt || existing?.startAt);
  const endAt = new Date(body.endAt || existing?.endAt);
  validateFacilityBookingWindow(facility, startAt, endAt, { isExisting: Boolean(existing) });
  if (Number(body.guests ?? existing?.guests ?? 1) > Number(facility.capacity || 1)) throw new ApiError(422, `Maximum facility capacity is ${facility.capacity}`);
  const conflict = await FacilityBooking.exists({
    facility: facility._id,
    _id: { $ne: existing?._id },
    status: { $in: ['requested', 'approved', 'rescheduled', 'in_progress'] },
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
  });
  if (conflict) throw new ApiError(409, 'The requested facility time overlaps another booking');
  body.facility = facility._id;
  body.property = facility.property;
  body.owner = facility.owner;
  body.startAt = startAt;
  body.endAt = endAt;
  body.amount = facility.price;
  body.deposit = facility.deposit;
  body.paymentStatus = Number(facility.price || 0) + Number(facility.deposit || 0) > 0 ? (body.paymentStatus || existing?.paymentStatus || 'pending') : 'not_required';
  return facility;
}

async function syncApprovedUtilityToInvoice(reading, actorId) {
  if (!reading?.approved || !reading?.tenancy || !reading?.billingPeriod) return null;
  const tenancy = await Tenancy.findById(reading.tenancy).lean();
  if (!tenancy) return null;
  const month = String(reading.billingPeriod).slice(0, 7);
  const dueDate = reading.dueDate || new Date(`${month}-01T23:59:59.999Z`);
  const invoice = await RentalInvoice.findOneAndUpdate(
    { tenancy: tenancy._id, billingMonth: month },
    { $setOnInsert: {
      invoiceNumber: `RNT-${month.replace('-', '')}-${String(tenancy._id).slice(-7).toUpperCase()}`,
      tenancy: tenancy._id, tenant: tenancy.tenant, landlord: tenancy.landlord, property: tenancy.property, space: tenancy.space,
      billingMonth: month, dueDate, charges: { baseRent: Number(tenancy.monthlyRent || 0) }, paidAmount: 0,
      createdBy: actorId, updatedBy: actorId,
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const utilityKey = reading.utilityType === 'water' ? 'water' : 'electricity';
  invoice.set(`charges.${utilityKey}`, Number(reading.totalAmount || 0));
  const charges = invoice.charges?.toObject?.() || invoice.charges || {};
  const other = (charges.other || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const subtotal = ['baseRent','electricity','water','maintenance','parking','internet','gas','cleaning','commonArea','securityDeposit','lateFee'].reduce((sum, key) => sum + Number(charges[key] || 0), 0) + other;
  invoice.totalAmount = Math.max(subtotal + Number(invoice.previousBalance || 0) - Number(invoice.discounts || 0), 0);
  invoice.balanceAmount = Math.max(invoice.totalAmount - Number(invoice.paidAmount || 0), 0);
  invoice.status = invoice.balanceAmount <= 0 ? 'paid' : invoice.paidAmount > 0 ? 'partially_paid' : (new Date(invoice.dueDate) < new Date() ? 'overdue' : 'pending');
  invoice.updatedBy = actorId;
  await invoice.save();
  return invoice;
}

async function applySurveyorCreateDefaults(resource, user, body) {
  if (user.role !== 'tenant') return;
  if (resource === 'surveyor-profiles') {
    await getActiveSurveyorSubscription(user._id);
    if (await SurveyorProfile.exists({ user: user._id })) throw new ApiError(409, 'A Surveyor profile already exists for this account');
    body.user = user._id; body.visibility = 'private'; body.publicationStatus = 'draft';
    body.publicSlug ||= `${slug(body.name || user.name)}-${String(user._id).slice(-6)}`;
    delete body.isFeatured; delete body.isRecommended;
  }
  if (resource === 'survey-services') {
    await getActiveSurveyorSubscription(user._id);
    body.surveyor = user._id;
    const profile = await SurveyorProfile.findOne({ user: user._id });
    if (!profile) throw new ApiError(422, 'Create your Surveyor profile before adding services');
    body.profile = profile._id;
    body.visibility = body.visibility === 'public' ? 'public' : 'private';
    if (body.visibility === 'public') {
      await assertSurveyorLimit(user._id, 'publicServices');
      if (profile.verificationStatus !== 'verified') throw new ApiError(403, 'Verification is required before publishing public services');
      body.status = 'pending_moderation'; body.moderation = { status: 'pending' };
    } else { body.status = body.status === 'archived' ? 'archived' : 'draft'; body.moderation = { status: 'not_submitted' }; }
    delete body.isFeatured;
  }
  if (resource === 'survey-jobs') {
    body.client = user._id; body.hiredSurveyor = undefined; body.shortlistedSurveyors = [];
    body.status = body.status === 'open' ? 'open' : 'draft';
    if (body.visibility === 'invited' && !(body.invitedSurveyors || []).length) throw new ApiError(422, 'Invite at least one Surveyor for an invited job');
  }
  if (resource === 'survey-quotations') {
    await assertSurveyorLimit(user._id, 'quotations');
    const job = await SurveyJob.findById(body.job);
    if (!job) throw new ApiError(404, 'Survey job not found');
    if (sameId(job.client, user._id)) throw new ApiError(409, 'You cannot quote on your own job');
    const canQuote = job.visibility === 'public' || (job.invitedSurveyors || []).some((id) => sameId(id, user._id));
    if (!canQuote || job.status !== 'open') throw new ApiError(403, 'This job is not open to your Surveyor account');
    body.surveyor = user._id; body.client = job.client;
    body.status = body.status === 'submitted' ? 'submitted' : 'draft';
    if (body.status === 'submitted') body.submittedAt = new Date();
  }
  if (resource === 'site-visits') {
    const project = await SurveyProject.findById(body.project);
    if (!project || (!sameId(project.surveyor, user._id) && !sameId(project.client, user._id))) throw new ApiError(403, 'Project access denied');
    body.surveyor = project.surveyor; body.client = project.client; body.status ||= 'requested';
  }
  if (resource === 'field-data') {
    const project = await SurveyProject.findById(body.project);
    if (!project || !sameId(project.surveyor, user._id)) throw new ApiError(403, 'Only the assigned Surveyor can collect field data');
    body.surveyor = user._id; body.observedAt ||= new Date();
  }
  if (resource === 'survey-equipment') { await getActiveSurveyorSubscription(user._id); body.surveyor = user._id; }
  if (resource === 'survey-reports') {
    await assertSurveyorLimit(user._id, 'reports');
    const project = await SurveyProject.findById(body.project);
    if (!project || !sameId(project.surveyor, user._id)) throw new ApiError(403, 'Only the assigned Surveyor can create reports');
    body.surveyor = user._id; body.client = project.client; body.status = 'draft';
  }
  if (resource === 'survey-team') {
    await assertSurveyorLimit(user._id, 'teamMembers');
    body.owner = user._id; body.status ||= 'invited'; body.invitedAt ||= new Date();
  }
  if (resource === 'survey-clients') {
    await assertSurveyorFeature(user._id, 'clientManagement'); await assertSurveyorLimit(user._id, 'clients'); body.surveyor = user._id;
  }
  if (resource === 'survey-reviews') {
    const project = await SurveyProject.findById(body.project);
    if (!project || !sameId(project.client, user._id) || project.status !== 'completed') throw new ApiError(403, 'Only the verified client can review a completed project');
    body.client = user._id; body.surveyor = project.surveyor; body.moderation = { status: 'pending' };
  }
  if (resource === 'survey-disputes') {
    const project = await SurveyProject.findById(body.project);
    if (!project || (!sameId(project.client, user._id) && !sameId(project.surveyor, user._id))) throw new ApiError(403, 'Project access denied');
    body.raisedBy = user._id; body.against = sameId(project.client, user._id) ? project.surveyor : project.client; body.status = 'submitted';
  }
  if (resource === 'survey-promotions') {
    await assertSurveyorFeature(user._id, 'featuredEligible'); body.surveyor = user._id; body.status = 'pending'; delete body.metrics; delete body.payment;
  }
}

async function assertTenantMutation(resource, user, record, action = 'update') {
  if (user.role !== 'tenant') return;
  const uid = user._id;
  const ownerRules = {
    'surveyor-profiles': record.user,
    'survey-services': record.surveyor,
    'survey-equipment': record.surveyor,
    'survey-team': record.owner,
    'survey-clients': record.surveyor,
    'survey-promotions': record.surveyor,
    'field-data': record.surveyor,
    'property-spaces': record.owner, 'property-media': record.owner,
    'tenant-profiles': record.user, 'tenant-kyc': record.user, 'occupants': record.tenant,
    'reminder-rules': record.owner, 'property-promotions': record.owner, 'facilities': record.owner,
  };
  if (ownerRules[resource] && !sameId(ownerRules[resource], uid)) throw new ApiError(403, 'You cannot modify another Surveyor’s private record');
  if (resource === 'survey-jobs' && !sameId(record.client, uid)) throw new ApiError(403, 'Only the client who posted this job can modify it');
  if (resource === 'survey-quotations' && !sameId(record.surveyor, uid)) throw new ApiError(403, 'Only the Surveyor who created this quotation can modify it');
  if (resource === 'survey-projects' && !sameId(record.surveyor, uid) && !sameId(record.client, uid)) throw new ApiError(403, 'Project access denied');
  if (resource === 'site-visits' && !sameId(record.surveyor, uid) && !sameId(record.client, uid)) throw new ApiError(403, 'Site visit access denied');
  if (resource === 'survey-reports' && !sameId(record.surveyor, uid)) throw new ApiError(403, 'Only the assigned Surveyor can modify reports');
  if (resource === 'survey-reports' && record.status === 'locked') throw new ApiError(409, 'Locked reports cannot be modified');
  if (resource === 'survey-reviews') {
    if (sameId(record.client, uid)) return;
    if (sameId(record.surveyor, uid) && action === 'update') return;
    throw new ApiError(403, 'Review access denied');
  }
  if (resource === 'survey-disputes' && !sameId(record.raisedBy, uid) && !sameId(record.against, uid)) throw new ApiError(403, 'Dispute access denied');
  if (resource === 'facility-bookings' && !sameId(record.requester, uid) && !sameId(record.owner, uid)) throw new ApiError(403, 'Facility booking access denied');
  if (resource === 'tenant-interviews' && !sameId(record.landlord, uid) && !sameId(record.tenant, uid)) throw new ApiError(403, 'Interview access denied');
  if (resource === 'property-visits' && !sameId(record.landlord, uid) && !sameId(record.requester, uid)) throw new ApiError(403, 'Site visit access denied');
  if (resource === 'tenancies' && !sameId(record.landlord, uid) && !sameId(record.tenant, uid)) throw new ApiError(403, 'Tenancy access denied');
  if (resource === 'rental-invoices' && !sameId(record.landlord, uid) && !sameId(record.tenant, uid)) throw new ApiError(403, 'Invoice access denied');
  if (resource === 'utility-readings' && !sameId(record.landlord, uid) && !sameId(record.tenant, uid)) throw new ApiError(403, 'Utility record access denied');
}

async function roleDefaults(resource, user, body) {
  if (resource === 'notification-preferences') {
    if (await NotificationPreference.exists({ user: user._id })) throw new ApiError(409, 'Notification preferences already exist for this account');
    body.user = user._id;
  }
  if (resource === 'applications' && ['tenant', 'user'].includes(user.role)) {
    const { property } = await publicApplicationTarget(body.property, body.targetSpace);
    body.applicant = user._id; body.landlord = property.owner; body.status = 'draft'; delete body.reviewedBy; delete body.remarks; delete body.landlordNotes;
  }
  if (resource === 'payments' && ['tenant', 'user'].includes(user.role)) {
    body.payer = user._id; body.status = 'pending'; body.paidAmount = 0; delete body.paidAt; delete body.transactionId; delete body.gateway;
    if (user.role === 'tenant') {
      const tenant = await Tenant.findOne({ user: user._id, status: 'active' }).lean();
      const lease = tenant ? await Lease.findOne({ tenant: user._id, property: tenant.property, status: { $in: ['active', 'expiring'] } }).lean() : null;
      if (tenant) { body.property ||= tenant.property; body.unit ||= tenant.unit; body.tenant ||= tenant._id; }
      if (lease) { body.lease ||= lease._id; if (!body.amount && body.type === 'rent') body.amount = lease.monthlyRent; }
    }
    if (user.role === 'user') {
      const application = await Application.findOne({ applicant: user._id, status: { $nin: ['rejected', 'withdrawn'] } }).sort('-createdAt').lean();
      if (application) { body.application ||= application._id; body.property ||= application.property; if (!body.amount && body.type === 'application_fee') body.amount = application.feeAmount; }
    }
  }
  if (resource === 'complaints' && ['tenant', 'user'].includes(user.role)) {
    body.raisedBy = user._id; body.status = 'open';
    delete body.assignedTo; delete body.approvedCost; delete body.estimatedCost; delete body.resolutionNote;
    if (!body.property && user.role === 'tenant') { const tenant = await Tenant.findOne({ user: user._id, status: 'active' }).lean(); if (tenant) { body.property = tenant.property; body.unit ||= tenant.unit; } }
  }
  if (resource === 'approvals') { body.requester = user._id; body.status = 'pending'; }
  if (resource === 'messages') body.sender = user._id;
  if (resource === 'documents') { body.owner ||= user._id; body.uploadedBy = user._id; }
  if (resource === 'attendance') user.role === 'surveyor' && (body.user = user._id);
  if (resource === 'surveys' && user.role === 'manager') body.assignedBy = user._id;
  if (resource === 'properties' && user.role === 'manager') body.manager = user._id;
  if (resource === 'properties' && user.role === 'tenant') {
    await assertLandlordLimit(user._id, 'properties');
    body.owner = user._id; body.manager = undefined; body.requiresActiveSubscription = true;
    body.purpose = body.purpose || body.listingType || (body.isSale ? 'sale' : 'rent');
    body.listingType = body.purpose; body.isSale = body.purpose === 'sale';
    body.referenceNumber ||= makeNumber('PR');
    body.visibility = body.visibility === 'public' ? 'public' : 'private';
    if (body.visibility === 'public') {
      await assertLandlordLimit(user._id, 'publicListings');
      body.publicationStatus = 'published'; body.publishedAt = new Date();
      if (!['available', 'partially_occupied', 'sold', 'leased'].includes(body.status)) body.status = 'available';
    } else body.publicationStatus = 'draft';
    delete body.isVerified; delete body.isFeatured;
  }
  if (resource === 'property-spaces' && user.role === 'tenant') {
    await getActiveLandlordSubscription(user._id);
    const property = await Property.findOne({ _id: body.property, owner: user._id, deletedAt: null });
    if (!property) throw new ApiError(403, 'You can only add spaces to your own property');
    const limitKey = { building: 'buildings', apartment: 'apartments', room: 'rooms', bed: 'beds' }[body.level];
    if (limitKey) await assertLandlordLimit(user._id, limitKey);
    body.owner = user._id;
    if (body.parent) {
      const parent = await PropertySpace.findOne({ _id: body.parent, property: property._id, owner: user._id, deletedAt: null });
      if (!parent) throw new ApiError(422, 'Parent space does not belong to this property');
    }
    if (body.visibility === 'public') {
      await assertLandlordLimit(user._id, 'publicListings');
      body.publicationStatus = 'published';
      if (!['available', 'partially_occupied', 'sold', 'leased'].includes(body.status)) body.status = 'available';
    } else { body.visibility = 'private'; body.publicationStatus = 'draft'; }
  }
  if (resource === 'property-media') {
    const property = await Property.findOne({ _id: body.property, deletedAt: null });
    if (!property) throw new ApiError(404, 'Property not found');
    if (user.role === 'tenant' && !sameId(property.owner, user._id)) throw new ApiError(403, 'You can only add media to your own property');
    if (user.role === 'manager' && !sameId(property.manager, user._id) && !(user.assignedProperties || []).some((id) => sameId(id, property._id))) throw new ApiError(403, 'You can only add media to an assigned property');
    if (body.space && !(await PropertySpace.exists({ _id: body.space, property: property._id }))) throw new ApiError(422, 'Selected space does not belong to this property');
    body.owner = property.owner || user._id; body.uploadedBy = user._id;
  }
  if (resource === 'tenant-profiles' && user.role === 'tenant') {
    if (await TenantProfile.exists({ user: user._id })) throw new ApiError(409, 'Tenant profile already exists');
    body.user = user._id;
  }
  if (resource === 'tenant-kyc' && user.role === 'tenant') {
    if (await TenantKyc.exists({ user: user._id })) throw new ApiError(409, 'KYC record already exists');
    body.user = user._id; body.status = body.status === 'submitted' ? 'submitted' : 'incomplete';
    if (body.status === 'submitted') body.submittedAt = new Date();
    delete body.reviewer; delete body.reviewedAt; delete body.verifiedAt; delete body.reason;
  }
  if (resource === 'occupants' && user.role === 'tenant') body.tenant = user._id;
  if (resource === 'tenant-interviews' && user.role === 'tenant') {
    const application = await Application.findById(body.application).populate('property');
    if (!application || !sameId(application.property?.owner, user._id)) throw new ApiError(403, 'Only the property owner can schedule this interview');
    body.property = application.property._id; body.space ||= application.targetSpace; body.landlord = user._id; body.tenant = application.applicant;
  }
  if (resource === 'property-visits' && user.role === 'tenant') {
    let property = await Property.findOne({ _id: body.property, owner: user._id, deletedAt: null }).lean();
    const ownProperty = Boolean(property);
    if (!property) ({ property } = await publicApplicationTarget(body.property, body.space));
    body.landlord = property.owner;
    body.requester = user._id;
    body.status = ownProperty ? (body.status || 'approved') : 'requested';
  }
  if (resource === 'tenancies' && user.role === 'tenant') {
    await assertLandlordLimit(user._id, 'activeTenants');
    const property = await Property.findOne({ _id: body.property, owner: user._id });
    if (!property) throw new ApiError(403, 'Only the property owner can create this tenancy');
    body.landlord = user._id;
  }
  if (resource === 'rental-invoices' && user.role === 'tenant') {
    const tenancy = await Tenancy.findOne({ _id: body.tenancy, landlord: user._id });
    if (!tenancy) throw new ApiError(403, 'Only the landlord can create this invoice');
    body.landlord = user._id; body.tenant = tenancy.tenant; body.property = tenancy.property; body.space ||= tenancy.space;
    body.invoiceNumber ||= makeNumber('RINV');
    const charges = body.charges || {};
    const other = (charges.other || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const subtotal = ['baseRent','electricity','water','maintenance','parking','internet','gas','cleaning','commonArea','securityDeposit','lateFee'].reduce((sum, key) => sum + Number(charges[key] || 0), 0) + other;
    body.totalAmount = Math.max(subtotal + Number(body.previousBalance || 0) - Number(body.discounts || 0), 0);
    body.paidAmount = Number(body.paidAmount || 0); body.balanceAmount = Math.max(body.totalAmount - body.paidAmount, 0);
    body.status = body.paidAmount >= body.totalAmount ? 'paid' : body.paidAmount > 0 ? 'partially_paid' : (body.status || 'pending');
  }
  if (resource === 'utility-readings' && user.role === 'tenant') {
    const tenancy = await Tenancy.findOne({ _id: body.tenancy, landlord: user._id });
    if (!tenancy) throw new ApiError(403, 'Only the landlord can enter utility readings');
    body.landlord = user._id; body.tenant = tenancy.tenant; body.property = tenancy.property; body.space ||= tenancy.space;
    body.unitsConsumed = Math.max(Number(body.currentReading || 0) - Number(body.previousReading || 0), 0);
    body.totalAmount = body.unitsConsumed * Number(body.ratePerUnit || 0) + Number(body.fixedCharge || 0) + Number(body.tax || 0) + Number(body.otherCharge || 0);
  }
  if (resource === 'reminder-rules' && user.role === 'tenant') { await getActiveLandlordSubscription(user._id); body.owner = user._id; }
  if (resource === 'property-promotions' && user.role === 'tenant') {
    const subscription = await getActiveLandlordSubscription(user._id);
    if (!subscription.limits?.promotions && !subscription.limits?.propertyPromotions) throw new ApiError(403, 'Property promotions are not included in your current plan');
    if (!(await Property.exists({ _id: body.property, owner: user._id }))) throw new ApiError(403, 'You can only promote your own property');
    body.owner = user._id; body.status = 'pending'; delete body.metrics; delete body.payment;
  }
  if (resource === 'facilities') {
    validateFacilityScheduleDefinition(body.availableDays || [], body.availableTimeSlots || []);
    const property = await Property.findById(body.property);
    if (!property) throw new ApiError(404, 'Property not found');
    if (user.role === 'tenant') {
      await getActiveLandlordSubscription(user._id);
      if (!sameId(property.owner, user._id)) throw new ApiError(403, 'You can only create facilities for your own property');
      body.owner = user._id;
    } else {
      body.owner = property.owner;
      if (user.role === 'manager') body.manager = user._id;
    }
    body.visibility ||= 'tenant'; body.status ||= 'active';
  }
  if (resource === 'facility-bookings') {
    body.requester = user.role === 'tenant' ? user._id : (body.requester || user._id);
    body.status = 'requested'; delete body.approvedBy; delete body.decisionNote; delete body.payment;
    await prepareFacilityBooking(user, body);
  }
  if (resource === 'site-settings' && user.role === 'admin') {
    if (await SiteSetting.exists({ key: body.key || 'default' })) throw new ApiError(409, 'Site settings already exist; update the existing record');
    body.key ||= 'default';
  }
  if (['admin', 'manager'].includes(user.role) && ['rental-invoices', 'utility-readings'].includes(resource)) {
    const tenancy = await Tenancy.findById(body.tenancy).lean();
    if (!tenancy) throw new ApiError(404, 'Tenancy not found');
    body.landlord = tenancy.landlord; body.tenant = tenancy.tenant; body.property = tenancy.property; body.space ||= tenancy.space;
    if (resource === 'rental-invoices') {
      body.invoiceNumber ||= makeNumber('RINV');
      body.charges ||= { baseRent: Number(tenancy.monthlyRent || 0) };
      const charges = body.charges || {};
      const other = (charges.other || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const subtotal = ['baseRent','electricity','water','maintenance','parking','internet','gas','cleaning','commonArea','securityDeposit','lateFee'].reduce((sum, key) => sum + Number(charges[key] || 0), 0) + other;
      body.totalAmount = Math.max(subtotal + Number(body.previousBalance || 0) - Number(body.discounts || 0), 0);
      body.paidAmount = Number(body.paidAmount || 0); body.balanceAmount = Math.max(body.totalAmount - body.paidAmount, 0);
      body.status = body.paidAmount >= body.totalAmount ? 'paid' : body.paidAmount > 0 ? 'partially_paid' : (body.status || 'pending');
    } else {
      body.unitsConsumed = Math.max(Number(body.currentReading || 0) - Number(body.previousReading || 0), 0);
      body.totalAmount = body.unitsConsumed * Number(body.ratePerUnit || 0) + Number(body.fixedCharge || 0) + Number(body.tax || 0) + Number(body.otherCharge || 0);
    }
  }
  await applySurveyorCreateDefaults(resource, user, body);
  body.createdBy ||= user._id; body.updatedBy = user._id;
}

export const listResources = asyncHandler(async (req, res) => {
  const config = configFor(req);
  const page = Math.max(Number(req.query.page || 1), 1); const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const filter = { ...await buildScope(req.user, req.params.resource) };
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  if (req.query.property && mongoose.isValidObjectId(req.query.property)) filter.property = req.query.property;
  if (req.query.role && req.params.resource === 'users') filter.role = req.query.role;
  if (req.query.from || req.query.to) filter.createdAt = { ...(req.query.from && { $gte: new Date(String(req.query.from)) }), ...(req.query.to && { $lte: new Date(String(req.query.to)) }) };
  if (req.query.search && config.search.length) {
    const pattern = new RegExp(regexEscape(String(req.query.search)), 'i');
    filter.$and = [...(filter.$and || []), { $or: config.search.map((field) => ({ [field]: pattern })) }];
  }
  const sort = String(req.query.sort || '-createdAt').split(',').join(' ');
  const [data, total] = await Promise.all([
    populate(config.model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit), config).lean(),
    config.model.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
});

export const getResource = asyncHandler(async (req, res) => {
  const config = configFor(req);
  const query = populate(config.model.findOne({ _id: req.params.id, ...await buildScope(req.user, req.params.resource) }), config);
  const data = await query.lean();
  if (!data) throw new ApiError(404, 'Record not found');
  res.json({ success: true, data });
});

export const createResource = asyncHandler(async (req, res) => {
  const config = configFor(req);
  if (!config.createRoles.includes(req.user.role)) throw new ApiError(403, 'You cannot create records in this module');
  const body = pick(req.body, config.writable); addGeneratedFields(req.params.resource, body); if (req.params.resource === 'properties') await applyPropertyTypeConfiguration(body); await roleDefaults(req.params.resource, req.user, body);
  if (req.user.role === 'manager' && body.property) {
    const allowedProperty = await Property.exists({ _id: body.property, $or: [{ manager: req.user._id }, { _id: { $in: req.user.assignedProperties || [] } }] });
    if (!allowedProperty) throw new ApiError(403, 'You cannot create records for an unassigned property');
  }
  const created = await config.model.create(body);
  if (req.params.resource === 'property-media' && created.document && created.visibility === 'public') {
    created.url = `/api/v1/public/property-media/${created._id}/content`;
    await created.save({ validateModifiedOnly: true });
  }
  if (req.params.resource === 'facility-bookings' && Number(created.amount || 0) + Number(created.deposit || 0) > 0) {
    const payable = Number(created.amount || 0) + Number(created.deposit || 0);
    const payment = await Payment.create({
      invoiceNumber: makeNumber('FAC'), payer: created.requester, payee: created.owner, property: created.property,
      facilityBooking: created._id, type: 'facility_booking', amount: payable, paidAmount: 0, status: 'pending',
      dueDate: created.startAt, notes: `Facility booking: ${created.purpose || created._id}`,
      gateway: { source: 'facility_booking' }, createdBy: req.user._id, updatedBy: req.user._id,
    });
    created.payment = payment._id; created.paymentStatus = 'pending';
    await created.save({ validateModifiedOnly: true });
  }
  if (req.params.resource === 'utility-readings' && created.approved) await syncApprovedUtilityToInvoice(created, req.user._id);
  if (req.params.resource === 'survey-quotations') await SurveyJob.findByIdAndUpdate(created.job, { $inc: { quotationCount: 1 } });
  if (req.params.resource === 'properties' && req.user.role === 'manager' && !req.user.assignedProperties.some((id) => id.equals(created._id))) {
    req.user.assignedProperties.push(created._id); await req.user.save({ validateModifiedOnly: true });
  }
  await writeAudit(req, { action: 'create', module: req.params.resource, recordId: created._id, updatedValue: created.toObject() });
  const data = await populate(config.model.findById(created._id), config).lean();
  broadcastResourceMutation(req.params.resource, 'created', data);
  res.status(201).json({ success: true, data });
});

export const updateResource = asyncHandler(async (req, res) => {
  const config = configFor(req);
  if (!config.updateRoles.includes(req.user.role)) throw new ApiError(403, 'You cannot update records in this module');
  const record = await config.model.findOne({ _id: req.params.id, ...await buildScope(req.user, req.params.resource) });
  if (!record) throw new ApiError(404, 'Record not found');
  await assertTenantMutation(req.params.resource, req.user, record, 'update');
  const previousValue = record.toObject(); let changes = pick(req.body, config.writable);
  if (req.params.resource === 'users' && req.user.role !== 'admin') delete changes.role;
  if (req.user.role === 'surveyor' && req.params.resource === 'surveys') changes = pick(changes, ['responses', 'gps', 'photos', 'signatureUrl', 'notes', 'offlineId', 'syncStatus']);
  if (['tenant', 'user'].includes(req.user.role) && req.params.resource === 'complaints') changes = pick(changes, ['title', 'description', 'category', 'priority', 'attachments']);
  if (['tenant', 'user'].includes(req.user.role) && req.params.resource === 'applications') {
    const isApplicant = sameId(record.applicant, req.user._id);
    if (isApplicant) changes = pick(changes, ['step', 'status', 'personal', 'employment', 'identity', 'documents', 'property', 'unit', 'targetSpace', 'occupantSummary', 'occupantIds', 'moveInDate', 'expectedStayMonths', 'monthlyIncome', 'rentalBudget', 'vehicles', 'pets', 'references', 'messageToLandlord']);
    else changes = pick(changes, ['status', 'remarks', 'interviewScore', 'landlordNotes', 'closedReason']);
    if (isApplicant && (changes.property !== undefined || changes.targetSpace !== undefined)) {
      if (!['draft', 'additional_documents_requested'].includes(record.status)) throw new ApiError(409, 'The property or room cannot be changed after the application enters review');
      const propertyId = changes.property || record.property;
      const spaceId = changes.targetSpace === null ? null : (changes.targetSpace || record.targetSpace);
      const { property } = await publicApplicationTarget(propertyId, spaceId);
      changes.landlord = property.owner;
    }
    if (isApplicant && changes.status === 'submitted') {
      const kyc = await TenantKyc.findOne({ user: req.user._id, status: 'verified', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }, { expiresAt: { $exists: false } }] });
      if (!kyc) throw new ApiError(403, 'Complete Tenant KYC verification before submitting an application');
      const propertyId = changes.property || record.property; const spaceId = changes.targetSpace || record.targetSpace;
      const property = await Property.findById(propertyId).lean();
      const space = spaceId ? await PropertySpace.findById(spaceId).lean() : null;
      const rules = space?.occupancyRules || property?.occupancyRules || {};
      const summary = changes.occupantSummary || record.occupantSummary || {};
      const exceeds = (rules.maxTotal && Number(summary.total || 0) > rules.maxTotal) || (rules.maxAdults && Number(summary.adults || 0) > rules.maxAdults) || (rules.maxChildren && Number(summary.children || 0) > rules.maxChildren);
      if (exceeds && !req.body.requestOccupancyException) throw new ApiError(422, 'Proposed occupants exceed the landlord occupancy limit');
      changes.submittedAt = new Date();
    }
  }
  if (req.user.role === 'tenant' && req.params.resource === 'tenants') changes = pick(changes, ['occupants', 'emergencyContact']);
  if (req.user.role === 'tenant' && req.params.resource === 'facility-bookings') {
    const ownsFacility = sameId(record.owner, req.user._id);
    if (ownsFacility) changes = pick(changes, ['startAt', 'endAt', 'status', 'decisionNote', 'notes', 'approvedBy']);
    else changes = pick(changes, ['startAt', 'endAt', 'guests', 'purpose', 'notes', 'status']);
    if (!ownsFacility && changes.status && !['requested', 'cancelled'].includes(changes.status)) throw new ApiError(403, 'Facility users may only request changes or cancel their own booking');
    if (ownsFacility && changes.status === 'approved' && Number(record.amount || 0) + Number(record.deposit || 0) > 0 && record.paymentStatus !== 'paid') throw new ApiError(409, 'Facility booking payment must be verified before approval');
    delete changes.paymentStatus; delete changes.amount; delete changes.deposit; delete changes.payment; delete changes.owner; delete changes.requester;
  }
  if (req.user.role === 'tenant' && req.params.resource === 'tenant-interviews') {
    const landlordSide = sameId(record.landlord, req.user._id);
    if (landlordSide) changes = pick(changes, ['scheduledAt', 'type', 'location', 'meetingUrl', 'questions', 'privateNotes', 'rating', 'status', 'decision', 'followUpAt']);
    else {
      changes = pick(changes, ['questions', 'status']);
      if (changes.status && changes.status !== 'cancelled') throw new ApiError(403, 'Applicants may only cancel an interview');
      if (Array.isArray(changes.questions)) changes.questions = (record.questions || []).map((question, index) => ({ ...question.toObject?.() || question, answer: String(changes.questions[index]?.answer || question.answer || '') }));
    }
  }
  if (req.user.role === 'tenant' && req.params.resource === 'property-visits') {
    const landlordSide = sameId(record.landlord, req.user._id);
    if (landlordSide) changes = pick(changes, ['proposedStart', 'confirmedStart', 'assignedTo', 'status', 'instructions', 'meetingPoint', 'attendance']);
    else {
      changes = pick(changes, ['preferredStart', 'visitorCount', 'contact', 'purpose', 'message', 'accessibilitySupport', 'feedback', 'interest', 'status']);
      if (changes.status && !['requested', 'cancelled'].includes(changes.status)) throw new ApiError(403, 'Visitors may only request or cancel a visit');
    }
  }
  if (req.user.role === 'tenant' && req.params.resource === 'tenancies') {
    const landlordSide = sameId(record.landlord, req.user._id);
    changes = landlordSide
      ? pick(changes, ['status', 'startDate', 'endDate', 'monthlyRent', 'securityDeposit', 'dueDay', 'occupants', 'moveInChecklist', 'moveOutChecklist', 'lease'])
      : pick(changes, ['moveInChecklist', 'moveOutChecklist']);
  }
  if (req.user.role === 'tenant' && req.params.resource === 'rental-invoices') {
    const landlordSide = sameId(record.landlord, req.user._id);
    changes = landlordSide
      ? pick(changes, ['billingMonth', 'dueDate', 'charges', 'discounts', 'previousBalance', 'totalAmount', 'status', 'lastReminderAt'])
      : {};
    if (changes.status === 'paid') throw new ApiError(403, 'Paid status must be confirmed by a verified payment record');
  }
  if (req.user.role === 'tenant' && req.params.resource === 'utility-readings') {
    const landlordSide = sameId(record.landlord, req.user._id);
    changes = landlordSide ? pick(changes, ['billingPeriod', 'previousReading', 'currentReading', 'ratePerUnit', 'fixedCharge', 'tax', 'otherCharge', 'allocationMethod', 'allocations', 'meterPhoto', 'billDocument', 'dueDate', 'approved']) : {};
  }
  if (req.user.role === 'tenant' && req.params.resource === 'properties') {
    changes = pick(changes, ['title', 'description', 'type', 'customType', 'customAttributes', 'hierarchyMode', 'status', 'price', 'listingType', 'purpose', 'isSale', 'visibility', 'bedrooms', 'bathrooms', 'area', 'roomCounts', 'roomDetails', 'listingDetails', 'pricing', 'areas', 'furnishing', 'ageDetails', 'address', 'location', 'map', 'locationPrivacy', 'occupancyRules', 'specifications', 'parking', 'utilities', 'amenityDetails', 'legalDetails', 'contactInformation', 'nearbyFacilities', 'images', 'amenities', 'documents', 'galleryCover', 'promotion']);
    const willBePublic = (changes.visibility ?? record.visibility) === 'public';
    if (willBePublic) await getActiveLandlordSubscription(req.user._id);
    changes.purpose = changes.purpose || changes.listingType || (changes.isSale ? 'sale' : record.purpose || record.listingType || 'rent');
    changes.listingType = changes.purpose; changes.isSale = changes.purpose === 'sale';
    if (changes.visibility === 'public' && record.visibility !== 'public') {
      await assertLandlordLimit(req.user._id, 'publicListings');
      changes.publicationStatus = 'published'; changes.publishedAt = new Date();
      if (!['available', 'partially_occupied', 'sold', 'leased'].includes(changes.status || record.status)) changes.status = 'available';
    }
    if (changes.visibility === 'private') changes.publicationStatus = 'draft';
  }
  if (req.user.role === 'tenant' && req.params.resource === 'property-spaces') {
    changes = pick(changes, ['parent', 'name', 'code', 'floorNumber', 'sortOrder', 'status', 'rentable', 'sellable', 'purpose', 'visibility', 'publicationStatus', 'price', 'securityDeposit', 'maintenanceCharge', 'area', 'roomDetails', 'furnishing', 'amenities', 'occupancyRules', 'availableFrom', 'coverImage', 'description', 'promotion']);
    const willBePublic = (changes.visibility ?? record.visibility) === 'public';
    if (willBePublic) await getActiveLandlordSubscription(req.user._id);
    if (changes.visibility === 'public' && record.visibility !== 'public') { await assertLandlordLimit(req.user._id, 'publicListings'); changes.publicationStatus = 'published'; }
    if (changes.visibility === 'private') changes.publicationStatus = 'draft';
  }
  if (req.user.role === 'tenant' && req.params.resource === 'property-media') changes = pick(changes, ['category', 'mediaType', 'url', 'document', 'driveFile', 'thumbnailUrl', 'caption', 'altText', 'sortOrder', 'cover', 'visibility', 'watermark', 'compressed']);
  if (req.user.role === 'tenant' && req.params.resource === 'tenant-profiles') changes = pick(changes, ['profileImage', 'profileVisibility', 'dateOfBirth', 'gender', 'currentAddress', 'permanentAddress', 'occupation', 'employerInstitution', 'monthlyIncome', 'emergencyContact', 'identityDocuments', 'addressProofs', 'employmentProofs', 'references', 'preferences', 'completedPercent']);
  if (req.user.role === 'tenant' && req.params.resource === 'tenant-kyc') {
    changes = pick(changes, ['governmentId', 'addressProof', 'profilePhoto', 'selfie', 'employmentProof', 'phoneVerified', 'emailVerified', 'emergencyContactVerified', 'employmentVerified', 'status']);
    if (!['incomplete', 'submitted'].includes(changes.status)) delete changes.status;
    if (changes.status === 'submitted') changes.submittedAt = new Date();
  }
  if (req.user.role === 'tenant' && req.params.resource === 'occupants') changes = pick(changes, ['application', 'tenancy', 'fullName', 'age', 'gender', 'relationship', 'occupation', 'identityDocument', 'phone']);
  if (req.user.role === 'tenant' && req.params.resource === 'tenant-interviews') {
    if (sameId(record.tenant, req.user._id) && !sameId(record.landlord, req.user._id)) changes = pick(changes, ['status', 'questions']);
    else changes = pick(changes, ['scheduledAt', 'type', 'location', 'meetingUrl', 'questions', 'privateNotes', 'rating', 'status', 'decision', 'followUpAt']);
  }
  if (req.user.role === 'tenant' && req.params.resource === 'property-visits') {
    if (sameId(record.requester, req.user._id) && !sameId(record.landlord, req.user._id)) changes = pick(changes, ['preferredStart', 'visitorCount', 'contact', 'purpose', 'message', 'accessibilitySupport', 'status', 'feedback', 'interest']);
    else changes = pick(changes, ['proposedStart', 'confirmedStart', 'status', 'instructions', 'meetingPoint', 'attendance', 'feedback', 'interest', 'assignedTo']);
  }
  if (req.user.role === 'tenant' && req.params.resource === 'tenancies') {
    if (sameId(record.tenant, req.user._id) && !sameId(record.landlord, req.user._id)) changes = pick(changes, ['moveInChecklist', 'moveOutChecklist']);
    else changes = pick(changes, ['lease', 'status', 'startDate', 'endDate', 'monthlyRent', 'securityDeposit', 'dueDay', 'occupants', 'moveInChecklist', 'moveOutChecklist']);
  }
  if (req.user.role === 'tenant' && req.params.resource === 'rental-invoices') {
    if (sameId(record.tenant, req.user._id) && !sameId(record.landlord, req.user._id)) {
      changes = pick(changes, ['status']);
      if (changes.status !== 'disputed') changes = {};
    } else changes = pick(changes, ['billingMonth', 'dueDate', 'charges', 'discounts', 'previousBalance', 'paidAmount', 'status', 'payments', 'receiptFile']);
    const charges = changes.charges || record.charges || {}; const other = (charges.other || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const subtotal = ['baseRent','electricity','water','maintenance','parking','internet','gas','cleaning','commonArea','securityDeposit','lateFee'].reduce((sum, key) => sum + Number(charges[key] || 0), 0) + other;
    const total = Math.max(subtotal + Number(changes.previousBalance ?? record.previousBalance ?? 0) - Number(changes.discounts ?? record.discounts ?? 0), 0);
    changes.totalAmount = total; changes.paidAmount = Number(changes.paidAmount ?? record.paidAmount ?? 0); changes.balanceAmount = Math.max(total - changes.paidAmount, 0);
    if (changes.paidAmount >= total) changes.status = 'paid'; else if (changes.paidAmount > 0) changes.status = 'partially_paid';
  }
  if (req.user.role === 'tenant' && req.params.resource === 'utility-readings') {
    if (sameId(record.tenant, req.user._id) && !sameId(record.landlord, req.user._id)) changes = {};
    else { changes = pick(changes, ['billingPeriod', 'previousReading', 'currentReading', 'ratePerUnit', 'fixedCharge', 'tax', 'otherCharge', 'allocationMethod', 'allocations', 'meterPhoto', 'billDocument', 'dueDate', 'approved']); changes.unitsConsumed = Math.max(Number(changes.currentReading ?? record.currentReading ?? 0) - Number(changes.previousReading ?? record.previousReading ?? 0), 0); changes.totalAmount = changes.unitsConsumed * Number(changes.ratePerUnit ?? record.ratePerUnit ?? 0) + Number(changes.fixedCharge ?? record.fixedCharge ?? 0) + Number(changes.tax ?? record.tax ?? 0) + Number(changes.otherCharge ?? record.otherCharge ?? 0); }
  }
  if (req.user.role === 'tenant' && req.params.resource === 'reminder-rules') changes = pick(changes, ['property', 'eventType', 'offsetsDays', 'repeatWeeklyUntilPaid', 'channels', 'template', 'active']);
  if (req.user.role === 'tenant' && req.params.resource === 'property-promotions') changes = pick(changes, ['startsAt', 'endsAt', 'status']);

  if (req.user.role === 'tenant' && req.params.resource === 'facilities') {
    changes = pick(changes, ['manager', 'name', 'type', 'description', 'capacity', 'visibility', 'status', 'bookingRequired', 'price', 'deposit', 'currency', 'slotMinutes', 'minimumNoticeHours', 'maximumAdvanceDays', 'availableDays', 'availableTimeSlots', 'amenities', 'rules', 'images']);
    validateFacilityScheduleDefinition(changes.availableDays ?? record.availableDays ?? [], changes.availableTimeSlots ?? record.availableTimeSlots ?? []);
  }
  if (req.user.role === 'tenant' && req.params.resource === 'facility-bookings') {
    const ownsBookingFacility = sameId(record.owner, req.user._id);
    if (ownsBookingFacility) {
      changes = pick(changes, ['startAt', 'endAt', 'status', 'decisionNote', 'approvedBy', 'notes']);
      if (changes.status === 'approved') {
        if (Number(record.amount || 0) + Number(record.deposit || 0) > 0 && record.paymentStatus !== 'paid') throw new ApiError(409, 'Facility booking payment must be verified before approval');
        changes.approvedBy = req.user._id;
      }
    } else {
      changes = pick(changes, ['startAt', 'endAt', 'guests', 'purpose', 'notes', 'status']);
      if (changes.status && changes.status !== 'cancelled') delete changes.status;
      if (record.status !== 'requested') changes = pick(changes, ['status']);
      if (changes.status === 'cancelled') changes.cancelledAt = new Date();
    }
    if (changes.startAt || changes.endAt || ['approved', 'rescheduled'].includes(changes.status)) await prepareFacilityBooking(req.user, changes, record);
  }


  if (req.user.role === 'tenant' && req.params.resource === 'surveyor-profiles') {
    changes = pick(changes, ['profileType', 'name', 'professionalTitle', 'profilePhoto', 'agencyLogo', 'description', 'yearsExperience', 'registrationNumber', 'licenceNumber', 'qualifications', 'certifications', 'specialisations', 'languages', 'serviceLocations', 'officeAddress', 'publicContact', 'workingHours', 'emergencyAvailable', 'portfolio', 'achievements', 'equipmentSummary', 'teamSize', 'availability', 'startingPrice', 'averageCompletionDays', 'terms', 'visibility', 'exactCoordinatesPublic']);
    if (changes.visibility === 'public') {
      await getActiveSurveyorSubscription(req.user._id);
      const verification = await SurveyorVerification.findOne({ user: req.user._id, status: 'verified' });
      if (!verification) throw new ApiError(403, 'Verification is required before publishing a public profile');
      changes.publicationStatus = 'published'; changes.verificationStatus = 'verified';
    }
    if (changes.visibility === 'private') changes.publicationStatus = 'draft';
  }
  if (req.user.role === 'tenant' && req.params.resource === 'survey-services') {
    changes = pick(changes, ['title', 'category', 'subtype', 'shortDescription', 'description', 'coverageAreas', 'startingPrice', 'pricingMethod', 'estimatedDuration', 'availableDays', 'timeSlots', 'requiredDocuments', 'deliverables', 'equipment', 'teamSizeRequired', 'travelCharges', 'emergencyAvailable', 'onlineConsultation', 'revisionPolicy', 'cancellationPolicy', 'terms', 'visibility', 'status']);
    if (changes.visibility === 'public' || ['pending_moderation', 'published'].includes(changes.status)) {
      await getActiveSurveyorSubscription(req.user._id);
      const profile = await SurveyorProfile.findOne({ user: req.user._id, verificationStatus: 'verified' });
      if (!profile) throw new ApiError(403, 'A verified Surveyor profile is required');
      if (record.visibility !== 'public') await assertSurveyorLimit(req.user._id, 'publicServices');
      changes.visibility = 'public'; changes.status = 'pending_moderation'; changes.moderation = { status: 'pending' };
    }
    if (changes.visibility === 'private') { changes.status = 'draft'; changes.moderation = { status: 'not_submitted' }; }
    if (changes.status === 'archived') changes.visibility = 'private';
  }
  if (req.user.role === 'tenant' && req.params.resource === 'survey-jobs') {
    changes = pick(changes, ['title', 'surveyType', 'propertyType', 'addressApproximate', 'location', 'exactLocation', 'plotNumber', 'landArea', 'measurementUnit', 'purpose', 'preferredVisitDate', 'preferredCompletionDate', 'budget', 'description', 'deliverables', 'documents', 'photographs', 'siteAccess', 'contact', 'urgency', 'visibility', 'invitedSurveyors', 'bookingType', 'requiredQualification', 'requiredEquipment', 'status', 'closesAt']);
    if (changes.visibility === 'invited' && !(changes.invitedSurveyors || record.invitedSurveyors || []).length) throw new ApiError(422, 'Invite at least one Surveyor');
    if (record.status === 'awarded' && changes.status && changes.status !== 'cancelled') delete changes.status;
  }
  if (req.user.role === 'tenant' && req.params.resource === 'survey-quotations') {
    changes = pick(changes, ['scope', 'methodology', 'deliverables', 'charges', 'totalAmount', 'advanceAmount', 'paymentSchedule', 'estimatedStartDate', 'estimatedCompletionDate', 'validUntil', 'exclusions', 'terms', 'attachments', 'digitalSignature', 'status']);
    if (['accepted', 'rejected', 'expired'].includes(record.status)) throw new ApiError(409, 'This quotation can no longer be edited');
    if (changes.status === 'submitted' || changes.status === 'revised') {
      await getActiveSurveyorSubscription(req.user._id);
      changes.submittedAt = new Date();
      if (changes.status === 'revised') {
        changes.revisionNumber = Number(record.revisionNumber || 0) + 1;
        changes.revisions = [...(record.revisions || []), { revision: changes.revisionNumber, snapshot: previousValue, reason: req.body.revisionReason, revisedAt: new Date() }];
      }
    }
  }
  if (req.user.role === 'tenant' && req.params.resource === 'survey-projects') {
    if (sameId(record.client, req.user._id) && !sameId(record.surveyor, req.user._id)) {
      changes = pick(changes, ['status', 'fieldNotes']);
      if (!['client_review', 'revision_requested', 'completed', 'disputed'].includes(changes.status)) delete changes.status;
    } else {
      changes = pick(changes, ['teamMembers', 'propertySite', 'startDate', 'dueDate', 'priority', 'status', 'tasks', 'milestones', 'documents', 'fieldNotes', 'media', 'paymentSummary']);
    }
  }
  if (req.user.role === 'tenant' && req.params.resource === 'site-visits') {
    if (sameId(record.client, req.user._id) && !sameId(record.surveyor, req.user._id)) {
      changes = pick(changes, ['requestedStart', 'instructions', 'accessContact', 'status', 'cancellationReason']);
      if (!['requested', 'rescheduled', 'cancelled'].includes(changes.status)) delete changes.status;
    } else changes = pick(changes, ['teamMembers', 'requestedStart', 'confirmedStart', 'estimatedEnd', 'status', 'route', 'instructions', 'accessContact', 'reminders', 'checkIn', 'checkOut', 'cancellationReason']);
  }
  if (req.user.role === 'tenant' && req.params.resource === 'field-data') {
    changes = pick(changes, ['visit', 'offlineId', 'syncStatus', 'observedAt', 'weather', 'teamMembers', 'equipmentUsed', 'gpsCoordinates', 'boundaryPoints', 'measurements', 'observations', 'calculations', 'media', 'voiceNotes', 'sketches', 'clientSignature', 'surveyorSignature', 'validation', 'revisions']);
  }
  if (req.user.role === 'tenant' && req.params.resource === 'survey-reports') {
    changes = pick(changes, ['type', 'templateName', 'title', 'sections', 'maps', 'drawings', 'images', 'attachments', 'digitalSignature', 'licenceDetails', 'issueDate', 'revisionNumber', 'status', 'exports', 'revisions']);
    if (changes.status === 'locked') delete changes.status;
  }
  if (req.user.role === 'tenant' && req.params.resource === 'survey-team') changes = pick(changes, ['memberUser', 'name', 'email', 'phone', 'role', 'permissions', 'status']);
  if (req.user.role === 'tenant' && req.params.resource === 'survey-clients') changes = pick(changes, ['linkedUser', 'name', 'type', 'email', 'phone', 'address', 'preferredContact', 'status', 'properties', 'notes', 'communicationHistory']);
  if (req.user.role === 'tenant' && req.params.resource === 'survey-reviews') {
    if (sameId(record.client, req.user._id)) changes = pick(changes, ['ratings', 'comment']);
    else changes = pick(changes, ['response']);
  }
  if (req.user.role === 'tenant' && req.params.resource === 'survey-disputes') changes = pick(changes, ['messages']);
  if (req.user.role === 'tenant' && req.params.resource === 'survey-promotions') changes = {};

  if (req.params.resource === 'properties') await applyPropertyTypeConfiguration(changes, record.toObject());
  if (req.params.resource === 'notifications' && !['admin', 'manager'].includes(req.user.role)) changes = pick(changes, ['readAt']);
  if (req.params.resource === 'messages' && !['admin', 'manager'].includes(req.user.role)) changes = pick(changes, ['body', 'attachments', 'readBy']);
  if (changes.status && statusPermissions[req.params.resource]) {
    const allowed = statusPermissions[req.params.resource]?.[req.user.role] || [];
    if (!allowed.includes(changes.status)) throw new ApiError(403, `Your role cannot set this status to ${changes.status}`);
  }
  if (req.params.resource === 'payments' && changes.status === 'paid' && ['landlord_subscription', 'surveyor_subscription', 'survey_advance', 'survey_milestone', 'survey_final', 'facility_booking'].includes(record.type) && req.user.role !== 'admin') {
    throw new ApiError(403, 'Only an administrator or verified payment webhook can confirm this payment');
  }
  if (changes.password && req.params.resource === 'users') record.password = changes.password;
  Object.entries({ ...changes, updatedBy: req.user._id }).forEach(([key, value]) => record.set(key, value));
  await record.save();
  if (req.params.resource === 'payments' && record.status === 'paid') await applyPaidPayment(record, { userId: req.user._id, role: req.user.role, ip: req.ip, device: req.get('user-agent') });
  if (req.params.resource === 'utility-readings' && record.approved) await syncApprovedUtilityToInvoice(record, req.user._id);
  await writeAudit(req, { action: 'update', module: req.params.resource, recordId: record._id, previousValue, updatedValue: record.toObject() });
  const data = await populate(config.model.findById(record._id), config).lean();
  broadcastResourceMutation(req.params.resource, 'updated', data);
  res.json({ success: true, data });
});

export const deleteResource = asyncHandler(async (req, res) => {
  const config = configFor(req);
  if (!config.deleteRoles.includes(req.user.role)) throw new ApiError(403, 'You cannot delete records in this module');
  const record = await config.model.findOne({ _id: req.params.id, ...await buildScope(req.user, req.params.resource) });
  if (!record) throw new ApiError(404, 'Record not found');
  await assertTenantMutation(req.params.resource, req.user, record, 'delete');
  if (req.params.resource === 'facilities' && await FacilityBooking.exists({ facility: record._id, startAt: { $gte: new Date() }, status: { $in: ['requested', 'approved', 'rescheduled', 'in_progress'] } })) throw new ApiError(409, 'Cancel or complete future facility bookings before deleting this facility');
  const previousValue = record.toObject();
  const supportsSoftDelete = Boolean(record.schema.path('deletedAt'));
  if (supportsSoftDelete) {
    record.set('deletedAt', new Date());
    if (record.schema.path('deletedBy')) record.set('deletedBy', req.user._id);
    if (record.schema.path('status') && !['deleted', 'archived'].includes(record.status)) {
      const allowed = record.schema.path('status')?.enumValues || [];
      if (allowed.includes('archived')) record.set('status', 'archived');
      else if (allowed.includes('inactive')) record.set('status', 'inactive');
    }
    await record.save({ validateModifiedOnly: true });
  } else await record.deleteOne();
  await writeAudit(req, { action: supportsSoftDelete ? 'soft-delete' : 'delete', module: req.params.resource, recordId: record._id, previousValue, updatedValue: supportsSoftDelete ? record.toObject() : undefined });
  broadcastResourceMutation(req.params.resource, 'deleted', previousValue);
  res.json({ success: true, message: supportsSoftDelete ? 'Record moved to archive' : 'Record deleted' });
});

const statusPermissions = {
  surveys: { admin: ['assigned', 'in_progress', 'submitted', 'returned', 'approved', 'rejected'], manager: ['assigned', 'returned', 'approved', 'rejected'], surveyor: ['in_progress', 'submitted'] },
  complaints: { admin: ['open', 'assigned', 'in_progress', 'awaiting_approval', 'resolved', 'closed', 'reopened'], manager: ['assigned', 'in_progress', 'awaiting_approval', 'resolved', 'closed'], tenant: ['open', 'closed', 'reopened'], user: ['open', 'closed', 'reopened'] },
  approvals: { admin: ['approved', 'rejected', 'returned', 'escalated', 'cancelled'], manager: ['approved', 'rejected', 'returned', 'escalated'] },
  applications: { admin: ['under_review', 'shortlisted', 'interview_requested', 'interview_scheduled', 'site_visit_scheduled', 'additional_documents_requested', 'approved', 'rejected', 'waiting_list', 'agreement_pending', 'deposit_pending', 'completed'], manager: ['under_review', 'shortlisted', 'interview_requested', 'interview_scheduled', 'site_visit_scheduled', 'additional_documents_requested', 'approved', 'rejected', 'waiting_list', 'agreement_pending', 'deposit_pending', 'completed'], tenant: ['draft', 'submitted', 'withdrawn', 'under_review', 'shortlisted', 'interview_requested', 'interview_scheduled', 'site_visit_scheduled', 'additional_documents_requested', 'approved', 'rejected', 'waiting_list', 'agreement_pending', 'deposit_pending', 'completed'], user: ['draft', 'submitted', 'withdrawn'] },
  payments: { admin: ['pending', 'paid', 'partial', 'overdue', 'failed', 'refunded', 'waived'], manager: ['pending', 'paid', 'partial', 'overdue', 'failed'] },
  leases: { admin: ['draft', 'pending_approval', 'active', 'expiring', 'expired', 'terminated', 'renewed'], manager: ['draft', 'pending_approval', 'active', 'expiring', 'terminated', 'renewed'] },
  'survey-services': { admin: ['draft', 'pending_moderation', 'published', 'paused', 'unpublished', 'archived'], tenant: ['draft', 'pending_moderation', 'paused', 'unpublished', 'archived'] },
  'survey-jobs': { admin: ['draft', 'open', 'quotation_review', 'awarded', 'in_progress', 'completed', 'cancelled', 'expired'], tenant: ['draft', 'open', 'quotation_review', 'completed', 'cancelled'] },
  'survey-quotations': { admin: ['draft', 'submitted', 'viewed', 'under_negotiation', 'revised', 'accepted', 'rejected', 'expired', 'withdrawn'], tenant: ['draft', 'submitted', 'revised', 'withdrawn'] },
  'survey-projects': { admin: ['new', 'awaiting_documents', 'awaiting_advance_payment', 'scheduled', 'site_visit_pending', 'site_visit_completed', 'fieldwork_in_progress', 'data_processing', 'draft_report_ready', 'client_review', 'revision_requested', 'final_report_ready', 'completed', 'on_hold', 'cancelled', 'disputed'], tenant: ['new', 'awaiting_documents', 'awaiting_advance_payment', 'scheduled', 'site_visit_pending', 'site_visit_completed', 'fieldwork_in_progress', 'data_processing', 'draft_report_ready', 'client_review', 'revision_requested', 'final_report_ready', 'completed', 'on_hold', 'cancelled', 'disputed'] },
  'site-visits': { admin: ['requested', 'confirmed', 'rescheduled', 'surveyor_travelling', 'surveyor_arrived', 'in_progress', 'completed', 'client_absent', 'cancelled'], tenant: ['requested', 'confirmed', 'rescheduled', 'surveyor_travelling', 'surveyor_arrived', 'in_progress', 'completed', 'client_absent', 'cancelled'] },
  'survey-equipment': { admin: ['available', 'assigned', 'maintenance', 'calibration_due', 'retired'], tenant: ['available', 'assigned', 'maintenance', 'calibration_due', 'retired'] },
  'survey-reports': { admin: ['draft', 'internal_review', 'client_preview', 'revision_requested', 'revised', 'final', 'locked', 'cancelled'], tenant: ['draft', 'internal_review', 'client_preview', 'revision_requested', 'revised', 'final', 'cancelled'] },
  'survey-team': { admin: ['invited', 'active', 'suspended', 'removed'], tenant: ['invited', 'active', 'suspended', 'removed'] },
  'survey-clients': { admin: ['lead', 'active', 'inactive', 'blocked'], tenant: ['lead', 'active', 'inactive', 'blocked'] },
  'survey-disputes': { admin: ['submitted', 'under_review', 'more_information_required', 'mediation', 'resolved', 'rejected', 'closed'], tenant: ['submitted'] },
  'survey-promotions': { admin: ['pending', 'active', 'paused', 'expired', 'cancelled'] },
  tenancies: { admin: ['reserved', 'deposit_pending', 'agreement_pending', 'active', 'notice', 'move_out', 'completed', 'cancelled'], manager: ['reserved', 'deposit_pending', 'agreement_pending', 'active', 'notice', 'move_out', 'completed', 'cancelled'], tenant: ['reserved', 'deposit_pending', 'agreement_pending', 'active', 'notice', 'move_out', 'completed', 'cancelled'] },
  'rental-invoices': { admin: ['upcoming', 'pending', 'partially_paid', 'paid', 'overdue', 'failed', 'refunded', 'waived', 'disputed'], manager: ['upcoming', 'pending', 'partially_paid', 'overdue', 'failed', 'waived'], tenant: ['upcoming', 'pending', 'partially_paid', 'overdue', 'failed', 'waived', 'disputed'] },
  facilities: { admin: ['active', 'maintenance', 'inactive', 'archived'], manager: ['active', 'maintenance', 'inactive', 'archived'], tenant: ['active', 'maintenance', 'inactive', 'archived'] },
  'facility-bookings': { admin: ['requested', 'approved', 'rescheduled', 'rejected', 'cancelled', 'in_progress', 'completed', 'no_show'], manager: ['requested', 'approved', 'rescheduled', 'rejected', 'cancelled', 'in_progress', 'completed', 'no_show'], tenant: ['requested', 'approved', 'rescheduled', 'rejected', 'cancelled', 'in_progress', 'completed', 'no_show'] },
};

export const changeStatus = asyncHandler(async (req, res) => {
  const config = configFor(req); const status = String(req.body.status || '');
  const allowed = statusPermissions[req.params.resource]?.[req.user.role] || [];
  if (!allowed.includes(status)) throw new ApiError(403, `Your role cannot set this status to ${status}`);
  const record = await config.model.findOne({ _id: req.params.id, ...await buildScope(req.user, req.params.resource) });
  if (!record) throw new ApiError(404, 'Record not found');
  await assertTenantMutation(req.params.resource, req.user, record, 'update');
  if (req.params.resource === 'payments' && status === 'paid' && ['landlord_subscription', 'surveyor_subscription', 'survey_advance', 'survey_milestone', 'survey_final', 'facility_booking'].includes(record.type) && req.user.role !== 'admin') {
    throw new ApiError(403, 'Only an administrator or verified payment webhook can confirm this payment');
  }
  if (req.params.resource === 'applications' && ['tenant', 'user'].includes(req.user.role)) {
    const applicantActions = ['draft', 'submitted', 'withdrawn'];
    const landlordActions = ['under_review', 'shortlisted', 'interview_requested', 'interview_scheduled', 'site_visit_scheduled', 'additional_documents_requested', 'approved', 'rejected', 'waiting_list', 'agreement_pending', 'deposit_pending', 'completed'];
    if (sameId(record.applicant, req.user._id) && !applicantActions.includes(status)) throw new ApiError(403, 'Applicants cannot set this application decision');
    if (!sameId(record.applicant, req.user._id) && !sameId(record.landlord, req.user._id)) throw new ApiError(403, 'Application decision access denied');
    if (sameId(record.landlord, req.user._id) && !landlordActions.includes(status)) throw new ApiError(403, 'Landlords cannot set this applicant status');
  }
  if (req.params.resource === 'facility-bookings' && status === 'approved' && Number(record.amount || 0) + Number(record.deposit || 0) > 0 && record.paymentStatus !== 'paid') {
    throw new ApiError(409, 'Facility booking payment must be verified before approval');
  }
  if (req.user.role === 'tenant' && req.params.resource === 'tenancies') {
    if (!sameId(record.landlord, req.user._id)) throw new ApiError(403, 'Only the landlord can change tenancy status');
  }
  if (req.user.role === 'tenant' && req.params.resource === 'rental-invoices') {
    const landlordSide = sameId(record.landlord, req.user._id);
    const tenantSide = sameId(record.tenant, req.user._id);
    if (tenantSide && !landlordSide && status !== 'disputed') throw new ApiError(403, 'Tenants may only dispute an invoice');
    if (landlordSide && !['upcoming', 'pending', 'partially_paid', 'overdue', 'failed', 'waived', 'refunded'].includes(status)) throw new ApiError(403, 'This invoice status requires verified payment processing');
  }
  if (req.user.role === 'tenant' && req.params.resource === 'facility-bookings') {
    const ownsFacility = sameId(record.owner, req.user._id);
    const isRequester = sameId(record.requester, req.user._id);
    if (!ownsFacility && (!isRequester || status !== 'cancelled')) throw new ApiError(403, 'Facility users may only cancel their own booking');
    if (ownsFacility && !['approved', 'rescheduled', 'rejected', 'cancelled', 'in_progress', 'completed', 'no_show'].includes(status)) throw new ApiError(403, 'Facility owners cannot set this booking status');
    if (status === 'approved') record.approvedBy = req.user._id;
    if (status === 'cancelled') record.cancelledAt = new Date();
  }
  if (req.user.role === 'tenant' && req.params.resource === 'survey-projects' && sameId(record.client, req.user._id) && !sameId(record.surveyor, req.user._id) && !['revision_requested', 'completed', 'disputed'].includes(status)) throw new ApiError(403, 'Clients can only request revisions, complete, or dispute a project');
  if (req.user.role === 'tenant' && req.params.resource === 'site-visits' && sameId(record.client, req.user._id) && !sameId(record.surveyor, req.user._id) && !['requested', 'rescheduled', 'cancelled'].includes(status)) throw new ApiError(403, 'Clients cannot set this site visit status');
  const previousValue = record.toObject(); record.status = status; record.updatedBy = req.user._id;
  if (req.params.resource === 'surveys') {
    if (status === 'in_progress') record.startedAt ||= new Date();
    if (status === 'submitted') record.submittedAt = new Date();
    if (status === 'approved') record.approvedAt = new Date();
    record.revisions.push({ version: record.revisions.length + 1, status, comment: req.body.comment, changedBy: req.user._id });
  }
  if (req.params.resource === 'complaints') record.timeline.push({ status, note: req.body.comment, user: req.user._id });
  if (req.params.resource === 'applications' && status === 'submitted') record.submittedAt = new Date();
  if (req.params.resource === 'payments' && status === 'paid') { record.paidAt = new Date(); record.paidAmount = record.amount; }
  if (req.params.resource === 'survey-services' && req.user.role === 'admin') {
    record.moderation = { status: status === 'published' ? 'approved' : status === 'unpublished' ? 'rejected' : record.moderation?.status, reviewedBy: req.user._id, reason: req.body.comment, reviewedAt: new Date() };
    if (status === 'published') record.visibility = 'public';
  }
  if (req.params.resource === 'survey-quotations' && status === 'submitted') record.submittedAt = new Date();
  if (req.params.resource === 'site-visits') {
    if (status === 'surveyor_arrived' && req.body.gps) record.checkIn = { at: new Date(), ...req.body.gps };
    if (status === 'completed' && req.body.gps) record.checkOut = { at: new Date(), ...req.body.gps };
  }
  if (req.params.resource === 'survey-reports' && status === 'revision_requested') record.revisions.push({ revision: Number(record.revisionNumber || 0) + 1, reason: req.body.comment, revisedBy: req.user._id, revisedAt: new Date() });
  await record.save();
  if (req.params.resource === 'payments' && status === 'paid') await applyPaidPayment(record, { userId: req.user._id, role: req.user.role, ip: req.ip, device: req.get('user-agent') });
  await writeAudit(req, { action: `status:${status}`, module: req.params.resource, recordId: record._id, previousValue, updatedValue: record.toObject() });
  const data = await populate(config.model.findById(record._id), config).lean();
  broadcastResourceMutation(req.params.resource, 'status-changed', data);
  res.json({ success: true, data });
});
