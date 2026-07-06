import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  ImageList,
  ImageListItem,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import {
  BathtubRounded,
  BedRounded,
  CalendarMonthRounded,
  CheckCircleRounded,
  DirectionsRounded,
  EmailRounded,
  LocationOnRounded,
  MeetingRoomRounded,
  ShareRounded,
  SquareFootRounded,
  WhatsApp,
} from '@mui/icons-material';
import { getPropertyById, getPublicPropertyStructure } from '../services/api';
import { useSite } from '../context/SiteContext';
import type { Property } from '../services/types';

const fallback = 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=85';
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);
const sentence = (value: string) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const flatten = (nodes: any[]): any[] => nodes.flatMap((node) => [node, ...flatten(node.children || [])]);

export default function PropertyDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: siteData } = useSite();
  const [listing, setListing] = useState<Property | null>(null);
  const [structure, setStructure] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [basic, details] = await Promise.all([getPropertyById(id), getPublicPropertyStructure(id)]);
        setListing(basic.data);
        setStructure(details.data);
      } catch (cause) {
        setError((cause as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const property = structure?.property || listing;
  const selected = structure?.selectedSpace || ((listing as any)?.listingKind === 'space' ? listing : null);
  const spaces = useMemo(() => flatten(structure?.spaces || []), [structure]);
  const media = useMemo(() => {
    const all = [...(structure?.media || [])];
    spaces.forEach((space) => all.push(...(space.media || [])));
    return all.filter((item, index, array) => array.findIndex((other) => other._id === item._id) === index);
  }, [structure, spaces]);

  if (loading) return <Box sx={{ py: 20, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  if (error || !property) return <Container sx={{ py: 10 }}><Alert severity="error">{error || 'Listing not found'}</Alert></Container>;

  const images = media.filter((item: any) => (item.mediaType === 'image' || !item.mediaType) && item.category !== 'floor_plan');
  const tourMedia = media.filter((item: any) => ['video_tour', 'virtual_360_tour'].includes(item.category));
  const floorPlanMedia = media.filter((item: any) => item.category === 'floor_plan');
  const displayImages = images.length
    ? images.map((item: any) => item.url)
    : [...(listing?.images || []), property.galleryCover].filter(Boolean);
  const active: any = selected || property;
  const price = Number(
    selected?.price
    || listing?.price
    || property.pricing?.salePrice
    || property.pricing?.monthlyRent
    || property.pricing?.leaseAmount
    || property.price
    || 0,
  );
  const purpose = selected?.purpose || listing?.listingType || property.purpose || property.listingType || 'rent';
  const lat = property.map?.latitude;
  const lng = property.map?.longitude;
  const address = [property.address?.line1, property.address?.locality, property.address?.city, property.address?.district, property.address?.state].filter(Boolean).join(', ');
  const directions = lat && lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const mapSettings = siteData.settings?.map || {};
  const mapQuery = lat && lng ? `${lat},${lng}` : address;
  const mapEmbedUrl = mapSettings.provider === 'google' && mapSettings.publicApiKey
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(mapSettings.publicApiKey)}&q=${encodeURIComponent(mapQuery)}`
    : lat && lng
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${Number(lng)-0.01}%2C${Number(lat)-0.01}%2C${Number(lng)+0.01}%2C${Number(lat)+0.01}&layer=mapnik&marker=${lat}%2C${lng}`
      : '';
  const publicUrl = window.location.href;

  const share = (kind: 'copy' | 'whatsapp' | 'email') => {
    if (kind === 'copy') {
      void navigator.clipboard.writeText(publicUrl);
      return;
    }
    if (kind === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${active.title || active.name} · ${money(price)} · ${publicUrl}`)}`, '_blank');
      return;
    }
    window.location.href = `mailto:?subject=${encodeURIComponent(active.title || active.name)}&body=${encodeURIComponent(publicUrl)}`;
  };

  const detailRows: Array<[ReactNode, string, string]> = [
    [<SquareFootRounded key="area-icon" />, 'Area', `${Number(active.area?.value || listing?.area || property.areas?.total || property.area || 0).toLocaleString()} ${active.area?.unit || listing?.areaUnit || property.areas?.unit || 'sqft'}`],
    [<BedRounded key="bed-icon" />, 'Bedrooms', String(active.roomDetails?.bedrooms ?? listing?.bedrooms ?? property.roomDetails?.bedrooms ?? property.roomCounts?.bedrooms ?? '—')],
    [<BathtubRounded key="bath-icon" />, 'Bathrooms', String(active.roomDetails?.bathrooms ?? listing?.bathrooms ?? property.roomDetails?.bathrooms ?? property.roomCounts?.bathrooms ?? '—')],
    [<MeetingRoomRounded key="status-icon" />, 'Availability', sentence(active.status || property.status)],
  ];

  const occupancyRows: Array<[string, unknown]> = [
    ['Maximum occupants', active.occupancyRules?.maxTotal ?? property.occupancyRules?.maxTotal],
    ['Maximum adults', active.occupancyRules?.maxAdults ?? property.occupancyRules?.maxAdults],
    ['Maximum children', active.occupancyRules?.maxChildren ?? property.occupancyRules?.maxChildren],
    ['Family allowed', active.occupancyRules?.familyAllowed ?? property.occupancyRules?.familyAllowed],
    ['Bachelors allowed', active.occupancyRules?.bachelorsAllowed ?? property.occupancyRules?.bachelorsAllowed],
    ['Students allowed', active.occupancyRules?.studentsAllowed ?? property.occupancyRules?.studentsAllowed],
    ['Pets allowed', active.occupancyRules?.petsAllowed ?? property.occupancyRules?.petsAllowed],
  ];

  const specifications: any = property.specifications || {};
  const parking: any = property.parking || {};
  const utilities: any = property.utilities || {};
  const legal: any = property.legalDetails || {};
  const nearby: any = property.nearbyFacilities || {};
  const publicContact: any = property.publicContact || {};
  const specificationRows: Array<[string, unknown]> = [
    ['Bedrooms (BHK)', specifications.bedrooms ?? property.bedrooms], ['Bathrooms', specifications.bathrooms ?? property.bathrooms],
    ['Balconies', specifications.balconies], ['Rooms', specifications.rooms], ['Number of floors', specifications.numberOfFloors],
    ['Floor number', specifications.floorNumber], ['Total floors in building', specifications.totalFloorsInBuilding],
    ['Built-up area', property.areas?.builtUpSqft ? `${property.areas.builtUpSqft} sq. ft. / ${property.areas.builtUpSqm || '—'} sq. meter` : property.areas?.builtUp ? `${property.areas.builtUp} ${property.areas?.unit || 'sqft'}` : undefined],
    ['Carpet area', property.areas?.carpetSqft ? `${property.areas.carpetSqft} sq. ft. / ${property.areas.carpetSqm || '—'} sq. meter` : property.areas?.carpet ? `${property.areas.carpet} ${property.areas?.unit || 'sqft'}` : undefined],
    ['Plot area', property.areas?.plot ? `${property.areas.plot} ${property.areas?.unit || 'sqft'}` : undefined],
    ['Super built-up area', property.areas?.superBuiltUp ? `${property.areas.superBuiltUp} ${property.areas?.unit || 'sqft'}` : undefined],
    ['Facing', specifications.facing], ['Property age', specifications.propertyAge !== undefined ? `${specifications.propertyAge} years` : undefined],
    ['Furnishing', specifications.furnishingStatus], ['Ownership type', specifications.ownershipType],
    ['Available from', specifications.availableFrom ? new Date(String(specifications.availableFrom)).toLocaleDateString('en-IN') : undefined],
  ];
  const pricingRows: Array<[string, unknown]> = [
    ['Sale price', property.pricing?.salePrice ? money(Number(property.pricing.salePrice)) : undefined],
    ['Monthly rent', property.pricing?.monthlyRent ? money(Number(property.pricing.monthlyRent)) : undefined],
    ['Lease amount', property.pricing?.leaseAmount ? money(Number(property.pricing.leaseAmount)) : undefined],
    ['Security deposit', property.pricing?.securityDeposit ? money(Number(property.pricing.securityDeposit)) : undefined],
    ['Maintenance charges', property.pricing?.maintenanceCharge ? money(Number(property.pricing.maintenanceCharge)) : undefined],
    ['Price per sq. ft.', property.pricing?.pricePerUnitArea ? money(Number(property.pricing.pricePerUnitArea)) : undefined],
    ['Property tax', property.pricing?.propertyTax ? money(Number(property.pricing.propertyTax)) : undefined],
  ];
  const utilityRows: Array<[string, unknown]> = [
    ['Water supply', utilities.waterSupply], ['Electricity connection', utilities.electricityConnection], ['Power backup', utilities.powerBackup],
    ['Internet availability', utilities.internetAvailability], ['Gas connection', utilities.gasConnection], ['Sewage connection', utilities.sewageConnection],
  ];
  const legalRows: Array<[string, unknown]> = [
    ['RERA number', legal.reraNumber], ['Title clear', legal.titleClear], ['Loan approved', legal.loanApproved],
    ['Occupancy certificate', legal.occupancyCertificate], ['Completion certificate', legal.completionCertificate],
  ];
  const nearbyRows = Object.entries(nearby).map(([key, value]) => [sentence(key), value] as [string, unknown]);
  const hasValue = (value: unknown) => value !== undefined && value !== null && value !== '';
  const renderRows = (rows: Array<[string, unknown]>) => rows.filter(([, value]) => hasValue(value)).map(([label, value]) => (
    <Grid size={{ xs: 12, sm: 6 }} key={label}>
      <Stack direction="row" justifyContent="space-between" gap={2} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography color="text.secondary" fontSize={13}>{label}</Typography>
        <Typography fontWeight={800} fontSize={13} textAlign="right">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : sentence(String(value))}</Typography>
      </Stack>
    </Grid>
  ));

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pb: 8 }}>
      <Container maxWidth="xl" sx={{ pt: 4 }}>
        <Stack direction="row" gap={1} flexWrap="wrap" mb={2}>
          <Chip color="primary" label={sentence(purpose)} />
          <Chip label={sentence(selected?.level || property.type)} />
          {property.isVerified && <Chip color="success" icon={<CheckCircleRounded />} label="Verified listing" />}
          {property.promotion?.urgentType && property.promotion.urgentType !== 'none' && <Chip color="error" label={sentence(property.promotion.urgentType)} />}
        </Stack>

        <Typography variant="h3" fontWeight={950} letterSpacing="-.04em">
          {active.name ? `${active.name} · ${property.title}` : property.title}
        </Typography>
        <Stack direction="row" alignItems="center" gap={0.7} mt={1}>
          <LocationOnRounded color="disabled" />
          <Typography color="text.secondary">
            {address || `${property.address?.city || 'Location'} — exact address available according to owner privacy settings`}
          </Typography>
        </Stack>

        <Grid container spacing={3} mt={1}>
          <Grid size={{ xs: 12, lg: 8 }}>
            {displayImages.length ? (
              <ImageList cols={displayImages.length > 1 ? 2 : 1} gap={10} sx={{ m: 0, borderRadius: 4, overflow: 'hidden' }}>
                {displayImages.slice(0, 6).map((url: string, index: number) => (
                  <ImageListItem key={`${url}-${index}`} cols={index === 0 && displayImages.length > 2 ? 2 : 1} rows={index === 0 && displayImages.length > 2 ? 2 : 1}>
                    <Box component="img" src={url || fallback} alt={`${property.title} ${index + 1}`} sx={{ width: '100%', height: index === 0 && displayImages.length > 2 ? 500 : 245, objectFit: 'cover' }} />
                  </ImageListItem>
                ))}
              </ImageList>
            ) : <CardMedia component="img" height={500} image={fallback} />}
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, position: { lg: 'sticky' }, top: { lg: 90 } }}>
              <Typography color="text.secondary" fontSize={11} fontWeight={800}>
                {purpose === 'rent' ? 'MONTHLY RENT' : purpose === 'sale' ? 'SALE PRICE' : 'LEASE AMOUNT'}
              </Typography>
              <Typography fontSize={37} fontWeight={950} color="primary">{money(price)}</Typography>
              {(active.securityDeposit || property.pricing?.securityDeposit) ? (
                <Typography color="text.secondary" fontSize={13}>
                  Security deposit {money(Number(active.securityDeposit || property.pricing?.securityDeposit || 0))}
                </Typography>
              ) : null}
              <Divider sx={{ my: 2.5 }} />
              <Stack spacing={1.5}>
                {detailRows.map(([icon, label, value]) => (
                  <Stack key={label} direction="row" justifyContent="space-between">
                    <Stack direction="row" gap={1} color="text.secondary">{icon}<Typography fontSize={13}>{label}</Typography></Stack>
                    <Typography fontWeight={800} fontSize={13}>{value}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Button fullWidth variant="contained" size="large" sx={{ mt: 3 }} onClick={() => navigate(`/app/applications?new=1&property=${property._id}${selected ? `&targetSpace=${selected._id}` : ''}`)}>
                Apply for this {selected?.level || 'property'}
              </Button>
              <Button fullWidth variant="outlined" size="large" startIcon={<CalendarMonthRounded />} sx={{ mt: 1 }} onClick={() => navigate(`/app/property-visits?new=1&property=${property._id}${selected ? `&space=${selected._id}` : ''}`)}>
                Schedule site visit
              </Button>
              <Button fullWidth variant="outlined" startIcon={<DirectionsRounded />} sx={{ mt: 1 }} onClick={() => window.open(directions, '_blank')}>
                Get directions
              </Button>
              <Stack direction="row" justifyContent="center" flexWrap="wrap" mt={2}>
                <Button startIcon={<ShareRounded />} onClick={() => share('copy')}>Copy link</Button>
                <Button startIcon={<WhatsApp />} onClick={() => share('whatsapp')}>WhatsApp</Button>
                <Button startIcon={<EmailRounded />} onClick={() => share('email')}>Email</Button>
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={3} mt={1}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 4 }}>
              <Typography variant="h6" fontWeight={900}>About this listing</Typography>
              <Typography color="text.secondary" lineHeight={1.8} mt={1}>{active.description || property.description || 'The owner has not added a description yet.'}</Typography>
              {(active.amenities || property.amenities || []).length > 0 && (
                <>
                  <Typography variant="h6" fontWeight={900} mt={3}>Amenities</Typography>
                  <Stack direction="row" gap={1} flexWrap="wrap" mt={1.5}>
                    {[...(active.amenities || []), ...(property.amenities || [])]
                      .filter((value, index, array) => array.indexOf(value) === index)
                      .map((item: string) => <Chip key={item} icon={<CheckCircleRounded />} label={item} variant="outlined" />)}
                  </Stack>
                </>
              )}
            </Paper>

            {(tourMedia.length > 0 || floorPlanMedia.length > 0) && <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 4, mt: 3 }}>
              <Typography variant="h6" fontWeight={900}>Property media</Typography>
              {tourMedia.length > 0 && <Grid container spacing={2} mt={0.5}>
                {tourMedia.map((item: any) => <Grid size={{ xs: 12, md: 6 }} key={item._id}>
                  <Typography fontWeight={800} fontSize={13} mb={1}>{item.category === 'virtual_360_tour' ? '360° Virtual Tour' : 'Video Tour'}</Typography>
                  {item.mediaType === 'image'
                    ? <Box component="img" src={item.url} alt={item.altText || property.title} sx={{ width: '100%', height: 260, objectFit: 'cover', borderRadius: 3 }} />
                    : <Box component="video" controls preload="metadata" src={item.url} sx={{ width: '100%', height: 260, bgcolor: 'black', borderRadius: 3 }} />}
                </Grid>)}
              </Grid>}
              {floorPlanMedia.length > 0 && <>
                <Typography fontWeight={900} mt={tourMedia.length ? 3 : 1}>Floor plans</Typography>
                <Grid container spacing={2} mt={0.5}>
                  {floorPlanMedia.map((item: any) => <Grid size={{ xs: 12, sm: 6 }} key={item._id}>
                    {item.mediaType === 'image'
                      ? <Box component="img" src={item.url} alt={item.altText || 'Floor plan'} sx={{ width: '100%', height: 260, objectFit: 'contain', bgcolor: 'background.default', borderRadius: 3 }} />
                      : <Button variant="outlined" fullWidth onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}>Open {item.caption || 'floor plan'}</Button>}
                  </Grid>)}
                </Grid>
              </>}
            </Paper>}

            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 4, mt: 3 }}>
              <Typography variant="h6" fontWeight={900}>Property specifications</Typography>
              <Grid container spacing={1.5} mt={0.5}>{renderRows(specificationRows)}</Grid>
              <Typography variant="h6" fontWeight={900} mt={3}>Parking & pricing</Typography>
              <Grid container spacing={1.5} mt={0.5}>{renderRows([
                ['Car parking spaces', parking.carSpaces], ['Two-wheeler parking spaces', parking.twoWheelerSpaces], ['Visitor parking', parking.visitorParking], ...pricingRows,
              ])}</Grid>
            </Paper>

            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 4, mt: 3 }}>
              <Typography variant="h6" fontWeight={900}>Utilities & legal details</Typography>
              <Grid container spacing={1.5} mt={0.5}>{renderRows([...utilityRows, ...legalRows])}</Grid>
            </Paper>

            {(nearbyRows.length > 0 || publicContact.ownerName || publicContact.agentName) && <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 4, mt: 3 }}>
              <Typography variant="h6" fontWeight={900}>Nearby facilities</Typography>
              <Grid container spacing={1.5} mt={0.5}>{renderRows(nearbyRows)}</Grid>
              {(publicContact.ownerName || publicContact.agentName) && <Alert severity="info" sx={{ mt: 2 }}>Listed by {publicContact.agentName || publicContact.ownerName}. Use the application or site-visit flow to share contact details securely.</Alert>}
            </Paper>}

            {property.customAttributes && Object.keys(property.customAttributes).length > 0 && (
              <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 4, mt: 3 }}>
                <Typography variant="h6" fontWeight={900}>Property-specific details</Typography>
                <Grid container spacing={1.5} mt={0.5}>
                  {Object.entries(property.customAttributes).map(([key, value]) => (
                    <Grid size={{ xs: 12, sm: 6 }} key={key}>
                      <Stack direction="row" justifyContent="space-between" gap={2} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Typography color="text.secondary" fontSize={13}>{sentence(key)}</Typography>
                        <Typography fontWeight={800} fontSize={13} textAlign="right">{Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '—')}</Typography>
                      </Stack>
                    </Grid>
                  ))}
                </Grid>
              </Paper>
            )}

            {mapEmbedUrl && (
              <Paper variant="outlined" sx={{ p: 1, borderRadius: 4, mt: 3, overflow: 'hidden' }}>
                <Box component="iframe" title={`${property.title} map`} src={mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" sx={{ border: 0, width: '100%', height: 360, display: 'block', borderRadius: 3 }} />
              </Paper>
            )}

            {spaces.length > 0 && (
              <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 4, mt: 3 }}>
                <Typography variant="h6" fontWeight={900}>Available buildings, apartments, rooms and beds</Typography>
                <Typography color="text.secondary" fontSize={13} mb={2}>Select each public space to view its price, occupancy and room-wise gallery.</Typography>
                <Grid container spacing={1.5}>
                  {spaces.filter((space) => space.rentable || space.sellable).map((space) => (
                    <Grid size={{ xs: 12, sm: 6 }} key={space._id}>
                      <Card variant="outlined" onClick={() => navigate(`/marketplace/${space._id}`)} sx={{ cursor: 'pointer', borderRadius: 3, height: '100%' }}>
                        <CardContent>
                          <Stack direction="row" justifyContent="space-between">
                            <Box>
                              <Typography fontWeight={850}>{space.roomNumber ? `Room ${space.roomNumber}` : space.name}</Typography>
                              <Typography color="text.secondary" fontSize={12}>{sentence(space.level)} · {sentence(space.purpose)}{space.apartmentNumber ? ` · Apartment ${space.apartmentNumber}` : ''}</Typography>
                            </Box>
                            <Typography color="primary" fontWeight={900}>{money(Number(space.price || 0))}</Typography>
                          </Stack>
                          <Stack direction="row" gap={0.7} mt={1.5}>
                            <Chip size="small" label={`${space.occupancyRules?.maxTotal || '—'} max occupants`} />
                            <Chip size="small" label={sentence(space.status)} />
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Paper>
            )}
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
              <Typography variant="h6" fontWeight={900}>Occupancy rules</Typography>
              <Stack spacing={1.2} mt={2}>
                {occupancyRows.map(([label, value]) => (
                  <Stack direction="row" justifyContent="space-between" key={label}>
                    <Typography color="text.secondary" fontSize={13}>{label}</Typography>
                    <Typography fontWeight={800} fontSize={13}>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? 'Not specified')}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Alert severity="info" sx={{ mt: 2 }}>Sensitive owner, tenant and exact-location information remains private until the configured application or site-visit stage.</Alert>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
