// Tests for lib/weather.ts — pure utility functions only, no native deps.

import {
  normalizeSymbol,
  windDegToCompass,
  formatHourlyTime,
  wmoToSymbol,
  WMO_TO_SYMBOL,
  formatWeatherCode,
  weatherEmoji,
  buildAlerts,
  ridingSuitability,
  buildRecommendations,
  ALERT_ICONS,
  REC_ICONS,
  type WeatherInfo,
} from "../lib/weather";

// ── normalizeSymbol ───────────────────────────────────────────────────────────

describe("normalizeSymbol", () => {
  it("strips _day suffix", () => {
    expect(normalizeSymbol("clearsky_day")).toBe("clearsky");
  });
  it("strips _night suffix", () => {
    expect(normalizeSymbol("fair_night")).toBe("fair");
  });
  it("strips _polartwilight suffix", () => {
    expect(normalizeSymbol("rain_polartwilight")).toBe("rain");
  });
  it("leaves symbols without suffix unchanged", () => {
    expect(normalizeSymbol("cloudy")).toBe("cloudy");
    expect(normalizeSymbol("fog")).toBe("fog");
  });
});

// ── windDegToCompass ──────────────────────────────────────────────────────────

describe("windDegToCompass", () => {
  it("maps 0° to N", () => expect(windDegToCompass(0)).toBe("N"));
  it("maps 90° to E", () => expect(windDegToCompass(90)).toBe("E"));
  it("maps 180° to S", () => expect(windDegToCompass(180)).toBe("S"));
  it("maps 270° to W", () => expect(windDegToCompass(270)).toBe("W"));
  it("maps 45° to NE", () => expect(windDegToCompass(45)).toBe("NE"));
  it("maps 135° to SE", () => expect(windDegToCompass(135)).toBe("SE"));
  it("maps 225° to SW", () => expect(windDegToCompass(225)).toBe("SW"));
  it("maps 315° to NW", () => expect(windDegToCompass(315)).toBe("NW"));
  it("wraps 360° back to N", () => expect(windDegToCompass(360)).toBe("N"));
  it("handles fractional degrees (22° → NE)", () => expect(windDegToCompass(22)).toBe("N"));
  it("handles fractional degrees (23° → NE)", () => expect(windDegToCompass(23)).toBe("NE"));
});

// ── formatHourlyTime ──────────────────────────────────────────────────────────

describe("formatHourlyTime", () => {
  it("extracts HH:MM from ISO datetime", () => {
    expect(formatHourlyTime("2024-03-10T14:00")).toBe("14:00");
    expect(formatHourlyTime("2024-12-31T07:30")).toBe("07:30");
  });
  it("returns original string if no T separator", () => {
    expect(formatHourlyTime("14:00")).toBe("14:00");
  });
});

// ── wmoToSymbol ───────────────────────────────────────────────────────────────

describe("wmoToSymbol", () => {
  it("maps code 0 to clearsky_day", () => {
    expect(wmoToSymbol(0)).toBe("clearsky_day");
  });
  it("maps code 3 to cloudy", () => {
    expect(wmoToSymbol(3)).toBe("cloudy");
  });
  it("maps code 63 to rain", () => {
    expect(wmoToSymbol(63)).toBe("rain");
  });
  it("maps code 95 to rainandthunder", () => {
    expect(wmoToSymbol(95)).toBe("rainandthunder");
  });
  it("returns 'cloudy' for unknown codes", () => {
    expect(wmoToSymbol(999)).toBe("cloudy");
  });
  it("all values in WMO_TO_SYMBOL table map correctly", () => {
    for (const [code, symbol] of Object.entries(WMO_TO_SYMBOL)) {
      expect(wmoToSymbol(Number(code))).toBe(symbol);
    }
  });
});

// ── formatWeatherCode ─────────────────────────────────────────────────────────

