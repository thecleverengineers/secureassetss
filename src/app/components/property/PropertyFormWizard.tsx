import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, DialogActions, DialogContent, DialogTitle,
  Divider, FormHelperText, MenuItem, Paper, Stack, Step, StepLabel, Stepper, TextField, Typography,
} from '@mui/material';
import ProfessionalDialog from '../shared/ProfessionalDialog';
import LocationFields from '../shared/LocationFields';
import { AddPhotoAlternateRounded, MyLocationRounded, NavigateBeforeRounded, NavigateNextRounded, SaveRounded, UploadFileRounded } from '@mui/icons-material';
import { createResource, getResource, updateResource, uploadDocument } from '../../services/api';

const steps = ['Property details', 'Utilities & amenities', 'Legal details', 'Media & contact'];
const listingTypes = ['sale', 'rent', 'lease'];
const statuses = ['available', 'sold', 'leased'];
const furnishingOptions = ['unfurnished', 'semi_furnished', 'fully_furnished'];
const preferredContactOptions = ['phone', 'email', 'whatsapp', 'phone_or_email'];

const amenityFields = [
  ['lift', 'Lift'], ['security', 'Security'], ['cctv', 'CCTV'], ['gatedCommunity', 'Gated Community'],
  ['garden', 'Garden'], ['swimmingPool', 'Swimming Pool'], ['gym', 'Gym'], ['clubhouse', 'Clubhouse'],
  ['childrenPlayArea', "Children's Play Area"], ['joggingTrack', 'Jogging Track'], ['communityHall', 'Community Hall'],
  ['terrace', 'Terrace'], ['balcony', 'Balcony'], ['airConditioning', 'Air Conditioning'],
  ['modularKitchen', 'Modular Kitchen'], ['storeRoom', 'Store Room'], ['servantRoom', 'Servant Room'],
  ['wheelchairAccess', 'Wheelchair Access'],
] as const;

const nearbyFields = [
  ['school', 'School'], ['hospital', 'Hospital'], ['market', 'Market'], ['busStop', 'Bus Stop'],
  ['railwayStation', 'Railway Station'], ['airport', 'Airport'], ['shoppingMall', 'Shopping Mall'],
  ['park', 'Park'], ['bank', 'Bank'], ['pharmacy', 'Pharmacy'],
] as const;

const emptyFiles = {
  propertyImage: null as File | null,
  propertyPhotos: [] as File[],
  floorPlans: [] as File[],
  videoTour: null as File | null,
  virtualTour: null as File | null,
  propertyDocuments: [] as File[],
};

function getPath(source: any, path: string, fallback: any = '') {
  const value = path.split('.').reduce((current, key) => current?.[key], source);
  return value ?? fallback;
}

function boolFromAmenity(property: any, key: string, label: string) {
  const direct = getPath(property, `amenityDetails.${key}`, undefined);
  if (direct !== undefined) return Boolean(direct);
  return Array.isArray(property?.amenities) && property.amenities.includes(label);
}

