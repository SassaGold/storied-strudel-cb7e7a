import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Linking,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
    osmItemEmail,
    osmItemFuelTypes,
    osmItemIsFreeParking,
    osmItemOpeningHours,
    osmItemPhone,
    osmItemPrimaryCategory,
    osmItemWebsite,
    type OsmPlaceItem,
} from "../../lib/osmPlaces";
import { CACHE_TTL_MS, haversineMeters } from "../../lib/overpass";
import { fmtDistShort, useSettings } from "../../lib/settings";
import { storage } from "../../lib/storage";
import { usePOIFetch, type Place } from "../../lib/usePOIFetch";
import PlaceInfoModal from "../../components/PlaceInfoModal";
import POIMap from "../../components/POIMap";


// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

// ── MC-specific constants ─────────────────────────────────────────────────────

/** AsyncStorage key for the last selected category — persists across restarts. */
const MC_SELECTED_KEY = "mc_selected_v1";

// Per-category fetch timeouts (Overpass queries).
const CATEGORY_FETCH_TIMEOUT_MS: Record<string, number> = {
  services: 15000,
  fuel: 15000,
  parking: 15000,
  clubs_tracks: 15000,
  atm_bank: 15000,
};

type Category = "services" | "fuel" | "parking" | "clubs_tracks" | "atm_bank";

const CATEGORY_RADIUS_M: Record<Category, number> = {
  services: 30000,
  fuel: 20000,
  parking: 10000,
  clubs_tracks: 50000,
  atm_bank: 5000,
};

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

// ── OSM item mapping ───────────────────────────────────────────────────────────

const mapMcElement = (
  item: OsmPlaceItem,
  latitude: number,
  longitude: number,
  selectedCategory: Category
): Place | null => {
  const lat = item.position?.lat;
  const lon = item.position?.lng;
  if (lat === undefined || lon === undefined) return null;
  const fallback = fallbackLabel(selectedCategory);
  const category = (osmItemPrimaryCategory(item) || fallback).toLowerCase();
  const place: Place = {
    id: item.id || `${lat},${lon},${item.title || fallback}`,
    name: item.title || fallback,
    category,
    latitude: lat,
    longitude: lon,
    distanceMeters: haversineMeters(latitude, longitude, lat, lon),
    website: osmItemWebsite(item),
    phone: osmItemPhone(item),
    email: osmItemEmail(item),
    address: item.address?.label,
    openingHours: osmItemOpeningHours(item),
  };
  // Category-specific enrichment from raw OSM tags.
  if (selectedCategory === "fuel") {
    place.fuelTypes = osmItemFuelTypes(item);
  } else if (selectedCategory === "parking" && osmItemIsFreeParking(item)) {
    place.note = "FREE_PARKING";
  }
  return place;
};

// ── Overpass query builder ────────────────────────────────────────────────────

const buildQuery = (category: Category): string => {
  // Values are matched across amenity/tourism/shop/historic/leisure keys by
  // fetchOsmPlaces, so use the real OSM values (shop=car_repair, leisure=track…).
  if (category === "services") return "motorcycle_repair|motorcycle|car_repair|car_parts|tyres|bicycle";
  if (category === "fuel") return "fuel";
  if (category === "parking") return "parking";
  if (category === "clubs_tracks") return "stadium|sports_centre|track|fitness_centre|golf_course";
  return "atm|bank";
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
  const { settings, setSetting } = useSettings();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Category>("services");
  const [nameSearch, setNameSearch] = useState("");
  // MC categories keep fixed radii per category to improve relevance for each POI type
  // (e.g. broader radius for tracks/services, tighter for ATM/bank), independent of global settings.searchRadiusKm.
  const effectiveSearchRadiusKm = CATEGORY_RADIUS_M[selected] / 1000;

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
    setPlaces,
    setFromCache,
    setCacheTs,
    setError,
    loadPlaces,
    cancelSearch,
    openInMaps,
    openInfo,
    closeInfo,
  } = usePOIFetch({
    cacheKey: `cache_mc_v2_${selected}`,
    buildSearchQuery: () => buildQuery(selected),
    mapPlaceItem: (item, lat, lon) => mapMcElement(item, lat, lon, selected),
    locationErrorMsg: t("garage.locationError"),
    loadErrorMsg: t("garage.loadError"),
    searchRadiusKm: effectiveSearchRadiusKm,
    fetchTimeoutMs: CATEGORY_FETCH_TIMEOUT_MS[selected] ?? 15000,
  });

  // Cancel any in-progress search when the user navigates away from this tab.
  useFocusEffect(
    useCallback(() => {
      return () => { cancelSearch(); };
    }, [cancelSearch])
  );

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
        const savedSelected = await storage.getItem(MC_SELECTED_KEY);
        const restoredCategory: Category =
          savedSelected && (CATEGORY_KEYS as readonly string[]).includes(savedSelected)
            ? (savedSelected as Category)
            : "services";

        // Populate places from cache (valid entries only — no network request).
        const cacheKey = `cache_mc_v2_${restoredCategory}`;
        const raw = await storage.getItem(cacheKey);

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
    storage.setItem(MC_SELECTED_KEY, selected).catch(() => null);
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

  const formatNote = (note: string) => (note === "FREE_PARKING" ? t("garage.freeParking") : note);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadPlaces(); } finally { setRefreshing(false); }
  }, [loadPlaces]);

  const view = settings.poiView;

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ff6600" colors={["#ff6600"]} />
      }
    >
      <PlaceInfoModal
        place={infoPlace}
        wikiExtract={wikiExtract}
        wikiLoading={wikiLoading}
        onClose={closeInfo}
        mapsButtonLabel={mapsButtonLabel}
        formatNote={formatNote}
      />
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
                cancelSearch();
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
        {filteredPlaces.length > 0 && (
          <View style={styles.viewToggleRow}>
            <Pressable
              style={[styles.viewToggleBtn, view === "list" && styles.viewToggleBtnActive]}
              onPress={() => { hapticLight(); setSetting("poiView", "list"); }}
              accessibilityRole="button"
              accessibilityState={{ selected: view === "list" }}
              accessibilityLabel={t("common.viewList")}
            >
              <Text style={[styles.viewToggleText, view === "list" && styles.viewToggleTextActive]}>{t("common.viewList")}</Text>
            </Pressable>
            <Pressable
              style={[styles.viewToggleBtn, view === "map" && styles.viewToggleBtnActive]}
              onPress={() => { hapticLight(); setSetting("poiView", "map"); }}
              accessibilityRole="button"
              accessibilityState={{ selected: view === "map" }}
              accessibilityLabel={t("common.viewMap")}
            >
              <Text style={[styles.viewToggleText, view === "map" && styles.viewToggleTextActive]}>{t("common.viewMap")}</Text>
            </Pressable>
          </View>
        )}

        {filteredPlaces.length === 0 && !loading ? (
            <Text style={styles.bodyText}>
              {nameSearch.trim() && places.length > 0 ? t("garage.noSearchResults") : emptyText}
            </Text>
          ) : view === "map" ? (
            <POIMap
              places={filteredPlaces}
              userLocation={userLocation}
              onPressPlace={openInfo}
              markerLabel={(p) => p.name}
            />
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
