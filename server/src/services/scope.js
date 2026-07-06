import mongoose from 'mongoose';
import { Property, Tenant, Application, Tenancy, Survey } from '../models/index.js';

function objectIds(values = []) {
  return values
    .map((value) => value?._id || value)
    .filter((value) => mongoose.isValidObjectId(value))
    .map((value) => new mongoose.Types.ObjectId(value));
}

export function assignedPropertyIds(user) {
  return objectIds(user?.assignedProperties || []);
}

async function managerContext(user) {
  const uid = user._id;
  const assigned = assignedPropertyIds(user);
  const managedPropertyIds = await Property.distinct('_id', {
    deletedAt: null,
    $or: [{ manager: uid }, { _id: { $in: assigned } }],
  });
  if (!managedPropertyIds.length) return { propertyIds: [], tenantIds: [], surveyorIds: [] };

  const [tenantRecords, applicationTenantIds, tenancyTenantIds, surveyorIds] = await Promise.all([
    Tenant.distinct('user', { property: { $in: managedPropertyIds } }),
    Application.distinct('applicant', { property: { $in: managedPropertyIds } }),
    Tenancy.distinct('tenant', { property: { $in: managedPropertyIds } }),
    Survey.distinct('surveyor', { property: { $in: managedPropertyIds } }),
  ]);
  const tenantIds = [...new Map([...tenantRecords, ...applicationTenantIds, ...tenancyTenantIds].filter(Boolean).map((id) => [String(id), id])).values()];
  return { propertyIds: managedPropertyIds, tenantIds, surveyorIds: surveyorIds.filter(Boolean) };
}

export async function buildScope(user, resource) {
  if (!user || user.role === 'admin') return {};
  const uid = user._id;

  if (user.role === 'manager') {
    const { propertyIds, tenantIds, surveyorIds } = await managerContext(user);
    const propertyScope = { $in: propertyIds };
    if (resource === 'properties') return { _id: propertyScope };
    if (['units', 'tenants', 'leases', 'surveys', 'applications', 'payments', 'complaints', 'property-spaces', 'property-media', 'tenant-interviews', 'property-visits', 'tenancies', 'rental-invoices', 'utility-readings', 'property-promotions', 'facilities', 'facility-bookings'].includes(resource)) {
      return { property: propertyScope };
    }
    if (resource === 'users') return { _id: { $in: [...tenantIds, ...surveyorIds, uid] } };
    if (resource === 'tenant-profiles' || resource === 'tenant-kyc') return { user: { $in: tenantIds } };
    if (resource === 'occupants') return { tenant: { $in: tenantIds } };
    if (resource === 'reminder-rules') return { $or: [{ property: propertyScope }, { owner: uid }] };
    if (resource === 'site-enquiries') return { $or: [{ property: propertyScope }, { assignedTo: uid }] };
    if (resource === 'approvals') return { $or: [{ property: propertyScope }, { requester: uid }] };
    if (resource === 'documents') return { $or: [{ property: propertyScope }, { owner: uid }] };
    if (resource === 'messages') return { $or: [{ sender: uid }, { recipients: uid }] };
    if (resource === 'notifications' || resource === 'notification-preferences') return { user: uid };
    if (resource === 'attendance') return { user: { $in: surveyorIds } };
    if (resource === 'audit-logs') return { user: uid };
    return { _id: null };
  }

  if (user.role === 'tenant') {
    const tenantPropertyIds = await Tenancy.distinct('property', { tenant: uid, status: { $in: ['reserved', 'deposit_pending', 'agreement_pending', 'active', 'notice', 'move_out'] } });
    const scopes = {
      properties: { owner: uid }, subscriptions: { user: uid }, tenants: { user: uid }, leases: { tenant: uid }, payments: { $or: [{ payer: uid }, { payee: uid }] }, complaints: { raisedBy: uid },
      documents: { owner: uid }, notifications: { user: uid }, 'notification-preferences': { user: uid }, messages: { $or: [{ sender: uid }, { recipients: uid }] },
      approvals: { requester: uid }, applications: { $or: [{ applicant: uid }, { landlord: uid }] },
      'surveyor-subscriptions': { user: uid }, 'surveyor-verifications': { user: uid }, 'surveyor-profiles': { user: uid },
      'survey-services': { surveyor: uid },
      'survey-jobs': { $or: [{ client: uid }, { hiredSurveyor: uid }, { invitedSurveyors: uid }, { shortlistedSurveyors: uid }] },
      'survey-quotations': { $or: [{ surveyor: uid }, { client: uid }] },
      'survey-projects': { $or: [{ surveyor: uid }, { client: uid }] },
      'site-visits': { $or: [{ surveyor: uid }, { client: uid }] },
      'field-data': { surveyor: uid }, 'survey-equipment': { surveyor: uid },
      'survey-reports': { $or: [{ surveyor: uid }, { client: uid }] },
      'survey-team': { owner: uid }, 'survey-clients': { surveyor: uid },
      'survey-reviews': { $or: [{ surveyor: uid }, { client: uid }] },
      'survey-disputes': { $or: [{ raisedBy: uid }, { against: uid }] }, 'survey-promotions': { surveyor: uid },
      'property-spaces': { owner: uid }, 'property-media': { owner: uid },
      'tenant-profiles': { user: uid }, 'tenant-kyc': { user: uid }, 'occupants': { tenant: uid },
      'tenant-interviews': { $or: [{ landlord: uid }, { tenant: uid }] },
      'property-visits': { $or: [{ landlord: uid }, { requester: uid }] },
      tenancies: { $or: [{ landlord: uid }, { tenant: uid }] },
      'rental-invoices': { $or: [{ landlord: uid }, { tenant: uid }] },
      'utility-readings': { $or: [{ landlord: uid }, { tenant: uid }] },
      'reminder-rules': { owner: uid }, 'property-promotions': { owner: uid },
      facilities: { $or: [{ owner: uid }, { property: { $in: tenantPropertyIds }, visibility: { $in: ['tenant', 'public'] }, status: 'active' }, { visibility: 'public', status: 'active' }] },
      'facility-bookings': { $or: [{ requester: uid }, { owner: uid }] },
    };
    return scopes[resource] || { _id: null };
  }

  if (user.role === 'user') {
    const scopes = {
      applications: { applicant: uid }, payments: { $or: [{ payer: uid }, { payee: uid }] }, complaints: { raisedBy: uid }, documents: { owner: uid },
      notifications: { user: uid }, 'notification-preferences': { user: uid }, messages: { $or: [{ sender: uid }, { recipients: uid }] }, approvals: { requester: uid },
    };
    return scopes[resource] || { _id: null };
  }

  if (user.role === 'surveyor') {
    const scopes = {
      surveys: { surveyor: uid }, attendance: { user: uid }, documents: { owner: uid }, notifications: { user: uid }, 'notification-preferences': { user: uid },
      messages: { $or: [{ sender: uid }, { recipients: uid }] }, approvals: { requester: uid },
    };
    return scopes[resource] || { _id: null };
  }

  return { _id: null };
}
