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

type WeatherInfo = {
  temperatureC?: number;
  windSpeed?: number;
  precipitation?: number;
  precipitationProbability?: number;
  weatherCode?: number;
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
  if ((weather.precipitationProbability ?? 0) >= 60) {
    alerts.push("Rain likely in the next hour.");
  }
  if ((weather.windSpeed ?? 0) >= 10) {
    alerts.push("Windy conditions nearby.");
  }
  if ((weather.temperatureC ?? 0) <= 0) {
    alerts.push("Freezing temperatures detected.");
  }
  if ((weather.temperatureC ?? 0) >= 32) {
    alerts.push("High heat — stay hydrated.");
  }
  return alerts;
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
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,precipitation,weather_code&hourly=precipitation_probability&forecast_days=1`
      )
        .then((response) => response.json())
        .then((data) => {
          const precipitationProbability =
            data.hourly?.precipitation_probability?.[0] ?? undefined;
          return {
            temperatureC: data.current?.temperature_2m ?? undefined,
            windSpeed: data.current?.wind_speed_10m ?? undefined,
            precipitation: data.current?.precipitation ?? undefined,
            weatherCode: data.current?.weather_code ?? undefined,
            precipitationProbability,
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
  const weatherUrl = "https://www.yr.no";
    const appOwnership = Constants.appOwnership ?? "expo";
    const isWeb = Platform.OS === "web";
    const useNativeMaps =
      !isWeb && !!NativeMapView && appOwnership !== "expo";

    const mapProviders = useMemo(() => {
      if (!location) {
        return [] as string[];
      }
      const { latitude, longitude } = location.coords;
    const tileZoom = 15;
    const tile = latLonToTile(latitude, longitude, tileZoom);
    const osmProviders = [
      `https://maps.wikimedia.org/img/osm-intl,15,${latitude},${longitude},600x300.png`,
      `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=15&size=600x300&maptype=mapnik&markers=${latitude},${longitude},red-pushpin`,
      `https://tile.openstreetmap.org/${tileZoom}/${tile.x}/${tile.y}.png`,
    ];

    return osmProviders;
  }, [location]);

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
  const mapAttribution = "© OpenStreetMap contributors";

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
    const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=16`;
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
          <View style={styles.weatherRow}>
            <Text style={styles.weatherEmoji}>{weatherEmoji(weather.weatherCode)}</Text>
            <View>
              <Text style={styles.bodyText}>
                {formatWeatherCode(weather.weatherCode)} · {weather.temperatureC?.toFixed(1)}°C
              </Text>
              <Text style={styles.metaText}>
                Wind {weather.windSpeed?.toFixed(1)} m/s · Precip {weather.precipitation ?? 0} mm
              </Text>
            </View>
          </View>
          <Text style={styles.bodyText}>
            Rain chance {weather.precipitationProbability ?? 0}%
          </Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => Linking.openURL(weatherUrl).catch(() => null)}
          >
            <Text style={styles.secondaryButtonText}>Open yr.no</Text>
          </Pressable>
        </View>
      )}

      {alerts.length > 0 && (
        <View style={[styles.card, styles.alertCard]}>
          <Text style={styles.cardTitle}>Alerts</Text>
          {alerts.map((alert) => (
            <Text key={alert} style={styles.bodyText}>
              • {alert}
            </Text>
          ))}
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
    backgroundColor: "#070b14",
  },
  header: {
    marginTop: 18,
    marginBottom: 20,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.25)",
    overflow: "hidden",
    backgroundColor: "#0c1845",
  },
  headerGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(99,102,241,0.45)",
    top: -90,
    right: -50,
  },
  headerGlowSecondary: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(56,189,248,0.3)",
    bottom: -70,
    left: -30,
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(7,11,20,0.5)",
    color: "#93c5fd",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
    letterSpacing: 0.6,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.3)",
  },
  title: {
    color: "#f1f5f9",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitle: {
    color: "#93c5fd",
    marginTop: 6,
    fontSize: 15,
    opacity: 0.85,
  },
  primaryButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#3b82f6",
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  secondaryButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.4)",
    backgroundColor: "rgba(59,130,246,0.08)",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#93c5fd",
    fontSize: 14,
    fontWeight: "600",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  loadingText: {
    color: "#60a5fa",
  },
  errorText: {
    color: "#f87171",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#0f1e33",
    padding: 18,
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.2)",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  alertCard: {
    borderColor: "rgba(251,191,36,0.5)",
    borderWidth: 1,
  },
  cardTitle: {
    color: "#f1f5f9",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 10,
    letterSpacing: 0.1,
  },
  bodyText: {
    color: "#cbd5e1",
    fontSize: 15,
    marginBottom: 4,
  },
  metaText: {
    color: "#64748b",
    fontSize: 13,
  },
  mapImage: {
    width: "100%",
    height: 180,
    borderRadius: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.2)",
  },
  mapNativeContainer: {
    marginTop: 12,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.2)",
  },
  mapNative: {
    width: "100%",
    height: 220,
  },
  attributionText: {
    color: "#475569",
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
});
