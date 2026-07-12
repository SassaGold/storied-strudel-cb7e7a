import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Localization from "expo-localization";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { emergencyNumberForCountry } from "../../lib/config";
import { getCurrentPositionWithTimeout } from "../../lib/location";
import { useSettings, fmtDistShort } from "../../lib/settings";
import { useEmergencyPlaces, type EmergencyPlace } from "../../lib/useEmergencyPlaces";
import POIMap from "../../components/POIMap";
import PlaceInfoModal from "../../components/PlaceInfoModal";
import { useLocationPermission } from "../../lib/locationPermission";
import HeaderBackdrop from "../../components/HeaderBackdrop";
import SkeletonList from "../../components/SkeletonList";
import { COLORS, FONTS } from "../../lib/theme";
// Safely load expo-haptics: may not be available in all environments
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

/** Alias so the rest of this file keeps using the shorter `Place` name. */
type Place = EmergencyPlace;

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

const EMERGENCY_NUMBERS = [
  { region: "EU / Intl", number: "112", emoji: "🌍" },
  { region: "USA / CA", number: "911", emoji: "🇺🇸" },
  { region: "UK", number: "999", emoji: "🇬🇧" },
  { region: "Australia", number: "000", emoji: "🇦🇺" },
  { region: "NZ", number: "111", emoji: "🇳🇿" },
];

/** Initiates a phone call; falls back to an alert if the device cannot handle it. */
const callNumber = (number: string, cannotCallTitle: string, cannotCallMsg: string, callFailedTitle: string, callFailedMsg: string, okLabel: string) => {
  Linking.canOpenURL(`tel:${number}`)
    .then((supported) => {
      if (supported) {
        return Linking.openURL(`tel:${number}`);
      }
      Alert.alert(cannotCallTitle, cannotCallMsg, [{ text: okLabel }]);
    })
    .catch(() => {
      Alert.alert(callFailedTitle, callFailedMsg, [{ text: okLabel }]);
    });
};

