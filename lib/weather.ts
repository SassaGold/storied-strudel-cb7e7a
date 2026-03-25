// ── Weather utilities ─────────────────────────────────────────────────────────
// Pure, side-effect-free functions used by the RIDER HQ screen.
// All functions here are easily unit-testable with no native dependencies.

// ── Types ─────────────────────────────────────────────────────────────────────

export type ForecastDay = {
  date: string;
  weatherCode: string;
  maxTempC: number;
  minTempC: number;
  precipitationProbability: number;
};

export type HourlyForecast = {
  time: string;
  temperatureC: number;
  weatherCode: string;
  precipitationProbability: number;
};

export type WeatherInfo = {
  temperatureC?: number;
  feelsLikeC?: number;
  windSpeed?: number;
  windDirection?: number;
  humidity?: number;
  precipitation?: number;
  precipitationProbability?: number;
  weatherCode?: string;
  forecast?: ForecastDay[];
  hourly?: HourlyForecast[];
};

// ── WMO → MET Norway symbol mapping ──────────────────────────────────────────

/**
 * Map WMO weather interpretation codes (used by Open-Meteo) to the
 * MET Norway symbol-code strings that the rest of the UI already understands.
 * Reference: https://open-meteo.com/en/docs#weathervariables
 */
export const WMO_TO_SYMBOL: Record<number, string> = {
  0:  "clearsky_day",
  1:  "fair_day",
  2:  "partlycloudy_day",
  3:  "cloudy",
  45: "fog",
  48: "fog",
  51: "lightrain",
  53: "rain",
  55: "heavyrain",
  56: "lightsleet",
  57: "heavysleet",
  61: "lightrain",
  63: "rain",
  65: "heavyrain",
  66: "lightsleet",
  67: "heavysleet",
  71: "lightsnow",
  73: "snow",
  75: "heavysnow",
  77: "lightsnow",
  80: "lightrainshowers_day",
  81: "rainshowers_day",
  82: "heavyrainshowers_day",
  85: "lightsnowshowers_day",
  86: "heavysnowshowers_day",
  95: "rainandthunder",
  96: "heavyrainandthunder",
  99: "heavyrainandthunder",
};

/** Strip the `_day`, `_night`, or `_polartwilight` suffix from a symbol code. */
export const normalizeSymbol = (sym: string): string =>
  sym.replace(/_(day|night|polartwilight)$/, "");

/** Convert a WMO weather code to a MET Norway symbol string. */
export function wmoToSymbol(code: number): string {
  return WMO_TO_SYMBOL[code] ?? "cloudy";
}

// ── Display helpers ───────────────────────────────────────────────────────────

/** Convert wind direction in degrees to a compass abbreviation (N, NE, …). */
export const windDegToCompass = (deg: number): string => {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[((Math.round(deg / 45) % 8) + 8) % 8];
};

/**
 * Extract the HH:MM portion from an ISO datetime string like "2024-03-10T14:00".
 */
export const formatHourlyTime = (isoTime: string): string => {
  const tIdx = isoTime.indexOf("T");
  if (tIdx === -1) return isoTime;
  return isoTime.slice(tIdx + 1, tIdx + 6);
};

/**
 * Return the i18n key path for a weather symbol code, e.g. "home.weather.clearsky".
 * Returns the normalised symbol string as-is if it is not a recognised key.
 */
export const formatWeatherCode = (sym?: string): string => {
  if (!sym) return "";
  const s = normalizeSymbol(sym);
  const knownKeys = [
    "clearsky", "fair", "partlycloudy", "cloudy", "fog",
    "lightrainshowers", "rainshowers", "heavyrainshowers",
    "lightrain", "rain", "heavyrain",
    "lightsleetshowers", "sleetshowers", "heavysleetshowers",
    "lightsleet", "sleet", "heavysleet",
    "lightsnowshowers", "snowshowers", "heavysnowshowers",
    "lightsnow", "snow", "heavysnow",
    "thunder", "rainandthunder", "heavyrainandthunder",
    "snowandthunder", "heavysnowandthunder", "sleetandthunder",
    "rainshowersandthunder", "heavyrainshowersandthunder",
    "snowshowersandthunder", "sleetshowersandthunder",
    "lightrainandthunder", "lightsnowandthunder", "lightsleetandthunder",
    "lightrainshowersandthunder", "lightsnowshowersandthunder", "lightsleetshowersandthunder",
  ];
  if (knownKeys.includes(s)) return `home.weather.${s}`;
  return s;
};

