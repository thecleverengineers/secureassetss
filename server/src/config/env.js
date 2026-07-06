import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

function numberValue(name, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, integer = false } = {}) {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`);
  }
  return value;
}

function boolValue(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (['true', '1', 'yes', 'on'].includes(raw.toLowerCase())) return true;
  if (['false', '0', 'no', 'off'].includes(raw.toLowerCase())) return false;
  throw new Error(`${name} must be true or false`);
}

function absoluteOrResolved(value, fallback) {
  return path.resolve(value || fallback);
}

const clientOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

export const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: numberValue('PORT', 5000, { min: 1, max: 65535, integer: true }),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/secureasset',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'change-this-access-secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret',
  ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL || '15m',
  REFRESH_TOKEN_TTL_DAYS: numberValue('REFRESH_TOKEN_TTL_DAYS', 30, { min: 1, max: 365, integer: true }),
  CLIENT_URL: clientOrigins.join(','),
  CLIENT_ORIGINS: clientOrigins,
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || clientOrigins[0] || 'http://localhost:5173',
  UPLOAD_DIR: absoluteOrResolved(process.env.UPLOAD_DIR, 'server/src/uploads'),
  MAX_FILE_MB: numberValue('MAX_FILE_MB', 10, { min: 1, max: 1024 }),
  LEGACY_PUBLIC_UPLOADS: boolValue('LEGACY_PUBLIC_UPLOADS', false),
  CMS_ASSET_DIR: absoluteOrResolved(process.env.CMS_ASSET_DIR, 'storage/site-assets'),
  DEMO_OTP: process.env.DEMO_OTP || '123456',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: numberValue('SMTP_PORT', 587, { min: 1, max: 65535, integer: true }),
  SMTP_SECURE: boolValue('SMTP_SECURE', Number(process.env.SMTP_PORT || 587) === 465),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'SecureAsset <no-reply@secureasset.local>',
  STORAGE_DRIVER: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
  VAULT_STORAGE_DIR: absoluteOrResolved(process.env.VAULT_STORAGE_DIR, 'storage/vault'),
  VAULT_ENCRYPTION_KEY: process.env.VAULT_ENCRYPTION_KEY || '',
  VAULT_TEMP_DIR: absoluteOrResolved(process.env.VAULT_TEMP_DIR, 'storage/tmp'),
  VAULT_MAX_FILE_MB: numberValue('VAULT_MAX_FILE_MB', 250, { min: 1, max: 10240 }),
  VAULT_CHUNK_MB: numberValue('VAULT_CHUNK_MB', 12, { min: 1, max: 250 }),
  VAULT_ALLOWED_EXTENSIONS: process.env.VAULT_ALLOWED_EXTENSIONS || '.pdf,.doc,.docx,.txt,.rtf,.odt,.xls,.xlsx,.csv,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.gif,.svg,.tiff,.heic,.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.m4a,.aac,.dxf,.dwg,.kml,.kmz,.geojson,.zip,.rar,.7z',
  TRASH_RETENTION_DAYS: numberValue('TRASH_RETENTION_DAYS', 60, { min: 1, max: 3650, integer: true }),
  CLAMAV_ENABLED: boolValue('CLAMAV_ENABLED', false),
  CLAMAV_COMMAND: process.env.CLAMAV_COMMAND || 'clamdscan',
  S3_REGION: process.env.S3_REGION || 'ap-south-1',
  S3_BUCKET: process.env.S3_BUCKET || '',
  S3_ENDPOINT: process.env.S3_ENDPOINT || '',
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || '',
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || '',
  S3_SESSION_TOKEN: process.env.S3_SESSION_TOKEN || '',
  S3_FORCE_PATH_STYLE: boolValue('S3_FORCE_PATH_STYLE', Boolean(process.env.S3_ENDPOINT)),
  S3_SSE: process.env.S3_SSE || 'AES256',
  S3_KMS_KEY_ID: process.env.S3_KMS_KEY_ID || '',
  VAULT_PURGE_CRON: process.env.VAULT_PURGE_CRON || '17 2 * * *',
  RENT_AUTOMATION_CRON: process.env.RENT_AUTOMATION_CRON || '7 1 * * *',
  NOTIFICATION_DELIVERY_CRON: process.env.NOTIFICATION_DELIVERY_CRON || '* * * * *',
  NOTIFICATION_BATCH_SIZE: numberValue('NOTIFICATION_BATCH_SIZE', 200, { min: 1, max: 2000, integer: true }),
  SMS_WEBHOOK_URL: process.env.SMS_WEBHOOK_URL || '',
  SMS_WEBHOOK_TOKEN: process.env.SMS_WEBHOOK_TOKEN || '',
  WHATSAPP_WEBHOOK_URL: process.env.WHATSAPP_WEBHOOK_URL || '',
  WHATSAPP_WEBHOOK_TOKEN: process.env.WHATSAPP_WEBHOOK_TOKEN || '',
  PUSH_WEBHOOK_URL: process.env.PUSH_WEBHOOK_URL || '',
  PUSH_WEBHOOK_TOKEN: process.env.PUSH_WEBHOOK_TOKEN || '',
  SURVEY_PLATFORM_COMMISSION_PERCENT: numberValue('SURVEY_PLATFORM_COMMISSION_PERCENT', 5, { min: 0, max: 100 }),
  JWT_ISSUER: process.env.JWT_ISSUER || 'secureasset-api',
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || 'secureasset-web',
  PAYMENT_AUTO_APPROVE: boolValue('PAYMENT_AUTO_APPROVE', process.env.NODE_ENV !== 'production'),
});

if (env.NODE_ENV === 'production') {
  const weak = ['change-this-access-secret', 'change-this-refresh-secret'];
  if (weak.includes(env.JWT_ACCESS_SECRET) || env.JWT_ACCESS_SECRET.length < 64) throw new Error('JWT_ACCESS_SECRET must contain at least 64 characters in production');
  if (weak.includes(env.JWT_REFRESH_SECRET) || env.JWT_REFRESH_SECRET.length < 64) throw new Error('JWT_REFRESH_SECRET must contain at least 64 characters in production');
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) throw new Error('JWT access and refresh secrets must be different');
  if (env.PAYMENT_AUTO_APPROVE) throw new Error('PAYMENT_AUTO_APPROVE must be false in production');
  if (!['local', 's3'].includes(env.STORAGE_DRIVER)) throw new Error('STORAGE_DRIVER must be local or s3');
  if (env.STORAGE_DRIVER === 's3' && !env.S3_BUCKET) throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3');
  const hasAccessKey = Boolean(env.S3_ACCESS_KEY_ID);
  const hasSecretKey = Boolean(env.S3_SECRET_ACCESS_KEY);
  if (hasAccessKey !== hasSecretKey) throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must either both be configured or both be empty');
  if (env.S3_SSE === 'aws:kms' && !env.S3_KMS_KEY_ID) throw new Error('S3_KMS_KEY_ID is required when S3_SSE=aws:kms');
  if (env.STORAGE_DRIVER === 'local' && env.VAULT_ENCRYPTION_KEY.length < 64) throw new Error('VAULT_ENCRYPTION_KEY must contain at least 64 characters for production local storage');
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASS)) throw new Error('SMTP_USER and SMTP_PASS must either both be configured or both be empty');
  for (const [name, value] of [['SMS_WEBHOOK_URL', env.SMS_WEBHOOK_URL], ['WHATSAPP_WEBHOOK_URL', env.WHATSAPP_WEBHOOK_URL], ['PUSH_WEBHOOK_URL', env.PUSH_WEBHOOK_URL]]) {
    if (!value) continue;
    try { new URL(value); } catch { throw new Error(`${name} must contain a valid absolute URL`); }
  }
  for (const [name, value] of [['CLIENT_URL', env.CLIENT_ORIGINS[0]], ['PUBLIC_APP_URL', env.PUBLIC_APP_URL]]) {
    try { new URL(value); } catch { throw new Error(`${name} must contain a valid absolute URL`); }
  }
}
