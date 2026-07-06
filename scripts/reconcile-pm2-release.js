import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { analyseManagedProcesses, managedProcessNames, verifyManagedProcesses } from './lib/pm2-release.js';

const mode = process.argv[2] || '--prepare';
if (!['--prepare', '--verify', '--status'].includes(mode)) {
  console.error('Usage: node scripts/reconcile-pm2-release.js [--prepare|--verify|--status]');
  process.exit(2);
}

const appDir = path.resolve(process.env.APP_DIR || process.cwd());
const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
const pm2Bin = path.join(appDir, 'node_modules', '.bin', process.platform === 'win32' ? 'pm2.cmd' : 'pm2');

const runPm2 = (args, options = {}) => {
  const result = spawnSync(pm2Bin, args, {
    cwd: appDir,
    encoding: 'utf8',
    env: { ...process.env, PM2_HOME: process.env.PM2_HOME || path.join(process.env.HOME || '', '.pm2') },
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`PM2 ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result;
};

const readProcesses = () => {
  const result = runPm2(['jlist']);
  try {
    return JSON.parse(result.stdout || '[]');
  } catch (error) {
    throw new Error(`PM2 returned invalid process JSON: ${error.message}`);
  }
};

const describe = (analysis) => {
  console.log(`Expected PM2 application root: ${analysis.expectedRoot}`);
  if (analysis.missing.length > 0) console.log(`Missing managed processes: ${analysis.missing.join(', ')}`);
  for (const entry of analysis.stale) console.log(`Stale PM2 process ${entry.name}: ${entry.issues.join('; ')}`);
  for (const entry of analysis.healthy) console.log(`Aligned PM2 process ${entry.name}: ${entry.status || 'unknown'} (pid ${entry.pid || 0})`);
};

try {
  const processes = readProcesses();
  if (mode === '--prepare') {
    const analysis = analyseManagedProcesses(processes, appDir, packageJson.version);
    describe(analysis);
    if (analysis.stale.length > 0) {
      const staleNames = analysis.stale.map((entry) => entry.name);
      console.log(`Deleting stale PM2 definitions before activation: ${staleNames.join(', ')}`);
      runPm2(['delete', ...staleNames]);
    } else {
      console.log('No stale PM2 definitions require deletion.');
    }
    process.exit(0);
  }

  if (mode === '--verify') {
    const result = verifyManagedProcesses(processes, appDir, packageJson.version);
    describe(result);
    if (!result.ok) {
      console.error(`PM2 release verification failed:\n- ${result.issues.join('\n- ')}`);
      process.exit(1);
    }
    console.log(`PM2 release verification passed for ${managedProcessNames.length} managed processes.`);
    process.exit(0);
  }

  describe(analyseManagedProcesses(processes, appDir, packageJson.version));
} catch (error) {
  console.error(`PM2 release reconciliation failed: ${error.message}`);
  process.exit(1);
}
