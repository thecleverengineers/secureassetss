import {
  SiteSetting, SeoPage, HomeCarousel, HomeSection, LandlordPlan, PropertyTypeConfig, AreaUnit, SiteEnquiry,
  Property, PropertySpace, PropertyMedia, Subscription, SurveyorSubscription, SurveyorProfile,
} from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ensureLandlordPlans } from '../services/landlordSubscription.js';
import { serializePublicProperty, serializePublicSpace, serializePublicMedia } from '../services/publicPropertySerialization.js';
import { ensurePlatformConfiguration, getApplicationNavigation, getContentPage, getPublicNavigation } from '../services/platformConfiguration.js';
import { emitRealtime } from '../services/realtime.js';

const AUTHENTICATION_DEFAULTS = {
  badge: 'Enterprise property operations', headline: 'Every property workflow. One secure platform.',
  description: 'Manage properties, tenants, payments, surveys, legal records and communication with secure role-based access.',
  features: ['Role-based access', 'Encrypted document vault', 'Real-time messaging', 'Automated billing', 'Audit trails'],
  footerText: 'Enterprise property, tenancy and survey operations', loginTitle: 'Welcome back', loginSubtitle: 'Sign in with your organisation account.',
  registerTitle: 'Create your account', registerSubtitle: 'Create your account and verify your registered mobile number with a secure OTP.',
  otpTitle: 'Passwordless login', otpSubtitle: 'Use a secure one-time password sent to your registered mobile.',
  forgotTitle: 'Reset password', forgotSubtitle: 'Enter your registered email or mobile number. The reset OTP is sent to your registered mobile.',
  allowRegistration: true, allowPasswordLogin: true, allowOtpLogin: true, showDemoAccounts: false,
};

async function ensureSiteSetting() {
  let setting = await SiteSetting.findOne({ key: 'default' }).lean();
  if (!setting) {
    setting = (await SiteSetting.create({
      key: 'default', siteTitle: 'SecureAsset', shortTitle: 'SecureAsset',
      tagline: 'Property, tenancy and survey management in one secure platform.',
      description: 'Manage properties, tenants, surveys, legal records and payments from one secure platform.',
      contact: { email: 'hello@secureasset.in', phone: '', address: 'India' },
      seo: { defaultTitle: 'SecureAsset — Property, Tenant and Survey Management', defaultDescription: 'Discover properties and manage the complete rental, tenancy and survey lifecycle.', titleTemplate: '%s | SecureAsset', robots: 'index,follow' },
    })).toObject();
  }
  return { ...setting, authentication: { ...AUTHENTICATION_DEFAULTS, ...(setting.authentication || {}) } };
}

async function featuredMarketplaceData(sections) {
  const wantsProperties = sections.some((item) => item.type === 'featured_properties');
  const wantsSurveyors = sections.some((item) => item.type === 'featured_surveyors');
  const [featuredProperties, featuredSurveyors] = await Promise.all([
    wantsProperties ? (async () => {
      const activeOwners = await Subscription.distinct('user', { status: 'active', expiresAt: { $gt: new Date() } });
      const records = await Property.find({
        visibility: 'public', publicationStatus: 'published', status: { $in: ['available', 'partially_occupied'] }, deletedAt: null,
        $and: [
          { $or: [{ requiresActiveSubscription: false }, { owner: { $in: activeOwners } }] },
          { $or: [{ isFeatured: true }, { 'promotion.featured': true }, { 'promotion.topListing': true }] },
        ],
      }).sort({ 'promotion.topListing': -1, 'promotion.featured': -1, publishedAt: -1 }).limit(12).populate('owner', 'name avatar kycStatus').lean();
      return records.map(serializePublicProperty);
    })() : [],
    wantsSurveyors ? (async () => {
      const activeSurveyors = await SurveyorSubscription.distinct('user', {
        $or: [
          { status: { $in: ['trial', 'active', 'expiring_soon'] }, expiresAt: { $gt: new Date() } },
          { status: 'grace_period', graceEndsAt: { $gt: new Date() } },
        ],
      });
      return SurveyorProfile.find({ user: { $in: activeSurveyors }, visibility: 'public', publicationStatus: 'published', verificationStatus: 'verified' })
        .select('-privateShare -createdBy -updatedBy').sort({ isFeatured: -1, 'rating.average': -1, completedProjects: -1 }).limit(12).lean();
    })() : [],
  ]);
  return { featuredProperties, featuredSurveyors };
}

