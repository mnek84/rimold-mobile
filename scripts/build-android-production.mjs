#!/usr/bin/env node
/**
 * Production Android APK build via EAS (cloud by default).
 *
 * Usage:
 *   npm run build:android:production
 *   npm run build:android:production -- --local
 *   npm run build:android:production -- --download
 *   npm run build:android:production -- --yes   # skip confirmation prompt
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_FILE = resolve(ROOT, '.env.production');
const APP_JSON = resolve(ROOT, 'app.json');
const EAS_PROFILE = 'production';

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const shouldDownload = args.includes('--download');
const allowHttp = args.includes('--allow-http');
const skipConfirm = args.includes('--yes') || args.includes('-y');

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`→ ${message}`);
}

function run(command, commandArgs, options = {}) {
  info(`${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    fail(`Command failed: ${command} ${commandArgs.join(' ')}`);
  }
}

function parseEnvFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const vars = {};

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    vars[key] = value;
  }

  return vars;
}

function maskEnvValue(key, value) {
  if (/token|secret|password|api[_-]?key/i.test(key) && value.length > 8) {
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
  }
  return value;
}

function isPrivateApiUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      return true;
    }

    if (host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.')) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

function readAppConfig() {
  return JSON.parse(readFileSync(APP_JSON, 'utf8')).expo ?? {};
}

function getExpoAccount() {
  const result = spawnSync('npx', ['eas', 'whoami'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0 || !result.stdout?.trim()) {
    fail('Not logged in to Expo. Run: npx eas login');
  }

  return result.stdout.trim();
}

function ensureEasCli() {
  run('npx', ['eas', '--version']);
}

function validateEnv() {
  if (!existsSync(ENV_FILE)) {
    fail(
      `Missing ${ENV_FILE}\n` +
        '  Copy .env.production.example to .env.production and set EXPO_PUBLIC_API_URL.',
    );
  }

  const env = parseEnvFile(ENV_FILE);
  const apiUrl = env.EXPO_PUBLIC_API_URL?.trim();

  if (!apiUrl) {
    fail('EXPO_PUBLIC_API_URL is required in .env.production');
  }

  try {
    const parsed = new URL(apiUrl);
    if (!allowHttp && parsed.protocol !== 'https:') {
      fail(
        'EXPO_PUBLIC_API_URL must use HTTPS for production builds (pass --allow-http to override).',
      );
    }
  } catch {
    fail('EXPO_PUBLIC_API_URL is not a valid URL');
  }

  if (isPrivateApiUrl(apiUrl)) {
    fail(
      'EXPO_PUBLIC_API_URL points to localhost or a private network address. ' +
        'Client devices cannot reach that host.',
    );
  }

  return env;
}

function validateAppConfig(appConfig) {
  const androidPackage = appConfig?.android?.package ?? null;

  if (!androidPackage) {
    fail(
      'Missing expo.android.package in app.json.\n' +
        '  Example: "android": { "package": "com.yourcompany.logistica" }',
    );
  }

  return androidPackage;
}

function printBuildSummary({ expoAccount, env, appConfig, androidPackage }) {
  const envKeys = Object.keys(env).sort();

  console.log('\nBuild summary');
  console.log('─────────────');
  console.log(`  Expo account     ${expoAccount.split('\n')[0]}`);
  console.log(`  EAS profile      ${EAS_PROFILE}`);
  console.log(`  Platform         android (APK)`);
  console.log(`  Build mode       ${isLocal ? 'local' : 'cloud'}`);
  console.log(`  Download APK     ${shouldDownload ? 'yes' : 'no'}`);
  console.log(`  App name         ${appConfig.name ?? '—'}`);
  console.log(`  App version      ${appConfig.version ?? '—'}`);
  console.log(`  Android package  ${androidPackage}`);
  console.log(`  Env file         ${ENV_FILE}`);
  console.log('');
  console.log('Environment variables');
  console.log('─────────────────────');

  if (envKeys.length === 0) {
    console.log('  (none)');
  } else {
    for (const key of envKeys) {
      console.log(`  ${key}=${maskEnvValue(key, env[key])}`);
    }
  }

  console.log('');
}

async function confirmBuild() {
  if (skipConfirm) {
    info('Skipping confirmation (--yes).');
    return;
  }

  const rl = createInterface({ input, output });

  try {
    const answer = await rl.question('Continue with this production build? [y/N] ');
    const normalized = answer.trim().toLowerCase();

    if (normalized !== 'y' && normalized !== 'yes') {
      console.log('\nBuild cancelled.\n');
      process.exit(0);
    }
  } finally {
    rl.close();
  }
}

function pushEnvToEas() {
  run('npx', [
    'eas',
    'env:push',
    '--environment',
    'production',
    '--path',
    ENV_FILE,
    '--force',
    '--non-interactive',
  ]);
}

function buildApk() {
  const buildArgs = ['eas', 'build', '--platform', 'android', '--profile', EAS_PROFILE];

  if (isLocal) {
    buildArgs.push('--local');
  }

  // Do not pass --non-interactive: the first build must generate an Android keystore
  // interactively. Subsequent builds reuse credentials stored on Expo.
  run('npx', buildArgs);
}

function downloadApk() {
  run('npx', [
    'eas',
    'build:download',
    '--platform',
    'android',
    '--profile',
    EAS_PROFILE,
    '--non-interactive',
  ]);
}

async function main() {
  console.log('\nLogística mobile — production Android APK build\n');

  ensureEasCli();
  const expoAccount = getExpoAccount();
  const env = validateEnv();
  const appConfig = readAppConfig();
  const androidPackage = validateAppConfig(appConfig);

  printBuildSummary({ expoAccount, env, appConfig, androidPackage });
  await confirmBuild();

  pushEnvToEas();
  buildApk();

  if (shouldDownload) {
    downloadApk();
  }

  console.log('\n✔ Production build finished.');
  if (!isLocal && !shouldDownload) {
    console.log('  Download the APK from the Expo dashboard or run with --download.\n');
  } else {
    console.log('');
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
