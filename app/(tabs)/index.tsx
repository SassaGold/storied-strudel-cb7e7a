import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import * as Location from "expo-location";
import Constants from "expo-constants";

let NativeMapView: any = null;
let NativeMarker: any = null;

if (Platform.OS !== "web") {
  try {
    const maps = require("react-native-maps");
    NativeMapView = maps.default ?? maps.MapView ?? maps;
    NativeMarker = null;
  } catch (e) {
    // Handle error if react-native-maps is not available
    NativeMapView = null;
    NativeMarker = null;
  }
}

type GeoAddress = {
  displayName: string;
  city?: string;
  country?: string;
};

type ForecastDay = {
  date: string;
  weatherCode: number;
  maxTempC: number;
  minTempC: number;
  precipitationProbability: number;
};

type WeatherInfo = {
  temperatureC?: number;
  windSpeed?: number;
  precipitation?: number;
  precipitationProbability?: number;
  weatherCode?: number;
  forecast?: ForecastDay[];
};

type Place = {
  id: string;
  name: string;
  category: string;
  distanceMeters?: number;
};

const haversineMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatDistance = (distance?: number) => {
  if (distance === undefined) {
    return "";
  }
  if (distance < 1000) {
    return `${Math.round(distance)} m`;
  }
  return `${(distance / 1000).toFixed(1)} km`;
};

const formatWeatherCode = (code?: number) => {
  if (code === undefined) {
    return "";
  }
  const mapping: Record<number, string> = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Heavy rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm w/ hail",
    99: "Thunderstorm w/ heavy hail",
  };
  return mapping[code] ?? "Unknown";
};

const latLonToTile = (lat: number, lon: number, zoom: number) => {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
};


