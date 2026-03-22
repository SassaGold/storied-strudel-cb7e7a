import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings, fmtDistShort } from "../../lib/settings";
import { haversineMeters, parseWikiTag, CACHE_TTL_MS } from "../../lib/overpass";
import { usePOIFetch, type Place } from "../../lib/usePOIFetch";

// Safely load react-native-maps: requires a custom dev/production build.
let rnMaps: any = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { rnMaps = require("react-native-maps"); } catch {}
const MapView: any = rnMaps?.default;
const Marker: any = rnMaps?.Marker;
const UrlTile: any = rnMaps?.UrlTile ?? null;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage: any = (() => { try { return require("@react-native-async-storage/async-storage").default; } catch { return null; } })();

// ── MC-specific constants ─────────────────────────────────────────────────────

/** AsyncStorage key for the last selected category — persists across restarts. */
const MC_SELECTED_KEY = "mc_selected_v1";

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

// Per-category fetch timeouts must exceed the Overpass server-side [timeout:N] value.
const CATEGORY_FETCH_TIMEOUT_MS: Record<string, number> = {
  services: 40000,     // Overpass [timeout:25] + 15 s buffer
  fuel: 40000,         // Overpass [timeout:25] + 15 s buffer
  parking: 40000,      // Overpass [timeout:25] + 15 s buffer
  clubs_tracks: 45000, // Overpass [timeout:30] + 15 s buffer
  atm_bank: 40000,     // Overpass [timeout:25] + 15 s buffer
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

const CATEGORY_KEYS: Category[] = ["services", "fuel", "parking", "clubs_tracks", "atm_bank"];

const CATEGORY_COLORS: Record<Category, string> = {
  services: "#ff6600",
  fuel:     "#22c55e",
  parking:  "#3b82f6",
  clubs_tracks: "#ef4444",
  atm_bank: "#a855f7",
};

// Pre-computed inactive border and active background colours (27% / 10% opacity)
const CATEGORY_BORDER_INACTIVE: Record<Category, string> = {
  services:     "rgba(255,102,0,0.27)",
  fuel:         "rgba(34,197,94,0.27)",
  parking:      "rgba(59,130,246,0.27)",
  clubs_tracks: "rgba(239,68,68,0.27)",
  atm_bank:     "rgba(168,85,247,0.27)",
};

const CATEGORY_BG_ACTIVE: Record<Category, string> = {
  services:     "rgba(255,102,0,0.10)",
  fuel:         "rgba(34,197,94,0.10)",
  parking:      "rgba(59,130,246,0.10)",
  clubs_tracks: "rgba(239,68,68,0.10)",
  atm_bank:     "rgba(168,85,247,0.10)",
};

const CATEGORY_ICONS: Record<Category, string> = {
  services:     "🛠️",
  fuel:         "⛽",
  parking:      "🅿️",
  clubs_tracks: "🏁",
  atm_bank:     "🏧",
};

// ── Element mapping ───────────────────────────────────────────────────────────

const mapMcElement = (
  element: any,
  latitude: number,
  longitude: number,
  fallbackCategory: string
): Place | null => {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const tags = element.tags ?? {};
  const name = tags.name || tags.brand || tags.operator || fallbackCategory;
  const note = tags.fee === "no" ? "FREE_PARKING" : undefined;
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
  };
};

// ── Overpass query builder ────────────────────────────────────────────────────

