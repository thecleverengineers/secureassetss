import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { User, AuditLog, SiteSetting } from '../models/index.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  signAccessToken, signRefreshToken, verifyRefreshToken, hashToken,
  signTwoFactorChallenge, verifyTwoFactorChallenge,
} from '../utils/tokens.js';
import { env } from '../config/env.js';
import { ensurePersonalDrive } from '../services/driveService.js';
import { maskMobile, sendFast2SmsOtp } from '../services/fast2sms.js';
import { identifierDescriptor, normalizeEmail, normalizeIndianMobile } from '../utils/identity.js';
import {
  consumeBackupCode, createOtpAuthUri, decryptTwoFactorSecret, encryptTwoFactorSecret,
  generateBackupCodes, generateTwoFactorSecret, hashBackupCode, verifyTotp,
} from '../services/twoFactor.js';

const passwordRule = z.string().min(8).max(128).refine(
  (value) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value),
  'Password must contain at least 8 characters, uppercase, lowercase and a number',
);
const credentialsSchema = z.object({
  identifier: z.string().min(3).max(160).optional(),
  email: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  password: z.string().min(8).max(128),
}).refine((data) => Boolean(data.identifier || data.email || data.phone), { message: 'Email or mobile number is required' });
const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(160),
  phone: z.string().min(10).max(40),
  password: passwordRule,
});

async function authenticationPolicy() {
  const setting = await SiteSetting.findOne({ key: 'default' }).select('authentication').lean();
  return { allowRegistration: true, allowPasswordLogin: true, allowOtpLogin: true, ...(setting?.authentication || {}) };
}
const avatarPath = z.string().max(2048).refine((value) => /^https:\/\//i.test(value) || /^\/site-assets\/[a-zA-Z0-9/_\-.]+$/.test(value), 'Avatar must be a secure image URL or uploaded profile image');
const profileUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  avatar: avatarPath.optional().nullable(),
  region: z.string().max(240).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  state: z.string().max(160).optional().nullable(),
  city: z.string().max(160).optional().nullable(),
}).strict();

function safeUser(user) {
  const value = user?.toJSON ? user.toJSON() : { ...(user || {}) };
  value.twoFactorEnabled = Boolean(value.twoFactor?.enabled ?? value.twoFactorEnabled);
  delete value.refreshTokens;
  if (value.twoFactor) {
    delete value.twoFactor.secretEncrypted;
    delete value.twoFactor.pendingSecretEncrypted;
    delete value.twoFactor.backupCodeHashes;
  }
  return value;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400000,
    path: '/api/v1/auth',
  };
}

function currentSessionId(req) {
  const token = req.cookies.sa_refresh;
  if (!token) return null;
  try { return verifyRefreshToken(token).sid || null; } catch { return null; }
}

async function audit(req, user, action, updatedValue) {
  await AuditLog.create({ user: user._id, role: user.role, action, module: 'auth', recordId: user._id, updatedValue, ip: req.ip, device: req.get('user-agent') });
}

async function issueSession(user, req, res, { sessionId = crypto.randomUUID() } = {}) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, sessionId);
  const now = new Date();
  user.refreshTokens = (user.refreshTokens || []).filter((item) => item.expiresAt > now && item.sessionId !== sessionId).slice(-9);
  user.refreshTokens.push({
    sessionId,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000),
    device: req.get('user-agent') || 'Unknown device',
    ip: req.ip,
    createdAt: now,
    lastUsedAt: now,
  });
  user.lastLogin = now;
  await user.save({ validateModifiedOnly: true });
  res.cookie('sa_refresh', refreshToken, cookieOptions());
  return { accessToken, user: safeUser(user), expiresIn: env.ACCESS_TOKEN_TTL };
}

function twoFactorChallenge(user) {
  return { requiresTwoFactor: true, challengeToken: signTwoFactorChallenge(user), user: { email: user.email, name: user.name } };
}

