#!/usr/bin/env node
/**
 * NIPOST API key check
 * ====================
 *   npm run nipost:check
 *
 * Reads NIPOST_API_KEY (or VITE_NIPOST_API_KEY) from the repo-root .env and
 * tells you, in plain words, what the key can do. The key is never printed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const BASE = 'https://api.postcode.gov.ng';

const ok = (m) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✘\x1b[0m ${m}`);

function readEnv() {
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return out;
}

async function call(p, key) {
  try {
    const res = await fetch(`${BASE}${p}`, { headers: { 'X-API-Key': key, Accept: 'application/json' } });
    let body = null;
    try {
      body = await res.json();
    } catch {}
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

const env = readEnv();
const key = env.NIPOST_API_KEY || env.VITE_NIPOST_API_KEY || '';

console.log('\nNIPOST API key check\n');

if (!existsSync(envPath)) {
  bad(`No .env found at ${envPath}`);
  process.exit(1);
}
if (!key) {
  bad('No NIPOST_API_KEY in .env');
  process.exit(1);
}

const kind = (key.match(/^nipost_(pk_)?(live|test)_/) || [''])[0];
const kinds = {
  nipost_test_: 'secret test key (sandbox data, server-side)',
  nipost_live_: 'secret live key (production data, server-side)',
  nipost_pk_test_: 'publishable test key (sandbox data)',
  nipost_pk_live_: 'publishable live key (production data)',
};
kind ? ok(`Key found: ${kinds[kind]}`) : warn('Key found, but it does not look like a NIPOST key (nipost_…)');
if (env.VITE_NIPOST_API_KEY && !env.NIPOST_API_KEY) {
  warn('Rename VITE_NIPOST_API_KEY to NIPOST_API_KEY in .env (VITE_ names are meant for browser code)');
}

// 1. Auth + reference catalogue (free on every key)
const states = await call('/v1/reference/states', key);
if (states.status === 0) {
  bad(`Could not reach ${BASE} (${states.error}). Check your internet connection.`);
  process.exit(1);
}
if (states.status === 401) {
  bad('Key rejected (401). Copy it again from dashboard.postcode.gov.ng → Settings → API Keys.');
  process.exit(1);
}
if (states.status === 200) ok(`Key accepted · reference catalogue works (${states.body?.data?.states?.length ?? '?'} states)`);
else warn(`Reference catalogue returned HTTP ${states.status} ${states.body?.error?.code || ''}`);

// 2. Our demo prefix exists in the real catalogue?
const areas = await call('/v1/reference/areas?state=FC&lga=02&district=A09', key);
const hasDB = areas.body?.data?.areas?.some((a) => a.code === 'DB');
hasDB ? ok('Demo prefix FC-02-A09-DB is a real NIPOST state/LGA/district/area') : warn('Could not confirm demo prefix FC-02-A09-DB');

// 3. Granted lookup level
let maxLevel = 0;
for (const level of [1, 2, 3]) {
  const r = await call(`/v1/lookup?code=FC-01-A01-KP-27&level=${level}`, key);
  if (r.status === 200) maxLevel = level;
  else break;
}
maxLevel ? ok(`Lookup works up to level ${maxLevel}${maxLevel === 1 ? ' (validity only, free)' : ''}`) : bad('Lookup not permitted for this key');
if (maxLevel && maxLevel !== Number(env.NIPOST_LOOKUP_LEVEL || 1)) {
  warn(`Set NIPOST_LOOKUP_LEVEL=${maxLevel} in .env to use it`);
}

// 4. Which real postcodes resolve with this key?
const samples = kind.includes('test')
  ? ['FC-01-A01-KP-27', 'FC-01-A01-LR-01', 'FC-01-A01-MH-01']
  : ['FC-02-B19-RT-30', 'FC-03-B06-AG-12', 'LA-11-W06-TC-10'];
let resolved = 0;
for (const code of samples) {
  const r = await call(`/v1/lookup?code=${code}&level=1`, key);
  if (r.body?.data?.valid) resolved++;
}
resolved
  ? ok(`${resolved}/${samples.length} documented ${kind.includes('test') ? 'sandbox' : 'live'} postcodes verify`)
  : warn(
      `0/${samples.length} documented ${kind.includes('test') ? 'sandbox' : 'live'} postcodes verify. ` +
        (kind.startsWith('nipost_pk_')
          ? 'Publishable keys may only see data when called from an allowlisted origin, so try a secret test key (nipost_test_…).'
          : 'Ask NIPOST support whether your key has dataset access.')
    );

// 5. Browser origin (only matters for publishable keys called directly from a page)
if (kind.startsWith('nipost_pk_')) {
  const r = await fetch(`${BASE}/v1/reference/states`, {
    headers: { 'X-API-Key': key, Origin: 'http://localhost:3000' },
  }).then((x) => x.json().catch(() => ({}))).catch(() => ({}));
  r?.error?.code === 'origin_not_allowed'
    ? warn('localhost:3000 is not on this key\'s origin allowlist (fine: the app calls NIPOST through the dev proxy)')
    : ok('localhost:3000 is allowlisted');
}

console.log('\nThe app calls NIPOST through the Vite dev proxy (/nipost → api.postcode.gov.ng),');
console.log('so the key stays on your machine and the browser origin allowlist does not apply.\n');