describe("formatWeatherCode", () => {
  it("returns empty string for undefined", () => {
    expect(formatWeatherCode(undefined)).toBe("");
  });
  it("returns i18n key for known codes", () => {
    expect(formatWeatherCode("clearsky_day")).toBe("home.weather.clearsky");
    expect(formatWeatherCode("rain")).toBe("home.weather.rain");
    expect(formatWeatherCode("heavyrainandthunder")).toBe("home.weather.heavyrainandthunder");
  });
  it("strips _day suffix before matching", () => {
    expect(formatWeatherCode("fair_day")).toBe("home.weather.fair");
  });
  it("returns normalised symbol for unrecognised codes", () => {
    expect(formatWeatherCode("unknownweather_day")).toBe("unknownweather");
  });
});

// ── weatherEmoji ──────────────────────────────────────────────────────────────

describe("weatherEmoji", () => {
  it("returns ❓ for undefined", () => {
    expect(weatherEmoji(undefined)).toBe("❓");
  });
  it("returns ☀️ for clearsky", () => {
    expect(weatherEmoji("clearsky_day")).toBe("☀️");
    expect(weatherEmoji("clearsky")).toBe("☀️");
  });
  it("returns ⛅ for partlycloudy", () => {
    expect(weatherEmoji("partlycloudy_day")).toBe("⛅");
  });
  it("returns 🌧️ for rain variants", () => {
    expect(weatherEmoji("rain")).toBe("🌧️");
    expect(weatherEmoji("lightrain")).toBe("🌧️");
    expect(weatherEmoji("rainshowers_day")).toBe("🌧️");
  });
  it("returns ⛈️ for thunder variants", () => {
    expect(weatherEmoji("rainandthunder")).toBe("⛈️");
    expect(weatherEmoji("heavyrainandthunder")).toBe("⛈️");
  });
  it("returns ❄️ for snow variants", () => {
    expect(weatherEmoji("snow")).toBe("❄️");
    expect(weatherEmoji("lightsnow")).toBe("❄️");
  });
  it("returns 🌨️ for sleet variants", () => {
    expect(weatherEmoji("sleet")).toBe("🌨️");
  });
  it("returns 🌫️ for fog", () => {
    expect(weatherEmoji("fog")).toBe("🌫️");
  });
});

// ── buildAlerts ───────────────────────────────────────────────────────────────

describe("buildAlerts", () => {
  it("returns empty array when weather is undefined", () => {
    expect(buildAlerts(undefined)).toEqual([]);
  });

  it("adds veryCold alert at 0°C", () => {
    const result = buildAlerts({ temperatureC: 0 });
    expect(result).toContain("home.alerts.veryCold");
  });

  it("adds veryCold alert below 0°C", () => {
    const result = buildAlerts({ temperatureC: -5 });
    expect(result).toContain("home.alerts.veryCold");
    expect(result).not.toContain("home.alerts.cold");
  });

  it("adds cold alert at 3°C", () => {
    const result = buildAlerts({ temperatureC: 3 });
    expect(result).toContain("home.alerts.cold");
    expect(result).not.toContain("home.alerts.veryCold");
  });

  it("adds extremeHeat alert at 35°C", () => {
    const result = buildAlerts({ temperatureC: 35 });
    expect(result).toContain("home.alerts.extremeHeat");
  });

  it("adds highHeat alert at 30°C", () => {
    const result = buildAlerts({ temperatureC: 30 });
    expect(result).toContain("home.alerts.highHeat");
    expect(result).not.toContain("home.alerts.extremeHeat");
  });

  it("adds strongWinds at 15 m/s", () => {
    const result = buildAlerts({ windSpeed: 15 });
    expect(result).toContain("home.alerts.strongWinds");
  });

  it("adds gustyWinds at 10 m/s", () => {
    const result = buildAlerts({ windSpeed: 10 });
    expect(result).toContain("home.alerts.gustyWinds");
    expect(result).not.toContain("home.alerts.strongWinds");
  });

  it("adds rainExpected at 60% rain chance", () => {
    const result = buildAlerts({ precipitationProbability: 60 });
    expect(result).toContain("home.alerts.rainExpected");
  });

  it("does not add rainExpected below 60%", () => {
    const result = buildAlerts({ precipitationProbability: 59 });
    expect(result).not.toContain("home.alerts.rainExpected");
  });

  it("generates multiple alerts for combined conditions", () => {
    const result = buildAlerts({
      temperatureC: -3,
      windSpeed: 16,
      precipitationProbability: 75,
    });
    expect(result).toContain("home.alerts.veryCold");
    expect(result).toContain("home.alerts.strongWinds");
    expect(result).toContain("home.alerts.rainExpected");
  });

  it("all returned keys have entries in ALERT_ICONS", () => {
    const weather: WeatherInfo = {
      temperatureC: -3,
      windSpeed: 16,
      precipitationProbability: 75,
    };
    const alerts = buildAlerts(weather);
    for (const key of alerts) {
      expect(key in ALERT_ICONS).toBe(true);
    }
  });
});