export const getPublicSite = asyncHandler(async (req, res) => {
  await Promise.all([ensureLandlordPlans(), ensurePlatformConfiguration()]);
  const now = new Date();
  const path = String(req.query.path || '/').split('?')[0] || '/';
  const [settings, seo, carousel, sections, landlordPlans, propertyTypes, areaUnits, publicNavigation, page] = await Promise.all([
    ensureSiteSetting(),
    SeoPage.findOne({ path, active: true }).lean(),
    HomeCarousel.find({ active: true, $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: now } }, { startsAt: { $exists: false } }] }, { $or: [{ endsAt: null }, { endsAt: { $gt: now } }, { endsAt: { $exists: false } }] }] }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    HomeSection.find({ active: true }).sort({ sortOrder: 1 }).lean(),
    LandlordPlan.find({ active: true }).sort({ rank: 1 }).lean(),
    PropertyTypeConfig.find({ active: true }).sort({ sortOrder: 1, label: 1 }).lean(),
    AreaUnit.find({ active: true }).sort({ sortOrder: 1, label: 1 }).lean(),
    getPublicNavigation(),
    getContentPage(path, false),
  ]);
  const featured = await featuredMarketplaceData(sections);
  const safeSettings = { ...settings };
  if (safeSettings.map) delete safeSettings.map.privateApiKey;
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  res.json({ success: true, data: { settings: safeSettings, seo, page, carousel, sections, landlordPlans, propertyTypes, areaUnits, publicNavigation, ...featured } });
});

export const getAppConfiguration = asyncHandler(async (req, res) => {
  const [modules, settings] = await Promise.all([getApplicationNavigation(req.user), ensureSiteSetting()]);
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: { modules, mode: req.user.activeMode || 'regular', role: req.user.role, siteTitle: settings.siteTitle, shortTitle: settings.shortTitle } });
});

export const submitSiteEnquiry = asyncHandler(async (req, res) => {
  const body = {
    name: String(req.body.name || '').trim(), email: String(req.body.email || '').trim().toLowerCase(), phone: String(req.body.phone || '').trim(),
    message: String(req.body.message || '').trim(), property: req.body.property || undefined, space: req.body.space || undefined,
    type: req.body.property ? 'property' : (req.body.type || 'contact'), status: 'new',
  };
  if (!body.name || (!body.email && !body.phone) || !body.message) throw new ApiError(422, 'Name, message and email or phone are required');
  const data = await SiteEnquiry.create(body);
  emitRealtime('site-enquiries', 'created', data, { roles: ['admin', 'manager'] });
  res.status(201).json({ success: true, data: { _id: data._id }, message: 'Your enquiry has been submitted' });
});

export const getPublicPropertyStructure = asyncHandler(async (req, res) => {
  const activeOwnerIds = await Subscription.distinct('user', { status: 'active', expiresAt: { $gt: new Date() } });
  const eligibility = {
    visibility: 'public', publicationStatus: 'published', status: { $in: ['available', 'partially_occupied'] }, deletedAt: null,
    $or: [{ requiresActiveSubscription: false }, { owner: { $in: activeOwnerIds } }],
  };

  let selectedSpaceRecord = null;
  let property = await Property.findOne({ _id: req.params.id, ...eligibility }).populate('owner', 'name avatar kycStatus').lean();
  if (!property) {
    selectedSpaceRecord = await PropertySpace.findOne({ _id: req.params.id, visibility: 'public', publicationStatus: 'published', status: 'available', deletedAt: null }).lean();
    if (selectedSpaceRecord) property = await Property.findOne({ _id: selectedSpaceRecord.property, ...eligibility }).populate('owner', 'name avatar kycStatus').lean();
  }
  if (!property) throw new ApiError(404, 'Property not found');

  const [spaces, media] = await Promise.all([
    PropertySpace.find({ property: property._id, visibility: 'public', publicationStatus: 'published', status: { $in: ['available', 'reserved'] }, deletedAt: null }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    PropertyMedia.find({ property: property._id, visibility: 'public', deletedAt: null }).sort({ cover: -1, sortOrder: 1, createdAt: 1 }).lean(),
  ]);
  const publicProperty = serializePublicProperty(property);
  const publicSpaces = spaces.map((space) => {
    const serialized = serializePublicSpace({ ...space, property });
    delete serialized.property;
    return { ...serialized, children: [], media: [] };
  });
  const nodes = new Map(publicSpaces.map((space) => [String(space._id), space]));
  const roots = [];
  nodes.forEach((node) => {
    const parentId = node.parent ? String(node.parent) : null;
    if (parentId && nodes.has(parentId)) nodes.get(parentId).children.push(node); else roots.push(node);
  });
  media.map(serializePublicMedia).forEach((item) => {
    if (item.space && nodes.has(String(item.space))) nodes.get(String(item.space)).media.push(item);
  });
  const propertyMedia = media.filter((item) => !item.space).map(serializePublicMedia);
  const selectedSpace = selectedSpaceRecord ? serializePublicSpace({ ...selectedSpaceRecord, property }) : null;

  await Property.updateOne({ _id: property._id }, { $inc: { 'metrics.views': 1 } });
  if (selectedSpaceRecord) await PropertySpace.updateOne({ _id: selectedSpaceRecord._id }, { $inc: { 'metrics.views': 1 } });
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  res.json({ success: true, data: { property: publicProperty, selectedSpace, spaces: roots, media: propertyMedia } });
});
