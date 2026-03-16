import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haversineMeters, fetchOverpass, CACHE_TTL_MS, buildMapsUrl } from "../../lib/overpass";
// Safely load expo-haptics: may not be available in all environments
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();
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

const AMENITY_TYPES =
  "hospital|police|fire_station|pharmacy|clinic|doctors|ambulance_station";

const CATEGORY_FILTER_KEYS = ["all", "hospital", "police", "fire_station", "pharmacy"] as const;

const categoryLabelFallback: Record<string, string> = {
  hospital: "🏥 Hospital",
  police: "👮 Police",
  fire_station: "🚒 Fire Station",
  pharmacy: "💊 Pharmacy",
  clinic: "🏨 Clinic",
  doctors: "👨‍⚕️ Doctor",
  ambulance_station: "🚑 Ambulance",
};

const formatCategory = (cat: string) =>
  categoryLabelFallback[cat] ??
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

/** Initiates a phone call; falls back to an alert if the device cannot handle it.
 *  In development builds (__DEV__) a dialog is shown instead so real calls are
 *  never accidentally placed while testing. */
const callNumber = (number: string, cannotCallTitle: string, cannotCallMsg: string, callFailedTitle: string, callFailedMsg: string) => {
  // Sanitize OSM phone data before passing to tel: URI.
  // Keep: digits (0-9), leading '+' for international prefix, spaces,
  // hyphens, dots, and parentheses — all legal in tel: URIs per RFC 3966.
  // Strip anything else (letters, slashes, etc.) that would form an invalid URL.
  const sanitized = number.replace(/[^0-9+\s\-().]/g, "").trim();
  if (!sanitized) {
    Alert.alert(cannotCallTitle, cannotCallMsg, [{ text: "OK" }]);
    return;
  }
  if (__DEV__) {
    Alert.alert(
      "Dev Mode — Call Blocked",
      `This would call ${sanitized} in production.`,
      [{ text: "OK" }]
    );
    return;
  }
  Linking.canOpenURL(`tel:${sanitized}`)
    .then((supported) => {
      if (supported) {
        return Linking.openURL(`tel:${sanitized}`);
      }
      Alert.alert(cannotCallTitle, cannotCallMsg, [{ text: "OK" }]);
    })
    .catch(() => {
      Alert.alert(callFailedTitle, callFailedMsg, [{ text: "OK" }]);
    });
};

const CACHE_KEY = "cache_emergency_v2";

