import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { normalizeEmail, normalizeIndianMobile } from '../utils/identity.js';

const { Schema, model, models } = mongoose;
const objectId = (ref, required = false) => ({ type: Schema.Types.ObjectId, ref, required });
const timestamps = { timestamps: true };

const NearbyPlaceSchema = new Schema({
  name: String,
  distance: String,
  type: { type: String },
}, { _id: false });

const VehicleSchema = new Schema({
  type: { type: String },
  registration: String,
}, { _id: false });

const PetSchema = new Schema({
  type: { type: String },
  count: { type: Number, min: 0, default: 0 },
}, { _id: false });

const UserSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  emailNormalized: { type: String, lowercase: true, trim: true, select: false },
  phone: { type: String, trim: true, index: true, sparse: true },
  phoneNormalized: { type: String, trim: true, select: false },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ['admin', 'manager', 'tenant', 'user', 'surveyor'], default: 'tenant', index: true },
  avatar: String,
  status: { type: String, enum: ['pending_verification', 'active', 'suspended', 'locked'], default: 'active', index: true },
  kycStatus: { type: String, enum: ['not_started', 'incomplete', 'submitted', 'under_review', 'changes_required', 'verified', 'rejected', 'expired', 'suspended', 'pending'], default: 'not_started', index: true },
  region: String,
  country: { type: String, trim: true, maxlength: 120 },
  state: { type: String, trim: true, maxlength: 160 },
  city: { type: String, trim: true, maxlength: 160 },
  assignedProperties: [objectId('Property')],
  customPermissions: [String],
  landlordEnabled: { type: Boolean, default: false, index: true },
  landlordSubscriptionExpiresAt: Date,
  surveyorEnabled: { type: Boolean, default: false, index: true },
  surveyorSubscriptionExpiresAt: Date,
  activeMode: { type: String, enum: ['regular', 'landlord', 'surveyor'], default: 'regular' },
  lastLogin: Date,
  mobileVerifiedAt: Date,
  refreshTokens: [{
    sessionId: { type: String, required: true }, tokenHash: { type: String, required: true }, expiresAt: { type: Date, required: true },
    device: String, ip: String, createdAt: { type: Date, default: Date.now }, lastUsedAt: { type: Date, default: Date.now },
  }],
  twoFactor: {
    enabled: { type: Boolean, default: false },
    secretEncrypted: { type: String, select: false },
    pendingSecretEncrypted: { type: String, select: false },
    backupCodeHashes: { type: [String], select: false, default: undefined },
    enabledAt: Date, lastVerifiedAt: Date,
  },
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpiresAt: { type: Date, select: false },
  otpHash: { type: String, select: false },
  otpExpiresAt: { type: Date, select: false },
  otpPurpose: { type: String, enum: ['registration', 'login', 'password_reset'], select: false },
  otpAttempts: { type: Number, default: 0, select: false },
  otpLastSentAt: { type: Date, select: false },
}, timestamps);
UserSchema.index({ emailNormalized: 1 }, { unique: true, sparse: true, name: 'user_email_normalized_unique' });
UserSchema.index({ phoneNormalized: 1 }, { unique: true, sparse: true, name: 'user_phone_normalized_unique' });
UserSchema.pre('validate', function normalizeIdentityFields() {
  const email = normalizeEmail(this.email);
  if (email) { this.email = email; this.emailNormalized = email; }

  if (this.phone === undefined || this.phone === null || String(this.phone).trim() === '') {
    this.phone = undefined;
    this.phoneNormalized = undefined;
    return;
  }
  const mobile = normalizeIndianMobile(this.phone);
  if (!mobile) {
    this.invalidate('phone', 'Enter a valid 10-digit Indian mobile number');
    return;
  }
  this.phone = mobile;
  this.phoneNormalized = mobile;
});
UserSchema.pre('save', async function next() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});
UserSchema.methods.comparePassword = function comparePassword(candidate) { return bcrypt.compare(candidate, this.password); };
UserSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.password; delete obj.refreshTokens; delete obj.emailNormalized; delete obj.phoneNormalized; delete obj.otpHash; delete obj.otpExpiresAt; delete obj.otpPurpose; delete obj.otpAttempts; delete obj.otpLastSentAt; delete obj.passwordResetTokenHash;
  if (obj.twoFactor) { obj.twoFactorEnabled = Boolean(obj.twoFactor.enabled); delete obj.twoFactor.secretEncrypted; delete obj.twoFactor.pendingSecretEncrypted; delete obj.twoFactor.backupCodeHashes; }
  return obj;
};

