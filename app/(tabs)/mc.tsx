import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
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
import { readTimedCache, storage } from "../../lib/storage";
import { usePOIFetch, type Place } from "../../lib/usePOIFetch";
import PlaceInfoModal from "../../components/PlaceInfoModal";
import POIMap from "../../components/POIMap";
import HeaderBackdrop from "../../components/HeaderBackdrop";
import SkeletonList from "../../components/SkeletonList";


import { COLORS, FONTS } from "../../lib/theme";
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
  fitness: 15000,
};

type Category = "services" | "fuel" | "parking" | "clubs_tracks" | "atm_bank" | "fitness";

const CATEGORY_RADIUS_M: Record<Category, number> = {
  services: 30000,
  fuel: 20000,
  parking: 10000,
  clubs_tracks: 50000,
  atm_bank: 5000,
  fitness: 15000,
};

const CATEGORY_KEYS: Category[] = ["services", "fuel", "parking", "clubs_tracks", "atm_bank", "fitness"];

const CATEGORY_COLORS: Record<Category, string> = {
  services: COLORS.brand,
  fuel:     COLORS.success,
  parking:  "#3b82f6",
  clubs_tracks: COLORS.danger,
  atm_bank: "#a855f7",
  fitness:  "#14b8a6",
};

// Pre-computed inactive border and active background colours (27% / 10% opacity)
const CATEGORY_BORDER_INACTIVE: Record<Category, string> = {
  services:     "rgba(255,102,0,0.27)",
  fuel:         "rgba(34,197,94,0.27)",
  parking:      "rgba(59,130,246,0.27)",
  clubs_tracks: "rgba(239,68,68,0.27)",
  atm_bank:     "rgba(168,85,247,0.27)",
  fitness:      "rgba(20,184,166,0.27)",
};

const CATEGORY_BG_ACTIVE: Record<Category, string> = {
  services:     "rgba(255,102,0,0.10)",
  fuel:         "rgba(34,197,94,0.10)",
  parking:      "rgba(59,130,246,0.10)",
  clubs_tracks: "rgba(239,68,68,0.10)",
  atm_bank:     "rgba(168,85,247,0.10)",
  fitness:      "rgba(20,184,166,0.10)",
};

const CATEGORY_ICONS: Record<Category, ComponentProps<typeof MaterialCommunityIcons>["name"]> = {
  services:     "wrench",
  fuel:         "gas-station",
  parking:      "parking",
  clubs_tracks: "flag-checkered",
  atm_bank:     "bank",
  fitness:      "dumbbell",
};

// ── Category display ───────────────────────────────────────────────────────────

/** Emoji + readable name for the OSM values returned across MC categories. */
const MC_CATEGORY_LABEL: Record<string, string> = {
  fuel: "⛽ Fuel Station",
  car_repair: "🔧 Car Repair",
  motorcycle_repair: "🏍️ MC Repair",
  motorcycle: "🏍️ Motorcycle Shop",
  bicycle: "🚲 Bicycle Shop",
  car_parts: "🔩 Car Parts",
  tyres: "🛞 Tyres",
  parking: "🅿️ Parking",
  atm: "🏧 ATM",
  bank: "🏦 Bank",
  // Clubs & Tracks (motorcycle clubs + racing/motorsport tracks)
  mc_club: "🏍️ MC Club",
  raceway: "🏁 Race Circuit",
  motocross: "🏁 Motocross",
  karting: "🏁 Karting",
  speedway: "🏁 Speedway",
  motorsport: "🏁 Motorsport",
  // Sports & Fitness
  stadium: "🏟️ Stadium",
  sports_centre: "🏟️ Sports Centre",
  fitness_centre: "💪 Fitness Centre",
  fitness_station: "💪 Fitness Station",
  swimming_pool: "🏊 Swimming Pool",
  golf_course: "⛳ Golf Course",
  track: "🏁 Track",
};

