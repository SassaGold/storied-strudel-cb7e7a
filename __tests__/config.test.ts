// Tests for lib/config.ts — validates that exported constants have the expected
// types and reasonable values, so accidental edits are caught immediately.

import {
    C_TO_F_FACTOR,
    C_TO_F_OFFSET,
    CACHE_TTL_MS,
    EARTH_RADIUS_KM,
    EARTH_RADIUS_M,
    EMERGENCY_AMENITY_TYPES,
    EMERGENCY_MAX_DISPLAY,
    EMERGENCY_MAX_RESULTS,
    EMERGENCY_SEARCH_RADIUS_M,
    FORECAST_DAYS,
    FORECAST_DISPLAY_DAYS,
    HOURLY_SLOTS,
    KM_TO_MILES,
    KMH_TO_MPH,
    M_TO_FEET,
    METRES_PER_MILE,
    NOMINATIM_REVERSE_GEOCODING_BASE_URL,
    OPEN_METEO_BASE_URL,
    OSM_TILE_URL,
    OSM_USER_AGENT,
    OVERPASS_DEFAULT_TIMEOUT_MS,
    OVERPASS_ENDPOINTS,
    OVERPASS_ROAD_TIMEOUT_MS,
    POI_MAX_DISPLAY,
    RETRY_INITIAL_DELAY_MS,
    RETRY_MAX_ATTEMPTS,
    ROAD_ALERTS_MAX,
    ROAD_MAX_RESULTS,
    ROAD_OVERPASS_TIMEOUT_S,
    SHORT_DISTANCE_THRESHOLD_MILES,
    TRIP_LOCATION_INTERVAL_MS,
    WIKIPEDIA_SUMMARY_URL,
    YR_NO_BASE_URL,
    YR_NO_FALLBACK_URL,
} from "../lib/config";

// ── URL constants ─────────────────────────────────────────────────────────────

