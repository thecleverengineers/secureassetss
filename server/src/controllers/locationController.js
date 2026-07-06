import { City, Country, State } from 'country-state-city';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';

const countries = Country.getAllCountries()
  .map(({ name, isoCode, phonecode, flag }) => ({ name, isoCode, phonecode, flag }))
  .sort((left, right) => left.name.localeCompare(right.name));

function code(value, label) {
  const result = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,8}$/.test(result)) throw new ApiError(422, `Select a valid ${label}`);
  return result;
}

export const listCountries = asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.json({ success: true, data: countries });
});

export const listStates = asyncHandler(async (req, res) => {
  const countryCode = code(req.query.country, 'country');
  const rows = State.getStatesOfCountry(countryCode)
    .map(({ name, isoCode }) => ({ name, isoCode, countryCode }))
    .sort((left, right) => left.name.localeCompare(right.name));
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.json({ success: true, data: rows });
});

export const listCities = asyncHandler(async (req, res) => {
  const countryCode = code(req.query.country, 'country');
  const stateCode = req.query.state ? code(req.query.state, 'state or province') : '';
  const source = stateCode ? City.getCitiesOfState(countryCode, stateCode) : (City.getCitiesOfCountry(countryCode) || []);
  const rows = source
    .map(({ name, latitude, longitude, stateCode: cityStateCode }) => ({ name, countryCode, stateCode: cityStateCode || stateCode, latitude, longitude }))
    .sort((left, right) => left.name.localeCompare(right.name));
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.json({ success: true, data: rows });
});
