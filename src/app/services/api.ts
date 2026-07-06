import type {
  ApiResponse, DashboardOverview, DashboardStats, Document, OtpSendRequest, OtpVerifyRequest,
  PaginatedResponse, Payment, Property, PropertyFilters, ResourceList, Tenant, User, AuthResult, AuthSession, RegistrationChallenge, Fast2SmsSettings, PublicSearchPayload,
} from './types';

function isLocalHostname(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return value === 'localhost' || value === '127.0.0.1' || value === '::1' || value.endsWith('.localhost');
}

function normalizeApiBase(configuredValue?: string): string {
  const raw = String(configuredValue || '').trim();
  if (!raw || raw === '/') return '/api/v1';

  let candidate = raw.replace(/\/+$/, '');
  if (!candidate.startsWith('/') && !/^https?:\/\//i.test(candidate)) candidate = `/${candidate}`;

  try {
    const url = new URL(candidate);
    const browserHost = typeof window !== 'undefined' ? window.location.hostname : '';

    // A production bundle must never send visitors to their own localhost.
    // Older .env files sometimes contained http://localhost:5000/api/v1.
    if (browserHost && !isLocalHostname(browserHost) && isLocalHostname(url.hostname)) return '/api/v1';

    if (!url.pathname || url.pathname === '/') return `${url.origin}/api/v1`;
    if (/\/api$/i.test(url.pathname)) return `${url.origin}${url.pathname}/v1`;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    // Relative same-origin paths are preferred for the standard deployment.
  }

  if (/\/api\/v1$/i.test(candidate)) return candidate;
  if (/\/api$/i.test(candidate)) return `${candidate}/v1`;
  return candidate;
}

export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL);
let refreshing: Promise<boolean> | null = null;
let accessToken: string | null = null;
let currentUser: User | null = null;

// Access tokens intentionally remain in memory. The rotating refresh token is an
// HttpOnly, Secure cookie and restores the session after a browser refresh.
export function getToken(): string | null { return accessToken; }
export function setSession(session: AuthSession) {
  accessToken = session.accessToken || session.token || null;
  currentUser = session.user || null;
  window.dispatchEvent(new CustomEvent('secureasset:session', { detail: { authenticated: true, user: currentUser } }));
}
export function clearSession() {
  accessToken = null;
  currentUser = null;
  window.dispatchEvent(new CustomEvent('secureasset:session', { detail: { authenticated: false } }));
}
export function getCurrentUser(): User | null { return currentUser; }

