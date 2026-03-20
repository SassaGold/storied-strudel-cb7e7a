// ── lib/config.ts ─────────────────────────────────────────────────────────────
// Central configuration constants for the Roamly app.
// All magic numbers, API base URLs, timeouts and cache parameters live here.
// Import from this file instead of hardcoding values in feature modules.

// ── API base URLs ─────────────────────────────────────────────────────────────

/** Nominatim reverse-geocoding (OpenStreetMap). No API key required. */
export const NOMINATIM_BASE_URL =
  "https://nominatim.openstreetmap.org/reverse?format=jsonv2";

/** Open-Meteo weather forecast. No API key required. */
export const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";

/** yr.no forecast deep-link base (daily table view). */
export const YR_NO_BASE_URL = "https://www.yr.no/en/forecast/daily-table";

/** Fallback yr.no URL when no location is available. */
export const YR_NO_FALLBACK_URL = "https://www.yr.no";

/** Wikipedia REST API summary endpoint template (insert lang + title). */
export const WIKIPEDIA_SUMMARY_URL = (lang: string, title: string) =>
  `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

// ── GitHub API ────────────────────────────────────────────────────────────────

/** GitHub repository identifier (owner/repo). */
export const GITHUB_REPO = "SassaGold/storied-strudel-cb7e7a";

/** GitHub REST API base URL for this repository. */
export const GITHUB_API_REPO_URL = `https://api.github.com/repos/${GITHUB_REPO}`;

/** GitHub REST API URL for releases. */
export const GITHUB_API_RELEASES_URL = `${GITHUB_API_REPO_URL}/releases`;

/** GitHub REST API URL for commits. */
export const GITHUB_API_COMMITS_URL = `${GITHUB_API_REPO_URL}/commits`;

/** GitHub raw content URL for CHANGELOG.md (master branch). */
export const GITHUB_RAW_CHANGELOG_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/master/CHANGELOG.md`;

/** GitHub HTML URL for browsing this repository. */
export const GITHUB_HTML_URL = `https://github.com/${GITHUB_REPO}`;

// ── Overpass API ──────────────────────────────────────────────────────────────

/** Overpass API mirrors — free OpenStreetMap data, no API key required. */
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

/** Default per-request timeout for Overpass queries (ms). */
export const OVERPASS_DEFAULT_TIMEOUT_MS = 40_000;

/** Overpass timeout for road-condition queries (faster, smaller result set). */
export const OVERPASS_ROAD_TIMEOUT_MS = 15_000;

/** Search radius for emergency POIs (metres). */
export const EMERGENCY_SEARCH_RADIUS_M = 10_000;

/** Maximum Overpass results fetched for emergency POIs. */
export const EMERGENCY_MAX_RESULTS = 80;

/** Maximum results kept in state after distance-sorting (emergency). */
export const EMERGENCY_MAX_DISPLAY = 40;

/** Maximum results kept in state after distance-sorting (generic POI tabs). */
export const POI_MAX_DISPLAY = 30;

/** Overpass amenity type filter for emergency services. */
export const EMERGENCY_AMENITY_TYPES =
  "hospital|police|fire_station|pharmacy|clinic|doctors|ambulance_station";

// ── Caching ───────────────────────────────────────────────────────────────────

/** AsyncStorage TTL for all POI result caches: 30 minutes. */
export const CACHE_TTL_MS = 30 * 60 * 1_000;

// ── Retry ─────────────────────────────────────────────────────────────────────

/** Default maximum number of attempts for `withRetry`. */
export const RETRY_MAX_ATTEMPTS = 3;

/** Initial back-off delay for `withRetry` (ms). Doubles on each retry. */
export const RETRY_INITIAL_DELAY_MS = 500;

// ── Unit-conversion constants ─────────────────────────────────────────────────

/** Earth radius in metres (used by haversineMeters). */
export const EARTH_RADIUS_M = 6_371_000;

/** Earth radius in kilometres (used by haversineKm). */
export const EARTH_RADIUS_KM = 6_371;

/** Factor: kilometres → miles. */
export const KM_TO_MILES = 0.621371;

/** Factor: metres → feet. */
export const M_TO_FEET = 3.28084;

/** Factor: km/h → mph. */
export const KMH_TO_MPH = 0.621371;

/** Factor: Celsius to Fahrenheit multiplier. */
export const C_TO_F_FACTOR = 1.8;

/** Factor: Celsius to Fahrenheit offset. */
export const C_TO_F_OFFSET = 32;

/** Metres per mile (used for ft/mi threshold). */
export const METRES_PER_MILE = 1609.34;

/** Short-distance threshold: below this in miles, display in feet. */
export const SHORT_DISTANCE_THRESHOLD_MILES = 0.1;

// ── Open-Meteo forecast parameters ───────────────────────────────────────────

/** Number of forecast days to request from Open-Meteo. */
export const FORECAST_DAYS = 4;

/** Number of future hourly slots to display on the HQ screen. */
export const HOURLY_SLOTS = 6;

/** Number of forecast days to display (skipping today). */
export const FORECAST_DISPLAY_DAYS = 3;

// ── Road conditions ───────────────────────────────────────────────────────────

/** Maximum road alerts to display on the RIDER HQ screen. */
export const ROAD_ALERTS_MAX = 10;

/** Overpass query timeout for road-condition queries (seconds, embedded in QL). */
export const ROAD_OVERPASS_TIMEOUT_S = 10;

/** Maximum Overpass results for road-condition queries. */
export const ROAD_MAX_RESULTS = 20;

// ── Trip logger ───────────────────────────────────────────────────────────────

/** GPS update interval for the trip logger (ms). */
export const TRIP_LOCATION_INTERVAL_MS = 1_500;