export default function EmergencyScreen() {
  const { t } = useTranslation();
  const { settings, setSetting } = useSettings();
  const insets = useSafeAreaInsets();
  const { requestForegroundPermission } = useLocationPermission();

  // Data from hook (loading, error, places, fromCache, cacheTs, loadPlaces)
  const { loading, error, places, fromCache, cacheTs, userLocation, loadPlaces, cancelSearch } =
    useEmergencyPlaces();

  // Auto-load nearby emergency services the first time the SOS screen opens, so
  // hospitals/police are ready without the user tapping "Find" under stress.
  // Cancel any in-progress search when they navigate away.
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

  // UI state
  const [selected, setSelected] = useState("all");
  const [infoPlace, setInfoPlace] = useState<Place | null>(null);
  // Quick action state
  const [torchOn, setTorchOn] = useState(false);
  const [instructionsVisible, setInstructionsVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const view = settings.poiView;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadPlaces(); } finally { setRefreshing(false); }
  }, [loadPlaces]);

  // Primary emergency number for the user's country. Seed instantly from the
  // device region (offline, no permission), then refine to the *physical*
  // country via GPS when a fix is already available (so a traveller abroad gets
  // the local number).
  const [emergencyNumber, setEmergencyNumber] = useState(() =>
    emergencyNumberForCountry(Localization.getLocales()[0]?.regionCode)
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (!last) return;
        const [place] = await Location.reverseGeocodeAsync({
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
        });
        if (!cancelled && place?.isoCountryCode) {
          setEmergencyNumber(emergencyNumberForCountry(place.isoCountryCode));
        }
      } catch {
        // Keep the device-region number if GPS/geocoding is unavailable.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const call = useCallback((number: string) => {
    Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
    callNumber(
      number,
      t("sos.cannotCall"),
      t("sos.cannotCallMsg", { number }),
      t("sos.callFailed"),
      t("sos.callFailedMsg", { number }),
      t("common.ok")
    );
  }, [t]);

  const openInMaps = useCallback((place: Place) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
    Linking.openURL(url).catch(() => null);
  }, []);

  const shareLocation = useCallback(async () => {
    try {
      const perm = await requestForegroundPermission();
      if (perm.status !== "granted") {
        Alert.alert(t("sos.permissionAlert"), t("sos.locationPermissionMsg"));
        return;
      }
      const pos = await getCurrentPositionWithTimeout({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      const mapsLink = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
      const coords = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      const shareText = t("sos.shareText", { link: mapsLink, coords });

      // On web, Share API is limited — copy to clipboard as fallback
      if (Platform.OS === "web") {
        try {
          await navigator.clipboard.writeText(shareText);
          Alert.alert(t("sos.locationCopied"), t("sos.locationCopiedMsg"));
          return;
        } catch {
          // clipboard not available, fall through to Share.share
        }
      }

      await Share.share({ message: shareText });
    } catch {
      Alert.alert(t("sos.shareFailed"), t("sos.shareFailedMsg"));
    }
  }, [t, requestForegroundPermission]);

  const filtered =
    selected === "all"
      ? places
      : places.filter((p) => p.category === selected);

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} colors={[COLORS.brand]} />
      }
    >
      {/* ── Torch Screen Overlay ─────────────────────────────────── */}
      <Modal visible={torchOn} transparent animationType="fade" onRequestClose={() => setTorchOn(false)}>
        <Pressable style={styles.torchOverlay} onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setTorchOn(false); }} accessibilityViewIsModal accessibilityRole="button" accessibilityLabel={t("sos.torchScreenOff")}>
          <Text style={styles.torchOffText}>{t("sos.torchScreenOff")}</Text>
        </Pressable>
      </Modal>

      {/* ── Emergency Instructions Modal ─────────────────────────── */}
      <Modal visible={instructionsVisible} transparent animationType="slide" onRequestClose={() => setInstructionsVisible(false)}>
        <View style={styles.instructionsOverlay}>
          <View style={styles.instructionsCard} accessibilityViewIsModal>
            <View style={styles.instructionsHeader}>
              <Text style={styles.instructionsTitle} accessibilityRole="header">{t("sos.instructionsTitle")}</Text>
              <Pressable onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setInstructionsVisible(false); }} hitSlop={12}>
                <Text style={styles.instructionsClose}>{t("sos.instructionsClose")} ✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.instructionsBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.instructionsText}>{t("sos.instructionsBody")}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Info Modal — shared component; call button + coordinate navigation. */}
      <PlaceInfoModal
        place={infoPlace}
        wikiExtract={null}
        wikiLoading={false}
        onClose={() => setInfoPlace(null)}
        mapsButtonLabel={t("sos.navigateThere")}
        mapsUseCoordinates
        formatCategoryLabel={(cat) =>
          t(`sos.categoryLabels.${cat}`, { defaultValue: formatCategory(cat) })
        }
        noContactInfoText={t("common.noContactInfoEmergency")}
        callButtonLabel={t("sos.callNow")}
        onCallPhone={call}
        renderExtraRows={(p) =>
          p.distanceMeters !== undefined ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <Text style={{ color: COLORS.muted, fontSize: 13 }}>{t("common.distance")}</Text>
              <Text style={{ color: COLORS.body, fontSize: 13, fontWeight: "500" }}>
                {fmtDistShort(p.distanceMeters ?? 0, settings.unitSystem)}
              </Text>
            </View>
          ) : null
        }
      />

      {/* Header */}
      <View style={styles.header}>
        <HeaderBackdrop tint="danger" />
        <Text style={styles.headerBadge}>{t("sos.badge")}</Text>
        <Text style={styles.title}>{t("sos.title")}</Text>
        <Text style={styles.subtitle}>
          {t("sos.subtitle")}
        </Text>
      </View>

      {/* ── Large SOS Button ─────────────────────────────────────── */}
      <Pressable
        style={({ pressed }) => [styles.bigSosButton, pressed && { opacity: 0.85 }]}
        onPress={() => { Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null); call(emergencyNumber); }}
        accessibilityRole="button"
        accessibilityLabel={`${t("sos.callSos")} ${emergencyNumber}`}
      >
        <Ionicons name="alert-circle" size={30} color={COLORS.white} />
        <Text style={styles.bigSosText}>{t("sos.callSos")}</Text>
        <Text style={styles.bigSosNumber}>{emergencyNumber}</Text>
      </Pressable>

      {/* ── Quick Actions ─────────────────────────────────────────── */}
      <View style={styles.quickActionsCard}>
        <Text style={styles.quickActionsTitle}>{t("sos.quickActions")}</Text>
        <View style={styles.quickActionsGrid}>
          {/* Call emergency services */}
          <Pressable
            style={styles.quickActionBtn}
            onPress={() => { Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null); call(emergencyNumber); }}
            accessibilityRole="button"
            accessibilityLabel={`${t("sos.quickActionCall")} ${emergencyNumber}`}
          >
            <Ionicons name="call" size={22} color={COLORS.danger} />
            <Text style={styles.quickActionLabel}>{t("sos.quickActionCall")} {emergencyNumber}</Text>
          </Pressable>
          {/* Share Location */}
          <Pressable
            style={styles.quickActionBtn}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null); shareLocation(); }}
            accessibilityRole="button"
            accessibilityLabel={t("sos.shareLocation")}
          >
            <Ionicons name="location" size={22} color={COLORS.danger} />
            <Text style={styles.quickActionLabel}>{t("sos.shareLocationShort")}</Text>
          </Pressable>
          {/* Torch Screen */}
          <Pressable
            style={[styles.quickActionBtn, torchOn && styles.quickActionBtnActive]}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setTorchOn(true); }}
            accessibilityRole="button"
            accessibilityLabel={t("sos.torchScreen")}
          >
            <Ionicons name="flashlight" size={22} color={COLORS.danger} />
            <Text style={styles.quickActionLabel}>{t("sos.quickActionTorch")}</Text>
          </Pressable>
          {/* Emergency Instructions */}
          <Pressable
            style={styles.quickActionBtn}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setInstructionsVisible(true); }}
            accessibilityRole="button"
            accessibilityLabel={t("sos.emergencyInstructions")}
          >
            <Ionicons name="document-text" size={22} color={COLORS.danger} />
            <Text style={styles.quickActionLabel}>{t("sos.quickActionInstructions")}</Text>
          </Pressable>
        </View>
      </View>

      {/* Universal emergency numbers */}
      <View style={styles.sosCard}>
        <Text style={styles.sosCardTitle}>{t("sos.universalNumbers")}</Text>
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
          <Text style={styles.shareButtonText}>{t("sos.shareLocation")}</Text>
        </Pressable>
      </View>
      <Pressable
        style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
        onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null); loadPlaces(); }}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={t("sos.findButton")}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? t("common.searching") : t("sos.findButton")}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.danger} />
          <Text style={styles.loadingText}>{t("sos.searching")}</Text>
        </View>
      )}

      {loading && places.length === 0 && <SkeletonList rows={4} tint="danger" />}

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
                  {t(`sos.categories.${key}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Result card */}
          <View style={styles.sectionCard}>
            <Text style={styles.cardTitle}>
              {selected === "all"
                ? t("sos.allNearby")
                : t(`sos.categories.${selected}`, { defaultValue: selected })}
            </Text>
            <Text style={styles.cardDescription}>
              {t("sos.sortedBy")}
            </Text>
            {filtered.length > 0 && (
              <View style={styles.viewToggleRow}>
                <Pressable
                  style={[styles.viewToggleBtn, view === "list" && styles.viewToggleBtnActive]}
                  onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setSetting("poiView", "list"); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: view === "list" }}
                  accessibilityLabel={t("common.viewList")}
                >
                  <Text style={[styles.viewToggleText, view === "list" && styles.viewToggleTextActive]}>{t("common.viewList")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.viewToggleBtn, view === "map" && styles.viewToggleBtnActive]}
                  onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setSetting("poiView", "map"); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: view === "map" }}
                  accessibilityLabel={t("common.viewMap")}
                >
                  <Text style={[styles.viewToggleText, view === "map" && styles.viewToggleTextActive]}>{t("common.viewMap")}</Text>
                </Pressable>
              </View>
            )}
            {filtered.length === 0 ? (
                <Text style={styles.bodyText}>
                  {t("sos.noneInCategory")}
                </Text>
              ) : view === "map" ? (
                <POIMap
                  places={filtered}
                  userLocation={userLocation}
                  onPressPlace={setInfoPlace}
                  markerLabel={(p) => p.name}
                />
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
                        {fmtDistShort(place.distanceMeters ?? 0, settings.unitSystem)}
                      </Text>
                      <Pressable
                        style={styles.infoButton}
                        onPress={(e) => { e.stopPropagation(); Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setInfoPlace(place); }}
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
        </>
      )}

      {!loading && places.length === 0 && !error && (
        <Text style={styles.bodyText}>
          {t("sos.noResults")}
        </Text>
      )}
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
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(239,68,68,0.18)",
    color: COLORS.danger,
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
    fontSize: 40,
    fontFamily: FONTS.display,
    letterSpacing: 4,
  },
  subtitle: {
    color: COLORS.body,
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
    color: COLORS.danger,
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
    borderRadius: 10,
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
    color: COLORS.danger,
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
    backgroundColor: COLORS.danger,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: COLORS.danger,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: COLORS.white,
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
    color: COLORS.body,
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
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  segmentButtonActive: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  segmentText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: COLORS.white,
  },
  // ── Section card ─────────────────────────────────────────────────────
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
    color: "#555555",
    fontSize: 12,
    marginBottom: 14,
  },
  // ── Place row ────────────────────────────────────────────────────────
  placeRow: {
    backgroundColor: COLORS.bg,
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
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
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "600",
  },
  placeAddress: {
    color: COLORS.muted,
    fontSize: 12,
  },
  placePhone: {
    color: COLORS.danger,
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
    color: COLORS.danger,
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
    borderColor: "rgba(239,68,68,0.25)",
  },
  viewToggleBtnActive: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  viewToggleText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  viewToggleTextActive: {
    color: COLORS.white,
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
  shareButton: {
    marginTop: 10,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
  },
  shareButtonText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  // ── Large SOS button ─────────────────────────────────────────────
  bigSosButton: {
    backgroundColor: COLORS.danger,
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: "center",
    marginBottom: 14,
    shadowColor: COLORS.danger,
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  bigSosText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 22,
    letterSpacing: 2,
  },
  bigSosNumber: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 30,
    letterSpacing: 3,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
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
    color: COLORS.danger,
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
    borderColor: COLORS.danger,
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
    backgroundColor: COLORS.white,
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
    borderColor: COLORS.danger,
  },
  instructionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  instructionsTitle: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 0.5,
  },
  instructionsClose: {
    color: COLORS.danger,
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