async function verifySecondFactor(user, code) {
  const input = String(code || '').trim();
  if (!input) return false;
  if (user.twoFactor?.secretEncrypted) {
    const secret = decryptTwoFactorSecret(user.twoFactor.secretEncrypted);
    if (verifyTotp(secret, input)) return true;
  }
  const consumed = consumeBackupCode(user.twoFactor?.backupCodeHashes || [], input);
  if (consumed.valid) {
    user.twoFactor.backupCodeHashes = consumed.remaining;
    return true;
  }
  return false;
}

function identifierFrom(body) {
  return String(body.identifier || body.email || body.phone || '').trim();
}

function identifierQuery(identifier) {
  return identifierDescriptor(identifier)?.query || null;
}

async function findUserByIdentifier(identifier, select = '') {
  const descriptor = identifierDescriptor(identifier);
  if (!descriptor) return null;
  const request = User.findOne(descriptor.query);
  if (select) request.select(select);
  return request;
}

function generatedOtp() {
  return env.NODE_ENV === 'production' ? String(crypto.randomInt(100000, 1000000)) : env.DEMO_OTP;
}

async function storeAndSendOtp(user, purpose) {
  const mobile = normalizeIndianMobile(user.phone);
  if (!mobile) throw new ApiError(422, 'This account does not have a valid registered mobile number');
  const otp = generatedOtp();
  user.phone = mobile;
  user.otpHash = await bcrypt.hash(otp, 12);
  user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  user.otpPurpose = purpose;
  user.otpAttempts = 0;
  user.otpLastSentAt = new Date();
  await user.save({ validateModifiedOnly: true });
  try {
    await sendFast2SmsOtp({ mobile, otp, name: user.name });
  } catch (error) {
    if (env.NODE_ENV === 'production') throw new ApiError(503, error.message);
    return { otp, delivered: false, warning: error.message };
  }
  return { otp, delivered: true };
}

async function validateStoredOtp(user, otp, purpose) {
  const input = String(otp || '').replace(/\D/g, '');
  const valid = Boolean(
    user?.otpHash && user.otpExpiresAt && user.otpExpiresAt > new Date()
    && user.otpPurpose === purpose && /^\d{6}$/.test(input)
    && await bcrypt.compare(input, user.otpHash)
  );
  if (valid) return true;
  if (user) {
    user.otpAttempts = Number(user.otpAttempts || 0) + 1;
    if (user.otpAttempts >= 5) {
      user.otpHash = undefined; user.otpExpiresAt = undefined; user.otpPurpose = undefined;
    }
    await user.save({ validateModifiedOnly: true });
  }
  return false;
}

function clearOtp(user) {
  user.otpHash = undefined;
  user.otpExpiresAt = undefined;
  user.otpPurpose = undefined;
  user.otpAttempts = 0;
  user.otpLastSentAt = undefined;
}

export const register = asyncHandler(async (req, res) => {
  if (!(await authenticationPolicy()).allowRegistration) throw new ApiError(403, 'New registrations are currently disabled');
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid registration data', parsed.error.flatten());
  const email = normalizeEmail(parsed.data.email);
  const phone = normalizeIndianMobile(parsed.data.phone);
  if (!phone) throw new ApiError(422, 'Enter a valid 10-digit Indian mobile number');

  const [emailUser, phoneUser] = await Promise.all([
    User.findOne(identifierDescriptor(email).query).select('+password +otpHash +otpExpiresAt +otpPurpose +otpAttempts +otpLastSentAt'),
    User.findOne(identifierDescriptor(phone).query).select('+password +otpHash +otpExpiresAt +otpPurpose +otpAttempts +otpLastSentAt'),
  ]);
  if (emailUser && emailUser.status !== 'pending_verification') throw new ApiError(409, 'An account already exists with this email');
  if (phoneUser && phoneUser.status !== 'pending_verification') throw new ApiError(409, 'An account already exists with this mobile number');
  if (emailUser && phoneUser && String(emailUser._id) !== String(phoneUser._id)) throw new ApiError(409, 'Email and mobile number belong to different pending registrations');

  const user = emailUser || phoneUser || new User();
  user.name = parsed.data.name;
  user.email = email;
  user.phone = phone;
  user.password = parsed.data.password;
  user.role = 'tenant';
  user.status = 'pending_verification';
  user.mobileVerifiedAt = undefined;
  user.refreshTokens = [];
  const delivery = await storeAndSendOtp(user, 'registration');
  res.status(202).json({
    success: true,
    data: { requiresOtpVerification: true, identifier: phone, maskedMobile: maskMobile(phone) },
    message: `Verification OTP sent to ${maskMobile(phone)}`,
    ...(env.NODE_ENV !== 'production' && { developmentOtp: delivery.otp, deliveryWarning: delivery.warning }),
  });
});

