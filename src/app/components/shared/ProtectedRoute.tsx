import { Box, CircularProgress } from '@mui/material';
import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../services/types';

export default function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { user, loading } = useAuth();
  if (loading) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/access-denied" replace />;
  return <Outlet />;
}
