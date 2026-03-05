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
// Safely load react-native-maps: requires a custom dev/production build.
// In Expo Go or any environment where the native module isn't compiled in,
// MapView and Marker will be null and the map toggle is hidden automatically.
let rnMaps: any = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { rnMaps = require("react-native-maps"); } catch {}
const MapView: any = rnMaps?.default;
const Marker: any = rnMaps?.Marker;
// Safely load AsyncStorage: the native implementation throws at module-evaluation
// time when "RNCAsyncStorage" isn't registered (Expo Go / older dev builds).
// Using require() in try/catch means the screen still loads; the existing
// try/catch wrappers inside loadPlaces already handle AsyncStorage === null.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage: any = (() => { try { return require("@react-native-async-storage/async-storage").default; } catch { return null; } })();

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
  fuelTypes?: string[];
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

// OSM tags that indicate which fuel types a station carries
const FUEL_TYPE_TAGS: [string, string][] = [
  ["fuel:diesel", "Diesel"],
  ["fuel:octane_95", "95"],
  ["fuel:octane_98", "98"],
  ["fuel:lpg", "LPG"],
  ["fuel:cng", "CNG"],
  ["fuel:e10", "E10"],
  ["fuel:e85", "E85"],
  ["fuel:adblue", "AdBlue"],
  ["fuel:electric", "EV"],
];

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
      const fuelTypes: string[] = [];
      for (const [tag, label] of FUEL_TYPE_TAGS) {
        if (tags[tag] === "yes") fuelTypes.push(label);
      }
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
        fuelTypes: fuelTypes.length > 0 ? fuelTypes : undefined,
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
  atm_bank: 40000,     // Overpass [timeout:25] + 15 s buffer
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

type Category = "services" | "fuel" | "parking" | "clubs_tracks" | "atm_bank";

const CATEGORY_RADIUS_M = {
  services: 30000,
  fuel: 20000,
  parking_general: 5000,
  parking_moto: 10000,
  clubs_tracks: 50000,
  atm_bank: 5000,
} as const;

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "services", label: "🏍️ MC Services" },
  { key: "fuel", label: "⛽ Fuel Stations" },
  { key: "parking", label: "🅿️ Parking" },
  { key: "clubs_tracks", label: "🏁 Clubs & Tracks" },
  { key: "atm_bank", label: "🏧 ATMs & Banks" },
];