const PropertySchema = new Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
  description: { type: String, default: '' },
  type: { type: String, required: true, trim: true, index: true },
  status: { type: String, enum: ['draft', 'pending_approval', 'available', 'partially_occupied', 'occupied', 'reserved', 'rented', 'sold', 'leased', 'maintenance', 'unavailable', 'inactive', 'archived'], default: 'draft', index: true },
  price: { type: Number, default: 0, min: 0 },
  listingType: { type: String, enum: ['rent', 'sale', 'lease'], default: 'rent', index: true },
  isSale: { type: Boolean, default: false },
  visibility: { type: String, enum: ['private', 'public'], default: 'private', index: true },
  publicationStatus: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  publishedAt: Date,
  requiresActiveSubscription: { type: Boolean, default: false, index: true },
  bedrooms: Number, bathrooms: Number, area: Number,
  roomCounts: { rooms: Number, balconies: Number, bathrooms: Number, toilets: Number, kitchens: Number, bedrooms: Number, diningRooms: Number, masterBedrooms: Number, livingRooms: Number },
  listingDetails: { securityDeposit: Number, maintenanceCharge: Number, negotiable: Boolean, furnishing: { type: String, enum: ['unfurnished', 'semi_furnished', 'fully_furnished'] }, parkingSpaces: Number, floor: String, totalFloors: Number, propertyAgeYears: Number, availableFrom: Date, possessionStatus: String, facing: String, petFriendly: Boolean },
  address: { line1: String, line2: String, locality: String, landmark: String, city: { type: String, index: true }, state: String, country: { type: String, default: 'India' }, postalCode: String },
  location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], default: [0, 0] } },
  images: [String], amenities: [String], documents: [objectId('Document')],
  owner: objectId('User'), manager: objectId('User'),
  totalUnits: { type: Number, default: 0 }, occupiedUnits: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false }, isFeatured: { type: Boolean, default: false },
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);

