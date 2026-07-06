import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseManagedProcesses, verifyManagedProcesses } from '../scripts/lib/pm2-release.js';

const root = '/www/secureasset';
const version = '6.0.0';
const processEntry = (name, overrides = {}) => ({
  name,
  pid: 4321,
  pm2_env: {
    pm_cwd: root,
    pm_exec_path: `${root}/scripts/start-after-migrations.js`,
    pm_out_log_path: `${root}/logs/${name}-out.log`,
    pm_err_log_path: `${root}/logs/${name}-error.log`,
    version,
    status: 'online',
    ...overrides,
  },
});

const allProcesses = () => [
  processEntry('secureasset'),
  processEntry('secureasset-rental-automation'),
  processEntry('secureasset-notification-delivery'),
  processEntry('secureasset-vault-retention'),
];

test('PM2 reconciliation detects an obsolete /var application process', () => {
  const processes = allProcesses();
  processes[0] = processEntry('secureasset', {
    pm_cwd: '/var/secureasset',
    pm_exec_path: '/var/secureasset/server/src/server.js',
    pm_out_log_path: '/root/.pm2/logs/secureasset-out.log',
    pm_err_log_path: '/root/.pm2/logs/secureasset-error.log',
    version: '0.40.4',
  });
  const result = analyseManagedProcesses(processes, root, version);
  assert.deepEqual(result.stale.map((entry) => entry.name), ['secureasset']);
  assert.match(result.stale[0].issues.join(' '), /\/var\/secureasset/);
  assert.match(result.stale[0].issues.join(' '), /version=0\.40\.4/);
});

test('PM2 verification accepts the current release and requires a live API pid', () => {
  const result = verifyManagedProcesses(allProcesses(), root, version);
  assert.equal(result.ok, true);

  const stopped = allProcesses();
  stopped[0] = processEntry('secureasset', { status: 'errored' });
  stopped[0].pid = 0;
  const failed = verifyManagedProcesses(stopped, root, version);
  assert.equal(failed.ok, false);
  assert.ok(failed.issues.some((issue) => issue.includes('status=errored')));
  assert.ok(failed.issues.some((issue) => issue.includes('no running pid')));
});
