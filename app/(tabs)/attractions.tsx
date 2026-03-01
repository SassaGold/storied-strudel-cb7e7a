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
  stars?: string;
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

export default function AttractionsScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);

  const loadPlaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Location permission is required to find attractions.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = position.coords;

      const overpassQuery = `
[out:json][timeout:25];
(
  node(around:5000,${latitude},${longitude})[tourism~"attraction|museum|viewpoint|castle|monument|artwork|zoo|theme_park"];
  way(around:5000,${latitude},${longitude})[tourism~"attraction|museum|viewpoint|castle|monument|artwork|zoo|theme_park"];
  relation(around:5000,${latitude},${longitude})[tourism~"attraction|museum|viewpoint|castle|monument|artwork|zoo|theme_park"];
  node(around:5000,${latitude},${longitude})[historic~"monument|castle|ruins|memorial"];
  way(around:5000,${latitude},${longitude})[historic~"monument|castle|ruins|memorial"];
  relation(around:5000,${latitude},${longitude})[historic~"monument|castle|ruins|memorial"];
);
out center 120;`;

      const response = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
          overpassQuery
        )}`
      );
      const data = await response.json();

      if (!data.elements) {
        setPlaces([]);
        return;
      }

      const mapped = (data.elements as any[])
        .map((element) => {
          const lat = element.lat ?? element.center?.lat;
          const lon = element.lon ?? element.center?.lon;
          if (lat === undefined || lon === undefined) {
            return null;
          }
          const tags = element.tags ?? {};
          const name = tags.name || tags.tourism || tags.historic || "Attraction";
          return {
            id: String(element.id),
            name,
            category: tags.tourism || tags.historic || "attraction",
            latitude: lat,
            longitude: lon,
            distanceMeters: haversineMeters(latitude, longitude, lat, lon),
          } as Place;
        })
        .filter(Boolean) as Place[];

      setPlaces(
        mapped
          .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
          .slice(0, 20)
      );
    } catch (err) {
      setError("Unable to load attractions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openInMaps = useCallback((place: Place) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
    Linking.openURL(url).catch(() => null);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>Explore nearby</Text>
        <Text style={styles.title}>Tourist Attractions</Text>
        <Text style={styles.subtitle}>Discover interesting places and sights nearby.</Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={loadPlaces}>
        <Text style={styles.primaryButtonText}>
          {loading ? "Loading..." : "Find attractions near me"}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>Searching nearby attractions…</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {places.length === 0 && !loading ? (
        <Text style={styles.bodyText}>
          No attractions found yet. Try updating your location.
        </Text>
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
              </View>
            </View>
            <Text style={styles.metaText}>
              {formatDistance(place.distanceMeters)}
            </Text>
          </Pressable>
        ))
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
    borderColor: "rgba(167,139,250,0.25)",
    overflow: "hidden",
    backgroundColor: "#150c3a",
  },
  headerGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(139,92,246,0.45)",
    top: -90,
    right: -50,
  },
  headerGlowSecondary: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(236,72,153,0.3)",
    bottom: -70,
    left: -30,
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(7,11,20,0.5)",
    color: "#c4b5fd",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
    letterSpacing: 0.6,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.35)",
  },
  title: {
    color: "#f1f5f9",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitle: {
    color: "#c4b5fd",
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
    backgroundColor: "#0f1e33",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.2)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
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
});