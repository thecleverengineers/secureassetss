import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routes = fs.readFileSync(new URL('../src/app/routes.tsx', import.meta.url), 'utf8');
const lazyRetry = fs.readFileSync(new URL('../src/app/utils/lazyWithRetry.ts', import.meta.url), 'utf8');
const buildScript = fs.readFileSync(new URL('../scripts/build-production.js', import.meta.url), 'utf8');
const advancedRental = fs.readFileSync(new URL('../scripts/migrate-advanced-rental.js', import.meta.url), 'utf8');

test('all route-level imports use one-time chunk recovery and a user-facing error boundary', () => {
  assert.doesNotMatch(routes, /\blazy\(/);
  assert.match(routes, /lazyWithRetry/);
  assert.match(routes, /errorElement: <RouteErrorPage \/>/);
  assert.match(lazyRetry, /window\.location\.reload\(\)/);
  assert.match(lazyRetry, /sessionStorage/);
});

test('frontend build activates a verified release atomically', () => {
  assert.match(buildScript, /\.frontend-releases/);
  assert.match(buildScript, /verify-production-build\.js/);
  assert.match(buildScript, /symlinkSync/);
  assert.match(buildScript, /renameSync\(temporaryLink, distPath\)/);
});

test('advanced rental migration never seeds operational demo records by default', () => {
  assert.match(advancedRental, /demoRentalDataEnabled\(\)/);
  assert.match(advancedRental, /Operational demo records skipped/);
  assert.doesNotMatch(advancedRental, /vault-document-id/);
});