export const verifyRegistration = asyncHandler(async (req, res) => {
  const phone = normalizeIndianMobile(req.body.phone || req.body.identifier);
  if (!phone) throw new ApiError(422, 'Enter the mobile number used during registration');
  const user = await User.findOne({ $and: [identifierDescriptor(phone).query, { status: 'pending_verification' }] })
    .select('+otpHash +otpExpiresAt +otpPurpose +otpAttempts +otpLastSentAt +refreshTokens');
  if (!user || !(await validateStoredOtp(user, req.body.otp, 'registration'))) throw new ApiError(401, 'OTP is invalid or expired');
  clearOtp(user);
  user.phone = phone;
  user.mobileVerifiedAt = new Date();
  user.status = 'active';
  await user.save({ validateModifiedOnly: true });
  await ensurePersonalDrive(user._id);
  const session = await issueSession(user, req, res);
  await audit(req, user, 'account:registered_mobile_verified');
  res.status(201).json({ success: true, data: session, message: 'Mobile verified and account created' });
});

export const resendRegistrationOtp = asyncHandler(async (req, res) => {
  const phone = normalizeIndianMobile(req.body.phone || req.body.identifier);
  if (!phone) throw new ApiError(422, 'Enter the mobile number used during registration');
  const user = await User.findOne({ $and: [identifierDescriptor(phone).query, { status: 'pending_verification' }] })
    .select('+otpHash +otpExpiresAt +otpPurpose +otpAttempts +otpLastSentAt');
  if (!user) return res.json({ success: true, message: 'If the pending account exists, a verification OTP has been sent' });
  const delivery = await storeAndSendOtp(user, 'registration');
  res.json({ success: true, message: `Verification OTP sent to ${maskMobile(user.phone)}`, ...(env.NODE_ENV !== 'production' && { developmentOtp: delivery.otp, deliveryWarning: delivery.warning }) });
});

export const login = asyncHandler(async (req, res) => {
  if (!(await authenticationPolicy()).allowPasswordLogin) throw new ApiError(403, 'Password login is currently disabled');
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Enter a valid email/mobile number and password');
  const identifier = parsed.data.identifier || parsed.data.email || parsed.data.phone;
  const user = await findUserByIdentifier(identifier, '+password +refreshTokens +twoFactor.secretEncrypted +twoFactor.backupCodeHashes');
  if (!user || !(await user.comparePassword(parsed.data.password))) throw new ApiError(401, 'Invalid email/mobile number or password');
  if (user.status === 'pending_verification') throw new ApiError(403, 'Verify your mobile number before signing in');
  if (user.status !== 'active') throw new ApiError(403, `Account is ${user.status}`);
  if (user.twoFactor?.enabled) return res.json({ success: true, data: twoFactorChallenge(user) });
  const session = await issueSession(user, req, res);
  await audit(req, user, 'login');
  res.json({ success: true, data: session });
});

