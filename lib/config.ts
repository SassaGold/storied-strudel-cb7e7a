// ── Centralised API endpoint constants ───────────────────────────────────────
// All external service URLs live here so they can be found and updated in one
// place rather than scattered across lib/useRiderHQ.ts, lib/usePOIFetch.ts,
// app/(tabs)/mc.tsx, etc.

/** Nominatim reverse-geocoding (OpenStreetMap) — free, no API key required. */
export const nominatimReverseUrl = (lat: number, lon: number): string =>
  `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;

/** Open-Meteo weather forecast — free, no API key required. */
export const openMeteoForecastUrl = (lat: number, lon: number): string =>
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
  `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,relative_humidity_2m,precipitation,weather_code,precipitation_probability` +
  `&hourly=temperature_2m,weather_code,precipitation_probability` +
  `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
  `&forecast_days=3&timezone=auto`;

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
