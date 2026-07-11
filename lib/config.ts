// ── lib/config.ts ─────────────────────────────────────────────────────────────
// Central configuration constants for the Where Am I app.
// All magic numbers, API base URLs, timeouts and cache parameters live here.
// Import from this file instead of hardcoding values in feature modules.

// ── API base URLs ─────────────────────────────────────────────────────────────

/** Nominatim Reverse Geocoding API base URL (OpenStreetMap). No API key required. */
export const NOMINATIM_REVERSE_GEOCODING_BASE_URL =
  "https://nominatim.openstreetmap.org/reverse";

/** Open-Meteo weather forecast. No API key required. */
export const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";

/** yr.no forecast deep-link base (daily table view). */
export const YR_NO_BASE_URL = "https://www.yr.no/en/forecast/daily-table";

/** Fallback yr.no URL when no location is available. */
export const YR_NO_FALLBACK_URL = "https://www.yr.no";

/** Wikipedia REST API summary endpoint template (insert lang + title). */
export const WIKIPEDIA_SUMMARY_URL = (lang: string, title: string) =>
  `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

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

/** Timeout for plain HTTP fetches (Nominatim, Open-Meteo, OSRM, Wikipedia). */
export const HTTP_FETCH_TIMEOUT_MS = 15_000;

/** Search radius for emergency POIs (metres). */
export const EMERGENCY_SEARCH_RADIUS_M = 10_000;

/** Expanded emergency search radius (metres), used as a fallback when nothing is
 *  found within EMERGENCY_SEARCH_RADIUS_M (helps rural areas return results). */
export const EMERGENCY_EXPANDED_SEARCH_RADIUS_M = 50_000;

/** Maximum Overpass results fetched for emergency POIs. */
export const EMERGENCY_MAX_RESULTS = 80;

/** Maximum results kept in state after distance-sorting (emergency). */
export const EMERGENCY_MAX_DISPLAY = 40;

/** Maximum results kept in state after distance-sorting (generic POI tabs). */
export const POI_MAX_DISPLAY = 30;

/** When a POI search finds nothing, retry once with the radius multiplied by this. */
export const POI_EXPANDED_RADIUS_FACTOR = 4;

/** Hard cap for the expanded POI search radius (metres). */
export const POI_MAX_RADIUS_M = 100_000;

/** Overpass amenity type filter for emergency services. */
export const EMERGENCY_AMENITY_TYPES =
  "hospital|police|fire_station|pharmacy|clinic|doctors|ambulance_station";

/** Fallback emergency number — 112 also works as a GSM fallback in most countries. */
export const DEFAULT_EMERGENCY_NUMBER = "112";

/**
 * Primary emergency number by ISO 3166-1 alpha-2 country code. Only countries
 * whose single primary number differs from 112 are listed; everything else
 * falls back to DEFAULT_EMERGENCY_NUMBER.
 */
export const EMERGENCY_NUMBER_BY_COUNTRY: Record<string, string> = {
  US: "911", CA: "911", MX: "911",
  GB: "999",
  AU: "000",
  NZ: "111",
};

/** Resolve the primary emergency number for an ISO country code (default 112). */
export function emergencyNumberForCountry(iso?: string | null): string {
  if (!iso) return DEFAULT_EMERGENCY_NUMBER;
  return EMERGENCY_NUMBER_BY_COUNTRY[iso.toUpperCase()] ?? DEFAULT_EMERGENCY_NUMBER;
}

// ── Caching ───────────────────────────────────────────────────────────────────

/** AsyncStorage TTL for all POI result caches: 30 minutes. */
export const CACHE_TTL_MS = 30 * 60 * 1_000;

// ── Retry ─────────────────────────────────────────────────────────────────────

/** Default maximum number of attempts for `withRetry`. */
export const RETRY_MAX_ATTEMPTS = 3;

/** Retry attempts for Overpass-backed calls: fetchOverpass already cycles up
 *  to 3 mirrors per attempt, so full retries would compound (3 × 3 × timeout). */
export const OVERPASS_RETRY_ATTEMPTS = 2;

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

/** Factor: millimetres → inches (precipitation). */
export const MM_TO_INCHES = 0.0393701;

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

// ── Location ──────────────────────────────────────────────────────────────────

/** Timeout for a single getCurrentPositionAsync call before falling back (ms). */
export const GPS_TIMEOUT_MS = 15_000;

// ── Trip logger ───────────────────────────────────────────────────────────────

/** GPS update interval for the trip logger (ms). */
export const TRIP_LOCATION_INTERVAL_MS = 1_500;

/** Discard GPS fixes worse than this accuracy (metres) so they don't inflate
 *  trip distance. A typical good fix is < 10 m; > 40 m is unreliable. */
export const TRIP_MAX_GPS_ACCURACY_M = 40;

// ── OSRM map matching ─────────────────────────────────────────────────────────

/** OSRM public demo "match" service base URL (snaps GPS traces to roads). No API key. */
export const OSRM_MATCH_BASE_URL = "https://router.project-osrm.org/match/v1/driving/";

/** Maximum number of coordinates OSRM accepts per match request. */
export const OSRM_MAX_COORDS_PER_REQUEST = 100;

/** Allowed per-point GPS deviation (metres) when matching a trace to roads. */
export const OSRM_MATCH_RADIUS_M = 50;

// ── Privacy ───────────────────────────────────────────────────────────────────

/** Publicly hosted privacy policy URL shown in the location-disclosure modal. */
export const PRIVACY_POLICY_URL = "https://sassagold.com/privacy";

// ── Map tiles ─────────────────────────────────────────────────────────────────

/** OSM raster tile URL template. Replace {z}/{x}/{y} with zoom and tile coordinates. */
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * User-Agent header required by OSM tile and Nominatim usage policies.
 * Version is read from package.json so it stays in sync automatically.
 * @see https://operations.osmfoundation.org/policies/tiles/
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _appVersion: string = (() => { try { return (require("../package.json") as { version: string }).version; } catch { return "unknown"; } })();
export const OSM_USER_AGENT = `WhereAmI/${_appVersion} (https://sassagold.com)`;
