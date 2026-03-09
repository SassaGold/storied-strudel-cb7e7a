import { useCallback, useState } from "react";
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
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings, fmtDistShort } from "../../lib/settings";
import { haversineMeters, fetchOverpass, CACHE_TTL_MS } from "../../lib/overpass";
// Safely load react-native-maps: requires a custom dev/production build.
// In Expo Go or any environment where the native module isn't compiled in,
// MapView and Marker will be null and the map toggle is hidden automatically.
let rnMaps: any = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { rnMaps = require("react-native-maps"); } catch {}
const MapView: any = rnMaps?.default;
const Marker: any = rnMaps?.Marker;
const PROVIDER_GOOGLE = rnMaps?.PROVIDER_GOOGLE ?? null;
// Safely load AsyncStorage: the native implementation throws at module-evaluation
// time when "RNCAsyncStorage" isn't registered (Expo Go / older dev builds).
// Using require() in try/catch means the screen still loads; the existing
// try/catch wrappers inside loadPlaces already handle AsyncStorage === null.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage: any = (() => { try { return require("@react-native-async-storage/async-storage").default; } catch { return null; } })();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

type Place = {
  id: string;
  name: string;
  category: string;
  distanceMeters?: number;
  latitude: number;
  longitude: number;
  stars?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  openingHours?: string;
  wikipedia?: string;
};

const CACHE_KEY = "cache_hotels_v2";

