import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const objectId = (ref, required = false) => ({ type: Schema.Types.ObjectId, ref, required });
const timestamps = { timestamps: true };

const PropertyTypeFieldSchema = new Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  required: { type: Boolean, default: false },
  options: [String],
  group: String,
  sortOrder: { type: Number, default: 0 },
}, { _id: false });

const SiteSettingSchema = new Schema({
  key: { type: String, default: 'default', unique: true, index: true },
  siteTitle: { type: String, default: 'SecureAsset' },
  shortTitle: { type: String, default: 'SecureAsset' },
  tagline: { type: String, default: 'Property, tenancy and survey management in one secure platform.' },
  description: String,
  logoUrl: String,
  logoLightUrl: String,
  faviconUrl: String,
  defaultOgImageUrl: String,
  brand: {
    primaryColor: { type: String, default: '#0B5270' }, secondaryColor: { type: String, default: '#0f172a' },
    accentColor: { type: String, default: '#22c55e' }, fontFamily: { type: String, default: 'Plus Jakarta Sans' },
  },
  contact: { email: String, phone: String, whatsapp: String, address: String, supportHours: String },
  social: { facebook: String, instagram: String, x: String, linkedin: String, youtube: String },
  map: { provider: { type: String, enum: ['google', 'openstreetmap', 'mapbox'], default: 'google' }, publicApiKey: String, defaultLatitude: Number, defaultLongitude: Number, defaultZoom: Number },
  seo: { titleTemplate: { type: String, default: '%s | SecureAsset' }, defaultTitle: String, defaultDescription: String, keywords: [String], robots: { type: String, default: 'index,follow' }, canonicalBaseUrl: String, googleSiteVerification: String },
  homepage: { heroEnabled: { type: Boolean, default: true }, featuredPropertiesEnabled: { type: Boolean, default: true }, featuredSurveyorsEnabled: { type: Boolean, default: true }, statsEnabled: { type: Boolean, default: true } },
  authentication: {
    badge: { type: String, default: 'Enterprise property operations' },
    headline: { type: String, default: 'Every property workflow. One secure platform.' },
    description: { type: String, default: 'Manage properties, tenants, payments, surveys, legal records and communication with secure role-based access.' },
    features: { type: [String], default: ['Role-based access', 'Encrypted document vault', 'Real-time messaging', 'Automated billing', 'Audit trails'] },
    footerText: { type: String, default: 'Enterprise property, tenancy and survey operations' },
    loginTitle: { type: String, default: 'Welcome back' }, loginSubtitle: { type: String, default: 'Sign in with your organisation account.' },
    registerTitle: { type: String, default: 'Create your account' }, registerSubtitle: { type: String, default: 'Create your account and verify your registered mobile number with OTP.' },
    otpTitle: { type: String, default: 'Passwordless login' }, otpSubtitle: { type: String, default: 'Use a secure one-time password sent to your registered mobile.' },
    forgotTitle: { type: String, default: 'Reset password' }, forgotSubtitle: { type: String, default: 'Enter your registered email or mobile number. The reset OTP is sent to your registered mobile.' },
    allowRegistration: { type: Boolean, default: true }, allowPasswordLogin: { type: Boolean, default: true }, allowOtpLogin: { type: Boolean, default: true },
    showDemoAccounts: { type: Boolean, default: false },
  },
  maintenance: { enabled: { type: Boolean, default: false }, message: String, allowedIps: [String] },
  legal: { privacyUrl: String, termsUrl: String, cookieUrl: String },
  updatedBy: objectId('User'),
}, timestamps);

const SeoPageSchema = new Schema({
  path: { type: String, required: true, unique: true, trim: true, index: true },
  title: { type: String, required: true }, description: String, keywords: [String],
  canonicalUrl: String, robots: { type: String, default: 'index,follow' },
  ogTitle: String, ogDescription: String, ogImageUrl: String, ogType: { type: String, default: 'website' },
  twitterCard: { type: String, default: 'summary_large_image' },
  structuredData: Schema.Types.Mixed,
  active: { type: Boolean, default: true, index: true },
  updatedBy: objectId('User'),
}, timestamps);

