/**
 * Pushes store-listing/graphics/<locale>/ images to the Google Play listing:
 * the 1024x500 feature-graphic.png and the numbered screenshots/ set
 * (phoneScreenshots, replaced wholesale in filename order).
 * Dependency-free (Node >= 18). Mirrors push-play-listing.js auth.
 *
 *   node scripts/push-play-graphics.js --key /path/to/service-account.json [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PKG = 'com.sassagold.whereami';
const ROOT = path.join(__dirname, '..', 'store-listing', 'graphics');
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}`;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const DRY = process.argv.includes('--dry-run');
const KEY_PATH = arg('--key');
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

async function uploadImage(token, editId, locale, imageType, filePath) {
  const res = await fetch(
    `${UPLOAD}/edits/${editId}/listings/${locale}/${imageType}?uploadType=media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
      body: fs.readFileSync(filePath),
    }
  );
  if (!res.ok) throw new Error(`upload ${locale}/${imageType}: ${res.status} ${await res.text()}`);
  return res.json();
}

(async () => {
  // Locale dirs are the ones that hold a feature graphic and/or screenshots.
  const locales = fs.readdirSync(ROOT).filter((d) => {
    const p = path.join(ROOT, d);
    return fs.statSync(p).isDirectory() &&
      (fs.existsSync(path.join(p, 'feature-graphic.png')) ||
       fs.existsSync(path.join(p, 'screenshots')));
  });

  const plan = {};
  for (const loc of locales) {
    const fg = path.join(ROOT, loc, 'feature-graphic.png');
    const shotsDir = path.join(ROOT, loc, 'screenshots');
    const shots = fs.existsSync(shotsDir)
      ? fs.readdirSync(shotsDir).filter((f) => f.endsWith('.png')).sort()
          .map((f) => path.join(shotsDir, f))
      : [];
    plan[loc] = { fg: fs.existsSync(fg) ? fg : null, shots };
    console.log(`  ${loc}: feature-graphic ${plan[loc].fg ? 'yes' : 'NO'}, ` +
      `${shots.length} screenshots`);
  }
  if (DRY) { console.log('dry run — nothing pushed'); return; }

  const token = await accessToken();
  const edit = await api(token, 'POST', `${BASE}/edits`, {});
  console.log('edit:', edit.id);

  for (const [loc, p] of Object.entries(plan)) {
    if (p.fg) {
      await api(token, 'DELETE', `${BASE}/edits/${edit.id}/listings/${loc}/featureGraphic`);
      await uploadImage(token, edit.id, loc, 'featureGraphic', p.fg);
      console.log(`feature graphic replaced: ${loc}`);
    }
    if (p.shots.length) {
      await api(token, 'DELETE', `${BASE}/edits/${edit.id}/listings/${loc}/phoneScreenshots`);
      for (const shot of p.shots) {
        await uploadImage(token, edit.id, loc, 'phoneScreenshots', shot);
      }
      console.log(`phone screenshots replaced: ${loc} (${p.shots.length})`);
    }
  }

  await api(token, 'POST', `${BASE}/edits/${edit.id}:commit`);
  console.log('COMMITTED — graphics sent to Play review');
})().catch((e) => { console.error(e.message); process.exit(1); });