export default function EmergencyScreen() {
  const { t } = useTranslation("sos");
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState("all");
  const [infoPlace, setInfoPlace] = useState<Place | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [fromCache, setFromCache] = useState(false);
  // Quick action state
  const [torchOn, setTorchOn] = useState(false);
  const [instructionsVisible, setInstructionsVisible] = useState(false);

  const call = useCallback((number: string) => {
    Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
    callNumber(
      number,
      t("cannotCall"),
      t("cannotCallMsg", { number }),
      t("callFailed"),
      t("callFailedMsg", { number })
    );
  }, [t]);

  const openInMaps = useCallback((place: Place) => {
    const url = buildMapsUrl(place.latitude, place.longitude, place.name);
    Linking.openURL(url).catch(() => null);
  }, []);

  const shareLocation = useCallback(async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(t("permissionAlert"), t("locationPermissionMsg"));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      const mapsLink = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
      await Share.share({
        message: `🏍️ My current location:\n${mapsLink}\n\nCoordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      });
    } catch {
      Alert.alert(t("shareFailed"), t("shareFailedMsg"));
    }
  }, [t]);

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
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setError(t("locationError"));
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
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
      const data = await fetchOverpass(overpassQuery);

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
      try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: sorted })); } catch {}
    } catch (err) {
      const isNetwork = err instanceof TypeError && String(err).includes("fetch");
      setError(isNetwork ? t("networkError") : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const filtered =
    selected === "all"
      ? places
      : places.filter((p) => p.category === selected);

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}
    >
      {/* ── Torch Screen Overlay ─────────────────────────────────── */}
      <Modal visible={torchOn} transparent animationType="fade" onRequestClose={() => setTorchOn(false)}>
        <Pressable style={styles.torchOverlay} onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setTorchOn(false); }}>
          <Text style={styles.torchOffText}>{t("torchScreenOff")}</Text>
        </Pressable>
      </Modal>

      {/* ── Emergency Instructions Modal ─────────────────────────── */}
      <Modal visible={instructionsVisible} transparent animationType="slide" onRequestClose={() => setInstructionsVisible(false)}>
        <View style={styles.instructionsOverlay}>
          <View style={styles.instructionsCard}>
            <View style={styles.instructionsHeader}>
              <Text style={styles.instructionsTitle}>{t("instructionsTitle")}</Text>
              <Pressable onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setInstructionsVisible(false); }} hitSlop={12}>
                <Text style={styles.instructionsClose}>{t("instructionsClose")} ✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.instructionsBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.instructionsText}>{t("instructionsBody")}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Info Modal */}
      <Modal
        visible={infoPlace !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoPlace(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setInfoPlace(null); }}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{infoPlace?.name}</Text>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{t("common:type")}</Text>
              <Text style={styles.modalValue}>
                {t(`sos.categoryLabels.${infoPlace?.category}`, { defaultValue: formatCategory(infoPlace?.category ?? "") })}
              </Text>
            </View>
            {infoPlace?.distanceMeters !== undefined && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common:distance")}</Text>
                <Text style={styles.modalValue}>
                  {formatDistance(infoPlace.distanceMeters)}
                </Text>
              </View>
            )}
            {infoPlace?.phone && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common:phone")}</Text>
                <Text
                  style={styles.modalLink}
                  onPress={() => call(infoPlace.phone!)}
                >
                  {infoPlace.phone}
                </Text>
              </View>
            )}
            {infoPlace?.address && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common:address")}</Text>
                <Text style={styles.modalValue}>{infoPlace.address}</Text>
              </View>
            )}
            {infoPlace?.openingHours && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common:hours")}</Text>
                <Text style={styles.modalValue}>{infoPlace.openingHours}</Text>
              </View>
            )}
            {infoPlace?.website && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>{t("common:website")}</Text>
                <Text
                  style={styles.modalLink}
                  numberOfLines={1}
                  onPress={() =>
                    { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); Linking.openURL(infoPlace.website!).catch(() => null); }
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
                  {t("common:noContactInfoEmergency")}
                </Text>
              )}
            <View style={styles.modalActions}>
              {infoPlace?.phone && (
                <Pressable
                  style={[styles.modalActionButton, styles.modalCallButton]}
                  onPress={() => call(infoPlace.phone!)}
                >
                  <Text
                    style={[
                      styles.modalActionButtonText,
                      styles.modalCallButtonText,
                    ]}
                  >
                    {t("callNow")}
                  </Text>
                </Pressable>
              )}
              <Pressable
                style={styles.modalActionButton}
                onPress={() =>
                  { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); Linking.openURL(
                    `https://www.google.com/maps/search/?api=1&query=${infoPlace?.latitude},${infoPlace?.longitude}`
                  ).catch(() => null); }
                }
              >
                <Text style={styles.modalActionButtonText}>
                  {t("navigateThere")}
                </Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.modalClose}
              onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setInfoPlace(null); }}
            >
              <Text style={styles.modalCloseText}>{t("common:close")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>{t("badge")}</Text>
        <Text style={styles.title}>{t("title")}</Text>
        <Text style={styles.subtitle}>
          {t("subtitle")}
        </Text>
      </View>

      {/* ── Large SOS Button ─────────────────────────────────────── */}
      <Pressable
        style={({ pressed }) => [styles.bigSosButton, pressed && { opacity: 0.85 }]}
        onPress={() => { Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null); call("112"); }}
        accessibilityRole="button"
        accessibilityLabel={t("callSos")}
      >
        <Text style={styles.bigSosEmoji}>🆘</Text>
        <Text style={styles.bigSosText}>{t("callSos")}</Text>
      </Pressable>

      {/* ── Quick Actions ─────────────────────────────────────────── */}
      <View style={styles.quickActionsCard}>
        <Text style={styles.quickActionsTitle}>{t("quickActions")}</Text>
        <View style={styles.quickActionsGrid}>
          {/* Call 112 */}
          <Pressable
            style={styles.quickActionBtn}
            onPress={() => { Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null); call("112"); }}
            accessibilityRole="button"
            accessibilityLabel={t("quickActionCall")}
          >
            <Text style={styles.quickActionEmoji}>📞</Text>
            <Text style={styles.quickActionLabel}>{t("quickActionCall")}</Text>
          </Pressable>
          {/* Share Location */}
          <Pressable
            style={styles.quickActionBtn}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null); shareLocation(); }}
            accessibilityRole="button"
            accessibilityLabel={t("shareLocation").replace("📍 ", "")}
          >
            <Text style={styles.quickActionEmoji}>📍</Text>
            <Text style={styles.quickActionLabel}>{t("shareLocation").replace("📍 ", "")}</Text>
          </Pressable>
          {/* Torch Screen */}
          <Pressable
            style={[styles.quickActionBtn, torchOn && styles.quickActionBtnActive]}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setTorchOn(true); }}
            accessibilityRole="button"
            accessibilityLabel={t("quickActionTorch")}
            accessibilityState={{ selected: torchOn }}
          >
            <Text style={styles.quickActionEmoji}>🔦</Text>
            <Text style={styles.quickActionLabel}>{t("quickActionTorch")}</Text>
          </Pressable>
          {/* Emergency Instructions */}
          <Pressable
            style={styles.quickActionBtn}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setInstructionsVisible(true); }}
            accessibilityRole="button"
            accessibilityLabel={t("quickActionInstructions")}
          >
            <Text style={styles.quickActionEmoji}>📋</Text>
            <Text style={styles.quickActionLabel}>{t("quickActionInstructions")}</Text>
          </Pressable>
        </View>
      </View>

      {/* Universal emergency numbers */}
      <View style={styles.sosCard}>
        <Text style={styles.sosCardTitle}>{t("universalNumbers")}</Text>
        <View style={styles.sosNumbersGrid}>
          {EMERGENCY_NUMBERS.map((item) => (
            <Pressable
              key={item.number}
              style={styles.sosNumberButton}
              onPress={() => call(item.number)}
            >
              <Text style={styles.sosNumberEmoji}>{item.emoji}</Text>
              <Text style={styles.sosNumber}>{item.number}</Text>
              <Text style={styles.sosRegion}>{item.region}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.shareButton} onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); shareLocation(); }}>
          <Text style={styles.shareButtonText}>{t("shareLocation")}</Text>
        </Pressable>
      </View>
      <Pressable
        style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
        onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null); loadPlaces(); }}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={t("findButton")}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? t("common:searching") : t("findButton")}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#ef4444" />
          <Text style={styles.loadingText}>{t("searching")}</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Cache banner */}
      {fromCache && places.length > 0 && (
        <View style={styles.cacheBanner}>
          <Text style={styles.cacheBannerText}>{t("common:cachedResults")}</Text>
        </View>
      )}

      {/* View mode toggle — only shown when the map is available */}
      {places.length > 0 && MapView && (
        <View style={styles.viewToggleRow}>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "list" && styles.viewToggleBtnActive]}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setViewMode("list"); }}
          >
            <Text style={[styles.viewToggleText, viewMode === "list" && styles.viewToggleTextActive]}>{t("common:viewList")}</Text>
          </Pressable>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "map" && styles.viewToggleBtnActive]}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setViewMode("map"); }}
          >
            <Text style={[styles.viewToggleText, viewMode === "map" && styles.viewToggleTextActive]}>{t("common:viewMap")}</Text>
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
          {filtered.map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.latitude, longitude: place.longitude }}
              title={place.name}
              onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setInfoPlace(place); }}
            />
          ))}
        </MapView>
      )}

      {places.length > 0 && (
        <>
          {/* Category filter */}
          <View style={styles.segmentRow}>
            {CATEGORY_FILTER_KEYS.map((key) => (
              <Pressable
                key={key}
                style={[
                  styles.segmentButton,
                  selected === key && styles.segmentButtonActive,
                ]}
                onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setSelected(key); }}
              >
                <Text
                  style={[
                    styles.segmentText,
                    selected === key && styles.segmentTextActive,
                  ]}
                >
                  {t(`categories.${key}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Result card */}
          <View style={styles.sectionCard}>
            <Text style={styles.cardTitle}>
              {selected === "all"
                ? t("allNearby")
                : t(`sos.categories.${selected}`, { defaultValue: selected })}
            </Text>
            <Text style={styles.cardDescription}>
              {t("sortedBy")}
            </Text>
            {viewMode === "list" && (
              filtered.length === 0 ? (
                <Text style={styles.bodyText}>
                  {t("noneInCategory")}
                </Text>
              ) : (
                filtered.map((place) => (
                  <Pressable
                    key={place.id}
                    style={styles.placeRow}
                    onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); openInMaps(place); }}
                    accessibilityRole="button"
                    accessibilityLabel={place.name}
                  >
                    <View style={styles.placeInfo}>
                      <Text style={styles.placeName} numberOfLines={1}>
                        {place.name}
                      </Text>
                      <View style={styles.tagRow}>
                        <Text style={styles.categoryTag}>
                          {t(`sos.categoryLabels.${place.category}`, { defaultValue: formatCategory(place.category) })}
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
                          onPress={() => call(place.phone!)}
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
                        onPress={(e) => { e.stopPropagation(); Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setInfoPlace(place); }}
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
        </>
      )}

      {!loading && places.length === 0 && !error && (
        <Text style={styles.bodyText}>
          {t("noResults")}
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
  // ── Large SOS button ─────────────────────────────────────────────
  bigSosButton: {
    backgroundColor: "#ef4444",
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: "center",
    marginBottom: 14,
    shadowColor: "#ef4444",
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  bigSosEmoji: {
    fontSize: 28,
  },
  bigSosText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 22,
    letterSpacing: 2,
  },
  // ── Quick actions card ───────────────────────────────────────────
  quickActionsCard: {
    backgroundColor: "#1a0000",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    padding: 14,
    marginBottom: 16,
  },
  quickActionsTitle: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  quickActionsGrid: {
    flexDirection: "row",
    gap: 8,
  },
  quickActionBtn: {
    flex: 1,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
  },
  quickActionBtnActive: {
    backgroundColor: "rgba(239,68,68,0.25)",
    borderColor: "#ef4444",
  },
  quickActionEmoji: {
    fontSize: 22,
  },
  quickActionLabel: {
    color: "#cc4444",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  // ── Torch overlay ────────────────────────────────────────────────
  torchOverlay: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 80,
  },
  torchOffText: {
    color: "#333",
    fontSize: 18,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.12)",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
  },
  // ── Instructions modal ───────────────────────────────────────────
  instructionsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  instructionsCard: {
    backgroundColor: "#111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    borderTopWidth: 2,
    borderColor: "#ef4444",
  },
  instructionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  instructionsTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 0.5,
  },
  instructionsClose: {
    color: "#ef4444",
    fontWeight: "700",
    fontSize: 14,
  },
  instructionsBody: {
    padding: 20,
  },
  instructionsText: {
    color: "#ccc",
    fontSize: 15,
    lineHeight: 24,
  },
});
