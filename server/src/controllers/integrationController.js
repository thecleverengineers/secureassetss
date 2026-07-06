import { z } from 'zod';
import { IntegrationSetting, AuditLog } from '../models/index.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  buildFast2SmsSettingsUpdate, getFast2SmsConfiguration,
  normalizeIndianMobile, sendFast2SmsOtp,
} from '../services/fast2sms.js';

const settingsSchema = z.object({
  enabled: z.boolean(),
  endpoint: z.string().url(),
  route: z.string().min(1).max(30),
  senderId: z.string().min(1).max(20),
  messageId: z.string().min(1).max(80),
  variablesTemplate: z.string().max(500).default('{otp}'),
  scheduleTime: z.string().max(80).optional().default(''),
  authorization: z.string().max(500).optional(),
}).strict();

export const getFast2SmsSettings = asyncHandler(async (_req, res) => {
  const settings = await getFast2SmsConfiguration();
  res.json({ success: true, data: settings });
});

export const updateFast2SmsSettings = asyncHandler(async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid Fast2SMS configuration', parsed.error.flatten());
  const { authorization, enabled, ...publicConfig } = parsed.data;
  const existing = await IntegrationSetting.findOne({ key: 'fast2sms' }).select('+secureConfig.authorizationEncrypted').lean();
  if (authorization && /\*{3,}/.test(authorization)) throw new ApiError(422, 'Enter the complete Fast2SMS authorization key, not a masked value');
  if (enabled && !authorization?.trim() && !existing?.secureConfig?.authorizationEncrypted) throw new ApiError(422, 'Configure the Fast2SMS authorization key before enabling OTP delivery');
  const update = buildFast2SmsSettingsUpdate({
    enabled,
    publicConfig,
    authorization,
    updatedBy: req.user._id,
  });
  const record = await IntegrationSetting.findOneAndUpdate(
    { key: 'fast2sms' },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, context: 'query' },
  );
  await AuditLog.create({ user: req.user._id, role: req.user.role, action: 'integration:fast2sms_updated', module: 'integrations', recordId: record._id, updatedValue: { enabled, ...publicConfig, authorizationChanged: Boolean(authorization?.trim()) }, ip: req.ip, device: req.get('user-agent') });
  res.json({ success: true, data: await getFast2SmsConfiguration(), message: 'Fast2SMS configuration saved' });
});

export const testFast2SmsSettings = asyncHandler(async (req, res) => {
  const mobile = normalizeIndianMobile(req.body.mobile);
  if (!mobile) throw new ApiError(422, 'Enter a valid 10-digit Indian mobile number');
  const otp = String(req.body.otp || '123456').replace(/\D/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(otp)) throw new ApiError(422, 'Test OTP must contain six digits');
  await sendFast2SmsOtp({ mobile, otp, name: req.user.name });
  res.json({ success: true, message: `Test OTP sent to ******${mobile.slice(-4)}` });
});
