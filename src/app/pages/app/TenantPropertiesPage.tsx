import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import { ApartmentRounded, LocationOnRounded, OpenInNewRounded } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { getResource } from '../../services/api';

type Variant = 'active' | 'pending' | 'rejected';

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);
const sentence = (value = '') => String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const purposeLabel = (purpose = 'rent') => (({ rent: 'Rented', sale: 'Purchased', lease: 'Leased' }) as Record<string, string>)[purpose] || sentence(purpose);

const VARIANTS: Record<Variant, { title: string; subtitle: string; statuses: string[]; empty: string; chipColor: 'success' | 'warning' | 'error' }> = {
  active: {
    title: 'My Properties',
    subtitle: 'Properties you have purchased, rented or leased.',
    statuses: ['approved', 'completed'],
    empty: 'You do not hold any active properties yet.',
    chipColor: 'success',
  },
  pending: {
    title: 'Pending Properties',
    subtitle: 'Properties you have applied for that are awaiting a landlord decision.',
    statuses: ['submitted', 'under_review', 'shortlisted', 'interview_requested', 'interview_scheduled', 'site_visit_scheduled', 'additional_documents_requested', 'documents_pending', 'waiting_list', 'agreement_pending', 'deposit_pending'],
    empty: 'You have no pending property applications.',
    chipColor: 'warning',
  },
  rejected: {
    title: 'Rejected Properties',
    subtitle: 'Properties you applied for that were declined by the landlord.',
    statuses: ['rejected'],
    empty: 'You have no rejected property applications.',
    chipColor: 'error',
  },
};

export default function TenantPropertiesPage({ variant }: { variant: Variant }) {
  const config = VARIANTS[variant];
  const { user } = useAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getResource('applications', { limit: 100, sort: '-createdAt' })
      .then((response) => { if (active) setApplications(response.data || []); })
      .catch((caught) => { if (active) setError((caught as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?._id, variant]);

  const rows = useMemo(() => {
    const uid = String(user?._id || '');
    const statuses = new Set(config.statuses);
    return applications.filter((application) => {
      const applicantId = String(application.applicant?._id || application.applicant || '');
      return applicantId === uid && statuses.has(application.status) && application.property;
    });
  }, [applications, config.statuses, user?._id]);

  if (loading) return <Box sx={{ py: 16, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;

  return <Box sx={{ px: { xs: 2, sm: 3, lg: 4 }, pb: 6 }}>
    <Box sx={{ mb: 3 }}>
      <Typography variant="h4" fontWeight={950}>{config.title}</Typography>
      <Typography color="text.secondary">{config.subtitle}</Typography>
    </Box>
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    {rows.length === 0
      ? <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => navigate('/marketplace')}>Browse properties</Button>}>{config.empty}</Alert>
      : <Grid container spacing={2}>
        {rows.map((application) => {
          const property = application.property || {};
          const purpose = property.purpose || property.listingType || 'rent';
          const price = property.pricing?.monthlyRent ?? property.pricing?.salePrice ?? property.pricing?.leaseAmount ?? property.price;
          return <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={application._id}>
            <Card variant="outlined" sx={{ borderRadius: 4, height: '100%' }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1} sx={{ mb: 1 }}>
                  <Chip size="small" color={config.chipColor} label={purposeLabel(purpose)} />
                  <Chip size="small" variant="outlined" label={sentence(application.status)} />
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <ApartmentRounded color="primary" fontSize="small" />
                  <Typography fontWeight={850} noWrap>{property.title || 'Property'}</Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1.5, color: 'text.secondary' }}>
                  <LocationOnRounded fontSize="inherit" />
                  <Typography variant="body2" color="text.secondary" noWrap>{[property.address?.city, property.address?.state].filter(Boolean).join(', ') || 'Location not set'}</Typography>
                </Stack>
                {Number(price) > 0 && <Typography fontWeight={900} fontSize={20}>{money(Number(price))}{purpose !== 'sale' && <Typography component="span" color="text.secondary" fontSize={13}> / month</Typography>}</Typography>}
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Applied on {new Date(application.submittedAt || application.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</Typography>
                {property._id && <Button size="small" startIcon={<OpenInNewRounded />} sx={{ mt: 1 }} onClick={() => navigate(`/marketplace/${property._id}`)}>View listing</Button>}
              </CardContent>
            </Card>
          </Grid>;
        })}
      </Grid>}
  </Box>;
}
