// ── Shared POI Screen component ───────────────────────────────────────────────
// Used by restaurants, hotels, and attractions tabs.
// Renders the full screen UI: header, search button, loading/error states,
// cache banner, map/list toggle, map view, list view, and info modal.
// Screen-specific behaviour is injected via props.

import { useCallback, type ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings, fmtDistShort } from "../lib/settings";
import { parseWikiTag } from "../lib/overpass";
import { usePOIFetch, type Place, type BuildOverpassQuery, type MapElement } from "../lib/usePOIFetch";

// Safely load react-native-maps: requires a custom dev/production build.
let rnMaps: any = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { rnMaps = require("react-native-maps"); } catch {}
const MapView: any = rnMaps?.default;
const Marker: any = rnMaps?.Marker;
const UrlTile: any = rnMaps?.UrlTile ?? null;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

// ── Props ─────────────────────────────────────────────────────────────────────

export interface POIScreenProps {
  /** AsyncStorage cache key (e.g. "cache_restaurants_v2") */
  cacheKey: string;
  /** Builds the Overpass QL query for this POI type */
  buildOverpassQuery: BuildOverpassQuery;
  /** Maps a single raw Overpass element to a Place (return null to skip) */
  mapElement: MapElement;
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
  buildOverpassQuery,
  mapElement,
  i18nPrefix,
  formatCategoryLabel,
  renderExtraListTag,
  renderExtraModalRows,
}: POIScreenProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
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
    viewMode,
    setViewMode,
    setInfoPlace,
    setWikiExtract,
    loadPlaces,
    cancelSearch,
    openInMaps,
    openInfo,
  } = usePOIFetch({
    cacheKey,
    buildOverpassQuery,
    mapElement,
    locationErrorMsg: t(`${i18nPrefix}.locationError`),
    loadErrorMsg: t(`${i18nPrefix}.loadError`),
    searchRadiusKm: settings.searchRadiusKm,
  });

  // Cancel any in-progress search when the user navigates away from this tab.
  useFocusEffect(
    useCallback(() => {
      return () => { cancelSearch(); };
    }, [cancelSearch])
  );

  const hapticLight = () =>
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
  const hapticMedium = () =>
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);

  const closeModal = () => {
    hapticLight();
    setInfoPlace(null);
    setWikiExtract(null);
  };

  const categoryDisplay = (cat: string) =>
    formatCategoryLabel ? formatCategoryLabel(cat) : cat;

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}
    >
      {/* ── Info modal ── */}
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
              <Text style={styles.modalValue}>{categoryDisplay(infoPlace?.category ?? "")}</Text>
            </View>

            {renderExtraModalRows && infoPlace ? renderExtraModalRows(infoPlace) : null}

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

            {!infoPlace?.phone && !infoPlace?.website && !infoPlace?.openingHours && !infoPlace?.email && !infoPlace?.address && (
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
                <Text style={styles.modalActionButtonText}>{t("common.reviewsGoogle")}</Text>
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

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
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
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>{t(`${i18nPrefix}.searching`)}</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

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

      {/* ── View mode toggle (only when map native module is available) ── */}
      {places.length > 0 && MapView && (
        <View style={styles.viewToggleRow}>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "list" && styles.viewToggleBtnActive]}
            onPress={() => { hapticLight(); setViewMode("list"); }}
          >
            <Text style={[styles.viewToggleText, viewMode === "list" && styles.viewToggleTextActive]}>
              {t("common.viewList")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "map" && styles.viewToggleBtnActive]}
            onPress={() => { hapticLight(); setViewMode("map"); }}
          >
            <Text style={[styles.viewToggleText, viewMode === "map" && styles.viewToggleTextActive]}>
              {t("common.viewMap")}
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Map view ── */}
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
          {places.map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.latitude, longitude: place.longitude }}
              title={place.name}
              onPress={() => { hapticLight(); setInfoPlace(place); }}
            />
          ))}
        </MapView>
      )}

      {/* ── List view ── */}
      {viewMode === "list" && (
        places.length === 0 && !loading ? (
          <Text style={styles.bodyText}>{t(`${i18nPrefix}.noResults`)}</Text>
        ) : (
          places.map((place) => (
            <Pressable
              key={place.id}
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
                  accessibilityLabel={`Info: ${place.name}`}
                >
                  <Text style={styles.infoButtonText}>ⓘ</Text>
                </Pressable>
              </View>
            </Pressable>
          ))
        )
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    overflow: "hidden",
    backgroundColor: "#1a0900",
  },
  headerGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,102,0,0.55)",
    top: -80,
    right: -40,
  },
  headerGlowSecondary: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(180,60,0,0.40)",
    bottom: -60,
    left: -20,
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,102,0,0.18)",
    color: "#ff6600",
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
    color: "#c8c8c8",
  },
  errorText: {
    color: "#f87171",
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
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  modalWikiExtract: {
    color: "#94a3b8",
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
