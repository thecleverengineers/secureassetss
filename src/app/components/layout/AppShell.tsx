import { Fragment, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  AppBar, Avatar, Badge, Box, BottomNavigation, BottomNavigationAction, Breadcrumbs, Button, DialogContent, Divider, Drawer,
  IconButton, InputBase, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Toolbar, Tooltip, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import ProfessionalDialog from '../shared/ProfessionalDialog';
import {
  DashboardRounded, ApartmentRounded, MeetingRoomRounded, PeopleRounded, DescriptionRounded, AssignmentRounded,
  PaymentsRounded, BuildRounded, ApprovalRounded, NotificationsRounded, MessageRounded, FolderRounded, HistoryRounded,
  AssessmentRounded, SettingsRounded, SearchRounded, MenuRounded, ChevronLeftRounded, DarkModeRounded, LightModeRounded,
  LogoutRounded, PersonRounded, WorkHistoryRounded, ExploreRounded, FactCheckRounded, HelpOutlineRounded,
  AccountBalanceRounded, HomeWorkRounded, WorkspacePremiumRounded, EngineeringRounded, StorefrontRounded, RequestQuoteRounded,
  CalendarMonthRounded, StraightenRounded, AnalyticsRounded, GroupWorkRounded, BusinessCenterRounded, VerifiedUserRounded, SwapHorizRounded,
  WebRounded, CollectionsRounded, BadgeRounded, ReceiptLongRounded, ElectricMeterRounded, CampaignRounded,
} from '@mui/icons-material';
import { LogoMark } from '../premium/LogoMark';
import { useAuth } from '../../context/AuthContext';
import { useColorMode } from '../../context/ColorModeContext';
import { getAppConfiguration, getUnreadNotificationCount, switchAccountMode } from '../../services/api';
import type { UserRole } from '../../services/types';
import { useSite } from '../../context/SiteContext';
import { useRealtime } from '../../context/RealtimeContext';

const drawerWidth = 274;
const collapsedWidth = 82;
type MenuDef = { key: string; label: string; icon: any; path?: string; mobilePrimary?: boolean; section?: string; sectionOrder?: number; sortOrder?: number; badge?: string };

const items: Record<string, MenuDef> = {
  dashboard: { key: 'dashboard', label: 'Dashboard', icon: DashboardRounded },
  users: { key: 'users', label: 'Users', icon: PeopleRounded },
  properties: { key: 'properties', label: 'My Properties', icon: ApartmentRounded },
  subscription: { key: 'subscription', label: 'Landlord Subscription', icon: WorkspacePremiumRounded },
  units: { key: 'units', label: 'Units', icon: MeetingRoomRounded },
  tenants: { key: 'tenants', label: 'Tenants', icon: PeopleRounded },
  leases: { key: 'leases', label: 'Lease Management', icon: DescriptionRounded },
  surveys: { key: 'surveys', label: 'Surveys', icon: AssignmentRounded },
  applications: { key: 'applications', label: 'Applications', icon: FactCheckRounded },
  payments: { key: 'payments', label: 'Payments & Invoices', icon: PaymentsRounded },
  complaints: { key: 'complaints', label: 'Complaints & Maintenance', icon: BuildRounded },
  approvals: { key: 'approvals', label: 'Approvals', icon: ApprovalRounded },
  notifications: { key: 'notifications', label: 'Notifications', icon: NotificationsRounded },
  messages: { key: 'messages', label: 'Messages', icon: MessageRounded },
  documents: { key: 'documents', label: 'Document Vault', icon: FolderRounded },
  attendance: { key: 'attendance', label: 'Attendance', icon: WorkHistoryRounded },
  'audit-logs': { key: 'audit-logs', label: 'Audit Logs', icon: HistoryRounded },
  'drive-admin': { key: 'drive-admin', label: 'Drive Administration', icon: FolderRounded },
  reports: { key: 'reports', label: 'Reports & Analytics', icon: AssessmentRounded },
  settings: { key: 'settings', label: 'System Settings', icon: SettingsRounded },
  'site-admin': { key: 'site-admin', label: 'Site, SEO & Homepage', icon: WebRounded },
  'property-management': { key: 'property-management', label: 'Property Structure', icon: ApartmentRounded },
  'property-spaces': { key: 'property-spaces', label: 'Buildings, Rooms & Beds', icon: MeetingRoomRounded },
  'property-media': { key: 'property-media', label: 'Room-wise Galleries', icon: CollectionsRounded },
  'tenant-profiles': { key: 'tenant-profiles', label: 'Tenant Profiles', icon: PersonRounded },
  'tenant-kyc': { key: 'tenant-kyc', label: 'Tenant KYC', icon: BadgeRounded },
  occupants: { key: 'occupants', label: 'Family & Occupants', icon: PeopleRounded },
  'tenant-interviews': { key: 'tenant-interviews', label: 'Tenant Interviews', icon: CalendarMonthRounded },
  'property-visits': { key: 'property-visits', label: 'Property Site Visits', icon: CalendarMonthRounded },
  tenancies: { key: 'tenancies', label: 'Active Tenancies', icon: HomeWorkRounded },
  'rental-invoices': { key: 'rental-invoices', label: 'Rent & Bills', icon: ReceiptLongRounded },
  'utility-readings': { key: 'utility-readings', label: 'Meter Readings', icon: ElectricMeterRounded },
  'reminder-rules': { key: 'reminder-rules', label: 'Payment Reminders', icon: NotificationsRounded },
  'property-promotions': { key: 'property-promotions', label: 'Property Promotions', icon: CampaignRounded },
  'site-enquiries': { key: 'site-enquiries', label: 'Website Enquiries', icon: MessageRounded },
  'platform-modules': { key: 'platform-modules', label: 'Navigation & Modules', icon: SettingsRounded },
  'content-pages': { key: 'content-pages', label: 'Content Pages', icon: DescriptionRounded },
  'integration-settings': { key: 'integration-settings', label: 'Integrations', icon: SettingsRounded },
  'notification-preferences': { key: 'notification-preferences', label: 'Notification Preferences', icon: NotificationsRounded },

  profile: { key: 'profile', label: 'Profile', icon: PersonRounded },
  marketplace: { key: 'marketplace', label: 'Browse Properties', icon: ExploreRounded, path: '/marketplace' },
  'my-property': { key: 'my-property', label: 'My Property', icon: HomeWorkRounded },
  facilities: { key: 'facilities', label: 'Facilities', icon: AccountBalanceRounded },
  'facility-bookings': { key: 'facility-bookings', label: 'Facility Bookings', icon: CalendarMonthRounded },
  'surveyor-plans': { key: 'surveyor-plans', label: 'Surveyor Plans', icon: WorkspacePremiumRounded },
  'surveyor-verifications': { key: 'surveyor-verifications', label: 'Surveyor Verifications', icon: VerifiedUserRounded },
  'surveyor-profiles': { key: 'surveyor-profiles', label: 'Surveyor Profiles', icon: PersonRounded },
  'surveyor-dashboard': { key: 'surveyor-dashboard', label: 'Surveyor Dashboard', icon: EngineeringRounded },
  'surveyor-subscription': { key: 'surveyor-subscription', label: 'Surveyor Subscription', icon: WorkspacePremiumRounded },
  'surveyor-verification': { key: 'surveyor-verification', label: 'Verification', icon: VerifiedUserRounded },
  'surveyor-profile': { key: 'surveyor-profile', label: 'Professional Profile', icon: PersonRounded },
  'survey-services': { key: 'survey-services', label: 'My Survey Services', icon: StorefrontRounded },
  'survey-job-marketplace': { key: 'survey-job-marketplace', label: 'Survey Job Marketplace', icon: ExploreRounded },
  'survey-jobs': { key: 'survey-jobs', label: 'Client Job Requests', icon: AssignmentRounded },
  'survey-quotations': { key: 'survey-quotations', label: 'Quotations', icon: RequestQuoteRounded },
  'survey-projects': { key: 'survey-projects', label: 'Survey Projects', icon: BusinessCenterRounded },
  'site-visits': { key: 'site-visits', label: 'Site Visits', icon: CalendarMonthRounded },
  'field-data': { key: 'field-data', label: 'Field Data', icon: StraightenRounded },
  'survey-reports': { key: 'survey-reports', label: 'Survey Reports', icon: DescriptionRounded },
  'survey-equipment': { key: 'survey-equipment', label: 'Equipment', icon: EngineeringRounded },
  'survey-team': { key: 'survey-team', label: 'Team', icon: GroupWorkRounded },
  'survey-clients': { key: 'survey-clients', label: 'Clients', icon: PeopleRounded },
  'survey-reviews': { key: 'survey-reviews', label: 'Reviews', icon: AssessmentRounded },
  'survey-disputes': { key: 'survey-disputes', label: 'Disputes', icon: BuildRounded },
  'survey-promotions': { key: 'survey-promotions', label: 'Promotions', icon: AnalyticsRounded },
};


const iconByName: Record<string, any> = {
  dashboard: DashboardRounded, apartment: ApartmentRounded, meetingroom: MeetingRoomRounded, people: PeopleRounded,
  description: DescriptionRounded, assignment: AssignmentRounded, payments: PaymentsRounded, build: BuildRounded,
  approval: ApprovalRounded, notifications: NotificationsRounded, message: MessageRounded, folder: FolderRounded,
  history: HistoryRounded, assessment: AssessmentRounded, settings: SettingsRounded, search: SearchRounded,
  person: PersonRounded, workhistory: WorkHistoryRounded, explore: ExploreRounded, factcheck: FactCheckRounded,
  accountbalance: AccountBalanceRounded, homework: HomeWorkRounded, workspacepremium: WorkspacePremiumRounded,
  engineering: EngineeringRounded, storefront: StorefrontRounded, requestquote: RequestQuoteRounded,
  calendarmonth: CalendarMonthRounded, straighten: StraightenRounded, analytics: AnalyticsRounded,
  groupwork: GroupWorkRounded, businesscenter: BusinessCenterRounded, verifieduser: VerifiedUserRounded,
  web: WebRounded, collections: CollectionsRounded, badge: BadgeRounded, receiptlong: ReceiptLongRounded,
  electricmeter: ElectricMeterRounded, campaign: CampaignRounded,
};
function normalizeIconName(value = '') { return value.toLowerCase().replace(/[^a-z0-9]/g, ''); }

const roleMenus: Record<UserRole, string[]> = {
  admin: ['dashboard', 'site-admin', 'site-enquiries', 'users', 'properties', 'property-management', 'tenant-profiles', 'tenant-kyc', 'occupants', 'tenant-interviews', 'property-visits', 'tenancies', 'rental-invoices', 'utility-readings', 'reminder-rules', 'property-promotions', 'leases', 'surveys', 'applications', 'payments', 'complaints', 'approvals', 'surveyor-plans', 'surveyor-verifications', 'surveyor-profiles', 'survey-services', 'survey-jobs', 'survey-quotations', 'survey-projects', 'survey-reports', 'survey-disputes', 'survey-promotions', 'facilities', 'facility-bookings', 'documents', 'drive-admin', 'notifications', 'messages', 'reports', 'audit-logs', 'settings'],
  manager: ['dashboard', 'properties', 'property-management', 'tenant-profiles', 'tenant-kyc', 'occupants', 'applications', 'tenant-interviews', 'property-visits', 'tenancies', 'rental-invoices', 'utility-readings', 'leases', 'surveys', 'payments', 'complaints', 'approvals', 'attendance', 'facilities', 'facility-bookings', 'documents', 'messages', 'notifications', 'reports'],
  tenant: ['dashboard', 'marketplace', 'tenant-profiles', 'tenant-kyc', 'occupants', 'applications', 'property-visits', 'tenancies', 'rental-invoices', 'subscription', 'surveyor-subscription', 'my-property', 'leases', 'payments', 'complaints', 'documents', 'facilities', 'facility-bookings', 'messages', 'notifications', 'profile'],
  user: ['dashboard', 'marketplace', 'applications', 'payments', 'complaints', 'facilities', 'facility-bookings', 'documents', 'messages', 'notifications', 'profile'],
  surveyor: ['surveyor-dashboard', 'surveys', 'attendance', 'facilities', 'facility-bookings', 'documents', 'messages', 'notifications', 'profile'],
};

const landlordMenu = ['dashboard', 'subscription', 'property-management', 'properties', 'applications', 'tenant-interviews', 'property-visits', 'tenancies', 'rental-invoices', 'utility-readings', 'reminder-rules', 'property-promotions', 'tenant-profiles', 'occupants', 'leases', 'payments', 'complaints', 'facilities', 'facility-bookings', 'documents', 'messages', 'notifications', 'profile'];
const surveyorMenu = ['surveyor-dashboard', 'surveyor-subscription', 'surveyor-verification', 'surveyor-profile', 'survey-services', 'survey-job-marketplace', 'survey-jobs', 'survey-quotations', 'survey-projects', 'site-visits', 'field-data', 'survey-reports', 'survey-equipment', 'survey-team', 'survey-clients', 'payments', 'survey-reviews', 'survey-disputes', 'survey-promotions', 'documents', 'messages', 'notifications', 'profile'];

function menuKeysFor(user: any) {
  if (!user) return roleMenus.tenant;
  if (user.role !== 'tenant') return roleMenus[user.role as UserRole] || roleMenus.tenant;
  if (user.activeMode === 'surveyor' && user.surveyorEnabled) return surveyorMenu;
  if (user.activeMode === 'landlord' && user.landlordEnabled) return landlordMenu;
  return roleMenus.tenant;
}

export const moduleLabel = (key: string) => items[key]?.label || key.replaceAll('-', ' ').replace(/\b\w/g, (m) => m.toUpperCase());

export default function AppShell() {
  const { user, logout, refreshUser } = useAuth();
  const { mode, toggle } = useColorMode();
  const { data: { settings } } = useSite();
  const realtime = useRealtime();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [modeAnchor, setModeAnchor] = useState<null | HTMLElement>(null);
  const [unread, setUnread] = useState(0);
  const [globalQuery, setGlobalQuery] = useState('');
  const [appModules, setAppModules] = useState<Record<string, any>[]>([]);
  const [moduleError, setModuleError] = useState('');
  async function loadModules() {
    try { const response = await getAppConfiguration(); setAppModules(response.data.modules || []); setModuleError(''); }
    catch (error) { setModuleError((error as Error).message); }
  }
  const fallbackMenu = useMemo(() => menuKeysFor(user).map((key) => items[key]).filter((item): item is MenuDef => Boolean(item)), [user?.role, user?.activeMode, user?.landlordEnabled, user?.surveyorEnabled]);
  const menu = useMemo(() => appModules.length ? appModules.map((module) => ({
    key: module.key, label: module.label, path: module.path || `/app/${module.key}`, section: module.section, sectionOrder: Number(module.sectionOrder ?? 999), sortOrder: Number(module.sortOrder ?? 0), mobilePrimary: Boolean(module.mobilePrimary), badge: module.badge,
    icon: iconByName[normalizeIconName(module.icon)] || items[module.key]?.icon || SettingsRounded,
  })) : fallbackMenu, [appModules, fallbackMenu]);
  const currentKey = location.pathname.split('/').filter(Boolean).at(-1) || 'dashboard';
  const menuGroups = useMemo(() => {
    const groups = new Map<string, MenuDef[]>();
    for (const item of menu) {
      const section = item.section || 'workspace';
      groups.set(section, [...(groups.get(section) || []), item]);
    }
    return [...groups.entries()].sort(([, left], [, right]) => Number(left[0]?.sectionOrder ?? 999) - Number(right[0]?.sectionOrder ?? 999));
  }, [menu]);
  const sectionLabel = (value: string) => value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

  useEffect(() => { void loadModules(); }, [user?._id, user?.role, user?.activeMode, user?.landlordEnabled, user?.surveyorEnabled]);
  useEffect(() => {
    const refreshModules = () => void loadModules();
    window.addEventListener('secureasset:site-changed', refreshModules);
    return () => window.removeEventListener('secureasset:site-changed', refreshModules);
  }, [user?._id, user?.activeMode]);
  useEffect(() => { getUnreadNotificationCount().then((r) => setUnread(r.data.count)).catch(() => {}); }, [location.pathname]);
  useEffect(() => realtime.subscribe('notification:new', () => setUnread((count) => count + 1)), [realtime.subscribe]);

  function go(item: MenuDef) {
    navigate(item.path || `/app/${item.key}`);
    setMobileOpen(false);
  }
  async function handleLogout() { await logout(); navigate('/login'); }
  async function changeMode(nextMode: 'regular' | 'landlord' | 'surveyor') {
    await switchAccountMode(nextMode); await refreshUser(); setModeAnchor(null);
    navigate(nextMode === 'surveyor' ? '/app/surveyor-dashboard' : '/app/dashboard');
  }

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" alignItems="center" justifyContent={collapsed && !isMobile ? 'center' : 'space-between'} sx={{ px: collapsed && !isMobile ? 1 : 2.5, py: 2.3, minHeight: 74 }}>
        <Box sx={{ overflow: 'hidden', minWidth: collapsed && !isMobile ? 42 : 175 }}><LogoMark /></Box>
        {!isMobile && !collapsed && <IconButton size="small" onClick={() => setCollapsed(true)}><ChevronLeftRounded /></IconButton>}
      </Stack>
      <Divider />
      <Box sx={{ px: collapsed && !isMobile ? 1 : 1.5, py: 1.5, overflowY: 'auto', flex: 1 }}>
        {!collapsed && <Typography sx={{ px: 1.5, py: 1, fontSize: 11, fontWeight: 800, color: 'text.secondary', letterSpacing: '.1em' }}>WORKSPACE</Typography>}
        <List disablePadding>
          {menuGroups.map(([section, sectionItems], groupIndex) => <Fragment key={section}>
            {groupIndex > 0 && (collapsed && !isMobile ? <Divider sx={{ my: 1 }} /> : null)}
            {(!collapsed || isMobile) && <Typography sx={{ px: 1.5, pt: groupIndex ? 2 : .5, pb: .7, fontSize: 10.5, fontWeight: 900, color: 'text.disabled', letterSpacing: '.09em' }}>{sectionLabel(section)}</Typography>}
            {sectionItems.map((item) => {
              const active = item.key === currentKey || (item.key === 'dashboard' && currentKey === 'app');
              const Icon = item.icon;
              return <Tooltip key={item.key} title={collapsed && !isMobile ? item.label : ''} placement="right">
                <ListItemButton
                  onClick={() => go(item)}
                  sx={{ minHeight: 46, borderRadius: 3, mb: .45, px: 1.5, justifyContent: collapsed && !isMobile ? 'center' : 'flex-start', bgcolor: active ? 'primary.main' : 'transparent', color: active ? 'primary.contrastText' : 'text.secondary', '&:hover': { bgcolor: active ? 'primary.dark' : 'action.hover', color: active ? 'primary.contrastText' : 'text.primary' } }}
                >
                  <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 0 : 40, color: 'inherit', justifyContent: 'center' }}><Icon fontSize="small" /></ListItemIcon>
                  {(!collapsed || isMobile) && <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: active ? 700 : 600 }} />}
                </ListItemButton>
              </Tooltip>;
            })}
          </Fragment>)}
        </List>
      </Box>
      <Box sx={{ p: 1.5 }}>
        <Button fullWidth onClick={() => navigate('/app/profile')} sx={{ justifyContent: collapsed && !isMobile ? 'center' : 'flex-start', px: 1.2, py: 1.2, borderRadius: 3, color: 'text.primary' }}>
          <Avatar src={user?.avatar} sx={{ width: 34, height: 34, mr: collapsed && !isMobile ? 0 : 1.2, bgcolor: 'primary.main', fontSize: 13 }}>{user?.name?.[0]}</Avatar>
          {(!collapsed || isMobile) && <Box sx={{ textAlign: 'left', overflow: 'hidden' }}><Typography noWrap sx={{ fontSize: 12.5, fontWeight: 800 }}>{user?.name}</Typography><Typography noWrap sx={{ fontSize: 10.5, color: 'text.secondary', textTransform: 'capitalize' }}>{user?.role === 'tenant' ? `${user?.activeMode || 'regular'} mode` : user?.role}</Typography></Box>}
        </Button>
      </Box>
    </Box>
  );

  const width = collapsed ? collapsedWidth : drawerWidth;
  const primaryMobile = (menu.filter((item) => item.mobilePrimary).length ? menu.filter((item) => item.mobilePrimary) : menu).slice(0, 5);
  const currentModule = menu.find((item) => item.key === currentKey);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" elevation={0} sx={{ zIndex: theme.zIndex.drawer + 1, ml: { md: `${width}px` }, width: { md: `calc(100% - ${width}px)` }, bgcolor: 'background.paper', color: 'text.primary', borderBottom: '1px solid', borderColor: 'divider', transition: 'all .2s' }}>
        <Toolbar sx={{ minHeight: '72px !important', gap: { xs: .5, sm: 1.5 } }}>
          {isMobile ? <IconButton onClick={() => setMobileOpen(true)} aria-label="Open app navigation"><MenuRounded /></IconButton> : collapsed ? <IconButton onClick={() => setCollapsed(false)}><MenuRounded /></IconButton> : null}
          {isMobile && <Box sx={{ minWidth: 0, flex: 1, px: .5 }}><Typography noWrap sx={{ fontWeight: 900, fontSize: 14 }}>{currentModule?.label || moduleLabel(currentKey)}</Typography><Typography noWrap color="text.secondary" sx={{ fontSize: 10.5 }}>{settings.shortTitle || settings.siteTitle || 'SecureAsset'}</Typography></Box>}
          <Box component="form" onSubmit={(event) => { event.preventDefault(); const query = globalQuery.trim(); if (query.length >= 2) navigate(`/app/search?q=${encodeURIComponent(query)}`); }} sx={{ flex: 1, maxWidth: 560, display: { xs: 'none', md: 'flex' }, alignItems: 'center', bgcolor: 'action.hover', borderRadius: 999, px: 2, height: 42 }}>
            <SearchRounded sx={{ color: 'text.secondary', fontSize: 20, mr: 1 }} />
            <InputBase fullWidth value={globalQuery} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="Search properties, tenants, surveys…" inputProps={{ 'aria-label': 'Global search' }} sx={{ fontSize: 13.5 }} />
          </Box>
          {!isMobile && <Box sx={{ flex: 1 }} />}
          {isMobile && <Tooltip title="Search workspace"><IconButton onClick={() => setMobileSearchOpen(true)}><SearchRounded /></IconButton></Tooltip>}
          {user?.role === 'tenant' && <>
            <Button size="small" variant="outlined" startIcon={<SwapHorizRounded />} onClick={(e) => setModeAnchor(e.currentTarget)} sx={{ display: { xs: 'none', md: 'inline-flex' }, borderRadius: 999, textTransform: 'capitalize' }}>{user.activeMode || 'regular'} mode</Button>
            <Menu anchorEl={modeAnchor} open={Boolean(modeAnchor)} onClose={() => setModeAnchor(null)} PaperProps={{ sx: { borderRadius: 3, minWidth: 230 } }}>
              <MenuItem selected={(user.activeMode || 'regular') === 'regular'} onClick={() => changeMode('regular')}>Regular Tenant Mode</MenuItem>
              <MenuItem disabled={!user.landlordEnabled} selected={user.activeMode === 'landlord'} onClick={() => changeMode('landlord')}>Landlord Mode {!user.landlordEnabled && '— subscription required'}</MenuItem>
              <MenuItem disabled={!user.surveyorEnabled} selected={user.activeMode === 'surveyor'} onClick={() => changeMode('surveyor')}>Surveyor Mode {!user.surveyorEnabled && '— subscription required'}</MenuItem>
            </Menu>
          </>}
          <Tooltip title={mode === 'dark' ? 'Use light mode' : 'Use dark mode'}><IconButton onClick={toggle} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>{mode === 'dark' ? <LightModeRounded /> : <DarkModeRounded />}</IconButton></Tooltip>
          <Tooltip title="Notifications"><IconButton onClick={() => navigate('/app/notifications')}><Badge badgeContent={unread} color="error"><NotificationsRounded /></Badge></IconButton></Tooltip>
          <Tooltip title="Messages"><IconButton onClick={() => navigate('/app/messages')} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}><MessageRounded /></IconButton></Tooltip>
          <IconButton onClick={(e) => setAnchor(e.currentTarget)} sx={{ ml: .5 }}><Avatar src={user?.avatar} sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 14 }}>{user?.name?.[0]}</Avatar></IconButton>
          <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} PaperProps={{ sx: { mt: 1, minWidth: 210, borderRadius: 3 } }}>
            <Box sx={{ px: 2, py: 1.2 }}><Typography sx={{ fontWeight: 800, fontSize: 13 }}>{user?.name}</Typography><Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>{user?.email}</Typography></Box>
            <Divider />
            <MenuItem onClick={() => { setAnchor(null); navigate('/app/profile'); }}><PersonRounded fontSize="small" sx={{ mr: 1.2 }} />Profile</MenuItem>
            <MenuItem onClick={handleLogout}><LogoutRounded fontSize="small" sx={{ mr: 1.2 }} />Log out</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <ProfessionalDialog open={mobileSearchOpen} onClose={() => setMobileSearchOpen(false)} fullScreen professionalTitle="Search workspace" professionalSubtitle="Properties, tenants, surveys, documents and operations." enableMinimize={false}>
        <DialogContent sx={{ p: 2, pt: 2 }}>
          <Box component="form" onSubmit={(event) => { event.preventDefault(); const query = globalQuery.trim(); if (query.length >= 2) { setMobileSearchOpen(false); navigate(`/app/search?q=${encodeURIComponent(query)}`); } }} sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'action.hover', borderRadius: 3, px: 2, py: .7 }}>
            <SearchRounded color="action" />
            <InputBase autoFocus fullWidth value={globalQuery} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="Search your workspace…" inputProps={{ 'aria-label': 'Search workspace' }} />
            <Button type="submit" variant="contained" disabled={globalQuery.trim().length < 2}>Search</Button>
          </Box>
        </DialogContent>
      </ProfessionalDialog>

      <Drawer variant={isMobile ? 'temporary' : 'permanent'} open={isMobile ? mobileOpen : true} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ '& .MuiDrawer-paper': { width: isMobile ? drawerWidth : width, boxSizing: 'border-box', borderRight: '1px solid', borderColor: 'divider', transition: 'width .2s', overflowX: 'hidden' } }}>{drawerContent}</Drawer>

      <Box component="main" sx={{ ml: { md: `${width}px` }, pt: '72px', pb: { xs: 9, md: 0 }, minHeight: '100vh', transition: 'margin .2s' }}>
        <Box sx={{ px: { xs: 2, sm: 3, lg: 4 }, pt: 2.5 }}>
          <Breadcrumbs sx={{ mb: 1.5, '& .MuiTypography-root': { fontSize: 12 } }}><Typography color="text.secondary">{settings.shortTitle || settings.siteTitle || 'Platform'}</Typography><Typography color="text.primary">{currentModule?.label || moduleLabel(currentKey)}</Typography></Breadcrumbs>
        </Box>
        <Outlet />
      </Box>

      {isMobile && <BottomNavigation value={currentKey} onChange={(_e, value) => { const item = menu.find((candidate) => candidate.key === value); if (item) go(item); }} showLabels sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: theme.zIndex.appBar, borderTop: '1px solid', borderColor: 'divider', height: 70 }}>
        {primaryMobile.map((item) => { const Icon = item.icon; return <BottomNavigationAction key={item.key} value={item.key} label={item.label.split(' ')[0]} icon={<Icon />} />; })}
      </BottomNavigation>}

      <Tooltip title={moduleError || 'Help & support'}><IconButton onClick={() => navigate('/contact')} sx={{ position: 'fixed', right: 24, bottom: { xs: 88, md: 24 }, bgcolor: 'primary.main', color: 'primary.contrastText', boxShadow: 6, '&:hover': { bgcolor: 'primary.dark' } }}><HelpOutlineRounded /></IconButton></Tooltip>
    </Box>
  );
}
