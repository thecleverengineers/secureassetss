import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wizard = readFileSync(new URL('../src/app/components/property/PropertyFormWizard.tsx', import.meta.url), 'utf8');
const models = readFileSync(new URL('../server/src/models/index.js', import.meta.url), 'utf8');
const resources = readFileSync(new URL('../server/src/services/resources.js', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../server/src/controllers/resourceController.js', import.meta.url), 'utf8');
const publicController = readFileSync(new URL('../server/src/controllers/publicController.js', import.meta.url), 'utf8');
const publicRoutes = readFileSync(new URL('../server/src/routes/publicRoutes.js', import.meta.url), 'utf8');
const serializer = readFileSync(new URL('../server/src/services/publicPropertySerialization.js', import.meta.url), 'utf8');
const resourcePage = readFileSync(new URL('../src/app/pages/app/ResourcePage.tsx', import.meta.url), 'utf8');

const requestedLabels = [
  'Property Title', 'Property Type', 'Listing Type', 'Property Description', 'Property Status', 'Upload Property Image',
  'Country', 'State', 'City', 'Locality', 'Landmark', 'Full Address', 'PIN Code', 'Google Maps Location',
  'Number of Bedrooms (BHK)', 'Number of Bathrooms', 'Number of Balconies', 'Number of Rooms', 'Number of Floors',
  'Floor Number', 'Total Floors in Building', 'Built-up Area', 'Carpet Area', 'Plot Area', 'Super Built-up Area',
  'Facing', 'Property Age (years)', 'Furnishing Status', 'Ownership Type', 'Available From',
  'Car Parking Spaces', 'Two-Wheeler Parking Spaces', 'Visitor Parking', 'Sale Price', 'Monthly Rent', 'Lease Amount',
  'Security Deposit', 'Maintenance Charges', 'Price per sq. ft.', 'Property Tax', 'Water Supply',
  'Electricity Connection', 'Power Backup', 'Internet Availability', 'Gas Connection', 'Sewage Connection',
  'Lift', 'Security', 'CCTV', 'Gated Community', 'Garden', 'Swimming Pool', 'Gym', 'Clubhouse',
  "Children's Play Area", 'Jogging Track', 'Community Hall', 'Terrace', 'Balcony', 'Air Conditioning',
  'Modular Kitchen', 'Store Room', 'Servant Room', 'Wheelchair Access', 'RERA Number (if applicable)',
  'Title Clear', 'Loan Approved', 'Occupancy Certificate', 'Completion Certificate', 'Property Photos', 'Floor Plan',
  'Video Tour', '360° Virtual Tour', 'Property Documents', 'Owner Name', 'Agent Name', 'Phone Number',
  'Email Address', 'Preferred Contact Method', 'School', 'Hospital', 'Market', 'Bus Stop', 'Railway Station',
  'Airport', 'Shopping Mall', 'Park', 'Bank', 'Pharmacy',
];

test('property create and edit use the requested four-step workflow', () => {
  for (const step of ['Property details', 'Utilities & amenities', 'Legal details', 'Media & contact']) {
    assert.match(wizard, new RegExp(step.replace(/[&]/g, '\\&')));
  }
  for (const label of requestedLabels) assert.ok(wizard.includes(label), `missing property field: ${label}`);
  assert.match(resourcePage, /module === 'properties'.*PropertyFormWizard/s);
  assert.match(resourcePage, /statuses: \['available', 'sold', 'leased'\]/);
});

test('property workflow maps every group to MongoDB and writable API fields', () => {
  for (const group of ['specifications', 'parking', 'utilities', 'amenityDetails', 'legalDetails', 'contactInformation', 'nearbyFacilities']) {
    assert.match(models, new RegExp(`${group}: \\{`), `missing MongoDB group ${group}`);
    assert.ok(resources.includes(`'${group}'`) || resources.includes(`${group}`), `missing writable group ${group}`);
  }
  for (const field of ['locality', 'landmark', 'googleMapsLocation', 'propertyTax', 'pricePerUnitArea']) assert.ok(models.includes(field), `missing MongoDB field ${field}`);
  assert.match(controller, /normalizePropertyWorkflowFields/);
  assert.match(controller, /Sale price.*Lease amount.*Monthly rent/s);
  assert.match(controller, /contact phone number or email address/);
});

test('property media is vault-backed and public files use a controlled streaming route', () => {
  assert.match(wizard, /uploadDocument/);
  assert.match(wizard, /createResource\('property-media'/);
  assert.match(publicRoutes, /property-media\/:id\/content/);
  assert.match(publicController, /streamPublicPropertyMedia/);
  assert.match(publicController, /visibility: 'public'/);
  assert.match(publicController, /visibility: 'public'/);
  assert.ok(!publicController.includes("mediaType === 'document'"), 'public floor-plan documents should remain streamable');
});

test('public property serialization exposes listing details without leaking direct contact data', () => {
  for (const group of ['specifications', 'parking', 'utilities', 'amenityDetails', 'legalDetails', 'nearbyFacilities']) assert.ok(serializer.includes(`${group}:`));
  assert.match(serializer, /publicContact: \{ ownerName:.*agentName:.*preferredContactMethod:/s);
  const publicContact = serializer.match(/publicContact: \{([^}]+)\}/s)?.[1] || '';
  assert.ok(!publicContact.includes('phoneNumber'));
  assert.ok(!publicContact.includes('emailAddress'));
});