const formatMcCategory = (category: string): string =>
  MC_CATEGORY_LABEL[category] ??
  `🔧 ${category.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}`;

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
  let category = (osmItemPrimaryCategory(item) || fallback).toLowerCase();
  // Clubs & Tracks matches key-specific tags (club=motorcycle, highway=raceway,
  // sport=*) that fetchOsmPlaces doesn't expose as a primary category, so derive a
  // meaningful label from the raw tags here.
  if (selectedCategory === "clubs_tracks") {
    const tg = item.tags ?? {};
    const sport = (tg.sport ?? "").toLowerCase();
    if (tg.club === "motorcycle") category = "mc_club";
    else if (tg.highway === "raceway") category = "raceway";
    else if (sport.includes("motocross")) category = "motocross";
    else if (sport.includes("karting")) category = "karting";
    else if (sport.includes("speedway")) category = "speedway";
    else if (sport) category = "motorsport";
    else if (tg.leisure) category = tg.leisure.toLowerCase();
  }
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
  // Plain values are matched across amenity/tourism/shop/historic/leisure keys by
  // fetchOsmPlaces (shop=car_repair, leisure=stadium…). "key=value" tokens match
  // that exact OSM key only — used for tags outside the generic keys.
  if (category === "services") return "motorcycle_repair|motorcycle|car_repair|car_parts|tyres|bicycle";
  if (category === "fuel") return "fuel";
  if (category === "parking") return "parking";
  // Real motorcycle clubs (club=motorcycle) and racing/motorsport tracks
  // (highway=raceway, sport=motocross/karting/speedway/motor…). NOT generic gyms.
  if (category === "clubs_tracks")
    return "club=motorcycle|highway=raceway|sport=motocross|sport=karting|sport=speedway|sport=motor|sport=motorcycle";
  // Gyms, fitness & general sports venues.
  if (category === "fitness")
    return "fitness_centre|sports_centre|stadium|golf_course|swimming_pool|fitness_station";
  return "atm|bank";
};

/** Storage key for a category's cached places (also used by usePOIFetch). */
const mcCacheKey = (category: Category): string => `cache_mc_v2_${category}`;

/** Read a category's cached places; returns null when absent, invalid, or expired. */
const readMcCache = (category: Category) =>
  readTimedCache<Place>(mcCacheKey(category), CACHE_TTL_MS);

const fallbackLabel = (category: Category): string => {
  if (category === "services") return "MC Service";
  if (category === "fuel") return "Fuel Station";
  if (category === "parking") return "Parking";
  if (category === "atm_bank") return "ATM / Bank";
  if (category === "fitness") return "Sports & Fitness";
  return "MC Club / Track";
};

// ── Screen component ──────────────────────────────────────────────────────────