const HomeCarouselSchema = new Schema({
  title: { type: String, required: true }, subtitle: String, eyebrow: String,
  imageUrl: String, mobileImageUrl: String, altText: String,
  primaryCta: { label: String, url: String }, secondaryCta: { label: String, url: String },
  overlay: { enabled: { type: Boolean, default: true }, opacity: { type: Number, default: 0.35, min: 0, max: 1 } },
  textAlign: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
  sortOrder: { type: Number, default: 0, index: true },
  startsAt: Date, endsAt: Date, active: { type: Boolean, default: true, index: true },
  audience: { type: String, enum: ['all', 'tenant', 'landlord', 'surveyor'], default: 'all' },
  updatedBy: objectId('User'),
}, timestamps);
HomeCarouselSchema.index({ active: 1, sortOrder: 1, startsAt: 1, endsAt: 1 });

const HomeSectionSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true },
  type: { type: String, enum: ['stats', 'features', 'featured_properties', 'featured_surveyors', 'locations', 'testimonials', 'cta', 'custom'], required: true },
  title: String, subtitle: String, content: Schema.Types.Mixed,
  sortOrder: { type: Number, default: 0, index: true }, active: { type: Boolean, default: true, index: true },
  background: { color: String, imageUrl: String }, updatedBy: objectId('User'),
}, timestamps);

const LandlordPlanSchema = new Schema({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true }, description: String, rank: { type: Number, default: 0 }, active: { type: Boolean, default: true, index: true },
  prices: { monthly: { type: Number, default: 0 }, yearly: { type: Number, default: 0 }, currency: { type: String, default: 'INR' } },
  limits: {
    properties: { type: Number, default: 1 }, buildings: { type: Number, default: 1 }, apartments: { type: Number, default: 5 },
    rooms: { type: Number, default: 20 }, beds: { type: Number, default: 20 }, publicListings: { type: Number, default: 2 },
    activeTenants: { type: Number, default: 20 }, storageMB: { type: Number, default: 5120 }, teamMembers: { type: Number, default: 1 },
  },
  features: {
    rentAutomation: Boolean, advancedReports: Boolean, propertyPromotions: Boolean, tenantInterviews: Boolean,
    utilityBilling: Boolean, multipleBranches: Boolean, customRoles: Boolean, apiAccess: Boolean, prioritySupport: Boolean,
  },
  graceDays: { type: Number, default: 7 }, featured: Boolean, updatedBy: objectId('User'),
}, timestamps);

const PropertyTypeConfigSchema = new Schema({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true }, label: { type: String, required: true },
  category: { type: String, enum: ['residential', 'commercial', 'land', 'hospitality', 'event', 'other'], default: 'residential' },
  hierarchyMode: { type: String, enum: ['simple', 'building', 'apartment_building', 'pg_hostel', 'commercial', 'land'], default: 'simple' },
  fields: [PropertyTypeFieldSchema],
  allowedPurposes: [{ type: String, enum: ['rent', 'sale', 'lease'] }],
  active: { type: Boolean, default: true, index: true }, sortOrder: { type: Number, default: 0 }, updatedBy: objectId('User'),
}, timestamps);

const AreaUnitSchema = new Schema({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true }, label: { type: String, required: true }, symbol: String,
  region: { country: String, state: String, city: String, district: String }, squareMetreFactor: { type: Number, required: true, min: 0 },
  active: { type: Boolean, default: true, index: true }, sortOrder: { type: Number, default: 0 }, updatedBy: objectId('User'),
}, timestamps);

