/**
 * Pushes store-listing/locales/* (title, short & full description) to the
 * Google Play listing for all locales present, and attaches the matching
 * whats-new-<version>.txt release notes to the current production release.
 * Dependency-free (Node >= 18).
 *
 *   node scripts/push-play-listing.js --key /path/to/service-account.json \
 *        [--notes-version 1.4.0] [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PKG = 'com.sassagold.whereami';
const ROOT = path.join(__dirname, '..', 'store-listing', 'locales');
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const DRY = process.argv.includes('--dry-run');
const KEY_PATH = arg('--key');
const NOTES_VERSION = arg('--notes-version', '1.4.0');
if (!KEY_PATH) { console.error('Missing --key <service-account.json>'); process.exit(1); }

const b64u = (b) => Buffer.from(b).toString('base64url');

async function accessToken() {
  const k = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64u(JSON.stringify({
    iss: k.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: k.token_uri, iat: now, exp: now + 3600,
  }));
  const input = `${header}.${claims}`;
  const sig = crypto.createSign('RSA-SHA256').update(input).sign(k.private_key);
  const jwt = `${input}.${b64u(sig)}`;
  const res = await fetch(k.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function api(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const read = (loc, f) => {
  const p = path.join(ROOT, loc, f);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : null;
};

(async () => {
  const locales = fs.readdirSync(ROOT).filter((d) =>
    fs.statSync(path.join(ROOT, d)).isDirectory());
  console.log('locales:', locales.join(', '));

  const LIM = { title: 30, short: 80, full: 4000, notes: 500 };
  const payload = {};
  for (const loc of locales) {
    const title = read(loc, 'title.txt');
    const short = read(loc, 'short_description.txt');
    const full = read(loc, 'full_description.txt');
    const notes = read(loc, `whats-new-${NOTES_VERSION}.txt`);
    if (title.length > LIM.title || short.length > LIM.short || full.length > LIM.full ||
        (notes && notes.length > LIM.notes)) {
      throw new Error(`${loc}: a text exceeds Play limits`);
    }
    payload[loc] = { title, short, full, notes };
    console.log(`  ${loc}: title ${title.length}/30, short ${short.length}/80, ` +
      `full ${full.length}/4000, notes ${notes ? notes.length + '/500' : '—'}`);
  }
  if (DRY) { console.log('dry run — nothing pushed'); return; }

  const token = await accessToken();
  const edit = await api(token, 'POST', `${BASE}/edits`, {});
  console.log('edit:', edit.id);

  for (const [loc, p] of Object.entries(payload)) {
    await api(token, 'PUT', `${BASE}/edits/${edit.id}/listings/${loc}`, {
      language: loc, title: p.title,
      shortDescription: p.short, fullDescription: p.full,
    });
    console.log('listing updated:', loc);
  }

  // Attach release notes to the current production release
  const track = await api(token, 'GET', `${BASE}/edits/${edit.id}/tracks/production`);
  const release = track.releases && track.releases[0];
  if (release) {
    release.releaseNotes = Object.entries(payload)
      .filter(([, p]) => p.notes)
      .map(([loc, p]) => ({ language: loc, text: p.notes }));
    await api(token, 'PUT', `${BASE}/edits/${edit.id}/tracks/production`, {
      track: 'production', releases: [release],
    });
    console.log(`release notes attached to ${release.name} (${release.versionCodes})`);
  } else {
    console.log('no production release found — skipped notes');
  }

  await api(token, 'POST', `${BASE}/edits/${edit.id}:commit`);
  console.log('COMMITTED — changes sent to Play review');
})().catch((e) => { console.error(e.message); process.exit(1); });
