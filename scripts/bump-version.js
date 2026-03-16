#!/usr/bin/env node
/**
 * scripts/bump-version.js
 *
 * Increments the patch, minor, or major segment of the version in
 * package.json and app.json, then prints the new version.
 *
 * Usage:
 *   node scripts/bump-version.js          # patch  2.0.0 → 2.0.1
 *   node scripts/bump-version.js patch    # patch  2.0.0 → 2.0.1
 *   node scripts/bump-version.js minor    # minor  2.0.0 → 2.1.0
 *   node scripts/bump-version.js major    # major  2.0.0 → 3.0.0
 *
 * Or via npm:
 *   npm run version:bump
 *   npm run version:bump -- minor
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PKG_PATH = path.join(ROOT, "package.json");
const APP_PATH = path.join(ROOT, "app.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function bumpVersion(current, segment) {
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Unexpected version format: "${current}". Expected "MAJOR.MINOR.PATCH".`);
  }
  switch (segment) {
    case "major":
      return `${parts[0] + 1}.0.0`;
    case "minor":
      return `${parts[0]}.${parts[1] + 1}.0`;
    case "patch":
    default:
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

const segment = (process.argv[2] || "patch").toLowerCase();
if (!["patch", "minor", "major"].includes(segment)) {
  console.error(`Unknown segment "${segment}". Use patch, minor, or major.`);
  process.exit(1);
}

const pkg = readJson(PKG_PATH);
const oldVersion = pkg.version;
const newVersion = bumpVersion(oldVersion, segment);

// Update package.json
pkg.version = newVersion;
writeJson(PKG_PATH, pkg);

// Update app.json if it has an expo.version field
const app = readJson(APP_PATH);
if (app?.expo?.version) {
  app.expo.version = newVersion;
  writeJson(APP_PATH, app);
}

console.log(`✅  Version bumped (${segment}): ${oldVersion} → ${newVersion}`);
