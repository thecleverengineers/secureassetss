import { LandlordPlan, Subscription, Property, PropertySpace, Tenancy, User } from '../models/index.js';
import { ApiError } from '../utils/apiError.js';

export const DEFAULT_LANDLORD_PLANS = [
  { key: 'starter', name: 'Starter', description: 'For a single building or a small rental portfolio.', rank: 1, active: true, prices: { monthly: 299, yearly: 2990, currency: 'INR' }, limits: { properties: 2, buildings: 1, apartments: 5, rooms: 20, beds: 20, publicListings: 3, activeTenants: 20, storageMB: 5120, teamMembers: 1 }, features: { rentAutomation: false, advancedReports: false, propertyPromotions: false, tenantInterviews: true, utilityBilling: true, multipleBranches: false, customRoles: false, apiAccess: false, prioritySupport: false }, graceDays: 7 },
  { key: 'professional', name: 'Professional', description: 'For growing landlords who need automation and analytics.', rank: 2, active: true, featured: true, prices: { monthly: 699, yearly: 6990, currency: 'INR' }, limits: { properties: 10, buildings: 5, apartments: 25, rooms: 100, beds: 150, publicListings: 25, activeTenants: 120, storageMB: 51200, teamMembers: 5 }, features: { rentAutomation: true, advancedReports: true, propertyPromotions: true, tenantInterviews: true, utilityBilling: true, multipleBranches: false, customRoles: false, apiAccess: false, prioritySupport: true }, graceDays: 10 },
  { key: 'business', name: 'Business', description: 'For multi-property operators and property management teams.', rank: 3, active: true, prices: { monthly: 1499, yearly: 14990, currency: 'INR' }, limits: { properties: 50, buildings: 20, apartments: 100, rooms: 500, beds: 750, publicListings: 100, activeTenants: 600, storageMB: 204800, teamMembers: 25 }, features: { rentAutomation: true, advancedReports: true, propertyPromotions: true, tenantInterviews: true, utilityBilling: true, multipleBranches: true, customRoles: true, apiAccess: true, prioritySupport: true }, graceDays: 14 },
  { key: 'enterprise', name: 'Enterprise', description: 'Custom limits, branches, roles, integrations and dedicated support.', rank: 4, active: true, prices: { monthly: 0, yearly: 0, currency: 'INR' }, limits: { properties: 1000000, buildings: 1000000, apartments: 1000000, rooms: 1000000, beds: 1000000, publicListings: 1000000, activeTenants: 1000000, storageMB: 1048576, teamMembers: 1000000 }, features: { rentAutomation: true, advancedReports: true, propertyPromotions: true, tenantInterviews: true, utilityBilling: true, multipleBranches: true, customRoles: true, apiAccess: true, prioritySupport: true }, graceDays: 30 },
];

export async function ensureLandlordPlans() {
  const count = await LandlordPlan.countDocuments();
  if (!count) await LandlordPlan.insertMany(DEFAULT_LANDLORD_PLANS);
  return LandlordPlan.find({ active: true }).sort({ rank: 1 }).lean();
}

export async function getActiveLandlordSubscription(userId, { required = true } = {}) {
  const now = new Date();
  const subscription = await Subscription.findOne({ user: userId, status: 'active', expiresAt: { $gt: now } }).sort('-expiresAt').lean();
  if (!subscription && required) throw new ApiError(403, 'Your Landlord subscription is inactive or expired');
  return subscription;
}

export async function landlordUsage(userId) {
  const [properties, buildings, apartments, rooms, beds, publicProperties, publicSpaces, activeTenants] = await Promise.all([
    Property.countDocuments({ owner: userId, deletedAt: null }),
    PropertySpace.countDocuments({ owner: userId, level: 'building', deletedAt: null }),
    PropertySpace.countDocuments({ owner: userId, level: 'apartment', deletedAt: null }),
    PropertySpace.countDocuments({ owner: userId, level: 'room', deletedAt: null }),
    PropertySpace.countDocuments({ owner: userId, level: 'bed', deletedAt: null }),
    Property.countDocuments({ owner: userId, visibility: 'public', publicationStatus: 'published', deletedAt: null }),
    PropertySpace.countDocuments({ owner: userId, visibility: 'public', publicationStatus: 'published', deletedAt: null }),
    Tenancy.countDocuments({ landlord: userId, status: { $in: ['reserved', 'deposit_pending', 'agreement_pending', 'active', 'notice', 'move_out'] } }),
  ]);
  return { properties, buildings, apartments, rooms, beds, publicListings: publicProperties + publicSpaces, activeTenants };
}

export async function usageWithLimits(userId) {
  const subscription = await getActiveLandlordSubscription(userId, { required: false });
  const usage = await landlordUsage(userId);
  const limits = subscription?.limits || { properties: 0, buildings: 0, apartments: 0, rooms: 0, beds: 0, publicListings: 0, activeTenants: 0, storageMB: 1024, teamMembers: 0 };
  const remaining = Object.fromEntries(Object.entries(usage).map(([key, value]) => [key, Math.max(Number(limits[key] ?? 0) - Number(value), 0)]));
  return { subscription, usage, limits, remaining };
}

export async function assertLandlordLimit(userId, key, increment = 1) {
  const subscription = await getActiveLandlordSubscription(userId);
  const usage = await landlordUsage(userId);
  const limit = Number(subscription.limits?.[key] ?? 0);
  if (Number(usage[key] || 0) + increment > limit) throw new ApiError(403, `Your current Landlord plan allows ${limit} ${key}. Upgrade the plan to continue.`);
  return subscription;
}

export async function syncLandlordLifecycle(userId) {
  const now = new Date();
  const active = await Subscription.findOne({ user: userId, status: 'active', expiresAt: { $gt: now } }).sort('-expiresAt');
  if (active) {
    await User.findByIdAndUpdate(userId, { landlordEnabled: true, landlordSubscriptionExpiresAt: active.expiresAt });
    return active;
  }
  await Subscription.updateMany({ user: userId, status: 'active', expiresAt: { $lte: now } }, { status: 'expired' });
  await User.findByIdAndUpdate(userId, { landlordEnabled: false });
  await Property.updateMany({ owner: userId, requiresActiveSubscription: true, visibility: 'public' }, { visibility: 'private', publicationStatus: 'draft' });
  await PropertySpace.updateMany({ owner: userId, visibility: 'public' }, { visibility: 'private', publicationStatus: 'draft' });
  return null;
}
