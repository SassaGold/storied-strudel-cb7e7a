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
  note?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  openingHours?: string;
  wikipedia?: string;
};

// Overpass API endpoints — free OpenStreetMap data, no API key required (mirrors for reliability)
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
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

const parseWikiTag = (tag: string) => {
  const colonIdx = tag.indexOf(":");
  return {
    lang: colonIdx > 0 ? tag.slice(0, colonIdx) : "en",
    title: (colonIdx > 0 ? tag.slice(colonIdx + 1) : tag).replace(/ /g, "_"),
  };
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
        tags.shop || tags.amenity || tags.tourism || tags.club || tags.leisure || tags.craft || fallbackCategory;
      return {
        id: String(element.id),
        name,
        category,
        latitude: lat,
        longitude: lon,
        distanceMeters: haversineMeters(latitude, longitude, lat, lon),
        note,
        website: (tags.website || tags["contact:website"] || "").trim() || undefined,
        phone: (tags.phone || tags["contact:phone"] || "").trim() || undefined,
        email: (tags.email || tags["contact:email"] || "").trim() || undefined,
        address: [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean).join(" ") || undefined,
        openingHours: (tags.opening_hours || "").trim() || undefined,
        wikipedia: (tags.wikipedia || "").trim() || undefined,
      } as Place;
    })
    .filter(Boolean) as Place[];

// Per-category fetch timeouts must exceed the Overpass server-side [timeout:N] value.
// All categories use [timeout:25-30]; add a ~15 s buffer each.
const CATEGORY_FETCH_TIMEOUT_MS: Record<string, number> = {
  services: 40000,     // Overpass [timeout:25] + 15 s buffer
  fuel: 40000,         // Overpass [timeout:25] + 15 s buffer
  parking: 40000,      // Overpass [timeout:25] + 15 s buffer
  clubs_tracks: 45000, // Overpass [timeout:30] + 15 s buffer
};
const DEFAULT_FETCH_TIMEOUT_MS = 45000;

const fetchOverpass = async (query: string, timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS) => {
  let lastError: string | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        lastError = `Overpass error ${response.status}`;
        continue;
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      lastError =
        err instanceof Error && err.name === "AbortError"
          ? "Timeout"
          : "Network error";
    }
  }

  throw new Error(lastError ?? "Overpass request failed");
};

type Category = "services" | "fuel" | "parking" | "clubs_tracks";

const CATEGORY_RADIUS_M = {
  services: 30000,
  fuel: 20000,
  parking_general: 5000,
  parking_moto: 10000,
  clubs_tracks: 50000,
} as const;

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "services", label: "🏍️ MC Services" },
  { key: "fuel", label: "⛽ Fuel Stations" },
  { key: "parking", label: "🅿️ Parking" },
  { key: "clubs_tracks", label: "🏁 Clubs & Tracks" },
];