const buildQuery = (category: Category, lat: number, lon: number): string => {
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

const fallbackLabel = (category: Category): string => {
  if (category === "services") return "MC Service";
  if (category === "fuel") return "Fuel Station";
  if (category === "parking") return "Parking";
  if (category === "atm_bank") return "ATM / Bank";
  return "MC Club / Track";
};

// ── Screen component ──────────────────────────────────────────────────────────

export default function McScreen() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Category>("services");
  const [nameSearch, setNameSearch] = useState("");

  const {
    loading,
    error,
    places,
    fromCache,
    cacheTs,
    userLocation,
    infoPlace,
    wikiExtract,
    wikiLoading,
    viewMode,
    setViewMode,
    setInfoPlace,
    setWikiExtract,
    setPlaces,
    setFromCache,
    setCacheTs,
    setError,
    loadPlaces,
    openInMaps,
    openInfo,
  } = usePOIFetch({
    cacheKey: `cache_mc_v2_${selected}`,
    buildOverpassQuery: (lat, lon) => buildQuery(selected, lat, lon),
    mapElement: (el, lat, lon) => mapMcElement(el, lat, lon, fallbackLabel(selected)),
    locationErrorMsg: t("garage.locationError"),
    loadErrorMsg: t("garage.loadError"),
    searchRadiusKm: settings.searchRadiusKm,
    fetchTimeoutMs: CATEGORY_FETCH_TIMEOUT_MS[selected] ?? 45000,
  });

  // Track whether the initial AsyncStorage restore is complete so that the
  // save effects below don't overwrite persisted values during startup.
  const initDoneRef = useRef(false);

  // On mount: restore the last selected category and its cached results so the
  // user sees the same state they left, without having to press "Find" again.
  // All AsyncStorage reads are completed first, then all state updates are
  // applied in one synchronous block so React batches them into a single render.
  useEffect(() => {
    (async () => {
      try {
        const savedSelected = await AsyncStorage?.getItem(MC_SELECTED_KEY);
        const restoredCategory: Category =
          savedSelected && (CATEGORY_KEYS as readonly string[]).includes(savedSelected)
            ? (savedSelected as Category)
            : "services";

        // Populate places from cache (valid entries only — no network request).
        const cacheKey = `cache_mc_v2_${restoredCategory}`;
        const raw = await AsyncStorage?.getItem(cacheKey);

        // Apply all state updates in one synchronous block so that React
        // batches them into a single render, preventing an intermediate render
        // with the correct category but an empty places list.
        if (restoredCategory !== "services") {
          setSelected(restoredCategory);
        }
        if (raw) {
          const parsed = JSON.parse(raw);
          const ts: number = parsed?.ts;
          const data: Place[] = parsed?.data;
          if (
            Array.isArray(data) &&
            data.length > 0 &&
            typeof ts === "number" &&
            Date.now() - ts < CACHE_TTL_MS
          ) {
            setPlaces(data);
            setFromCache(true);
            setCacheTs(ts);
          }
        }
      } catch {}
      initDoneRef.current = true;
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist selected category whenever it changes (skip during initial restore).
  useEffect(() => {
    if (!initDoneRef.current) return;
    AsyncStorage?.setItem(MC_SELECTED_KEY, selected)?.catch(() => null);
  }, [selected]);

  const sectionTitle = t(`garage.titles.${selected}`);
  const sectionDescription = t(`garage.descriptions.${selected}`);
  const emptyText = t(`garage.empty.${selected}`);
  const mapsButtonLabel = selected === "fuel"
    ? t("common.checkFuelPrices")
    : t("common.reviewsGoogle");

  const filteredPlaces = nameSearch.trim()
    ? places.filter((p) => p.name.toLowerCase().includes(nameSearch.trim().toLowerCase()))
    : places;

  const hapticLight = () =>
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
  const hapticMedium = () =>
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);

  const closeModal = () => {
    hapticLight();
    setInfoPlace(null);
    setWikiExtract(null);
  };

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}>
      <Modal
        visible={infoPlace !== null}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{infoPlace?.name}</Text>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{t("common.category")}</Text>
              <Text style={styles.modalValue}>{infoPlace?.category}</Text>
            </View>
            {infoPlace?.note && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common.note")}</Text>
                <Text style={styles.modalValue}>{infoPlace.note === "FREE_PARKING" ? t("garage.freeParking") : infoPlace.note}</Text>
              </View>
            )}
            {infoPlace?.phone && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common.phone")}</Text>
                <Text
                  style={styles.modalLink}
                  onPress={() => { hapticLight(); Linking.openURL(`tel:${infoPlace.phone}`).catch(() => null); }}
                >
                  {infoPlace.phone}
                </Text>
              </View>
            )}
            {infoPlace?.email && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common.email")}</Text>
                <Text
                  style={styles.modalLink}
                  onPress={() => { hapticLight(); Linking.openURL(`mailto:${infoPlace.email}`).catch(() => null); }}
                  numberOfLines={1}
                >
                  {infoPlace.email}
                </Text>
              </View>
            )}
            {infoPlace?.address && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common.address")}</Text>
                <Text style={styles.modalValue}>{infoPlace.address}</Text>
              </View>
            )}
            {infoPlace?.website && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common.website")}</Text>
                <Text
                  style={styles.modalLink}
                  onPress={() => { hapticLight(); Linking.openURL(infoPlace.website!).catch(() => null); }}
                  numberOfLines={1}
                >
                  {infoPlace.website.replace(/^https?:\/\/(www\.)?/, "")}
                </Text>
              </View>
            )}
            {infoPlace?.openingHours && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common.hours")}</Text>
                <Text style={styles.modalValue}>{infoPlace.openingHours}</Text>
              </View>
            )}
            {infoPlace?.fuelTypes && infoPlace.fuelTypes.length > 0 && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common.fuelTypes")}</Text>
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
              <Text style={styles.modalNoInfo}>{t("common.noContactInfo")}</Text>
            )}
            {infoPlace?.wikipedia && wikiLoading && (
              <Text style={styles.modalLoadingText}>{t("common.wikiLoading")}</Text>
            )}
            {wikiExtract && (
              <View style={styles.modalWikiSection}>
                <Text style={styles.modalWikiLabel}>{t("common.wikiLabel")}</Text>
                <Text style={styles.modalWikiExtract} numberOfLines={5}>{wikiExtract}</Text>
              </View>
            )}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalActionButton}
                onPress={() => { hapticLight(); Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(infoPlace?.name ?? "")}`).catch(() => null); }}
              >
                <Text style={styles.modalActionButtonText}>{mapsButtonLabel}</Text>
              </Pressable>
              {infoPlace?.wikipedia && (
                <Pressable
                  style={[styles.modalActionButton, styles.modalActionButtonWiki]}
                  onPress={() => {
                    hapticLight();
                    const { lang, title } = parseWikiTag(infoPlace.wikipedia!);
                    Linking.openURL(`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`).catch(() => null);
                  }}
                >
                  <Text style={[styles.modalActionButtonText, styles.modalActionButtonTextWiki]}>{t("common.readWikipedia")}</Text>
                </Pressable>
              )}
            </View>
            <Pressable style={styles.modalClose} onPress={closeModal}>
              <Text style={styles.modalCloseText}>{t("common.close")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>{t("garage.badge")}</Text>
        <Text style={styles.title}>{t("garage.title")}</Text>
        <Text style={styles.subtitle}>
          {t("garage.subtitle")}
        </Text>
      </View>

      {/* Category selector — 2×3 icon tile grid */}
      <View style={styles.segmentRow}>
        {CATEGORY_KEYS.map((key) => {
          const color = CATEGORY_COLORS[key];
          const isActive = selected === key;
          return (
            <Pressable
              key={key}
              style={[
                styles.segmentTile,
                { borderColor: isActive ? color : CATEGORY_BORDER_INACTIVE[key] },
                isActive && { backgroundColor: CATEGORY_BG_ACTIVE[key] },
              ]}
              onPress={() => {
                hapticLight();
                setSelected(key);
                setPlaces([]);
                setError(null);
                setNameSearch("");
              }}
              accessibilityRole="button"
              accessibilityLabel={t(`garage.titles.${key}`)}
            >
              <Text style={styles.segmentTileIcon}>{CATEGORY_ICONS[key]}</Text>
              <Text style={[styles.segmentTileText, isActive && { color }]}>
                {t(`garage.titles.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
        onPress={() => { hapticMedium(); loadPlaces(); }}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={t("garage.findButton", { title: sectionTitle })}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? t("common.loading") : t("garage.findButton", { title: sectionTitle })}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>{t("garage.searching")}</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Cache banner */}
      {fromCache && places.length > 0 && (
        <View style={styles.cacheBanner}>
          <Text style={styles.cacheBannerText}>
            {t("common.cachedResults")}
            {cacheTs != null && (
              ` · ${t("common.cacheAge", { count: Math.round((Date.now() - cacheTs) / 60000) })}`
            )}
          </Text>
        </View>
      )}

      {/* View mode toggle — only shown when the map is available */}
      {places.length > 0 && MapView && (
        <View style={styles.viewToggleRow}>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "list" && styles.viewToggleBtnActive]}
            onPress={() => { hapticLight(); setViewMode("list"); }}
          >
            <Text style={[styles.viewToggleText, viewMode === "list" && styles.viewToggleTextActive]}>{t("common.viewList")}</Text>
          </Pressable>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "map" && styles.viewToggleBtnActive]}
            onPress={() => { hapticLight(); setViewMode("map"); }}
          >
            <Text style={[styles.viewToggleText, viewMode === "map" && styles.viewToggleTextActive]}>{t("common.viewMap")}</Text>
          </Pressable>
        </View>
      )}

      {/* Map view */}
      {viewMode === "map" && userLocation && MapView && (
        <MapView
          style={styles.mapView}
          mapType={Platform.OS === "android" ? "none" : "standard"}
          showsUserLocation
          initialRegion={{
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: 0.06,
            longitudeDelta: 0.06,
          }}
        >
          {Platform.OS === "android" && UrlTile && (
            <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />
          )}
          {filteredPlaces.map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.latitude, longitude: place.longitude }}
              title={place.name}
              onPress={() => { hapticLight(); setInfoPlace(place); }}
            />
          ))}
        </MapView>
      )}

      <View style={styles.sectionCard}>
        <Text style={styles.cardTitle}>{sectionTitle}</Text>
        <Text style={styles.cardDescription}>{sectionDescription}</Text>
        {selected === "services" && (
          <>
            <TextInput
              style={styles.searchInput}
              value={nameSearch}
              onChangeText={setNameSearch}
              placeholder={t("garage.searchPlaceholder")}
              placeholderTextColor="#555555"
              clearButtonMode="while-editing"
              returnKeyType="search"
              accessibilityLabel={t("garage.searchPlaceholder")}
            />
            {nameSearch.trim() ? (
              <Pressable
                style={styles.googleMapsSearchButton}
                onPress={() => {
                  hapticLight();
                  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nameSearch.trim())}`).catch(() => null);
                }}
                accessibilityRole="button"
                accessibilityLabel={t("garage.searchGoogleMaps")}
              >
                <Text style={styles.googleMapsSearchButtonText}>{t("garage.searchGoogleMaps")}</Text>
              </Pressable>
            ) : null}
          </>
        )}
        {viewMode === "list" && (
          filteredPlaces.length === 0 && !loading ? (
            <Text style={styles.bodyText}>
              {nameSearch.trim() && places.length > 0 ? t("garage.noSearchResults") : emptyText}
            </Text>
          ) : (
            filteredPlaces.map((place) => (
              <Pressable
                key={place.id}
                style={[styles.placeRow, { borderLeftColor: CATEGORY_COLORS[selected] }]}
                onPress={() => { hapticLight(); openInMaps(place); }}
                accessibilityRole="button"
                accessibilityLabel={place.name}
              >
                <View style={styles.placeInfo}>
                  <Text style={styles.bodyText}>{place.name}</Text>
                  <View style={styles.tagRow}>
                    <Text style={styles.metaText}>{place.category}</Text>
                    {place.note && (
                      <Text style={styles.highlightTag}>{place.note === "FREE_PARKING" ? t("garage.freeParking") : place.note}</Text>
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
                    {fmtDistShort(place.distanceMeters ?? 0, settings.unitSystem)}
                  </Text>
                  <Pressable
                    style={styles.infoButton}
                    onPress={(e) => { e.stopPropagation(); hapticLight(); openInfo(place); }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Info: ${place.name}`}
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
    gap: 10,
    marginBottom: 14,
  },
  segmentTile: {
    width: "47%",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#141414",
    borderWidth: 1.5,
    borderColor: "#2a2a2a",
  },
  segmentTileIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  segmentTileText: {
    color: "#666666",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
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
  searchInput: {
    backgroundColor: "#1e1e1e",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
    color: "#ffffff",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
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
  modalActionButtonText: {
    color: "#ff6600",
    fontSize: 14,
    fontWeight: "600",
  },
  modalActionButtonTextWiki: {
    color: "#fbbf24",
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
  googleMapsSearchButton: {
    backgroundColor: "rgba(66,133,244,0.12)",
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(66,133,244,0.4)",
    marginBottom: 12,
  },
  googleMapsSearchButtonText: {
    color: "#4285F4",
    fontSize: 14,
    fontWeight: "600",
  },
});