PropertySchema.add({
  referenceNumber: { type: String, unique: true, sparse: true, index: true },
  purpose: { type: String, enum: ['rent', 'sale', 'lease'], default: 'rent', index: true },
  customType: String,
  customAttributes: { type: Schema.Types.Mixed, default: {} },
  hierarchyMode: { type: String, enum: ['simple', 'building', 'apartment_building', 'pg_hostel', 'commercial', 'land'], default: 'simple' },
  pricing: {
    salePrice: Number, monthlyRent: Number, leaseAmount: Number, securityDeposit: Number,
    maintenanceCharge: Number, negotiable: Boolean, pricePerUnitArea: Number, propertyTax: Number,
    additionalCharges: [{ label: String, amount: Number, recurring: Boolean }],
  },
  areas: {
    unit: { type: String, default: 'sqft' }, total: Number, carpet: Number, builtUp: Number,
    superBuiltUp: Number, plot: Number, garden: Number, parking: Number,
  },
  roomDetails: {
    totalApartments: Number, totalRooms: Number, bedrooms: Number, masterBedrooms: Number,
    bathrooms: Number, toilets: Number, kitchens: Number, livingRooms: Number, diningRooms: Number,
    balconies: Number, gardens: Number, swimmingPools: Number, parkingSpaces: Number,
    coveredParking: Number, openParking: Number, storeRooms: Number, utilityRooms: Number,
    servantRooms: Number, studyRooms: Number,
  },
  furnishing: {
    status: { type: String, enum: ['unfurnished', 'semi_furnished', 'fully_furnished'] },
    items: [String], notes: String,
  },
  ageDetails: {
    band: String, constructionYear: Number, renovationYear: Number, possessionDate: Date, availableFrom: Date,
  },
  map: {
    latitude: Number, longitude: Number, googleMapsLocation: String, landmark: String, locality: String, district: String,
    nearbyPlaces: [NearbyPlaceSchema], approximateLatitude: Number, approximateLongitude: Number,
  },
  locationPrivacy: { type: String, enum: ['exact_public', 'approximate_public', 'after_application', 'after_visit_approval', 'selected_users'], default: 'approximate_public' },
  occupancyRules: {
    maxTotal: Number, maxAdults: Number, maxChildren: Number, maxPerRoom: Number,
    familyAllowed: { type: Boolean, default: true }, bachelorsAllowed: Boolean, studentsAllowed: Boolean,
    professionalsAllowed: Boolean, sharedOccupancyAllowed: Boolean, petsAllowed: Boolean,
    additionalOccupantsRequireApproval: { type: Boolean, default: true },
  },
  specifications: {
    bedrooms: Number, bathrooms: Number, balconies: Number, rooms: Number, numberOfFloors: Number,
    floorNumber: Number, totalFloorsInBuilding: Number, facing: String, propertyAge: Number,
    furnishingStatus: { type: String, enum: ['unfurnished', 'semi_furnished', 'fully_furnished'] },
    ownershipType: String, availableFrom: Date, areaUnit: { type: String, default: 'sqft' }, builtUpAreaSqft: Number, builtUpAreaSqm: Number, carpetAreaSqft: Number, carpetAreaSqm: Number,
  },
  parking: { carSpaces: Number, twoWheelerSpaces: Number, visitorParking: Boolean },
  utilities: {
    waterSupply: String, electricityConnection: String, powerBackup: String,
    internetAvailability: Boolean, gasConnection: Boolean, sewageConnection: Boolean,
  },
  amenityDetails: {
    lift: Boolean, security: Boolean, cctv: Boolean, gatedCommunity: Boolean, garden: Boolean,
    swimmingPool: Boolean, gym: Boolean, clubhouse: Boolean, childrenPlayArea: Boolean,
    joggingTrack: Boolean, communityHall: Boolean, terrace: Boolean, balcony: Boolean,
    airConditioning: Boolean, modularKitchen: Boolean, storeRoom: Boolean, servantRoom: Boolean,
    wheelchairAccess: Boolean,
  },
  legalDetails: {
    reraNumber: String, titleClear: Boolean, loanApproved: Boolean,
    occupancyCertificate: Boolean, completionCertificate: Boolean,
  },
  contactInformation: {
    ownerName: String, agentName: String, phoneNumber: String, emailAddress: String,
    preferredContactMethod: { type: String, enum: ['phone', 'email', 'whatsapp', 'phone_or_email'], default: 'phone_or_email' },
  },
  nearbyFacilities: {
    school: String, hospital: String, market: String, busStop: String, railwayStation: String,
    airport: String, shoppingMall: String, park: String, bank: String, pharmacy: String,
  },
  galleryCover: String,
  promotion: {
    featured: Boolean, topListing: Boolean, urgentType: { type: String, enum: ['none', 'urgent_sale', 'urgent_rent', 'immediate_possession', 'available_now', 'price_reduced'], default: 'none' },
    startsAt: Date, endsAt: Date,
  },
  metrics: { views: { type: Number, default: 0 }, clicks: { type: Number, default: 0 }, enquiries: { type: Number, default: 0 }, applications: { type: Number, default: 0 }, siteVisits: { type: Number, default: 0 }, conversions: { type: Number, default: 0 } },
  deletedAt: Date,
});
PropertySchema.index({ title: 'text', description: 'text', code: 'text', amenities: 'text' }, { name: 'property_search_text', weights: { title: 10, code: 8, amenities: 4, description: 2 } });
PropertySchema.index({ location: '2dsphere' });
PropertySchema.index({ visibility: 1, publicationStatus: 1, listingType: 1, status: 1, createdAt: -1 });

