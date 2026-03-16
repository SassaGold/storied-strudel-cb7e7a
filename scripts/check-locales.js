#!/usr/bin/env node
/**
 * scripts/check-locales.js
 *
 * Validates that all locale JSON files under lib/locales/ have exactly the
 * same set of keys as the reference locale (en.json).  Run via:
 *
 *   node scripts/check-locales.js
 *   npm run check-locales
 *
 * Exits with code 0 when all locales are complete, or code 1 when any
 * locale has missing or extra keys (listing each discrepancy).
 */

const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.join(__dirname, "..", "lib", "locales");
const REFERENCE_LOCALE = "en.json";

/**
 * Recursively flatten a nested object into dot-separated key paths.
 * e.g. { a: { b: "x" } } → ["a.b"]
 */
function flattenKeys(obj, prefix = "") {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

// ── Load all locale files ─────────────────────────────────────────────────────

const files = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

if (!files.includes(REFERENCE_LOCALE)) {
  console.error(`Reference locale "${REFERENCE_LOCALE}" not found in ${LOCALES_DIR}`);
  process.exit(1);
}

const referenceData = JSON.parse(
  fs.readFileSync(path.join(LOCALES_DIR, REFERENCE_LOCALE), "utf8")
);
const referenceKeys = new Set(flattenKeys(referenceData));

console.log(`Reference: ${REFERENCE_LOCALE} (${referenceKeys.size} keys)\n`);

let allOk = true;

for (const file of files) {
  if (file === REFERENCE_LOCALE) continue;

  const data = JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, file), "utf8")
  );
  const keys = new Set(flattenKeys(data));

  const missing = [...referenceKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !referenceKeys.has(k));

  if (missing.length === 0 && extra.length === 0) {
    console.log(`  ✅  ${file} — OK (${keys.size} keys)`);
  } else {
    allOk = false;
    console.error(`  ❌  ${file} — ${missing.length} missing, ${extra.length} extra`);
    for (const k of missing) console.error(`       MISSING : ${k}`);
    for (const k of extra)   console.error(`       EXTRA   : ${k}`);
  }
}

console.log("");

if (!allOk) {
  console.error("Locale check FAILED. Add the missing keys to the locale files listed above.");
  process.exit(1);
} else {
  console.log("Locale check PASSED. All locale files are complete.");
}