export default function McScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Category>("services");
  const [places, setPlaces] = useState<Place[]>([]);
  const [infoPlace, setInfoPlace] = useState<Place | null>(null);
  const [wikiExtract, setWikiExtract] = useState<string | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);

  const buildQuery = (category: Category, lat: number, lon: number) => {
    if (category === "services") {
      const r = CATEGORY_RADIUS_M.services;
      return `
[out:json][timeout:25];
(
  node(around:${r},${lat},${lon})[shop=motorcycle];
  way(around:${r},${lat},${lon})[shop=motorcycle];
  relation(around:${r},${lat},${lon})[shop=motorcycle];
  node(around:${r},${lat},${lon})[shop=motorbike];
  way(around:${r},${lat},${lon})[shop=motorbike];
  relation(around:${r},${lat},${lon})[shop=motorbike];
  node(around:${r},${lat},${lon})[shop=motor_vehicle][motorcycle=yes];
  way(around:${r},${lat},${lon})[shop=motor_vehicle][motorcycle=yes];
  relation(around:${r},${lat},${lon})[shop=motor_vehicle][motorcycle=yes];
  node(around:${r},${lat},${lon})[shop=motorcycle_repair];
  way(around:${r},${lat},${lon})[shop=motorcycle_repair];
  relation(around:${r},${lat},${lon})[shop=motorcycle_repair];
  node(around:${r},${lat},${lon})[craft=motorcycle_repair];
  way(around:${r},${lat},${lon})[craft=motorcycle_repair];
  relation(around:${r},${lat},${lon})[craft=motorcycle_repair];
  node(around:${r},${lat},${lon})[shop=motorcycle_parts];
  way(around:${r},${lat},${lon})[shop=motorcycle_parts];
  relation(around:${r},${lat},${lon})[shop=motorcycle_parts];
  node(around:${r},${lat},${lon})[shop=motorbike_parts];
  way(around:${r},${lat},${lon})[shop=motorbike_parts];
  relation(around:${r},${lat},${lon})[shop=motorbike_parts];
  node(around:${r},${lat},${lon})[shop=motorcycle_accessories];
  way(around:${r},${lat},${lon})[shop=motorcycle_accessories];
  relation(around:${r},${lat},${lon})[shop=motorcycle_accessories];
  node(around:${r},${lat},${lon})[amenity=motorcycle_rental];
  way(around:${r},${lat},${lon})[amenity=motorcycle_rental];
  relation(around:${r},${lat},${lon})[amenity=motorcycle_rental];
  node(around:${r},${lat},${lon})[shop=motorcycle_rental];
  way(around:${r},${lat},${lon})[shop=motorcycle_rental];
  relation(around:${r},${lat},${lon})[shop=motorcycle_rental];
  node(around:${r},${lat},${lon})[craft=car_repair][motorcycle=yes];
  way(around:${r},${lat},${lon})[craft=car_repair][motorcycle=yes];
  relation(around:${r},${lat},${lon})[craft=car_repair][motorcycle=yes];
  node(around:${r},${lat},${lon})[amenity=car_repair][motorcycle=yes];
  way(around:${r},${lat},${lon})[amenity=car_repair][motorcycle=yes];
  relation(around:${r},${lat},${lon})[amenity=car_repair][motorcycle=yes];
);
out center 120;`;
    }
    if (category === "fuel") {
      const r = CATEGORY_RADIUS_M.fuel;
      return `
[out:json][timeout:25];
(
  node(around:${r},${lat},${lon})[amenity=fuel];
  way(around:${r},${lat},${lon})[amenity=fuel];
  relation(around:${r},${lat},${lon})[amenity=fuel];
);
out center 120;`;
    }
    if (category === "parking") {
      const rg = CATEGORY_RADIUS_M.parking_general;
      const rm = CATEGORY_RADIUS_M.parking_moto;
      return `
[out:json][timeout:25];
(
  node(around:${rg},${lat},${lon})[amenity=parking];
  way(around:${rg},${lat},${lon})[amenity=parking];
  relation(around:${rg},${lat},${lon})[amenity=parking];
  node(around:${rm},${lat},${lon})[amenity=motorcycle_parking];
  way(around:${rm},${lat},${lon})[amenity=motorcycle_parking];
  relation(around:${rm},${lat},${lon})[amenity=motorcycle_parking];
);
out center 120;`;
    }
    // clubs_tracks
    const r = CATEGORY_RADIUS_M.clubs_tracks;
    return `
[out:json][timeout:30];
(
  node(around:${r},${lat},${lon})[club=motorcycle];
  way(around:${r},${lat},${lon})[club=motorcycle];
  relation(around:${r},${lat},${lon})[club=motorcycle];
  node(around:${r},${lat},${lon})[leisure=motorcycle_track];
  way(around:${r},${lat},${lon})[leisure=motorcycle_track];
  relation(around:${r},${lat},${lon})[leisure=motorcycle_track];
  node(around:${r},${lat},${lon})[sport=motorcycling];
  way(around:${r},${lat},${lon})[sport=motorcycling];
  relation(around:${r},${lat},${lon})[sport=motorcycling];
);
out center 120;`;
  };

  const fallbackLabel = (category: Category) => {
    if (category === "services") return "MC Service";
    if (category === "fuel") return "Fuel Station";
    if (category === "parking") return "Parking";
    return "MC Club / Track";
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
      const data = await fetchOverpass(query, CATEGORY_FETCH_TIMEOUT_MS[selected] ?? DEFAULT_FETCH_TIMEOUT_MS);
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
    const url = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
    Linking.openURL(url).catch(() => null);
  }, []);

  const openInfo = useCallback((place: Place) => {
    setInfoPlace(place);
    setWikiExtract(null);
    if (place.wikipedia) {
      setWikiLoading(true);
      const { lang, title } = parseWikiTag(place.wikipedia);
      // Wikipedia REST API — free, no API key required
      fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
        .then((r) => r.json())
        .then((data) => setWikiExtract((data.extract || "").trim() || null))
        .catch(() => setWikiExtract(null))
        .finally(() => setWikiLoading(false));
    }
  }, []);

  const SECTION_TITLES: Record<Category, string> = {
    services: "MC Services",
    fuel: "Fuel Stations",
    parking: "Parking",
    clubs_tracks: "Clubs & Tracks",
  };

  const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
    services: `Searches within ${CATEGORY_RADIUS_M.services / 1000} km for motorcycle dealers, repair workshops, parts & accessories shops, and rental shops.`,
    fuel: `Searches within ${CATEGORY_RADIUS_M.fuel / 1000} km for all fuel/petrol stations.`,
    parking: `Searches within ${CATEGORY_RADIUS_M.parking_general / 1000} km for general parking and within ${CATEGORY_RADIUS_M.parking_moto / 1000} km for dedicated motorcycle parking.`,
    clubs_tracks: `Searches within ${CATEGORY_RADIUS_M.clubs_tracks / 1000} km for motorcycle clubs and racing/riding tracks.`,
  };

  const EMPTY_TEXTS: Record<Category, string> = {
    services: "No MC dealers, workshops, shops, or rentals found yet. Try updating your location.",
    fuel: "No fuel stations found yet. Try updating your location.",
    parking: "No parking found yet. Try updating your location.",
    clubs_tracks: "No MC clubs or tracks found within 50 km. Try updating your location.",
  };

  const sectionTitle = SECTION_TITLES[selected];
  const sectionDescription = CATEGORY_DESCRIPTIONS[selected];
  const emptyText = EMPTY_TEXTS[selected];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Modal
        visible={infoPlace !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setInfoPlace(null); setWikiExtract(null); }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { setInfoPlace(null); setWikiExtract(null); }}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{infoPlace?.name}</Text>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Category</Text>
              <Text style={styles.modalValue}>{infoPlace?.category}</Text>
            </View>
            {infoPlace?.note && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Note</Text>
                <Text style={styles.modalValue}>{infoPlace.note}</Text>
              </View>
            )}
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
            {infoPlace?.email && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>📧 Email</Text>
                <Text
                  style={styles.modalLink}
                  onPress={() => Linking.openURL(`mailto:${infoPlace.email}`).catch(() => null)}
                  numberOfLines={1}
                >
                  {infoPlace.email}
                </Text>
              </View>
            )}
            {infoPlace?.address && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>📍 Address</Text>
                <Text style={styles.modalValue}>{infoPlace.address}</Text>
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
            {!infoPlace?.phone && !infoPlace?.website && !infoPlace?.openingHours && !infoPlace?.email && !infoPlace?.address && (
              <Text style={styles.modalNoInfo}>No contact info available for this place in OpenStreetMap (free open data).</Text>
            )}
            {infoPlace?.wikipedia && wikiLoading && (
              <Text style={styles.modalLoadingText}>Loading from Wikipedia…</Text>
            )}
            {wikiExtract && (
              <View style={styles.modalWikiSection}>
                <Text style={styles.modalWikiLabel}>📖 From Wikipedia</Text>
                <Text style={styles.modalWikiExtract} numberOfLines={5}>{wikiExtract}</Text>
              </View>
            )}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalActionButton}
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(infoPlace?.name ?? "")}`).catch(() => null)}
              >
                <Text style={styles.modalActionButtonText}>⭐ Reviews on Google Maps</Text>
              </Pressable>
              {infoPlace?.wikipedia && (
                <Pressable
                  style={[styles.modalActionButton, styles.modalActionButtonWiki]}
                  onPress={() => {
                    const { lang, title } = parseWikiTag(infoPlace.wikipedia!);
                    Linking.openURL(`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`).catch(() => null);
                  }}
                >
                  <Text style={[styles.modalActionButtonText, styles.modalActionButtonTextWiki]}>📖 Read on Wikipedia</Text>
                </Pressable>
              )}
            </View>
            <Pressable style={styles.modalClose} onPress={() => { setInfoPlace(null); setWikiExtract(null); }}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>Ride nearby</Text>
        <Text style={styles.title}>MC Services, Fuel, Parking, Clubs & Tracks</Text>
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
        <Text style={styles.cardDescription}>{sectionDescription}</Text>
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
              <View style={styles.placeRight}>
                <Text style={styles.metaText}>
                  {formatDistance(place.distanceMeters)}
                </Text>
                <Pressable
                  style={styles.infoButton}
                  onPress={(e) => { e.stopPropagation(); openInfo(place); }}
                  hitSlop={8}
                >
                  <Text style={styles.infoButtonText}>ⓘ</Text>
                </Pressable>
              </View>
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
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  segmentButton: {
    paddingVertical: 10,
    paddingHorizontal: 10,
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
    marginBottom: 4,
    letterSpacing: 0.1,
  },
  cardDescription: {
    color: "#64748b",
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
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
    backgroundColor: "#0a1626",
    borderRadius: 18,
    padding: 22,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.25)",
    gap: 12,
  },
  modalTitle: {
    color: "#f1f5f9",
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
    color: "#60a5fa",
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "right",
    textDecorationLine: "underline",
  },
  modalNoInfo: {
    color: "#475569",
    fontSize: 13,
    fontStyle: "italic",
  },
  modalLoadingText: {
    color: "#64748b",
    fontSize: 13,
    fontStyle: "italic",
  },
  modalWikiSection: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  modalWikiLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
  },
  modalWikiExtract: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    fontStyle: "italic",
  },
  modalActions: {
    gap: 8,
  },
  modalActionButton: {
    backgroundColor: "rgba(96,165,250,0.12)",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.3)",
  },
  modalActionButtonWiki: {
    backgroundColor: "rgba(250,204,21,0.1)",
    borderColor: "rgba(250,204,21,0.3)",
  },
  modalActionButtonText: {
    color: "#60a5fa",
    fontSize: 14,
    fontWeight: "600",
  },
  modalActionButtonTextWiki: {
    color: "#fbbf24",
  },
  modalClose: {
    marginTop: 8,
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  modalCloseText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
});
