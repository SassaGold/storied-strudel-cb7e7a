// ── Shared POI screen component ───────────────────────────────────────────────
// Renders the common UI that was previously copy-pasted across restaurants.tsx,
// hotels.tsx and attractions.tsx: header, find button, loading/error states,
// cache banner, list/map toggle, map, place list, and the info modal.

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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings, fmtDistShort } from "../lib/settings";
import { parseWikiTag } from "../lib/overpass";
import type { Place } from "../lib/usePOIFetch";

// Safely load react-native-maps: requires a custom dev/production build.
// In Expo Go or any environment where the native module isn't compiled in,
// MapView and Marker will be null and the map toggle is hidden automatically.
let rnMaps: any = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { rnMaps = require("react-native-maps"); } catch {}
const MapView: any = rnMaps?.default;
const Marker: any = rnMaps?.Marker;
const PROVIDER_GOOGLE = rnMaps?.PROVIDER_GOOGLE ?? null;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

// ── Component props ───────────────────────────────────────────────────────────

export interface POIScreenProps {
  // Data & handlers from usePOIFetch
  places: Place[];
  /** Total number of results fetched (for "Showing X of Y" pagination label). */
  totalFound: number;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  /**
   * Unix timestamp (ms) of the cache entry currently displayed.
   * Used to show "last updated X min ago" in the stale-data banner.
   */
  cacheTimestamp: number | null;
  /**
   * True when the background network refresh failed but stale cached data
   * is still visible. Triggers the "offline" variant of the cache banner.
   */
  refreshError: boolean;
  userLocation: { latitude: number; longitude: number } | null;
  infoPlace: Place | null;
  wikiExtract: string | null;
  wikiLoading: boolean;
  onLoad: () => void;
  /**
   * Force a fresh network search, discarding any cached data first.
   * Wired to long-press on the find button.
   */
  forceFetch?: () => void;
  /** Load the next page of already-fetched results. */
  onLoadMore: () => void;
  onOpenInMaps: (place: Place) => void;
  onOpenInfo: (place: Place) => void;
  onCloseInfo: () => void;

  /**
   * i18n key prefix for this screen, e.g. "food", "sleep", "explore".
   * The component resolves keys like `${i18nPrefix}.badge`, `.title`, etc.
   */
  i18nPrefix: string;