export const completeTwoFactorLogin = asyncHandler(async (req, res) => {
  let payload;
  try { payload = verifyTwoFactorChallenge(String(req.body.challengeToken || '')); } catch { throw new ApiError(401, 'Two-factor challenge is invalid or expired'); }
  const user = await User.findById(payload.sub).select('+refreshTokens +twoFactor.secretEncrypted +twoFactor.backupCodeHashes');
  if (!user || user.status !== 'active' || !user.twoFactor?.enabled) throw new ApiError(401, 'Two-factor challenge is no longer valid');
  if (!(await verifySecondFactor(user, req.body.code))) throw new ApiError(401, 'Authenticator or backup code is invalid');
  user.twoFactor.lastVerifiedAt = new Date();
  const session = await issueSession(user, req, res);
  await audit(req, user, 'login:two_factor_verified');
  res.json({ success: true, data: session });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies.sa_refresh;
  if (!token) throw new ApiError(401, 'Refresh token missing');
  let payload;
  try { payload = verifyRefreshToken(token); } catch { throw new ApiError(401, 'Refresh token is invalid or expired'); }
  const user = await User.findById(payload.sub).select('+refreshTokens');
  const tokenHash = hashToken(token);
  const stored = user?.refreshTokens?.find((item) => item.tokenHash === tokenHash && item.expiresAt > new Date() && (!payload.sid || item.sessionId === payload.sid));
  if (!user || user.status !== 'active' || !stored) throw new ApiError(401, 'Refresh session is no longer valid');
  user.refreshTokens = user.refreshTokens.filter((item) => item.tokenHash !== tokenHash);
  const session = await issueSession(user, req, res, { sessionId: stored.sessionId || payload.sid || crypto.randomUUID() });
  res.json({ success: true, data: session });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies.sa_refresh;
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      const user = await User.findById(payload.sub).select('+refreshTokens');
      if (user) {
        user.refreshTokens = user.refreshTokens.filter((item) => item.tokenHash !== hashToken(token));
        await user.save({ validateModifiedOnly: true });
      }
    } catch { /* Invalid cookies are still cleared. */ }
  }
  res.clearCookie('sa_refresh', { path: '/api/v1/auth' });
  res.json({ success: true, message: 'Logged out' });
});

export const me = asyncHandler(async (req, res) => res.json({ success: true, data: safeUser(req.user) }));

export const updateMe = asyncHandler(async (req, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid profile information', parsed.error.flatten());
  const previous = { name: req.user.name, avatar: req.user.avatar, region: req.user.region, country: req.user.country, state: req.user.state, city: req.user.city };
  Object.assign(req.user, parsed.data);
  if (parsed.data.country !== undefined || parsed.data.state !== undefined || parsed.data.city !== undefined) {
    req.user.region = [req.user.city, req.user.state, req.user.country].filter(Boolean).join(', ');
  }
  await req.user.save({ validateModifiedOnly: true });
  await AuditLog.create({ user: req.user._id, role: req.user.role, action: 'profile:updated', module: 'auth', recordId: req.user._id, previousValue: previous, updatedValue: parsed.data, ip: req.ip, device: req.get('user-agent') });
  res.json({ success: true, data: safeUser(req.user), message: 'Profile updated' });
});

export const changePassword = asyncHandler(async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (!passwordRule.safeParse(newPassword).success) throw new ApiError(422, 'New password must contain at least 8 characters, uppercase, lowercase and a number');
  const user = await User.findById(req.user._id).select('+password +refreshTokens');
  if (!user || !(await user.comparePassword(currentPassword))) throw new ApiError(401, 'Current password is incorrect');
  user.password = newPassword;
  const keepSessionId = currentSessionId(req);
  user.refreshTokens = (user.refreshTokens || []).filter((item) => item.sessionId === keepSessionId);
  await user.save();
  await audit(req, user, 'password:changed');
  res.json({ success: true, message: 'Password changed. Other sessions were signed out.' });
});