async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return false;
        const payload = await res.json() as ApiResponse<AuthSession>;
        if (payload.success) { setSession(payload.data); return true; }
        return false;
      })
      .catch(() => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot reach the SecureAsset API. Verify that the server is running and Nginx/aaPanel proxies /api/ to port 5000. (${reason})`);
  }
  if (res.status === 401 && retry && !['/auth/login', '/auth/refresh', '/auth/register', '/auth/register/verify', '/auth/register/resend-otp', '/auth/verify-otp', '/auth/two-factor/challenge', '/auth/forgot-password', '/auth/reset-password'].includes(path)) {
    if (await refreshSession()) return request<T>(path, init, false);
    clearSession();
  }
  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();
  if (contentType.includes('text/html')) {
    throw new Error('The web server returned the application page instead of the API response. Configure Nginx/aaPanel to proxy /api/ to 127.0.0.1:5000.');
  }
  if (!res.ok) throw new Error(typeof payload === 'object' && payload?.message ? payload.message : `Request failed (${res.status})`);
  return payload as T;
}

function isAuthSession(value: AuthResult): value is AuthSession { return Boolean((value as AuthSession)?.accessToken && (value as AuthSession)?.user); }
export async function login(identifier: string, password: string) {
  const result = await request<ApiResponse<AuthResult>>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
  if (isAuthSession(result.data)) setSession(result.data); return result;
}
export async function completeTwoFactorLogin(challengeToken: string, code: string) {
  const result = await request<ApiResponse<AuthSession>>('/auth/two-factor/challenge', { method: 'POST', body: JSON.stringify({ challengeToken, code }) });
  setSession(result.data); return result;
}
export async function register(body: { name: string; email: string; phone: string; password: string }) {
  return request<ApiResponse<RegistrationChallenge>>('/auth/register', { method: 'POST', body: JSON.stringify(body) });
}
export async function verifyRegistration(phone: string, otp: string) {
  const result = await request<ApiResponse<AuthSession>>('/auth/register/verify', { method: 'POST', body: JSON.stringify({ phone, otp }) });
  setSession(result.data); return result;
}
export async function resendRegistrationOtp(phone: string) {
  return request<ApiResponse<null>>('/auth/register/resend-otp', { method: 'POST', body: JSON.stringify({ phone }) });
}
export async function logout() {
  try { await request('/auth/logout', { method: 'POST' }); } finally { clearSession(); }
}
export async function getMe() { return request<ApiResponse<User>>('/auth/me'); }
export async function updateMe(body: { name?: string; avatar?: string; region?: string; country?: string; state?: string; city?: string }) { return request<ApiResponse<User>>('/auth/me', { method: 'PATCH', body: JSON.stringify(body) }); }
export async function uploadProfileAvatar(file: File) { const form = new FormData(); form.append('file', file); return request<ApiResponse<{ url: string; filename: string; mimeType: string; size: number }>>('/auth/me/avatar', { method: 'POST', body: form }); }
export async function sendOtp(body: OtpSendRequest) { return request<ApiResponse<{ maskedMobile?: string }>>('/auth/send-otp', { method: 'POST', body: JSON.stringify(body) }); }
export async function verifyOtp(body: OtpVerifyRequest) {
  const result = await request<ApiResponse<AuthResult>>('/auth/verify-otp', { method: 'POST', body: JSON.stringify(body) });
  if (isAuthSession(result.data)) setSession(result.data); return result;
}
export async function forgotPassword(identifier: string) { return request<ApiResponse<{ maskedMobile?: string }>>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ identifier }) }); }
export async function resetPassword(identifier: string, otp: string, password: string) { return request<ApiResponse<null>>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ identifier, otp, password }) }); }

export async function getFast2SmsSettings() { return request<ApiResponse<Fast2SmsSettings>>('/integrations/fast2sms'); }
export async function updateFast2SmsSettings(body: Pick<Fast2SmsSettings, 'enabled'|'endpoint'|'route'|'senderId'|'messageId'|'variablesTemplate'|'scheduleTime'> & { authorization?: string }) { return request<ApiResponse<Fast2SmsSettings>>('/integrations/fast2sms', { method: 'PATCH', body: JSON.stringify(body) }); }
export async function testFast2SmsSettings(mobile: string, otp = '123456') { return request<ApiResponse<null>>('/integrations/fast2sms/test', { method: 'POST', body: JSON.stringify({ mobile, otp }) }); }

export async function getSecurityOverview() { return request<ApiResponse<{ twoFactorEnabled: boolean; sessions: Array<{ id: string; device?: string; ip?: string; createdAt?: string; lastUsedAt?: string; expiresAt?: string; current?: boolean }> }>>('/auth/security'); }
export async function changePassword(currentPassword: string, newPassword: string) { return request<ApiResponse<null>>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }); }
export async function beginTwoFactorSetup() { return request<ApiResponse<{ secret: string; otpauthUri: string }>>('/auth/two-factor/setup', { method: 'POST' }); }
export async function enableTwoFactor(password: string, code: string) { return request<ApiResponse<{ backupCodes: string[] }>>('/auth/two-factor/enable', { method: 'POST', body: JSON.stringify({ password, code }) }); }
export async function disableTwoFactor(password: string, code: string) { return request<ApiResponse<null>>('/auth/two-factor/disable', { method: 'POST', body: JSON.stringify({ password, code }) }); }
export async function regenerateBackupCodes(password: string, code: string) { return request<ApiResponse<{ backupCodes: string[] }>>('/auth/two-factor/backup-codes', { method: 'POST', body: JSON.stringify({ password, code }) }); }
export async function revokeSession(sessionId: string) { return request<ApiResponse<null>>(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }); }
export async function revokeOtherSessions(password: string) { return request<ApiResponse<null>>('/auth/sessions/revoke-others', { method: 'POST', body: JSON.stringify({ password }) }); }

export async function getProperties(filters: PropertyFilters = {}): Promise<PaginatedResponse<Property>> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => value !== undefined && value !== '' && value !== 'all' && params.set(key, String(value)));
  return request(`/public/properties?${params}`);
}
export async function getPropertyById(id: string): Promise<ApiResponse<Property | null>> { return request(`/public/properties/${id}`); }
export async function searchPublicMarketplace(query: string, options: { types?: string[]; limit?: number } = {}) { const qs = new URLSearchParams({ q: query, limit: String(options.limit || 8) }); if (options.types?.length) qs.set('types', options.types.join(',')); return request<ApiResponse<PublicSearchPayload>>(`/public/search?${qs}`); }
export async function getSubscriptionPlans() { return request<ApiResponse<Array<Record<string, any>>>>('/subscriptions/plans'); }
export async function getMySubscription() { return request<ApiResponse<Record<string, any> | null>>('/subscriptions/me'); }
export async function buyLandlordSubscription(body: { plan: string; billingCycle: 'monthly' | 'yearly'; method?: string }) { return request<ApiResponse<Record<string, any>>>('/subscriptions/checkout', { method: 'POST', body: JSON.stringify(body) }); }
export async function cancelLandlordSubscription(id: string) { return request<ApiResponse<Record<string, any>>>(`/subscriptions/${id}/cancel`, { method: 'POST' }); }


export async function getSurveyorPlans() { return request<ApiResponse<Array<Record<string, any>>>>('/surveyor-subscriptions/plans'); }
export async function getMySurveyorSubscription() { return request<ApiResponse<Record<string, any>>>('/surveyor-subscriptions/me'); }
export async function buySurveyorSubscription(body: { plan: string; billingCycle: 'monthly' | 'yearly'; method?: string; autoRenew?: boolean }) { return request<ApiResponse<Record<string, any>>>('/surveyor-subscriptions/checkout', { method: 'POST', body: JSON.stringify(body) }); }
export async function changeSurveyorPlan(plan: string) { return request<ApiResponse<Record<string, any>>>('/surveyor-subscriptions/change-plan', { method: 'POST', body: JSON.stringify({ plan }) }); }
export async function renewSurveyorSubscription(body: { transactionId?: string; autoRenew?: boolean } = {}) { return request<ApiResponse<Record<string, any>>>('/surveyor-subscriptions/renew', { method: 'POST', body: JSON.stringify(body) }); }
export async function cancelSurveyorSubscription(id: string, immediate = false) { return request<ApiResponse<Record<string, any>>>(`/surveyor-subscriptions/${id}/cancel`, { method: 'POST', body: JSON.stringify({ immediate }) }); }
export async function switchAccountMode(mode: 'regular' | 'landlord' | 'surveyor') { return request<ApiResponse<User>>('/surveyor-subscriptions/mode', { method: 'POST', body: JSON.stringify({ mode }) }); }
export async function getSurveyorVerification() { return request<ApiResponse<Record<string, any> | null>>('/surveyor-subscriptions/verification'); }
export async function saveSurveyorVerification(body: Record<string, any>) { return request<ApiResponse<Record<string, any>>>('/surveyor-subscriptions/verification', { method: 'PUT', body: JSON.stringify(body) }); }
export async function submitSurveyorVerification() { return request<ApiResponse<Record<string, any>>>('/surveyor-subscriptions/verification/submit', { method: 'POST' }); }
export async function saveSurveyorProfile(body: Record<string, any>) { return request<ApiResponse<Record<string, any>>>('/surveyor-subscriptions/profile', { method: 'PUT', body: JSON.stringify(body) }); }
export async function setSurveyorProfileVisibility(visibility: 'private' | 'public') { return request<ApiResponse<Record<string, any>>>('/surveyor-subscriptions/profile/visibility', { method: 'POST', body: JSON.stringify({ visibility }) }); }
export async function createSurveyorPrivateLink(accessCode?: string) { return request<ApiResponse<{ token: string; url: string }>>('/surveyor-subscriptions/profile/share-link', { method: 'POST', body: JSON.stringify({ accessCode }) }); }
export async function revokeSurveyorPrivateLink() { return request<ApiResponse<Record<string, any>>>('/surveyor-subscriptions/profile/share-link', { method: 'DELETE' }); }
export async function getSurveyorDashboard() { return request<ApiResponse<Record<string, any>>>('/surveyor-subscriptions/dashboard'); }
export async function acceptSurveyQuotation(id: string) { return request<ApiResponse<Record<string, any>>>(`/surveyor-subscriptions/quotations/${id}/accept`, { method: 'POST' }); }
export async function finalizeSurveyReport(id: string, digitalSignature?: string) { return request<ApiResponse<Record<string, any>>>(`/surveyor-subscriptions/reports/${id}/finalize`, { method: 'POST', body: JSON.stringify({ digitalSignature }) }); }
export async function syncSurveyFieldData(items: Record<string, any>[]) { return request<ApiResponse<Record<string, any>[]>>('/surveyor-subscriptions/field-data/sync', { method: 'POST', body: JSON.stringify({ items }) }); }
export async function calculateSurveyFieldData(id: string, type: string, input: Record<string, any>) { return request<ApiResponse<Record<string, any>>>(`/surveyor-subscriptions/field-data/${id}/calculate`, { method: 'POST', body: JSON.stringify({ type, input }) }); }
export async function approveSurveyCalculation(id: string, calculationId: string) { return request<ApiResponse<Record<string, any>>>(`/surveyor-subscriptions/field-data/${id}/calculations/${calculationId}/approve`, { method: 'POST' }); }
export function surveyReportExportUrl(id: string, format: 'pdf' | 'xlsx' | 'csv' | 'json' | 'html' | 'svg') { return `${API_BASE}/surveyor-subscriptions/reports/${id}/export?format=${format}`; }
export async function downloadSurveyReport(id: string, format: 'pdf' | 'xlsx' | 'csv' | 'json' | 'html' | 'svg') {
  const token = getToken();
  const res = await fetch(surveyReportExportUrl(id, format), { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' });
  if (!res.ok) { const payload = await res.json().catch(() => ({})); throw new Error(payload?.message || 'Could not export survey report'); }
  const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = `survey-report-${id}.${format}`; a.click(); URL.revokeObjectURL(url);
}
export async function getPublicSurveyors(params: Record<string, string | number | boolean | undefined> = {}) { const qs = new URLSearchParams(); Object.entries(params).forEach(([k,v]) => v !== undefined && v !== '' && qs.set(k, String(v))); return request<PaginatedResponse<Record<string, any>>>(`/public/surveyors?${qs}`); }
export async function getPublicSurveyor(id: string) { return request<ApiResponse<Record<string, any>>>(`/public/surveyors/${id}`); }
export async function getPublicSurveyServices(params: Record<string, string | number | boolean | undefined> = {}) { const qs = new URLSearchParams(); Object.entries(params).forEach(([k,v]) => v !== undefined && v !== '' && qs.set(k, String(v))); return request<PaginatedResponse<Record<string, any>>>(`/public/survey-services?${qs}`); }
export async function getPublicSurveyJobs(params: Record<string, string | number | boolean | undefined> = {}) { const qs = new URLSearchParams(); Object.entries(params).forEach(([k,v]) => v !== undefined && v !== '' && qs.set(k, String(v))); return request<PaginatedResponse<Record<string, any>>>(`/public/survey-jobs?${qs}`); }

export async function getResource<T = Record<string, any>>(resource: string, params: Record<string, string | number | undefined> = {}): Promise<ResourceList<T>> {
  const qs = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && qs.set(k, String(v)));
  return request(`/resources/${resource}?${qs}`);
}
export async function getResourceById<T = Record<string, any>>(resource: string, id: string): Promise<ApiResponse<T>> { return request(`/resources/${resource}/${id}`); }
export async function createResource<T = Record<string, any>>(resource: string, body: Record<string, any>): Promise<ApiResponse<T>> { return request(`/resources/${resource}`, { method: 'POST', body: JSON.stringify(body) }); }
export async function updateResource<T = Record<string, any>>(resource: string, id: string, body: Record<string, any>): Promise<ApiResponse<T>> { return request(`/resources/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); }
export async function deleteResource(resource: string, id: string): Promise<ApiResponse<null>> { return request(`/resources/${resource}/${id}`, { method: 'DELETE' }); }
export async function changeResourceStatus<T = Record<string, any>>(resource: string, id: string, status: string, comment?: string): Promise<ApiResponse<T>> { return request(`/resources/${resource}/${id}/status`, { method: 'POST', body: JSON.stringify({ status, comment }) }); }
export async function getDashboardOverview() { return request<ApiResponse<DashboardOverview>>('/dashboard/overview'); }
export async function uploadDocument(file: File, metadata: Record<string, string> = {}) {
  const form = new FormData(); form.append('file', file); Object.entries(metadata).forEach(([key, value]) => form.append(key, value));
  return request<ApiResponse<Document>>('/uploads/document', { method: 'POST', body: form });
}
export async function checkIn(gps: { lat: number; lng: number; accuracy?: number }) { return request('/attendance/check-in', { method: 'POST', body: JSON.stringify({ gps }) }); }
export async function checkOut(gps: { lat: number; lng: number; accuracy?: number }) { return request('/attendance/check-out', { method: 'POST', body: JSON.stringify({ gps }) }); }
export async function getUnreadNotificationCount() { return request<ApiResponse<{ count: number }>>('/notifications/unread-count'); }
export async function markAllNotificationsRead() { return request('/notifications/mark-all-read', { method: 'POST' }); }
export async function getReportCatalog() { return request<ApiResponse<Array<Record<string, any>>>>('/reports/catalog'); }
export function reportUrl(resource: string, format: 'csv' | 'xlsx' | 'pdf' = 'csv') { return `${API_BASE}/reports/${resource}.${format}`; }


