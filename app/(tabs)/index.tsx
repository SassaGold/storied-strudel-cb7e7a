import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings, fmtTemp } from "../../lib/settings";
import { saveLanguage } from "../../lib/i18n";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

/** Modern sans-serif font family: SF Pro on iOS, Roboto Black on Android, Inter on web */
const LOGO_FONT = Platform.select({ ios: "-apple-system", android: "sans-serif-black", web: "Inter, -apple-system, system-ui, sans-serif" });

type GeoAddress = {
  displayName: string;
  city?: string;
  country?: string;
};

type ForecastDay = {
  date: string;
  weatherCode: string;
  maxTempC: number;
  minTempC: number;
  precipitationProbability: number;
};

type HourlyForecast = {
  time: string;
  temperatureC: number;
  weatherCode: string;
  precipitationProbability: number;
};

type WeatherInfo = {
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

type RoadAlert = {
  id: string;
  name: string;
  type: string;
  description?: string;
  ref?: string;
  operator?: string;
  distance?: number;
  lat?: number;
  lon?: number;
};

const CONSTRUCTION_TYPE_LABELS: Record<string, string> = {
  service: "Service Road",
  residential: "Residential Road",
  primary: "Primary Road",
  primary_link: "Primary Road",
  secondary: "Secondary Road",
  secondary_link: "Secondary Road",
  tertiary: "Tertiary Road",
  tertiary_link: "Tertiary Road",
  unclassified: "Unclassified Road",
  trunk: "Trunk Road",
  trunk_link: "Trunk Road",
  motorway: "Motorway",
  motorway_link: "Motorway",
  road: "Road",
  living_street: "Living Street",
  construction: "Road Construction",
  bridge: "Bridge Works",
  tunnel: "Tunnel Works",
};

/** OSM construction/highway values that represent actual road work. */
const ROAD_TYPES = new Set(Object.keys(CONSTRUCTION_TYPE_LABELS));

function humanizeConstructionType(type: string, t: (key: string) => string): string {
  const key = `home.roadTypes.${type.toLowerCase()}`;
  const translated = t(key);
  // i18next returns the key itself when not found; fall back to formatted type
  if (translated !== key) return translated;
  return type.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const normalizeSymbol = (sym: string) =>
  sym.replace(/_(day|night|polartwilight)$/, "");

const windDegToCompass = (deg: number): string => {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[((Math.round(deg / 45) % 8) + 8) % 8];
};

const formatHourlyTime = (isoTime: string): string => {
  // isoTime is like "2024-03-10T14:00" — extract the HH:MM portion
  const tIdx = isoTime.indexOf("T");
  if (tIdx === -1) return isoTime;
  return isoTime.slice(tIdx + 1, tIdx + 6);
};

/**
 * Map WMO weather interpretation codes (used by Open-Meteo) to the
 * MET Norway symbol-code strings that the rest of the UI already understands.
 * Reference: https://open-meteo.com/en/docs#weathervariables
 */
const WMO_TO_SYMBOL: Record<number, string> = {
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

function wmoToSymbol(code: number): string {
  return WMO_TO_SYMBOL[code] ?? "cloudy";
}

const formatWeatherCode = (sym?: string) => {
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



const weatherEmoji = (sym?: string) => {
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

const buildAlerts = (weather?: WeatherInfo) => {
  if (!weather) {
    return [] as string[];
  }
  const alerts: string[] = [];
  const temp = weather.temperatureC ?? 20;
  const wind = weather.windSpeed ?? 0;
  const rainChance = weather.precipitationProbability ?? 0;

  if (temp <= 0) {
    alerts.push("home.alerts.veryCold");
  } else if (temp <= 5) {
    alerts.push("home.alerts.cold");
  }
  if (temp >= 35) {
    alerts.push("home.alerts.extremeHeat");
  } else if (temp >= 30) {
    alerts.push("home.alerts.highHeat");
  }
  if (wind >= 15) {
    alerts.push("home.alerts.strongWinds");
  } else if (wind >= 10) {
    alerts.push("home.alerts.gustyWinds");
  }
  if (rainChance >= 60) {
    alerts.push("home.alerts.rainExpected");
  }
  return alerts;
};

const ridingSuitability = (weather?: WeatherInfo): { score: number; labelKey: string; color: string } => {
  if (!weather) {
    return { score: 0, labelKey: "home.suitability.na", color: "#94a3b8" };
  }
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

  if (score >= 80) return { score, labelKey: "home.suitability.great", color: "#22c55e" };
  if (score >= 60) return { score, labelKey: "home.suitability.good", color: "#84cc16" };
  if (score >= 40) return { score, labelKey: "home.suitability.fair", color: "#f59e0b" };
  if (score >= 20) return { score, labelKey: "home.suitability.poor", color: "#f97316" };
  return { score, labelKey: "home.suitability.dangerous", color: "#ef4444" };
};

const buildRecommendations = (weather?: WeatherInfo) => {
  if (!weather) {
    return [] as string[];
  }
  const recs: string[] = [];
  const temp = weather.temperatureC ?? 20;
  const wind = weather.windSpeed ?? 0;
  const rainChance = weather.precipitationProbability ?? 0;

  if (temp <= 0) {
    recs.push("home.recs.thermalGear");
  } else if (temp <= 10) {
    recs.push("home.recs.layerUp");
  }
  if (temp >= 30) {
    recs.push("home.recs.lightGear");
  }
  if (wind >= 10) {
    recs.push("home.recs.secureLuggage");
  }
  if (rainChance >= 60) {
    recs.push("home.recs.rainGear");
  }
  return recs;
};

const ALERT_ICONS: Record<string, string> = {
  "home.alerts.veryCold":   "❄️",
  "home.alerts.cold":       "🌡️",
  "home.alerts.extremeHeat":"🔥",
  "home.alerts.highHeat":   "☀️",
  "home.alerts.strongWinds":"🌬️",
  "home.alerts.gustyWinds": "💨",
  "home.alerts.rainExpected":"🌧️",
};
const DEFAULT_ALERT_ICON = "⚠️";

const REC_ICONS: Record<string, string> = {
  "home.recs.thermalGear":  "🧥",
  "home.recs.layerUp":      "🧤",
  "home.recs.lightGear":    "👕",
  "home.recs.secureLuggage":"🎒",
  "home.recs.rainGear":     "☂️",
};
const DEFAULT_REC_ICON = "💡";


// Pure-JS implementation (no external API or library required).
// Based on the USNO/NOAA simplified algorithm.

type SunTimes = { sunrise: Date; sunset: Date; daylightMinutes: number } | null;

function computeSunTimes(lat: number, lon: number, date: Date = new Date()): SunTimes {
  const DEG = Math.PI / 180;
  const zenith = 90.833; // official civil zenith for sunrise/sunset

  const doy = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(date.getFullYear(), 0, 0)) /
      86400000
  );
  const lngHour = lon / 15;

  function calcUTCHour(isRise: boolean): number | null {
    const t = doy + ((isRise ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * DEG) + 0.02 * Math.sin(2 * M * DEG) + 282.634;
    L = ((L % 360) + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * DEG)) / DEG;
    RA = ((RA % 360) + 360) % 360;
    const RA_norm = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
    const sinDec = 0.39782 * Math.sin(L * DEG);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH =
      (Math.cos(zenith * DEG) - sinDec * Math.sin(lat * DEG)) /
      (cosDec * Math.cos(lat * DEG));
    if (cosH > 1 || cosH < -1) return null; // polar day / polar night
    const H = (isRise ? 360 - Math.acos(cosH) / DEG : Math.acos(cosH) / DEG) / 15;
    const T = H + RA_norm - 0.06571 * t - 6.622;
    return ((T - lngHour) % 24 + 24) % 24;
  }

  const utcRise = calcUTCHour(true);
  const utcSet = calcUTCHour(false);
  if (utcRise === null || utcSet === null) return null;

  const toDate = (utcH: number): Date => {
    const d = new Date(date);
    const h = Math.floor(utcH);
    const m = Math.round((utcH - h) * 60);
    d.setUTCHours(h, m, 0, 0);
    return d;
  };

  const sunrise = toDate(utcRise);
  const sunset = toDate(utcSet);
  const daylightMinutes = Math.round((sunset.getTime() - sunrise.getTime()) / 60000);
  return { sunrise, sunset, daylightMinutes };
}

const formatTime = (date: Date) => {
  try {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "--:--";
  }
};

const formatDuration = (minutes: number) => {
  if (minutes <= 0) return "N/A";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

// ─────────────────────────────────────────────────────────────────────────────

const formatForecastDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

export default function Index() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const hasNavigated = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<GeoAddress | null>(null);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [roadAlerts, setRoadAlerts] = useState<RoadAlert[]>([]);
  const [langModalVisible, setLangModalVisible] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      // On web (iOS Safari), the Permissions API returns 'prompt' for first-time visitors,
      // which expo-location maps to 'undetermined'. Only bail out if explicitly denied;
      // otherwise proceed to getCurrentPositionAsync() which triggers the browser dialog.
      if (permission.status === "denied") {
        setError(t("home.locationError"));
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
        {
          headers: {
            "User-Agent": "roamly-app",
          },
        }
      )
        .then((response) => response.json())
        .then((data) => ({
          displayName: data.display_name as string,
          city: data.address?.city || data.address?.town || data.address?.village,
          country: data.address?.country,
        }))
        .catch(() => null);

      // Open-Meteo — free, browser-friendly weather API (no API key, no User-Agent required)
      // Using Open-Meteo instead of api.met.no because browsers disallow setting the
      // User-Agent header in fetch(), which api.met.no requires for identification.
      const weatherPromise = fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
        `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,relative_humidity_2m,precipitation,weather_code,precipitation_probability` +
        `&hourly=temperature_2m,weather_code,precipitation_probability` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&forecast_days=4&timezone=auto`
      )
        .then((response) => response.json())
        .then((data) => {
          const current = data.current ?? {};
          if (current.temperature_2m === undefined) return null;

          const symbol = wmoToSymbol(current.weather_code as number);
          const precipitation: number = current.precipitation ?? 0;
          const precipProbability: number = current.precipitation_probability ?? 0;

          // Build 3-day forecast from daily arrays (index 0 = today, skip it)
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
          } as WeatherInfo;
        })
        .catch(() => null);

      // Overpass (OpenStreetMap) — free road conditions API, no API key required
      const lat = Math.max(-90, Math.min(90, latitude));
      const lon = Math.max(-180, Math.min(180, longitude));
      const roadRadiusM = Math.round(settings.searchRadiusKm * 1000);
      const roadPromise = fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=[out:json][timeout:10];(way["highway"="construction"](around:${roadRadiusM},${lat},${lon});node["highway"="construction"](around:${roadRadiusM},${lat},${lon});way["construction"~"."](around:${roadRadiusM},${lat},${lon});node["construction"~"."](around:${roadRadiusM},${lat},${lon}););out center 20;`,
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
        .catch(() => [] as RoadAlert[]);

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
  }, [t, settings]);

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

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (hasNavigated.current) return;
    if (settings.defaultTab !== "index") {
      hasNavigated.current = true;
      router.replace(`/${settings.defaultTab}` as any);
    }
  }, [settings.defaultTab, router]);

  const openMaps = useCallback(() => {
    if (!location) {
      return;
    }
    const { latitude, longitude } = location.coords;
    const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    Linking.openURL(url).catch(() => null);
  }, [location]);

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <View style={styles.headerTopRow}>
          <Pressable
            style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/about"); }}
            accessibilityRole="button"
            accessibilityLabel={t("tabs.about")}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.headerIconBtnText}>ℹ️</Text>
          </Pressable>
          {/* RIDER HQ logo wordmark */}
          <View style={styles.logoWrapper}>
            <Text style={styles.logoMoto}>🏍️</Text>
            <Text style={styles.logoTitle}>RIDER HQ</Text>
          </View>
          <View style={styles.headerTopRowRight}>
            <Pressable
              style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
              onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setLangModalVisible(true); }}
              accessibilityRole="button"
              accessibilityLabel={t("language.label")}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.headerIconBtnText}>🌐</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
              onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/settings"); }}
              accessibilityRole="button"
              accessibilityLabel={t("settings.title")}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.headerIconBtnText}>⚙️</Text>
            </Pressable>
          </View>
        </View>
        {/* WHERE AM I? subtitle */}
        <Text style={styles.logoSubtitle}>📍 WHERE AM I?</Text>
      </View>

      <Modal
        visible={langModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <Pressable style={styles.langModalOverlay} onPress={() => setLangModalVisible(false)}>
          <View style={styles.langModalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.langModalTitle}>{t("language.label")}</Text>
            {(["en", "es", "de", "fr", "is", "no", "sv", "da", "nl"] as const).map((lang) => (
              <Pressable
                key={lang}
                style={({ pressed }) => [
                  styles.langModalOption,
                  i18n.language === lang && styles.langModalOptionActive,
                  pressed && styles.langModalOptionPressed,
                ]}
                onPress={() => {
                  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                  i18n.changeLanguage(lang);
                  saveLanguage(lang);
                  setLangModalVisible(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={t(`language.${lang}`)}
                accessibilityState={{ selected: i18n.language === lang }}
              >
                <Text style={[styles.langModalOptionText, i18n.language === lang && styles.langModalOptionTextActive]}>
                  {t(`language.${lang}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Pressable style={styles.primaryButton} onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null); loadData(); }}>
        <Text style={styles.primaryButtonText}>
          {loading ? t("common.loading") : t("home.updateLocation")}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>{t("home.fetchingData")}</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {location && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("home.yourLocation")}</Text>
          <Text style={styles.bodyText}>
            {address?.displayName ?? t("home.addressNotAvailable")}
          </Text>
          <Text style={styles.metaText}>
            Lat {location.coords.latitude.toFixed(5)} · Lon {location.coords.longitude.toFixed(5)}
          </Text>
          <Text style={styles.metaText}>
            {t("home.accuracy", { value: Math.round(location.coords.accuracy ?? 0) })}
          </Text>
          <Pressable style={styles.secondaryButton} onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); openMaps(); }}>
            <Text style={styles.secondaryButtonText}>{t("common.openInMaps")}</Text>
          </Pressable>
        </View>
      )}

      {/* ── Weather Card ── */}
      {weather && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("home.localWeather")}</Text>

          {/* Main condition row */}
          <View style={styles.weatherMainRow}>
            <Text style={styles.weatherEmojiLarge}>{weatherEmoji(weather.weatherCode)}</Text>
            <View style={styles.weatherMainInfo}>
              <Text style={styles.weatherTempText}>{weather.temperatureC != null ? fmtTemp(weather.temperatureC, settings.unitSystem) : "—"}</Text>
              {weather.feelsLikeC != null && (
                <Text style={styles.weatherFeelsLike}>
                  {t("home.feelsLike")}: {fmtTemp(weather.feelsLikeC, settings.unitSystem)}
                </Text>
              )}
              <Text style={styles.weatherConditionText}>
                {t(formatWeatherCode(weather.weatherCode), { defaultValue: formatWeatherCode(weather.weatherCode) })}
              </Text>
            </View>
          </View>

          {/* Stats grid — 2×2 */}
          <View style={styles.weatherStatsGrid}>
            <View style={styles.weatherStatsRow}>
              <View style={styles.weatherStatItem}>
                <Text style={styles.weatherStatValue}>
                  {weather.windSpeed?.toFixed(1) ?? "0"}{weather.windDirection != null ? ` ${windDegToCompass(weather.windDirection)}` : ""}
                </Text>
                <Text style={styles.weatherStatLabel}>{t("home.wind")}</Text>
              </View>
              <View style={styles.weatherStatDivider} />
              <View style={styles.weatherStatItem}>
                <Text style={styles.weatherStatValue}>{weather.precipitationProbability ?? 0}%</Text>
                <Text style={styles.weatherStatLabel}>{t("home.rainChance")}</Text>
              </View>
            </View>
            <View style={styles.weatherStatsRowDivider} />
            <View style={styles.weatherStatsRow}>
              <View style={styles.weatherStatItem}>
                <Text style={styles.weatherStatValue}>{weather.humidity != null ? `${weather.humidity}%` : "—"}</Text>
                <Text style={styles.weatherStatLabel}>{t("home.humidity")}</Text>
              </View>
              <View style={styles.weatherStatDivider} />
              <View style={styles.weatherStatItem}>
                <Text style={styles.weatherStatValue}>{weather.precipitation ?? 0}</Text>
                <Text style={styles.weatherStatLabel}>{t("home.precip")}</Text>
              </View>
            </View>
          </View>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); Linking.openURL(weatherUrl).catch(() => null); }}
          >
            <Text style={styles.secondaryButtonText}>{t("home.openWeather")}</Text>
          </Pressable>
        </View>
      )}

      {/* ── Sunrise / Sunset Card ── */}
      {sunTimes && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("home.sunriseSunset")}</Text>
          <View style={styles.sunTimesRowSpaced}>
            <View style={styles.sunTimesItem}>
              <Text style={styles.sunTimesEmoji}>🌅</Text>
              <Text style={styles.sunTimesValue}>{formatTime(sunTimes.sunrise)}</Text>
              <Text style={styles.sunTimesLabel}>{t("home.sunrise")}</Text>
            </View>
            <View style={styles.sunTimesDivider} />
            <View style={styles.sunTimesItem}>
              <Text style={styles.sunTimesEmoji}>🌇</Text>
              <Text style={styles.sunTimesValue}>{formatTime(sunTimes.sunset)}</Text>
              <Text style={styles.sunTimesLabel}>{t("home.sunset")}</Text>
            </View>
            <View style={styles.sunTimesDivider} />
            <View style={styles.sunTimesItem}>
              <Text style={styles.sunTimesEmoji}>☀️</Text>
              <Text style={styles.sunTimesValue}>{formatDuration(sunTimes.daylightMinutes)}</Text>
              <Text style={styles.sunTimesLabel}>{t("home.daylight")}</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Riding Suitability Card ── */}
      {weather && (
        <View style={[styles.card, styles.suitabilityCard, { borderColor: suitability.color }]}>
          <Text style={styles.cardTitle}>{t("home.ridingSuitability", { score: suitability.score })}</Text>
          <View style={[styles.suitabilityBadge, styles.suitabilityBadgeSelf, { backgroundColor: suitability.color }]}>
            <Text style={styles.suitabilityBadgeText}>{t(suitability.labelKey)}</Text>
          </View>
        </View>
      )}

      {/* ── Alerts Card ── */}
      {weather && alerts.length > 0 && (
        <View style={[styles.card, styles.alertCard]}>
          <Text style={styles.cardTitle}>{t("home.ridingAlerts")}</Text>
          {alerts.map((key) => (
            <Text key={key} style={styles.weatherBullet}>{ALERT_ICONS[key] ?? DEFAULT_ALERT_ICON} {t(key)}</Text>
          ))}
        </View>
      )}

      {/* ── Recommendations Card ── */}
      {weather && recommendations.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("home.recommendations")}</Text>
          {recommendations.map((key) => (
            <Text key={key} style={styles.weatherBullet}>{REC_ICONS[key] ?? DEFAULT_REC_ICON} {t(key)}</Text>
          ))}
        </View>
      )}

      {/* ── Hourly Forecast Card ── */}
      {weather?.hourly && weather.hourly.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("home.hourlyForecast")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
            <View style={styles.hourlyCardsRow}>
              {weather.hourly.map((hour) => (
                <View key={hour.time} style={styles.hourlyCard}>
                  <Text style={styles.hourlyCardTime}>{formatHourlyTime(hour.time)}</Text>
                  <Text style={styles.hourlyCardEmoji}>{weatherEmoji(hour.weatherCode)}</Text>
                  <Text style={styles.hourlyCardTemp}>{fmtTemp(hour.temperatureC, settings.unitSystem, true)}</Text>
                  <Text style={styles.hourlyCardRain}>💧 {hour.precipitationProbability}%</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── 3-Day Forecast Card ── */}
      {weather?.forecast && weather.forecast.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("home.forecast")}</Text>
          <View style={styles.forecastCardsRow}>
            {weather.forecast.slice(0, 3).map((day) => (
              <View key={day.date} style={styles.forecastCard}>
                <Text style={styles.forecastCardDay}>
                  {formatForecastDate(day.date).split(",")[0]}
                </Text>
                <Text style={styles.forecastCardDate}>
                  {formatForecastDate(day.date).split(",")[1]?.trim() ?? ""}
                </Text>
                <Text style={styles.forecastCardEmoji}>{weatherEmoji(day.weatherCode)}</Text>
                <Text style={styles.forecastCardCondition}>
                  {t(formatWeatherCode(day.weatherCode), { defaultValue: formatWeatherCode(day.weatherCode) })}
                </Text>
                <Text style={styles.forecastCardTemp}>
                  {fmtTemp(day.maxTempC, settings.unitSystem, true)} / {fmtTemp(day.minTempC, settings.unitSystem, true)}
                </Text>
                <View style={styles.forecastCardRainRow}>
                  <Text style={styles.forecastCardRain}>💧 {day.precipitationProbability}%</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}


      {lastUpdated && (
        <Text style={styles.metaText}>
          {t("home.lastUpdated", { time: lastUpdated.toLocaleTimeString() })}
        </Text>
      )}

      {/* ── Road Conditions ── */}
      {lastUpdated && (
        <View style={[styles.card, roadAlerts.length > 0 && styles.roadAlertCard]}>
          <Text style={styles.cardTitle}>{t("home.roadConditions")}</Text>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#ff6600" />
              <Text style={styles.loadingText}>{t("home.roadConditionsLoading")}</Text>
            </View>
          ) : roadAlerts.length === 0 ? (
            <Text style={styles.roadConditionsAllClear}>{t("home.roadConditionsNone", { radius: settings.searchRadiusKm })}</Text>
          ) : (
            <>
              <Text style={styles.roadConditionsCount}>
                {t("home.roadConditionsCount", { count: roadAlerts.length, radius: settings.searchRadiusKm })}
              </Text>
              {roadAlerts.map((alert) => {
                const canOpen = alert.lat != null && alert.lon != null;
                const openInMaps = () => {
                  if (!canOpen) return;
                  Linking.openURL(
                    `https://www.google.com/maps/search/?api=1&query=${alert.lat},${alert.lon}`
                  ).catch(() =>
                    Linking.openURL(
                      `https://maps.apple.com/?q=${alert.lat},${alert.lon}`
                    ).catch(() => null)
                  );
                };
                return (
                  <Pressable
                    key={alert.id}
                    style={({ pressed }) => [
                      styles.roadAlertRow,
                      canOpen && pressed && styles.roadAlertRowPressed,
                    ]}
                    onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); openInMaps(); }}
                    disabled={!canOpen}
                  >
                    <Text style={styles.roadAlertEmoji}>🚧</Text>
                    <View style={styles.roadAlertInfo}>
                      <View style={styles.roadAlertHeader}>
                        <Text style={styles.roadAlertType}>
                          {humanizeConstructionType(alert.type, t)}
                        </Text>
                        {alert.distance != null && (
                          <Text style={styles.roadAlertDistance}>
                            {alert.distance < 1
                              ? `${Math.round(alert.distance * 1000)} m`
                              : `${alert.distance.toFixed(1)} km`}
                          </Text>
                        )}
                      </View>
                      {alert.name ? (
                        <Text style={styles.roadAlertName}>{alert.name}</Text>
                      ) : alert.ref ? (
                        <Text style={styles.roadAlertName}>{alert.ref}</Text>
                      ) : null}
                      {alert.description ? (
                        <Text style={styles.roadAlertDesc}>{alert.description}</Text>
                      ) : null}
                      {alert.operator ? (
                        <Text style={styles.roadAlertDesc}>🏗️ {alert.operator}</Text>
                      ) : null}
                      {canOpen && (
                        <Text style={styles.roadAlertMapHint}>📍 Tap to open in Maps</Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
          {location && (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                const { latitude, longitude } = location.coords;
                Linking.openURL(
                  `https://www.google.com/maps/@${latitude},${longitude},14z/data=!5m1!1e1`
                ).catch(() => null);
              }}
            >
              <Text style={styles.secondaryButtonText}>{t("home.openTrafficMap")}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ── Quick navigation grid ── */}
      <Text style={styles.quickNavLabel}>{t("home.quickNav")}</Text>
      <View style={styles.quickNavGrid}>
        <Pressable
          style={({ pressed }) => [styles.quickNavBtn, pressed && styles.quickNavBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/restaurants"); }}
        >
          <Text style={styles.quickNavEmoji}>🍽️</Text>
          <Text style={styles.quickNavText}>{t("tabs.food")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.quickNavBtn, pressed && styles.quickNavBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/hotels"); }}
        >
          <Text style={styles.quickNavEmoji}>🛏️</Text>
          <Text style={styles.quickNavText}>{t("tabs.sleep")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.quickNavBtn, pressed && styles.quickNavBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/attractions"); }}
        >
          <Text style={styles.quickNavEmoji}>🏁</Text>
          <Text style={styles.quickNavText}>{t("tabs.explore")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.quickNavBtn, pressed && styles.quickNavBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/mc"); }}
        >
          <Text style={styles.quickNavEmoji}>⚙️</Text>
          <Text style={styles.quickNavText}>{t("tabs.garage")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.quickNavBtn, pressed && styles.quickNavBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/triplogger"); }}
        >
          <Text style={styles.quickNavEmoji}>📏</Text>
          <Text style={styles.quickNavText}>{t("tabs.trip")}</Text>
        </Pressable>
      </View>
      <Pressable
        style={({ pressed }) => [styles.quickNavBtnSos, pressed && styles.quickNavBtnSosPressed]}
        onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null); router.navigate("/emergency"); }}
      >
        <Text style={styles.quickNavEmoji}>🆘</Text>
        <Text style={styles.quickNavTextSos}>{t("tabs.sos")}</Text>
      </Pressable>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: "#0a0a0a",
  },
  header: {
    marginTop: 18,
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    overflow: "hidden",
    backgroundColor: "#1a0900",
  },
  headerGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,102,0,0.55)",
    top: -80,
    right: -40,
  },
  headerGlowSecondary: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(180,60,0,0.40)",
    bottom: -60,
    left: -20,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTopRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,102,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconBtnPressed: {
    backgroundColor: "rgba(255,102,0,0.40)",
  },
  headerIconBtnText: {
    fontSize: 18,
  },
  logoWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  logoMoto: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: "center",
    marginRight: 6,
  },
  logoTitle: {
    color: "#ff6600",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.8,
    textAlign: "center",
    fontFamily: LOGO_FONT,
    textShadowColor: "rgba(255,102,0,0.50)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  logoSubtitle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2.5,
    textAlign: "center",
    marginTop: 4,
    fontFamily: LOGO_FONT,
  },
  primaryButton: {
    backgroundColor: "#ff6600",
    paddingVertical: 13,
    borderRadius: 6,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#ff6600",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  secondaryButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#ff6600",
    backgroundColor: "rgba(255,102,0,0.08)",
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#ff6600",
    fontSize: 14,
    fontWeight: "700",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  loadingText: {
    color: "#c8c8c8",
  },
  errorText: {
    color: "#f87171",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#141414",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  alertCard: {
    borderColor: "#ff6600",
    borderWidth: 1,
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: 1,
  },
  bodyText: {
    color: "#c8c8c8",
    fontSize: 15,
    marginBottom: 4,
  },
  metaText: {
    color: "#666666",
    fontSize: 13,
  },
  placeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  placeInfo: {
    flex: 1,
    marginRight: 12,
  },
  weatherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 6,
  },
  weatherEmoji: {
    fontSize: 36,
  },
  weatherMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  weatherEmojiLarge: {
    fontSize: 64,
  },
  weatherMainInfo: {
    flex: 1,
  },
  weatherTempText: {
    color: "#ff6600",
    fontSize: 42,
    fontWeight: "800",
    lineHeight: 46,
  },
  weatherConditionText: {
    color: "#c8c8c8",
    fontSize: 16,
    marginTop: 2,
  },
  weatherFeelsLike: {
    color: "#888888",
    fontSize: 13,
    marginTop: 2,
  },
  weatherStatsGrid: {
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    overflow: "hidden",
  },
  weatherStatsRow: {
    flexDirection: "row",
    paddingVertical: 12,
  },
  weatherStatsRowDivider: {
    height: 1,
    backgroundColor: "#2a2a2a",
  },
  weatherStatItem: {
    flex: 1,
    alignItems: "center",
  },
  weatherStatDivider: {
    width: 1,
    backgroundColor: "#2a2a2a",
    marginVertical: 4,
  },
  weatherStatValue: {
    color: "#ff6600",
    fontSize: 20,
    fontWeight: "800",
  },
  weatherStatLabel: {
    color: "#666666",
    fontSize: 12,
    marginTop: 2,
  },
  suitabilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  suitabilityCard: {
    borderWidth: 1,
  },
  suitabilityBadgeSelf: {
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  suitabilityLabel: {
    color: "#c8c8c8",
    fontSize: 15,
    fontWeight: "600",
  },
  suitabilityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  suitabilityBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  weatherSection: {
    marginBottom: 12,
  },
  weatherSectionTitle: {
    color: "#ff6600",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  weatherBullet: {
    color: "#c8c8c8",
    fontSize: 14,
    marginBottom: 2,
    paddingLeft: 4,
  },
  forecastCardsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  forecastCard: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: "center",
    shadowColor: "#020617",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  forecastCardDay: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  forecastCardDate: {
    color: "#666666",
    fontSize: 11,
    marginBottom: 8,
    marginTop: 1,
  },
  forecastCardEmoji: {
    fontSize: 30,
    marginBottom: 6,
  },
  forecastCardCondition: {
    color: "#c8c8c8",
    fontSize: 10,
    textAlign: "center",
    marginBottom: 6,
  },
  forecastCardTemp: {
    color: "#ff6600",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  forecastCardRainRow: {
    backgroundColor: "rgba(255,102,0,0.12)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  forecastCardRain: {
    color: "#ff6600",
    fontSize: 11,
    fontWeight: "600",
  },
  hourlyCardsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  hourlyCard: {
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    minWidth: 68,
  },
  hourlyCardTime: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  hourlyCardEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  hourlyCardTemp: {
    color: "#ff6600",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  hourlyCardRain: {
    color: "#888888",
    fontSize: 11,
  },
  sunTimesRow: {
    flexDirection: "row",
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  sunTimesRowSpaced: {
    flexDirection: "row",
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  sunTimesItem: {
    flex: 1,
    alignItems: "center",
  },
  sunTimesDivider: {
    width: 1,
    backgroundColor: "#2a2a2a",
    marginVertical: 4,
  },
  sunTimesEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  sunTimesValue: {
    color: "#ff6600",
    fontSize: 16,
    fontWeight: "800",
  },
  sunTimesLabel: {
    color: "#666666",
    fontSize: 12,
    marginTop: 2,
  },
  langModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  langModalContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    padding: 20,
    width: 260,
  },
  langModalTitle: {
    color: "#ff6600",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 14,
    textAlign: "center",
  },
  langModalOption: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333333",
    backgroundColor: "#111111",
    marginBottom: 8,
  },
  langModalOptionActive: {
    borderColor: "#ff6600",
    backgroundColor: "rgba(255,102,0,0.12)",
  },
  langModalOptionPressed: {
    backgroundColor: "rgba(255,102,0,0.22)",
  },
  langModalOptionText: {
    color: "#888888",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  langModalOptionTextActive: {
    color: "#ff6600",
  },
  quickNavLabel: {
    color: "#666666",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 4,
  },
  quickNavGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 10,
  },
  quickNavBtn: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  quickNavBtnPressed: {
    backgroundColor: "rgba(255,102,0,0.12)",
    borderColor: "#ff6600",
  },
  quickNavEmoji: {
    fontSize: 34,
  },
  quickNavText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1,
  },
  quickNavBtnSos: {
    flexDirection: "row",
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 2,
    borderColor: "#ef4444",
    borderRadius: 14,
    paddingVertical: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 20,
  },
  quickNavBtnSosPressed: {
    backgroundColor: "rgba(239,68,68,0.25)",
  },
  quickNavTextSos: {
    color: "#ef4444",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 2,
  },
  roadAlertCard: {
    borderColor: "#f59e0b",
    borderWidth: 1,
  },
  roadConditionsAllClear: {
    color: "#22c55e",
    fontSize: 14,
    marginBottom: 4,
  },
  roadConditionsCount: {
    color: "#f59e0b",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
  },
  roadAlertRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: 8,
    padding: 8,
  },
  roadAlertRowPressed: {
    backgroundColor: "rgba(245,158,11,0.22)",
  },
  roadAlertEmoji: {
    fontSize: 20,
    marginTop: 1,
  },
  roadAlertInfo: {
    flex: 1,
  },
  roadAlertHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  roadAlertType: {
    color: "#f59e0b",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  roadAlertDistance: {
    color: "#a3a3a3",
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 0,
  },
  roadAlertName: {
    color: "#c8c8c8",
    fontSize: 13,
    marginTop: 2,
  },
  roadAlertDesc: {
    color: "#a3a3a3",
    fontSize: 12,
    marginTop: 2,
    fontStyle: "italic",
  },
  roadAlertMapHint: {
    color: "#f59e0b",
    fontSize: 11,
    marginTop: 4,
    opacity: 0.75,
  },

  // ── Merged styles from RiderHQ design template ──
  dangerCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#ff4444",
  },
  text: { color: "#ccc", fontSize: 15 },
  subText: { color: "#888", fontSize: 13, marginTop: 2 },
  bigTemp: {
    color: "#fff",
    fontSize: 42,
    fontWeight: "700",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  metric: { alignItems: "center" },
  metricLabel: { color: "#aaa", fontSize: 13 },
  metricValue: { color: "#fff", fontSize: 16, fontWeight: "600" },
  suitability: {
    color: "#ff4444",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 4,
  },
  listItem: { color: "#ccc", fontSize: 15, marginTop: 4 },
  hourBlock: {
    backgroundColor: "#222",
    padding: 12,
    borderRadius: 10,
    marginRight: 10,
    alignItems: "center",
    width: 70,
  },
  hourText: { color: "#fff", fontSize: 14 },
  hourIcon: { fontSize: 22 },
  hourTemp: { color: "#fff", marginTop: 4 },
  hourRain: { color: "#aaa", fontSize: 12 },
  button: {
    backgroundColor: "#007aff",
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600" },
});