export default function McScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Category>("services");
  const [places, setPlaces] = useState<Place[]>([]);
  const [infoPlace, setInfoPlace] = useState<Place | null>(null);
  const [wikiExtract, setWikiExtract] = useState<string | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [fromCache, setFromCache] = useState(false);

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
    if (category === "clubs_tracks") {
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
    }
    // atm_bank
    const r = CATEGORY_RADIUS_M.atm_bank;
    return `
[out:json][timeout:25];
(
  node(around:${r},${lat},${lon})[amenity=atm];
  way(around:${r},${lat},${lon})[amenity=atm];
  node(around:${r},${lat},${lon})[amenity=bank];
  way(around:${r},${lat},${lon})[amenity=bank];
  relation(around:${r},${lat},${lon})[amenity=bank];
);
out center 120;`;
  };

  const fallbackLabel = (category: Category) => {
    if (category === "services") return "MC Service";
    if (category === "fuel") return "Fuel Station";
    if (category === "parking") return "Parking";
    if (category === "atm_bank") return "ATM / Bank";
    return "MC Club / Track";
  };

  const loadPlaces = useCallback(async () => {
    const cacheKey = `cache_mc_${selected}`;
    // Load cache so user sees last-known results immediately while fetching
    try {
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
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Location permission is required to find nearby places.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = position.coords;
      setUserLocation({ latitude, longitude });
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

      const sorted = results
        .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
        .slice(0, 20);
      setPlaces(sorted);
      setFromCache(false);
      try { await AsyncStorage.setItem(cacheKey, JSON.stringify(sorted)); } catch {}
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
    atm_bank: "ATMs & Banks",
  };

  const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
    services: `Searches within ${CATEGORY_RADIUS_M.services / 1000} km for motorcycle dealers, repair workshops, parts & accessories shops, and rental shops.`,
    fuel: `Searches within ${CATEGORY_RADIUS_M.fuel / 1000} km for all fuel/petrol stations. Fuel types shown where available from OpenStreetMap. Tap ⓘ to check live prices via Google Maps (prices shown in supported countries — no API key required).`,
    parking: `Searches within ${CATEGORY_RADIUS_M.parking_general / 1000} km for general parking and within ${CATEGORY_RADIUS_M.parking_moto / 1000} km for dedicated motorcycle parking.`,
    clubs_tracks: `Searches within ${CATEGORY_RADIUS_M.clubs_tracks / 1000} km for motorcycle clubs and racing/riding tracks.`,
    atm_bank: `Searches within ${CATEGORY_RADIUS_M.atm_bank / 1000} km for ATM machines and bank branches — handy on long-distance rides when cash is needed.`,
  };

  const EMPTY_TEXTS: Record<Category, string> = {
    services: "No MC dealers, workshops, shops, or rentals found yet. Try updating your location.",
    fuel: "No fuel stations found yet. Try updating your location.",
    parking: "No parking found yet. Try updating your location.",
    clubs_tracks: "No MC clubs or tracks found within 50 km. Try updating your location.",
    atm_bank: "No ATMs or banks found nearby. Try updating your location.",
  };

  const sectionTitle = SECTION_TITLES[selected];
  const sectionDescription = CATEGORY_DESCRIPTIONS[selected];
  const emptyText = EMPTY_TEXTS[selected];

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
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
            {infoPlace?.fuelTypes && infoPlace.fuelTypes.length > 0 && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>⛽ Fuel Types</Text>
                <View style={styles.fuelTypesRow}>
                  {infoPlace.fuelTypes.map((ft) => (
                    <View key={ft} style={styles.fuelTypeBadge}>
                      <Text style={styles.fuelTypeBadgeText}>{ft}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {!infoPlace?.phone && !infoPlace?.website && !infoPlace?.openingHours && !infoPlace?.email && !infoPlace?.address && !infoPlace?.fuelTypes?.length && (
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
              {selected === "fuel" && (
                <Pressable
                  style={[styles.modalActionButton, styles.modalActionButtonFuel]}
                  onPress={() =>
                    Linking.openURL(
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${infoPlace?.latitude},${infoPlace?.longitude}`)}`
                    ).catch(() => null)
                  }
                >
                  <Text style={[styles.modalActionButtonText, styles.modalActionButtonTextFuel]}>⛽ Check Fuel Prices</Text>
                </Pressable>
              )}
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
        <Text style={styles.headerBadge}>🔧 GEAR UP</Text>
        <Text style={styles.title}>THE GARAGE</Text>
        <Text style={styles.subtitle}>
          Find MC services, fuel, parking & clubs near your ride.
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

      {/* Cache banner */}
      {fromCache && places.length > 0 && (
        <View style={styles.cacheBanner}>
          <Text style={styles.cacheBannerText}>📡 Showing cached results — tap refresh for latest</Text>
        </View>
      )}

      {/* View mode toggle — only shown when the map is available */}
      {places.length > 0 && MapView && (
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
      {viewMode === "map" && userLocation && MapView && (
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
          {places.map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.latitude, longitude: place.longitude }}
              title={place.name}
              onPress={() => setInfoPlace(place)}
            />
          ))}
        </MapView>
      )}

      <View style={styles.sectionCard}>
        <Text style={styles.cardTitle}>{sectionTitle}</Text>
        <Text style={styles.cardDescription}>{sectionDescription}</Text>
        {viewMode === "list" && (
          places.length === 0 && !loading ? (
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
                  {selected === "fuel" && place.fuelTypes && place.fuelTypes.length > 0 && (
                    <View style={styles.fuelTypesRow}>
                      {place.fuelTypes.map((ft) => (
                        <View key={ft} style={styles.fuelTypeBadge}>
                          <Text style={styles.fuelTypeBadgeText}>{ft}</Text>
                        </View>
                      ))}
                    </View>
                  )}
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
          )
        )}
      </View>
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
  header: {
    marginTop: 18,
    marginBottom: 20,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    overflow: "hidden",
    backgroundColor: "#1a0900",
  },
  headerGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,102,0,0.55)",
    top: -90,
    right: -50,
  },
  headerGlowSecondary: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(180,60,0,0.40)",
    bottom: -70,
    left: -30,
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,102,0,0.18)",
    color: "#ff6600",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
    letterSpacing: 0.6,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.5)",
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 2,
  },
  subtitle: {
    color: "#c8c8c8",
    marginTop: 6,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: "#ff6600",
    paddingVertical: 13,
    borderRadius: 6,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#ff6600",
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.8,
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
    borderRadius: 6,
    alignItems: "center",
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.25)",
  },
  segmentButtonActive: {
    backgroundColor: "#ff6600",
    borderColor: "#ff6600",
  },
  segmentText: {
    color: "#666666",
    fontSize: 13,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#000000",
  },
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
    color: "#666666",
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  bodyText: {
    color: "#c8c8c8",
    fontSize: 15,
    marginBottom: 12,
  },
  metaText: {
    color: "#666666",
    fontSize: 13,
  },
  placeRow: {
    backgroundColor: "#141414",
    padding: 14,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderLeftWidth: 3,
    borderLeftColor: "#ff6600",
    shadowColor: "#000000",
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
    color: "#ff6600",
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
    color: "#ff6600",
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
    backgroundColor: "#141414",
    borderRadius: 10,
    padding: 22,
    width: "100%",
    borderWidth: 1,
    borderColor: "#2a2a2a",
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
    color: "#ff6600",
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
  modalLoadingText: {
    color: "#666666",
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
    backgroundColor: "rgba(255,102,0,0.12)",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
  },
  modalActionButtonWiki: {
    backgroundColor: "rgba(250,204,21,0.1)",
    borderColor: "rgba(250,204,21,0.3)",
  },
  modalActionButtonFuel: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.4)",
  },
  modalActionButtonText: {
    color: "#ff6600",
    fontSize: 14,
    fontWeight: "600",
  },
  modalActionButtonTextWiki: {
    color: "#fbbf24",
  },
  modalActionButtonTextFuel: {
    color: "#22c55e",
  },
  fuelTypesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  fuelTypeBadge: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
  },
  fuelTypeBadgeText: {
    color: "#22c55e",
    fontSize: 11,
    fontWeight: "700",
  },
  modalClose: {
    marginTop: 8,
    backgroundColor: "#ff6600",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
  },
  modalCloseText: {
    color: "#000000",
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
    borderColor: "rgba(255,102,0,0.25)",
  },
  viewToggleBtnActive: {
    backgroundColor: "#ff6600",
    borderColor: "#ff6600",
  },
  viewToggleText: {
    color: "#666666",
    fontSize: 14,
    fontWeight: "700",
  },
  viewToggleTextActive: {
    color: "#000000",
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
});
