// ── Weather types, constants, and pure utility functions ─────────────────────
// Extracted from app/(tabs)/index.tsx to keep the screen component focused on
// UI composition only.

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

// ── WMO code → MET Norway symbol mapping ──────────────────────────────────────
// Reference: https://open-meteo.com/en/docs#weathervariables

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

export function wmoToSymbol(code: number): string {
  return WMO_TO_SYMBOL[code] ?? "cloudy";
}

// ── Formatters ─────────────────────────────────────────────────────────────────

export const normalizeSymbol = (sym: string) =>
  sym.replace(/_(day|night|polartwilight)$/, "");

export const windDegToKey = (deg: number): string => {
  const keys = ["wind_N", "wind_NE", "wind_E", "wind_SE", "wind_S", "wind_SW", "wind_W", "wind_NW"];
  return keys[((Math.round(deg / 45) % 8) + 8) % 8];
};

export const formatHourlyTime = (isoTime: string): string => {
  const tIdx = isoTime.indexOf("T");
  if (tIdx === -1) return isoTime;
  return isoTime.slice(tIdx + 1, tIdx + 6);
};

export const formatForecastDate = (dateStr: string, locale = "en-US") => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

export const formatWeatherCode = (sym?: string) => {
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
  if (knownKeys.includes(s)) return `weather.${s}`;
  return s;
};

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

// ── Riding analysis ────────────────────────────────────────────────────────────

export const ALERT_ICONS: Record<string, string> = {
  "alerts.veryCold":    "❄️",
  "alerts.cold":        "🌡️",
  "alerts.extremeHeat": "🔥",
  "alerts.highHeat":    "☀️",
  "alerts.strongWinds": "🌬️",
  "alerts.gustyWinds":  "💨",
  "alerts.rainExpected":"🌧️",
};
export const DEFAULT_ALERT_ICON = "⚠️";

export const REC_ICONS: Record<string, string> = {
  "recs.thermalGear":   "🧥",
  "recs.layerUp":       "🧤",
  "recs.lightGear":     "👕",
  "recs.secureLuggage": "🎒",
  "recs.rainGear":      "☂️",
};
export const DEFAULT_REC_ICON = "💡";

export function buildAlerts(weather?: WeatherInfo): string[] {
  if (!weather) return [];
  const alerts: string[] = [];
  const temp = weather.temperatureC ?? 20;
  const wind = weather.windSpeed ?? 0;
  const rainChance = weather.precipitationProbability ?? 0;

  if (temp <= 0) alerts.push("alerts.veryCold");
  else if (temp <= 5) alerts.push("alerts.cold");
  if (temp >= 35) alerts.push("alerts.extremeHeat");
  else if (temp >= 30) alerts.push("alerts.highHeat");
  if (wind >= 15) alerts.push("alerts.strongWinds");
  else if (wind >= 10) alerts.push("alerts.gustyWinds");
  if (rainChance >= 60) alerts.push("alerts.rainExpected");
  return alerts;
}

export function ridingSuitability(weather?: WeatherInfo): { score: number; labelKey: string; color: string } {
  if (!weather) return { score: 0, labelKey: "suitability.na", color: "#94a3b8" };
  let score = 100;
  const temp = weather.temperatureC ?? 20;
  const wind = weather.windSpeed ?? 0;
  const precip = weather.precipitation ?? 0;
  const rainChance = weather.precipitationProbability ?? 0;

  if (temp <= 0) score -= 40;
  else if (temp <= 5) score -= 20;
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

  if (score >= 80) return { score, labelKey: "suitability.great", color: "#22c55e" };
  if (score >= 60) return { score, labelKey: "suitability.good", color: "#84cc16" };
  if (score >= 40) return { score, labelKey: "suitability.fair", color: "#f59e0b" };
  if (score >= 20) return { score, labelKey: "suitability.poor", color: "#f97316" };
  return { score, labelKey: "suitability.dangerous", color: "#ef4444" };
}

export function buildRecommendations(weather?: WeatherInfo): string[] {
  if (!weather) return [];
  const recs: string[] = [];
  const temp = weather.temperatureC ?? 20;
  const wind = weather.windSpeed ?? 0;
  const rainChance = weather.precipitationProbability ?? 0;

  if (temp <= 0) recs.push("recs.thermalGear");
  else if (temp <= 10) recs.push("recs.layerUp");
  if (temp >= 30) recs.push("recs.lightGear");
  if (wind >= 10) recs.push("recs.secureLuggage");
  if (rainChance >= 60) recs.push("recs.rainGear");
  return recs;
}
