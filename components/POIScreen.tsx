// ── Shared POI Screen component ───────────────────────────────────────────────
// Used by restaurants, hotels, and attractions tabs.
// Renders the full screen UI: header, search button, loading/error states,
// cache banner, map/list toggle, map view, list view, and info modal.
// Screen-specific behaviour is injected via props.

import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings, fmtDistShort } from "../lib/settings";
import { usePOIFetch, type Place, type BuildSearchQuery, type MapPlaceItem } from "../lib/usePOIFetch";
import PlaceInfoModal from "./PlaceInfoModal";
import POIMap from "./POIMap";
import HeaderBackdrop from "./HeaderBackdrop";
import SkeletonList from "./SkeletonList";


import { COLORS, FONTS } from "../lib/theme";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

// ── Props ─────────────────────────────────────────────────────────────────────

export interface POIScreenProps {
  /** AsyncStorage cache key (e.g. "cache_restaurants_v2") */
  cacheKey: string;
  /** Builds the Overpass query for this POI type */
  buildSearchQuery: BuildSearchQuery;
  /** Maps a single raw OSM/Overpass item to a Place (return null to skip) */
  mapPlaceItem: MapPlaceItem;
  /**
   * i18n key prefix for screen-specific strings.
   * Must have: badge, title, subtitle, findButton, searching, noResults,
   *            locationError, loadError.
   * Example: "food" → t("food.badge"), t("food.title"), …
   */
  i18nPrefix: string;
  /**
   * Optional: formats the category string shown in the list row tag and modal.
   * If omitted, the raw place.category string is used.
   */
  formatCategoryLabel?: (category: string) => string;
  /**
   * Optional: extra tag content rendered inside the list row's tag row
   * (after the category label). Useful for hotels star rating.
   */
  renderExtraListTag?: (place: Place) => ReactNode;
  /**
   * Optional: extra modal rows rendered after the category row and before
   * phone/email. Useful for hotels star rating.
   */
  renderExtraModalRows?: (place: Place) => ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function POIScreen({
  cacheKey,
  buildSearchQuery,
  mapPlaceItem,
  i18nPrefix,
  formatCategoryLabel,
  renderExtraListTag,
  renderExtraModalRows,
}: POIScreenProps) {
  const { t } = useTranslation();
  const { settings, setSetting } = useSettings();
  const insets = useSafeAreaInsets();

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
    loadPlaces,
    cancelSearch,
    openInMaps,
    openInfo,
    closeInfo,
  } = usePOIFetch({
    cacheKey,
    buildSearchQuery,
    mapPlaceItem,
    locationErrorMsg: t(`${i18nPrefix}.locationError`),
    loadErrorMsg: t(`${i18nPrefix}.loadError`),
    searchRadiusKm: settings.searchRadiusKm,
  });

  // Auto-load nearby places the first time this tab opens, so first-time users
  // see results (served instantly from cache when available) instead of an empty
  // "tap Find" screen. Cancel any in-flight search when they navigate away.
  const autoLoadedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!autoLoadedRef.current) {
        autoLoadedRef.current = true;
        loadPlaces();
      }
      return () => { cancelSearch(); };
    }, [loadPlaces, cancelSearch])
  );

  const hapticLight = () =>
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
  const hapticMedium = () =>
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);

  // Translate the category via the screen's i18n block (e.g. food.categories.cafe),
  // falling back to the screen-provided English formatter (or the raw value).
  // Owning the lookup here means each screen only supplies its plain formatter.
  const categoryDisplay = useCallback(
    (cat: string) =>
      t(`${i18nPrefix}.categories.${cat}`, {
        defaultValue: formatCategoryLabel ? formatCategoryLabel(cat) : cat,
      }),
    [t, i18nPrefix, formatCategoryLabel]
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadPlaces(); } finally { setRefreshing(false); }
  }, [loadPlaces]);

  const view = settings.poiView;

  // Row renderer for the virtualized list (rows only mount as they scroll in;
  // Overpass searches can return dozens of places).
  const renderPlace = ({ item: place }: ListRenderItemInfo<Place>) => (
    <Pressable
      style={styles.placeRow}
      onPress={() => { hapticLight(); openInMaps(place); }}
      accessibilityRole="button"
      accessibilityLabel={place.name}
    >
      <View style={styles.placeInfo}>
        <Text style={styles.bodyText}>{place.name}</Text>
        <View style={styles.tagRow}>
          <Text style={styles.metaText}>{categoryDisplay(place.category)}</Text>
          {renderExtraListTag ? renderExtraListTag(place) : null}
        </View>
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
  );

  // Everything above the rows scrolls with them as the list header.
  const listHeader = (
    <>
      {/* ── Info modal ── */}
      <PlaceInfoModal
        place={infoPlace}
        wikiExtract={wikiExtract}
        wikiLoading={wikiLoading}
        onClose={closeInfo}
        formatCategoryLabel={categoryDisplay}
        renderExtraRows={renderExtraModalRows}
      />

      {/* ── Header ── */}
      <View style={styles.header}>
        <HeaderBackdrop />
        <Text style={styles.headerBadge}>{t(`${i18nPrefix}.badge`)}</Text>
        <Text style={styles.title}>{t(`${i18nPrefix}.title`)}</Text>
        <Text style={styles.subtitle}>{t(`${i18nPrefix}.subtitle`)}</Text>
      </View>

      {/* ── Find button ── */}
      <Pressable
        style={styles.primaryButton}
        onPress={() => { hapticMedium(); loadPlaces(); }}
        accessibilityRole="button"
        accessibilityLabel={t(`${i18nPrefix}.findButton`)}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? t("common.loading") : t(`${i18nPrefix}.findButton`)}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.brand} />
          <Text style={styles.loadingText}>{t(`${i18nPrefix}.searching`)}</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* ── Skeleton placeholders while the first search runs ── */}
      {loading && places.length === 0 && <SkeletonList rows={5} />}

      {/* ── Cache banner ── */}
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

      {/* ── List / map toggle (only with results) ── */}
      {places.length > 0 && (
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

      {/* ── Map view renders inside the header; rows are the list itself ── */}
      {view === "map" && places.length > 0 && (
        <POIMap
          places={places}
          userLocation={userLocation}
          onPressPlace={openInfo}
          markerLabel={(p) => p.name}
        />
      )}
    </>
  );

  return (
    <FlatList
      style={styles.scrollView}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} colors={[COLORS.brand]} />
      }
      data={view === "list" ? places : []}
      keyExtractor={(place) => place.id}
      renderItem={renderPlace}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        !loading && places.length === 0 ? (
          <Text style={styles.bodyText}>{t(`${i18nPrefix}.noResults`)}</Text>
        ) : null
      }
    />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(47,212,196,0.4)",
    overflow: "hidden",
    backgroundColor: "#0E1A2E",
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(47,212,196,0.18)",
    color: COLORS.brand,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: 0.4,
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
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.8,
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
    color: COLORS.brand,
    fontSize: 20,
    lineHeight: 22,
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
    borderColor: "rgba(47,212,196,0.25)",
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
});