const UnitSchema = new Schema({
  property: { ...objectId('Property'), index: true },
  buildingName: String, floor: String,
  unitNumber: { type: String, required: true },
  type: String, bedrooms: Number, bathrooms: Number, area: Number,
  monthlyRent: { type: Number, default: 0 }, securityDeposit: { type: Number, default: 0 },
  status: { type: String, enum: ['vacant', 'occupied', 'reserved', 'maintenance', 'inactive'], default: 'vacant', index: true },
  amenities: [String], meterNumbers: { electricity: String, water: String },
  assignedTenant: objectId('User'),
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);
UnitSchema.index({ property: 1, unitNumber: 1 }, { unique: true });

const TenantSchema = new Schema({
  user: { ...objectId('User', true), index: true },
  property: { ...objectId('Property'), index: true },
  unit: objectId('Unit'),
  status: { type: String, enum: ['applicant', 'active', 'notice', 'moved_out', 'rejected'], default: 'applicant', index: true },
  occupants: [{ name: String, relation: String, phone: String, authorised: Boolean }],
  emergencyContact: { name: String, phone: String, relation: String },
  moveInDate: Date, moveOutDate: Date,
  documents: [objectId('Document')],
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);

const LeaseSchema = new Schema({
  leaseNumber: { type: String, unique: true, sparse: true },
  property: { ...objectId('Property'), index: true }, unit: objectId('Unit'),
  tenant: { ...objectId('User', true), index: true },
  startDate: { type: Date, required: true }, endDate: { type: Date, required: true, index: true },
  monthlyRent: { type: Number, required: true }, securityDeposit: Number,
  escalationPercent: Number, paymentDueDay: { type: Number, default: 1 },
  paymentCycle: { type: String, enum: ['monthly', 'quarterly', 'half_yearly', 'yearly', 'custom'], default: 'monthly' },
  whatsappReminderEnabled: { type: Boolean, default: false },
  legalAgreement: { document: objectId('Document'), agreementNumber: String, signedAt: Date, status: { type: String, enum: ['draft', 'sent', 'signed', 'expired'], default: 'draft' } },
  status: { type: String, enum: ['draft', 'pending_approval', 'active', 'expiring', 'expired', 'terminated', 'renewed'], default: 'draft', index: true },
  signature: { tenantSignedAt: Date, managerSignedAt: Date, tenantSignatureUrl: String, managerSignatureUrl: String },
  documents: [objectId('Document')], clauses: [String],
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);

const SurveySchema = new Schema({
  surveyNumber: { type: String, unique: true, sparse: true }, title: { type: String, required: true },
  property: { ...objectId('Property'), index: true }, unit: objectId('Unit'),
  surveyor: { ...objectId('User'), index: true }, assignedBy: objectId('User'),
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  deadline: Date, startedAt: Date, submittedAt: Date, approvedAt: Date,
  status: { type: String, enum: ['draft', 'assigned', 'in_progress', 'submitted', 'returned', 'approved', 'rejected', 'overdue'], default: 'assigned', index: true },
  template: { name: String, version: String }, responses: Schema.Types.Mixed,
  gps: { lat: Number, lng: Number, accuracy: Number, capturedAt: Date, verified: Boolean },
  photos: [{ url: String, caption: String, lat: Number, lng: Number, capturedAt: Date, watermark: String }],
  signatureUrl: String, notes: String,
  revisions: [{ version: Number, status: String, comment: String, changedBy: objectId('User'), changedAt: { type: Date, default: Date.now } }],
  offlineId: { type: String, sparse: true, index: true }, syncStatus: { type: String, enum: ['synced', 'pending', 'failed'], default: 'synced' },
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);

const ApplicationSchema = new Schema({
  applicationNumber: { type: String, unique: true, sparse: true },
  applicant: { ...objectId('User', true), index: true }, landlord: { ...objectId('User'), index: true }, property: { ...objectId('Property'), index: true }, unit: objectId('Unit'),
  step: { type: Number, min: 1, max: 9, default: 1 },
  status: { type: String, enum: ['draft', 'submitted', 'under_review', 'shortlisted', 'interview_requested', 'interview_scheduled', 'site_visit_scheduled', 'additional_documents_requested', 'documents_pending', 'approved', 'rejected', 'waiting_list', 'withdrawn', 'agreement_pending', 'deposit_pending', 'completed'], default: 'draft', index: true },
  personal: Schema.Types.Mixed, employment: Schema.Types.Mixed, identity: Schema.Types.Mixed,
  documents: [objectId('Document')], feeAmount: Number, paymentStatus: { type: String, enum: ['pending', 'paid', 'waived'], default: 'pending' },
  submittedAt: Date, reviewedBy: objectId('User'), remarks: String,
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);


ApplicationSchema.add({
  targetSpace: objectId('PropertySpace'),
  occupantSummary: { total: Number, adults: Number, children: Number, seniorCitizens: Number, male: Number, female: Number, familyStatus: String },
  occupantIds: [objectId('Occupant')],
  moveInDate: Date, expectedStayMonths: Number, monthlyIncome: Number, rentalBudget: Number,
  vehicles: [VehicleSchema], pets: [PetSchema], references: [{ name: String, phone: String, relation: String }],
  messageToLandlord: String, interviewScore: Number, landlordNotes: String, closedReason: String,
});

const PaymentSchema = new Schema({
  invoiceNumber: { type: String, unique: true, sparse: true },
  payer: { ...objectId('User', true), index: true }, payee: { ...objectId('User'), index: true }, tenant: objectId('Tenant'),
  surveyProject: { ...objectId('SurveyProject'), index: true }, surveyQuotation: objectId('SurveyQuotation'), facilityBooking: { ...objectId('FacilityBooking'), index: true },
  property: { ...objectId('Property'), index: true }, unit: objectId('Unit'), lease: objectId('Lease'), application: objectId('Application'),
  type: { type: String, enum: ['rent', 'lease', 'sale', 'deposit', 'application_fee', 'landlord_subscription', 'surveyor_subscription', 'survey_advance', 'survey_milestone', 'survey_final', 'surveyor_payout', 'platform_commission', 'facility_booking', 'maintenance', 'penalty', 'refund', 'other'], default: 'rent' },
  amount: { type: Number, required: true, min: 0 }, paidAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['draft', 'pending', 'paid', 'partial', 'overdue', 'failed', 'refunded', 'waived'], default: 'pending', index: true },
  dueDate: { type: Date, index: true }, paidAt: Date,
  method: { type: String, enum: ['upi', 'card', 'bank_transfer', 'cash', 'cheque', 'gateway', 'offline'], default: 'offline' },
  transactionId: String, gateway: Schema.Types.Mixed, proofUrl: String, notes: String, taxAmount: Number, discountAmount: Number, travelAmount: Number, platformCommission: Number,
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);
PaymentSchema.index({ transactionId: 1 }, { unique: true, partialFilterExpression: { transactionId: { $type: 'string' } }, name: 'payment_transaction_unique' });
PaymentSchema.index({ payer: 1, status: 1, createdAt: -1 }, { name: 'payment_payer_status_created' });

const ComplaintSchema = new Schema({
  complaintNumber: { type: String, unique: true, sparse: true },
  title: { type: String, required: true }, description: { type: String, required: true },
  raisedBy: { ...objectId('User', true), index: true }, property: { ...objectId('Property'), index: true }, unit: objectId('Unit'),
  category: { type: String, default: 'maintenance' }, priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: { type: String, enum: ['open', 'assigned', 'in_progress', 'awaiting_approval', 'resolved', 'closed', 'reopened'], default: 'open', index: true },
  assignedTo: objectId('User'), vendor: { name: String, phone: String, email: String },
  estimatedCost: Number, approvedCost: Number, slaDueAt: Date,
  attachments: [String], beforePhotos: [String], afterPhotos: [String],
  timeline: [{ status: String, note: String, user: objectId('User'), at: { type: Date, default: Date.now } }],
  tenantConfirmedAt: Date, resolutionNote: String,
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);

ComplaintSchema.index({ title: 'text', description: 'text' }, { name: 'complaint_search_text', weights: { title: 10, description: 2 } });

const ApprovalSchema = new Schema({
  title: { type: String, required: true }, type: { type: String, required: true, index: true },
  requester: { ...objectId('User', true), index: true }, property: objectId('Property'), amount: Number,
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'returned', 'escalated', 'cancelled'], default: 'pending', index: true },
  currentStage: { type: Number, default: 1 }, stages: [{ name: String, approverRole: String, approver: objectId('User'), status: String, comment: String, actedAt: Date }],
  referenceModel: String, referenceId: Schema.Types.ObjectId,
  documents: [objectId('Document')], comments: [{ user: objectId('User'), message: String, at: { type: Date, default: Date.now } }],
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);

const NotificationSchema = new Schema({
  user: { ...objectId('User', true), index: true }, title: String, message: String,
  category: { type: String, enum: ['payment', 'survey', 'complaint', 'lease', 'maintenance', 'system', 'message'], default: 'system' },
  readAt: Date, actionUrl: String, metadata: Schema.Types.Mixed,
}, timestamps);

const NotificationDeliverySchema = new Schema({
  notification: { ...objectId('Notification'), index: true },
  user: { ...objectId('User', true), index: true },
  channel: { type: String, enum: ['email', 'sms', 'whatsapp', 'push'], required: true, index: true },
  destination: String,
  status: { type: String, enum: ['pending', 'processing', 'sent', 'failed', 'skipped'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  providerMessageId: String,
  sentAt: Date,
  nextAttemptAt: { type: Date, index: true },
  lockedAt: { type: Date, index: true },
  lastError: String,
  metadata: { type: Schema.Types.Mixed, default: {} },
}, timestamps);
NotificationDeliverySchema.index({ status: 1, nextAttemptAt: 1 }, { name: 'notification_delivery_queue' });
NotificationDeliverySchema.index({ user: 1, createdAt: -1 }, { name: 'notification_delivery_user_recent' });


const ConversationSchema = new Schema({
  key: { type: String, unique: true, sparse: true, index: true },
  participants: [{ ...objectId('User', true), index: true }],
  title: { type: String, trim: true, maxlength: 180 },
  type: { type: String, enum: ['direct', 'group', 'property', 'complaint', 'survey', 'application', 'support'], default: 'direct', index: true },
  reference: { model: String, id: Schema.Types.ObjectId, label: String },
  createdBy: { ...objectId('User', true), index: true },
  lastMessageAt: { type: Date, index: true },
  lastMessagePreview: String,
  archivedBy: [objectId('User')],
  mutedBy: [objectId('User')],
}, timestamps);
ConversationSchema.index({ participants: 1, lastMessageAt: -1 }, { name: 'conversation_participant_recent' });

const MessageAttachmentSchema = new Schema({
  file: objectId('DriveFile'), name: String, mimeType: String, sizeBytes: Number, legacyUrl: String,
}, { _id: false });
const MessageSchema = new Schema({
  conversation: { ...objectId('Conversation'), index: true },
  conversationId: { type: String, required: true, index: true },
  sender: { ...objectId('User', true), index: true }, recipients: [{ ...objectId('User'), index: true }],
  body: String, attachments: [MessageAttachmentSchema], readBy: [{ user: objectId('User'), readAt: Date }],
  reference: { type: String, id: Schema.Types.ObjectId, label: String },
}, timestamps);

const DocumentSchema = new Schema({
  name: { type: String, required: true }, type: { type: String, default: 'other' }, url: { type: String, required: true }, mimeType: String,
  driveFile: objectId('DriveFile'),
  sizeBytes: Number, owner: { ...objectId('User', true), index: true }, property: objectId('Property'),
  visibility: { type: String, enum: ['private', 'property', 'public'], default: 'private' }, checksum: String,
  uploadedBy: objectId('User'),
}, timestamps);

const AttendanceSchema = new Schema({
  user: { ...objectId('User', true), index: true }, date: { type: String, required: true, index: true },
  checkInAt: Date, checkOutAt: Date, checkInGps: { lat: Number, lng: Number, accuracy: Number }, checkOutGps: { lat: Number, lng: Number, accuracy: Number },
  status: { type: String, enum: ['present', 'late', 'absent', 'field'], default: 'field' }, notes: String,
}, timestamps);
AttendanceSchema.index({ user: 1, date: 1 }, { unique: true });

const SubscriptionSchema = new Schema({
  user: { ...objectId('User', true), index: true },
  plan: { type: String, enum: ['starter', 'professional', 'business', 'enterprise'], required: true, index: true },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  amount: { type: Number, required: true, min: 0 }, currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['pending', 'active', 'expired', 'cancelled', 'failed'], default: 'pending', index: true },
  startsAt: Date, expiresAt: { type: Date, index: true }, cancelledAt: Date,
  limits: { properties: { type: Number, default: 3 }, buildings: { type: Number, default: 1 }, apartments: { type: Number, default: 5 }, rooms: { type: Number, default: 20 }, beds: { type: Number, default: 20 }, publicListings: { type: Number, default: 3 }, activeTenants: { type: Number, default: 20 }, storageMB: { type: Number, default: 5120 }, teamMembers: { type: Number, default: 1 }, rentAutomation: { type: Boolean, default: false }, advancedReports: { type: Boolean, default: false }, promotions: { type: Boolean, default: false }, apiAccess: { type: Boolean, default: false } },
  payment: { method: String, transactionId: String, gateway: String, paidAt: Date, metadata: Schema.Types.Mixed },
  createdBy: objectId('User'), updatedBy: objectId('User'),
}, timestamps);
SubscriptionSchema.index({ user: 1, status: 1, expiresAt: -1 });

const AuditLogSchema = new Schema({
  user: objectId('User'), role: String, action: String, module: String, recordId: Schema.Types.ObjectId,
  ip: String, device: String, previousValue: Schema.Types.Mixed, updatedValue: Schema.Types.Mixed,
}, { timestamps: { createdAt: true, updatedAt: false } });
AuditLogSchema.index({ createdAt: -1, module: 1, user: 1 });

export const User = models.User || model('User', UserSchema);
export const Property = models.Property || model('Property', PropertySchema);
export const Unit = models.Unit || model('Unit', UnitSchema);
export const Tenant = models.Tenant || model('Tenant', TenantSchema);
export const Lease = models.Lease || model('Lease', LeaseSchema);
export const Survey = models.Survey || model('Survey', SurveySchema);
export const Application = models.Application || model('Application', ApplicationSchema);
export const Payment = models.Payment || model('Payment', PaymentSchema);
export const Complaint = models.Complaint || model('Complaint', ComplaintSchema);
export const Approval = models.Approval || model('Approval', ApprovalSchema);
export const Notification = models.Notification || model('Notification', NotificationSchema);
export const NotificationDelivery = models.NotificationDelivery || model('NotificationDelivery', NotificationDeliverySchema);
export const Conversation = models.Conversation || model('Conversation', ConversationSchema);
export const Message = models.Message || model('Message', MessageSchema);
export const Document = models.Document || model('Document', DocumentSchema);
export const Attendance = models.Attendance || model('Attendance', AttendanceSchema);
export const Subscription = models.Subscription || model('Subscription', SubscriptionSchema);
export const AuditLog = models.AuditLog || model('AuditLog', AuditLogSchema);

export * from './surveyor.js';

export * from './drive.js';

export {
  SiteSetting, SeoPage, HomeCarousel, HomeSection, LandlordPlan, PropertyTypeConfig, AreaUnit,
  PropertySpace, PropertyMedia, TenantProfile, TenantKyc, Occupant, TenantInterview, PropertyVisit,
  Tenancy, RentalInvoice, UtilityReading, ReminderRule, PropertyPromotion, SiteEnquiry, Facility, FacilityBooking,
  PlatformModule, ContentPage, NotificationPreference, IntegrationSetting,
} from './propertyManagement.js';