function initialValues(property: any, propertyTypes: any[]) {
  const firstConfig = propertyTypes.find((item) => item.active !== false);
  const firstType = firstConfig?.key || '';
  const firstListingType = firstConfig?.allowedPurposes?.[0] || 'rent';
  const specifications = property?.specifications || {};
  const nearby = property?.nearbyFacilities || {};
  const values: Record<string, any> = {
    title: property?.title || '',
    type: property?.type || firstType,
    listingType: property?.purpose || property?.listingType || firstListingType,
    description: property?.description || '',
    status: statuses.includes(property?.status) ? property.status : 'available',
    country: getPath(property, 'address.country', 'India'),
    state: getPath(property, 'address.state'),
    city: getPath(property, 'address.city'),
    locality: getPath(property, 'address.locality', getPath(property, 'map.locality')),
    landmark: getPath(property, 'address.landmark', getPath(property, 'map.landmark')),
    fullAddress: getPath(property, 'address.line1'),
    pinCode: getPath(property, 'address.postalCode'),
    googleMapsLocation: getPath(property, 'map.googleMapsLocation', [getPath(property, 'map.latitude'), getPath(property, 'map.longitude')].filter((v) => v !== '').join(',')),
    bedrooms: specifications.bedrooms ?? getPath(property, 'roomDetails.bedrooms', getPath(property, 'bedrooms')),
    bathrooms: specifications.bathrooms ?? getPath(property, 'roomDetails.bathrooms', getPath(property, 'bathrooms')),
    balconies: specifications.balconies ?? getPath(property, 'roomDetails.balconies'),
    rooms: specifications.rooms ?? getPath(property, 'roomDetails.totalRooms'),
    numberOfFloors: specifications.numberOfFloors ?? '',
    floorNumber: specifications.floorNumber ?? getPath(property, 'listingDetails.floor'),
    totalFloorsInBuilding: specifications.totalFloorsInBuilding ?? getPath(property, 'listingDetails.totalFloors'),
    builtUpArea: getPath(property, 'areas.builtUp'),
    carpetArea: getPath(property, 'areas.carpet'),
    plotArea: getPath(property, 'areas.plot'),
    superBuiltUpArea: getPath(property, 'areas.superBuiltUp'),
    facing: specifications.facing ?? getPath(property, 'listingDetails.facing'),
    propertyAge: specifications.propertyAge ?? getPath(property, 'listingDetails.propertyAgeYears'),
    furnishingStatus: specifications.furnishingStatus ?? getPath(property, 'furnishing.status', 'unfurnished'),
    ownershipType: specifications.ownershipType ?? '',
    availableFrom: specifications.availableFrom ? String(specifications.availableFrom).slice(0, 10) : getPath(property, 'ageDetails.availableFrom') ? String(getPath(property, 'ageDetails.availableFrom')).slice(0, 10) : '',
    carParkingSpaces: getPath(property, 'parking.carSpaces', getPath(property, 'roomDetails.coveredParking')),
    twoWheelerParkingSpaces: getPath(property, 'parking.twoWheelerSpaces'),
    visitorParking: Boolean(getPath(property, 'parking.visitorParking', false)),
    salePrice: getPath(property, 'pricing.salePrice'),
    monthlyRent: getPath(property, 'pricing.monthlyRent'),
    leaseAmount: getPath(property, 'pricing.leaseAmount'),
    securityDeposit: getPath(property, 'pricing.securityDeposit'),
    maintenanceCharges: getPath(property, 'pricing.maintenanceCharge'),
    pricePerSqFt: getPath(property, 'pricing.pricePerUnitArea'),
    propertyTax: getPath(property, 'pricing.propertyTax'),
    waterSupply: getPath(property, 'utilities.waterSupply'),
    electricityConnection: getPath(property, 'utilities.electricityConnection'),
    powerBackup: getPath(property, 'utilities.powerBackup'),
    internetAvailability: Boolean(getPath(property, 'utilities.internetAvailability', false)),
    gasConnection: Boolean(getPath(property, 'utilities.gasConnection', false)),
    sewageConnection: Boolean(getPath(property, 'utilities.sewageConnection', false)),
    reraNumber: getPath(property, 'legalDetails.reraNumber'),
    titleClear: Boolean(getPath(property, 'legalDetails.titleClear', false)),
    loanApproved: Boolean(getPath(property, 'legalDetails.loanApproved', false)),
    occupancyCertificate: Boolean(getPath(property, 'legalDetails.occupancyCertificate', false)),
    completionCertificate: Boolean(getPath(property, 'legalDetails.completionCertificate', false)),
    ownerName: getPath(property, 'contactInformation.ownerName'),
    agentName: getPath(property, 'contactInformation.agentName'),
    phoneNumber: getPath(property, 'contactInformation.phoneNumber'),
    emailAddress: getPath(property, 'contactInformation.emailAddress'),
    preferredContactMethod: getPath(property, 'contactInformation.preferredContactMethod', 'phone_or_email'),
  };
  amenityFields.forEach(([key, label]) => { values[`amenity.${key}`] = boolFromAmenity(property, key, label); });
  nearbyFields.forEach(([key]) => { values[`nearby.${key}`] = nearby[key] || ''; });
  return values;
}

function numberOrUndefined(value: any) {
  if (value === '' || value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseMapLocation(value: string) {
  const text = String(value || '').trim();
  if (!text) return {};
  const direct = text.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  const at = text.match(/@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  const query = text.match(/[?&](?:q|query|destination)=(-?\d{1,3}(?:\.\d+)?)(?:%2C|,)(-?\d{1,3}(?:\.\d+)?)/i);
  const match = direct || at || query;
  if (!match) return { googleMapsLocation: text };
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { googleMapsLocation: text };
  return { googleMapsLocation: text, latitude, longitude };
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3.5 }}>
    <Typography sx={{ fontWeight: 900, fontSize: 16 }}>{title}</Typography>
    {subtitle && <Typography color="text.secondary" sx={{ fontSize: 12.5, mt: .35 }}>{subtitle}</Typography>}
    <Divider sx={{ my: 2 }} />
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.6 }}>{children}</Box>
  </Paper>;
}

