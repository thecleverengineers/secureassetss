import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Alert, Box, Button, Card, CardContent, CardMedia, Chip, Container, FormControlLabel, Grid,
  InputAdornment, MenuItem, Pagination, Skeleton, Stack, Switch, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import {
  ApartmentRounded, BedRounded, HomeWorkRounded, LocationOnOutlined, MeetingRoomRounded,
  SearchRounded, SquareFootOutlined, StarRounded, StorefrontRounded, VerifiedRounded,
} from '@mui/icons-material';
import type { Property, PropertyFilters, User } from '../services/types';
import { getProperties } from '../services/api';
import { useSite } from '../context/SiteContext';
import { UniversalSearchField } from '../components/public/UniversalSearch';
import LocationFields from '../components/shared/LocationFields';

const money = (value: number) => {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1)} Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1)} L`;
  if (value >= 1_000) return `₹${Math.round(value / 1_000)}K`;
  return `₹${value || 0}`;
};
const sentence = (value: string) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const fallback = 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80';
const bool = (value: string | null) => value === 'true';

function filtersFromParams(params: URLSearchParams): PropertyFilters {
  const listingType = params.get('listingType');
  return {
    type: params.get('type') || 'all',
    listingType: listingType === 'sale' || listingType === 'lease' || listingType === 'rent' ? listingType : 'rent',
    search: params.get('search') || '',
    city: params.get('city') || '',
    state: params.get('state') || '',
    country: params.get('country') || '',
    address: params.get('address') || '',
    landlord: params.get('landlord') || '',
    verified: bool(params.get('verified')),
    trustedSeller: bool(params.get('trustedSeller')),
    minPrice: params.get('minPrice') ? Number(params.get('minPrice')) : undefined,
    maxPrice: params.get('maxPrice') ? Number(params.get('maxPrice')) : undefined,
    page: Math.max(Number(params.get('page') || 1), 1),
    limit: 12,
  };
}

function ListingCard({ property }: { property: Property }) {
  const navigate = useNavigate();
  const purpose = property.listingType || property.purpose || (property.isSale ? 'sale' : 'rent');
  const owner = typeof property.owner === 'object' ? property.owner as User & { verified?: boolean; trusted?: boolean } : null;
  const address = [property.address?.line1, property.address?.city, property.address?.state, property.address?.country].filter(Boolean).join(', ');

  return (
    <Card
      variant="outlined"
      onClick={() => navigate(`/marketplace/${property._id}`)}
      sx={{ height: '100%', borderRadius: 4, overflow: 'hidden', cursor: 'pointer', transition: 'transform .2s, box-shadow .2s', '&:hover': { transform: 'translateY(-5px)', boxShadow: 8 } }}
    >
      <Box sx={{ position: 'relative' }}>
        <CardMedia component="img" height={220} image={property.images?.[0] || property.galleryCover || fallback} alt={property.title} sx={{ objectFit: 'cover' }} />
        <Stack direction="row" gap={.7} flexWrap="wrap" sx={{ position: 'absolute', top: 12, left: 12, right: 42 }}>
          <Chip size="small" label={sentence(purpose)} color="primary" />
          {property.listingKind === 'space' && <Chip size="small" label={sentence(property.type)} icon={property.type === 'bed' ? <BedRounded /> : <MeetingRoomRounded />} />}
          {property.isFeatured && <Chip size="small" icon={<StarRounded />} label="Featured" sx={{ bgcolor: 'warning.main' }} />}
        </Stack>
        {property.isVerified && <VerifiedRounded color="primary" sx={{ position: 'absolute', top: 14, right: 14, bgcolor: 'background.paper', borderRadius: '50%' }} />}
      </Box>
      <CardContent>
        <Typography fontWeight={900} fontSize={17} noWrap>{property.title}</Typography>
        <Stack direction="row" alignItems="center" gap={.5} mt={.7}>
          <LocationOnOutlined fontSize="small" color="disabled" />
          <Typography color="text.secondary" fontSize={12.5} noWrap>{address || 'Location available on request'}</Typography>
        </Stack>
        {owner?.name && (
          <Stack direction="row" alignItems="center" gap={.7} mt={1.2}>
            <HomeWorkRounded sx={{ fontSize: 16, color: 'text.disabled' }} />
            <Typography color="text.secondary" fontSize={11.5} noWrap>{owner.name}</Typography>
            {owner.trusted && <Chip size="small" label="Trusted" color="success" sx={{ height: 20, '& .MuiChip-label': { px: .8, fontSize: 9.5 } }} />}
          </Stack>
        )}
        <Stack direction="row" gap={2} mt={2}>
          {property.bedrooms !== null && property.bedrooms !== undefined && <Stack direction="row" gap={.6} alignItems="center"><BedRounded fontSize="small" color="disabled" /><Typography fontSize={12}>{property.bedrooms} beds</Typography></Stack>}
          <Stack direction="row" gap={.6} alignItems="center"><SquareFootOutlined fontSize="small" color="disabled" /><Typography fontSize={12}>{Number(property.area || 0).toLocaleString()} {property.areaUnit || 'sqft'}</Typography></Stack>
        </Stack>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-end" mt={2.2}>
          <Box>
            <Typography color="text.secondary" fontSize={10.5} fontWeight={750}>{purpose === 'rent' ? 'MONTHLY RENT' : purpose === 'lease' ? 'LEASE AMOUNT' : 'SALE PRICE'}</Typography>
            <Typography color="primary" fontWeight={950} fontSize={22}>{money(Number(property.price || 0))}</Typography>
          </Box>
          {property.urgentType && property.urgentType !== 'none' && <Chip size="small" color="error" label={sentence(property.urgentType)} />}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function MarketplacePage() {
  const { data: { settings, propertyTypes } } = useSite();
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<PropertyFilters>(() => filtersFromParams(searchParams));
  const paramsKey = searchParams.toString();

  useEffect(() => {
    setFilters(filtersFromParams(new URLSearchParams(paramsKey)));
  }, [paramsKey]);

  const types = useMemo(() => [
    { key: 'all', label: 'All property types' },
    ...(propertyTypes || []).map((item: any) => ({ key: item.key, label: item.label })),
  ], [propertyTypes]);

  const updateFilters = (patch: Partial<PropertyFilters>) => {
    const next = { ...filters, ...patch };
    if (!Object.prototype.hasOwnProperty.call(patch, 'page')) next.page = 1;
    setFilters(next);
    const params = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => {
      if (value === undefined || value === '' || value === false || value === 'all' || key === 'limit') return;
      if (key === 'page' && value === 1) return;
      params.set(key, String(value));
    });
    setSearchParams(params, { replace: true });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getProperties(filters);
      setListings(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages || Math.max(1, Math.ceil(result.total / 12)));
    } catch (loadError) {
      setListings([]);
      setTotal(0);
      setError(loadError instanceof Error ? loadError.message : 'Could not load marketplace listings.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const clear = () => updateFilters({
    type: 'all', listingType: 'rent', search: '', city: '', state: '', country: '', address: '',
    landlord: '', verified: false, trustedSeller: false, minPrice: undefined, maxPrice: undefined, page: 1,
  });

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
      <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', py: { xs: 5, md: 8 } }}>
        <Container maxWidth="xl">
          <Typography fontWeight={800} fontSize={12} sx={{ opacity: .72, letterSpacing: '.12em' }}>PROPERTY & TRUST MARKETPLACE</Typography>
          <Typography fontWeight={950} fontSize={{ xs: 34, md: 50 }} letterSpacing="-.04em" mt={1}>Find the right property and the right people.</Typography>
          <Typography sx={{ opacity: .78, maxWidth: 760, mt: 1, mb: 3.5 }}>{settings.tagline || 'Search public properties, verified rentals, trusted sellers, landlords, surveyors and locations from one place.'}</Typography>
          <Box sx={{ maxWidth: 900 }}><UniversalSearchField placeholder="Search property, surveyor, trusted seller, landlord, city, state or address…" /></Box>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
        <Stack direction={{ xs: 'column', xl: 'row' }} justifyContent="space-between" gap={2.5} mb={3}>
          <Stack gap={1.5} sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} gap={1.2} alignItems={{ xs: 'stretch', md: 'center' }}>
              <ToggleButtonGroup
                exclusive
                value={filters.listingType}
                onChange={(_event, value) => value && updateFilters({ listingType: value })}
                size="small"
                sx={{ alignSelf: { xs: 'stretch', md: 'center' }, '& .MuiToggleButton-root': { flex: { xs: 1, md: 'none' }, fontWeight: 800 } }}
              >
                <ToggleButton value="rent">For Rent</ToggleButton>
                <ToggleButton value="sale">For Sale</ToggleButton>
                <ToggleButton value="lease">For Lease</ToggleButton>
              </ToggleButtonGroup>
              <TextField
                size="small"
                fullWidth
                placeholder="Search within listings by title, type, city, state, country or address"
                value={filters.search || ''}
                onChange={(event) => updateFilters({ search: event.target.value })}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }}
                sx={{ maxWidth: { md: 520 } }}
              />
            </Stack>

            <Stack direction="row" gap={1.2} flexWrap="wrap" alignItems="center">
              <TextField select size="small" label="Property type" value={filters.type || 'all'} onChange={(event) => updateFilters({ type: event.target.value })} sx={{ minWidth: 190 }}>
                {types.map((item) => <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>)}
              </TextField>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(150px, 1fr))' }, gap: 1.2, flex: '1 1 520px', maxWidth: 650 }}>
                <LocationFields value={{ country: filters.country, state: filters.state, city: filters.city }} onChange={(next) => updateFilters({ country: next.country || '', state: next.state || '', city: next.city || '' })} />
              </Box>
              <TextField size="small" label="Address / locality" value={filters.address || ''} onChange={(event) => updateFilters({ address: event.target.value })} sx={{ minWidth: 190 }} />
              <TextField size="small" type="number" label="Minimum price" value={filters.minPrice || ''} onChange={(event) => updateFilters({ minPrice: event.target.value ? Number(event.target.value) : undefined })} sx={{ width: 155 }} />
              <TextField size="small" type="number" label="Maximum price" value={filters.maxPrice || ''} onChange={(event) => updateFilters({ maxPrice: event.target.value ? Number(event.target.value) : undefined })} sx={{ width: 155 }} />
            </Stack>

            <Stack direction="row" gap={1.2} flexWrap="wrap" alignItems="center">
              <FormControlLabel control={<Switch checked={Boolean(filters.verified)} onChange={(_event, checked) => updateFilters({ verified: checked })} />} label="Verified listings only" />
              <FormControlLabel control={<Switch checked={Boolean(filters.trustedSeller)} onChange={(_event, checked) => updateFilters({ trustedSeller: checked })} />} label="Trusted sellers only" />
              {filters.landlord && <Chip icon={<HomeWorkRounded />} color="primary" label="Filtered by landlord" onDelete={() => updateFilters({ landlord: '' })} />}
              {(filters.search || filters.city || filters.state || filters.country || filters.address || filters.minPrice || filters.maxPrice || filters.verified || filters.trustedSeller || filters.landlord) && <Button size="small" onClick={clear}>Clear all filters</Button>}
            </Stack>
          </Stack>

          <Stack direction="row" alignItems="center" gap={1} sx={{ alignSelf: { xl: 'flex-start' }, p: 1.2, px: 1.8, borderRadius: 999, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <ApartmentRounded color="primary" />
            <Typography fontWeight={850}>{total} live listings</Typography>
          </Stack>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        <Grid container spacing={2.5}>
          {loading
            ? Array.from({ length: 8 }).map((_, index) => <Grid size={{ xs: 12, sm: 6, lg: 4, xl: 3 }} key={index}><Skeleton variant="rounded" height={430} /></Grid>)
            : listings.map((property) => <Grid size={{ xs: 12, sm: 6, lg: 4, xl: 3 }} key={property._id}><ListingCard property={property} /></Grid>)}
        </Grid>

        {!loading && !listings.length && !error && (
          <Box py={12} textAlign="center">
            <StorefrontRounded color="disabled" sx={{ fontSize: 50, mb: 1 }} />
            <Typography fontWeight={900} fontSize={22}>No matching listings</Typography>
            <Typography color="text.secondary">Try another property type, seller, location or price range.</Typography>
            <Button sx={{ mt: 2 }} onClick={clear}>Clear filters</Button>
          </Box>
        )}

        {totalPages > 1 && (
          <Stack alignItems="center" mt={5}>
            <Pagination color="primary" count={totalPages} page={filters.page || 1} onChange={(_event, page) => updateFilters({ page })} />
          </Stack>
        )}
      </Container>
    </Box>
  );
}