export default function McScreen() {
  const { t } = useTranslation();
  const { settings, setSetting } = useSettings();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Category>("services");
  const [nameSearch, setNameSearch] = useState("");
  // Flips true when the mount restore has finished (state twin of initDoneRef,
  // so the auto-load effect below can react to it).
  const [initDone, setInitDone] = useState(false);
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
    cacheKey: mcCacheKey(selected),
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

  // Latest selected category — lets async cache reads bail out if the user
  // switched tiles again before the read resolved.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Cache-hydration generation. Bumped on every tile switch, Find press and
  // pull-to-refresh so a slow AsyncStorage read can never overwrite newer
  // results (e.g. a fresh network fetch) with stale cached data.
  const hydrateGenRef = useRef(0);

  // On mount: restore the last selected category and its cached results so the
  // user sees the same state they left, without having to press "Find" again.
  // All AsyncStorage reads are completed first, then all state updates are
  // applied in one synchronous block so React batches them into a single render.
  useEffect(() => {
    const gen = hydrateGenRef.current;
    (async () => {
      try {
        const savedSelected = await storage.getItem(MC_SELECTED_KEY);
        const restoredCategory: Category =
          savedSelected && (CATEGORY_KEYS as readonly string[]).includes(savedSelected)
            ? (savedSelected as Category)
            : "services";

        // Populate places from cache (valid entries only — no network request).
        const hit = await readMcCache(restoredCategory);

        // Bail out if the user already tapped a tile (or searched) while the
        // restore was in flight — their choice wins over the persisted one.
        if (hydrateGenRef.current !== gen) {
          initDoneRef.current = true;
          setInitDone(true);
          return;
        }

        // Apply all state updates in one synchronous block so that React
        // batches them into a single render, preventing an intermediate render
        // with the correct category but an empty places list.
        if (restoredCategory !== "services") {
          setSelected(restoredCategory);
        }
        if (hit) {
          setPlaces(hit.data);
          setFromCache(true);
          setCacheTs(hit.ts);
        }
      } catch {}
      initDoneRef.current = true;
      setInitDone(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-load once after the restore completes, so the Garage behaves like the
  // other data tabs (results appear without pressing "Find"). loadPlaces serves
  // the cache first, then refreshes from the network.
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (!initDone || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    loadPlaces();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initDone]);

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
    hydrateGenRef.current++; // invalidate any in-flight cache hydration
    try { await loadPlaces(); } finally { setRefreshing(false); }
  }, [loadPlaces]);

  const view = settings.poiView;

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} colors={[COLORS.brand]} />
      }
    >
      <PlaceInfoModal
        place={infoPlace}
        wikiExtract={wikiExtract}
        wikiLoading={wikiLoading}
        onClose={closeInfo}
        mapsButtonLabel={mapsButtonLabel}
        formatNote={formatNote}
        formatCategoryLabel={formatMcCategory}
      />
      <View style={styles.header}>
        <HeaderBackdrop />
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
                // Hydrate the newly selected category from its cache (if fresh)
                // so previously found results reappear without pressing "Find".
                // The generation check also protects against a slow read
                // resolving after the user has started a fresh search.
                const gen = ++hydrateGenRef.current;
                readMcCache(key).then((hit) => {
                  if (!hit || selectedRef.current !== key || hydrateGenRef.current !== gen) return;
                  setPlaces(hit.data);
                  setFromCache(true);
                  setCacheTs(hit.ts);
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={t(`garage.titles.${key}`)}
            >
              <MaterialCommunityIcons
                name={CATEGORY_ICONS[key]}
                size={28}
                color={color}
                style={styles.segmentTileIcon}
              />
              <Text style={[styles.segmentTileText, isActive && { color }]}>
                {t(`garage.titles.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
        onPress={() => { hapticMedium(); hydrateGenRef.current++; loadPlaces(); }}
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
          <ActivityIndicator size="small" color={COLORS.brand} />
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

        {filteredPlaces.length === 0 && loading ? (
            <SkeletonList rows={4} />
          ) : filteredPlaces.length === 0 ? (
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
                    <Text style={styles.metaText}>{formatMcCategory(place.category)}</Text>
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
                    accessibilityLabel={t("common.infoAbout", { name: place.name })}
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
    backgroundColor: COLORS.bg,
  },
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: COLORS.bg,
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
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,102,0,0.18)",
    color: COLORS.brand,
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
    color: COLORS.white,
    fontSize: 30,
    fontFamily: FONTS.display,
    letterSpacing: 1.5,
  },
  subtitle: {
    color: COLORS.body,
    marginTop: 6,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: COLORS.brand,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: COLORS.brand,
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
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  segmentTileIcon: {
    marginBottom: 6,
  },
  segmentTileText: {
    color: COLORS.muted,
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
    color: COLORS.body,
  },
  errorText: {
    color: "#f87171",
    marginBottom: 12,
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000000",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  cardTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
    letterSpacing: 1,
  },
  cardDescription: {
    color: COLORS.muted,
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  searchInput: {
    backgroundColor: "#1e1e1e",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
    color: COLORS.white,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  bodyText: {
    color: COLORS.body,
    fontSize: 15,
    marginBottom: 12,
  },
  metaText: {
    color: COLORS.muted,
    fontSize: 13,
  },
  placeRow: {
    backgroundColor: COLORS.card,
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.brand,
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
    color: COLORS.brand,
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
    color: COLORS.brand,
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
    color: COLORS.success,
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
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.25)",
  },
  viewToggleBtnActive: {
    backgroundColor: COLORS.brand,
    borderColor: COLORS.brand,
  },
  viewToggleText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  viewToggleTextActive: {
    color: "#000000",
  },
  cacheBanner: {
    backgroundColor: "rgba(255,153,0,0.12)",
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,153,0,0.3)",
  },
  cacheBannerText: {
    color: COLORS.warning,
    fontSize: 13,
    fontWeight: "500",
  },
  googleMapsSearchButton: {
    backgroundColor: "rgba(66,133,244,0.12)",
    borderRadius: 10,
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