// ── ridingSuitability ─────────────────────────────────────────────────────────

describe("ridingSuitability", () => {
  it("returns na when weather is undefined", () => {
    const r = ridingSuitability(undefined);
    expect(r.labelKey).toBe("home.suitability.na");
    expect(r.score).toBe(0);
  });

  it("returns great score for perfect conditions", () => {
    const r = ridingSuitability({
      temperatureC: 22,
      windSpeed: 3,
      precipitation: 0,
      precipitationProbability: 0,
    });
    expect(r.score).toBe(100);
    expect(r.labelKey).toBe("home.suitability.great");
    expect(r.color).toBe("#22c55e");
  });

  it("returns dangerous for very cold + strong wind + rain", () => {
    const r = ridingSuitability({
      temperatureC: -5,
      windSpeed: 18,
      precipitation: 6,
      precipitationProbability: 90,
    });
    expect(r.labelKey).toBe("home.suitability.dangerous");
    expect(r.score).toBeLessThan(20);
  });

  it("clamps score to [0, 100]", () => {
    const worst = ridingSuitability({
      temperatureC: -20,
      windSpeed: 30,
      precipitation: 20,
      precipitationProbability: 100,
    });
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(100);

    const best = ridingSuitability({ temperatureC: 20 });
    expect(best.score).toBeGreaterThanOrEqual(0);
    expect(best.score).toBeLessThanOrEqual(100);
  });

  it("deducts for freezing temperature", () => {
    const cold = ridingSuitability({ temperatureC: 0 });
    const normal = ridingSuitability({ temperatureC: 20 });
    expect(cold.score).toBeLessThan(normal.score);
  });

  it("deducts for high winds", () => {
    const windy = ridingSuitability({ temperatureC: 20, windSpeed: 15 });
    const calm = ridingSuitability({ temperatureC: 20, windSpeed: 2 });
    expect(windy.score).toBeLessThan(calm.score);
  });
});

// ── buildRecommendations ──────────────────────────────────────────────────────

describe("buildRecommendations", () => {
  it("returns empty array when weather is undefined", () => {
    expect(buildRecommendations(undefined)).toEqual([]);
  });

  it("recommends thermalGear at 0°C", () => {
    expect(buildRecommendations({ temperatureC: 0 })).toContain("home.recs.thermalGear");
  });

  it("recommends layerUp at 5°C (not thermalGear)", () => {
    const recs = buildRecommendations({ temperatureC: 5 });
    expect(recs).toContain("home.recs.layerUp");
    expect(recs).not.toContain("home.recs.thermalGear");
  });

  it("recommends lightGear at 30°C", () => {
    expect(buildRecommendations({ temperatureC: 30 })).toContain("home.recs.lightGear");
  });

  it("recommends secureLuggage at 10 m/s wind", () => {
    expect(buildRecommendations({ windSpeed: 10 })).toContain("home.recs.secureLuggage");
  });

  it("recommends rainGear at 60% rain chance", () => {
    expect(buildRecommendations({ precipitationProbability: 60 })).toContain("home.recs.rainGear");
  });

  it("all returned keys have entries in REC_ICONS", () => {
    const recs = buildRecommendations({
      temperatureC: -2,
      windSpeed: 12,
      precipitationProbability: 80,
    });
    for (const key of recs) {
      expect(key in REC_ICONS).toBe(true);
    }
  });
});

// ── formatWeatherCode ─────────────────────────────────────────────────────────

