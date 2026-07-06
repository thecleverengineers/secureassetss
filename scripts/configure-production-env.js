import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const appDir = path.resolve(process.env.APP_DIR || process.cwd());
const envPath = path.join(appDir, '.env');
const templateCandidates = [
  path.join(appDir, '.env.oneclick.example'),
  path.join(appDir, '.env.production.example'),
  path.join(appDir, '.env.example'),
];

function parseEnv(text) {
  const entries = new Map();
  const order = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!entries.has(key)) order.push(key);
    entries.set(key, value);
  }
  return { entries, order };
}

function serialise({ entries, order }) {
  const seen = new Set();
  const lines = [];
  for (const key of order) {
    if (!entries.has(key) || seen.has(key)) continue;
    seen.add(key);
    lines.push(`${key}=${entries.get(key)}`);
  }
  for (const [key, value] of entries) {
    if (seen.has(key)) continue;
    lines.push(`${key}=${value}`);
  }
  return `${lines.join('\n')}\n`;
}

function randomSecret(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

function isPlaceholder(value = '') {
  return !value || /GENERATE_|CHANGE_THIS|USER:PASSWORD|CLUSTER|example\.com|change-this/i.test(value);
}

let source = '';
if (fs.existsSync(envPath)) {
  source = fs.readFileSync(envPath, 'utf8');
} else {
  const template = templateCandidates.find((candidate) => fs.existsSync(candidate));
  if (!template) throw new Error('No environment template was found.');
  source = fs.readFileSync(template, 'utf8');
}

const config = parseEnv(source);
const set = (key, value, force = false) => {
  if (value === undefined || value === null || value === '') return;
  const current = config.entries.get(key);
  if (force || !current || isPlaceholder(current)) {
    if (!config.entries.has(key)) config.order.push(key);
    config.entries.set(key, String(value));
  }
};

set('NODE_ENV', 'production', true);
set('PORT', process.env.PORT || config.entries.get('PORT') || '5000', true);

const appUrl = process.env.APP_URL || (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : '');
set('CLIENT_URL', process.env.CLIENT_URL || appUrl, Boolean(process.env.CLIENT_URL || appUrl));
set('PUBLIC_APP_URL', process.env.PUBLIC_APP_URL || appUrl, Boolean(process.env.PUBLIC_APP_URL || appUrl));
set('MONGODB_URI', process.env.MONGODB_URI, Boolean(process.env.MONGODB_URI));

// The browser and API are deployed on the same public origin. Always repair
// legacy localhost values unless an explicit external API URL is provided to
// this deployment command. A localhost API base works only on the server and
// causes every real visitor's login/registration request to fail.
set('VITE_API_URL', process.env.VITE_API_URL || '/api/v1', true);

if (isPlaceholder(config.entries.get('JWT_ACCESS_SECRET'))) set('JWT_ACCESS_SECRET', randomSecret(), true);
if (isPlaceholder(config.entries.get('JWT_REFRESH_SECRET'))) set('JWT_REFRESH_SECRET', randomSecret(), true);
if (isPlaceholder(config.entries.get('VAULT_ENCRYPTION_KEY'))) set('VAULT_ENCRYPTION_KEY', randomSecret(), true);

const explicitStorageDriver = process.env.STORAGE_DRIVER;
const existingStorageDriver = config.entries.get('STORAGE_DRIVER');
const storageDriver = explicitStorageDriver || (['local', 's3'].includes(existingStorageDriver) ? existingStorageDriver : 'local');
set('STORAGE_DRIVER', storageDriver, true);

set('VAULT_STORAGE_DIR', process.env.VAULT_STORAGE_DIR || '/var/lib/secureasset/vault', true);
set('VAULT_TEMP_DIR', process.env.VAULT_TEMP_DIR || '/var/lib/secureasset/tmp', true);
set('CMS_ASSET_DIR', process.env.CMS_ASSET_DIR || '/var/lib/secureasset/site-assets', true);
set('LEGACY_PUBLIC_UPLOADS', 'false', true);

for (const key of [
  'S3_REGION', 'S3_BUCKET', 'S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_SESSION_TOKEN', 'S3_FORCE_PATH_STYLE', 'S3_SSE', 'S3_KMS_KEY_ID',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
  'PM2_INSTANCES', 'PM2_MAX_MEMORY', 'RENT_AUTOMATION_CRON', 'VAULT_PURGE_CRON', 'NOTIFICATION_DELIVERY_CRON', 'NOTIFICATION_BATCH_SIZE',
  'SMS_WEBHOOK_URL', 'SMS_WEBHOOK_TOKEN', 'WHATSAPP_WEBHOOK_URL', 'WHATSAPP_WEBHOOK_TOKEN', 'PUSH_WEBHOOK_URL', 'PUSH_WEBHOOK_TOKEN',
  'AUTO_DB_MIGRATIONS', 'AUTO_DB_MIGRATION_LOCK_TTL_MS', 'AUTO_DB_MIGRATION_WAIT_MS', 'AUTO_DB_MIGRATION_POLL_MS', 'SEED_DEMO_RENTAL_DATA',
]) {
  set(key, process.env[key], Boolean(process.env[key]));
}

set('AUTO_DB_MIGRATIONS', config.entries.get('AUTO_DB_MIGRATIONS') || 'true', !config.entries.has('AUTO_DB_MIGRATIONS'));
set('SEED_DEMO_RENTAL_DATA', config.entries.get('SEED_DEMO_RENTAL_DATA') || 'false', !config.entries.has('SEED_DEMO_RENTAL_DATA'));
set('AUTO_DB_MIGRATION_LOCK_TTL_MS', config.entries.get('AUTO_DB_MIGRATION_LOCK_TTL_MS') || '1200000', !config.entries.has('AUTO_DB_MIGRATION_LOCK_TTL_MS'));
set('AUTO_DB_MIGRATION_WAIT_MS', config.entries.get('AUTO_DB_MIGRATION_WAIT_MS') || '1800000', !config.entries.has('AUTO_DB_MIGRATION_WAIT_MS'));
set('AUTO_DB_MIGRATION_POLL_MS', config.entries.get('AUTO_DB_MIGRATION_POLL_MS') || '3000', !config.entries.has('AUTO_DB_MIGRATION_POLL_MS'));

// Older one-click environments did not include every worker schedule. Always
// materialise safe production defaults so upgrades do not fail validation or
// leave PM2 workers with an implicit, undocumented schedule.
set('VAULT_PURGE_CRON', config.entries.get('VAULT_PURGE_CRON') || '17 2 * * *', !config.entries.get('VAULT_PURGE_CRON'));
set('RENT_AUTOMATION_CRON', config.entries.get('RENT_AUTOMATION_CRON') || '7 1 * * *', !config.entries.get('RENT_AUTOMATION_CRON'));
set('NOTIFICATION_DELIVERY_CRON', config.entries.get('NOTIFICATION_DELIVERY_CRON') || '* * * * *', !config.entries.get('NOTIFICATION_DELIVERY_CRON'));
set('NOTIFICATION_BATCH_SIZE', config.entries.get('NOTIFICATION_BATCH_SIZE') || '200', !config.entries.get('NOTIFICATION_BATCH_SIZE'));
set('PM2_MAX_MEMORY', config.entries.get('PM2_MAX_MEMORY') || '1G', !config.entries.get('PM2_MAX_MEMORY'));

if (process.env.CLAMAV_ENABLED !== undefined) set('CLAMAV_ENABLED', process.env.CLAMAV_ENABLED, true);
else if (!config.entries.has('CLAMAV_ENABLED') || isPlaceholder(config.entries.get('CLAMAV_ENABLED'))) set('CLAMAV_ENABLED', 'false', true);

fs.writeFileSync(envPath, serialise(config), { mode: 0o600 });
fs.chmodSync(envPath, 0o600);
console.log(`Production environment prepared: ${envPath}`);
console.log(`Storage driver: ${config.entries.get('STORAGE_DRIVER')}`);
console.log(`Public URL: ${config.entries.get('PUBLIC_APP_URL') || '(missing)'}`);
console.log(`MongoDB: ${isPlaceholder(config.entries.get('MONGODB_URI')) ? '(missing)' : '(configured)'}`);
