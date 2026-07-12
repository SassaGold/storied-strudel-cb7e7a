import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../lib/settings";
import { saveLanguage, SUPPORTED_LANGS } from "../../lib/i18n";
import { useRiderHQ } from "../../lib/useRiderHQ";
import { WeatherCard } from "../../components/WeatherCard";
import { SunCard } from "../../components/SunCard";
import { RoadConditionsCard } from "../../components/RoadConditionsCard";
import HeaderBackdrop from "../../components/HeaderBackdrop";

import { COLORS, FONTS } from "../../lib/theme";
const Haptics: typeof import("expo-haptics") | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-haptics");
  } catch {
    return null;
  }
})();

/** Modern sans-serif font family: Roboto Black on Android, Inter on web */
const LOGO_FONT = Platform.select({
  android: "sans-serif-black",
  web: "Inter, system-ui, sans-serif",
});

export default function Index() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { settings, isLoaded } = useSettings();
  const insets = useSafeAreaInsets();
  const hasNavigated = useRef(false);
  const autoLoadedRef = useRef(false);
  const [langModalVisible, setLangModalVisible] = useState(false);

  const {
    loading,
    error,
    address,
    weather,
    location,
    lastUpdated,
    roadAlerts,
    sunTimes,
    sunState,
    weatherUrl,
    loadData,
    cancelSearch,
  } = useRiderHQ();

  // Auto-load on the first focus AFTER the persisted settings are known.
  // Previously loadData() fired unconditionally on mount, wasting a GPS fix and
  // three network calls when the default-tab redirect below immediately
  // navigated away. hasNavigated covers the user returning here later.
  // (Defined before the redirect effect so a same-commit re-run cannot see
  // hasNavigated already set.)
  useFocusEffect(
    useCallback(() => {
      if (
        isLoaded &&
        !autoLoadedRef.current &&
        (settings.defaultTab === "index" || hasNavigated.current)
      ) {
        autoLoadedRef.current = true;
        loadData();
      }
      // Cancel any in-progress data fetch when the user navigates away.
      return () => { cancelSearch(); };
    }, [isLoaded, settings.defaultTab, loadData, cancelSearch])
  );

  // Navigate to default tab once, after settings have been read from storage
  // (before that, defaultTab is still the DEFAULT_SETTINGS value).
  useEffect(() => {
    if (!isLoaded || hasNavigated.current) return;
    hasNavigated.current = true;
    if (settings.defaultTab !== "index") {
      router.replace(`/${settings.defaultTab}` as any);
    }
  }, [isLoaded, settings.defaultTab, router]);

  const openMaps = useCallback(() => {
    if (!location) return;
    const { latitude, longitude } = location.coords;
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    ).catch(() => null);
  }, [location]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }, [loadData]);

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} colors={[COLORS.brand]} />
      }
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={styles.header}>
        <HeaderBackdrop />
        <View style={styles.headerTopRow}>
          <Pressable
            style={({ pressed }) => [
              styles.headerIconBtn,
              pressed && styles.headerIconBtnPressed,
            ]}
            onPress={() => {
              Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(
                () => null
              );
              router.navigate("/about");
            }}
            accessibilityRole="button"
            accessibilityLabel={t("tabs.about")}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="information-circle-outline" size={22} color={COLORS.brand} />
          </Pressable>

          <View style={styles.logoWrapper}>
            <Text style={styles.logoMoto}>🏍️</Text>
            <Text style={styles.logoTitle}>RIDER HQ</Text>
          </View>

          <View style={styles.headerTopRowRight}>
            <Pressable
              style={({ pressed }) => [
                styles.headerIconBtn,
                pressed && styles.headerIconBtnPressed,
              ]}
              onPress={() => {
                Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(
                  () => null
                );
                setLangModalVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t("language.label")}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="globe-outline" size={20} color={COLORS.brand} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.headerIconBtn,
                pressed && styles.headerIconBtnPressed,
              ]}
              onPress={() => {
                Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(
                  () => null
                );
                router.navigate("/settings");
              }}
              accessibilityRole="button"
              accessibilityLabel={t("settings.title")}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="settings-outline" size={20} color={COLORS.brand} />
            </Pressable>
          </View>
        </View>
        <Text style={styles.logoSubtitle}>Where Am I – Explore. Ride. Discover</Text>
      </View>

      {/* ── Language picker modal ─────────────────────────────────── */}
      <Modal
        visible={langModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <Pressable
          style={styles.langModalOverlay}
          onPress={() => setLangModalVisible(false)}
        >
          <View
            style={styles.langModalContent}
            onStartShouldSetResponder={() => true}
            accessibilityViewIsModal
          >
            <Text style={styles.langModalTitle} accessibilityRole="header">{t("language.label")}</Text>
            {SUPPORTED_LANGS.map((lang) => (
              <Pressable
                key={lang}
                style={({ pressed }) => [
                  styles.langModalOption,
                  i18n.language === lang && styles.langModalOptionActive,
                  pressed && styles.langModalOptionPressed,
                ]}
                onPress={() => {
                  Haptics?.impactAsync(
                    Haptics.ImpactFeedbackStyle.Light
                  )?.catch(() => null);
                  i18n.changeLanguage(lang);
                  saveLanguage(lang);
                  setLangModalVisible(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={t(`language.${lang}`)}
                accessibilityState={{ selected: i18n.language === lang }}
              >
                <Text
                  style={[
                    styles.langModalOptionText,
                    i18n.language === lang && styles.langModalOptionTextActive,
                  ]}
                >
                  {t(`language.${lang}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Refresh button ────────────────────────────────────────── */}
      <Pressable
        style={styles.primaryButton}
        onPress={() => {
          Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium)?.catch(
            () => null
          );
          loadData();
        }}
        accessibilityRole="button"
        accessibilityLabel={t("home.updateLocation")}
        accessibilityState={{ busy: loading }}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? t("common.loading") : t("home.updateLocation")}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>{t("home.fetchingData")}</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* ── Location card ─────────────────────────────────────────── */}
      {location && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("home.yourLocation")}</Text>
          <Text style={styles.bodyText}>
            {address?.displayName ?? t("home.addressNotAvailable")}
          </Text>
          <Text style={styles.metaText}>
            Lat {location.coords.latitude.toFixed(5)} · Lon{" "}
            {location.coords.longitude.toFixed(5)}
          </Text>
          {location.coords.accuracy != null && (
            <Text style={styles.metaText}>
              {t("home.accuracy", {
                value: Math.round(location.coords.accuracy),
              })}
            </Text>
          )}
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(
                () => null
              );
              openMaps();
            }}
            accessibilityRole="button"
            accessibilityLabel={t("common.openInMaps")}
          >
            <Text style={styles.secondaryButtonText}>
              {t("common.openInMaps")}
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Weather, suitability, alerts, forecasts ───────────────── */}
      {weather && <WeatherCard weather={weather} weatherUrl={weatherUrl} />}

      {/* ── Sunrise / sunset ──────────────────────────────────────── */}
      {location && <SunCard sunTimes={sunTimes} polarState={sunState} />}

      {lastUpdated && (
        <Text style={styles.metaText}>
          {t("home.lastUpdated", { time: lastUpdated.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) })}
        </Text>
      )}

      {/* ── Road conditions ───────────────────────────────────────── */}
      {lastUpdated && (
        <RoadConditionsCard
          loading={loading}
          roadAlerts={roadAlerts}
          searchRadiusKm={settings.searchRadiusKm}
          unitSystem={settings.unitSystem}
          location={location}
        />
      )}

      {/* ── Quick navigation grid ─────────────────────────────────── */}
      <Text style={styles.quickNavLabel}>{t("home.quickNav")}</Text>
      <View style={styles.quickNavGrid}>
        {(
          [
            { route: "/restaurants", icon: "restaurant", key: "tabs.food" },
            { route: "/hotels", icon: "bed", key: "tabs.sleep" },
            { route: "/attractions", icon: "flag", key: "tabs.explore" },
            { route: "/mc", icon: "speedometer", key: "tabs.garage" },
            { route: "/triplogger", icon: "navigate", key: "tabs.trip" },
          ] as const
        ).map(({ route, icon, key }) => (
          <Pressable
            key={route}
            style={({ pressed }) => [
              styles.quickNavBtn,
              pressed && styles.quickNavBtnPressed,
            ]}
            onPress={() => {
              Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(
                () => null
              );
              router.navigate(route);
            }}
            accessibilityRole="button"
            accessibilityLabel={t(key)}
          >
            <Ionicons name={icon} size={22} color={COLORS.brand} />
            <Text style={styles.quickNavText}>{t(key)}</Text>
          </Pressable>
        ))}
        <Pressable
          style={({ pressed }) => [
            styles.quickNavBtnSos,
            pressed && styles.quickNavBtnSosPressed,
          ]}
          onPress={() => {
            Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium)?.catch(
              () => null
            );
            router.navigate("/emergency");
          }}
          accessibilityRole="button"
          accessibilityLabel={t("tabs.sos")}
        >
          <Ionicons name="alert-circle" size={22} color={COLORS.danger} />
          <Text style={styles.quickNavTextSos}>{t("tabs.sos")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, backgroundColor: COLORS.bg, overflow: "hidden" },
  container: { padding: 20, backgroundColor: COLORS.bg },
  // ── Header ──────────────────────────────────────────────────────
  header: {
    marginTop: 18,
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    overflow: "hidden",
    backgroundColor: "#1a0900",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTopRowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,102,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconBtnPressed: { backgroundColor: "rgba(255,102,0,0.40)" },
  logoWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  logoMoto: { fontSize: 16, lineHeight: 20, textAlign: "center", marginRight: 6 },
  logoTitle: {
    color: COLORS.brand,
    fontSize: 17,
    letterSpacing: 1.8,
    textAlign: "center",
    fontFamily: FONTS.display,
    textShadowColor: "rgba(255,102,0,0.50)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  logoSubtitle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2.5,
    textAlign: "center",
    marginTop: 4,
    fontFamily: LOGO_FONT,
  },
  // ── Buttons ──────────────────────────────────────────────────────
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
  secondaryButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.brand,
    backgroundColor: "rgba(255,102,0,0.08)",
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButtonText: { color: COLORS.brand, fontSize: 14, fontWeight: "700" },
  // ── Loading / error ───────────────────────────────────────────────
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  loadingText: { color: COLORS.body },
  errorText: { color: "#f87171", marginBottom: 12 },
  // ── Generic card ──────────────────────────────────────────────────
  card: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  cardTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: 1,
  },
  bodyText: { color: COLORS.body, fontSize: 15, marginBottom: 4 },
  metaText: { color: COLORS.muted, fontSize: 13 },
  // ── Language modal ────────────────────────────────────────────────
  langModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  langModalContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    padding: 20,
    width: 260,
  },
  langModalTitle: {
    color: COLORS.brand,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 14,
    textAlign: "center",
  },
  langModalOption: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333333",
    backgroundColor: "#111111",
    marginBottom: 8,
  },
  langModalOptionActive: {
    borderColor: COLORS.brand,
    backgroundColor: "rgba(255,102,0,0.12)",
  },
  langModalOptionPressed: { backgroundColor: "rgba(255,102,0,0.22)" },
  langModalOptionText: {
    color: "#888888",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  langModalOptionTextActive: { color: COLORS.brand },
  // ── Quick nav grid ────────────────────────────────────────────────
  quickNavLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 4,
  },
  quickNavGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  quickNavBtn: {
    width: "47%",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  quickNavBtnPressed: {
    backgroundColor: "rgba(255,102,0,0.12)",
    borderColor: COLORS.brand,
  },
  quickNavText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  quickNavBtnSos: {
    width: "47%",
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 2,
    borderColor: COLORS.danger,
    borderRadius: 14,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  quickNavBtnSosPressed: { backgroundColor: "rgba(239,68,68,0.25)" },
  quickNavTextSos: {
    color: COLORS.danger,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 2,
  },
});
