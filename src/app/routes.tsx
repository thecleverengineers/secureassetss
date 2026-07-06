import { createBrowserRouter, Navigate } from 'react-router';
import { Alert, Box, Button, Typography } from '@mui/material';
import FrontLayout from './components/FrontLayout';
import ProtectedRoute from './components/shared/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import RouteErrorPage from './components/shared/RouteErrorPage';
import { lazyWithRetry } from './utils/lazyWithRetry';

const Home = lazyWithRetry(() => import('./pages/PublicPages').then((module) => ({ default: module.Home })));
const Pricing = lazyWithRetry(() => import('./pages/PublicPages').then((module) => ({ default: module.Pricing })));
const About = lazyWithRetry(() => import('./pages/PublicPages').then((module) => ({ default: module.About })));
const Contact = lazyWithRetry(() => import('./pages/PublicPages').then((module) => ({ default: module.Contact })));
const DynamicContentPage = lazyWithRetry(() => import('./pages/PublicPages').then((module) => ({ default: module.DynamicContentPage })));
const MarketplacePage = lazyWithRetry(() => import('./pages/MarketplacePage'));
const PublicSearchPage = lazyWithRetry(() => import('./pages/PublicSearchPage'));
const PropertyDetailPage = lazyWithRetry(() => import('./pages/PropertyDetailPage'));
const SurveyorMarketplacePage = lazyWithRetry(() => import('./pages/SurveyorMarketplacePage'));
const SurveyorPublicProfilePage = lazyWithRetry(() => import('./pages/SurveyorPublicProfilePage'));
const SurveyorPrivateProfilePage = lazyWithRetry(() => import('./pages/SurveyorPrivateProfilePage'));
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'));
const ResetPasswordPage = lazyWithRetry(() => import('./pages/ResetPasswordPage'));
const PublicDrivePage = lazyWithRetry(() => import('./pages/PublicDrivePage'));
const RoleDashboardPage = lazyWithRetry(() => import('./pages/app/RoleDashboardPage'));
const ModulePage = lazyWithRetry(() => import('./pages/app/ModulePage'));

function AccessDenied() {
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}><Box sx={{ textAlign: 'center', maxWidth: 480 }}><Alert severity="error" sx={{ mb: 2 }}>Access denied</Alert><Typography variant="h4" sx={{ fontWeight: 900 }}>You do not have access to this module.</Typography><Button href="/app/dashboard" variant="contained" sx={{ mt: 3 }}>Return to dashboard</Button></Box></Box>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: FrontLayout,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, Component: Home },
      { path: 'marketplace', Component: MarketplacePage },
      { path: 'search', Component: PublicSearchPage },
      { path: 'marketplace/:id', Component: PropertyDetailPage },
      { path: 'surveyors', Component: SurveyorMarketplacePage },
      { path: 'surveyors/:id', Component: SurveyorPublicProfilePage },
      { path: 'surveyor-private/:id', Component: SurveyorPrivateProfilePage },
      { path: 'pricing', Component: Pricing },
      { path: 'about', Component: About },
      { path: 'contact', Component: Contact },
      { path: ':slug', Component: DynamicContentPage },
    ],
  },
  { path: '/login', Component: LoginPage, errorElement: <RouteErrorPage /> },
  { path: '/reset-password', Component: ResetPasswordPage, errorElement: <RouteErrorPage /> },
  { path: '/public-drive/:type/:token', Component: PublicDrivePage, errorElement: <RouteErrorPage /> },
  {
    path: '/app',
    Component: ProtectedRoute,
    errorElement: <RouteErrorPage />,
    children: [{
      Component: AppShell,
      children: [
        { index: true, element: <Navigate to="dashboard" replace /> },
        { path: 'dashboard', Component: RoleDashboardPage },
        { path: ':module', Component: ModulePage },
      ],
    }],
  },
  { path: '/dashboard', element: <Navigate to="/app/dashboard" replace /> },
  { path: '/access-denied', Component: AccessDenied },
  { path: '*', element: <Navigate to="/" replace /> },
]);
