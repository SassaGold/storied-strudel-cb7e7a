// ── lib/useRiderHQ.ts ────────────────────────────────────────────────────────
// Data-fetching hook for the RIDER HQ (index) screen.
// Encapsulates all async I/O, derived-value memos, and state management.

import * as Location from "expo-location";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    FORECAST_DAYS,
    FORECAST_DISPLAY_DAYS,
    HOURLY_SLOTS,
    HQ_SNAPSHOT_MAX_MOVE_M,
    HTTP_FETCH_TIMEOUT_MS,
    NOMINATIM_REVERSE_GEOCODING_BASE_URL,
    OPEN_METEO_BASE_URL,
    OSM_USER_AGENT,
    OVERPASS_RETRY_ATTEMPTS,
    OVERPASS_ROAD_TIMEOUT_MS,
    ROAD_ALERTS_MAX,
    ROAD_MAX_RESULTS,
    ROAD_OVERPASS_TIMEOUT_S,
    YR_NO_BASE_URL,
    YR_NO_FALLBACK_URL,
} from "./config";
import { useLocationPermission } from "./locationPermission";
import { getCurrentPositionWithTimeout } from "./location";
import { storage } from "./storage";
import { fetchOverpass, fetchWithTimeout, withRetry } from "./overpass";
import { type RoadAlert, ROAD_TYPES, haversineKm } from "./roads";
import { useSettings } from "./settings";
import { type SunTimes, type PolarState, computeSunTimes, computeSunState } from "./sun";
import {
    type ForecastDay,
    type HourlyForecast,
    type WeatherInfo,
    wmoToSymbol,
} from "./weather";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GeoAddress = {
  displayName: string;
  city?: string;
  country?: string;
};

/** AsyncStorage key for the last-good RIDER HQ snapshot (offline fallback). */
const RIDERHQ_CACHE_KEY = "cache_riderhq_v1";

type HQCache = {
  ts: number;
  coords: { latitude: number; longitude: number };
  address: GeoAddress | null;
  weather: WeatherInfo | null;
  roadAlerts: RoadAlert[];
};

