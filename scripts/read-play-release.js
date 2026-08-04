/**
 * Read back the current production release from Google Play — version, status,
 * rollout and how many locales have release notes attached.
 *
 * Exists because "the push script said it worked" is not verification. The 1.4.1
 * release shipped with notes=0 locales despite the push appearing to succeed;
 * the only way to know is to ask Play what it actually holds.
 *
 *   node scripts/read-play-release.js --key /path/to/service-account.json
 */
const fs = require('fs');
const crypto = require('crypto');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const PKG = 'com.sassagold.whereami';
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const KEY = arg('--key');
if (!KEY) { console.error('Missing --key <service-account.json>'); process.exit(1); }

const sa = JSON.parse(fs.readFileSync(KEY, 'utf8'));

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('token failed: ' + JSON.stringify(j));
  return j.access_token;
}

(async () => {
  const tok = await token();
  const H = { Authorization: `Bearer ${tok}` };

  const edit = await (await fetch(`${BASE}/edits`, { method: 'POST', headers: H })).json();
  const track = await (await fetch(`${BASE}/edits/${edit.id}/tracks/production`, { headers: H })).json();

  for (const r of track.releases || []) {
    console.log(`versions   : ${(r.versionCodes || []).join(', ')}`);
    console.log(`name       : ${r.name}`);
    console.log(`status     : ${r.status}`);
    console.log(`rollout    : ${r.userFraction != null ? r.userFraction * 100 + '%' : 'full'}`);
    const notes = r.releaseNotes || [];
    console.log(`notes      : ${notes.length} locale(s)`);
    for (const n of notes) {
      const first = n.text.split('\n')[0];
      console.log(`   ${n.language.padEnd(6)} ${[...n.text].length} chars   ${first}`);
    }
    console.log('');
  }

  // Discard the throwaway edit so it never lands on top of a pending change.
  await fetch(`${BASE}/edits/${edit.id}`, { method: 'DELETE', headers: H });
  console.log('(read-only: temporary edit discarded)');
})().catch(e => { console.error(e.message); process.exit(1); });
