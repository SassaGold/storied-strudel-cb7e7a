import { createElement, useCallback, useState } from "react";
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

export default function McScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parking, setParking] = useState<Place[]>([]);
  const [fuelStations, setFuelStations] = useState<Place[]>([]);
  const [workshops, setWorkshops] = useState<Place[]>([]);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const loadPlaces = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      setCoords({ latitude, longitude });

      const parkingQuery = `
[out:json][timeout:25];
(
  node(around:5000,${latitude},${longitude})[amenity=motorcycle_parking];
  way(around:5000,${latitude},${longitude})[amenity=motorcycle_parking];
  relation(around:5000,${latitude},${longitude})[amenity=motorcycle_parking];
  node(around:5000,${latitude},${longitude})[amenity=parking][parking=motorcycle];
  way(around:5000,${latitude},${longitude})[amenity=parking][parking=motorcycle];
  relation(around:5000,${latitude},${longitude})[amenity=parking][parking=motorcycle];
  node(around:5000,${latitude},${longitude})[amenity=parking_space][parking=motorcycle];
  way(around:5000,${latitude},${longitude})[amenity=parking_space][parking=motorcycle];
  relation(around:5000,${latitude},${longitude})[amenity=parking_space][parking=motorcycle];
);
out center 120;`;

      const fuelQuery = `
[out:json][timeout:25];
(
  node(around:5000,${latitude},${longitude})[amenity=fuel];
  way(around:5000,${latitude},${longitude})[amenity=fuel];
  relation(around:5000,${latitude},${longitude})[amenity=fuel];
);
out center 120;`;

      const workshopQuery = `
[out:json][timeout:25];
(
  node(around:5000,${latitude},${longitude})[shop~"motorcycle|motorcycle_repair|motorcycle_parts|car_repair"];
  way(around:5000,${latitude},${longitude})[shop~"motorcycle|motorcycle_repair|motorcycle_parts|car_repair"];
  relation(around:5000,${latitude},${longitude})[shop~"motorcycle|motorcycle_repair|motorcycle_parts|car_repair"];
);
out center 120;`;

      const [parkingData, fuelData, workshopData] = await Promise.all([
        fetchOverpass(parkingQuery),
        fetchOverpass(fuelQuery),
        fetchOverpass(workshopQuery),
      ]);

      const parkingResults = parkingData.elements
        ? mapElements(parkingData.elements, latitude, longitude, "Parking")
        : [];

      const fuelResults = fuelData.elements
        ? mapElements(fuelData.elements, latitude, longitude, "Fuel")
        : [];

      const workshopResults = workshopData.elements
        ? mapElements(
            workshopData.elements,
            latitude,
            longitude,
            "Motorbike workshop"
          )
        : [];

      setParking(
        parkingResults
          .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
          .slice(0, 20)
      );
      setFuelStations(
        fuelResults
          .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
          .slice(0, 20)
      );
      setWorkshops(
        workshopResults
          .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
          .slice(0, 20)
      );
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? `Unable to load motorcycle data (${err.message}). Please try again.`
          : "Unable to load motorcycle data. Please try again.";
      setError(message);
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
        <Text style={styles.headerBadge}>Ride nearby</Text>
        <Text style={styles.title}>Motorcycle Parking, Fuel & Workshops</Text>
        <Text style={styles.subtitle}>
          Motorcycle parking, fuel stations, and workshops nearby.
        </Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={loadPlaces}>
        <Text style={styles.primaryButtonText}>
          {loading
            ? "Loading..."
            : "Find motorcycle parking, fuel, and workshops"}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>Searching nearby places…</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {coords && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Map Preview</Text>
          {Platform.OS === "web"
            ? (() => {
                const { latitude: lat, longitude: lon } = coords;
                const bboxWest = lon - 0.015;
                const bboxSouth = lat - 0.01;
                const bboxEast = lon + 0.015;
                const bboxNorth = lat + 0.01;
                return createElement("iframe", {
                  src: `https://www.openstreetmap.org/export/embed.html?bbox=${bboxWest},${bboxSouth},${bboxEast},${bboxNorth}&layer=mapnik&marker=${lat},${lon}`,
                  style: { width: "100%", height: 180, border: "none", borderRadius: 12, display: "block" },
                  title: "OpenStreetMap",
                });
              })()
            : (
                <ExpoImage
                  source={{ uri: `https://staticmap.openstreetmap.de/staticmap.php?center=${coords.latitude},${coords.longitude}&zoom=15&size=600x300&maptype=mapnik&markers=${coords.latitude},${coords.longitude},red-pushpin` }}
                  style={styles.mapImage}
                  contentFit="cover"
                />
              )}
          <Text style={styles.attributionText}>© OpenStreetMap contributors</Text>
        </View>
      )}

      <View style={styles.sectionCard}>
        <Text style={styles.cardTitle}>Motorcycle Parking</Text>
        {parking.length === 0 && !loading ? (
          <Text style={styles.bodyText}>
            No motorcycle parking found yet. Try updating your location.
          </Text>
        ) : (
          parking.map((place) => (
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

      <View style={styles.sectionCard}>
        <Text style={styles.cardTitle}>Fuel Stations</Text>
        {fuelStations.length === 0 && !loading ? (
          <Text style={styles.bodyText}>
            No fuel stations found yet. Try updating your location.
          </Text>
        ) : (
          fuelStations.map((place) => (
            <Pressable
              key={place.id}
              style={styles.placeRow}
              onPress={() => openInMaps(place)}
            >
              <View style={styles.placeInfo}>
                <Text style={styles.bodyText}>{place.name}</Text>
                <Text style={styles.metaText}>{place.category}</Text>
              </View>
              <Text style={styles.metaText}>
                {formatDistance(place.distanceMeters)}
              </Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.cardTitle}>MC Stores and Workshop</Text>
        {workshops.length === 0 && !loading ? (
          <Text style={styles.bodyText}>
            No motorbike workshops found yet. Try updating your location.
          </Text>
        ) : (
          workshops.map((place) => (
            <Pressable
              key={place.id}
              style={styles.placeRow}
              onPress={() => openInMaps(place)}
            >
              <View style={styles.placeInfo}>
                <Text style={styles.bodyText}>{place.name}</Text>
                <Text style={styles.metaText}>{place.category}</Text>
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
    backgroundColor: "#14532d",
  },
  headerGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(34,197,94,0.5)",
    top: -80,
    right: -40,
  },
  headerGlowSecondary: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(20,184,166,0.45)",
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
    color: "#ffffff",
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
  sectionCard: {
    backgroundColor: "#1b1030",
    padding: 14,
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
  cardTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "600",
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
    backgroundColor: "#140c24",
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2d1b4d",
    shadowColor: "#020617",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
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
  highlightTag: {
    color: "#22c55e",
    fontSize: 12,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#1b1030",
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  mapImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  attributionText: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 6,
  },
});
