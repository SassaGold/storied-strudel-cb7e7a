/**
 * Unit tests for lib/weather.ts pure utility functions.
 * Covers: wmoToSymbol, windDegToKey, normalizeSymbol, weatherEmoji,
 *         formatHourlyTime, formatForecastDate, buildAlerts,
 *         ridingSuitability, buildRecommendations.
 */

import {
  wmoToSymbol,
  windDegToKey,
  normalizeSymbol,
  weatherEmoji,
  formatHourlyTime,
  formatForecastDate,
  buildAlerts,
  ridingSuitability,
  buildRecommendations,
} from "../lib/weather";
import type { WeatherInfo } from "../lib/weather";

// ── wmoToSymbol ───────────────────────────────────────────────────────────────

describe("wmoToSymbol", () => {
  it("maps code 0 to clearsky_day", () => {
    expect(wmoToSymbol(0)).toBe("clearsky_day");
  });

  it("maps code 3 to cloudy", () => {
    expect(wmoToSymbol(3)).toBe("cloudy");
  });

  it("maps code 65 (heavy rain) correctly", () => {
    expect(wmoToSymbol(65)).toBe("heavyrain");
  });

  it("maps code 95 (thunderstorm) correctly", () => {
    expect(wmoToSymbol(95)).toBe("rainandthunder");
  });

  it("falls back to 'cloudy' for unknown codes", () => {
    expect(wmoToSymbol(999)).toBe("cloudy");
    expect(wmoToSymbol(-1)).toBe("cloudy");
  });

  it("maps code 71 (light snow) correctly", () => {
    expect(wmoToSymbol(71)).toBe("lightsnow");
  });
});

// ── windDegToKey ──────────────────────────────────────────────────────────────

describe("windDegToKey", () => {
  it("0° is North", () => expect(windDegToKey(0)).toBe("wind_N"));
  it("45° is NE", () => expect(windDegToKey(45)).toBe("wind_NE"));
  it("90° is East", () => expect(windDegToKey(90)).toBe("wind_E"));
  it("135° is SE", () => expect(windDegToKey(135)).toBe("wind_SE"));
  it("180° is South", () => expect(windDegToKey(180)).toBe("wind_S"));
  it("225° is SW", () => expect(windDegToKey(225)).toBe("wind_SW"));
  it("270° is West", () => expect(windDegToKey(270)).toBe("wind_W"));
  it("315° is NW", () => expect(windDegToKey(315)).toBe("wind_NW"));
  it("360° wraps to North", () => expect(windDegToKey(360)).toBe("wind_N"));
  it("negative degrees are handled", () => expect(windDegToKey(-45)).toBe("wind_NW"));
  it("337.5° rounds to North", () => expect(windDegToKey(338)).toBe("wind_N"));
  it("22.5° rounds to NE", () => expect(windDegToKey(23)).toBe("wind_NE"));
});

// ── normalizeSymbol ───────────────────────────────────────────────────────────

describe("normalizeSymbol", () => {
  it("strips _day suffix", () => {
    expect(normalizeSymbol("clearsky_day")).toBe("clearsky");
  });

  it("strips _night suffix", () => {
    expect(normalizeSymbol("clearsky_night")).toBe("clearsky");
  });

  it("strips _polartwilight suffix", () => {
    expect(normalizeSymbol("fair_polartwilight")).toBe("fair");
  });

  it("leaves symbols without suffix unchanged", () => {
    expect(normalizeSymbol("cloudy")).toBe("cloudy");
    expect(normalizeSymbol("rain")).toBe("rain");
  });
});

// ── weatherEmoji ──────────────────────────────────────────────────────────────

describe("weatherEmoji", () => {
  it("returns ☀️ for clearsky", () => expect(weatherEmoji("clearsky_day")).toBe("☀️"));
  it("returns ❄️ for snow", () => expect(weatherEmoji("snow")).toBe("❄️"));
  it("returns 🌧️ for rain", () => expect(weatherEmoji("rain")).toBe("🌧️"));
  it("returns ⛈️ for thunder", () => expect(weatherEmoji("rainandthunder")).toBe("⛈️"));
  it("returns 🌫️ for fog", () => expect(weatherEmoji("fog")).toBe("🌫️"));
  it("returns ❓ for undefined", () => expect(weatherEmoji(undefined)).toBe("❓"));
  it("returns ❓ for empty string", () => expect(weatherEmoji("")).toBe("❓"));
});

// ── formatHourlyTime ──────────────────────────────────────────────────────────

describe("formatHourlyTime", () => {
  it("extracts HH:MM from ISO datetime string", () => {
    expect(formatHourlyTime("2024-06-15T14:30")).toBe("14:30");
  });

  it("returns the original string if no T separator", () => {
    expect(formatHourlyTime("14:30")).toBe("14:30");
  });

  it("works with full ISO 8601 strings", () => {
    expect(formatHourlyTime("2024-01-01T08:00:00")).toBe("08:00");
  });
});

// ── formatForecastDate ────────────────────────────────────────────────────────

describe("formatForecastDate", () => {
  it("returns a non-empty string for a valid date", () => {
    const result = formatForecastDate("2024-06-15");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes the day number in the output", () => {
    const result = formatForecastDate("2024-06-15", "en-US");
    expect(result).toContain("15");
  });
});

// ── buildAlerts ───────────────────────────────────────────────────────────────

