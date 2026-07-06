import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  AppBar, BottomNavigation, BottomNavigationAction, Box, Button, Container, Divider, Drawer,
  IconButton, Stack, Toolbar, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import SellRoundedIcon from '@mui/icons-material/SellRounded';
import EngineeringRoundedIcon from '@mui/icons-material/EngineeringRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import { LogoMark } from './premium/LogoMark';
import { UniversalSearchDialog } from './public/UniversalSearch';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/SiteContext';

const publicIconByKey: Record<string, any> = {
  properties: StorefrontRoundedIcon,
  surveyors: EngineeringRoundedIcon,
  pricing: SellRoundedIcon,
  about: InfoOutlinedIcon,
  contact: MailOutlineRoundedIcon,
};

const fallbackNavigation = [
  { key: 'properties', label: 'Properties', path: '/marketplace', icon: StorefrontRoundedIcon },
  { key: 'surveyors', label: 'Surveyors', path: '/surveyors', icon: EngineeringRoundedIcon },
  { key: 'pricing', label: 'Pricing', path: '/pricing', icon: SellRoundedIcon },
  { key: 'about', label: 'About', path: '/about', icon: InfoOutlinedIcon },
  { key: 'contact', label: 'Contact', path: '/contact', icon: MailOutlineRoundedIcon },
];

