/**
 * Rebuilds the Play Console Data safety questionnaire CSV from a fresh export.
 *
 *   node store-listing/data-safety-build.js [path/to/fresh-export.csv]
 *
 * Play Console -> App content -> Data safety has "Export to CSV" and "Import
 * from CSV". Export, run this over the export, then import the result — far
 * faster and more auditable than clicking ~40 controls across a 5-step wizard.
 *
 * The schema is Google's and can change, so prefer passing a FRESH export
 * rather than relying on the committed baseline. The script hard-fails if any
 * question ID it wants is missing, so a schema change is loud, not silent.
 *
 * Answers and the reasoning behind them: DATA_SAFETY.md in this directory.
 */
/* global __dirname */
// The flat eslint config applies eslint-config-expo everywhere and declares no
// Node globals, so plain CommonJS scripts trip no-undef. Declared locally rather
// than by adding an override to eslint.config.js, which would also change how
// the eight pre-existing scripts/*.js files lint.
const fs = require('fs');
const path = require('path');
const { parseCsv, serialiseCsv } = require('./data-safety-csv');

const SRC = process.argv[2] || path.join(__dirname, 'data-safety-export-baseline.csv');
const OUT = path.join(__dirname, 'data-safety.csv');

// Desired answers, from store-listing/DATA_SAFETY.md.
// Key is "questionId" for scalar rows, or "questionId|responseId" for choice rows.
const SET = new Map();

// -- Step 2: collection and security -----------------------------------------
SET.set('PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA', 'true');
SET.set('PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT', 'true');
// No accounts exist in this app, so no account-creation method applies.
SET.set('PSL_SUPPORTED_ACCOUNT_CREATION_METHODS|PSL_ACM_NONE', 'true');
// The app has no auth of any kind — no SSO, no SIM binding, no enterprise login.
// Exported as OPTIONAL but the form requires it once collection is Yes.
SET.set('PSL_HAS_OUTSIDE_APP_ACCOUNTS', 'false');
// Nothing is held off-device, so there is no deletion request flow.
SET.set('PSL_SUPPORT_DATA_DELETION_BY_USER|DATA_DELETION_NO', 'true');

// -- Step 3: data types — Location only --------------------------------------
SET.set('PSL_DATA_TYPES_LOCATION|PSL_APPROX_LOCATION', 'true');
SET.set('PSL_DATA_TYPES_LOCATION|PSL_PRECISE_LOCATION', 'true');

// -- Step 4: usage and handling, identical for both location granularities ----
for (const t of ['PSL_APPROX_LOCATION', 'PSL_PRECISE_LOCATION']) {
  const p = `PSL_DATA_USAGE_RESPONSES:${t}`;
  // "collected, shared, or both?" -> both, so select both options.
  SET.set(`${p}:PSL_DATA_USAGE_COLLECTION_AND_SHARING|PSL_DATA_USAGE_ONLY_COLLECTED`, 'true');
  SET.set(`${p}:PSL_DATA_USAGE_COLLECTION_AND_SHARING|PSL_DATA_USAGE_ONLY_SHARED`, 'true');
  // NOT ephemeral. "Ephemeral" asserts the data is held only in memory and
  // discarded once the request is served — a claim about Nominatim, Overpass,
  // Open-Meteo and the OSM tile servers, which are independent public services
  // that log requests. We cannot assert it for them, and answering Yes would
  // hide collection from the public listing card, which is the very sentence
  // this correction exists to remove.
  SET.set(`${p}:PSL_DATA_USAGE_EPHEMERAL`, 'false');
  SET.set(`${p}:DATA_USAGE_USER_CONTROL|PSL_DATA_USAGE_USER_CONTROL_OPTIONAL`, 'true');
  SET.set(`${p}:DATA_USAGE_COLLECTION_PURPOSE|PSL_APP_FUNCTIONALITY`, 'true');
  SET.set(`${p}:DATA_USAGE_SHARING_PURPOSE|PSL_APP_FUNCTIONALITY`, 'true');
}

const rows = parseCsv(fs.readFileSync(SRC, 'utf8'));
const header = rows[0];
const applied = new Set();
const changes = [];

const out = [header];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i].slice();
  if (r.length < 4) {
    out.push(r);
    continue;
  }
  const key = r[1] ? `${r[0]}|${r[1]}` : r[0];
  if (SET.has(key)) {
    const want = SET.get(key);
    const before = r[2];
    if (before !== want) {
      changes.push({ line: i + 1, key, before: before === '' ? '(blank)' : before, after: want });
      r[2] = want;
    }
    applied.add(key);
  }
  out.push(r);
}

const missing = [...SET.keys()].filter((k) => !applied.has(k));
if (missing.length) {
  console.error('FATAL: these keys were not found in the export — schema mismatch:');
  missing.forEach((k) => console.error('  ' + k));
  process.exit(1);
}

fs.writeFileSync(OUT, serialiseCsv(out), 'utf8');

console.log(`rows: ${rows.length - 1}   changed: ${changes.length}   untouched: ${rows.length - 1 - changes.length}`);
console.log('');
changes.forEach((c) => console.log(`  ${c.key}\n      ${c.before} -> ${c.after}`));
console.log('');
console.log('wrote', OUT);

// Re-parse the output and assert it round-trips to the intended state.
const check = parseCsv(fs.readFileSync(OUT, 'utf8'));
const nonEmpty = check.slice(1).filter((r) => r.length >= 4 && r[2] && r[2].trim() !== '');
console.log(`verify: ${nonEmpty.length} rows carry a value (expected ${SET.size})`);
if (nonEmpty.length !== SET.size) {
  console.error('FATAL: unexpected value count after write');
  process.exit(1);
}
console.log('verify: OK — every populated row is one we intended');