function FilePicker({ label, value, multiple, accept, onChange, helper }: { label: string; value: File | File[] | null; multiple?: boolean; accept?: string; onChange: (files: File[]) => void; helper?: string }) {
  const count = Array.isArray(value) ? value.length : value ? 1 : 0;
  const names = Array.isArray(value) ? value.slice(0, 2).map((file) => file.name).join(', ') : value?.name;
  return <Box>
    <Button component="label" variant="outlined" startIcon={accept?.includes('image') ? <AddPhotoAlternateRounded /> : <UploadFileRounded />} fullWidth sx={{ minHeight: 54, justifyContent: 'flex-start', textAlign: 'left' }}>
      {count ? `${label}: ${names}${count > 2 ? ` +${count - 2}` : ''}` : label}
      <input hidden type="file" multiple={multiple} accept={accept} onChange={(event) => onChange(Array.from(event.target.files || []))} />
    </Button>
    {helper && <FormHelperText>{helper}</FormHelperText>}
  </Box>;
}

function Field({ values, setValues, name, label, type = 'text', required, multiline, select, options = [], helper, inputProps }: any) {
  return <TextField
    fullWidth size="small" name={name} label={label} type={type} required={required} multiline={multiline}
    rows={multiline ? 4 : undefined} select={select} value={select && typeof options?.[0]?.value === 'boolean' ? String(Boolean(values[name])) : values[name] ?? ''}
    onChange={(event) => setValues((current: any) => ({ ...current, [name]: select && typeof options?.[0]?.value === 'boolean' ? event.target.value === 'true' : event.target.value }))}
    helperText={helper} InputLabelProps={type === 'date' ? { shrink: true } : undefined} inputProps={inputProps}
    sx={{ gridColumn: multiline ? '1 / -1' : undefined }}
  >
    {select && options.map((option: any) => <MenuItem key={String(option.value)} value={String(option.value)}>{option.label}</MenuItem>)}
  </TextField>;
}

const yesNo = [{ value: false, label: 'No' }, { value: true, label: 'Yes' }];