describe("buildAlerts", () => {
  it("returns empty array when no weather data", () => {
    expect(buildAlerts()).toEqual([]);
    expect(buildAlerts(undefined)).toEqual([]);
  });

  it("flags veryCold at 0°C", () => {
    const alerts = buildAlerts({ temperatureC: 0 });
    expect(alerts).toContain("alerts.veryCold");
  });

  it("flags cold at 4°C", () => {
    const alerts = buildAlerts({ temperatureC: 4 });
    expect(alerts).toContain("alerts.cold");
  });

  it("does not flag cold at 20°C", () => {
    const alerts = buildAlerts({ temperatureC: 20 });
    expect(alerts).not.toContain("alerts.cold");
    expect(alerts).not.toContain("alerts.veryCold");
  });

  it("flags extremeHeat at 35°C", () => {
    const alerts = buildAlerts({ temperatureC: 35 });
    expect(alerts).toContain("alerts.extremeHeat");
  });

  it("flags highHeat at 30°C", () => {
    const alerts = buildAlerts({ temperatureC: 30 });
    expect(alerts).toContain("alerts.highHeat");
  });

  it("flags strongWinds at 15 m/s", () => {
    const alerts = buildAlerts({ windSpeed: 15 });
    expect(alerts).toContain("alerts.strongWinds");
  });

  it("flags gustyWinds at 10 m/s", () => {
    const alerts = buildAlerts({ windSpeed: 10 });
    expect(alerts).toContain("alerts.gustyWinds");
  });

  it("flags rainExpected at 60% precipitation probability", () => {
    const alerts = buildAlerts({ precipitationProbability: 60 });
    expect(alerts).toContain("alerts.rainExpected");
  });

  it("can return multiple alerts simultaneously", () => {
    const weather: WeatherInfo = { temperatureC: -5, windSpeed: 20, precipitationProbability: 80 };
    const alerts = buildAlerts(weather);
    expect(alerts).toContain("alerts.veryCold");
    expect(alerts).toContain("alerts.strongWinds");
    expect(alerts).toContain("alerts.rainExpected");
  });
});

// ── ridingSuitability ─────────────────────────────────────────────────────────

describe("ridingSuitability", () => {
  it("returns 'na' with grey color when no weather data", () => {
    const result = ridingSuitability();
    expect(result.labelKey).toBe("suitability.na");
    expect(result.score).toBe(0);
    expect(result.color).toBe("#94a3b8");
  });

  it("returns 'great' for ideal riding conditions", () => {
    const result = ridingSuitability({ temperatureC: 20, windSpeed: 3, precipitation: 0, precipitationProbability: 0 });
    expect(result.labelKey).toBe("suitability.great");
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("penalises frozen temperatures heavily", () => {
    const perfect = ridingSuitability({ temperatureC: 20 });
    const frozen = ridingSuitability({ temperatureC: -5 });
    expect(frozen.score).toBeLessThan(perfect.score);
    expect(frozen.score).toBeLessThanOrEqual(60);
  });

  it("penalises extreme heat", () => {
    const hot = ridingSuitability({ temperatureC: 38 });
    expect(hot.score).toBeLessThan(100);
  });

  it("penalises strong winds", () => {
    const windy = ridingSuitability({ temperatureC: 20, windSpeed: 20 });
    expect(windy.score).toBeLessThanOrEqual(70);
  });

  it("penalises heavy rain probability", () => {
    const rainy = ridingSuitability({ temperatureC: 20, precipitationProbability: 90 });
    // 90% rain probability deducts 20 points → score ≤ 80 (down from 100)
    expect(rainy.score).toBeLessThanOrEqual(80);
  });

  it("returns 'dangerous' for extreme combined conditions", () => {
    const result = ridingSuitability({
      temperatureC: -10,
      windSpeed: 25,
      precipitation: 10,
      precipitationProbability: 100,
    });
    expect(result.labelKey).toBe("suitability.dangerous");
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it("score is always in range [0, 100]", () => {
    const extreme = ridingSuitability({
      temperatureC: -50,
      windSpeed: 100,
      precipitation: 100,
      precipitationProbability: 100,
    });
    expect(extreme.score).toBeGreaterThanOrEqual(0);
    expect(extreme.score).toBeLessThanOrEqual(100);
  });
});

// ── buildRecommendations ──────────────────────────────────────────────────────

describe("buildRecommendations", () => {
  it("returns empty array with no weather data", () => {
    expect(buildRecommendations()).toEqual([]);
  });

  it("recommends thermalGear below 0°C", () => {
    expect(buildRecommendations({ temperatureC: -5 })).toContain("recs.thermalGear");
  });

  it("recommends layerUp at 5°C", () => {
    expect(buildRecommendations({ temperatureC: 5 })).toContain("recs.layerUp");
  });

  it("recommends lightGear above 30°C", () => {
    expect(buildRecommendations({ temperatureC: 32 })).toContain("recs.lightGear");
  });

  it("recommends secureLuggage at 10+ m/s wind", () => {
    expect(buildRecommendations({ windSpeed: 12 })).toContain("recs.secureLuggage");
  });

  it("recommends rainGear at 60%+ rain probability", () => {
    expect(buildRecommendations({ precipitationProbability: 75 })).toContain("recs.rainGear");
  });

  it("makes no recommendations for mild conditions", () => {
    const recs = buildRecommendations({ temperatureC: 20, windSpeed: 5, precipitationProbability: 10 });
    expect(recs).toHaveLength(0);
  });
});