  /**
   * Optional formatter for the category label shown in the list row and modal.
   * Defaults to the raw category string when not provided.
   */
  categoryLabel?: (category: string) => string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function POIScreen({
  places,
  totalFound,
  loading,
  error,
  fromCache,
  cacheTimestamp,
  refreshError,
  userLocation,
  infoPlace,
  wikiExtract,
  wikiLoading,
  onLoad,
  forceFetch,
  onLoadMore,
  onOpenInMaps,
  onOpenInfo,
  onCloseInfo,
  i18nPrefix,
  categoryLabel,
}: POIScreenProps) {
  const { t } = useTranslation("common");
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  const fmtCategory = categoryLabel ?? ((c: string) => c);

  /** Format cache age as "5 min" or "2 h" for use in the stale-data banner. */
  const formatAge = (ts: number): string => {
    const diffMin = Math.floor((Date.now() - ts) / 60_000);
    if (diffMin < 60) return `${diffMin} min`;
    return `${Math.floor(diffMin / 60)} h`;
  };

  const handleClose = () => {
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    onCloseInfo();
  };

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
        onRequestClose={onCloseInfo}
      >
        <Pressable style={styles.modalOverlay} onPress={handleClose}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{infoPlace?.name}</Text>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{t("category")}</Text>
              <Text style={styles.modalValue}>
                {fmtCategory(infoPlace?.category ?? "")}
              </Text>
            </View>
            {infoPlace?.stars && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("stars")}</Text>
                <Text style={styles.modalValue}>{infoPlace.stars}★</Text>
              </View>
            )}
            {infoPlace?.phone && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("phone")}</Text>
                <Text
                  style={styles.modalLink}
                  onPress={() => {
                    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                    Linking.openURL(`tel:${infoPlace.phone}`).catch(() => null);
                  }}
                >
                  {infoPlace.phone}
                </Text>
              </View>
            )}
            {infoPlace?.email && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("email")}</Text>
                <Text
                  style={styles.modalLink}
                  onPress={() => {
                    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                    Linking.openURL(`mailto:${infoPlace.email}`).catch(() => null);
                  }}
                  numberOfLines={1}
                >
                  {infoPlace.email}
                </Text>
              </View>
            )}
            {infoPlace?.address && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("address")}</Text>
                <Text style={styles.modalValue}>{infoPlace.address}</Text>
              </View>
            )}
            {infoPlace?.website && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("website")}</Text>
                <Text
                  style={styles.modalLink}
                  onPress={() => {
                    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                    Linking.openURL(infoPlace.website!).catch(() => null);
                  }}
                  numberOfLines={1}
                >
                  {infoPlace.website.replace(/^https?:\/\/(www\.)?/, "")}
                </Text>
              </View>
            )}
            {infoPlace?.openingHours && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("hours")}</Text>
                <Text style={styles.modalValue}>{infoPlace.openingHours}</Text>
              </View>
            )}
            {!infoPlace?.phone && !infoPlace?.website && !infoPlace?.openingHours && !infoPlace?.email && !infoPlace?.address && (
              <Text style={styles.modalNoInfo}>{t("noContactInfo")}</Text>
            )}
            {infoPlace?.wikipedia && wikiLoading && (
              <Text style={styles.modalLoadingText}>{t("wikiLoading")}</Text>
            )}
            {wikiExtract && (
              <View style={styles.modalWikiSection}>
                <Text style={styles.modalWikiLabel}>{t("wikiLabel")}</Text>
                <Text style={styles.modalWikiExtract} numberOfLines={5}>
                  {wikiExtract}
                </Text>
              </View>
            )}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalActionButton}
                onPress={() => {
                  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                  Linking.openURL(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(infoPlace?.name ?? "")}`
                  ).catch(() => null);
                }}
              >
                <Text style={styles.modalActionButtonText}>{t("reviewsGoogle")}</Text>
              </Pressable>
              {infoPlace?.wikipedia && (
                <Pressable
                  style={[styles.modalActionButton, styles.modalActionButtonWiki]}
                  onPress={() => {
                    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                    const { lang, title } = parseWikiTag(infoPlace.wikipedia!);
                    Linking.openURL(
                      `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`
                    ).catch(() => null);
                  }}
                >
                  <Text style={[styles.modalActionButtonText, styles.modalActionButtonTextWiki]}>
                    {t("readWikipedia")}
                  </Text>
                </Pressable>
              )}
            </View>
            <Pressable style={styles.modalClose} onPress={handleClose}>
              <Text style={styles.modalCloseText}>{t("close")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>{t("badge", { ns: i18nPrefix })}</Text>
        <Text style={styles.title}>{t("title", { ns: i18nPrefix })}</Text>
        <Text style={styles.subtitle}>{t("subtitle", { ns: i18nPrefix })}</Text>
      </View>

      {/* ── Find button ── */}
      <Pressable
        style={styles.primaryButton}
        onPress={() => {
          Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
          onLoad();
        }}
        onLongPress={forceFetch ? () => {
          Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => null);
          forceFetch();
        } : undefined}
        delayLongPress={500}
        accessibilityRole="button"
        accessibilityLabel={t("findButton", { ns: i18nPrefix })}
        accessibilityHint={forceFetch ? t("forceFetchHint") : undefined}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? t("loading") : t("findButton", { ns: i18nPrefix })}
        </Text>
      </Pressable>
      {/* Long-press hint — only shown when there is stale cached data visible */}
      {fromCache && places.length > 0 && forceFetch && !loading && (
        <Text style={styles.forceFetchHint}>{t("forceFetchHint")}</Text>
      )}

      {/* ── Loading indicator ── */}
      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>{t("searching", { ns: i18nPrefix })}</Text>
        </View>
      )}

      {/* ── Error ── */}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* ── Stale-cache / offline banner ── */}
      {fromCache && places.length > 0 && cacheTimestamp && loading && (
        <View style={styles.cacheBanner}>
          <Text style={styles.cacheBannerText}>
            {t("staleRefreshing", { age: formatAge(cacheTimestamp) })}
          </Text>
        </View>
      )}
      {fromCache && places.length > 0 && cacheTimestamp && refreshError && (
        <View style={[styles.cacheBanner, styles.cacheBannerOffline]}>
          <Text style={styles.cacheBannerText}>
            {t("staleOffline", { age: formatAge(cacheTimestamp) })}
          </Text>
        </View>
      )}

      {/* ── View mode toggle (list / map) ── */}
      {places.length > 0 && MapView && (
        <View style={styles.viewToggleRow}>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "list" && styles.viewToggleBtnActive]}
            onPress={() => {
              Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
              setViewMode("list");
            }}
            accessibilityRole="button"
            accessibilityLabel={t("viewList")}
            accessibilityState={{ selected: viewMode === "list" }}
          >
            <Text style={[styles.viewToggleText, viewMode === "list" && styles.viewToggleTextActive]}>
              {t("viewList")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "map" && styles.viewToggleBtnActive]}
            onPress={() => {
              Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
              setViewMode("map");
            }}
            accessibilityRole="button"
            accessibilityLabel={t("viewMap")}
            accessibilityState={{ selected: viewMode === "map" }}
          >
            <Text style={[styles.viewToggleText, viewMode === "map" && styles.viewToggleTextActive]}>
              {t("viewMap")}
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Map view ── */}
      {viewMode === "map" && userLocation && MapView && (
        <MapView
          style={styles.mapView}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          showsUserLocation
          initialRegion={{
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: 0.06,
            longitudeDelta: 0.06,
          }}
          accessibilityLabel={t("title", { ns: i18nPrefix })}
        >
          {places.map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.latitude, longitude: place.longitude }}
              title={place.name}
              description={fmtDistShort(place.distanceMeters ?? 0, settings.unitSystem)}
              onPress={() => {
                Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                onOpenInfo(place);
              }}
            />
          ))}
        </MapView>
      )}

      {/* ── List view ── */}
      {viewMode === "list" && (
        places.length === 0 && !loading ? (
          <Text style={styles.bodyText}>{t("noResults", { ns: i18nPrefix })}</Text>
        ) : (
          <>
            {/* Pagination summary: "Showing 20 of 47 results" */}
            {totalFound > places.length && (
              <Text style={styles.paginationSummary}>
                {t("showingOf", { shown: places.length, total: totalFound })}
              </Text>
            )}
            {places.map((place) => (
              <Pressable
                key={place.id}
                style={styles.placeRow}
                onPress={() => {
                  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                  onOpenInMaps(place);
                }}
                accessibilityRole="button"
                accessibilityLabel={place.name}
                accessibilityHint={t("openInMapsHint")}
              >
                <View style={styles.placeInfo}>
                  <Text style={styles.bodyText}>{place.name}</Text>
                  <View style={styles.tagRow}>
                    <Text style={styles.metaText}>{fmtCategory(place.category)}</Text>
                    {place.stars && (
                      <Text style={styles.starsTag}>{place.stars}★</Text>
                    )}
                  </View>
                </View>
                <View style={styles.placeRight}>
                  <Text style={styles.metaText}>
                    {fmtDistShort(place.distanceMeters ?? 0, settings.unitSystem)}
                  </Text>
                  <Pressable
                    style={styles.infoButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                      onOpenInfo(place);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${t("infoFor")} ${place.name}`}
                    accessibilityHint={t("openInfoHint")}
                  >
                    <Text style={styles.infoButtonText}>ⓘ</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
            {/* Load More button — only shown when more results are available */}
            {totalFound > places.length && (
              <Pressable
                style={styles.loadMoreButton}
                onPress={() => {
                  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                  onLoadMore();
                }}
                accessibilityRole="button"
                accessibilityLabel={t("loadMore")}
                accessibilityHint={t("loadMoreHint")}
              >
                <Text style={styles.loadMoreText}>{t("loadMore")}</Text>
              </Pressable>
            )}
          </>
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
  forceFetchHint: {
    color: "#666666",
    fontSize: 11,
    textAlign: "center",
    marginTop: -10,
    marginBottom: 12,
    letterSpacing: 0.2,
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
  starsTag: {
    color: "#ff6600",
    fontSize: 12,
    fontWeight: "600",
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
  cacheBannerOffline: {
    backgroundColor: "rgba(248,113,113,0.10)",
    borderColor: "rgba(248,113,113,0.35)",
  },
  cacheBannerText: {
    color: "#f59e0b",
    fontSize: 13,
    fontWeight: "500",
  },
  paginationSummary: {
    color: "#888888",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 8,
  },
  loadMoreButton: {
    marginTop: 12,
    paddingVertical: 11,
    borderRadius: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.5)",
  },
  loadMoreText: {
    color: "#ff6600",
    fontSize: 14,
    fontWeight: "700",
  },
});
