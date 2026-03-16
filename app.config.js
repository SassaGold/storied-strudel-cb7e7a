const appJson = require("./app.json");

module.exports = ({ config }) => {
  const base = appJson.expo ?? config;
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? "";
  const staticKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY ?? "";

  // ── Feature flags (set to "false" / "0" to disable a tab) ─────────────────
  const featureEmergencyTab = process.env.FEATURE_EMERGENCY_TAB ?? "true";
  const featureTriploggerTab = process.env.FEATURE_TRIPLOGGER_TAB ?? "true";
  const featureMcTab = process.env.FEATURE_MC_TAB ?? "true";

  // ── API endpoint overrides ─────────────────────────────────────────────────
  // Leave blank to use the default OSS endpoints defined in lib/config.ts.
  const overpassEndpoints = process.env.OVERPASS_ENDPOINTS ?? "";
  const nominatimBaseUrl = process.env.NOMINATIM_BASE_URL ?? "";
  const openMeteoBaseUrl = process.env.OPEN_METEO_BASE_URL ?? "";

  // ── Crash reporting ────────────────────────────────────────────────────────
  // Set SENTRY_DSN to your project DSN to enable crash reporting in production.
  const sentryDsn = process.env.SENTRY_DSN ?? "";

  return {
    ...base,
    android: {
      ...(base.android ?? {}),
      config: {
        ...((base.android ?? {}).config ?? {}),
        googleMaps: {
          apiKey: androidMapsKey,
        },
      },
    },
    extra: {
      ...(base.extra ?? {}),
      googleMapsStaticKey: staticKey,
      // Feature flags
      featureEmergencyTab,
      featureTriploggerTab,
      featureMcTab,
      // API endpoint overrides (empty string = use defaults)
      overpassEndpoints,
      nominatimBaseUrl,
      openMeteoBaseUrl,
      // Crash reporting
      sentryDsn,
    },
  };
};