export default function PropertyFormWizard({ open, mode, property, propertyTypes, onClose, onSaved }: {
  open: boolean;
  mode: 'create' | 'edit';
  property?: any;
  propertyTypes: any[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const activeTypes = useMemo(() => propertyTypes.filter((item) => item.active !== false && (item.key !== 'other' || property?.type === 'other')), [propertyTypes, property?.type]);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, any>>(() => initialValues(property, activeTypes));
  const [files, setFiles] = useState(emptyFiles);
  const [existingMedia, setExistingMedia] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const selected = activeTypes.find((item) => item.key === values.type);
    if (selected?.allowedPurposes?.length && !selected.allowedPurposes.includes(values.listingType)) {
      setValues((current) => ({ ...current, listingType: selected.allowedPurposes[0] }));
    }
  }, [activeTypes, values.type, values.listingType]);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setValues(initialValues(property, activeTypes));
    setFiles({ ...emptyFiles, propertyPhotos: [], floorPlans: [], propertyDocuments: [] });
    setError('');
    if (property?._id) getResource('property-media', { property: property._id, limit: 100 }).then((result) => setExistingMedia(result.data)).catch(() => setExistingMedia([]));
    else setExistingMedia([]);
  }, [open, property?._id, activeTypes]);

  function validateStep(currentStep: number) {
    const missing: string[] = [];
    if (currentStep === 0) {
      [['title', 'Property title'], ['type', 'Property type'], ['listingType', 'Listing type'], ['description', 'Property description'], ['status', 'Property status'], ['country', 'Country'], ['state', 'State'], ['city', 'City'], ['fullAddress', 'Full address'], ['pinCode', 'PIN code']].forEach(([key, label]) => { if (!String(values[key] || '').trim()) missing.push(label); });
      if (mode === 'create' && !files.propertyImage) missing.push('Property image');
      const priceField = values.listingType === 'sale' ? 'salePrice' : values.listingType === 'lease' ? 'leaseAmount' : 'monthlyRent';
      if (!numberOrUndefined(values[priceField]) || Number(values[priceField]) <= 0) missing.push(values.listingType === 'sale' ? 'Sale price' : values.listingType === 'lease' ? 'Lease amount' : 'Monthly rent');
    }
    if (currentStep === 3) {
      if (!String(values.ownerName || values.agentName || '').trim()) missing.push('Owner name or agent name');
      if (!String(values.phoneNumber || values.emailAddress || '').trim()) missing.push('Phone number or email address');
      if (values.emailAddress && !/^\S+@\S+\.\S+$/.test(String(values.emailAddress))) throw new Error('Enter a valid email address');
      if (values.phoneNumber && String(values.phoneNumber).replace(/\D/g, '').length < 7) throw new Error('Enter a valid phone number');
    }
    if (missing.length) throw new Error(`Complete the following fields: ${missing.join(', ')}`);
  }

  function next() {
    try { validateStep(step); setError(''); setStep((current) => Math.min(current + 1, steps.length - 1)); }
    catch (cause) { setError((cause as Error).message); }
  }

  function propertyPayload() {
    const mapValues = parseMapLocation(values.googleMapsLocation);
    const amenityDetails = Object.fromEntries(amenityFields.map(([key]) => [key, Boolean(values[`amenity.${key}`])]));
    const amenities = amenityFields.filter(([key]) => Boolean(values[`amenity.${key}`])).map(([, label]) => label);
    const nearbyFacilities = Object.fromEntries(nearbyFields.map(([key]) => [key, String(values[`nearby.${key}`] || '').trim()]).filter(([, value]) => value));
    const nearbyPlaces = nearbyFields.map(([key, label]) => ({ type: key, name: label, distance: String(values[`nearby.${key}`] || '').trim() })).filter((item) => item.distance);
    const listingType = values.listingType;
    const price = numberOrUndefined(listingType === 'sale' ? values.salePrice : listingType === 'lease' ? values.leaseAmount : values.monthlyRent) || 0;
    const unit = getPath(property, 'areas.unit', 'sqft');
    return {
      title: String(values.title).trim(), type: values.type, purpose: listingType, listingType, description: String(values.description).trim(), status: values.status,
      visibility: property?.visibility || 'public', publicationStatus: property?.publicationStatus || 'published', locationPrivacy: property?.locationPrivacy || 'approximate_public',
      price, bedrooms: numberOrUndefined(values.bedrooms), bathrooms: numberOrUndefined(values.bathrooms), area: numberOrUndefined(values.builtUpArea || values.carpetArea || values.plotArea),
      address: {
        country: String(values.country).trim(), state: String(values.state).trim(), city: String(values.city).trim(), locality: String(values.locality || '').trim(),
        landmark: String(values.landmark || '').trim(), line1: String(values.fullAddress).trim(), postalCode: String(values.pinCode).trim(),
      },
      map: { ...getPath(property, 'map', {}), ...mapValues, locality: String(values.locality || '').trim(), landmark: String(values.landmark || '').trim(), nearbyPlaces },
      ...(mapValues.latitude !== undefined && mapValues.longitude !== undefined ? { location: { type: 'Point', coordinates: [mapValues.longitude, mapValues.latitude] } } : {}),
      specifications: {
        bedrooms: numberOrUndefined(values.bedrooms), bathrooms: numberOrUndefined(values.bathrooms), balconies: numberOrUndefined(values.balconies), rooms: numberOrUndefined(values.rooms),
        numberOfFloors: numberOrUndefined(values.numberOfFloors), floorNumber: numberOrUndefined(values.floorNumber), totalFloorsInBuilding: numberOrUndefined(values.totalFloorsInBuilding),
        facing: String(values.facing || '').trim(), propertyAge: numberOrUndefined(values.propertyAge), furnishingStatus: values.furnishingStatus,
        ownershipType: String(values.ownershipType || '').trim(), availableFrom: values.availableFrom || undefined,
      },
      roomDetails: {
        ...getPath(property, 'roomDetails', {}), bedrooms: numberOrUndefined(values.bedrooms), bathrooms: numberOrUndefined(values.bathrooms), balconies: numberOrUndefined(values.balconies),
        totalRooms: numberOrUndefined(values.rooms), coveredParking: numberOrUndefined(values.carParkingSpaces),
      },
      listingDetails: {
        ...getPath(property, 'listingDetails', {}), floor: numberOrUndefined(values.floorNumber), totalFloors: numberOrUndefined(values.totalFloorsInBuilding), facing: String(values.facing || '').trim(),
        propertyAgeYears: numberOrUndefined(values.propertyAge), availableFrom: values.availableFrom || undefined, parkingSpaces: numberOrUndefined(values.carParkingSpaces),
      },
      areas: { unit, builtUp: numberOrUndefined(values.builtUpArea), carpet: numberOrUndefined(values.carpetArea), plot: numberOrUndefined(values.plotArea), superBuiltUp: numberOrUndefined(values.superBuiltUpArea), total: numberOrUndefined(values.builtUpArea || values.superBuiltUpArea || values.plotArea) },
      furnishing: { status: values.furnishingStatus }, ageDetails: { ...getPath(property, 'ageDetails', {}), availableFrom: values.availableFrom || undefined },
      parking: { carSpaces: numberOrUndefined(values.carParkingSpaces), twoWheelerSpaces: numberOrUndefined(values.twoWheelerParkingSpaces), visitorParking: Boolean(values.visitorParking) },
      pricing: {
        salePrice: numberOrUndefined(values.salePrice), monthlyRent: numberOrUndefined(values.monthlyRent), leaseAmount: numberOrUndefined(values.leaseAmount),
        securityDeposit: numberOrUndefined(values.securityDeposit), maintenanceCharge: numberOrUndefined(values.maintenanceCharges),
        pricePerUnitArea: numberOrUndefined(values.pricePerSqFt), propertyTax: numberOrUndefined(values.propertyTax),
      },
      utilities: {
        waterSupply: String(values.waterSupply || '').trim(), electricityConnection: String(values.electricityConnection || '').trim(), powerBackup: String(values.powerBackup || '').trim(),
        internetAvailability: Boolean(values.internetAvailability), gasConnection: Boolean(values.gasConnection), sewageConnection: Boolean(values.sewageConnection),
      },
      amenityDetails, amenities,
      legalDetails: {
        reraNumber: String(values.reraNumber || '').trim(), titleClear: Boolean(values.titleClear), loanApproved: Boolean(values.loanApproved),
        occupancyCertificate: Boolean(values.occupancyCertificate), completionCertificate: Boolean(values.completionCertificate),
      },
      contactInformation: {
        ownerName: String(values.ownerName || '').trim(), agentName: String(values.agentName || '').trim(), phoneNumber: String(values.phoneNumber || '').trim(),
        emailAddress: String(values.emailAddress || '').trim().toLowerCase(), preferredContactMethod: values.preferredContactMethod,
      },
      nearbyFacilities,
    };
  }

  async function uploadMedia(propertyId: string, file: File, category: string, mediaType: 'image' | 'video' | '360' | 'document', cover = false, visibility: 'public' | 'legal' = 'public') {
    const upload = await uploadDocument(file, {
      property: propertyId, type: category, category: visibility === 'legal' ? 'legal' : mediaType === 'document' ? 'document' : mediaType === 'video' || mediaType === '360' ? 'video' : 'image', visibility: visibility === 'public' ? 'public' : 'private',
    });
    const media = await createResource('property-media', {
      property: propertyId, category, mediaType, url: upload.data.url, document: upload.data._id, driveFile: (upload.data as any).driveFile,
      caption: file.name, altText: file.name, cover, visibility,
    });
    return { media: media.data as any, documentId: upload.data._id };
  }

  async function save() {
    try {
      validateStep(0); validateStep(3);
      setSaving(true); setError('');
      const payload = propertyPayload();
      const result = mode === 'edit' && property?._id ? await updateResource('properties', property._id, payload) : await createResource('properties', payload);
      const propertyId = String((result.data as any)._id);
      const imageUrls: string[] = [];
      const documentIds: string[] = [];
      let coverUrl = property?.galleryCover || '';
      if (files.propertyImage) {
        const uploaded = await uploadMedia(propertyId, files.propertyImage, 'property_image', 'image', true, 'public');
        coverUrl = uploaded.media.url; imageUrls.push(uploaded.media.url);
      }
      for (const file of files.propertyPhotos) { const uploaded = await uploadMedia(propertyId, file, 'property_photo', 'image', false, 'public'); imageUrls.push(uploaded.media.url); }
      for (const file of files.floorPlans) { const uploaded = await uploadMedia(propertyId, file, 'floor_plan', file.type.startsWith('image/') ? 'image' : 'document', false, 'public'); if (uploaded.media.mediaType === 'image') imageUrls.push(uploaded.media.url); }
      if (files.videoTour) await uploadMedia(propertyId, files.videoTour, 'video_tour', 'video', false, 'public');
      if (files.virtualTour) await uploadMedia(propertyId, files.virtualTour, 'virtual_360_tour', '360', false, 'public');
      for (const file of files.propertyDocuments) { const uploaded = await uploadMedia(propertyId, file, 'property_document', 'document', false, 'legal'); documentIds.push(uploaded.documentId); }
      if (coverUrl || imageUrls.length || documentIds.length) {
        await updateResource('properties', propertyId, {
          galleryCover: coverUrl || undefined,
          images: [...new Set([...(property?.images || []), ...imageUrls].filter(Boolean))],
          documents: [...new Set([...(property?.documents || []).map((item: any) => String(item?._id || item)), ...documentIds])],
        });
      }
      onSaved(`${mode === 'edit' ? 'Property updated' : 'Property added'} successfully${imageUrls.length || documentIds.length ? ' with uploaded media' : ''}`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally { setSaving(false); }
  }

  const selectedType = activeTypes.find((item) => item.key === values.type);
  const allowedListingTypes = selectedType?.allowedPurposes?.length ? listingTypes.filter((item) => selectedType.allowedPurposes.includes(item)) : listingTypes;
  const typeOptions = activeTypes.map((item) => ({ value: item.key, label: item.label }));
  const existingMediaSummary = existingMedia.reduce((counts: Record<string, number>, item) => ({ ...counts, [item.category]: (counts[item.category] || 0) + 1 }), {});

  return <ProfessionalDialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="lg" PaperProps={{ sx: { borderRadius: { xs: 0, sm: 4 }, minHeight: { xs: '100dvh', sm: 'auto' } } }}>
    <DialogTitle sx={{ pb: 1 }}>
      <Typography sx={{ fontWeight: 950, fontSize: { xs: 21, md: 25 }, letterSpacing: '-.03em' }}>{mode === 'edit' ? 'Edit property' : 'Add property'}</Typography>
      <Typography color="text.secondary" sx={{ fontSize: 13, mt: .4 }}>Complete the four steps. Only the fields in this property workflow are saved.</Typography>
    </DialogTitle>
    <Box sx={{ px: { xs: 2, md: 3 }, pb: 1 }}><Stepper activeStep={step} alternativeLabel sx={{ '& .MuiStepLabel-label': { fontSize: { xs: 10, sm: 12 } } }}>{steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper></Box>
    <DialogContent dividers sx={{ p: { xs: 2, md: 3 }, bgcolor: 'background.default' }}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {step === 0 && <Stack spacing={2}>
        <Section title="Basic Information">
          <Field values={values} setValues={setValues} name="title" label="Property Title" required />
          <Field values={values} setValues={setValues} name="type" label="Property Type" required select options={typeOptions} />
          <Field values={values} setValues={setValues} name="listingType" label="Listing Type" required select options={allowedListingTypes.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} />
          <Field values={values} setValues={setValues} name="status" label="Property Status" required select options={statuses.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} />
          <Field values={values} setValues={setValues} name="description" label="Property Description" required multiline />
          <FilePicker label={mode === 'edit' && property?.galleryCover ? 'Replace Property Image' : 'Upload Property Image'} value={files.propertyImage} accept="image/*" onChange={(selected) => setFiles((current) => ({ ...current, propertyImage: selected[0] || null }))} helper={property?.galleryCover ? 'The current cover image remains unless you upload a replacement.' : 'Required for a new property.'} />
        </Section>
        <Section title="Location" subtitle="Paste a Google Maps link or coordinates. Coordinates are extracted automatically when possible.">
          <LocationFields
            value={{ country: values.country, state: values.state, city: values.city }}
            required={{ country: true, state: true, city: true }}
            onChange={(location) => setValues((current) => ({ ...current, ...location }))}
          />
          <Field values={values} setValues={setValues} name="locality" label="Locality" />
          <Field values={values} setValues={setValues} name="landmark" label="Landmark" />
          <Field values={values} setValues={setValues} name="pinCode" label="PIN Code" required inputProps={{ inputMode: 'numeric' }} />
          <Field values={values} setValues={setValues} name="fullAddress" label="Full Address" required multiline />
          <Box sx={{ gridColumn: '1 / -1' }}><Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems="stretch"><Box sx={{ flex: 1 }}><Field values={values} setValues={setValues} name="googleMapsLocation" label="Google Maps Location" helper="Google Maps URL or latitude, longitude" /></Box><Button variant="outlined" startIcon={<MyLocationRounded />} onClick={() => navigator.geolocation?.getCurrentPosition((position) => setValues((current) => ({ ...current, googleMapsLocation: `${position.coords.latitude},${position.coords.longitude}` })), () => setError('Location permission was not granted'))}>Use current location</Button></Stack></Box>
        </Section>
        <Section title="Property Specifications">
          {['bedrooms','bathrooms','balconies','rooms','numberOfFloors','floorNumber','totalFloorsInBuilding','builtUpArea','carpetArea','plotArea','superBuiltUpArea','propertyAge'].map((name) => <Field key={name} values={values} setValues={setValues} name={name} type="number" label={{ bedrooms:'Number of Bedrooms (BHK)', bathrooms:'Number of Bathrooms', balconies:'Number of Balconies', rooms:'Number of Rooms', numberOfFloors:'Number of Floors', floorNumber:'Floor Number', totalFloorsInBuilding:'Total Floors in Building', builtUpArea:'Built-up Area', carpetArea:'Carpet Area', plotArea:'Plot Area', superBuiltUpArea:'Super Built-up Area', propertyAge:'Property Age (years)' }[name]} inputProps={{ min: 0, step: 'any' }} />)}
          <Field values={values} setValues={setValues} name="facing" label="Facing" />
          <Field values={values} setValues={setValues} name="furnishingStatus" label="Furnishing Status" select options={furnishingOptions.map((value) => ({ value, label: value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }))} />
          <Field values={values} setValues={setValues} name="ownershipType" label="Ownership Type" />
          <Field values={values} setValues={setValues} name="availableFrom" label="Available From" type="date" />
        </Section>
        <Section title="Parking">
          <Field values={values} setValues={setValues} name="carParkingSpaces" label="Car Parking Spaces" type="number" inputProps={{ min: 0 }} />
          <Field values={values} setValues={setValues} name="twoWheelerParkingSpaces" label="Two-Wheeler Parking Spaces" type="number" inputProps={{ min: 0 }} />
          <Field values={values} setValues={setValues} name="visitorParking" label="Visitor Parking" select options={yesNo} />
        </Section>
        <Section title="Pricing">
          <Field values={values} setValues={setValues} name="salePrice" label="Sale Price" type="number" required={values.listingType === 'sale'} inputProps={{ min: 0, step: 'any' }} />
          <Field values={values} setValues={setValues} name="monthlyRent" label="Monthly Rent" type="number" required={values.listingType === 'rent'} inputProps={{ min: 0, step: 'any' }} />
          <Field values={values} setValues={setValues} name="leaseAmount" label="Lease Amount" type="number" required={values.listingType === 'lease'} inputProps={{ min: 0, step: 'any' }} />
          <Field values={values} setValues={setValues} name="securityDeposit" label="Security Deposit" type="number" inputProps={{ min: 0, step: 'any' }} />
          <Field values={values} setValues={setValues} name="maintenanceCharges" label="Maintenance Charges" type="number" inputProps={{ min: 0, step: 'any' }} />
          <Field values={values} setValues={setValues} name="pricePerSqFt" label="Price per sq. ft." type="number" inputProps={{ min: 0, step: 'any' }} />
          <Field values={values} setValues={setValues} name="propertyTax" label="Property Tax" type="number" inputProps={{ min: 0, step: 'any' }} />
        </Section>
      </Stack>}
      {step === 1 && <Stack spacing={2}>
        <Section title="Utilities">
          <Field values={values} setValues={setValues} name="waterSupply" label="Water Supply" helper="Example: Municipal, borewell, both" />
          <Field values={values} setValues={setValues} name="electricityConnection" label="Electricity Connection" />
          <Field values={values} setValues={setValues} name="powerBackup" label="Power Backup" helper="Example: Full, partial, none" />
          <Field values={values} setValues={setValues} name="internetAvailability" label="Internet Availability" select options={yesNo} />
          <Field values={values} setValues={setValues} name="gasConnection" label="Gas Connection" select options={yesNo} />
          <Field values={values} setValues={setValues} name="sewageConnection" label="Sewage Connection" select options={yesNo} />
        </Section>
        <Section title="Amenities">
          {amenityFields.map(([key, label]) => <Field key={key} values={values} setValues={setValues} name={`amenity.${key}`} label={label} select options={yesNo} />)}
        </Section>
      </Stack>}
      {step === 2 && <Section title="Legal Details" subtitle="Only include details you can support with valid records.">
        <Field values={values} setValues={setValues} name="reraNumber" label="RERA Number (if applicable)" />
        <Field values={values} setValues={setValues} name="titleClear" label="Title Clear" select options={yesNo} />
        <Field values={values} setValues={setValues} name="loanApproved" label="Loan Approved" select options={yesNo} />
        <Field values={values} setValues={setValues} name="occupancyCertificate" label="Occupancy Certificate" select options={yesNo} />
        <Field values={values} setValues={setValues} name="completionCertificate" label="Completion Certificate" select options={yesNo} />
      </Section>}
      {step === 3 && <Stack spacing={2}>
        <Section title="Media" subtitle="Uploads are stored in SecureAsset Vault and linked to this property.">
          <FilePicker label="Property Photos" value={files.propertyPhotos} multiple accept="image/*" onChange={(selected) => setFiles((current) => ({ ...current, propertyPhotos: selected }))} />
          <FilePicker label="Floor Plan" value={files.floorPlans} multiple accept="image/*,.pdf" onChange={(selected) => setFiles((current) => ({ ...current, floorPlans: selected }))} />
          <FilePicker label="Video Tour" value={files.videoTour} accept="video/*" onChange={(selected) => setFiles((current) => ({ ...current, videoTour: selected[0] || null }))} />
          <FilePicker label="360° Virtual Tour" value={files.virtualTour} accept="video/*,image/*" onChange={(selected) => setFiles((current) => ({ ...current, virtualTour: selected[0] || null }))} />
          <FilePicker label="Property Documents" value={files.propertyDocuments} multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(selected) => setFiles((current) => ({ ...current, propertyDocuments: selected }))} helper="Documents are stored as legal/private records and are not exposed publicly." />
          {existingMedia.length > 0 && <Box sx={{ gridColumn: '1 / -1' }}><Typography color="text.secondary" sx={{ fontSize: 12, mb: 1 }}>Existing media</Typography><Stack direction="row" flexWrap="wrap" gap={1}>{Object.entries(existingMediaSummary).map(([category, count]) => <Chip key={category} size="small" label={`${category.replaceAll('_', ' ')} · ${count}`} />)}</Stack></Box>}
        </Section>
        <Section title="Contact Information">
          <Field values={values} setValues={setValues} name="ownerName" label="Owner Name" />
          <Field values={values} setValues={setValues} name="agentName" label="Agent Name" />
          <Field values={values} setValues={setValues} name="phoneNumber" label="Phone Number" />
          <Field values={values} setValues={setValues} name="emailAddress" label="Email Address" type="email" />
          <Field values={values} setValues={setValues} name="preferredContactMethod" label="Preferred Contact Method" select options={preferredContactOptions.map((value) => ({ value, label: value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }))} />
        </Section>
        <Section title="Nearby Facilities" subtitle="Enter distance or a short note, for example “1.2 km” or “5-minute walk”.">
          {nearbyFields.map(([key, label]) => <Field key={key} values={values} setValues={setValues} name={`nearby.${key}`} label={label} />)}
        </Section>
      </Stack>}
    </DialogContent>
    <DialogActions sx={{ p: 2, justifyContent: 'space-between', gap: 1, position: 'sticky', bottom: 0, bgcolor: 'background.paper' }}>
      <Button onClick={step === 0 ? onClose : () => setStep((current) => current - 1)} disabled={saving} startIcon={step === 0 ? undefined : <NavigateBeforeRounded />}>{step === 0 ? 'Cancel' : 'Back'}</Button>
      {step < steps.length - 1 ? <Button variant="contained" onClick={next} endIcon={<NavigateNextRounded />}>Continue</Button> : <Button variant="contained" onClick={save} disabled={saving} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveRounded />}>{saving ? 'Saving property…' : mode === 'edit' ? 'Update Property' : 'Add Property'}</Button>}
    </DialogActions>
  </ProfessionalDialog>;
}