const PropertySpaceSchema = new Schema({
  property: { ...objectId('Property', true), index: true }, owner: { ...objectId('User', true), index: true }, parent: { ...objectId('PropertySpace'), index: true },
  level: { type: String, enum: ['building', 'floor', 'apartment', 'room', 'bed', 'office', 'shop', 'showroom', 'warehouse_unit', 'plot', 'other'], required: true, index: true },
  name: { type: String, required: true, trim: true }, code: { type: String, trim: true }, roomNumber: String, apartmentNumber: String, galleryScope: { type: String, enum: ['property','apartment','room'], default: 'room' }, floorNumber: String, sortOrder: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'available', 'reserved', 'occupied', 'rented', 'sold', 'leased', 'maintenance', 'inactive', 'archived'], default: 'draft', index: true },
  rentable: { type: Boolean, default: false }, sellable: { type: Boolean, default: false }, purpose: { type: String, enum: ['rent', 'sale', 'lease'], default: 'rent' },
  visibility: { type: String, enum: ['private', 'public'], default: 'private', index: true }, publicationStatus: { type: String, enum: ['draft', 'pending_approval', 'published', 'paused', 'archived'], default: 'draft', index: true },
  price: Number, securityDeposit: Number, maintenanceCharge: Number, area: { value: Number, unit: String },
  roomDetails: Schema.Types.Mixed, furnishing: Schema.Types.Mixed, amenities: [String],
  occupancyRules: { maxTotal: Number, maxAdults: Number, maxChildren: Number, maxPerRoom: Number, familyAllowed: Boolean, bachelorsAllowed: Boolean, studentsAllowed: Boolean, professionalsAllowed: Boolean, sharedOccupancyAllowed: Boolean, petsAllowed: Boolean, additionalOccupantsRequireApproval: Boolean },
  availableFrom: Date, coverImage: String, description: String,
  promotion: { featured: Boolean, topListing: Boolean, urgentType: String, startsAt: Date, endsAt: Date },
  metrics: { views: { type: Number, default: 0 }, clicks: { type: Number, default: 0 }, enquiries: { type: Number, default: 0 }, applications: { type: Number, default: 0 }, siteVisits: { type: Number, default: 0 } },
  createdBy: objectId('User'), updatedBy: objectId('User'), deletedAt: Date,
}, timestamps);
PropertySpaceSchema.index({ property: 1, parent: 1, level: 1, sortOrder: 1 });
PropertySpaceSchema.index({ visibility: 1, publicationStatus: 1, purpose: 1, status: 1 });
PropertySpaceSchema.index({ name: 'text', code: 'text', description: 'text', amenities: 'text' }, { name: 'property_space_search_text', weights: { name: 10, code: 8, amenities: 4, description: 2 } });

const PropertyMediaSchema = new Schema({
  property: { ...objectId('Property', true), index: true }, space: { ...objectId('PropertySpace'), index: true }, owner: { ...objectId('User', true), index: true },
  category: { type: String, required: true, index: true }, mediaType: { type: String, enum: ['image', 'video', '360', 'document'], default: 'image' },
  url: { type: String, required: true }, document: objectId('Document'), driveFile: objectId('DriveFile'), thumbnailUrl: String, caption: String, altText: String,
  sortOrder: { type: Number, default: 0 }, cover: { type: Boolean, default: false }, visibility: { type: String, enum: ['private', 'public', 'tenant', 'manager', 'surveyor', 'legal'], default: 'private', index: true },
  watermark: { enabled: Boolean, text: String }, compressed: Boolean, uploadedBy: objectId('User'), deletedAt: Date,
}, timestamps);
PropertyMediaSchema.index({ property: 1, space: 1, category: 1, sortOrder: 1 });

const TenantProfileSchema = new Schema({
  user: { ...objectId('User', true), unique: true, index: true }, profileImage: String, profileVisibility: { type: String, enum: ['private', 'applications', 'landlords'], default: 'applications' },
  dateOfBirth: Date, gender: String, currentAddress: Schema.Types.Mixed, permanentAddress: Schema.Types.Mixed,
  occupation: String, employerInstitution: String, monthlyIncome: Number, emergencyContact: Schema.Types.Mixed,
  identityDocuments: [objectId('DriveFile')], addressProofs: [objectId('DriveFile')], employmentProofs: [objectId('DriveFile')],
  references: [{ name: String, phone: String, relation: String, verified: Boolean }],
  preferences: { locations: [String], propertyTypes: [String], minBudget: Number, maxBudget: Number, moveInDate: Date },
  completedPercent: { type: Number, default: 0 }, updatedBy: objectId('User'),
}, timestamps);

const TenantKycSchema = new Schema({
  user: { ...objectId('User', true), unique: true, index: true },
  status: { type: String, enum: ['not_started', 'incomplete', 'submitted', 'under_review', 'changes_required', 'verified', 'rejected', 'expired', 'suspended'], default: 'not_started', index: true },
  governmentId: objectId('DriveFile'), addressProof: objectId('DriveFile'), profilePhoto: objectId('DriveFile'), selfie: objectId('DriveFile'), employmentProof: objectId('DriveFile'),
  phoneVerified: Boolean, emailVerified: Boolean, emergencyContactVerified: Boolean, employmentVerified: Boolean,
  submittedAt: Date, reviewedAt: Date, verifiedAt: Date, expiresAt: Date, reviewer: objectId('User'), reason: String, notes: String,
  history: [{ status: String, reason: String, by: objectId('User'), at: { type: Date, default: Date.now } }],
}, timestamps);

