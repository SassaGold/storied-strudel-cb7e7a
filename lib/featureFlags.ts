// ── Feature Flags ─────────────────────────────────────────────────────────────
// Feature flags are resolved at runtime from `app.config.js` → `extra`.
// Set them via environment variables in your `.env` file (see `.env.example`).
//
// Usage:
//   import { flags } from "../lib/featureFlags";
//   if (flags.emergencyTab) { ... }

import Constants from "expo-constants";

/** All feature flags with their runtime-resolved values. */
export interface FeatureFlags {
  /** Show the SOS/Emergency tab in the bottom navigation bar. Default: true. */
  emergencyTab: boolean;
  /** Show the Trip Logger tab. Default: true. */
  triploggerTab: boolean;
  /** Show the MC/Garage tab. Default: true. */
  mcTab: boolean;
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  const str = String(value).toLowerCase().trim();
  if (str === "false" || str === "0") return false;
  if (str === "true" || str === "1") return true;
  return fallback;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

export const flags: Readonly<FeatureFlags> = {
  emergencyTab: toBool(extra.featureEmergencyTab, true),
  triploggerTab: toBool(extra.featureTriploggerTab, true),
  mcTab: toBool(extra.featureMcTab, true),
};
