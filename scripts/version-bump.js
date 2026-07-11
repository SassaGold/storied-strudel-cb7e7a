#!/usr/bin/env node
/**
 * version-bump.js — bump the app version in app.json and package.json.
 *
 * Usage:
 *   node scripts/version-bump.js          # bump patch  (1.0.0 → 1.0.1)
 *   node scripts/version-bump.js patch    # bump patch  (1.0.0 → 1.0.1)
 *   node scripts/version-bump.js minor    # bump minor  (1.0.0 → 1.1.0)
 *   node scripts/version-bump.js major    # bump major  (1.0.0 → 2.0.0)
 *
 * Or via npm scripts:
 *   npm run version:patch
 *   npm run version:minor
 *   npm run version:major
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP_JSON = path.join(ROOT, 'app.json');
const PKG_JSON = path.join(ROOT, 'package.json');
const README = path.join(ROOT, 'README.md');

const type = (process.argv[2] || 'patch').toLowerCase();
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error(`Unknown bump type "${type}". Use patch, minor, or major.`);
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function bumpSemver(version, bumpType) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Cannot parse semver "${version}"`);
  }
  const [major, minor, patch] = parts;
  if (bumpType === 'major') return `${major + 1}.0.0`;
  if (bumpType === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// ── Read ─────────────────────────────────────────────────────────────────────

const appJson = readJson(APP_JSON);
const pkgJson = readJson(PKG_JSON);

const current = appJson.expo.version;
const next = bumpSemver(current, type);

// ── Update ───────────────────────────────────────────────────────────────────

appJson.expo.version = next;
pkgJson.version = next;

// ── Write ────────────────────────────────────────────────────────────────────

writeJson(APP_JSON, appJson);
writeJson(PKG_JSON, pkgJson);

// Keep the README's version banner in sync so it can't go stale.
try {
  const readme = fs.readFileSync(README, 'utf8');
  const updated = readme
    .replace(/Current version: \d+\.\d+\.\d+/, `Current version: ${next}`)
    .replace(/user-facing version \(`\d+\.\d+\.\d+`\)/, `user-facing version (\`${next}\`)`);
  if (updated !== readme) fs.writeFileSync(README, updated, 'utf8');
} catch {
  // README is cosmetic — never fail the bump over it.
}

console.log(`Version bumped (${type}): ${current} → ${next}`);