export const sendOtp = asyncHandler(async (req, res) => {
  if (!(await authenticationPolicy()).allowOtpLogin) throw new ApiError(403, 'OTP login is currently disabled');
  const identifier = identifierFrom(req.body);
  if (!identifierQuery(identifier)) throw new ApiError(422, 'Enter a valid email address or Indian mobile number');
  const user = await findUserByIdentifier(identifier, '+otpHash +otpExpiresAt +otpPurpose +otpAttempts +otpLastSentAt');
  if (!user || user.status !== 'active') return res.json({ success: true, message: 'If the account exists, an OTP has been sent to its registered mobile' });
  const delivery = await storeAndSendOtp(user, 'login');
  res.json({ success: true, message: `OTP sent to ${maskMobile(user.phone)}`, data: { maskedMobile: maskMobile(user.phone) }, ...(env.NODE_ENV !== 'production' && { developmentOtp: delivery.otp, deliveryWarning: delivery.warning }) });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const identifier = identifierFrom(req.body);
  const user = await findUserByIdentifier(identifier, '+otpHash +otpExpiresAt +otpPurpose +otpAttempts +otpLastSentAt +refreshTokens +twoFactor.secretEncrypted +twoFactor.backupCodeHashes');
  if (!user || user.status !== 'active' || !(await validateStoredOtp(user, req.body.otp, 'login'))) throw new ApiError(401, 'OTP is invalid or expired');
  clearOtp(user);
  await user.save({ validateModifiedOnly: true });
  if (user.twoFactor?.enabled) return res.json({ success: true, data: twoFactorChallenge(user) });
  const session = await issueSession(user, req, res);
  await audit(req, user, 'login:otp');
  res.json({ success: true, data: session });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const identifier = identifierFrom(req.body);
  if (!identifierQuery(identifier)) throw new ApiError(422, 'Enter a valid registered email address or mobile number');
  const user = await findUserByIdentifier(identifier, '+otpHash +otpExpiresAt +otpPurpose +otpAttempts +otpLastSentAt');
  if (!user || user.status !== 'active') return res.json({ success: true, message: 'If the account exists, a password reset OTP has been sent to its registered mobile' });
  const delivery = await storeAndSendOtp(user, 'password_reset');
  res.json({ success: true, message: `Password reset OTP sent to ${maskMobile(user.phone)}`, data: { maskedMobile: maskMobile(user.phone) }, ...(env.NODE_ENV !== 'production' && { developmentOtp: delivery.otp, deliveryWarning: delivery.warning }) });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const identifier = identifierFrom(req.body);
  const password = String(req.body.password || '');
  if (!identifierQuery(identifier)) throw new ApiError(422, 'Enter the registered email address or mobile number');
  if (!passwordRule.safeParse(password).success) throw new ApiError(422, 'Password must contain at least 8 characters, uppercase, lowercase and a number');
  const user = await findUserByIdentifier(identifier, '+password +otpHash +otpExpiresAt +otpPurpose +otpAttempts +otpLastSentAt +refreshTokens');
  if (!user || user.status !== 'active' || !(await validateStoredOtp(user, req.body.otp, 'password_reset'))) throw new ApiError(401, 'OTP is invalid or expired');
  user.password = password;
  user.refreshTokens = [];
  clearOtp(user);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();
  await audit(req, user, 'password:reset_mobile_otp');
  res.clearCookie('sa_refresh', { path: '/api/v1/auth' });
  res.json({ success: true, message: 'Password reset successfully. Sign in with your new password.' });
});

export const getSecurityOverview = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+refreshTokens');
  const current = currentSessionId(req);
  const sessions = (user.refreshTokens || []).filter((item) => item.expiresAt > new Date()).map((item) => ({
    id: item.sessionId, device: item.device || 'Unknown device', ip: item.ip || '', createdAt: item.createdAt,
    lastUsedAt: item.lastUsedAt, expiresAt: item.expiresAt, current: item.sessionId === current,
  })).sort((a, b) => new Date(b.lastUsedAt || b.createdAt).getTime() - new Date(a.lastUsedAt || a.createdAt).getTime());
  res.json({ success: true, data: { twoFactorEnabled: Boolean(user.twoFactor?.enabled), sessions } });
});

export const beginTwoFactorSetup = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+twoFactor.pendingSecretEncrypted');
  if (user.twoFactor?.enabled) throw new ApiError(409, 'Two-factor authentication is already enabled');
  const secret = generateTwoFactorSecret();
  user.twoFactor ||= {}; user.twoFactor.pendingSecretEncrypted = encryptTwoFactorSecret(secret);
  await user.save({ validateModifiedOnly: true });
  res.json({ success: true, data: { secret, otpauthUri: createOtpAuthUri({ secret, email: user.email, issuer: 'SecureAsset' }) } });
});

