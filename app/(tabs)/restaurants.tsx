import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
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
  website?: string;
  phone?: string;
  openingHours?: string;
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

const AMENITY_TYPES =
  "restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|bakery";

const categoryLabel: Record<string, string> = {
  restaurant: "🍽️ Restaurant",
  cafe: "☕ Café",
  fast_food: "🍔 Fast Food",
  bar: "🍺 Bar",
  pub: "🍻 Pub",
  food_court: "🏪 Food Court",
  ice_cream: "🍦 Ice Cream",
  bakery: "🥐 Bakery",
};

const formatCategory = (category: string) =>
  categoryLabel[category] ??
  `🍴 ${category
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")}`;

const formatDistance = (distance?: number) => {
  if (distance === undefined) {
    return "";
  }
  if (distance < 1000) {
    return `${Math.round(distance)} m`;
  }
  return `${(distance / 1000).toFixed(1)} km`;
};

export default function RestaurantsScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [infoPlace, setInfoPlace] = useState<Place | null>(null);

  const loadPlaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Location permission is required to find restaurants.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = position.coords;

      const overpassQuery = `
[out:json][timeout:25];
(
  node(around:5000,${latitude},${longitude})[amenity~"${AMENITY_TYPES}"];
  way(around:5000,${latitude},${longitude})[amenity~"${AMENITY_TYPES}"];
  relation(around:5000,${latitude},${longitude})[amenity~"${AMENITY_TYPES}"];
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
          const name = tags.name || tags.amenity || "Restaurant";
          return {
            id: String(element.id),
            name,
            category: tags.amenity || "restaurant",
            latitude: lat,
            longitude: lon,
            distanceMeters: haversineMeters(latitude, longitude, lat, lon),
            website: (tags.website || tags["contact:website"] || "").trim() || undefined,
            phone: (tags.phone || tags["contact:phone"] || "").trim() || undefined,
            openingHours: (tags.opening_hours || "").trim() || undefined,
          } as Place;
        })
        .filter(Boolean) as Place[];

      setPlaces(
        mapped
          .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
          .slice(0, 20)
      );
    } catch (err) {
      setError("Unable to load restaurants. Please try again.");
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
      <Modal
        visible={infoPlace !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoPlace(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setInfoPlace(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{infoPlace?.name}</Text>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Category</Text>
              <Text style={styles.modalValue}>{formatCategory(infoPlace?.category ?? "")}</Text>
            </View>
            {infoPlace?.phone && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>📞 Phone</Text>
                <Text
                  style={styles.modalLink}
                  onPress={() => Linking.openURL(`tel:${infoPlace.phone}`).catch(() => null)}
                >
                  {infoPlace.phone}
                </Text>
              </View>
            )}
            {infoPlace?.website && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>🌐 Website</Text>
                <Text
                  style={styles.modalLink}
                  onPress={() => Linking.openURL(infoPlace.website!).catch(() => null)}
                  numberOfLines={1}
                >
                  {infoPlace.website.replace(/^https?:\/\/(www\.)?/, "")}
                </Text>
              </View>
            )}
            {infoPlace?.openingHours && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>🕐 Hours</Text>
                <Text style={styles.modalValue}>{infoPlace.openingHours}</Text>
              </View>
            )}
            {!infoPlace?.phone && !infoPlace?.website && !infoPlace?.openingHours && (
              <Text style={styles.modalNoInfo}>No contact info available in OpenStreetMap for this place.</Text>
            )}
            <Pressable style={styles.modalClose} onPress={() => setInfoPlace(null)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>Eat nearby</Text>
        <Text style={styles.title}>Restaurants Near You</Text>
        <Text style={styles.subtitle}>Restaurants, cafés, fast food, bars, pubs, bakeries & more nearby.</Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={loadPlaces}>
        <Text style={styles.primaryButtonText}>
          {loading ? "Loading..." : "Find restaurants near me"}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>Searching nearby places…</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {places.length === 0 && !loading ? (
        <Text style={styles.bodyText}>
          No restaurants found yet. Try updating your location.
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
                <Text style={styles.metaText}>{formatCategory(place.category)}</Text>
              </View>
            </View>
            <View style={styles.placeRight}>
              <Text style={styles.metaText}>{formatDistance(place.distanceMeters)}</Text>
              <Pressable
                style={styles.infoButton}
                onPress={(e) => { e.stopPropagation(); setInfoPlace(place); }}
                hitSlop={8}
              >
                <Text style={styles.infoButtonText}>ⓘ</Text>
              </Pressable>
            </View>
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
    backgroundColor: "#7c2d12",
  },
  headerGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(249,115,22,0.55)",
    top: -80,
    right: -40,
  },
  headerGlowSecondary: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(244,63,94,0.45)",
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
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  subtitle: {
    color: "#c4b5fd",
    marginTop: 6,
    fontSize: 15,
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
  bodyText: {
    color: "#e2e8f0",
    fontSize: 15,
    marginBottom: 12,
  },
  metaText: {
    color: "#94a3b8",
    fontSize: 13,
  },
  placeRow: {
    backgroundColor: "#1b1030",
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2d1b4d",
    shadowColor: "#020617",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
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
  placeRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  infoButton: {
    padding: 2,
  },
  infoButtonText: {
    color: "#38bdf8",
    fontSize: 20,
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#1b1030",
    borderRadius: 18,
    padding: 22,
    width: "100%",
    borderWidth: 1,
    borderColor: "#2d1b4d",
    gap: 12,
  },
  modalTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  modalLabel: {
    color: "#94a3b8",
    fontSize: 13,
  },
  modalValue: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "right",
  },
  modalLink: {
    color: "#38bdf8",
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "right",
    textDecorationLine: "underline",
  },
  modalNoInfo: {
    color: "#64748b",
    fontSize: 13,
    fontStyle: "italic",
  },
  modalClose: {
    marginTop: 8,
    backgroundColor: "#38bdf8",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  modalCloseText: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 15,
  },
});
