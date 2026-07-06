import { Property, Unit, Tenant, Lease, Survey, Application, Payment, Complaint, Approval, User, AuditLog, Tenancy } from '../models/index.js';
import { assignedPropertyIds } from '../services/scope.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const overview = asyncHandler(async (req, res) => {
  const user = req.user;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const leaseExpiry = new Date(now.getTime() + 60 * 86400000);
  let propertyIds = [];
  const landlordView = user.role === 'tenant' && user.landlordEnabled && user.activeMode === 'landlord';
  const surveyorView = user.role === 'surveyor' || (user.role === 'tenant' && user.surveyorEnabled && user.activeMode === 'surveyor');
  if (user.role === 'manager') {
    propertyIds = await Property.distinct('_id', { deletedAt: null, $or: [{ manager: user._id }, { _id: { $in: assignedPropertyIds(user) } }] });
  } else if (landlordView) {
    propertyIds = await Property.distinct('_id', { owner: user._id, deletedAt: null });
  } else if (user.role === 'tenant') {
    const [tenancyIds, legacyIds] = await Promise.all([
      Tenancy.distinct('property', { tenant: user._id, status: { $in: ['reserved', 'deposit_pending', 'agreement_pending', 'active', 'notice', 'move_out'] } }),
      Tenant.distinct('property', { user: user._id, status: { $in: ['active', 'notice'] } }),
    ]);
    propertyIds = [...new Map([...tenancyIds, ...legacyIds].filter(Boolean).map((id) => [String(id), id])).values()];
  }

  const scopedProperty = { $in: propertyIds };
  const propertyFilter = user.role === 'admin' ? {} : { _id: scopedProperty };
  const unitFilter = user.role === 'admin' ? {} : { property: scopedProperty };
  const tenantFilter = user.role === 'admin' ? {} : landlordView || user.role === 'manager' ? { property: scopedProperty } : user.role === 'tenant' ? { user: user._id } : { _id: null };
  const leaseFilter = user.role === 'admin' ? {} : landlordView || user.role === 'manager' ? { property: scopedProperty } : user.role === 'tenant' ? { tenant: user._id } : { _id: null };
  const surveyFilter = user.role === 'admin' ? {} : surveyorView ? { surveyor: user._id } : landlordView || user.role === 'manager' ? { property: scopedProperty } : { _id: null };
  const applicationFilter = user.role === 'admin' ? {} : landlordView ? { landlord: user._id } : user.role === 'manager' ? { property: scopedProperty } : ['tenant', 'user'].includes(user.role) ? { applicant: user._id } : { _id: null };
  const paymentFilter = user.role === 'admin' ? {} : landlordView ? { payee: user._id } : user.role === 'manager' ? { property: scopedProperty } : ['tenant', 'user'].includes(user.role) ? { payer: user._id } : { _id: null };
  const complaintFilter = user.role === 'admin' ? {} : landlordView || user.role === 'manager' ? { property: scopedProperty } : ['tenant', 'user'].includes(user.role) ? { raisedBy: user._id } : { _id: null };
  const approvalFilter = user.role === 'admin' ? {} : landlordView || user.role === 'manager' ? { $or: [{ property: scopedProperty }, { requester: user._id }] } : { requester: user._id };

  const [
    totalProperties, totalUnits, occupiedUnits, totalTenants, activeUsers,
    pendingApplications, pendingSurveys, monthlyRevenueResult, outstandingResult,
    openComplaints, expiringLeases, pendingApprovals,
    surveyGroups, complaintGroups, recentActivities,
  ] = await Promise.all([
    Property.countDocuments(propertyFilter),
    Unit.countDocuments(unitFilter),
    Unit.countDocuments({ ...unitFilter, status: 'occupied' }),
    Tenant.countDocuments({ ...tenantFilter, status: 'active' }),
    user.role === 'admin' ? User.countDocuments({ status: 'active' }) : Promise.resolve(0),
    Application.countDocuments({ ...applicationFilter, status: { $in: ['submitted', 'under_review', 'documents_pending'] } }),
    Survey.countDocuments({ ...surveyFilter, status: { $in: ['assigned', 'in_progress', 'submitted', 'returned', 'overdue'] } }),
    Payment.aggregate([{ $match: { ...paymentFilter, status: 'paid', paidAt: { $gte: monthStart, $lt: monthEnd } } }, { $group: { _id: null, total: { $sum: '$paidAmount' } } }]),
    Payment.aggregate([{ $match: { ...paymentFilter, status: { $in: ['pending', 'partial', 'overdue'] } } }, { $group: { _id: null, total: { $sum: { $subtract: ['$amount', '$paidAmount'] } } } }]),
    Complaint.countDocuments({ ...complaintFilter, status: { $nin: ['closed', 'resolved'] } }),
    Lease.countDocuments({ ...leaseFilter, status: { $in: ['active', 'expiring'] }, endDate: { $gte: now, $lte: leaseExpiry } }),
    Approval.countDocuments({ ...approvalFilter, status: 'pending' }),
    Survey.aggregate([{ $match: surveyFilter }, { $group: { _id: '$status', value: { $sum: 1 } } }, { $sort: { value: -1 } }]),
    Complaint.aggregate([{ $match: complaintFilter }, { $group: { _id: '$status', value: { $sum: 1 } } }, { $sort: { value: -1 } }]),
    AuditLog.find(user.role === 'admin' ? {} : { user: user._id }).sort('-createdAt').limit(8).populate('user', 'name role').lean(),
  ]);

  const revenueTrend = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    const result = await Payment.aggregate([{ $match: { ...paymentFilter, status: 'paid', paidAt: { $gte: start, $lt: end } } }, { $group: { _id: null, amount: { $sum: '$paidAmount' } } }]);
    revenueTrend.push({ month: start.toLocaleString('en', { month: 'short' }), amount: result[0]?.amount || 0 });
  }

  const roleSpecific = {};
  if (surveyorView) {
    roleSpecific.todayAssignments = await Survey.countDocuments({ surveyor: user._id, deadline: { $gte: new Date(now.toDateString()), $lt: new Date(new Date(now.toDateString()).getTime() + 86400000) } });
    roleSpecific.completedSurveys = await Survey.countDocuments({ surveyor: user._id, status: 'approved' });
  }
  if (user.role === 'tenant') {
    roleSpecific.nextPayment = await Payment.findOne({ [landlordView ? 'payee' : 'payer']: user._id, status: { $in: ['pending', 'partial', 'overdue'] } }).sort('dueDate').lean();
    if (!landlordView) roleSpecific.activeLease = await Lease.findOne({ tenant: user._id, status: { $in: ['active', 'expiring'] } }).populate('property unit').lean();
    roleSpecific.dashboardMode = landlordView ? 'landlord' : user.activeMode || 'regular';
  }
  if (user.role === 'user') {
    roleSpecific.latestApplication = await Application.findOne({ applicant: user._id }).sort('-createdAt').populate('property').lean();
  }

  res.json({
    success: true,
    data: {
      kpis: { totalProperties, totalUnits, occupiedUnits, vacantUnits: Math.max(totalUnits - occupiedUnits, 0), totalTenants, activeUsers, pendingApplications, pendingSurveys, monthlyRentCollection: monthlyRevenueResult[0]?.total || 0, outstandingDues: outstandingResult[0]?.total || 0, openComplaints, expiringLeases, pendingApprovals },
      occupancyRate: totalUnits ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
      revenueTrend,
      surveyStatus: surveyGroups.map((item) => ({ name: item._id, value: item.value })),
      complaintStatus: complaintGroups.map((item) => ({ name: item._id, value: item.value })),
      recentActivities,
      ...roleSpecific,
    },
  });
});
