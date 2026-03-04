import { useCallback, useEffect, useMemo, useState } from "react";
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

const normalizeSymbol = (sym: string) =>
  sym.replace(/_(day|night|polartwilight)$/, "");

const formatWeatherCode = (sym?: string) => {
  if (!sym) return "";
  const s = normalizeSymbol(sym);
  const labels: Record<string, string> = {
    clearsky: "Clear",
    fair: "Fair",
    partlycloudy: "Partly cloudy",
    cloudy: "Cloudy",
    fog: "Fog",
    lightrainshowers: "Light rain showers",
    rainshowers: "Rain showers",
    heavyrainshowers: "Heavy rain showers",
    lightrain: "Light rain",
    rain: "Rain",
    heavyrain: "Heavy rain",
    lightsleetshowers: "Light sleet showers",
    sleetshowers: "Sleet showers",
    heavysleetshowers: "Heavy sleet showers",
    lightsleet: "Light sleet",
    sleet: "Sleet",
    heavysleet: "Heavy sleet",
    lightsnowshowers: "Light snow showers",
    snowshowers: "Snow showers",
    heavysnowshowers: "Heavy snow showers",
    lightsnow: "Light snow",
    snow: "Snow",
    heavysnow: "Heavy snow",
    thunder: "Thunder",
    rainandthunder: "Rain and thunder",
    heavyrainandthunder: "Heavy rain and thunder",
    snowandthunder: "Snow and thunder",
    heavysnowandthunder: "Heavy snow and thunder",
    sleetandthunder: "Sleet and thunder",
    rainshowersandthunder: "Rain showers and thunder",
    heavyrainshowersandthunder: "Heavy rain showers and thunder",
    snowshowersandthunder: "Snow showers and thunder",
    sleetshowersandthunder: "Sleet showers and thunder",
    lightrainandthunder: "Light rain and thunder",
    lightsnowandthunder: "Light snow and thunder",
    lightsleetandthunder: "Light sleet and thunder",
    lightrainshowersandthunder: "Light rain showers and thunder",
    lightsnowshowersandthunder: "Light snow showers and thunder",
    lightsleetshowersandthunder: "Light sleet showers and thunder",
  };
  return labels[s] ?? s;
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
    alerts.push("Very cold - risk of frostbite");
  } else if (temp <= 5) {
    alerts.push("Cold temperatures - watch for ice patches");
  }
  if (temp >= 35) {
    alerts.push("Extreme heat - risk of dehydration");
  } else if (temp >= 30) {
    alerts.push("High heat - stay hydrated");
  }
  if (wind >= 15) {
    alerts.push("Strong winds - dangerous for riding");
  } else if (wind >= 10) {
    alerts.push("Gusty winds - ride with caution");
  }
  if (rainChance >= 60) {
    alerts.push("Rain expected - slippery roads ahead");
  }
  return alerts;
};