export type RiderHQState = {
  loading: boolean;
  error: string | null;
  address: GeoAddress | null;
  weather: WeatherInfo | null;
  location: Location.LocationObject | null;
  lastUpdated: Date | null;
  roadAlerts: RoadAlert[];
  sunTimes: SunTimes;
  /** Polar day/night state when there is no sunrise/sunset, else null. */
  sunState: PolarState | null;
  /** Deep-link URL to yr.no forecast for current location */
  weatherUrl: string;
  loadData: () => Promise<void>;
  cancelSearch: () => void;
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
  const { requestForegroundPermission } = useLocationPermission();

  const [loading, setLoading] = useState(false);
  // What failed, not the message for it — translated at render below, so an
  // error already on screen re-localizes when the user switches language.
  const [errorKind, setErrorKind] = useState<"location" | "data" | null>(null);
  const [address, setAddress] = useState<GeoAddress | null>(null);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [roadAlerts, setRoadAlerts] = useState<RoadAlert[]>([]);

  // Generation counter — incremented on each new call and on cancel.
  const activeCallRef = useRef(0);

  const cancelSearch = useCallback(() => {
    activeCallRef.current += 1;
    setLoading(false);
  }, []);

  const loadData = useCallback(async () => {
    const callId = (activeCallRef.current += 1);

    setLoading(true);
    setErrorKind(null);

    // Serve the last-good snapshot immediately so the home screen isn't blank
    // on a cold start with poor/no signal. Fresh data replaces it below.
    let cached: HQCache | null = null;
    try {
      const raw = await storage.getItem(RIDERHQ_CACHE_KEY);
      if (activeCallRef.current !== callId) return;
      if (raw) {
        const parsed: HQCache = JSON.parse(raw);
        if (parsed && parsed.coords) {
          cached = parsed;
          if (parsed.address) setAddress(parsed.address);
          if (parsed.weather) setWeather(parsed.weather);
          if (Array.isArray(parsed.roadAlerts)) setRoadAlerts(parsed.roadAlerts);
          setLocation({
            coords: {
              latitude: parsed.coords.latitude,
              longitude: parsed.coords.longitude,
              altitude: null, accuracy: null, altitudeAccuracy: null, heading: null, speed: null,
            },
            timestamp: parsed.ts,
          } as Location.LocationObject);
          if (parsed.ts) setLastUpdated(new Date(parsed.ts));
        }
      }
    } catch {}

    try {
      const permission = await requestForegroundPermission();
      if (activeCallRef.current !== callId) return;
      // Only bail out on explicit denial; 'undetermined' triggers the browser dialog.
      if (permission.status === "denied") {
        if (!cached) setErrorKind("location");
        return;
      }

      const position = await getCurrentPositionWithTimeout({
        accuracy: Location.Accuracy.High,
      });
      if (activeCallRef.current !== callId) return;
      setLocation(position);

      const { latitude, longitude } = position.coords;

      // Everything in the snapshot — town name, weather, road alerts — describes
      // the coordinates it was taken at. Now that we know where the rider really
      // is, anything measured somewhere else has to go immediately, not when the
      // network happens to answer. Otherwise the screen prints the previous
      // town's name directly above this position's coordinates, which is exactly
      // what happened on 2026-08-03 ("Sandefjord" over Tønsberg's coordinates,
      // with that morning's weather next to it).
      //
      // Clearing `cached` matters as much as clearing the state: the fallbacks
      // below (`addressResult ?? cached?.address`) would otherwise put the wrong
      // town straight back on screen the moment a fetch failed.
      if (
        cached &&
        haversineKm(latitude, longitude, cached.coords.latitude, cached.coords.longitude) * 1000 >
          HQ_SNAPSHOT_MAX_MOVE_M
      ) {
        cached = null;
        setAddress(null);
        setWeather(null);
        setRoadAlerts([]);
        setLastUpdated(null);
      }

      // ── Nominatim Reverse Geocoding — free OSM, retried up to 3 times ────
      const addressPromise = withRetry(() =>
        fetchWithTimeout(
          `${NOMINATIM_REVERSE_GEOCODING_BASE_URL}?lat=${latitude}&lon=${longitude}&format=json&zoom=10&addressdetails=1`,
          { headers: { "User-Agent": OSM_USER_AGENT } },
          HTTP_FETCH_TIMEOUT_MS
        )
          .then((r) => {
            if (!r.ok) throw new Error(`Nominatim Geocoding ${r.status}`);
            return r.json();
          })
          .then((data) => {
            if (!data.address) return null;
            const address = data.address;
            return {
              displayName: data.name || data.display_name || "",
              city: address.city || address.town || address.village || address.county,
              country: address.country,
            };
          })
      ).catch(() => null);

      // ── Open-Meteo — free weather API, retried up to 3 times ─────────────
      const weatherPromise = withRetry(() =>
        fetchWithTimeout(
          `${OPEN_METEO_BASE_URL}?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
          `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,relative_humidity_2m,precipitation,weather_code,precipitation_probability` +
          `&hourly=temperature_2m,weather_code,precipitation_probability` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
          `&forecast_days=${FORECAST_DAYS}&timezone=auto`,
          {},
          HTTP_FETCH_TIMEOUT_MS
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

          // With timezone=auto, all daily dates and hourly times in the response
          // are in the *location's* local timezone, not UTC and not the device's.
          // utc_offset_seconds lets us convert both ways for comparisons.
          const utcOffsetMs: number = (data.utc_offset_seconds ?? 0) * 1000;

          // Forecast (skip today)
          const daily = data.daily ?? {};
          const times: string[] = daily.time ?? [];
          const dailyCodes: number[] = daily.weather_code ?? [];
          const maxTemps: number[] = daily.temperature_2m_max ?? [];
          const minTemps: number[] = daily.temperature_2m_min ?? [];
          const rainProbs: number[] = daily.precipitation_probability_max ?? [];

          // "Today" as seen at the forecast location (not UTC): shift the epoch
          // by the location offset before taking the ISO date.
          const today = new Date(Date.now() + utcOffsetMs).toISOString().slice(0, 10);
          const forecast: ForecastDay[] = [];
          for (let i = 0; i < times.length; i++) {
            if (times[i] <= today) continue;
            if (forecast.length >= FORECAST_DISPLAY_DAYS) break;
            if (maxTemps[i] === undefined || minTemps[i] === undefined) continue;
            forecast.push({
              date: times[i],
              weatherCode: wmoToSymbol(dailyCodes[i] as number),
              maxTempC: maxTemps[i],
              minTempC: minTemps[i],
              precipitationProbability: Math.round(rainProbs[i] ?? 0),
            });
          }

          // Next hourly slots
          const hourlyData = data.hourly ?? {};
          const hourlyTimes: string[] = hourlyData.time ?? [];
          const hourlyTemps: number[] = hourlyData.temperature_2m ?? [];
          const hourlyCodes: number[] = hourlyData.weather_code ?? [];
          const hourlyRainProbs: number[] = hourlyData.precipitation_probability ?? [];
          const nowMs = Date.now();
          const hourly: HourlyForecast[] = [];
          for (let i = 0; i < hourlyTimes.length && hourly.length < HOURLY_SLOTS; i++) {
            // hourlyTimes are timezone-naive location-local strings ("2026-07-11T14:00");
            // parse as UTC then remove the location offset to get the real instant.
            const slotMs = Date.parse(`${hourlyTimes[i]}Z`) - utcOffsetMs;
            if (
              slotMs > nowMs &&
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
        `[out:json][timeout:${ROAD_OVERPASS_TIMEOUT_S}];` +
        `(way["highway"="construction"](around:${roadRadiusM},${lat},${lon});` +
        `node["highway"="construction"](around:${roadRadiusM},${lat},${lon});` +
        `way["construction"~"."](around:${roadRadiusM},${lat},${lon});` +
        `node["construction"~"."](around:${roadRadiusM},${lat},${lon});` +
        `);out center ${ROAD_MAX_RESULTS};`;

      // Retried like address/weather — a transient 429/timeout shouldn't drop
      // road alerts for the whole refresh while the other cards get retries.
      // OVERPASS_RETRY_ATTEMPTS: fetchOverpass already cycles mirrors per call.
      const roadPromise = withRetry(
        () => fetchOverpass(roadQuery, OVERPASS_ROAD_TIMEOUT_MS),
        OVERPASS_RETRY_ATTEMPTS
      )
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
            .slice(0, ROAD_ALERTS_MAX);
        })
        .catch((): RoadAlert[] | null => null);

      const [addressResult, weatherResult, roadResult] = await Promise.all([
        addressPromise,
        weatherPromise,
        roadPromise,
      ]);

      if (activeCallRef.current !== callId) return;
      // Keep the cached value for any piece whose fresh fetch failed, so a
      // partial network failure doesn't wipe good data off the screen.
      const finalAddress = addressResult ?? cached?.address ?? null;
      const finalWeather = weatherResult ?? cached?.weather ?? null;
      const finalRoads = roadResult ?? cached?.roadAlerts ?? [];
      setAddress(finalAddress);
      setWeather(finalWeather);
      setRoadAlerts(finalRoads);
      setLastUpdated(new Date());

      // Persist the best-known snapshot for the next cold/offline start.
      const snapshot: HQCache = {
        ts: Date.now(),
        coords: { latitude, longitude },
        address: finalAddress,
        weather: finalWeather,
        roadAlerts: finalRoads,
      };
      storage.setItem(RIDERHQ_CACHE_KEY, JSON.stringify(snapshot)).catch(() => {});
    } catch (err) {
      if (activeCallRef.current !== callId) return;
      // Log before swallowing. This catch used to discard the error entirely,
      // which made the 1.3.0/1.4.0 release-only expo-location failure invisible
      // here — the equivalent line in usePOIFetch is what actually identified it.
      console.error("[useRiderHQ] loadData failed:", err);
      // Offline/GPS failure: keep showing cached data rather than an error.
      if (!cached) setErrorKind("data");
    } finally {
      if (activeCallRef.current === callId) setLoading(false);
    }
  }, [searchRadiusKm]);

  // ── Derived values ────────────────────────────────────────────────────────

  const sunTimes = useMemo(
    () =>
      location
        ? computeSunTimes(location.coords.latitude, location.coords.longitude)
        : null,
    [location]
  );

  // When there is no sunrise/sunset (polar day/night), which case applies —
  // so the sun card can explain it instead of vanishing.
  const sunState = useMemo(
    () =>
      location && !sunTimes
        ? computeSunState(location.coords.latitude, location.coords.longitude)
        : null,
    [location, sunTimes]
  );

  const weatherUrl = location
    ? `${YR_NO_BASE_URL}/${encodeURIComponent(
        `${location.coords.latitude.toFixed(4)},${location.coords.longitude.toFixed(4)}`
      )}`
    : YR_NO_FALLBACK_URL;

  const error =
    errorKind === "location"
      ? t("home.locationError")
      : errorKind === "data"
        ? t("home.dataError")
        : null;

  return {
    loading,
    error,
    address,
    weather,
    location,
    lastUpdated,
    roadAlerts,
    sunTimes,
    sunState,
    weatherUrl,
    loadData,
    cancelSearch,
  };
}