export default function FrontLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user: currentUser } = useAuth();
  const { data: site, refresh: refreshSite } = useSite();
  const settings = site.settings || {};
  const nav = site.publicNavigation?.length
    ? site.publicNavigation.map((item: any) => ({ key: item.key, label: item.label, path: item.path, icon: publicIconByKey[item.key] || StorefrontRoundedIcon }))
    : fallbackNavigation;
  const primary = settings.brand?.primaryColor || '#0B5270';
  const secondary = settings.brand?.secondaryColor || '#073F56';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    refreshSite(location.pathname);
  }, [location.pathname, refreshSite]);

  useEffect(() => {
    const seo = site.seo || {};
    const defaults = settings.seo || {};
    const baseTitle = seo.title || defaults.defaultTitle || settings.siteTitle || 'SecureAsset';
    const template = defaults.titleTemplate || '%s';
    document.title = template.includes('%s') && baseTitle !== defaults.defaultTitle ? template.replace('%s', baseTitle) : baseTitle;

    const setMeta = (selector: string, attribute: 'name' | 'property', key: string, value?: string) => {
      let element = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!value) { element?.remove(); return; }
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, key);
        element.dataset.siteManaged = 'true';
        document.head.appendChild(element);
      }
      element.setAttribute('content', value);
    };
    const setLink = (rel: string, href?: string) => {
      let element = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!href) { if (element?.dataset.siteManaged === 'true') element.remove(); return; }
      if (!element) {
        element = document.createElement('link');
        element.rel = rel;
        element.dataset.siteManaged = 'true';
        document.head.appendChild(element);
      }
      element.href = href;
    };
    const canonicalBase = String(defaults.canonicalBaseUrl || '').replace(/\/$/, '');
    const canonical = seo.canonicalUrl || (canonicalBase ? `${canonicalBase}${location.pathname === '/' ? '' : location.pathname}` : window.location.href.split('#')[0].split('?')[0]);
    const description = seo.description || defaults.defaultDescription || settings.description;
    const image = seo.ogImageUrl || settings.defaultOgImageUrl;

    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[name="keywords"]', 'name', 'keywords', Array.isArray(seo.keywords || defaults.keywords) ? (seo.keywords || defaults.keywords).join(', ') : seo.keywords || defaults.keywords);
    setMeta('meta[name="robots"]', 'name', 'robots', seo.robots || defaults.robots || 'index,follow');
    setMeta('meta[name="google-site-verification"]', 'name', 'google-site-verification', defaults.googleSiteVerification);
    setMeta('meta[property="og:title"]', 'property', 'og:title', seo.ogTitle || baseTitle);
    setMeta('meta[property="og:description"]', 'property', 'og:description', seo.ogDescription || description);
    setMeta('meta[property="og:image"]', 'property', 'og:image', image);
    setMeta('meta[property="og:type"]', 'property', 'og:type', seo.ogType || 'website');
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', seo.twitterCard || 'summary_large_image');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', seo.ogTitle || baseTitle);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', seo.ogDescription || description);
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
    setLink('canonical', canonical);
    setLink('icon', settings.faviconUrl);

    const scriptId = 'site-json-ld';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    const structuredData = seo.structuredData || (canonicalBase ? {
      '@context': 'https://schema.org', '@type': 'Organization', name: settings.siteTitle || 'SecureAsset', url: canonicalBase,
      logo: settings.logoUrl || undefined, description: settings.description || undefined,
    } : null);
    if (structuredData) {
      if (!script) { script = document.createElement('script'); script.id = scriptId; script.type = 'application/ld+json'; document.head.appendChild(script); }
      script.textContent = JSON.stringify(structuredData);
    } else script?.remove();
  }, [site.seo, settings, location.pathname]);

  const activeMobile = useMemo(() => {
    if (location.pathname.startsWith('/marketplace')) return 'properties';
    if (location.pathname.startsWith('/surveyors')) return 'surveyors';
    if (location.pathname === '/search') return 'search';
    if (location.pathname === '/') return 'home';
    return 'account';
  }, [location.pathname]);

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#FAFAFA' }}>
      <AppBar
        position="fixed"
        elevation={scrolled ? 5 : 0}
        sx={{
          bgcolor: primary,
          borderBottom: '1px solid rgba(255,255,255,.1)',
          transition: 'box-shadow .25s ease, background-color .25s ease',
          zIndex: theme.zIndex.appBar,
        }}
      >
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ minHeight: { xs: 60, md: 72 }, gap: { xs: 1, md: 2.5 } }}>
            <Box onClick={() => navigate('/')} sx={{ flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <LogoMark light />
            </Box>

            <Stack direction="row" spacing={{ md: 2.5, xl: 4 }} sx={{ display: { xs: 'none', lg: 'flex' }, flex: 1, justifyContent: 'center', minWidth: 0 }}>
              {nav.map((item) => {
                const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`));
                return (
                  <Button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    disableRipple
                    sx={{
                      color: active ? '#fff' : 'rgba(255,255,255,.72)', textTransform: 'none', fontWeight: active ? 850 : 650,
                      fontSize: 13, minWidth: 0, px: .5, whiteSpace: 'nowrap', position: 'relative',
                      '&::after': { content: '""', position: 'absolute', left: 4, right: 4, bottom: 5, height: 2, borderRadius: 2, bgcolor: active ? '#fff' : 'transparent' },
                      '&:hover': { bgcolor: 'transparent', color: '#fff' },
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </Stack>

            <Stack direction="row" alignItems="center" spacing={{ xs: .5, sm: 1, md: 1.4 }} sx={{ ml: 'auto', flexShrink: 0 }}>
              <Button
                onClick={() => setSearchOpen(true)}
                startIcon={<SearchRoundedIcon />}
                sx={{
                  color: '#fff', borderColor: 'rgba(255,255,255,.34)', borderRadius: 999, textTransform: 'none', fontWeight: 800,
                  minWidth: { xs: 42, sm: 110 }, px: { xs: 1.1, sm: 1.8 }, height: 40,
                  '& .MuiButton-startIcon': { m: { xs: 0, sm: '0 8px 0 -4px' } },
                  '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,.08)' },
                }}
                variant="outlined"
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Search</Box>
              </Button>

              {currentUser ? (
                <Button
                  onClick={() => navigate('/app/dashboard')}
                  startIcon={<DashboardRoundedIcon />}
                  sx={{ display: { xs: 'none', sm: 'inline-flex' }, color: '#fff', textTransform: 'none', fontWeight: 800, borderRadius: 999 }}
                >
                  Dashboard
                </Button>
              ) : (
                <Button
                  onClick={() => navigate('/login')}
                  sx={{ display: { xs: 'none', sm: 'inline-flex' }, color: '#fff', textTransform: 'none', fontWeight: 800, borderRadius: 999 }}
                >
                  Log in
                </Button>
              )}

              <Button
                variant="contained"
                onClick={() => navigate('/contact')}
                disableElevation
                sx={{ display: { xs: 'none', xl: 'inline-flex' }, bgcolor: '#fff', color: secondary, borderRadius: 999, textTransform: 'none', fontWeight: 900, px: 2.4, '&:hover': { bgcolor: 'rgba(255,255,255,.92)' } }}
              >
                Get started
              </Button>

              <IconButton onClick={() => setOpen(true)} sx={{ display: { lg: 'none' }, color: '#fff' }} aria-label="Open navigation">
                <MenuRoundedIcon />
              </IconButton>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 380 }, bgcolor: secondary, color: '#fff' } }}
      >
        <Stack sx={{ minHeight: '100%' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 3 }}>
            <LogoMark light />
            <IconButton onClick={() => setOpen(false)} sx={{ color: '#fff' }}><CloseRoundedIcon /></IconButton>
          </Stack>
          <Divider sx={{ borderColor: 'rgba(255,255,255,.1)' }} />
          <Stack spacing={.7} sx={{ p: 2, flex: 1 }}>
            {nav.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`));
              return (
                <Button
                  key={item.path}
                  onClick={() => go(item.path)}
                  startIcon={<Icon />}
                  sx={{ justifyContent: 'flex-start', textTransform: 'none', color: '#fff', bgcolor: active ? 'rgba(255,255,255,.13)' : 'transparent', borderRadius: 3, px: 2, py: 1.4, fontWeight: active ? 850 : 650 }}
                >
                  {item.label}
                </Button>
              );
            })}
            <Button onClick={() => { setOpen(false); setSearchOpen(true); }} startIcon={<SearchRoundedIcon />} sx={{ justifyContent: 'flex-start', textTransform: 'none', color: '#fff', borderRadius: 3, px: 2, py: 1.4, fontWeight: 700 }}>
              Search everything
            </Button>
          </Stack>
          <Box sx={{ p: 3 }}>
            <Box sx={{ p: 2.5, borderRadius: 4, bgcolor: 'rgba(0,0,0,.16)', border: '1px solid rgba(255,255,255,.08)' }}>
              <Typography sx={{ fontWeight: 900 }}>Manage property with confidence</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.66)', fontSize: 12.5, lineHeight: 1.6, mt: .7, mb: 2 }}>Access rentals, documents, surveys and trusted marketplace tools from one account.</Typography>
              <Button fullWidth variant="contained" endIcon={<ArrowForwardRoundedIcon />} onClick={() => go(currentUser ? '/app/dashboard' : '/login')} sx={{ bgcolor: '#fff', color: secondary, borderRadius: 2.5, textTransform: 'none', fontWeight: 900, '&:hover': { bgcolor: 'rgba(255,255,255,.92)' } }}>
                {currentUser ? 'Open dashboard' : 'Log in or register'}
              </Button>
            </Box>
          </Box>
        </Stack>
      </Drawer>

      <UniversalSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />

      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', pt: { xs: '60px', md: '72px' }, pb: mobile ? '72px' : 0 }}>
        <Outlet />
      </Box>

      <Box component="footer" sx={{ bgcolor: secondary, color: '#f8fafc', pt: { xs: 8, md: 11 }, pb: mobile ? 13 : 6, mt: 'auto' }}>
        <Container maxWidth="xl">
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={8}>
            <Box sx={{ maxWidth: 360 }}>
              <Box sx={{ mb: 3 }}><LogoMark light /></Box>
              <Typography sx={{ color: 'rgba(255,255,255,.68)', fontSize: 13, lineHeight: 1.8, fontWeight: 500 }}>
                {settings.description || settings.tagline || 'A premium property operating system for rentals, tenancy, surveys and secure records.'}
              </Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 5, sm: 9, md: 13 }}>
              {[
                ['Platform', ['Marketplace', 'Pricing', 'AI Trust']],
                ['Operations', ['Rent automation', 'Document vault', 'Surveyor reports']],
                ['Access', ['Secure login', 'Mobile experience', 'Admin console']],
              ].map(([title, links]) => (
                <Box key={title as string}>
                  <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', mb: 2 }}>{title as string}</Typography>
                  <Stack spacing={1.4}>{(links as string[]).map((item) => <Typography key={item} sx={{ color: 'rgba(255,255,255,.58)', fontSize: 13 }}>{item}</Typography>)}</Stack>
                </Box>
              ))}
            </Stack>
          </Stack>
          <Divider sx={{ my: 5, borderColor: 'rgba(255,255,255,.1)' }} />
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
            <Typography sx={{ color: 'rgba(255,255,255,.48)', fontSize: 12 }}>© {new Date().getFullYear()} {settings.siteTitle || 'SecureAsset'}. All rights reserved.</Typography>
            <Stack direction="row" spacing={3}>{['Privacy Policy', 'Terms of Service', 'Security'].map((item) => <Typography key={item} sx={{ color: 'rgba(255,255,255,.48)', fontSize: 12 }}>{item}</Typography>)}</Stack>
          </Stack>
        </Container>
      </Box>

      {mobile && (
        <BottomNavigation
          showLabels
          value={activeMobile}
          onChange={(_event, value) => {
            if (value === 'search') setSearchOpen(true);
            else if (value === 'account') navigate(currentUser ? '/app/dashboard' : '/login');
            else if (value === 'home') navigate('/');
            else if (value === 'properties') navigate('/marketplace');
            else if (value === 'surveyors') navigate('/surveyors');
          }}
          sx={{
            position: 'fixed', left: 0, right: 0, bottom: 0, height: 72, zIndex: theme.zIndex.appBar + 2,
            borderTop: '1px solid', borderColor: 'divider', boxShadow: '0 -12px 32px rgba(15,23,42,.08)',
            '& .MuiBottomNavigationAction-root': { minWidth: 0, px: .5 },
            '& .MuiBottomNavigationAction-label': { fontSize: 10.5, fontWeight: 750 },
          }}
        >
          <BottomNavigationAction value="home" label="Home" icon={<HomeRoundedIcon />} />
          <BottomNavigationAction value="properties" label="Properties" icon={<StorefrontRoundedIcon />} />
          <BottomNavigationAction value="search" label="Search" icon={<SearchRoundedIcon />} />
          <BottomNavigationAction value="surveyors" label="Surveyors" icon={<EngineeringRoundedIcon />} />
          <BottomNavigationAction value="account" label={currentUser ? 'Dashboard' : 'Account'} icon={currentUser ? <DashboardRoundedIcon /> : <PersonRoundedIcon />} />
        </BottomNavigation>
      )}
    </Box>
  );
}
