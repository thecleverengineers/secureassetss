import process from 'node:process';

const baseUrl = String(process.argv[2] || `http://127.0.0.1:${process.env.PORT || 5000}`).replace(/\/+$/, '');

async function readPayload(response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let payload = text;
  if (contentType.includes('application/json')) {
    try { payload = JSON.parse(text); } catch { throw new Error(`${response.url} declared JSON but returned invalid JSON`); }
  }
  return { contentType, payload, text };
}

async function checkHealth() {
  const response = await fetch(`${baseUrl}/api/health/ready`, { headers: { Accept: 'application/json' }, redirect: 'follow' });
  const { contentType, payload } = await readPayload(response);
  if (!response.ok || !contentType.includes('application/json') || payload?.service !== 'secureasset-api') {
    throw new Error(`Health route is not reaching SecureAsset API (${response.status}, ${contentType || 'no content-type'})`);
  }
}

async function checkAuthRoute(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: '{}',
    redirect: 'manual',
  });
  const { contentType, payload, text } = await readPayload(response);
  if ([301, 302, 307, 308].includes(response.status)) throw new Error(`${path} redirected instead of reaching the API`);
  if ([404, 405, 502, 503, 504].includes(response.status)) throw new Error(`${path} returned HTTP ${response.status}`);
  if (!contentType.includes('application/json')) {
    const preview = String(text || '').replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(`${path} returned ${contentType || 'non-JSON'} instead of API JSON${preview ? `: ${preview}` : ''}`);
  }
  if (response.status < 400 || response.status >= 500 || payload?.success !== false) {
    throw new Error(`${path} did not return the expected validation response (${response.status})`);
  }
}

try {
  await checkHealth();
  await checkAuthRoute('/api/v1/auth/login');
  await checkAuthRoute('/api/v1/auth/register');
  console.log(`Authentication routing passed: ${baseUrl}`);
} catch (error) {
  console.error(`Authentication routing failed for ${baseUrl}: ${error.message}`);
  process.exit(1);
}