export default function HotelsScreen() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [infoPlace, setInfoPlace] = useState<Place | null>(null);
  const [wikiExtract, setWikiExtract] = useState<string | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const loadPlaces = useCallback(async () => {
    // Load cache so user sees last-known results immediately while fetching
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const { ts, data }: { ts: number; data: Place[] } = JSON.parse(raw);
        if (data?.length > 0 && Date.now() - ts < CACHE_TTL_MS) {
          setPlaces(data);
          setFromCache(true);
        }
      }
    } catch {}
    setLoading(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError(t("sleep.locationError"));
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = position.coords;
      setUserLocation({ latitude, longitude });

      const accommodationTypes =
        "hotel|motel|hostel|guest_house|apartment|chalet|resort|camp_site|caravan_site|alpine_hut|wilderness_hut|villa|bungalow";
      const radiusM = settings.searchRadiusKm * 1000;
      const overpassQuery = `
[out:json][timeout:25];
(
  node(around:${radiusM},${latitude},${longitude})[tourism~"${accommodationTypes}"];
  way(around:${radiusM},${latitude},${longitude})[tourism~"${accommodationTypes}"];
  relation(around:${radiusM},${latitude},${longitude})[tourism~"${accommodationTypes}"];
);
out center 120;`;

      // Overpass API (OpenStreetMap) — free place/POI data, no API key required
      const data = await fetchOverpass(overpassQuery);

      if (!data.elements) {
        setPlaces([]);
        return;
      }

      const mapped = (data.elements as any[])
        .map((element) => {
          const lat = element.lat ?? element.center?.lat;
          const lon = element.lon ?? element.center?.lon;
          if (lat === undefined || lon === undefined) {
            return null;
          }
          const tags = element.tags ?? {};
          const name = tags.name || tags.tourism || "Accommodation";
          const stars = tags.stars || tags["stars:official"] || undefined;
          return {
            id: String(element.id),
            name,
            category: tags.tourism || "hotel",
            latitude: lat,
            longitude: lon,
            distanceMeters: haversineMeters(latitude, longitude, lat, lon),
            stars,
            website: (tags.website || tags["contact:website"] || "").trim() || undefined,
            phone: (tags.phone || tags["contact:phone"] || "").trim() || undefined,
            email: (tags.email || tags["contact:email"] || "").trim() || undefined,
            address: [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean).join(" ") || undefined,
            openingHours: (tags.opening_hours || "").trim() || undefined,
            wikipedia: (tags.wikipedia || "").trim() || undefined,
          } as Place;
        })
        .filter(Boolean) as Place[];

      const sorted = mapped
        .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
        .slice(0, 20);
      setPlaces(sorted);
      setFromCache(false);
      try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: sorted })); } catch {}
    } catch {
      setError(t("sleep.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}>
      <Modal
        visible={infoPlace !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setInfoPlace(null); setWikiExtract(null); }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setInfoPlace(null); setWikiExtract(null); }}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{infoPlace?.name}</Text>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{t("common.category")}</Text>
              <Text style={styles.modalValue}>{infoPlace?.category}</Text>
            </View>
            {infoPlace?.stars && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common.stars")}</Text>
                <Text style={styles.modalValue}>{infoPlace.stars}★</Text>
              </View>
            )}
            {infoPlace?.phone && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common.phone")}</Text>
                <Text
                  style={styles.modalLink}
                  onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); Linking.openURL(`tel:${infoPlace.phone}`).catch(() => null); }}
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
                  onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); Linking.openURL(`mailto:${infoPlace.email}`).catch(() => null); }}
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
                  onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); Linking.openURL(infoPlace.website!).catch(() => null); }}
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
                onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(infoPlace?.name ?? "")}`).catch(() => null); }}
              >
                <Text style={styles.modalActionButtonText}>{t("common.reviewsGoogle")}</Text>
              </Pressable>
              {infoPlace?.wikipedia && (
                <Pressable
                  style={[styles.modalActionButton, styles.modalActionButtonWiki]}
                  onPress={() => {
                    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                    const { lang, title } = parseWikiTag(infoPlace.wikipedia!);
                    Linking.openURL(`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`).catch(() => null);
                  }}
                >
                  <Text style={[styles.modalActionButtonText, styles.modalActionButtonTextWiki]}>{t("common.readWikipedia")}</Text>
                </Pressable>
              )}
            </View>
            <Pressable style={styles.modalClose} onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setInfoPlace(null); setWikiExtract(null); }}>
              <Text style={styles.modalCloseText}>{t("common.close")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>{t("sleep.badge")}</Text>
        <Text style={styles.title}>{t("sleep.title")}</Text>
        <Text style={styles.subtitle}>{t("sleep.subtitle")}</Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null); loadPlaces(); }} accessibilityRole="button" accessibilityLabel={t("sleep.findButton")}>
        <Text style={styles.primaryButtonText}>
          {loading ? t("common.loading") : t("sleep.findButton")}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>{t("sleep.searching")}</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Cache banner */}
      {fromCache && places.length > 0 && (
        <View style={styles.cacheBanner}>
          <Text style={styles.cacheBannerText}>{t("common.cachedResults")}</Text>
        </View>
      )}

      {/* View mode toggle — only shown when the map is available */}
      {places.length > 0 && MapView && (
        <View style={styles.viewToggleRow}>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "list" && styles.viewToggleBtnActive]}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setViewMode("list"); }}
          >
            <Text style={[styles.viewToggleText, viewMode === "list" && styles.viewToggleTextActive]}>{t("common.viewList")}</Text>
          </Pressable>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "map" && styles.viewToggleBtnActive]}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setViewMode("map"); }}
          >
            <Text style={[styles.viewToggleText, viewMode === "map" && styles.viewToggleTextActive]}>{t("common.viewMap")}</Text>
          </Pressable>
        </View>
      )}

      {/* Map view */}
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
        >
          {places.map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.latitude, longitude: place.longitude }}
              title={place.name}
              onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setInfoPlace(place); }}
            />
          ))}
        </MapView>
      )}

      {viewMode === "list" && (
        places.length === 0 && !loading ? (
          <Text style={styles.bodyText}>
            {t("sleep.noResults")}
          </Text>
        ) : (
          places.map((place) => (
            <Pressable
              key={place.id}
              style={styles.placeRow}
              onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); openInMaps(place); }}
              accessibilityRole="button"
              accessibilityLabel={place.name}
            >
              <View style={styles.placeInfo}>
                <Text style={styles.bodyText}>{place.name}</Text>
                <View style={styles.tagRow}>
                  <Text style={styles.metaText}>{place.category}</Text>
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
                  onPress={(e) => { e.stopPropagation(); Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); openInfo(place); }}
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
  cacheBannerText: {
    color: "#f59e0b",
    fontSize: 13,
    fontWeight: "500",
  },
});
