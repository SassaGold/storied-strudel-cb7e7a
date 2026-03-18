// ── lib/useRiderHQ.ts ────────────────────────────────────────────────────────
// Data-fetching hook for the RIDER HQ (index) screen.
// Encapsulates all async I/O, derived-value memos, and state management.

import { useCallback, useMemo, useState } from "react";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { withRetry, fetchOverpass } from "./overpass";
import { useSettings } from "./settings";
import {
  type WeatherInfo,
  type ForecastDay,
  type HourlyForecast,
  wmoToSymbol,
  buildAlerts,
  ridingSuitability,
  buildRecommendations,
} from "./weather";
import { computeSunTimes, type SunTimes } from "./sun";
import { type RoadAlert, ROAD_TYPES, haversineKm } from "./roads";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GeoAddress = {
  displayName: string;
  city?: string;
  country?: string;
};

export type RiderHQState = {
  loading: boolean;
  error: string | null;
  address: GeoAddress | null;
  weather: WeatherInfo | null;
  location: Location.LocationObject | null;
  lastUpdated: Date | null;
  roadAlerts: RoadAlert[];
  /** i18n key list of weather alerts */
  alerts: string[];
  suitability: { score: number; labelKey: string; color: string };
  /** i18n key list of riding recommendations */
  recommendations: string[];
  sunTimes: SunTimes;
  /** Deep-link URL to yr.no forecast for current location */
  weatherUrl: string;
  loadData: () => Promise<void>;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Manages data fetching and derived state for the RIDER HQ screen.
 * Weather and geocoding calls are retried up to 3 times on failure.
 * Overpass road-condition queries use the existing multi-mirror fetchOverpass.
 */
export function useRiderHQ(): RiderHQState {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { searchRadiusKm } = settings;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<GeoAddress | null>(null);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [roadAlerts, setRoadAlerts] = useState<RoadAlert[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      // Only bail out on explicit denial; 'undetermined' triggers the browser dialog.
      if (permission.status === "denied") {
        setError(t("home.locationError"));
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(position);

      const { latitude, longitude } = position.coords;

      // ── Nominatim — free reverse geocoding, retried up to 3 times ────────
      const addressPromise = withRetry(() =>
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
          { headers: { "User-Agent": "roamly-app" } }
        )
          .then((r) => {
            if (!r.ok) throw new Error(`Nominatim ${r.status}`);
            return r.json();
          })
          .then((data) => ({
            displayName: data.display_name as string,
            city: data.address?.city || data.address?.town || data.address?.village,
            country: data.address?.country,
          }))
      ).catch(() => null);

      // ── Open-Meteo — free weather API, retried up to 3 times ─────────────
      const weatherPromise = withRetry(() =>
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
          `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,relative_humidity_2m,precipitation,weather_code,precipitation_probability` +
          `&hourly=temperature_2m,weather_code,precipitation_probability` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
          `&forecast_days=4&timezone=auto`
        ).then((r) => {
          if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
          return r.json();
        })
      )
        .then((data) => {
          const current = data.current ?? {};
          if (current.temperature_2m === undefined) return null;

          const symbol = wmoToSymbol(current.weather_code as number);
          const precipitation: number = current.precipitation ?? 0;
          const precipProbability: number = current.precipitation_probability ?? 0;

          // 3-day forecast (skip today, index 0)
          const daily = data.daily ?? {};
          const times: string[] = daily.time ?? [];
          const dailyCodes: number[] = daily.weather_code ?? [];
          const maxTemps: number[] = daily.temperature_2m_max ?? [];
          const minTemps: number[] = daily.temperature_2m_min ?? [];
          const rainProbs: number[] = daily.precipitation_probability_max ?? [];

          const today = new Date().toISOString().slice(0, 10);
          const forecast: ForecastDay[] = [];
          for (let i = 0; i < times.length; i++) {
            if (times[i] <= today) continue;
            if (forecast.length >= 3) break;
            if (maxTemps[i] === undefined || minTemps[i] === undefined) continue;
            forecast.push({
              date: times[i],
              weatherCode: wmoToSymbol(dailyCodes[i] as number),
              maxTempC: maxTemps[i],
              minTempC: minTemps[i],
              precipitationProbability: Math.round(rainProbs[i] ?? 0),
            });
          }

          // Next 6 hourly slots
          const hourlyData = data.hourly ?? {};
          const hourlyTimes: string[] = hourlyData.time ?? [];
          const hourlyTemps: number[] = hourlyData.temperature_2m ?? [];
          const hourlyCodes: number[] = hourlyData.weather_code ?? [];
          const hourlyRainProbs: number[] = hourlyData.precipitation_probability ?? [];
          const nowMs = Date.now();
          const hourly: HourlyForecast[] = [];
          for (let i = 0; i < hourlyTimes.length && hourly.length < 6; i++) {
            if (
              new Date(hourlyTimes[i]).getTime() > nowMs &&
              hourlyTemps[i] !== undefined &&
              hourlyCodes[i] !== undefined
            ) {
              hourly.push({
                time: hourlyTimes[i],
                temperatureC: hourlyTemps[i],
                weatherCode: wmoToSymbol(hourlyCodes[i] as number),
                precipitationProbability: Math.round(hourlyRainProbs[i] ?? 0),
              });
            }
          }

          return {
            temperatureC: current.temperature_2m,
            feelsLikeC: current.apparent_temperature,
            windSpeed: current.wind_speed_10m,
            windDirection: current.wind_direction_10m,
            humidity: current.relative_humidity_2m,
            precipitation,
            precipitationProbability: Math.round(precipProbability),
            weatherCode: symbol,
            forecast,
            hourly,
          } as WeatherInfo;
        })
        .catch(() => null);

      // ── Road conditions via Overpass (multi-mirror, already retries) ──────
      const lat = Math.max(-90, Math.min(90, latitude));
      const lon = Math.max(-180, Math.min(180, longitude));
      const roadRadiusM = Math.round(searchRadiusKm * 1000);
      const roadQuery =
        `[out:json][timeout:10];` +
        `(way["highway"="construction"](around:${roadRadiusM},${lat},${lon});` +
        `node["highway"="construction"](around:${roadRadiusM},${lat},${lon});` +
        `way["construction"~"."](around:${roadRadiusM},${lat},${lon});` +
        `node["construction"~"."](around:${roadRadiusM},${lat},${lon});` +
        `);out center 20;`;

      const roadPromise = fetchOverpass(roadQuery, 15_000)
        .then((data) => {
          const elements: any[] = data.elements ?? [];
          return elements
            .map((el: any): RoadAlert => {
              const elLat: number | undefined = el.lat ?? el.center?.lat;
              const elLon: number | undefined = el.lon ?? el.center?.lon;
              const distance =
                elLat != null && elLon != null
                  ? Math.round(haversineKm(lat, lon, elLat, elLon) * 10) / 10
                  : undefined;
              return {
                id: String(el.id),
                name: el.tags?.name ?? el.tags?.["addr:street"] ?? "",
                type: el.tags?.construction ?? el.tags?.highway ?? "construction",
                description: el.tags?.description ?? el.tags?.note ?? "",
                ref: el.tags?.ref ?? "",
                operator: el.tags?.operator ?? "",
                distance,
                lat: elLat,
                lon: elLon,
              };
            })
            .filter((a) => ROAD_TYPES.has(a.type.toLowerCase()))
            .slice(0, 10);
        })
        .catch(() => []);

      const [addressResult, weatherResult, roadResult] = await Promise.all([
        addressPromise,
        weatherPromise,
        roadPromise,
      ]);

      setAddress(addressResult);
      setWeather(weatherResult);
      setRoadAlerts(roadResult);
      setLastUpdated(new Date());
    } catch {
      setError(t("home.dataError"));
    } finally {
      setLoading(false);
    }
  }, [t, searchRadiusKm]);

  // ── Derived values ────────────────────────────────────────────────────────

  const alerts = useMemo(() => buildAlerts(weather ?? undefined), [weather]);
  const suitability = useMemo(() => ridingSuitability(weather ?? undefined), [weather]);
  const recommendations = useMemo(() => buildRecommendations(weather ?? undefined), [weather]);

  const sunTimes = useMemo(
    () =>
      location
        ? computeSunTimes(location.coords.latitude, location.coords.longitude)
        : null,
    [location]
  );

  const weatherUrl = location
    ? `https://www.yr.no/en/forecast/daily-table/${encodeURIComponent(
        `${location.coords.latitude.toFixed(4)},${location.coords.longitude.toFixed(4)}`
      )}`
    : "https://www.yr.no";

  return {
    loading,
    error,
    address,
    weather,
    location,
    lastUpdated,
    roadAlerts,
    alerts,
    suitability,
    recommendations,
    sunTimes,
    weatherUrl,
    loadData,
  };
}
