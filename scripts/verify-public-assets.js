import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = String(process.argv[2] || process.env.PUBLIC_APP_URL || '').replace(/\/+$/, '');
if (!/^https?:\/\//i.test(baseUrl)) {
  console.error('Usage: node scripts/verify-public-assets.js https://your-domain.example');
  process.exit(2);
}

const dist = path.resolve('dist');
const indexPath = path.join(dist, 'index.html');
const indexHtml = await fs.readFile(indexPath, 'utf8');
const indexReferences = [...indexHtml.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]);
const releaseToken = crypto.createHash('sha256').update(indexHtml).digest('hex').slice(0, 16);

async function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function fetchBytes(url, options = {}) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { Accept: '*/*', 'Cache-Control': 'no-cache', Pragma: 'no-cache', ...(options.headers || {}) },
  });
  const contentType = response.headers.get('content-type') || '';
  const bytes = Buffer.from(await response.arrayBuffer());
  return { response, contentType, bytes };
}

const page = await fetchBytes(`${baseUrl}/login?__secureasset_release=${releaseToken}`, { headers: { Accept: 'text/html' } });
if (!page.response.ok || !page.contentType.includes('text/html')) {
  throw new Error(`/login did not return HTML (${page.response.status}, ${page.contentType || 'no content-type'})`);
}
const publicHtml = page.bytes.toString('utf8');
if (!publicHtml.includes('<div id="root"></div>')) throw new Error('/login did not return the SecureAsset React entry page');
for (const reference of indexReferences) {
  if (!publicHtml.includes(reference)) throw new Error(`/login is serving a stale index page that does not reference ${reference}`);
}

const assetDirectory = path.join(dist, 'assets');
const assetNames = (await fs.readdir(assetDirectory)).filter((name) => /\.(?:js|css)$/i.test(name)).sort();
if (!assetNames.length) throw new Error('No production JavaScript or CSS assets were found in dist/assets');

for (const name of assetNames) {
  const local = await fs.readFile(path.join(assetDirectory, name));
  const remote = await fetchBytes(`${baseUrl}/assets/${encodeURIComponent(name)}?__secureasset_release=${releaseToken}`);
  if (!remote.response.ok) throw new Error(`/assets/${name} returned HTTP ${remote.response.status}`);
  if (remote.contentType.includes('text/html')) throw new Error(`/assets/${name} returned the React HTML page instead of the asset`);
  if (name.endsWith('.js') && !/(?:javascript|ecmascript)/i.test(remote.contentType)) {
    throw new Error(`/assets/${name} returned an unexpected content type: ${remote.contentType || 'none'}`);
  }
  if (name.endsWith('.css') && !/text\/css/i.test(remote.contentType)) {
    throw new Error(`/assets/${name} returned an unexpected content type: ${remote.contentType || 'none'}`);
  }
  const [localHash, remoteHash] = await Promise.all([sha256(local), sha256(remote.bytes)]);
  if (localHash !== remoteHash) throw new Error(`/assets/${name} does not match the current production build`);
}

console.log(`Public frontend assets passed: ${baseUrl} (${assetNames.length} files, current index and chunks verified).`);