/** Map a weather symbol code to a single representative emoji. */
export const weatherEmoji = (sym?: string): string => {
  if (!sym) return "❓";
  const s = normalizeSymbol(sym);
  if (s === "clearsky") return "☀️";
  if (s === "fair") return "🌤️";
  if (s === "partlycloudy") return "⛅";
  if (s === "cloudy") return "☁️";
  if (s === "fog") return "🌫️";
  if (s.includes("thunder")) return "⛈️";
  if (s.includes("snow")) return "❄️";
  if (s.includes("sleet")) return "🌨️";
  if (s.includes("rain")) return "🌧️";
  return "🌡️";
};

// ── Riding analysis ───────────────────────────────────────────────────────────

/**
 * Return a list of i18n warning-key strings for the given weather conditions.
 * Returns an empty array when weather is undefined.
 */
export const buildAlerts = (weather?: WeatherInfo): string[] => {
  if (!weather) return [];
  const alerts: string[] = [];
  const temp = weather.temperatureC ?? 20;
  const wind = weather.windSpeed ?? 0;
  const rainChance = weather.precipitationProbability ?? 0;

  if (temp <= 0)       alerts.push("home.alerts.veryCold");
  else if (temp <= 5)  alerts.push("home.alerts.cold");
  if (temp >= 35)      alerts.push("home.alerts.extremeHeat");
  else if (temp >= 30) alerts.push("home.alerts.highHeat");
  if (wind >= 15)      alerts.push("home.alerts.strongWinds");
  else if (wind >= 10) alerts.push("home.alerts.gustyWinds");
  if (rainChance >= 60) alerts.push("home.alerts.rainExpected");

  return alerts;
};

/** Riding-suitability score (0–100) with a colour and i18n label key. */
export const ridingSuitability = (
  weather?: WeatherInfo
): { score: number; labelKey: string; color: string } => {
  if (!weather) return { score: 0, labelKey: "home.suitability.na", color: "#94a3b8" };

  let score = 100;
  const temp = weather.temperatureC ?? 20;
  const wind = weather.windSpeed ?? 0;
  const precip = weather.precipitation ?? 0;
  const rainChance = weather.precipitationProbability ?? 0;

  if (temp <= 0) score -= 100;
  else if (temp <= 5) score -= 80;
  else if (temp >= 35) score -= 20;
  else if (temp >= 30) score -= 10;

  if (wind >= 15) score -= 30;
  else if (wind >= 10) score -= 15;
  else if (wind >= 7) score -= 8;

  if (precip >= 5) score -= 20;
  else if (precip >= 1) score -= 10;

  if (rainChance >= 80) score -= 20;
  else if (rainChance >= 60) score -= 10;

  score = Math.max(0, Math.min(100, score));

  if (score >= 80) return { score, labelKey: "home.suitability.great", color: "#22c55e" };
  if (score >= 60) return { score, labelKey: "home.suitability.good", color: "#84cc16" };
  if (score >= 40) return { score, labelKey: "home.suitability.fair", color: "#f59e0b" };
  if (score >= 20) return { score, labelKey: "home.suitability.poor", color: "#f97316" };
  return { score, labelKey: "home.suitability.dangerous", color: "#ef4444" };
};

/**
 * Return a list of i18n recommendation-key strings for the given weather conditions.
 * Returns an empty array when weather is undefined.
 */
export const buildRecommendations = (weather?: WeatherInfo): string[] => {
  if (!weather) return [];
  const recs: string[] = [];
  const temp = weather.temperatureC ?? 20;
  const wind = weather.windSpeed ?? 0;
  const rainChance = weather.precipitationProbability ?? 0;

  if (temp <= 0)        recs.push("home.recs.thermalGear");
  else if (temp <= 10)  recs.push("home.recs.layerUp");
  if (temp >= 30)       recs.push("home.recs.lightGear");
  if (wind >= 10)       recs.push("home.recs.secureLuggage");
  if (rainChance >= 60) recs.push("home.recs.rainGear");

  return recs;
};

// ── Icon maps ─────────────────────────────────────────────────────────────────

export const ALERT_ICONS: Record<string, string> = {
  "home.alerts.veryCold":    "❄️",
  "home.alerts.cold":        "🌡️",
  "home.alerts.extremeHeat": "🔥",
  "home.alerts.highHeat":    "☀️",
  "home.alerts.strongWinds": "🌬️",
  "home.alerts.gustyWinds":  "💨",
  "home.alerts.rainExpected":"🌧️",
};
export const DEFAULT_ALERT_ICON = "⚠️";

export const REC_ICONS: Record<string, string> = {
  "home.recs.thermalGear":   "🧥",
  "home.recs.layerUp":       "🧤",
  "home.recs.lightGear":     "👕",
  "home.recs.secureLuggage": "🎒",
  "home.recs.rainGear":      "☂️",
};
export const DEFAULT_REC_ICON = "💡";
