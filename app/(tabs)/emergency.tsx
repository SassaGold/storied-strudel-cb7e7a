import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";
// Safely load AsyncStorage: the native implementation throws at module-evaluation
// time when "RNCAsyncStorage" isn't registered (Expo Go / older dev builds).
// Using require() in try/catch means the screen still loads; the existing
// try/catch wrappers inside loadPlaces already handle AsyncStorage === null.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage: any = (() => { try { return require("@react-native-async-storage/async-storage").default; } catch { return null; } })();

type OverpassElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** Maximum results to fetch from Overpass API (balances response time vs. coverage) */
const MAX_RESULTS = 80;

type Place = {
  id: string;
  name: string;
  category: string;
  distanceMeters?: number;
  latitude: number;
  longitude: number;
  website?: string;
  phone?: string;
  address?: string;
  openingHours?: string;
};

const haversineMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const AMENITY_TYPES =
  "hospital|police|fire_station|pharmacy|clinic|doctors|ambulance_station";

const CATEGORY_FILTERS = [
  { key: "all", label: "🔎 All" },
  { key: "hospital", label: "🏥 Hospital" },
  { key: "police", label: "👮 Police" },
  { key: "fire_station", label: "🚒 Fire" },
  { key: "pharmacy", label: "💊 Pharmacy" },
];

const categoryLabel: Record<string, string> = {
  hospital: "🏥 Hospital",
  police: "👮 Police",
  fire_station: "🚒 Fire Station",
  pharmacy: "💊 Pharmacy",
  clinic: "🏨 Clinic",
  doctors: "👨‍⚕️ Doctor",
  ambulance_station: "🚑 Ambulance",
};

const formatCategory = (cat: string) =>
  categoryLabel[cat] ??
  `🔴 ${cat
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")}`;

const formatDistance = (d?: number) => {
  if (d === undefined) return "";
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
};

const EMERGENCY_NUMBERS = [
  { region: "EU / Intl", number: "112", emoji: "🌍" },
  { region: "USA / CA", number: "911", emoji: "🇺🇸" },
  { region: "UK", number: "999", emoji: "🇬🇧" },
  { region: "Australia", number: "000", emoji: "🇦🇺" },
  { region: "NZ", number: "111", emoji: "🇳🇿" },
];

/** Initiates a phone call, showing an alert if the device cannot handle it. */
const callNumber = (number: string) => {
  Linking.canOpenURL(`tel:${number}`)
    .then((supported) => {
      if (supported) {
        return Linking.openURL(`tel:${number}`);
      }
      Alert.alert(
        "Cannot Place Call",
        `Your device does not support calling. Please dial ${number} manually.`,
        [{ text: "OK" }]
      );
    })
    .catch(() => {
      Alert.alert(
        "Call Failed",
        `Could not start a call to ${number}. Please dial manually.`,
        [{ text: "OK" }]
      );
    });
};

const CACHE_KEY = "cache_emergency";

