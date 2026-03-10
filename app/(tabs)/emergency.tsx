const AsyncStorage: any = (() => {
  try { return require("@react-native-async-storage/async-storage").default; }
  catch { return null; }
})();

const rnMaps: any = (() => {
  try { return require("react-native-maps"); }
  catch { return null; }
})();
const PROVIDER_GOOGLE = rnMaps?.PROVIDER_GOOGLE ?? null;

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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haversineMeters, fetchOverpass, CACHE_TTL_MS, formatDistance } from "../../lib/overpass";

const CACHE_KEY = "cache_emergency_v2";

type Place = {
  id: string;
  name: string;
  category: string;
  distanceMeters?: number;
  latitude: number;
  longitude: number;
};

export default function EmergencyScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hospitals, setHospitals] = useState<Place[]>([]);
  const [pharmacies, setPharmacies] = useState<Place[]>([]);
  const [policeAndFire, setPoliceAndFire] = useState<Place[]>([]);

  const loadPlaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status === "denied") {
        setError("Location permission is required to find emergency services.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = position.coords;

      const raw = await AsyncStorage?.getItem(CACHE_KEY);
      if (raw) {
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts < CACHE_TTL_MS) {
          setHospitals(data.hospitals);
          setPharmacies(data.pharmacies);
          setPoliceAndFire(data.policeAndFire);
          return;
        }
      }

      const overpassQuery = `
[out:json][timeout:25];
(
  node(around:5000,${latitude},${longitude})[amenity~"hospital|doctors|clinic"];
  way(around:5000,${latitude},${longitude})[amenity~"hospital|doctors|clinic"];
  node(around:5000,${latitude},${longitude})[amenity=pharmacy];
  way(around:5000,${latitude},${longitude})[amenity=pharmacy];
  node(around:5000,${latitude},${longitude})[amenity~"police|fire_station"];
  way(around:5000,${latitude},${longitude})[amenity~"police|fire_station"];
);
out center 100;`;

      const data = await fetchOverpass(overpassQuery);

      if (!data.elements) {
        setHospitals([]);
        setPharmacies([]);
        setPoliceAndFire([]);
        return;
      }

      const mapElement = (element: any): Place | null => {
        const lat = element.lat ?? element.center?.lat;
        const lon = element.lon ?? element.center?.lon;
        if (lat === undefined || lon === undefined) return null;
        const tags = element.tags ?? {};
        const name = tags.name || tags.amenity || "Place";
        return {
          id: String(element.id),
          name,
          category: tags.amenity || "service",
          latitude: lat,
          longitude: lon,
          distanceMeters: haversineMeters(latitude, longitude, lat, lon),
        };
      };

      const all = (data.elements as any[]).map(mapElement).filter(Boolean) as Place[];
      const sorted = all.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));

      const hospList = sorted.filter(p => ["hospital","doctors","clinic"].includes(p.category)).slice(0, 10);
      const pharmList = sorted.filter(p => p.category === "pharmacy").slice(0, 10);
      const pfList = sorted.filter(p => ["police","fire_station"].includes(p.category)).slice(0, 10);

      setHospitals(hospList);
      setPharmacies(pharmList);
      setPoliceAndFire(pfList);

      await AsyncStorage?.setItem(CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        data: { hospitals: hospList, pharmacies: pharmList, policeAndFire: pfList }
      }));
    } catch (err) {
      setError("Unable to load emergency services. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openInMaps = useCallback((place: Place) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
    Linking.openURL(url).catch(() => null);
  }, []);

  const renderSection = (title: string, items: Place[]) => {
    if (items.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {items.map((place) => (
          <Pressable key={place.id} style={styles.placeRow} onPress={() => openInMaps(place)}>
            <View style={styles.placeInfo}>
              <Text style={styles.bodyText}>{place.name}</Text>
              <Text style={styles.metaText}>{place.category}</Text>
            </View>
            <Text style={styles.metaText}>{formatDistance(place.distanceMeters)}</Text>
          </Pressable>
        ))}
      </View>
    );
  };

  const hasResults = hospitals.length > 0 || pharmacies.length > 0 || policeAndFire.length > 0;

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>Emergency</Text>
        <Text style={styles.title}>Emergency Services</Text>
        <Text style={styles.subtitle}>Find hospitals, pharmacies, police & fire nearby.</Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={loadPlaces}>
        <Text style={styles.primaryButtonText}>
          {loading ? "Loading..." : "Find emergency services near me"}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>Searching nearby places…</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

        <Text style={styles.bodyText}>
          No emergency services found yet. Try updating your location.
        </Text>
      )}

      {renderSection("Hospitals & Clinics", hospitals)}
      {renderSection("Pharmacies", pharmacies)}
      {renderSection("Police & Fire", policeAndFire)}
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
    marginBottom: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    backgroundColor: "#7f1d1d",
  },
  headerGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(239,68,68,0.55)",
    top: -80,
    right: -40,
  },
  headerGlowSecondary: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(220,38,38,0.45)",
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
    color: "#fca5a5",
    marginTop: 6,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#ef4444",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryButtonText: {
    color: "#fff",
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
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
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
});
