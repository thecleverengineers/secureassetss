import crypto from 'node:crypto';
import { IntegrationSetting } from '../models/index.js';
import { env } from '../config/env.js';
import { mobileLookup, normalizeIndianMobile } from '../utils/identity.js';

export { mobileLookup, normalizeIndianMobile };

export const FAST2SMS_DEFAULTS = Object.freeze({
  endpoint: 'https://www.fast2sms.com/dev/bulkV2',
  route: 'dlt',
  senderId: 'SECAST',
  messageId: '204251',
  variablesTemplate: '{otp}',
  scheduleTime: '',
});

function encryptionKey() {
  return crypto.createHash('sha256').update(String(env.JWT_REFRESH_SECRET || env.JWT_ACCESS_SECRET)).digest();
}

export function encryptIntegrationSecret(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function buildFast2SmsSettingsUpdate({ enabled, publicConfig = {}, authorization = '', updatedBy } = {}) {
  const normalizedAuthorization = String(authorization || '').trim();
  const set = {
    provider: 'Fast2SMS',
    category: 'sms',
    enabled: Boolean(enabled),
    status: enabled ? 'configured' : 'disabled',
    publicConfig: { ...FAST2SMS_DEFAULTS, ...publicConfig },
    envRequirements: [],
    updatedBy,
    lastError: '',
  };
  if (normalizedAuthorization) {
    set['secureConfig.authorizationEncrypted'] = encryptIntegrationSecret(normalizedAuthorization);
  }
  // The provider identifier is supplied only by the upsert equality filter
  // ({ key: 'fast2sms' }). Never place `key` in both $set and $setOnInsert:
  // MongoDB rejects that update with "Updating the path 'key' would create a
  // conflict at 'key'".
  return { $set: set };
}

export function decryptIntegrationSecret(payload) {
  const value = String(payload || '');
  if (!value) return '';
  const [ivText, tagText, encryptedText] = value.split('.');
  if (!ivText || !tagText || !encryptedText) throw new Error('Stored integration credential is invalid');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
}

export function maskMobile(value) {
  const mobile = normalizeIndianMobile(value);
  return mobile ? `******${mobile.slice(-4)}` : '';
}

export function renderVariableValues(template, { otp, name = '' } = {}) {
  return String(template || '{otp}')
    .replaceAll('{otp}', String(otp || ''))
    .replaceAll('{name}', String(name || '').trim());
}

export function buildFast2SmsUrl(config, { mobile, otp, name }) {
  const endpoint = String(config.endpoint || FAST2SMS_DEFAULTS.endpoint).trim();
  const url = new URL(endpoint);
  const parameters = new URLSearchParams({
    authorization: String(config.authorization || ''),
    route: String(config.route || FAST2SMS_DEFAULTS.route),
    sender_id: String(config.senderId || FAST2SMS_DEFAULTS.senderId),
    message: String(config.messageId || FAST2SMS_DEFAULTS.messageId),
    variables_values: renderVariableValues(config.variablesTemplate || FAST2SMS_DEFAULTS.variablesTemplate, { otp, name }),
    numbers: String(mobile),
    schedule_time: String(config.scheduleTime || ''),
  });
  url.search = parameters.toString();
  return url;
}

export async function getFast2SmsConfiguration({ includeAuthorization = false } = {}) {
  const query = IntegrationSetting.findOne({ key: 'fast2sms' }).select('+secureConfig.authorizationEncrypted');
  const record = await query.lean();
  const publicConfig = { ...FAST2SMS_DEFAULTS, ...(record?.publicConfig || {}) };
  let authorization = '';
  if (includeAuthorization && record?.secureConfig?.authorizationEncrypted) {
    authorization = decryptIntegrationSecret(record.secureConfig.authorizationEncrypted);
  }
  return {
    id: record?._id,
    enabled: Boolean(record?.enabled),
    status: record?.status || 'unconfigured',
    lastCheckedAt: record?.lastCheckedAt || null,
    lastError: record?.lastError || '',
    authorizationConfigured: Boolean(record?.secureConfig?.authorizationEncrypted),
    ...publicConfig,
    ...(includeAuthorization ? { authorization } : {}),
  };
}

async function updateProviderHealth({ ok, error = '' }) {
  try {
    await IntegrationSetting.updateOne(
      { key: 'fast2sms' },
      { $set: { status: ok ? 'healthy' : 'error', lastCheckedAt: new Date(), lastError: error } },
    );
  } catch {
    // OTP delivery result must not be hidden by a secondary status-update failure.
  }
}

export async function sendFast2SmsOtp({ mobile, otp, name = '' }) {
  const normalized = normalizeIndianMobile(mobile);
  if (!normalized) throw new Error('A valid 10-digit Indian mobile number is required');
  const config = await getFast2SmsConfiguration({ includeAuthorization: true });
  if (!config.enabled) throw new Error('Fast2SMS OTP delivery is disabled in the admin panel');
  if (!config.authorization || /\*{3,}/.test(config.authorization)) throw new Error('Fast2SMS authorization key is not configured');
  if (!config.senderId || !config.messageId) throw new Error('Fast2SMS sender ID and DLT message ID are required');

  const url = buildFast2SmsUrl(config, { mobile: normalized, otp, name });
  let response;
  let payload;
  try {
    response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    try { payload = JSON.parse(text); } catch { payload = { message: text }; }
  } catch (error) {
    await updateProviderHealth({ ok: false, error: error.message });
    throw new Error(`Fast2SMS request failed: ${error.message}`);
  }

  const providerRejected = payload?.return === false || String(payload?.return || '').toLowerCase() === 'false';
  const accepted = response.ok && !providerRejected;
  if (!accepted) {
    const reason = payload?.message || payload?.error || `HTTP ${response.status}`;
    await updateProviderHealth({ ok: false, error: String(reason) });
    throw new Error(`Fast2SMS rejected the OTP request: ${reason}`);
  }
  await updateProviderHealth({ ok: true });
  return payload;
}
