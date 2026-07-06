import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const ref = (name, required = false) => ({ type: Schema.Types.ObjectId, ref: name, required });
const timestamps = { timestamps: true };

const VerificationDocumentSchema = new Schema({
  type: { type: String },
  url: String,
  name: String,
  expiresAt: Date,
  status: String,
}, { _id: false });

const FieldMeasurementSchema = new Schema({
  type: { type: String },
  label: String,
  value: Number,
  unit: String,
  angle: Number,
  notes: String,
}, { _id: false });

const FieldCalculationSchema = new Schema({
  type: { type: String },
  inputs: Schema.Types.Mixed,
  formula: String,
  output: Number,
  unit: String,
  calculatedBy: ref('User'),
  calculatedAt: Date,
  approved: Boolean,
  approvedBy: ref('User'),
}, { _id: false });

const FieldMediaSchema = new Schema({
  type: { type: String },
  url: String,
  caption: String,
  latitude: Number,
  longitude: Number,
  capturedAt: Date,
}, { _id: false });

const EquipmentMaintenanceSchema = new Schema({
  date: Date,
  type: { type: String },
  notes: String,
  cost: Number,
}, { _id: false });

const SurveyorPlanSchema = new Schema({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: String,
  active: { type: Boolean, default: true, index: true },
  rank: { type: Number, default: 0 },
  prices: {
    monthly: { type: Number, default: 0, min: 0 },
    yearly: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
  },
  limits: {
    publicServices: { type: Number, default: 1 },
    jobsPerMonth: { type: Number, default: 5 },
    quotationsPerMonth: { type: Number, default: 5 },
    teamMembers: { type: Number, default: 0 },
    serviceLocations: { type: Number, default: 1 },
    storageMb: { type: Number, default: 250 },
    reportsPerMonth: { type: Number, default: 5 },
    clients: { type: Number, default: 25 },
  },
  features: {
    clientManagement: { type: Boolean, default: false },
    invoicing: { type: Boolean, default: false },
    digitalSignature: { type: Boolean, default: false },
    advancedMapping: { type: Boolean, default: false },
    analytics: { type: Boolean, default: false },
    featuredEligible: { type: Boolean, default: false },
    priorityPlacement: { type: Boolean, default: false },
    integrations: { type: Boolean, default: false },
    privateShareLinks: { type: Boolean, default: true },
    offlineFieldData: { type: Boolean, default: true },
  },
  graceDays: { type: Number, default: 7, min: 0, max: 90 },
  supportLevel: { type: String, enum: ['standard', 'priority', 'dedicated'], default: 'standard' },
  createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);

const SurveyorSubscriptionSchema = new Schema({
  user: { ...ref('User', true), index: true },
  plan: { ...ref('SurveyorPlan', true), index: true },
  planKey: { type: String, required: true, index: true },
  planSnapshot: Schema.Types.Mixed,
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  status: {
    type: String,
    enum: ['trial', 'active', 'expiring_soon', 'grace_period', 'expired', 'suspended', 'cancelled', 'payment_pending'],
    default: 'payment_pending', index: true,
  },
  startsAt: Date, expiresAt: { type: Date, index: true }, nextRenewalAt: Date,
  graceEndsAt: Date, cancelledAt: Date, suspendedAt: Date,
  autoRenew: { type: Boolean, default: false }, cancelAtPeriodEnd: { type: Boolean, default: false },
  usagePeriod: { month: String, jobs: { type: Number, default: 0 }, quotations: { type: Number, default: 0 }, reports: { type: Number, default: 0 }, storageBytes: { type: Number, default: 0 } },
  discount: { code: String, amount: Number, percent: Number },
  paymentHistory: [{ status: String, amount: Number, transactionId: String, gateway: String, paidAt: Date, failureReason: String, paymentId: ref('Payment') }],
  renewalHistory: [{ planKey: String, startsAt: Date, expiresAt: Date, amount: Number, renewedAt: Date, paymentId: ref('Payment') }],
  createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);
SurveyorSubscriptionSchema.index({ user: 1, status: 1, expiresAt: -1 });

const SurveyorVerificationSchema = new Schema({
  user: { ...ref('User', true), unique: true, index: true },
  status: { type: String, enum: ['not_submitted', 'draft', 'submitted', 'under_review', 'changes_required', 'verified', 'rejected', 'suspended', 'expired'], default: 'not_submitted', index: true },
  legalName: String, profilePhoto: String, phone: String, email: String,
  address: { line1: String, line2: String, city: String, state: String, country: { type: String, default: 'India' }, postalCode: String },
  registrationNumber: String, licenceNumber: String, licenceAuthority: String, licenceIssueDate: Date, licenceExpiryDate: Date,
  qualifications: [String], certifications: [String], yearsExperience: Number,
  taxRegistration: String, businessRegistrationNumber: String, agencyRegistrationNumber: String,
  insurance: { provider: String, policyNumber: String, expiresAt: Date, documentUrl: String },
  bankVerification: { accountName: String, maskedAccount: String, ifsc: String, status: String },
  serviceAreas: [{ name: String, radiusKm: Number }],
  documents: [VerificationDocumentSchema],
  reviewer: ref('User'), reviewerNotes: String, rejectionReason: String, suspensionReason: String,
  submittedAt: Date, reviewedAt: Date, verifiedAt: Date,
  createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);

const SurveyorProfileSchema = new Schema({
  user: { ...ref('User', true), unique: true, index: true },
  profileType: { type: String, enum: ['individual', 'agency'], default: 'individual', index: true },
  name: { type: String, required: true, trim: true },
  professionalTitle: String, profilePhoto: String, agencyLogo: String,
  description: { type: String, default: '' }, yearsExperience: Number,
  registrationNumber: String, licenceNumber: String, qualifications: [String], certifications: [String],
  specialisations: [{ type: String, index: true }], languages: [String], serviceLocations: [{ city: String, state: String, radiusKm: Number }],
  officeAddress: { line1: String, city: String, state: String, country: { type: String, default: 'India' }, postalCode: String },
  publicContact: { phone: String, email: String, website: String },
  workingHours: Schema.Types.Mixed, emergencyAvailable: Boolean,
  portfolio: [{ title: String, description: String, images: [String], completedAt: Date }],
  completedProjects: { type: Number, default: 0 }, achievements: [String], equipmentSummary: [String], teamSize: Number,
  availability: { type: String, enum: ['available', 'busy', 'limited', 'unavailable'], default: 'available', index: true },
  startingPrice: { type: Number, default: 0, min: 0 }, averageCompletionDays: Number, terms: String,
  visibility: { type: String, enum: ['private', 'public'], default: 'private', index: true },
  publicationStatus: { type: String, enum: ['draft', 'pending_moderation', 'published', 'paused', 'archived'], default: 'draft', index: true },
  publicSlug: { type: String, unique: true, sparse: true, index: true },
  privateShare: { enabled: Boolean, tokenHash: String, passwordHash: String, revokedAt: Date },
  verificationStatus: { type: String, enum: ['not_submitted', 'pending', 'verified', 'rejected', 'suspended', 'expired'], default: 'not_submitted', index: true },
  isFeatured: { type: Boolean, default: false, index: true }, isRecommended: { type: Boolean, default: false },
  rating: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  metrics: { views: { type: Number, default: 0 }, enquiries: { type: Number, default: 0 }, conversions: { type: Number, default: 0 }, responseMinutes: Number },
  exactCoordinatesPublic: { type: Boolean, default: false },
  createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);
SurveyorProfileSchema.index({ name: 'text', professionalTitle: 'text', description: 'text', specialisations: 'text', languages: 'text' }, { name: 'surveyor_profile_search_text', weights: { name: 10, professionalTitle: 8, specialisations: 6, languages: 3, description: 2 } });
SurveyorProfileSchema.index({ visibility: 1, publicationStatus: 1, verificationStatus: 1, isFeatured: -1, 'rating.average': -1 });

const SurveyServiceSchema = new Schema({
  surveyor: { ...ref('User', true), index: true }, profile: ref('SurveyorProfile'),
  title: { type: String, required: true, trim: true },
  category: { type: String, required: true, index: true }, subtype: { type: String, index: true },
  shortDescription: String, description: { type: String, default: '' },
  coverageAreas: [{ city: String, state: String, radiusKm: Number }],
  startingPrice: { type: Number, default: 0, min: 0 },
  pricingMethod: { type: String, enum: ['fixed', 'per_acre', 'per_sq_ft', 'per_sq_metre', 'per_kilometre', 'per_building', 'per_plot', 'per_room', 'hourly', 'daily', 'custom_quotation'], default: 'custom_quotation' },
  estimatedDuration: String, availableDays: [String], timeSlots: [{ start: String, end: String }],
  requiredDocuments: [String], deliverables: [String], equipment: [String], teamSizeRequired: Number,
  travelCharges: String, emergencyAvailable: Boolean, onlineConsultation: Boolean,
  revisionPolicy: String, cancellationPolicy: String, terms: String,
  visibility: { type: String, enum: ['private', 'public'], default: 'private', index: true },
  status: { type: String, enum: ['draft', 'pending_moderation', 'published', 'paused', 'unpublished', 'archived'], default: 'draft', index: true },
  moderation: { status: { type: String, enum: ['not_submitted', 'pending', 'approved', 'rejected'], default: 'not_submitted' }, reviewedBy: ref('User'), reason: String, reviewedAt: Date },
  isFeatured: { type: Boolean, default: false, index: true }, views: { type: Number, default: 0 }, enquiries: { type: Number, default: 0 },
  createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);
SurveyServiceSchema.index({ title: 'text', shortDescription: 'text', description: 'text', category: 'text', subtype: 'text', deliverables: 'text' }, { name: 'survey_service_search_text', weights: { title: 10, category: 8, subtype: 6, shortDescription: 4, deliverables: 3, description: 2 } });
SurveyServiceSchema.index({ visibility: 1, status: 1, category: 1, startingPrice: 1, createdAt: -1 });

const SurveyJobSchema = new Schema({
  jobNumber: { type: String, unique: true, sparse: true }, client: { ...ref('User', true), index: true }, hiredSurveyor: { ...ref('User'), index: true },
  title: { type: String, required: true }, surveyType: { type: String, required: true, index: true },
  propertyType: String, addressApproximate: String,
  location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], default: [0, 0] } },
  exactLocation: { country: String, state: String, city: String, address: String, latitude: Number, longitude: Number },
  plotNumber: String, landArea: Number, measurementUnit: String, purpose: String,
  preferredVisitDate: Date, preferredCompletionDate: Date,
  budget: { min: Number, max: Number, currency: { type: String, default: 'INR' } },
  description: { type: String, default: '' }, deliverables: [String], documents: [String], photographs: [String],
  siteAccess: String, contact: { name: String, phone: String, email: String },
  urgency: { type: String, enum: ['normal', 'priority', 'urgent', 'emergency'], default: 'normal', index: true },
  visibility: { type: String, enum: ['private', 'invited', 'public'], default: 'private', index: true },
  invitedSurveyors: [ref('User')], shortlistedSurveyors: [ref('User')],
  bookingType: { type: String, enum: ['quotation', 'instant'], default: 'quotation' },
  requiredQualification: String, requiredEquipment: [String],
  status: { type: String, enum: ['draft', 'open', 'quotation_review', 'awarded', 'in_progress', 'completed', 'cancelled', 'expired'], default: 'draft', index: true },
  quotationCount: { type: Number, default: 0 }, closesAt: Date,
  createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);
SurveyJobSchema.index({ title: 'text', description: 'text', surveyType: 'text', propertyType: 'text', addressApproximate: 'text', deliverables: 'text' }, { name: 'survey_job_search_text', weights: { title: 10, surveyType: 8, propertyType: 5, addressApproximate: 4, deliverables: 3, description: 2 } });
SurveyJobSchema.index({ location: '2dsphere' });
SurveyJobSchema.index({ visibility: 1, status: 1, surveyType: 1, createdAt: -1 });

const SurveyQuotationSchema = new Schema({
  quotationNumber: { type: String, unique: true, sparse: true },
  job: { ...ref('SurveyJob', true), index: true }, surveyor: { ...ref('User', true), index: true }, client: { ...ref('User', true), index: true },
  scope: String, methodology: String, deliverables: [String],
  charges: { siteVisit: Number, survey: Number, travel: Number, equipment: Number, tax: Number, discount: Number, other: Number },
  totalAmount: { type: Number, required: true, min: 0 }, advanceAmount: { type: Number, default: 0, min: 0 },
  paymentSchedule: [{ label: String, amount: Number, dueAt: Date, status: String }],
  estimatedStartDate: Date, estimatedCompletionDate: Date, validUntil: Date,
  exclusions: [String], terms: String, attachments: [String], digitalSignature: String,
  status: { type: String, enum: ['draft', 'submitted', 'viewed', 'under_negotiation', 'revised', 'accepted', 'rejected', 'expired', 'withdrawn'], default: 'draft', index: true },
  revisionNumber: { type: Number, default: 0 }, revisions: [{ revision: Number, snapshot: Schema.Types.Mixed, reason: String, revisedAt: Date }],
  viewedAt: Date, submittedAt: Date, acceptedAt: Date, rejectedAt: Date,
  createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);
SurveyQuotationSchema.index({ job: 1, surveyor: 1 }, { unique: true });

const SurveyProjectSchema = new Schema({
  projectNumber: { type: String, unique: true, sparse: true },
  job: { ...ref('SurveyJob'), index: true }, quotation: { ...ref('SurveyQuotation'), index: true },
  client: { ...ref('User', true), index: true }, surveyor: { ...ref('User', true), index: true },
  teamMembers: [ref('SurveyTeamMember')], surveyCategory: String,
  propertySite: {
    ownerName: String, propertyType: String, usage: String, plotNumber: String, surveyNumber: String, khataPattaNumber: String,
    wardNumber: String, locality: String, village: String, district: String, city: String, state: String, country: String, postalCode: String,
    fullAddress: String, landmark: String, latitude: Number, longitude: Number,
    landArea: Number, builtUpArea: Number, carpetArea: Number, floors: Number,
    constructionStatus: String, occupancyStatus: String, accessRoad: String, boundaries: String,
    neighbours: String, structures: String, utilities: String, terrain: String, condition: String, ownershipDocuments: [String],
  },
  startDate: Date, dueDate: Date, priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  status: { type: String, enum: ['new', 'awaiting_documents', 'awaiting_advance_payment', 'scheduled', 'site_visit_pending', 'site_visit_completed', 'fieldwork_in_progress', 'data_processing', 'draft_report_ready', 'client_review', 'revision_requested', 'final_report_ready', 'completed', 'on_hold', 'cancelled', 'disputed'], default: 'new', index: true },
  tasks: [{ title: String, assignee: ref('User'), status: String, dueAt: Date }],
  milestones: [{ title: String, dueAt: Date, status: String, completedAt: Date }],
  documents: [String], fieldNotes: [String], media: [String],
  paymentSummary: { total: Number, paid: Number, outstanding: Number },
  createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);

const SiteVisitSchema = new Schema({
  project: { ...ref('SurveyProject', true), index: true }, client: { ...ref('User', true), index: true }, surveyor: { ...ref('User', true), index: true },
  teamMembers: [ref('SurveyTeamMember')], requestedStart: Date, confirmedStart: Date, estimatedEnd: Date,
  status: { type: String, enum: ['requested', 'confirmed', 'rescheduled', 'surveyor_travelling', 'surveyor_arrived', 'in_progress', 'completed', 'client_absent', 'cancelled'], default: 'requested', index: true },
  route: { origin: String, destination: String, distanceKm: Number, travelMinutes: Number },
  instructions: String, accessContact: { name: String, phone: String }, reminders: [{ channel: String, sendAt: Date, sentAt: Date }],
  checkIn: { at: Date, latitude: Number, longitude: Number, accuracy: Number },
  checkOut: { at: Date, latitude: Number, longitude: Number, accuracy: Number },
  cancellationReason: String, createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);

const FieldDataSchema = new Schema({
  project: { ...ref('SurveyProject', true), index: true }, visit: ref('SiteVisit'), surveyor: { ...ref('User', true), index: true },
  offlineId: { type: String, sparse: true, index: true }, syncStatus: { type: String, enum: ['pending', 'syncing', 'synced', 'failed'], default: 'synced' },
  observedAt: Date, weather: String, teamMembers: [String], equipmentUsed: [String],
  gpsCoordinates: [{ label: String, latitude: Number, longitude: Number, elevation: Number, accuracy: Number, capturedAt: Date }],
  boundaryPoints: [{ sequence: Number, latitude: Number, longitude: Number }],
  measurements: [FieldMeasurementSchema],
  observations: Schema.Types.Mixed,
  calculations: [FieldCalculationSchema],
  media: [FieldMediaSchema],
  voiceNotes: [String], sketches: [String], clientSignature: String, surveyorSignature: String,
  validation: { valid: Boolean, errors: [String], duplicateWarning: Boolean },
  revisions: [{ revision: Number, reason: String, changedBy: ref('User'), changedAt: Date }],
  createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);
FieldDataSchema.index({ surveyor: 1, offlineId: 1 }, { unique: true, sparse: true });

const SurveyEquipmentSchema = new Schema({
  surveyor: { ...ref('User', true), index: true }, name: { type: String, required: true }, type: { type: String, required: true, index: true },
  brand: String, model: String, serialNumber: String, purchaseDate: Date, calibrationDate: Date, nextCalibrationDate: { type: Date, index: true },
  availability: { type: String, enum: ['available', 'assigned', 'maintenance', 'calibration_due', 'retired'], default: 'available', index: true },
  assignedTo: ref('User'), maintenanceHistory: [EquipmentMaintenanceSchema],
  condition: String, certificationDocument: String, createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);

const SurveyReportSchema = new Schema({
  reportNumber: { type: String, unique: true, sparse: true }, project: { ...ref('SurveyProject', true), index: true }, surveyor: { ...ref('User', true), index: true }, client: { ...ref('User', true), index: true },
  type: { type: String, required: true, index: true }, templateName: String, title: String,
  sections: Schema.Types.Mixed, maps: [String], drawings: [String], images: [String], attachments: [String],
  digitalSignature: String, licenceDetails: String, issueDate: Date, revisionNumber: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'internal_review', 'client_preview', 'revision_requested', 'revised', 'final', 'locked', 'cancelled'], default: 'draft', index: true },
  lockedAt: Date, lockedBy: ref('User'), exports: [{ format: String, url: String, generatedAt: Date }],
  revisions: [{ revision: Number, previousSnapshot: Schema.Types.Mixed, reason: String, revisedBy: ref('User'), revisedAt: Date, clientComments: String }],
  createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);

const SurveyTeamMemberSchema = new Schema({
  owner: { ...ref('User', true), index: true }, memberUser: ref('User'), name: String, email: String, phone: String,
  role: { type: String, enum: ['senior_surveyor', 'junior_surveyor', 'field_surveyor', 'survey_assistant', 'gis_specialist', 'drone_operator', 'quantity_surveyor', 'valuation_officer', 'report_reviewer', 'accountant', 'project_manager', 'administrator'], required: true },
  permissions: [String], status: { type: String, enum: ['invited', 'active', 'suspended', 'removed'], default: 'invited', index: true },
  invitedAt: Date, joinedAt: Date, createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);

const SurveyClientSchema = new Schema({
  surveyor: { ...ref('User', true), index: true }, linkedUser: ref('User'),
  name: { type: String, required: true }, type: String, email: String, phone: String,
  address: String, preferredContact: String, status: { type: String, enum: ['lead', 'active', 'inactive', 'blocked'], default: 'lead', index: true },
  properties: [Schema.Types.Mixed], notes: [String], communicationHistory: [{ channel: String, summary: String, at: Date }],
  createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);

SurveyClientSchema.index({ name: 'text', email: 'text', phone: 'text', address: 'text', notes: 'text' }, { name: 'survey_client_search_text', weights: { name: 10, email: 6, phone: 5, address: 3, notes: 2 } });

const SurveyReviewSchema = new Schema({
  project: { ...ref('SurveyProject', true), index: true }, client: { ...ref('User', true), index: true }, surveyor: { ...ref('User', true), index: true },
  ratings: { professionalism: Number, accuracy: Number, communication: Number, timeliness: Number, reportQuality: Number, value: Number, overall: Number },
  comment: String, response: { message: String, respondedAt: Date },
  verifiedJob: { type: Boolean, default: true },
  moderation: { status: { type: String, enum: ['pending', 'published', 'hidden', 'reported', 'disputed'], default: 'pending' }, reason: String, reviewedBy: ref('User') },
  createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);
SurveyReviewSchema.index({ project: 1, client: 1 }, { unique: true });

const SurveyDisputeSchema = new Schema({
  project: { ...ref('SurveyProject', true), index: true }, raisedBy: { ...ref('User', true), index: true }, against: ref('User'),
  category: String, description: String, evidence: [String], requestedResolution: String,
  status: { type: String, enum: ['submitted', 'under_review', 'more_information_required', 'mediation', 'resolved', 'rejected', 'closed'], default: 'submitted', index: true },
  messages: [{ user: ref('User'), message: String, at: Date }], adminNotes: String, finalDecision: String,
  createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);

const SurveyPromotionSchema = new Schema({
  surveyor: { ...ref('User', true), index: true }, service: ref('SurveyService'),
  type: { type: String, enum: ['featured_profile', 'top_placement', 'verified_badge', 'recommended_badge', 'location_promotion', 'category_promotion', 'urgent_badge', 'sponsored_service'], required: true },
  startsAt: Date, endsAt: Date, amount: Number,
  status: { type: String, enum: ['pending', 'active', 'paused', 'expired', 'cancelled'], default: 'pending', index: true },
  metrics: { views: { type: Number, default: 0 }, clicks: { type: Number, default: 0 }, enquiries: { type: Number, default: 0 }, conversions: { type: Number, default: 0 } },
  payment: { transactionId: String, paidAt: Date }, createdBy: ref('User'), updatedBy: ref('User'),
}, timestamps);

export const SurveyorPlan = models.SurveyorPlan || model('SurveyorPlan', SurveyorPlanSchema);
export const SurveyorSubscription = models.SurveyorSubscription || model('SurveyorSubscription', SurveyorSubscriptionSchema);
export const SurveyorVerification = models.SurveyorVerification || model('SurveyorVerification', SurveyorVerificationSchema);
export const SurveyorProfile = models.SurveyorProfile || model('SurveyorProfile', SurveyorProfileSchema);
export const SurveyService = models.SurveyService || model('SurveyService', SurveyServiceSchema);
export const SurveyJob = models.SurveyJob || model('SurveyJob', SurveyJobSchema);
export const SurveyQuotation = models.SurveyQuotation || model('SurveyQuotation', SurveyQuotationSchema);
export const SurveyProject = models.SurveyProject || model('SurveyProject', SurveyProjectSchema);
export const SiteVisit = models.SiteVisit || model('SiteVisit', SiteVisitSchema);
export const FieldData = models.FieldData || model('FieldData', FieldDataSchema);
export const SurveyEquipment = models.SurveyEquipment || model('SurveyEquipment', SurveyEquipmentSchema);
export const SurveyReport = models.SurveyReport || model('SurveyReport', SurveyReportSchema);
export const SurveyTeamMember = models.SurveyTeamMember || model('SurveyTeamMember', SurveyTeamMemberSchema);
export const SurveyClient = models.SurveyClient || model('SurveyClient', SurveyClientSchema);
export const SurveyReview = models.SurveyReview || model('SurveyReview', SurveyReviewSchema);
export const SurveyDispute = models.SurveyDispute || model('SurveyDispute', SurveyDisputeSchema);
export const SurveyPromotion = models.SurveyPromotion || model('SurveyPromotion', SurveyPromotionSchema);
