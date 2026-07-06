import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');

function runScript(script, appDir) {
  return spawnSync(process.execPath, [path.join(projectRoot, script)], {
    cwd: projectRoot,
    env: { ...process.env, APP_DIR: appDir },
    encoding: 'utf8',
  });
}

function readEnv(file) {
  const values = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return values;
}

test('one-click environment upgrades receive every required worker schedule', () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secureasset-env-'));
  try {
    const template = fs.readFileSync(path.join(projectRoot, '.env.oneclick.example'), 'utf8')
      // Simulate an environment created by the older one-click template.
      .replace(/^NOTIFICATION_DELIVERY_CRON=.*\n/m, '')
      .replace(/^NOTIFICATION_BATCH_SIZE=.*\n/m, '')
      .replace(/^VITE_API_URL=.*$/m, 'VITE_API_URL=http://localhost:5000/api/v1');
    fs.writeFileSync(path.join(appDir, '.env.oneclick.example'), template);

    const configured = runScript('scripts/configure-production-env.js', appDir);
    assert.equal(configured.status, 0, configured.stderr || configured.stdout);

    const values = readEnv(path.join(appDir, '.env'));
    assert.equal(values.NOTIFICATION_DELIVERY_CRON, '* * * * *');
    assert.equal(values.NOTIFICATION_BATCH_SIZE, '200');
    assert.equal(values.RENT_AUTOMATION_CRON, '7 1 * * *');
    assert.equal(values.VAULT_PURGE_CRON, '17 2 * * *');
    assert.equal(values.VITE_API_URL, '/api/v1');

    const validated = runScript('scripts/validate-production-env.js', appDir);
    assert.equal(validated.status, 0, validated.stderr || validated.stdout);
    assert.match(validated.stdout, /Production environment validation passed/);
  } finally {
    fs.rmSync(appDir, { recursive: true, force: true });
  }
});
