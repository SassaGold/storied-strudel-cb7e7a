// ── Centralised constants ─────────────────────────────────────────────────────
// All external service URLs and shared magic numbers live here so they can be
// found and updated in one place rather than scattered across lib/useRiderHQ.ts,
// lib/usePOIFetch.ts, app/(tabs)/settings.tsx, app/(tabs)/triplogger.tsx, etc.
//
// API base URLs can be overridden at build time via environment variables
// (see .env.example and app.config.js).  Use NOMINATIM_BASE_URL,
// OPEN_METEO_BASE_URL, and OVERPASS_ENDPOINTS to point at a self-hosted or
// staging mirror without touching this file.

import Constants from "expo-constants";

const _extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

/** Resolved Nominatim base URL — override via NOMINATIM_BASE_URL env var. */
const NOMINATIM_BASE =
  typeof _extra.nominatimBaseUrl === "string" && _extra.nominatimBaseUrl
    ? _extra.nominatimBaseUrl.replace(/\/$/, "")
    : "https://nominatim.openstreetmap.org";

/** Resolved Open-Meteo base URL — override via OPEN_METEO_BASE_URL env var. */
const OPEN_METEO_BASE =
  typeof _extra.openMeteoBaseUrl === "string" && _extra.openMeteoBaseUrl
    ? _extra.openMeteoBaseUrl.replace(/\/$/, "")
    : "https://api.open-meteo.com";

// ── POI search ────────────────────────────────────────────────────────────────

/** Selectable search-radius options exposed in the Settings screen (km). */
export const SEARCH_RADIUS_OPTIONS_KM: ReadonlyArray<number> = [2, 5, 10, 15, 20];

/** Default search radius (km) — must be one of SEARCH_RADIUS_OPTIONS_KM. */
export const DEFAULT_SEARCH_RADIUS_KM = 5;

// ── Trip logger / GPS ─────────────────────────────────────────────────────────

/**
 * Minimum displacement (metres) required before a new GPS point is accepted
 * into a recorded route.  Points closer than this are treated as jitter and
 * discarded.  Applied identically in the foreground watcher and the background
 * task flush inside triplogger.tsx.
 */
export const JITTER_FILTER_METERS = 3;

// ── AsyncStorage cache versioning ─────────────────────────────────────────────

/**
 * Bump this string whenever the shape of a cached POI/Place object changes
 * (e.g. a new field is added or removed).  All cache keys incorporate this
 * version so stale caches from an older schema are automatically ignored.
 */
export const CACHE_SCHEMA_VERSION = "v2";

// ── API endpoint constants ────────────────────────────────────────────────────

/** Nominatim reverse-geocoding (OpenStreetMap) — free, no API key required. */
export const nominatimReverseUrl = (lat: number, lon: number): string =>
  `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;

/** Open-Meteo weather forecast — free, no API key required. */
export const openMeteoForecastUrl = (lat: number, lon: number): string =>
  `${OPEN_METEO_BASE}/v1/forecast` +
  `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
  `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,relative_humidity_2m,precipitation,weather_code,precipitation_probability` +
  `&hourly=temperature_2m,weather_code,precipitation_probability` +
  `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
  `&forecast_days=4&timezone=auto`;

/** yr.no daily forecast deep-link for a lat/lon pair. */
export const yrNoForecastUrl = (lat: number, lon: number): string =>
  `https://www.yr.no/en/forecast/daily-table/${encodeURIComponent(`${lat.toFixed(4)},${lon.toFixed(4)}`)}`;

/** yr.no homepage fallback when location is not known. */
export const YR_NO_HOME_URL = "https://www.yr.no";

/** Wikipedia REST API — summary endpoint. Free, no API key required. */
export const wikipediaSummaryUrl = (lang: string, title: string): string =>
  `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

/** Wikipedia article page URL. */
export const wikipediaPageUrl = (lang: string, title: string): string =>
  `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