export async function globalSearch(query: string, limit = 5) { const qs = new URLSearchParams({ q: query, limit: String(limit) }); return request<ApiResponse<Array<{ resource: string; count: number; data: Record<string, any>[] }>>>(`/search?${qs}`); }
// Compatibility wrappers for the original Figma prototype.
export async function getTenants(): Promise<ApiResponse<Tenant[]>> { const r = await getResource<Tenant>('tenants', { limit: 100 }); return { success: true, data: r.data }; }
export async function getPayments(): Promise<ApiResponse<Payment[]>> { const r = await getResource<Payment>('payments', { limit: 100 }); return { success: true, data: r.data }; }
export async function getDocuments(): Promise<ApiResponse<Document[]>> { const r = await getResource<Document>('documents', { limit: 100 }); return { success: true, data: r.data }; }
export async function getUsers(): Promise<ApiResponse<User[]>> { const r = await getResource<User>('users', { limit: 100 }); return { success: true, data: r.data }; }
export async function getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
  const r = await getDashboardOverview(); const k = r.data.kpis;
  return { success: true, data: { totalProperties: k.totalProperties, activeTenantsCount: k.totalTenants, monthlyRevenue: k.monthlyRentCollection, kycPending: 0, occupancyRate: r.data.occupancyRate, overduePayments: k.outstandingDues, totalDocuments: 0, revenueGrowth: 0 } };
}
export async function createProperty(data: Partial<Property>) { return createResource<Property>('properties', data as Record<string, any>); }
export async function updateProperty(id: string, data: Partial<Property>) { return updateResource<Property>('properties', id, data as Record<string, any>); }
export async function deleteProperty(id: string) { return deleteResource('properties', id); }
export async function recordPayment(data: Partial<Payment>) { return createResource<Payment>('payments', data as Record<string, any>); }
export async function downloadReport(resource: string, format: 'csv' | 'xlsx' | 'pdf' = 'csv') {
  const token = getToken();
  const res = await fetch(`${API_BASE}/reports/${resource}.${format}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' });
  if (!res.ok) {
    let message = 'Could not export report';
    try { message = (await res.json()).message || message; } catch { /* binary or empty response */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const a = document.createElement('a');
  a.href = url; a.download = match?.[1] || `${resource}-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function reviewSurveyorVerification(id: string, body: { status: string; notes?: string; rejectionReason?: string; suspensionReason?: string }) { return request<ApiResponse<Record<string, any>>>(`/surveyor-subscriptions/verification/${id}/review`, { method: 'POST', body: JSON.stringify(body) }); }
export async function getPrivateSurveyor(id: string, token: string, code = '') { const qs = new URLSearchParams({ token }); if (code) qs.set('code', code); return request<ApiResponse<Record<string, any>>>(`/public/surveyor-private/${id}?${qs}`); }
export async function createSurveyInvoice(projectId: string, body: Record<string, any>) { return request<ApiResponse<Record<string, any>>>(`/surveyor-subscriptions/projects/${projectId}/invoices`, { method: 'POST', body: JSON.stringify(body) }); }
export async function paySurveyInvoice(id: string, body: { method?: string; transactionId?: string } = {}) { return request<ApiResponse<Record<string, any>>>(`/surveyor-subscriptions/invoices/${id}/pay`, { method: 'POST', body: JSON.stringify(body) }); }

// Universal Document Vault
export async function getDriveBootstrap() { return request<ApiResponse<Record<string, any>>>('/drive/bootstrap'); }
export async function getDriveItems(params: Record<string, string | number | boolean | undefined> = {}) {
  const qs = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && qs.set(k, String(v)));
  return request<ApiResponse<{ folders: Record<string, any>[]; files: Record<string, any>[] }>>(`/drive/items?${qs}`);
}
export async function getDriveBreadcrumbs(id: string) { return request<ApiResponse<Record<string, any>[]>>(`/drive/folders/${id}/breadcrumbs`); }
export async function createDriveFolder(body: Record<string, any>) { return request<ApiResponse<Record<string, any>>>('/drive/folders', { method: 'POST', body: JSON.stringify(body) }); }
export async function updateDriveFolder(id: string, body: Record<string, any>) { return request<ApiResponse<Record<string, any>>>(`/drive/folders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); }
export async function updateDriveFile(id: string, body: Record<string, any>) { return request<ApiResponse<Record<string, any>>>(`/drive/files/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); }
export async function getDriveFile(id: string) { return request<ApiResponse<Record<string, any>>>(`/drive/files/${id}`); }
export async function createDriveLegalTemplates() { return request<ApiResponse<Record<string, any>>>('/drive/legal-templates', { method: 'POST' }); }
export async function driveItemAction(type: 'file' | 'folder', id: string, action: 'trash' | 'restore') { return request<ApiResponse<Record<string, any>>>(`/drive/${type}/${id}/${action}`, { method: 'POST' }); }
export async function permanentlyDeleteDriveItem(type: 'file' | 'folder', id: string) { return request<ApiResponse<null>>(`/drive/${type}/${id}/permanent`, { method: 'DELETE' }); }
export async function bulkDriveAction(body: Record<string, any>) { return request<ApiResponse<Record<string, any>[]>>('/drive/bulk', { method: 'POST', body: JSON.stringify(body) }); }
export async function shareDriveItem(type: 'file' | 'folder', id: string, body: Record<string, any>) { return request<ApiResponse<Record<string, any>>>(`/drive/${type}/${id}/shares`, { method: 'POST', body: JSON.stringify(body) }); }
export async function getDriveShares(type: 'file' | 'folder', id: string) { return request<ApiResponse<Record<string, any>[]>>(`/drive/${type}/${id}/shares`); }
export async function revokeDriveShare(shareId: string) { return request<ApiResponse<null>>(`/drive/shares/${shareId}`, { method: 'DELETE' }); }
export async function createDrivePublicLink(type: 'file' | 'folder', id: string, body: Record<string, any>) { return request<ApiResponse<{ token: string; slug?: string; url: string }>>(`/drive/${type}/${id}/public-link`, { method: 'POST', body: JSON.stringify(body) }); }
export async function revokeDrivePublicLink(type: 'file' | 'folder', id: string) { return request<ApiResponse<null>>(`/drive/${type}/${id}/public-link`, { method: 'DELETE' }); }
export async function getDriveSharedWithMe() { return request<ApiResponse<Record<string, any>>>('/drive/shared-with-me'); }
export async function searchDrive(params: Record<string, string | undefined>) { const qs = new URLSearchParams(); Object.entries(params).forEach(([k,v]) => v && qs.set(k,v)); return request<ApiResponse<Record<string, any>>>(`/drive/search?${qs}`); }
export async function getDriveAnalytics() { return request<ApiResponse<Record<string, any>>>('/drive/analytics'); }
export async function getDriveActivity(itemId?: string) { return request<ApiResponse<Record<string, any>[]>>(`/drive/activity${itemId ? `?itemId=${encodeURIComponent(itemId)}` : ''}`); }
export async function setDriveFileApproval(id: string, body: Record<string, any>) { return request<ApiResponse<Record<string, any>>>(`/drive/files/${id}/approval`, { method: 'POST', body: JSON.stringify(body) }); }
export async function addDriveComment(id: string, body: string) { return request<ApiResponse<Record<string, any>>>(`/drive/files/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); }
export async function getDriveComments(id: string) { return request<ApiResponse<Record<string, any>[]>>(`/drive/files/${id}/comments`); }
export async function restoreDriveVersion(id: string, version: number) { return request<ApiResponse<Record<string, any>>>(`/drive/files/${id}/versions/${version}/restore`, { method: 'POST' }); }
export function driveFolderDownloadUrl(id: string) { return `${API_BASE}/drive/folders/${id}/download`; }
export async function uploadDriveFile(file: File, metadata: Record<string, string> = {}, onProgress?: (percent: number) => void) {
  return new Promise<ApiResponse<Record<string, any>>>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open('POST', `${API_BASE}/drive/files`); xhr.withCredentials = true;
    const token = getToken(); if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => { try { const payload = JSON.parse(xhr.responseText); if (xhr.status >= 200 && xhr.status < 300) resolve(payload); else reject(new Error(payload?.message || `Upload failed (${xhr.status})`)); } catch { reject(new Error('Upload failed')); } };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    const form = new FormData(); form.append('file', file); Object.entries(metadata).forEach(([k,v]) => form.append(k,v)); xhr.send(form);
  });
}
export async function createDriveScannedPdf(files: File[], metadata: Record<string, string> = {}, onProgress?: (percent: number) => void) {
  return new Promise<ApiResponse<Record<string, any>>>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open('POST', `${API_BASE}/drive/scan-to-pdf`); xhr.withCredentials = true;
    const token = getToken(); if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => { try { const payload = JSON.parse(xhr.responseText); if (xhr.status >= 200 && xhr.status < 300) resolve(payload); else reject(new Error(payload?.message || `Scan failed (${xhr.status})`)); } catch { reject(new Error('Scan failed')); } };
    xhr.onerror = () => reject(new Error('Network error during scan upload'));
    const form = new FormData(); files.forEach((file) => form.append('pages', file)); Object.entries(metadata).forEach(([key, value]) => form.append(key, value)); xhr.send(form);
  });
}

export async function uploadDriveVersion(id: string, file: File, changeDescription = '', onProgress?: (percent: number) => void) {
  return new Promise<ApiResponse<Record<string, any>>>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open('POST', `${API_BASE}/drive/files/${id}/versions`); xhr.withCredentials = true;
    const token = getToken(); if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => { try { const payload = JSON.parse(xhr.responseText); if (xhr.status >= 200 && xhr.status < 300) resolve(payload); else reject(new Error(payload?.message || 'Version upload failed')); } catch { reject(new Error('Version upload failed')); } };
    xhr.onerror = () => reject(new Error('Network error during upload')); const form = new FormData(); form.append('file', file); form.append('changeDescription', changeDescription); xhr.send(form);
  });
}
export async function fetchDriveFileBlob(id: string, download = false) {
  const token = getToken(); const res = await fetch(`${API_BASE}/drive/files/${id}/content?download=${download}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' });
  if (!res.ok) { const payload = await res.json().catch(() => ({})); throw new Error(payload?.message || 'Could not open file'); } return res.blob();
}
export async function downloadDriveFile(id: string, name: string) { const blob = await fetchDriveFileBlob(id, true); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
export async function downloadDriveFolder(id: string, name: string) {
  const token = getToken(); const res = await fetch(driveFolderDownloadUrl(id), { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' }); if (!res.ok) throw new Error('Could not download folder'); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${name}.zip`; a.click(); URL.revokeObjectURL(url);
}
export async function getPublicDriveItem(type: 'file' | 'folder', token: string, password = '', folderId = '', email = '') { const qs = new URLSearchParams(); if (password) qs.set('password', password); if (folderId) qs.set('folderId', folderId); if (email) qs.set('email', email); return request<ApiResponse<Record<string, any>>>(`/public-drive/${type}/${encodeURIComponent(token)}${qs.size ? `?${qs}` : ''}`); }
export function publicDriveFolderFileUrl(token: string, fileId: string, password = '', download = false, email = '') { const qs = new URLSearchParams({ download: String(download) }); if (password) qs.set('password', password); if (email) qs.set('email', email); return `${API_BASE}/public-drive/folder/${encodeURIComponent(token)}/files/${encodeURIComponent(fileId)}/content?${qs}`; }
export function publicDriveContentUrl(token: string, password = '', download = false, email = '') { const qs = new URLSearchParams({ download: String(download) }); if (password) qs.set('password', password); if (email) qs.set('email', email); return `${API_BASE}/public-drive/file/${encodeURIComponent(token)}/content?${qs}`; }
export async function getDriveAdminOverview() { return request<ApiResponse<Record<string, any>>>('/drive/admin/overview'); }
export async function getDriveAdminUsage() { return request<ResourceList<Record<string, any>>>('/drive/admin/usage'); }
export async function getDriveAdminReports(status = '') { return request<ApiResponse<Record<string, any>[]>>(`/drive/admin/reports${status ? `?status=${encodeURIComponent(status)}` : ''}`); }
export async function reviewDriveContentReport(id: string, body: Record<string, any>) { return request<ApiResponse<Record<string, any>>>(`/drive/admin/reports/${id}/review`, { method: 'POST', body: JSON.stringify(body) }); }
export async function getDrivePolicy() { return request<ApiResponse<Record<string, any>>>('/drive/admin/policy'); }
export async function updateDrivePolicy(body: Record<string, any>) { return request<ApiResponse<Record<string, any>>>('/drive/admin/policy', { method: 'PATCH', body: JSON.stringify(body) }); }

export async function getSiteConfig(path = '/') {
  return request<ApiResponse<Record<string, any>>>(`/site/config?path=${encodeURIComponent(path)}`);
}
export async function submitSiteEnquiry(body: Record<string, any>) {
  return request<ApiResponse<{ _id: string }>>('/site/enquiries', { method: 'POST', body: JSON.stringify(body) });
}
export async function getPublicPropertyStructure(id: string) {
  return request<ApiResponse<Record<string, any>>>(`/site/properties/${id}/structure`);
}
export async function getLandlordOverview() {
  return request<ApiResponse<Record<string, any>>>('/property-management/landlord-overview');
}
export async function getPropertyTree(id: string) {
  return request<ApiResponse<Record<string, any>>>(`/property-management/properties/${id}/tree`);
}
export async function submitTenantKyc(body: Record<string, any>) {
  return request<ApiResponse<Record<string, any>>>('/property-management/kyc/submit', { method: 'POST', body: JSON.stringify(body) });
}
export async function reviewTenantKyc(id: string, body: Record<string, any>) {
  return request<ApiResponse<Record<string, any>>>(`/property-management/kyc/${id}/review`, { method: 'POST', body: JSON.stringify(body) });
}
export async function createRentalApplication(body: Record<string, any>) {
  return request<ApiResponse<Record<string, any>>>('/property-management/applications', { method: 'POST', body: JSON.stringify(body) });
}
export async function decideRentalApplication(id: string, body: Record<string, any>) {
  return request<ApiResponse<Record<string, any>>>(`/property-management/applications/${id}/decision`, { method: 'POST', body: JSON.stringify(body) });
}
export async function createTenancyFromApplication(id: string, body: Record<string, any>) {
  return request<ApiResponse<Record<string, any>>>(`/property-management/applications/${id}/create-tenancy`, { method: 'POST', body: JSON.stringify(body) });
}
export async function calculateUtilityBill(body: Record<string, any>) {
  return request<ApiResponse<{ unitsConsumed: number; totalAmount: number }>>('/property-management/utility/calculate', { method: 'POST', body: JSON.stringify(body) });
}
export function propertyExportUrl(id: string, format: 'json' | 'csv' = 'json') {
  return `${API_BASE}/property-management/properties/${id}/export?format=${format}`;
}
export async function downloadPropertyExport(id: string, format: 'json' | 'csv' = 'json') {
  const token = getToken();
  const res = await fetch(propertyExportUrl(id, format), { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' });
  if (!res.ok) throw new Error('Could not export property');
  const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = `property-${id}.${format}`; a.click(); URL.revokeObjectURL(url);
}

export async function uploadSiteAsset(file: File) {
  const form = new FormData(); form.append('file', file);
  return request<ApiResponse<{ url: string; filename: string; mimeType: string; size: number }>>('/site/admin-assets', { method: 'POST', body: form });
}

export async function getAppConfiguration() {
  return request<ApiResponse<{ modules: Record<string, any>[]; role: string; mode: string }>>('/site/app-config');
}

export async function getNotifications(params: Record<string, string | number | boolean> = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value !== undefined && value !== '' && query.set(key, String(value)));
  return request<PaginatedResponse<Record<string, any>>>(`/notifications${query.size ? `?${query}` : ''}`);
}
export async function markNotificationRead(id: string) { return request<ApiResponse<Record<string, any>>>(`/notifications/${id}/read`, { method: 'PATCH' }); }
export async function deleteNotification(id: string) { return request<ApiResponse<null>>(`/notifications/${id}`, { method: 'DELETE' }); }
export async function getNotificationPreferences() { return request<ApiResponse<Record<string, any>>>('/notifications/preferences'); }
export async function updateNotificationPreferences(body: Record<string, any>) { return request<ApiResponse<Record<string, any>>>('/notifications/preferences', { method: 'PATCH', body: JSON.stringify(body) }); }

export async function getMessagingContacts(search = '') { const qs = search ? `?search=${encodeURIComponent(search)}` : ''; return request<ApiResponse<Record<string, any>[]>>(`/messaging/contacts${qs}`); }
export async function getConversations(params: Record<string, string | number> = {}) {
  const query = new URLSearchParams(); Object.entries(params).forEach(([key, value]) => query.set(key, String(value)));
  return request<PaginatedResponse<Record<string, any>>>(`/messaging/conversations${query.size ? `?${query}` : ''}`);
}
export async function createConversation(body: Record<string, any>) { return request<ApiResponse<Record<string, any>>>('/messaging/conversations', { method: 'POST', body: JSON.stringify(body) }); }
export async function getConversationMessages(id: string, params: Record<string, string | number> = {}) {
  const query = new URLSearchParams(); Object.entries(params).forEach(([key, value]) => query.set(key, String(value)));
  return request<PaginatedResponse<Record<string, any>>>(`/messaging/conversations/${id}/messages${query.size ? `?${query}` : ''}`);
}
export async function sendConversationMessage(id: string, body: Record<string, any>) { return request<ApiResponse<Record<string, any>>>(`/messaging/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify(body) }); }
export async function markConversationRead(id: string) { return request<ApiResponse<null>>(`/messaging/conversations/${id}/read`, { method: 'PATCH' }); }
export async function archiveConversation(id: string) { return request<ApiResponse<null>>(`/messaging/conversations/${id}/archive`, { method: 'PATCH' }); }

export type LocationOption = { name: string; isoCode?: string; countryCode?: string; stateCode?: string; phonecode?: string; flag?: string; latitude?: string; longitude?: string };
export async function getLocationCountries() { return request<ApiResponse<LocationOption[]>>('/public/locations/countries'); }
export async function getLocationStates(country: string) { return request<ApiResponse<LocationOption[]>>(`/public/locations/states?country=${encodeURIComponent(country)}`); }
export async function getLocationCities(country: string, state?: string) { return request<ApiResponse<LocationOption[]>>(`/public/locations/cities?country=${encodeURIComponent(country)}${state ? `&state=${encodeURIComponent(state)}` : ''}`); }