const ridingSuitability = (weather?: WeatherInfo): { score: number; label: string; color: string } => {
  if (!weather) {
    return { score: 0, label: "N/A", color: "#94a3b8" };
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

  if (score >= 80) return { score, label: "GREAT", color: "#22c55e" };
  if (score >= 60) return { score, label: "GOOD", color: "#84cc16" };
  if (score >= 40) return { score, label: "FAIR", color: "#f59e0b" };
  if (score >= 20) return { score, label: "POOR", color: "#f97316" };
  return { score, label: "DANGEROUS", color: "#ef4444" };
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
    recs.push("Wear thermal gear, consider heated grips");
  } else if (temp <= 10) {
    recs.push("Layer up, wear windproof jacket");
  }
  if (temp >= 30) {
    recs.push("Light breathable gear, carry water");
  }
  if (wind >= 10) {
    recs.push("Secure loose clothing and luggage");
  }
  if (rainChance >= 60) {
    recs.push("Bring rain gear, waterproof your bags");
  }
  return recs;
};

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<GeoAddress | null>(null);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Location permission is required to show nearby info.");
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

      const [addressResult, weatherResult] = await Promise.all([
        addressPromise,
        weatherPromise,
      ]);

      setAddress(addressResult);
      setWeather(weatherResult);
      setLastUpdated(new Date());
    } catch {
      setError("Unable to load location data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const alerts = useMemo(() => buildAlerts(weather ?? undefined), [weather]);
  const suitability = useMemo(() => ridingSuitability(weather ?? undefined), [weather]);
  const recommendations = useMemo(() => buildRecommendations(weather ?? undefined), [weather]);
  const weatherUrl = location
    ? `https://www.yr.no/en/forecast/daily-table/${location.coords.latitude.toFixed(4)},${location.coords.longitude.toFixed(4)}`
    : "https://www.yr.no";

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openMaps = useCallback(() => {
    if (!location) {
      return;
    }
    const { latitude, longitude } = location.coords;
    const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    Linking.openURL(url).catch(() => null);
  }, [location]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>Live nearby</Text>
        <Text style={styles.title}>Where Am I?</Text>
        <Text style={styles.subtitle}>Your location and what’s around you.</Text>
      </View>


      <Pressable style={styles.primaryButton} onPress={loadData}>
        <Text style={styles.primaryButtonText}>
          {loading ? "Loading..." : "Update my location"}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>Fetching local data…</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {location && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Location</Text>
          <Text style={styles.bodyText}>
            {address?.displayName ?? "Address not available"}
          </Text>
          <Text style={styles.metaText}>
            Lat {location.coords.latitude.toFixed(5)} · Lon {location.coords.longitude.toFixed(5)}
          </Text>
          <Text style={styles.metaText}>
            Accuracy {Math.round(location.coords.accuracy ?? 0)} m
          </Text>
          <Pressable style={styles.secondaryButton} onPress={openMaps}>
            <Text style={styles.secondaryButtonText}>Open in Maps</Text>
          </Pressable>
        </View>
      )}

      {weather && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Local Weather</Text>

          {/* Main condition row */}
          <View style={styles.weatherMainRow}>
            <Text style={styles.weatherEmojiLarge}>{weatherEmoji(weather.weatherCode)}</Text>
            <View style={styles.weatherMainInfo}>
              <Text style={styles.weatherTempText}>{weather.temperatureC?.toFixed(1)}°C</Text>
              <Text style={styles.weatherConditionText}>{formatWeatherCode(weather.weatherCode)}</Text>
            </View>
          </View>

          {/* Stats grid */}
          <View style={styles.weatherStatsGrid}>
            <View style={styles.weatherStatItem}>
              <Text style={styles.weatherStatValue}>{weather.windSpeed?.toFixed(1) ?? "0"}</Text>
              <Text style={styles.weatherStatLabel}>Wind (m/s)</Text>
            </View>
            <View style={styles.weatherStatDivider} />
            <View style={styles.weatherStatItem}>
              <Text style={styles.weatherStatValue}>{weather.precipitation ?? 0}</Text>
              <Text style={styles.weatherStatLabel}>Precip (mm)</Text>
            </View>
            <View style={styles.weatherStatDivider} />
            <View style={styles.weatherStatItem}>
              <Text style={styles.weatherStatValue}>{weather.precipitationProbability ?? 0}%</Text>
              <Text style={styles.weatherStatLabel}>Rain Chance</Text>
            </View>
          </View>

          {/* Riding Suitability */}
          <View style={styles.suitabilityRow}>
            <Text style={styles.suitabilityLabel}>Riding Suitability: {suitability.score}/100</Text>
            <View style={[styles.suitabilityBadge, { backgroundColor: suitability.color }]}>
              <Text style={styles.suitabilityBadgeText}>{suitability.label}</Text>
            </View>
          </View>

          {/* Riding Alerts */}
          {alerts.length > 0 && (
            <View style={styles.weatherSection}>
              <Text style={styles.weatherSectionTitle}>⚠️ Riding Alerts:</Text>
              {alerts.map((alert) => (
                <Text key={alert} style={styles.weatherBullet}>• {alert}</Text>
              ))}
            </View>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <View style={styles.weatherSection}>
              <Text style={styles.weatherSectionTitle}>💡 Recommendations:</Text>
              {recommendations.map((rec) => (
                <Text key={rec} style={styles.weatherBullet}>• {rec}</Text>
              ))}
            </View>
          )}

          {/* 3-Day Forecast */}
          {weather.forecast && weather.forecast.length > 0 && (
            <View style={styles.weatherSection}>
              <Text style={styles.weatherSectionTitle}>3-Day Forecast</Text>
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
                    <Text style={styles.forecastCardCondition}>{formatWeatherCode(day.weatherCode)}</Text>
                    <Text style={styles.forecastCardTemp}>
                      {Math.round(day.maxTempC)}° / {Math.round(day.minTempC)}°
                    </Text>
                    <View style={styles.forecastCardRainRow}>
                      <Text style={styles.forecastCardRain}>💧 {day.precipitationProbability}%</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Pressable
            style={styles.secondaryButton}
            onPress={() => Linking.openURL(weatherUrl).catch(() => null)}
          >
            <Text style={styles.secondaryButtonText}>Open YR</Text>
          </Pressable>
        </View>
      )}


      {lastUpdated && (
        <Text style={styles.metaText}>
          Last updated {lastUpdated.toLocaleTimeString()}
        </Text>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: "#0f0a1a",
  },
  header: {
    marginTop: 18,
    marginBottom: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    backgroundColor: "#3b0764",
  },
  headerGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(236,72,153,0.55)",
    top: -80,
    right: -40,
  },
  headerGlowSecondary: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(59,130,246,0.45)",
    bottom: -60,
    left: -20,
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(15,10,26,0.35)",
    color: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: 0.4,
  },
  title: {
    color: "#f8fafc",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  subtitle: {
    color: "#c4b5fd",
    marginTop: 6,
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: "#f59e0b",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#f59e0b",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryButtonText: {
    color: "#2b0a3d",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#6d28d9",
    backgroundColor: "#1b1030",
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#e2e8f0",
    fontSize: 14,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  loadingText: {
    color: "#cbd5f5",
  },
  errorText: {
    color: "#f87171",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#1b1030",
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2d1b4d",
    shadowColor: "#020617",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  alertCard: {
    borderColor: "#f59e0b",
    borderWidth: 1,
  },
  cardTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  bodyText: {
    color: "#e2e8f0",
    fontSize: 15,
    marginBottom: 4,
  },
  metaText: {
    color: "#94a3b8",
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
    color: "#f8fafc",
    fontSize: 32,
    fontWeight: "700",
    lineHeight: 36,
  },
  weatherConditionText: {
    color: "#c4b5fd",
    fontSize: 16,
    marginTop: 2,
  },
  weatherStatsGrid: {
    flexDirection: "row",
    backgroundColor: "#120926",
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  weatherStatItem: {
    flex: 1,
    alignItems: "center",
  },
  weatherStatDivider: {
    width: 1,
    backgroundColor: "#2d1b4d",
    marginVertical: 4,
  },
  weatherStatValue: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700",
  },
  weatherStatLabel: {
    color: "#94a3b8",
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
    color: "#e2e8f0",
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
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  weatherBullet: {
    color: "#cbd5e1",
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
    backgroundColor: "#120926",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2d1b4d",
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
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  forecastCardDate: {
    color: "#94a3b8",
    fontSize: 11,
    marginBottom: 8,
    marginTop: 1,
  },
  forecastCardEmoji: {
    fontSize: 30,
    marginBottom: 6,
  },
  forecastCardCondition: {
    color: "#c4b5fd",
    fontSize: 10,
    textAlign: "center",
    marginBottom: 6,
  },
  forecastCardTemp: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  forecastCardRainRow: {
    backgroundColor: "rgba(125,211,252,0.12)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  forecastCardRain: {
    color: "#7dd3fc",
    fontSize: 11,
    fontWeight: "600",
  },
});
