import { useCallback, useState } from "react";
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

type Place = {
  id: string;
  name: string;
  category: string;
  distanceMeters?: number;
  latitude: number;
  longitude: number;
  note?: string;
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];

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

const mapElements = (
  elements: any[],
  latitude: number,
  longitude: number,
  fallbackCategory: string
) =>
  (elements as any[])
    .map((element) => {
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (lat === undefined || lon === undefined) {
        return null;
      }
      const tags = element.tags ?? {};
      const name = tags.name || tags.brand || tags.operator || fallbackCategory;
      const note = tags.fee === "no" ? "Free parking" : undefined;
      const category =
        tags.shop || tags.amenity || tags.tourism || fallbackCategory;
      return {
        id: String(element.id),
        name,
        category,
        latitude: lat,
        longitude: lon,
        distanceMeters: haversineMeters(latitude, longitude, lat, lon),
        note,
      } as Place;
    })
    .filter(Boolean) as Place[];

const fetchOverpass = async (query: string) => {
  let lastError: string | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        lastError = `Overpass error ${response.status}`;
        continue;
      }

      return await response.json();
    } catch (err) {
      lastError = "Network error";
    }
  }

  throw new Error(lastError ?? "Overpass request failed");
};

type Category = "dealers" | "workshops" | "shops" | "fuel";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "dealers", label: "🏍️ MC Dealers" },
  { key: "workshops", label: "🔧 Workshops" },
  { key: "shops", label: "🛒 MC Shops" },
  { key: "fuel", label: "⛽ Fuel Stations" },
];

export default function McScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Category>("dealers");
  const [places, setPlaces] = useState<Place[]>([]);

  const buildQuery = (category: Category, lat: number, lon: number) => {
    if (category === "dealers") {
      return `
[out:json][timeout:25];
(
  node(around:20000,${lat},${lon})[shop=motorcycle];
  way(around:20000,${lat},${lon})[shop=motorcycle];
  relation(around:20000,${lat},${lon})[shop=motorcycle];
);
out center 120;`;
    }
    if (category === "workshops") {
      return `
[out:json][timeout:25];
(
  node(around:20000,${lat},${lon})[shop=motorcycle_repair];
  way(around:20000,${lat},${lon})[shop=motorcycle_repair];
  relation(around:20000,${lat},${lon})[shop=motorcycle_repair];
);
out center 120;`;
    }
    if (category === "fuel") {
      return `
[out:json][timeout:25];
(
  node(around:20000,${lat},${lon})[amenity=fuel];
  way(around:20000,${lat},${lon})[amenity=fuel];
  relation(around:20000,${lat},${lon})[amenity=fuel];
);
out center 120;`;
    }
    return `
[out:json][timeout:25];
(
  node(around:20000,${lat},${lon})[shop=motorcycle_parts];
  way(around:20000,${lat},${lon})[shop=motorcycle_parts];
  relation(around:20000,${lat},${lon})[shop=motorcycle_parts];
);
out center 120;`;
  };

  const fallbackLabel = (category: Category) => {
    if (category === "dealers") return "MC Dealer";
    if (category === "workshops") return "MC Workshop";
    if (category === "fuel") return "Fuel Station";
    return "MC Shop";
  };

  const loadPlaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlaces([]);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Location permission is required to find nearby places.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = position.coords;
      const query = buildQuery(selected, latitude, longitude);
      const data = await fetchOverpass(query);
      const results = data.elements
        ? mapElements(
            data.elements,
            latitude,
            longitude,
            fallbackLabel(selected)
          )
        : [];

      setPlaces(
        results
          .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
          .slice(0, 20)
      );
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? `Unable to load data (${err.message}). Please try again.`
          : "Unable to load data. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const openInMaps = useCallback((place: Place) => {
    const url = `https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}&zoom=16`;
    Linking.openURL(url).catch(() => null);
  }, []);

  const sectionTitle =
    selected === "dealers"
      ? "MC Dealers"
      : selected === "workshops"
        ? "MC Workshops"
        : selected === "fuel"
          ? "Fuel Stations"
          : "MC Shops";

  const emptyText =
    selected === "dealers"
      ? "No MC dealers found yet. Try updating your location."
      : selected === "workshops"
        ? "No MC workshops found yet. Try updating your location."
        : selected === "fuel"
          ? "No fuel stations found yet. Try updating your location."
          : "No MC shops found yet. Try updating your location.";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>Ride nearby</Text>
        <Text style={styles.title}>MC Dealers, Workshops, Shops & Fuel</Text>
        <Text style={styles.subtitle}>
          Choose a category and find nearby spots.
        </Text>
      </View>

      {/* Category selector */}
      <View style={styles.segmentRow}>
        {CATEGORIES.map(({ key, label }) => (
          <Pressable
            key={key}
            style={[
              styles.segmentButton,
              selected === key && styles.segmentButtonActive,
            ]}
            onPress={() => {
              setSelected(key);
              setPlaces([]);
              setError(null);
            }}
          >
            <Text
              style={[
                styles.segmentText,
                selected === key && styles.segmentTextActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
        onPress={loadPlaces}
        disabled={loading}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? "Loading..." : `Find ${sectionTitle}`}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>Searching nearby places…</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.sectionCard}>
        <Text style={styles.cardTitle}>{sectionTitle}</Text>
        {places.length === 0 && !loading ? (
          <Text style={styles.bodyText}>{emptyText}</Text>
        ) : (
          places.map((place) => (
            <Pressable
              key={place.id}
              style={styles.placeRow}
              onPress={() => openInMaps(place)}
            >
              <View style={styles.placeInfo}>
                <Text style={styles.bodyText}>{place.name}</Text>
                <View style={styles.tagRow}>
                  <Text style={styles.metaText}>{place.category}</Text>
                  {place.note && (
                    <Text style={styles.highlightTag}>{place.note}</Text>
                  )}
                </View>
              </View>
              <Text style={styles.metaText}>
                {formatDistance(place.distanceMeters)}
              </Text>
            </Pressable>
          ))
        )}
      </View>
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
    borderColor: "rgba(52,211,153,0.25)",
    overflow: "hidden",
    backgroundColor: "#0a1f0a",
  },
  headerGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(34,197,94,0.4)",
    top: -90,
    right: -50,
  },
  headerGlowSecondary: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(20,184,166,0.35)",
    bottom: -70,
    left: -30,
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(7,11,20,0.5)",
    color: "#6ee7b7",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
    letterSpacing: 0.6,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
  },
  title: {
    color: "#f1f5f9",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitle: {
    color: "#6ee7b7",
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
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#0f1e33",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.25)",
  },
  segmentButtonActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#3b82f6",
  },
  segmentText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: "#ffffff",
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
  sectionCard: {
    backgroundColor: "#0f1e33",
    padding: 16,
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
  cardTitle: {
    color: "#f1f5f9",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 14,
    letterSpacing: 0.1,
  },
  bodyText: {
    color: "#cbd5e1",
    fontSize: 15,
    marginBottom: 12,
  },
  metaText: {
    color: "#64748b",
    fontSize: 13,
  },
  placeRow: {
    backgroundColor: "#0a1626",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.15)",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  placeInfo: {
    flex: 1,
    marginRight: 12,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  highlightTag: {
    color: "#34d399",
    fontSize: 12,
    fontWeight: "700",
  },
});
