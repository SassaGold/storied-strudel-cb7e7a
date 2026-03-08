import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useSettings, fmtTemp } from "../../lib/settings";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

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

type WeatherInfo = {
  temperatureC?: number;
  windSpeed?: number;
  precipitation?: number;
  precipitationProbability?: number;
  weatherCode?: string;
  forecast?: ForecastDay[];
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

function humanizeConstructionType(type: string): string {
  const normalized = type.toLowerCase().replace(/_/g, " ");
  return (
    CONSTRUCTION_TYPE_LABELS[type.toLowerCase()] ??
    normalized.replace(/\b\w/g, (c) => c.toUpperCase())
  );
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

// ─── Sunrise / Sunset ────────────────────────────────────────────────────────
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
  const hasNavigated = useRef(false);
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
      if (permission.status !== "granted") {
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
            "User-Agent": "leander-location-app",
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

      // MET Norway (api.met.no) — free public weather API, no API key required
      const weatherPromise = fetch(
        `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}`,
        { headers: { "User-Agent": "leander/1.0 com.sassagold.leander" } }
      )
        .then((response) => response.json())
        .then((data) => {
          const timeseries: any[] = data.properties?.timeseries ?? [];
          if (timeseries.length === 0) return null;

          // Current conditions from first entry
          const current = timeseries[0];
          const instant = current.data?.instant?.details ?? {};
          const next1h = current.data?.next_1_hours ?? current.data?.next_6_hours ?? {};
          const symbol: string = next1h.summary?.symbol_code ?? "";
          const precipProbability: number = next1h.details?.probability_of_precipitation ?? 0;
          const precipitation: number = next1h.details?.precipitation_amount ?? 0;

          // Build 3-day forecast grouped by date
          const dayMap = new Map<string, any[]>();
          for (const entry of timeseries) {
            const dateKey: string = entry.time.slice(0, 10);
            if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
            dayMap.get(dateKey)!.push(entry);
          }

          // yr.no API returns all timestamps in UTC; .toISOString() is consistently UTC
          const today = new Date().toISOString().slice(0, 10);
          const forecast: ForecastDay[] = [];
          for (const [date, entries] of dayMap.entries()) {
            if (date <= today) continue;
            if (forecast.length >= 3) break;
            // Pick entry closest to noon UTC (yr.no times are always UTC)
            const noonEntry = entries.reduce((best: any, e: any) => {
              const hour = parseInt(e.time.slice(11, 13), 10);
              const bestHour = parseInt(best.time.slice(11, 13), 10);
              return Math.abs(hour - 12) < Math.abs(bestHour - 12) ? e : best;
            });
            const n6h = noonEntry.data?.next_6_hours ?? noonEntry.data?.next_12_hours ?? {};
            const daySymbol: string =
              n6h.summary?.symbol_code ??
              noonEntry.data?.next_1_hours?.summary?.symbol_code ??
              "";
            const rainProb: number = n6h.details?.probability_of_precipitation ?? 0;
            // Scan all entries for the day to find max/min temps (not every entry has them)
            let maxTempC: number | undefined;
            let minTempC: number | undefined;
            for (const e of entries) {
              const block = e.data?.next_6_hours ?? e.data?.next_12_hours ?? {};
              const mx: number | undefined = block.details?.air_temperature_max;
              const mn: number | undefined = block.details?.air_temperature_min;
              if (mx !== undefined) maxTempC = maxTempC === undefined ? mx : Math.max(maxTempC, mx);
              if (mn !== undefined) minTempC = minTempC === undefined ? mn : Math.min(minTempC, mn);
            }
            // Fall back to instant temperatures if no 6h/12h blocks had them
            if (maxTempC === undefined || minTempC === undefined) {
              const temps: number[] = entries
                .map((e: any) => e.data?.instant?.details?.air_temperature as number | undefined)
                .filter((t): t is number => t !== undefined);
              if (temps.length > 0) {
                if (maxTempC === undefined) maxTempC = Math.max(...temps);
                if (minTempC === undefined) minTempC = Math.min(...temps);
              }
            }
            if (maxTempC === undefined || minTempC === undefined) continue;
            forecast.push({
              date,
              weatherCode: daySymbol,
              maxTempC,
              minTempC,
              precipitationProbability: Math.round(rainProb),
            });
          }

          return {
            temperatureC: instant.air_temperature,
            windSpeed: instant.wind_speed,
            precipitation,
            precipitationProbability: Math.round(precipProbability),
            weatherCode: symbol,
            forecast,
          } as WeatherInfo;
        })
        .catch(() => null);

      // Overpass (OpenStreetMap) — free road conditions API, no API key required
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
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Pressable
          style={({ pressed }) => [styles.headerInfoBtn, pressed && styles.headerInfoBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/about"); }}
          accessibilityRole="button"
          accessibilityLabel={t("tabs.about")}
          accessibilityHint={t("about.badge")}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={styles.headerInfoBtnText}>ℹ️</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.headerSettingsBtn, pressed && styles.headerInfoBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/settings"); }}
          accessibilityRole="button"
          accessibilityLabel={t("settings.title")}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={styles.headerInfoBtnText}>⚙️</Text>
        </Pressable>
        <Text style={styles.headerBadge}>{t("home.badge")}</Text>
        <Text style={styles.title}>{t("home.title")}</Text>
        <Text style={styles.subtitle}>{t("home.subtitle")}</Text>
      </View>

      <View style={styles.languageRow}>
        {(["en", "es", "de", "fr", "is", "no", "sv", "da"] as const).map((lang) => (
          <Pressable
            key={lang}
            style={[styles.langButton, i18n.language === lang && styles.langButtonActive]}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); i18n.changeLanguage(lang); }}
            accessibilityRole="button"
            accessibilityLabel={t(`language.${lang}`)}
            accessibilityState={{ selected: i18n.language === lang }}
          >
            <Text style={[styles.langButtonText, i18n.language === lang && styles.langButtonTextActive]}>
              {t(`language.${lang}`)}
            </Text>
          </Pressable>
        ))}
      </View>

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

      {weather && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("home.localWeather")}</Text>

          {/* Main condition row */}
          <View style={styles.weatherMainRow}>
            <Text style={styles.weatherEmojiLarge}>{weatherEmoji(weather.weatherCode)}</Text>
            <View style={styles.weatherMainInfo}>
              <Text style={styles.weatherTempText}>{weather.temperatureC != null ? fmtTemp(weather.temperatureC, settings.unitSystem) : "—"}</Text>
              <Text style={styles.weatherConditionText}>
                {t(formatWeatherCode(weather.weatherCode), { defaultValue: formatWeatherCode(weather.weatherCode) })}
              </Text>
            </View>
          </View>

          {/* Stats grid */}
          <View style={styles.weatherStatsGrid}>
            <View style={styles.weatherStatItem}>
              <Text style={styles.weatherStatValue}>{weather.windSpeed?.toFixed(1) ?? "0"}</Text>
              <Text style={styles.weatherStatLabel}>{t("home.wind")}</Text>
            </View>
            <View style={styles.weatherStatDivider} />
            <View style={styles.weatherStatItem}>
              <Text style={styles.weatherStatValue}>{weather.precipitation ?? 0}</Text>
              <Text style={styles.weatherStatLabel}>{t("home.precip")}</Text>
            </View>
            <View style={styles.weatherStatDivider} />
            <View style={styles.weatherStatItem}>
              <Text style={styles.weatherStatValue}>{weather.precipitationProbability ?? 0}%</Text>
              <Text style={styles.weatherStatLabel}>{t("home.rainChance")}</Text>
            </View>
          </View>

          {/* Riding Suitability */}
          <View style={styles.suitabilityRow}>
            <Text style={styles.suitabilityLabel}>{t("home.ridingSuitability", { score: suitability.score })}</Text>
            <View style={[styles.suitabilityBadge, { backgroundColor: suitability.color }]}>
              <Text style={styles.suitabilityBadgeText}>{t(suitability.labelKey)}</Text>
            </View>
          </View>

          {/* Riding Alerts */}
          {alerts.length > 0 && (
            <View style={styles.weatherSection}>
              <Text style={styles.weatherSectionTitle}>{t("home.ridingAlerts")}</Text>
              {alerts.map((key) => (
                <Text key={key} style={styles.weatherBullet}>• {t(key)}</Text>
              ))}
            </View>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <View style={styles.weatherSection}>
              <Text style={styles.weatherSectionTitle}>{t("home.recommendations")}</Text>
              {recommendations.map((key) => (
                <Text key={key} style={styles.weatherBullet}>• {t(key)}</Text>
              ))}
            </View>
          )}

          {/* 3-Day Forecast */}
          {weather.forecast && weather.forecast.length > 0 && (
            <View style={styles.weatherSection}>
              <Text style={styles.weatherSectionTitle}>{t("home.forecast")}</Text>
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

          {/* Sunrise & Sunset */}
          {sunTimes && (
            <View style={styles.weatherSection}>
              <Text style={styles.weatherSectionTitle}>{t("home.sunriseSunset")}</Text>
              <View style={styles.sunTimesRow}>
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
                  <Text style={styles.sunTimesValue}>
                    {formatDuration(sunTimes.daylightMinutes)}
                  </Text>
                  <Text style={styles.sunTimesLabel}>{t("home.daylight")}</Text>
                </View>
              </View>
            </View>
          )}

          <Pressable
            style={styles.secondaryButton}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); Linking.openURL(weatherUrl).catch(() => null); }}
          >
            <Text style={styles.secondaryButtonText}>{t("home.openWeather")}</Text>
          </Pressable>
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
            <Text style={styles.roadConditionsAllClear}>{t("home.roadConditionsNone")}</Text>
          ) : (
            <>
              <Text style={styles.roadConditionsCount}>
                {t("home.roadConditionsCount", { count: roadAlerts.length })}
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
                          {humanizeConstructionType(alert.type)}
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
    padding: 16,
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
  headerInfoBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,102,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerSettingsBtn: {
    position: "absolute",
    top: 10,
    right: 62,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,102,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfoBtnPressed: {
    backgroundColor: "rgba(255,102,0,0.40)",
  },
  headerInfoBtnText: {
    fontSize: 18,
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,102,0,0.18)",
    color: "#ff6600",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: 0.4,
  },
  title: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 2,
  },
  subtitle: {
    color: "#c8c8c8",
    marginTop: 6,
    fontSize: 15,
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
    borderRadius: 10,
    marginBottom: 16,
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
    fontSize: 52,
  },
  weatherMainInfo: {
    flex: 1,
  },
  weatherTempText: {
    color: "#ff6600",
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 36,
  },
  weatherConditionText: {
    color: "#c8c8c8",
    fontSize: 16,
    marginTop: 2,
  },
  weatherStatsGrid: {
    flexDirection: "row",
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
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
  sunTimesRow: {
    flexDirection: "row",
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 6,
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
  languageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
    justifyContent: "center",
  },
  langButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#333333",
    backgroundColor: "#1a1a1a",
  },
  langButtonActive: {
    borderColor: "#ff6600",
    backgroundColor: "rgba(255,102,0,0.12)",
  },
  langButtonText: {
    color: "#888888",
    fontSize: 13,
    fontWeight: "600",
  },
  langButtonTextActive: {
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
});
