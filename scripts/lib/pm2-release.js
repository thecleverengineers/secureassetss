import path from 'node:path';

export const managedProcessNames = Object.freeze([
  'secureasset',
  'secureasset-rental-automation',
  'secureasset-notification-delivery',
  'secureasset-vault-retention',
]);

const normalisePath = (value, cwd = process.cwd()) => {
  if (!value || typeof value !== 'string') return '';
  return path.resolve(cwd, value);
};

const isInside = (candidate, root) => {
  if (!candidate || !root) return false;
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

export function analyseManagedProcesses(processes, expectedAppDir, expectedVersion) {
  const expectedRoot = normalisePath(expectedAppDir);
  const byName = new Map(
    (Array.isArray(processes) ? processes : [])
      .filter((entry) => managedProcessNames.includes(entry?.name))
      .map((entry) => [entry.name, entry]),
  );

  const stale = [];
  const missing = [];
  const healthy = [];

  for (const name of managedProcessNames) {
    const entry = byName.get(name);
    if (!entry) {
      missing.push(name);
      continue;
    }

    const env = entry.pm2_env || {};
    const cwd = normalisePath(env.pm_cwd || '');
    const execPath = normalisePath(env.pm_exec_path || '', cwd || expectedRoot);
    const outLog = normalisePath(env.pm_out_log_path || '', cwd || expectedRoot);
    const errorLog = normalisePath(env.pm_err_log_path || '', cwd || expectedRoot);
    const issues = [];

    if (cwd !== expectedRoot) issues.push(`cwd=${cwd || '<missing>'}`);
    if (!isInside(execPath, expectedRoot)) issues.push(`script=${execPath || '<missing>'}`);
    if (expectedVersion && env.version && env.version !== expectedVersion) {
      issues.push(`version=${env.version}`);
    }
    if (outLog && !isInside(outLog, path.join(expectedRoot, 'logs'))) {
      issues.push(`out_log=${outLog}`);
    }
    if (errorLog && !isInside(errorLog, path.join(expectedRoot, 'logs'))) {
      issues.push(`error_log=${errorLog}`);
    }

    if (issues.length > 0) stale.push({ name, issues });
    else healthy.push({ name, status: env.status, pid: entry.pid || 0 });
  }

  return { expectedRoot, stale, missing, healthy, byName };
}

export function verifyManagedProcesses(processes, expectedAppDir, expectedVersion) {
  const analysis = analyseManagedProcesses(processes, expectedAppDir, expectedVersion);
  const issues = [];

  for (const name of analysis.missing) issues.push(`${name}: missing`);
  for (const entry of analysis.stale) issues.push(`${entry.name}: ${entry.issues.join(', ')}`);

  const api = analysis.byName.get('secureasset');
  if (api) {
    const status = api.pm2_env?.status;
    if (status !== 'online') issues.push(`secureasset: status=${status || '<missing>'}`);
    if (!Number.isInteger(api.pid) || api.pid <= 0) issues.push('secureasset: no running pid');
  }

  for (const name of managedProcessNames.filter((entry) => entry !== 'secureasset')) {
    const worker = analysis.byName.get(name);
    if (worker?.pm2_env?.status === 'errored') issues.push(`${name}: status=errored`);
  }

  return { ...analysis, issues, ok: issues.length === 0 };
}
