#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const frontendDir = process.cwd();
const packageJsonPath = path.join(frontendDir, 'package.json');
const packageLockPath = path.join(frontendDir, 'package-lock.json');
const nodeModulesPath = path.join(frontendDir, 'node_modules');
const npmHiddenLockPath = path.join(nodeModulesPath, '.package-lock.json');
const installStatePath = path.join(nodeModulesPath, '.gonavi-install-state.json');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const commonArgs = [
  '--prefer-offline',
  '--no-audit',
  '--fund=false',
  '--fetch-retries=5',
  '--fetch-retry-mintimeout=20000',
  '--fetch-retry-maxtimeout=120000',
];

const hashFile = (filePath) => {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
};

const currentState = () => ({
  packageJson: hashFile(packageJsonPath),
  packageLock: existsSync(packageLockPath) ? hashFile(packageLockPath) : '',
});

const readInstalledState = () => {
  if (!existsSync(installStatePath)) return null;
  try {
    return JSON.parse(readFileSync(installStatePath, 'utf8'));
  } catch {
    return null;
  }
};

const writeInstalledState = (state) => {
  writeFileSync(installStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
};

const packageInputsAreOlderThanNpmLock = () => {
  if (!existsSync(npmHiddenLockPath)) return false;
  const markerTime = statSync(npmHiddenLockPath).mtimeMs;
  return [packageJsonPath, packageLockPath]
    .filter(existsSync)
    .every((filePath) => statSync(filePath).mtimeMs <= markerTime);
};

const runNpm = (subcommand) => {
  const result = spawnSync(npmCommand, [subcommand, ...commonArgs], {
    cwd: frontendDir,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const state = currentState();
const installedState = readInstalledState();
const forceInstall = process.env.GONAVI_FORCE_FRONTEND_INSTALL === '1';
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

if (!forceInstall && existsSync(nodeModulesPath)) {
  if (
    installedState?.packageJson === state.packageJson &&
    installedState?.packageLock === state.packageLock
  ) {
    console.log('Frontend dependencies are up to date; skipping npm install.');
    process.exit(0);
  }

  if (!installedState && isCI && existsSync(npmHiddenLockPath)) {
    writeInstalledState(state);
    console.log('Frontend dependencies are up to date from CI cache; recorded install state.');
    process.exit(0);
  }

  if (!installedState && packageInputsAreOlderThanNpmLock()) {
    writeInstalledState(state);
    console.log('Frontend dependencies are up to date; recorded install state.');
    process.exit(0);
  }
}

runNpm(isCI ? 'ci' : 'install');
writeInstalledState(state);
