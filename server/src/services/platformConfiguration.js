import { ContentPage, HomeSection, PlatformModule, IntegrationSetting, SiteSetting } from '../models/index.js';
import { DEFAULT_CONTENT_PAGES, DEFAULT_HOME_SECTIONS, DEFAULT_PLATFORM_MODULES } from './platformDefaults.js';

let bootstrapPromise;

export async function ensurePlatformConfiguration() {
  if (!bootstrapPromise) bootstrapPromise = (async () => {
    for (const module of DEFAULT_PLATFORM_MODULES) {
      await PlatformModule.updateOne(
        { key: module.key, scope: module.scope },
        { $setOnInsert: module },
        { upsert: true },
      );
      if (module.scope === 'app' && module.metadata?.adminWorkspaceManaged) {
        await PlatformModule.updateOne(
          { key: module.key, scope: module.scope },
          { $set: { label: module.label, description: module.description || '', path: module.path, icon: module.icon, kind: module.kind, section: module.section, sectionOrder: module.sectionOrder ?? 0, sortOrder: module.sortOrder ?? 0, mobilePrimary: Boolean(module.mobilePrimary), metadata: module.metadata } },
        );
      }
      if (module.scope === 'app') {
        await PlatformModule.updateOne(
          { key: module.key, scope: module.scope, accessRules: { $exists: false } },
          { $set: { accessRules: module.accessRules } },
        );
      }
      await PlatformModule.updateOne(
        { key: module.key, scope: module.scope, sectionOrder: { $exists: false } },
        { $set: { sectionOrder: module.sectionOrder ?? 0 } },
      );
    }
    await Promise.all(DEFAULT_CONTENT_PAGES.map((page) => ContentPage.updateOne(
      { path: page.path },
      { $setOnInsert: page },
      { upsert: true },
    )));
    await Promise.all(DEFAULT_HOME_SECTIONS.map((section) => HomeSection.updateOne(
      { key: section.key },
      { $setOnInsert: section },
      { upsert: true },
    )));
    const integrations = [
      ['mongodb', 'MongoDB', 'other', ['MONGODB_URI']],
      ['s3', 'Amazon S3 / S3-compatible storage', 'storage', ['S3_BUCKET', 'S3_REGION']],
      ['smtp', 'SMTP email', 'email', ['SMTP_HOST', 'SMTP_FROM']],
      ['fast2sms', 'Fast2SMS', 'sms', []],
      ['clamav', 'ClamAV malware scanner', 'other', ['CLAMAV_COMMAND']],
      ['maps', 'Map provider', 'maps', []],
      ['payments', 'Payment gateway', 'payment', []],
    ];
    await Promise.all(integrations.map(([key, provider, category, envRequirements]) => IntegrationSetting.updateOne(
      { key }, { $setOnInsert: { key, provider, category, envRequirements, enabled: false, status: 'unconfigured' } }, { upsert: true },
    )));
    await IntegrationSetting.updateOne(
      { key: 'fast2sms' },
      { $setOnInsert: { publicConfig: { endpoint: 'https://www.fast2sms.com/dev/bulkV2', route: 'dlt', senderId: 'SECAST', messageId: '204251', variablesTemplate: '{otp}', scheduleTime: '' } } },
      { upsert: true },
    );
    await SiteSetting.updateOne(
      { key: 'default', 'authentication.otpSubtitle': 'Use a secure one-time password sent to your verified email.' },
      { $set: { 'authentication.otpSubtitle': 'Use a secure one-time password sent to your registered mobile.' } },
    );
    await SiteSetting.updateOne(
      { key: 'default', 'authentication.forgotSubtitle': 'We will send a time-limited reset link to your email.' },
      { $set: { 'authentication.forgotSubtitle': 'Enter your registered email or mobile number. The reset OTP is sent to your registered mobile.' } },
    );
  })().catch((error) => { bootstrapPromise = null; throw error; });
  return bootstrapPromise;
}

export async function getPublicNavigation() {
  await ensurePlatformConfiguration();
  return PlatformModule.find({ scope: 'public', enabled: true }).sort({ sectionOrder: 1, section: 1, sortOrder: 1, label: 1 }).lean();
}

function matchesModuleAccess(module, user, mode) {
  const rules = Array.isArray(module.accessRules) && module.accessRules.length
    ? module.accessRules
    : [{ roles: module.roles || [], modes: module.modes || [] }];
  return rules.some((rule) => {
    const roleAllowed = !rule.roles?.length || rule.roles.includes(user.role);
    const modeAllowed = !rule.modes?.length || rule.modes.includes(mode);
    return roleAllowed && modeAllowed;
  });
}

export async function getApplicationNavigation(user) {
  await ensurePlatformConfiguration();
  const mode = user?.activeMode || 'regular';
  const modules = await PlatformModule.find({ scope: 'app', enabled: true })
    .sort({ sectionOrder: 1, section: 1, sortOrder: 1, label: 1 }).lean();
  return modules.filter((module) =>
    matchesModuleAccess(module, user, mode)
    && (!module.featureFlag || user.customPermissions?.includes(module.featureFlag) || user.role === 'admin'));
}

export async function getContentPage(path, authenticated = false) {
  await ensurePlatformConfiguration();
  return ContentPage.findOne({ path, active: true, ...(authenticated ? {} : { visibility: 'public' }) }).lean();
}