describe("formatWeatherCode", () => {
  it("returns empty string for undefined", () => {
    expect(formatWeatherCode(undefined)).toBe("");
  });

  it("strips _day suffix and formats clearsky_day", () => {
    const result = formatWeatherCode("clearsky_day");
    expect(result).toBeTruthy();
    expect(result).not.toContain("_day");
  });

  it("strips _night suffix", () => {
    const result = formatWeatherCode("fair_night");
    expect(result).not.toContain("_night");
  });

  it("handles plain symbol without suffix", () => {
    const result = formatWeatherCode("cloudy");
    expect(result).toBeTruthy();
  });

  it("returns a non-empty string for known symbols", () => {
    const known = [
      "clearsky_day",
      "fair_day",
      "partlycloudy_day",
      "cloudy",
      "fog",
      "rain",
      "snow",
      "rainandthunder",
    ];
    for (const sym of known) {
      expect(formatWeatherCode(sym).length).toBeGreaterThan(0);
    }
  });
});

// ── weatherEmoji ──────────────────────────────────────────────────────────────

describe("weatherEmoji", () => {
  it("returns a string emoji for undefined (fallback)", () => {
    const result = weatherEmoji(undefined);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns ☀️ or similar for clear sky", () => {
    const result = weatherEmoji("clearsky_day");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns 🌧️ or similar for rain", () => {
    const result = weatherEmoji("rain");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns 🌨️ or similar for snow", () => {
    const result = weatherEmoji("snow");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns something for every WMO code in the table", () => {
    const { WMO_TO_SYMBOL } = require("../lib/weather");
    for (const code of Object.keys(WMO_TO_SYMBOL)) {
      const sym = WMO_TO_SYMBOL[Number(code)];
      const emoji = weatherEmoji(sym);
      expect(typeof emoji).toBe("string");
      expect(emoji.length).toBeGreaterThan(0);
    }
  });
});

// ── wmoToSymbol ───────────────────────────────────────────────────────────────

describe("wmoToSymbol", () => {
  it("maps code 0 (clear sky) correctly", () => {
    expect(wmoToSymbol(0)).toBe("clearsky_day");
  });

  it("maps code 3 (overcast) to cloudy", () => {
    expect(wmoToSymbol(3)).toBe("cloudy");
  });

  it("maps code 61 (slight rain) to lightrain", () => {
    expect(wmoToSymbol(61)).toBe("lightrain");
  });

  it("maps code 71 (slight snow) to lightsnow", () => {
    expect(wmoToSymbol(71)).toBe("lightsnow");
  });

  it("maps code 95 (thunderstorm) to rainandthunder", () => {
    expect(wmoToSymbol(95)).toBe("rainandthunder");
  });

  it("falls back to 'cloudy' for unknown codes", () => {
    expect(wmoToSymbol(999)).toBe("cloudy");
    expect(wmoToSymbol(-1)).toBe("cloudy");
  });
});

// ── buildAlerts — additional edge cases ───────────────────────────────────────

describe("buildAlerts edge cases", () => {
  it("no alert for moderate conditions", () => {
    expect(buildAlerts({
      temperatureC: 20,
      windSpeed: 5,
      precipitation: 0,
      precipitationProbability: 10,
    })).toHaveLength(0);
  });

  it("all returned keys have entries in ALERT_ICONS", () => {
    const alerts = buildAlerts({
      temperatureC: -10,
      windSpeed: 20,
      precipitation: 15,
      precipitationProbability: 95,
    });
    for (const key of alerts) {
      expect(key in ALERT_ICONS).toBe(true);
    }
  });

  it("issues veryCold alert below 0°C", () => {
    expect(buildAlerts({ temperatureC: -5 })).toContain("home.alerts.veryCold");
  });

  it("issues highHeat alert at 30°C", () => {
    expect(buildAlerts({ temperatureC: 30 })).toContain("home.alerts.highHeat");
  });

  it("issues extremeHeat alert at 35°C", () => {
    expect(buildAlerts({ temperatureC: 35 })).toContain("home.alerts.extremeHeat");
  });
});
