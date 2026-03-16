// ── useRiderHQ — data-fetching hook for the RIDER HQ home screen ─────────────
// Encapsulates all API calls (reverse geocoding, weather, road alerts),
// derived state, and the openMaps helper.

import { useCallback, useMemo, useState } from "react";
import { Linking, Platform } from "react-native";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
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
import { type GeoAddress, type RoadAlert, ROAD_TYPES, haversineKm } from "./roads";

export type { WeatherInfo, ForecastDay, HourlyForecast, GeoAddress, RoadAlert, SunTimes };

export interface RiderHQState {
  loading: boolean;
  error: string | null;
  address: GeoAddress | null;
  weather: WeatherInfo | null;
  location: Location.LocationObject | null;
  lastUpdated: Date | null;
  roadAlerts: RoadAlert[];
  /** Derived: riding alerts (i18n keys) */
  alerts: string[];
  /** Derived: riding suitability score + label */
  suitability: { score: number; labelKey: string; color: string };
  /** Derived: gear recommendations (i18n keys) */
  recommendations: string[];
  /** Derived: sunrise / sunset times */
  sunTimes: SunTimes;
  /** yr.no deep link for current position */
  weatherUrl: string;
  loadData: () => Promise<void>;
  openMaps: () => void;
}

export function useRiderHQ(): RiderHQState {
  const { t } = useTranslation("home");

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
      // On web (iOS Safari), 'undetermined' maps to the browser dialog — only bail
      // on 'denied'.
      if (permission.status === "denied") {
        setError(t("locationError"));
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(position);

      const { latitude, longitude } = position.coords;

      // Nominatim (OpenStreetMap) — free reverse geocoding, no API key required
      const addressPromise = fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
        { headers: { "User-Agent": "roamly-app" } }
      )
        .then((r) => r.json())
        .then((data) => ({
          displayName: data.display_name as string,
          city: data.address?.city || data.address?.town || data.address?.village,
          country: data.address?.country,
        }))
        .catch((e: unknown) => { console.warn("[useRiderHQ] address error:", e); return null; });

      // Open-Meteo — free, browser-friendly weather API (no API key required)
      const weatherPromise = fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
        `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,relative_humidity_2m,precipitation,weather_code,precipitation_probability` +
        `&hourly=temperature_2m,weather_code,precipitation_probability` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&forecast_days=4&timezone=auto`
      )
        .then((r) => r.json())
        .then((data): WeatherInfo | null => {
          const current = data.current ?? {};
          if (current.temperature_2m === undefined) return null;

          const symbol = wmoToSymbol(current.weather_code as number);
          const precipitation: number = current.precipitation ?? 0;
          const precipProbability: number = current.precipitation_probability ?? 0;

          // Build 3-day forecast (skip today)
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
            if (
              maxTemps[i] === undefined ||
              minTemps[i] === undefined ||
              dailyCodes[i] === undefined
            ) continue;
            forecast.push({
              date: times[i],
              weatherCode: wmoToSymbol(dailyCodes[i] as number),
              maxTempC: maxTemps[i],
              minTempC: minTemps[i],
              precipitationProbability: Math.round(rainProbs[i] ?? 0),
            });
          }

          // Build next-6-hours hourly forecast
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
          };
        })
        .catch((e: unknown) => { console.warn("[useRiderHQ] weather error:", e); return null; });

      // Overpass (OpenStreetMap) — free road conditions, no API key required
      const lat = Math.max(-90, Math.min(90, latitude));
      const lon = Math.max(-180, Math.min(180, longitude));
      const roadPromise = fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=[out:json][timeout:10];(way["highway"="construction"](around:10000,${lat},${lon});node["highway"="construction"](around:10000,${lat},${lon});way["construction"~"."](around:10000,${lat},${lon});node["construction"~"."](around:10000,${lat},${lon}););out center 20;`,
      })
        .then((r) => r.json())
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
        .catch((e: unknown) => { console.warn("[useRiderHQ] road alerts error:", e); return [] as RoadAlert[]; });

      const [addressResult, weatherResult, roadResult] = await Promise.all([
        addressPromise,
        weatherPromise,
        roadPromise,
      ]);

      setAddress(addressResult);
      setWeather(weatherResult);
      setRoadAlerts(roadResult);
      setLastUpdated(new Date());
    } catch (e) {
      console.warn("[useRiderHQ] data fetch error:", e);
      setError(t("dataError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
    ? `https://www.yr.no/en/forecast/daily-table/${encodeURIComponent(`${location.coords.latitude.toFixed(4)},${location.coords.longitude.toFixed(4)}`)}`
    : "https://www.yr.no";

  const openMaps = useCallback(() => {
    if (!location) return;
    const { latitude, longitude } = location.coords;
    const url =
      Platform.OS === "ios"
        ? `maps://?ll=${latitude},${longitude}&q=${latitude},${longitude}`
        : `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    Linking.openURL(url).catch((e) => console.warn("[useRiderHQ] openMaps error:", e));
  }, [location]);

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
    openMaps,
  };
}