describe("API URL constants", () => {
  it("NOMINATIM_REVERSE_GEOCODING_BASE_URL is a valid HTTPS URL pointing to OpenStreetMap", () => {
    expect(NOMINATIM_REVERSE_GEOCODING_BASE_URL).toMatch(/^https:\/\//);
    expect(NOMINATIM_REVERSE_GEOCODING_BASE_URL).toContain("openstreetmap.org");
  });

  it("OPEN_METEO_BASE_URL is a valid HTTPS URL", () => {
    expect(OPEN_METEO_BASE_URL).toMatch(/^https:\/\//);
    expect(OPEN_METEO_BASE_URL).toContain("open-meteo.com");
  });

  it("YR_NO_BASE_URL is a valid HTTPS URL", () => {
    expect(YR_NO_BASE_URL).toMatch(/^https:\/\//);
    expect(YR_NO_BASE_URL).toContain("yr.no");
  });

  it("YR_NO_FALLBACK_URL is a valid HTTPS URL", () => {
    expect(YR_NO_FALLBACK_URL).toMatch(/^https:\/\//);
    expect(YR_NO_FALLBACK_URL).toContain("yr.no");
  });

  it("WIKIPEDIA_SUMMARY_URL is a function that produces valid URLs", () => {
    const url = WIKIPEDIA_SUMMARY_URL("en", "Eiffel_Tower");
    expect(url).toMatch(/^https:\/\/en\.wikipedia\.org/);
    expect(url).toContain("Eiffel_Tower");
  });

  it("WIKIPEDIA_SUMMARY_URL encodes special characters in title", () => {
    const url = WIKIPEDIA_SUMMARY_URL("de", "Berliner Mauer");
    expect(url).toContain(encodeURIComponent("Berliner Mauer"));
  });

  it("OSM_TILE_URL is a valid HTTPS URL template containing {z}, {x}, {y} placeholders", () => {
    expect(OSM_TILE_URL).toMatch(/^https:\/\//);
    // Must NOT point at tile.openstreetmap.org — the OSMF server blocks
    // distributed apps per its tile usage policy (serves "Access blocked" tiles).
    expect(OSM_TILE_URL).not.toContain("tile.openstreetmap.org");
    expect(OSM_TILE_URL).toContain("openstreetmap.de");
    expect(OSM_TILE_URL).toContain("{z}");
    expect(OSM_TILE_URL).toContain("{x}");
    expect(OSM_TILE_URL).toContain("{y}");
  });

  it("OSM_USER_AGENT is a non-empty string identifying the app", () => {
    expect(typeof OSM_USER_AGENT).toBe("string");
    expect(OSM_USER_AGENT.length).toBeGreaterThan(0);
    expect(OSM_USER_AGENT).toContain("WhereAmI");
  });
});

// ── Overpass constants ────────────────────────────────────────────────────────

describe("Overpass constants", () => {
  it("OVERPASS_ENDPOINTS is a non-empty array of HTTPS URLs", () => {
    expect(Array.isArray(OVERPASS_ENDPOINTS)).toBe(true);
    expect(OVERPASS_ENDPOINTS.length).toBeGreaterThan(0);
    for (const ep of OVERPASS_ENDPOINTS) {
      expect(ep).toMatch(/^https:\/\//);
    }
  });

  it("OVERPASS_DEFAULT_TIMEOUT_MS is a positive number (>= 10s)", () => {
    expect(typeof OVERPASS_DEFAULT_TIMEOUT_MS).toBe("number");
    expect(OVERPASS_DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
  });

  it("OVERPASS_ROAD_TIMEOUT_MS is a positive number less than OVERPASS_DEFAULT_TIMEOUT_MS", () => {
    expect(OVERPASS_ROAD_TIMEOUT_MS).toBeGreaterThan(0);
    expect(OVERPASS_ROAD_TIMEOUT_MS).toBeLessThan(OVERPASS_DEFAULT_TIMEOUT_MS);
  });

});

// ── Cache & retry constants ───────────────────────────────────────────────────

describe("cache and retry constants", () => {
  it("CACHE_TTL_MS is 30 minutes in milliseconds", () => {
    expect(CACHE_TTL_MS).toBe(30 * 60 * 1_000);
  });

  it("RETRY_MAX_ATTEMPTS is at least 2", () => {
    expect(RETRY_MAX_ATTEMPTS).toBeGreaterThanOrEqual(2);
  });

  it("RETRY_INITIAL_DELAY_MS is positive", () => {
    expect(RETRY_INITIAL_DELAY_MS).toBeGreaterThan(0);
  });
});

// ── Emergency & POI constants ─────────────────────────────────────────────────

describe("emergency and POI constants", () => {
  it("EMERGENCY_SEARCH_RADIUS_M is positive metres", () => {
    expect(EMERGENCY_SEARCH_RADIUS_M).toBeGreaterThan(0);
  });

  it("EMERGENCY_MAX_RESULTS >= EMERGENCY_MAX_DISPLAY", () => {
    expect(EMERGENCY_MAX_RESULTS).toBeGreaterThanOrEqual(EMERGENCY_MAX_DISPLAY);
  });

  it("EMERGENCY_MAX_DISPLAY is a positive integer", () => {
    expect(Number.isInteger(EMERGENCY_MAX_DISPLAY)).toBe(true);
    expect(EMERGENCY_MAX_DISPLAY).toBeGreaterThan(0);
  });

  it("POI_MAX_DISPLAY is a positive integer", () => {
    expect(Number.isInteger(POI_MAX_DISPLAY)).toBe(true);
    expect(POI_MAX_DISPLAY).toBeGreaterThan(0);
  });

  it("EMERGENCY_AMENITY_TYPES includes hospital and police", () => {
    expect(EMERGENCY_AMENITY_TYPES).toContain("hospital");
    expect(EMERGENCY_AMENITY_TYPES).toContain("police");
  });
});

// ── Unit-conversion constants ─────────────────────────────────────────────────

describe("unit conversion constants", () => {
  it("EARTH_RADIUS_M is approximately 6,371,000 m", () => {
    expect(EARTH_RADIUS_M).toBeCloseTo(6_371_000, -3);
  });

  it("EARTH_RADIUS_KM is approximately 6,371 km", () => {
    expect(EARTH_RADIUS_KM).toBeCloseTo(6_371, -1);
  });

  it("KM_TO_MILES converts 1 km to ~0.621 miles", () => {
    expect(KM_TO_MILES).toBeCloseTo(0.621371, 4);
  });

  it("M_TO_FEET converts 1 m to ~3.281 feet", () => {
    expect(M_TO_FEET).toBeCloseTo(3.28084, 3);
  });

  it("KMH_TO_MPH converts 100 km/h to ~62 mph", () => {
    expect(100 * KMH_TO_MPH).toBeCloseTo(62.1, 0);
  });

  it("Celsius to Fahrenheit formula: 0°C = 32°F", () => {
    expect(0 * C_TO_F_FACTOR + C_TO_F_OFFSET).toBe(32);
  });

  it("Celsius to Fahrenheit formula: 100°C = 212°F", () => {
    expect(100 * C_TO_F_FACTOR + C_TO_F_OFFSET).toBe(212);
  });

  it("METRES_PER_MILE is approximately 1609 m", () => {
    expect(METRES_PER_MILE).toBeCloseTo(1609.34, 1);
  });

  it("SHORT_DISTANCE_THRESHOLD_MILES is a small positive fraction", () => {
    expect(SHORT_DISTANCE_THRESHOLD_MILES).toBeGreaterThan(0);
    expect(SHORT_DISTANCE_THRESHOLD_MILES).toBeLessThan(1);
  });
});

// ── Forecast & road constants ─────────────────────────────────────────────────

describe("forecast and road constants", () => {
  it("FORECAST_DAYS is positive", () => {
    expect(FORECAST_DAYS).toBeGreaterThan(0);
  });

  it("FORECAST_DISPLAY_DAYS < FORECAST_DAYS (reserves today)", () => {
    expect(FORECAST_DISPLAY_DAYS).toBeLessThan(FORECAST_DAYS);
  });

  it("HOURLY_SLOTS is positive", () => {
    expect(HOURLY_SLOTS).toBeGreaterThan(0);
  });

  it("ROAD_ALERTS_MAX is positive", () => {
    expect(ROAD_ALERTS_MAX).toBeGreaterThan(0);
  });

  it("ROAD_OVERPASS_TIMEOUT_S is positive seconds", () => {
    expect(ROAD_OVERPASS_TIMEOUT_S).toBeGreaterThan(0);
    expect(ROAD_OVERPASS_TIMEOUT_S).toBeLessThan(120); // sanity: less than 2 minutes
  });

  it("ROAD_MAX_RESULTS is positive", () => {
    expect(ROAD_MAX_RESULTS).toBeGreaterThan(0);
  });
});

// ── Trip logger ───────────────────────────────────────────────────────────────

describe("trip logger constants", () => {
  it("TRIP_LOCATION_INTERVAL_MS is positive", () => {
    expect(TRIP_LOCATION_INTERVAL_MS).toBeGreaterThan(0);
  });
});