export default function EmergencyScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState("all");
  const [infoPlace, setInfoPlace] = useState<Place | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const shareLocation = useCallback(async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission required", "Location permission is needed to share your location.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = pos.coords;
      const mapsLink = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
      await Share.share({
        message: `🏍️ My current location:\n${mapsLink}\n\nCoordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      });
    } catch {
      Alert.alert("Share Failed", "Could not share your location. Please try again.");
    }
  }, []);

  const loadPlaces = useCallback(async () => {
    // Load cache so user sees last-known results immediately while fetching
    try {
      const cacheKey = CACHE_KEY;
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        const cached: Place[] = JSON.parse(raw);
        if (cached.length > 0) {
          setPlaces(cached);
          setFromCache(true);
        }
      }
    } catch {}
    setLoading(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setError(
          "Location permission is required to find emergency services."
        );
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = pos.coords;
      setUserLocation({ latitude, longitude });

      const overpassQuery = `
[out:json][timeout:30];
(
  node(around:10000,${latitude},${longitude})[amenity~"${AMENITY_TYPES}"];
  way(around:10000,${latitude},${longitude})[amenity~"${AMENITY_TYPES}"];
  relation(around:10000,${latitude},${longitude})[amenity~"${AMENITY_TYPES}"];
);
out center ${MAX_RESULTS};`;

      // Overpass API (OpenStreetMap) — free POI data, no API key required
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

      const mapped = (data.elements as OverpassElement[])
        .map((el: OverpassElement) => {
          const lat = el.lat ?? el.center?.lat;
          const lon = el.lon ?? el.center?.lon;
          if (lat === undefined || lon === undefined) return null;
          const tags = el.tags ?? {};
          const name = tags.name || tags.amenity || "Emergency Service";
          return {
            id: String(el.id),
            name,
            category: tags.amenity || "other",
            latitude: lat,
            longitude: lon,
            distanceMeters: haversineMeters(latitude, longitude, lat, lon),
            phone:
              (
                tags.phone ||
                tags["contact:phone"] ||
                tags["contact:mobile"] ||
                ""
              ).trim() || undefined,
            address:
              [
                tags["addr:housenumber"],
                tags["addr:street"],
                tags["addr:city"],
              ]
                .filter(Boolean)
                .join(" ") || undefined,
            openingHours: (tags.opening_hours || "").trim() || undefined,
            website:
              (tags.website || tags["contact:website"] || "").trim() ||
              undefined,
          } as Place;
        })
        .filter(Boolean) as Place[];

      const sorted = mapped
        .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
        .slice(0, 40);
      setPlaces(sorted);
      setFromCache(false);
      try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(sorted)); } catch {}
    } catch (err) {
      const isNetwork = err instanceof TypeError && String(err).includes("fetch");
      setError(
        isNetwork
          ? "Network error — check your connection and try again."
          : "Unable to load emergency services. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered =
    selected === "all"
      ? places
      : places.filter((p) => p.category === selected);

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}
    >
      {/* Info Modal */}
      <Modal
        visible={infoPlace !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoPlace(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setInfoPlace(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{infoPlace?.name}</Text>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Type</Text>
              <Text style={styles.modalValue}>
                {formatCategory(infoPlace?.category ?? "")}
              </Text>
            </View>
            {infoPlace?.distanceMeters !== undefined && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Distance</Text>
                <Text style={styles.modalValue}>
                  {formatDistance(infoPlace.distanceMeters)}
                </Text>
              </View>
            )}
            {infoPlace?.phone && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>📞 Phone</Text>
                <Text
                  style={styles.modalLink}
                  onPress={() => callNumber(infoPlace.phone!)}
                >
                  {infoPlace.phone}
                </Text>
              </View>
            )}
            {infoPlace?.address && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>📍 Address</Text>
                <Text style={styles.modalValue}>{infoPlace.address}</Text>
              </View>
            )}
            {infoPlace?.openingHours && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>🕐 Hours</Text>
                <Text style={styles.modalValue}>{infoPlace.openingHours}</Text>
              </View>
            )}
            {infoPlace?.website && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>🌐 Website</Text>
                <Text
                  style={styles.modalLink}
                  numberOfLines={1}
                  onPress={() =>
                    Linking.openURL(infoPlace.website!).catch(() => null)
                  }
                >
                  {infoPlace.website.replace(/^https?:\/\/(www\.)?/, "")}
                </Text>
              </View>
            )}
            {!infoPlace?.phone &&
              !infoPlace?.address &&
              !infoPlace?.website && (
                <Text style={styles.modalNoInfo}>
                  No contact info available in OpenStreetMap for this location.
                </Text>
              )}
            <View style={styles.modalActions}>
              {infoPlace?.phone && (
                <Pressable
                  style={[styles.modalActionButton, styles.modalCallButton]}
                  onPress={() => callNumber(infoPlace.phone!)}
                >
                  <Text
                    style={[
                      styles.modalActionButtonText,
                      styles.modalCallButtonText,
                    ]}
                  >
                    📞 CALL NOW
                  </Text>
                </Pressable>
              )}
              <Pressable
                style={styles.modalActionButton}
                onPress={() =>
                  Linking.openURL(
                    `https://www.google.com/maps/search/?api=1&query=${infoPlace?.latitude},${infoPlace?.longitude}`
                  ).catch(() => null)
                }
              >
                <Text style={styles.modalActionButtonText}>
                  🗺️ Navigate There
                </Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.modalClose}
              onPress={() => setInfoPlace(null)}
            >
              <Text style={styles.modalCloseText}>CLOSE</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>🆘 EMERGENCY</Text>
        <Text style={styles.title}>SOS</Text>
        <Text style={styles.subtitle}>
          Police, hospitals & emergency services near you.
        </Text>
      </View>

      {/* Universal emergency numbers */}
      <View style={styles.sosCard}>
        <Text style={styles.sosCardTitle}>⚡ UNIVERSAL EMERGENCY NUMBERS</Text>
        <View style={styles.sosNumbersGrid}>
          {EMERGENCY_NUMBERS.map((item) => (
            <Pressable
              key={item.number}
              style={styles.sosNumberButton}
              onPress={() => callNumber(item.number)}
            >
              <Text style={styles.sosNumberEmoji}>{item.emoji}</Text>
              <Text style={styles.sosNumber}>{item.number}</Text>
              <Text style={styles.sosRegion}>{item.region}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.shareButton} onPress={shareLocation}>
          <Text style={styles.shareButtonText}>📍 Share My Location</Text>
        </Pressable>
      </View>
      <Pressable
        style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
        onPress={loadPlaces}
        disabled={loading}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? "Searching..." : "FIND NEARBY EMERGENCY SERVICES"}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#ef4444" />
          <Text style={styles.loadingText}>Searching within 10 km…</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Cache banner */}
      {fromCache && places.length > 0 && (
        <View style={styles.cacheBanner}>
          <Text style={styles.cacheBannerText}>📡 Showing cached results — tap refresh for latest</Text>
        </View>
      )}

      {/* View mode toggle */}
      {places.length > 0 && (
        <View style={styles.viewToggleRow}>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "list" && styles.viewToggleBtnActive]}
            onPress={() => setViewMode("list")}
          >
            <Text style={[styles.viewToggleText, viewMode === "list" && styles.viewToggleTextActive]}>☰ List</Text>
          </Pressable>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "map" && styles.viewToggleBtnActive]}
            onPress={() => setViewMode("map")}
          >
            <Text style={[styles.viewToggleText, viewMode === "map" && styles.viewToggleTextActive]}>🗺️ Map</Text>
          </Pressable>
        </View>
      )}

      {/* Map view */}
      {viewMode === "map" && userLocation && (
        <MapView
          style={styles.mapView}
          showsUserLocation
          initialRegion={{
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: 0.06,
            longitudeDelta: 0.06,
          }}
        >
          {filtered.map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.latitude, longitude: place.longitude }}
              title={place.name}
              onPress={() => setInfoPlace(place)}
            />
          ))}
        </MapView>
      )}

      {places.length > 0 && (
        <>
          {/* Category filter */}
          <View style={styles.segmentRow}>
            {CATEGORY_FILTERS.map((f) => (
              <Pressable
                key={f.key}
                style={[
                  styles.segmentButton,
                  selected === f.key && styles.segmentButtonActive,
                ]}
                onPress={() => setSelected(f.key)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    selected === f.key && styles.segmentTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Result card */}
          <View style={styles.sectionCard}>
            <Text style={styles.cardTitle}>
              {selected === "all"
                ? "All Nearby Services"
                : CATEGORY_FILTERS.find((f) => f.key === selected)?.label ??
                  "Nearby"}
            </Text>
            <Text style={styles.cardDescription}>
              Sorted by distance · Within 10 km
            </Text>
            {viewMode === "list" && (
              filtered.length === 0 ? (
                <Text style={styles.bodyText}>
                  None found in this category nearby.
                </Text>
              ) : (
                filtered.map((place) => (
                  <View key={place.id} style={styles.placeRow}>
                    <View style={styles.placeInfo}>
                      <Text style={styles.placeName} numberOfLines={1}>
                        {place.name}
                      </Text>
                      <View style={styles.tagRow}>
                        <Text style={styles.categoryTag}>
                          {formatCategory(place.category)}
                        </Text>
                      </View>
                      {place.address ? (
                        <Text style={styles.placeAddress} numberOfLines={1}>
                          {place.address}
                        </Text>
                      ) : null}
                      {place.phone ? (
                        <Text
                          style={styles.placePhone}
                          onPress={() => callNumber(place.phone!)}
                        >
                          📞 {place.phone}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.placeRight}>
                      <Text style={styles.distanceText}>
                        {formatDistance(place.distanceMeters)}
                      </Text>
                      <Pressable
                        style={styles.infoButton}
                        onPress={() => setInfoPlace(place)}
                      >
                        <Text style={styles.infoButtonText}>ⓘ</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )
            )}
          </View>
        </>
      )}

      {!loading && places.length === 0 && !error && (
        <Text style={styles.bodyText}>
          No emergency services found yet. Tap the button above to search.
        </Text>
      )}
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
  // ── Header ──────────────────────────────────────────────────────────
  header: {
    marginTop: 18,
    marginBottom: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
    overflow: "hidden",
    backgroundColor: "#1a0000",
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
    backgroundColor: "rgba(180,0,0,0.40)",
    bottom: -60,
    left: -20,
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(239,68,68,0.18)",
    color: "#ef4444",
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
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: 4,
  },
  subtitle: {
    color: "#c8c8c8",
    marginTop: 6,
    fontSize: 15,
  },
  // ── SOS card ────────────────────────────────────────────────────────
  sosCard: {
    backgroundColor: "#1a0000",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
    padding: 14,
    marginBottom: 16,
  },
  sosCardTitle: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  sosNumbersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sosNumberButton: {
    flex: 1,
    minWidth: 60,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 2,
  },
  sosNumberEmoji: {
    fontSize: 18,
  },
  sosNumber: {
    color: "#ef4444",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 1,
  },
  sosRegion: {
    color: "#888888",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  // ── Buttons ─────────────────────────────────────────────────────────
  primaryButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 13,
    borderRadius: 6,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#ef4444",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  // ── Loading / Error ──────────────────────────────────────────────────
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
  bodyText: {
    color: "#888888",
    fontSize: 14,
    fontStyle: "italic",
  },
  // ── Category pills ───────────────────────────────────────────────────
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  segmentButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: "center",
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  segmentButtonActive: {
    backgroundColor: "#ef4444",
    borderColor: "#ef4444",
  },
  segmentText: {
    color: "#666666",
    fontSize: 12,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#ffffff",
  },
  // ── Section card ─────────────────────────────────────────────────────
  sectionCard: {
    backgroundColor: "#141414",
    padding: 16,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    shadowColor: "#000000",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
    letterSpacing: 1,
  },
  cardDescription: {
    color: "#555555",
    fontSize: 12,
    marginBottom: 14,
  },
  // ── Place row ────────────────────────────────────────────────────────
  placeRow: {
    backgroundColor: "#0a0a0a",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderLeftWidth: 3,
    borderLeftColor: "#ef4444",
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  placeInfo: {
    flex: 1,
    marginRight: 12,
    gap: 3,
  },
  placeName: {
    color: "#f0f0f0",
    fontSize: 14,
    fontWeight: "700",
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  categoryTag: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "600",
  },
  placeAddress: {
    color: "#666666",
    fontSize: 12,
  },
  placePhone: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  placeRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  distanceText: {
    color: "#888888",
    fontSize: 12,
    fontWeight: "600",
  },
  infoButton: {
    padding: 2,
  },
  infoButtonText: {
    color: "#ef4444",
    fontSize: 20,
    lineHeight: 22,
  },
  // ── Modal ────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#141414",
    borderRadius: 10,
    padding: 22,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
    gap: 12,
  },
  modalTitle: {
    color: "#ffffff",
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
    color: "#666666",
    fontSize: 13,
  },
  modalValue: {
    color: "#c8c8c8",
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "right",
  },
  modalLink: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "right",
    textDecorationLine: "underline",
  },
  modalNoInfo: {
    color: "#555555",
    fontSize: 13,
    fontStyle: "italic",
  },
  modalActions: {
    gap: 8,
  },
  modalActionButton: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
  },
  modalCallButton: {
    backgroundColor: "#ef4444",
    borderColor: "#ef4444",
  },
  modalActionButtonText: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: "600",
  },
  modalCallButtonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },
  modalClose: {
    marginTop: 8,
    backgroundColor: "#ef4444",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
  },
  modalCloseText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },
  viewToggleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  viewToggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: "center",
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  viewToggleBtnActive: {
    backgroundColor: "#ef4444",
    borderColor: "#ef4444",
  },
  viewToggleText: {
    color: "#666666",
    fontSize: 14,
    fontWeight: "700",
  },
  viewToggleTextActive: {
    color: "#ffffff",
  },
  mapView: {
    width: "100%",
    height: 340,
    borderRadius: 10,
    marginBottom: 12,
    overflow: "hidden",
  },
  cacheBanner: {
    backgroundColor: "rgba(255,153,0,0.12)",
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,153,0,0.3)",
  },
  cacheBannerText: {
    color: "#f59e0b",
    fontSize: 13,
    fontWeight: "500",
  },
  shareButton: {
    marginTop: 10,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: 6,
    paddingVertical: 9,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
  },
  shareButtonText: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: "700",
  },
});