const weatherEmoji = (code?: number) => {
  if (code === undefined) {
    return "❓";
  }
  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if ([51, 53, 55].includes(code)) return "🌦️";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
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
  const [places, setPlaces] = useState<Place[]>([]);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [mapError, setMapError] = useState(false);
  const [mapErrorMessage, setMapErrorMessage] = useState<string | null>(null);
  const [mapProviderIndex, setMapProviderIndex] = useState(0);
  const [mapImageLoading, setMapImageLoading] = useState(false);
  const [mapImageLoaded, setMapImageLoaded] = useState(false);

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

      const weatherPromise = fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,precipitation,weather_code&hourly=precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`
      )
        .then((response) => response.json())
        .then((data) => {
          const precipitationProbability =
            data.hourly?.precipitation_probability?.[0] ?? undefined;
          const dailyTimes: string[] = data.daily?.time ?? [];
          const dailyCodes: number[] = data.daily?.weather_code ?? [];
          const dailyMaxTemps: number[] = data.daily?.temperature_2m_max ?? [];
          const dailyMinTemps: number[] = data.daily?.temperature_2m_min ?? [];
          const dailyRainProbs: number[] = data.daily?.precipitation_probability_max ?? [];
          const forecast: ForecastDay[] = dailyTimes
            .map((date, i) => {
              const weatherCode = dailyCodes[i];
              const maxTempC = dailyMaxTemps[i];
              const minTempC = dailyMinTemps[i];
              const precipitationProbability = dailyRainProbs[i];
              if (
                weatherCode === undefined ||
                maxTempC === undefined ||
                minTempC === undefined ||
                precipitationProbability === undefined
              ) {
                return null;
              }
              return { date, weatherCode, maxTempC, minTempC, precipitationProbability };
            })
            .filter((d): d is ForecastDay => d !== null);
          return {
            temperatureC: data.current?.temperature_2m ?? undefined,
            windSpeed: data.current?.wind_speed_10m ?? undefined,
            precipitation: data.current?.precipitation ?? undefined,
            weatherCode: data.current?.weather_code ?? undefined,
            precipitationProbability,
            forecast,
          } as WeatherInfo;
        })
        .catch(() => null);

      const overpassQuery = `
[out:json][timeout:25];
(
  node(around:5000,${latitude},${longitude})[shop~"motorcycle|motorcycle_repair|car_repair"];
  way(around:5000,${latitude},${longitude})[shop~"motorcycle|motorcycle_repair|car_repair"];
  relation(around:5000,${latitude},${longitude})[shop~"motorcycle|motorcycle_repair|car_repair"];
);
out center 60;`;

      const placesPromise = fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
          overpassQuery
        )}`
      )
        .then((response) => response.json())
        .then((data) => {
          if (!data.elements) {
            return [] as Place[];
          }
          const mapped = (data.elements as any[])
            .map((element) => {
              const lat = element.lat ?? element.center?.lat;
              const lon = element.lon ?? element.center?.lon;
              if (lat === undefined || lon === undefined) {
                return null;
              }
              const tags = element.tags ?? {};
              const name =
                tags.name ||
                tags.shop ||
                tags.amenity ||
                tags.tourism ||
                tags.leisure ||
                "Place";
              const category = tags.shop || tags.amenity || "motorbike workshop";
              return {
                id: String(element.id),
                name,
                category,
                distanceMeters: haversineMeters(
                  latitude,
                  longitude,
                  lat,
                  lon
                ),
              } as Place;
            })
            .filter(Boolean) as Place[];
          return mapped
            .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
            .slice(0, 12);
        })
        .catch(() => [] as Place[]);

      const [addressResult, weatherResult, placesResult] = await Promise.all([
        addressPromise,
        weatherPromise,
        placesPromise,
      ]);

      setAddress(addressResult);
      setWeather(weatherResult);
      setPlaces(placesResult ?? []);
      setLastUpdated(new Date());
    } catch (err) {
      setError("Unable to load location data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const alerts = useMemo(() => buildAlerts(weather ?? undefined), [weather]);
  const suitability = useMemo(() => ridingSuitability(weather ?? undefined), [weather]);
  const recommendations = useMemo(() => buildRecommendations(weather ?? undefined), [weather]);
  const weatherUrl = "https://www.yr.no";
    const appOwnership = Constants.appOwnership ?? "expo";
    const isWeb = Platform.OS === "web";
    const useNativeMaps =
      !isWeb && !!NativeMapView && appOwnership !== "expo";

    const googleMapsStaticKey = useMemo(() => {
      return (
        (Constants.expoConfig?.extra as any)?.googleMapsStaticKey ??
        (Constants.manifest as any)?.extra?.googleMapsStaticKey
      );
    }, []);

    const mapProviders = useMemo(() => {
      if (!location) {
        return [] as string[];
      }
      const { latitude, longitude } = location.coords;
      const googleUrl = googleMapsStaticKey
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=15&size=600x300&scale=2&maptype=roadmap&markers=color:red%7C${latitude},${longitude}&key=${googleMapsStaticKey}`
      : undefined;
    const tileZoom = 15;
    const tile = latLonToTile(latitude, longitude, tileZoom);
    const osmProviders = [
      `https://maps.wikimedia.org/img/osm-intl,15,${latitude},${longitude},600x300.png`,
      `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=15&size=600x300&maptype=mapnik&markers=${latitude},${longitude},red-pushpin`,
      `https://tile.openstreetmap.org/${tileZoom}/${tile.x}/${tile.y}.png`,
    ];

    return [
      ...(googleUrl ? [googleUrl] : []),
      ...osmProviders,
    ];
  }, [location, googleMapsStaticKey]);

  const mapUrl = mapProviders[mapProviderIndex];
  const mapImageSource = mapUrl
    ? {
        uri: mapUrl,
        ...(Platform.OS === "web"
          ? {
              headers: {
                "User-Agent": "Mozilla/5.0",
                Accept: "image/png,image/*;q=0.8,*/*;q=0.5",
              },
            }
          : {}),
      }
    : undefined;

  const mapProviderLabel = mapUrl ? mapUrl.split("/")[2] : "";
  const mapAttribution = mapUrl?.includes("googleapis.com")
    ? "© Google"
    : "© OpenStreetMap contributors";

  const nativeRegion = location
    ? {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : undefined;


  useEffect(() => {
    setMapError(false);
    setMapErrorMessage(null);
    setMapProviderIndex(0);
  }, [mapProviders]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (mapUrl && (!useNativeMaps || isWeb)) {
      setMapImageLoading(true);
      setMapImageLoaded(false);
    }
  }, [mapUrl, useNativeMaps, isWeb]);

  const retryMapPreview = () => {
    if (!mapProviders.length) {
      return;
    }
    setMapError(false);
    setMapProviderIndex((prev) => (prev + 1) % mapProviders.length);
  };

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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Map Preview</Text>
        {!isWeb && !location && (
          <Text style={styles.bodyText}>
            Tap “Update my location” to load the map.
          </Text>
        )}
        {useNativeMaps && location && NativeMapView && nativeRegion && (
          <View style={styles.mapNativeContainer}>
            <NativeMapView
              style={styles.mapNative}
              region={nativeRegion}
              showsUserLocation
              showsMyLocationButton
            >
              {NativeMarker && (
                <NativeMarker
                  coordinate={{
                    latitude: nativeRegion.latitude,
                    longitude: nativeRegion.longitude,
                  }}
                  title="You are here"
                />
              )}
            </NativeMapView>
          </View>
        )}
        {!useNativeMaps && !isWeb && location && (
          <Text style={styles.bodyText}>
            Showing a static map preview. Use “Open in Maps” for live navigation.
          </Text>
        )}
        {!mapUrl && isWeb && (
          <Text style={styles.bodyText}>
            Tap “Update my location” to load the map.
          </Text>
        )}
        {!mapUrl && !isWeb && location && (
          <View>
            <Text style={styles.bodyText}>
              Map preview is unavailable right now. Tap “Update my location” to
              retry.
            </Text>
            <Text style={styles.metaText}>
              Debug: map URL not generated.
            </Text>
          </View>
        )}
        {mapUrl && !mapError && mapImageSource && (!useNativeMaps || isWeb) && (
          <View>
            <ExpoImage
              source={mapImageSource}
              style={styles.mapImage}
              contentFit="cover"
              onLoad={() => {
                setMapImageLoaded(true);
                setMapImageLoading(false);
              }}
              onError={() => {
                setMapErrorMessage("Image failed to load");
                if (mapProviderIndex < mapProviders.length - 1) {
                  setMapProviderIndex((prev) => prev + 1);
                } else {
                  setMapError(true);
                }
                setMapImageLoading(false);
              }}
            />
            <Text style={styles.attributionText}>{mapAttribution}</Text>
          </View>
        )}
        {!useNativeMaps && !isWeb && !googleMapsStaticKey && (
          <Text style={styles.metaText}>
            Google Maps preview requires a Static Maps API key in
            extra.googleMapsStaticKey.
          </Text>
        )}
        {mapUrl && mapImageLoading && (!useNativeMaps || isWeb) && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" />
            <Text style={styles.loadingText}>Loading map preview…</Text>
          </View>
        )}
        {mapUrl && mapError && (!useNativeMaps || isWeb) && (
          <View>
            <Text style={styles.bodyText}>
              Map preview is unavailable. If using Google Static Maps, make
              sure Maps Static API is enabled, billing is active, and the key
              is not restricted for HTTP referrers.
            </Text>
            <Pressable style={styles.secondaryButton} onPress={retryMapPreview}>
              <Text style={styles.secondaryButtonText}>
                Try another provider
              </Text>
            </Pressable>
          </View>
        )}
        {mapErrorMessage && (!useNativeMaps || isWeb) && (
          <Text style={styles.metaText}>Map error: {mapErrorMessage}</Text>
        )}
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
              {weather.forecast.map((day) => (
                <View key={day.date} style={styles.forecastRow}>
                  <Text style={styles.forecastDate}>{formatForecastDate(day.date)}</Text>
                  <Text style={styles.forecastEmoji}>{weatherEmoji(day.weatherCode)}</Text>
                  <Text style={styles.forecastTemps}>{Math.round(day.maxTempC)}° / {Math.round(day.minTempC)}°</Text>
                  <Text style={styles.forecastRain}>{day.precipitationProbability}% rain</Text>
                </View>
              ))}
            </View>
          )}

          <Pressable
            style={styles.secondaryButton}
            onPress={() => Linking.openURL(weatherUrl).catch(() => null)}
          >
            <Text style={styles.secondaryButtonText}>Open yr.no</Text>
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
  mapImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  mapNativeContainer: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  mapNative: {
    width: "100%",
    height: 220,
  },
  attributionText: {
    color: "#c4b5fd",
    fontSize: 11,
    marginTop: 6,
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
  forecastRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#1e1040",
  },
  forecastDate: {
    color: "#e2e8f0",
    fontSize: 13,
    flex: 2,
  },
  forecastEmoji: {
    fontSize: 18,
    flex: 0,
    marginHorizontal: 8,
  },
  forecastTemps: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "600",
    flex: 2,
    textAlign: "center",
  },
  forecastRain: {
    color: "#7dd3fc",
    fontSize: 13,
    flex: 1.5,
    textAlign: "right",
  },
});