export const enableTwoFactor = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password +twoFactor.pendingSecretEncrypted +twoFactor.secretEncrypted +twoFactor.backupCodeHashes');
  if (!user || !(await user.comparePassword(String(req.body.password || '')))) throw new ApiError(401, 'Password is incorrect');
  if (!user.twoFactor?.pendingSecretEncrypted) throw new ApiError(409, 'Start two-factor setup first');
  const secret = decryptTwoFactorSecret(user.twoFactor.pendingSecretEncrypted);
  if (!verifyTotp(secret, req.body.code)) throw new ApiError(422, 'Authenticator code is invalid');
  const backupCodes = generateBackupCodes();
  user.twoFactor.secretEncrypted = encryptTwoFactorSecret(secret); user.twoFactor.pendingSecretEncrypted = undefined;
  user.twoFactor.backupCodeHashes = backupCodes.map(hashBackupCode); user.twoFactor.enabled = true; user.twoFactor.enabledAt = new Date(); user.twoFactor.lastVerifiedAt = new Date();
  await user.save({ validateModifiedOnly: true }); await audit(req, user, 'two_factor:enabled');
  res.json({ success: true, data: { backupCodes }, message: 'Two-factor authentication enabled. Store the backup codes securely.' });
});

export const disableTwoFactor = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password +twoFactor.secretEncrypted +twoFactor.backupCodeHashes');
  if (!user || !(await user.comparePassword(String(req.body.password || '')))) throw new ApiError(401, 'Password is incorrect');
  if (!user.twoFactor?.enabled) throw new ApiError(409, 'Two-factor authentication is not enabled');
  if (!(await verifySecondFactor(user, req.body.code))) throw new ApiError(401, 'Authenticator or backup code is invalid');
  user.twoFactor = { enabled: false }; await user.save({ validateModifiedOnly: true }); await audit(req, user, 'two_factor:disabled');
  res.json({ success: true, message: 'Two-factor authentication disabled' });
});

export const regenerateBackupCodes = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password +twoFactor.secretEncrypted +twoFactor.backupCodeHashes');
  if (!user?.twoFactor?.enabled) throw new ApiError(409, 'Two-factor authentication is not enabled');
  if (!(await user.comparePassword(String(req.body.password || ''))) || !(await verifySecondFactor(user, req.body.code))) throw new ApiError(401, 'Password or authenticator code is invalid');
  const backupCodes = generateBackupCodes(); user.twoFactor.backupCodeHashes = backupCodes.map(hashBackupCode); await user.save({ validateModifiedOnly: true });
  await audit(req, user, 'two_factor:backup_codes_regenerated');
  res.json({ success: true, data: { backupCodes } });
});

export const revokeSession = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+refreshTokens');
  const before = user.refreshTokens.length; user.refreshTokens = user.refreshTokens.filter((item) => item.sessionId !== req.params.sessionId);
  if (user.refreshTokens.length === before) throw new ApiError(404, 'Session not found');
  await user.save({ validateModifiedOnly: true });
  if (req.params.sessionId === currentSessionId(req)) res.clearCookie('sa_refresh', { path: '/api/v1/auth' });
  await audit(req, user, 'session:revoked', { sessionId: req.params.sessionId });
  res.json({ success: true, message: 'Session revoked' });
});

export const revokeOtherSessions = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password +refreshTokens');
  if (!user || !(await user.comparePassword(String(req.body.password || '')))) throw new ApiError(401, 'Password is incorrect');
  const current = currentSessionId(req); user.refreshTokens = (user.refreshTokens || []).filter((item) => item.sessionId === current);
  await user.save({ validateModifiedOnly: true }); await audit(req, user, 'sessions:others_revoked');
  res.json({ success: true, message: 'All other sessions were signed out' });
});