const OccupantSchema = new Schema({
  tenant: { ...objectId('User', true), index: true }, application: { ...objectId('Application'), index: true }, tenancy: { ...objectId('Tenancy'), index: true },
  fullName: { type: String, required: true }, age: Number, gender: String, relationship: String, occupation: String,
  identityDocument: objectId('DriveFile'), phone: String,
  kycStatus: { type: String, enum: ['not_started', 'submitted', 'verified', 'rejected'], default: 'not_started' },
  sensitive: { type: Boolean, default: true }, createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);

const TenantInterviewSchema = new Schema({
  application: { ...objectId('Application', true), index: true }, property: { ...objectId('Property', true), index: true }, space: objectId('PropertySpace'),
  landlord: { ...objectId('User', true), index: true }, tenant: { ...objectId('User', true), index: true },
  scheduledAt: Date, type: { type: String, enum: ['online', 'in_person', 'phone'], default: 'online' }, location: String, meetingUrl: String,
  questions: [{ question: String, answer: String, score: Number }], privateNotes: String, rating: Number,
  status: { type: String, enum: ['requested', 'scheduled', 'rescheduled', 'completed', 'cancelled', 'tenant_absent', 'landlord_absent'], default: 'requested', index: true },
  decision: { type: String, enum: ['pending', 'shortlist', 'approve', 'reject', 'waiting_list'], default: 'pending' }, followUpAt: Date,
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);

const PropertyVisitSchema = new Schema({
  property: { ...objectId('Property', true), index: true }, space: objectId('PropertySpace'), requester: { ...objectId('User', true), index: true }, landlord: { ...objectId('User', true), index: true }, assignedTo: objectId('User'),
  preferredStart: Date, proposedStart: Date, confirmedStart: Date, visitorCount: Number, contact: Schema.Types.Mixed, purpose: String, message: String, accessibilitySupport: String,
  status: { type: String, enum: ['requested', 'pending_approval', 'approved', 'rescheduled', 'confirmed', 'visitor_arrived', 'visit_in_progress', 'completed', 'customer_absent', 'landlord_absent', 'cancelled', 'rejected'], default: 'requested', index: true },
  instructions: String, meetingPoint: String, attendance: Schema.Types.Mixed, feedback: Schema.Types.Mixed, interest: { type: String, enum: ['unknown', 'interested', 'not_interested'], default: 'unknown' },
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);

const TenancySchema = new Schema({
  tenant: { ...objectId('User', true), index: true }, landlord: { ...objectId('User', true), index: true }, property: { ...objectId('Property', true), index: true }, space: objectId('PropertySpace'), application: objectId('Application'), lease: objectId('Lease'),
  status: { type: String, enum: ['reserved', 'deposit_pending', 'agreement_pending', 'active', 'notice', 'move_out', 'completed', 'cancelled'], default: 'reserved', index: true },
  startDate: Date, endDate: Date, monthlyRent: Number, securityDeposit: Number, dueDay: { type: Number, default: 1 }, occupants: [objectId('Occupant')],
  moveInChecklist: [{ label: String, completed: Boolean, file: objectId('DriveFile') }], moveOutChecklist: [{ label: String, completed: Boolean, file: objectId('DriveFile') }],
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);

const RentalInvoiceSchema = new Schema({
  invoiceNumber: { type: String, required: true, unique: true, index: true }, tenancy: { ...objectId('Tenancy', true), index: true }, tenant: { ...objectId('User', true), index: true }, landlord: { ...objectId('User', true), index: true }, property: { ...objectId('Property', true), index: true }, space: objectId('PropertySpace'),
  billingMonth: { type: String, required: true, index: true }, dueDate: { type: Date, required: true, index: true },
  charges: { baseRent: Number, electricity: Number, water: Number, maintenance: Number, parking: Number, internet: Number, gas: Number, cleaning: Number, commonArea: Number, securityDeposit: Number, lateFee: Number, other: [{ label: String, amount: Number }] },
  discounts: Number, previousBalance: Number, totalAmount: Number, paidAmount: { type: Number, default: 0 }, balanceAmount: Number, paymentCycle: { type: String, enum: ['monthly','quarterly','half_yearly','yearly','custom'], default: 'monthly' }, whatsappReminderEnabled: { type: Boolean, default: false }, legalAgreement: objectId('DriveFile'),
  status: { type: String, enum: ['upcoming', 'pending', 'partially_paid', 'paid', 'overdue', 'failed', 'refunded', 'waived', 'disputed'], default: 'upcoming', index: true },
  payments: [{ amount: Number, method: String, transactionId: String, paidAt: Date, proof: objectId('DriveFile') }], receiptFile: objectId('DriveFile'), lastReminderAt: Date,
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);
RentalInvoiceSchema.index({ tenancy: 1, billingMonth: 1 }, { unique: true });

const UtilityReadingSchema = new Schema({
  tenancy: { ...objectId('Tenancy', true), index: true }, property: { ...objectId('Property', true), index: true }, space: objectId('PropertySpace'), tenant: { ...objectId('User', true), index: true }, landlord: { ...objectId('User', true), index: true },
  utilityType: { type: String, enum: ['electricity', 'water'], required: true, index: true }, billingPeriod: { type: String, required: true, index: true },
  previousReading: Number, currentReading: Number, unitsConsumed: Number, ratePerUnit: Number, fixedCharge: Number, tax: Number, otherCharge: Number, totalAmount: Number,
  allocationMethod: { type: String, enum: ['direct', 'equal_room', 'equal_tenant', 'occupants', 'percentage', 'custom', 'sub_meter'], default: 'direct' }, allocations: [{ space: objectId('PropertySpace'), tenant: objectId('User'), percentage: Number, units: Number, amount: Number }],
  meterPhoto: objectId('DriveFile'), billDocument: objectId('DriveFile'), dueDate: Date, approved: Boolean,
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);

const ReminderRuleSchema = new Schema({
  owner: { ...objectId('User', true), index: true }, property: { ...objectId('Property'), index: true },
  eventType: { type: String, required: true, index: true }, offsetsDays: [{ type: Number }], repeatWeeklyUntilPaid: Boolean,
  channels: [{ type: String, enum: ['in_app', 'email', 'sms', 'whatsapp', 'push'] }], template: { subject: String, message: String }, active: { type: Boolean, default: true },
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);

const PropertyPromotionSchema = new Schema({
  property: { ...objectId('Property', true), index: true }, space: objectId('PropertySpace'), owner: { ...objectId('User', true), index: true },
  type: { type: String, enum: ['featured', 'top_listing', 'urgent_sale', 'urgent_rent', 'homepage_banner', 'recommended', 'location_sponsored'], required: true, index: true },
  startsAt: Date, endsAt: Date, amount: Number, status: { type: String, enum: ['pending', 'active', 'paused', 'expired', 'cancelled'], default: 'pending', index: true },
  metrics: { views: { type: Number, default: 0 }, clicks: { type: Number, default: 0 }, enquiries: { type: Number, default: 0 }, applications: { type: Number, default: 0 }, siteVisits: { type: Number, default: 0 }, conversions: { type: Number, default: 0 } },
  payment: objectId('Payment'), createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);

const FacilitySchema = new Schema({
  property: { ...objectId('Property', true), index: true },
  owner: { ...objectId('User', true), index: true },
  manager: { ...objectId('User'), index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  type: { type: String, required: true, trim: true, index: true },
  description: { type: String, default: '', maxlength: 3000 },
  capacity: { type: Number, min: 1, default: 1 },
  visibility: { type: String, enum: ['private', 'tenant', 'public'], default: 'tenant', index: true },
  status: { type: String, enum: ['active', 'maintenance', 'inactive', 'archived'], default: 'active', index: true },
  bookingRequired: { type: Boolean, default: true },
  price: { type: Number, min: 0, default: 0 },
  deposit: { type: Number, min: 0, default: 0 },
  currency: { type: String, default: 'INR' },
  slotMinutes: { type: Number, min: 15, max: 1440, default: 60 },
  minimumNoticeHours: { type: Number, min: 0, default: 1 },
  maximumAdvanceDays: { type: Number, min: 1, default: 90 },
  availableDays: [{ type: String, enum: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] }],
  availableTimeSlots: [{ start: String, end: String }],
  amenities: [String],
  rules: [String],
  images: [String],
  createdBy: objectId('User'), updatedBy: objectId('User'), deletedAt: Date,
}, timestamps);
FacilitySchema.index({ property: 1, status: 1, visibility: 1 });
FacilitySchema.index({ name: 'text', type: 'text', description: 'text', amenities: 'text' }, { name: 'facility_search_text', weights: { name: 10, type: 7, amenities: 4, description: 2 } });

const FacilityBookingSchema = new Schema({
  facility: { ...objectId('Facility', true), index: true },
  property: { ...objectId('Property', true), index: true },
  owner: { ...objectId('User', true), index: true },
  requester: { ...objectId('User', true), index: true },
  startAt: { type: Date, required: true, index: true },
  endAt: { type: Date, required: true, index: true },
  guests: { type: Number, min: 1, default: 1 },
  purpose: { type: String, maxlength: 500 },
  status: { type: String, enum: ['requested', 'approved', 'rescheduled', 'rejected', 'cancelled', 'in_progress', 'completed', 'no_show'], default: 'requested', index: true },
  paymentStatus: { type: String, enum: ['not_required', 'pending', 'paid', 'failed', 'refunded'], default: 'not_required', index: true },
  amount: { type: Number, min: 0, default: 0 },
  deposit: { type: Number, min: 0, default: 0 },
  notes: String,
  decisionNote: String,
  approvedBy: objectId('User'),
  payment: objectId('Payment'),
  createdBy: objectId('User'), updatedBy: objectId('User'), cancelledAt: Date,
}, timestamps);
FacilityBookingSchema.index({ facility: 1, startAt: 1, endAt: 1, status: 1 });
FacilityBookingSchema.index({ requester: 1, createdAt: -1 });


const PlatformModuleSchema = new Schema({
  key: { type: String, required: true, lowercase: true, trim: true },
  label: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  path: { type: String, required: true, trim: true },
  icon: { type: String, default: 'dashboard' },
  scope: { type: String, enum: ['public', 'app'], default: 'app', index: true },
  kind: { type: String, enum: ['page', 'resource', 'system', 'external'], default: 'resource' },
  section: { type: String, default: 'general', index: true },
  sectionOrder: { type: Number, default: 0, index: true },
  roles: [{ type: String, enum: ['admin', 'manager', 'tenant', 'user', 'surveyor'] }],
  modes: [{ type: String, enum: ['regular', 'landlord', 'surveyor'] }],
  accessRules: [{ roles: [{ type: String, enum: ['admin', 'manager', 'tenant', 'user', 'surveyor'] }], modes: [{ type: String, enum: ['regular', 'landlord', 'surveyor'] }] }],
  enabled: { type: Boolean, default: true, index: true },
  mobilePrimary: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0, index: true },
  featureFlag: String,
  badge: { text: String, color: String },
  metadata: { type: Schema.Types.Mixed, default: {} },
  updatedBy: objectId('User'),
}, timestamps);
PlatformModuleSchema.index({ scope: 1, key: 1 }, { unique: true, name: 'platform_module_scope_key_unique' });
PlatformModuleSchema.index({ scope: 1, enabled: 1, section: 1, sortOrder: 1 }, { name: 'platform_module_navigation' });
PlatformModuleSchema.index({ scope: 1, enabled: 1, sectionOrder: 1, section: 1, sortOrder: 1 }, { name: 'platform_module_section_navigation' });

const ContentPageSchema = new Schema({
  path: { type: String, required: true, unique: true, trim: true, index: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  title: { type: String, required: true, trim: true },
  subtitle: String,
  hero: { eyebrow: String, title: String, subtitle: String, imageUrl: String, align: { type: String, enum: ['left', 'center', 'right'], default: 'left' }, primaryCta: { label: String, url: String }, secondaryCta: { label: String, url: String } },
  sections: [{ key: String, type: { type: String }, title: String, subtitle: String, content: Schema.Types.Mixed, sortOrder: Number, active: { type: Boolean, default: true } }],
  visibility: { type: String, enum: ['public', 'authenticated'], default: 'public', index: true },
  active: { type: Boolean, default: true, index: true },
  updatedBy: objectId('User'),
}, timestamps);
ContentPageSchema.index({ active: 1, visibility: 1, path: 1 }, { name: 'content_page_public_lookup' });

const NotificationPreferenceSchema = new Schema({
  user: { ...objectId('User', true), unique: true, index: true },
  channels: { inApp: { type: Boolean, default: true }, email: { type: Boolean, default: true }, sms: { type: Boolean, default: false }, whatsapp: { type: Boolean, default: false }, push: { type: Boolean, default: false } },
  categories: { payment: { type: Boolean, default: true }, survey: { type: Boolean, default: true }, complaint: { type: Boolean, default: true }, lease: { type: Boolean, default: true }, maintenance: { type: Boolean, default: true }, message: { type: Boolean, default: true }, system: { type: Boolean, default: true } },
  quietHours: { enabled: { type: Boolean, default: false }, start: String, end: String, timezone: { type: String, default: 'Asia/Kolkata' } },
}, timestamps);

const IntegrationSettingSchema = new Schema({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  provider: { type: String, required: true, trim: true },
  category: { type: String, enum: ['payment', 'email', 'sms', 'whatsapp', 'storage', 'maps', 'analytics', 'identity', 'other'], default: 'other', index: true },
  enabled: { type: Boolean, default: false, index: true },
  status: { type: String, enum: ['unconfigured', 'configured', 'healthy', 'degraded', 'error', 'disabled'], default: 'unconfigured', index: true },
  publicConfig: { type: Schema.Types.Mixed, default: {} },
  secureConfig: {
    authorizationEncrypted: { type: String, select: false },
  },
  envRequirements: [String],
  lastCheckedAt: Date,
  lastError: String,
  updatedBy: objectId('User'),
}, timestamps);

const SiteEnquirySchema = new Schema({
  name: String, email: String, phone: String, message: String, property: objectId('Property'), space: objectId('PropertySpace'),
  type: { type: String, enum: ['contact', 'property', 'support'], default: 'contact' }, status: { type: String, enum: ['new', 'contacted', 'qualified', 'closed', 'spam'], default: 'new', index: true }, assignedTo: objectId('User'),
}, timestamps);

export const PlatformModule = models.PlatformModule || model('PlatformModule', PlatformModuleSchema);
export const ContentPage = models.ContentPage || model('ContentPage', ContentPageSchema);
export const NotificationPreference = models.NotificationPreference || model('NotificationPreference', NotificationPreferenceSchema);
export const IntegrationSetting = models.IntegrationSetting || model('IntegrationSetting', IntegrationSettingSchema);
export const SiteSetting = models.SiteSetting || model('SiteSetting', SiteSettingSchema);
export const SeoPage = models.SeoPage || model('SeoPage', SeoPageSchema);
export const HomeCarousel = models.HomeCarousel || model('HomeCarousel', HomeCarouselSchema);
export const HomeSection = models.HomeSection || model('HomeSection', HomeSectionSchema);
export const LandlordPlan = models.LandlordPlan || model('LandlordPlan', LandlordPlanSchema);
export const PropertyTypeConfig = models.PropertyTypeConfig || model('PropertyTypeConfig', PropertyTypeConfigSchema);
export const AreaUnit = models.AreaUnit || model('AreaUnit', AreaUnitSchema);
export const PropertySpace = models.PropertySpace || model('PropertySpace', PropertySpaceSchema);
export const PropertyMedia = models.PropertyMedia || model('PropertyMedia', PropertyMediaSchema);
export const TenantProfile = models.TenantProfile || model('TenantProfile', TenantProfileSchema);
export const TenantKyc = models.TenantKyc || model('TenantKyc', TenantKycSchema);
export const Occupant = models.Occupant || model('Occupant', OccupantSchema);
export const TenantInterview = models.TenantInterview || model('TenantInterview', TenantInterviewSchema);
export const PropertyVisit = models.PropertyVisit || model('PropertyVisit', PropertyVisitSchema);
export const Tenancy = models.Tenancy || model('Tenancy', TenancySchema);
export const RentalInvoice = models.RentalInvoice || model('RentalInvoice', RentalInvoiceSchema);
export const UtilityReading = models.UtilityReading || model('UtilityReading', UtilityReadingSchema);
export const ReminderRule = models.ReminderRule || model('ReminderRule', ReminderRuleSchema);
export const PropertyPromotion = models.PropertyPromotion || model('PropertyPromotion', PropertyPromotionSchema);
export const SiteEnquiry = models.SiteEnquiry || model('SiteEnquiry', SiteEnquirySchema);
export const Facility = models.Facility || model('Facility', FacilitySchema);
export const FacilityBooking = models.FacilityBooking || model('FacilityBooking', FacilityBookingSchema);
