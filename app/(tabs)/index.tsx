import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings } from "../../lib/settings";
import { useRiderHQ } from "../../lib/useRiderHQ";
import { ALERT_ICONS, DEFAULT_ALERT_ICON, REC_ICONS, DEFAULT_REC_ICON } from "../../lib/weather";
import WeatherCard, { HourlyForecastCard, DailyForecastCard } from "../../components/WeatherCard";
import SunCard from "../../components/SunCard";
import RoadConditionsCard from "../../components/RoadConditionsCard";
import { Haptics } from "../../lib/safeRequire";

/** Modern sans-serif font family: SF Pro on iOS, Roboto Black on Android, Inter on web */
const LOGO_FONT = Platform.select({ ios: "-apple-system", android: "sans-serif-black", web: "Inter, -apple-system, system-ui, sans-serif" });

export default function Index() {
  const { t, i18n } = useTranslation(["home","common"]);
  const router = useRouter();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const hasNavigated = useRef(false);
  const [langModalVisible, setLangModalVisible] = useState(false);

  const {
    loading,
    error,
    address,
    weather,
    location,
    lastUpdated,
    roadAlerts,
    alerts,
    suitability,
    recommendations,
    sunTimes,
    weatherUrl,
    loadData,
    openMaps,
  } = useRiderHQ();

  // Auto-load on mount
  useEffect(() => { loadData(); }, [loadData]);

  // Navigate to default tab on first render if configured
  useEffect(() => {
    if (hasNavigated.current) return;
    if (settings.defaultTab !== "index") {
      hasNavigated.current = true;
      router.replace(`/${settings.defaultTab}` as any);
    }
  }, [settings.defaultTab, router]);

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <View style={styles.headerTopRow}>
          <Pressable
            style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
            onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/about"); }}
            accessibilityRole="button"
            accessibilityLabel={t("tabs:about")}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.headerIconBtnText}>ℹ️</Text>
          </Pressable>
          <View style={styles.logoWrapper}>
            <Text style={styles.logoMoto}>🏍️</Text>
            <Text style={styles.logoTitle}>RIDER HQ</Text>
          </View>
          <View style={styles.headerTopRowRight}>
            <Pressable
              style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
              onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setLangModalVisible(true); }}
              accessibilityRole="button"
              accessibilityLabel={t("language:label")}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.headerIconBtnText}>🌐</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
              onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/settings"); }}
              accessibilityRole="button"
              accessibilityLabel={t("settings:title")}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.headerIconBtnText}>⚙️</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.logoSubtitle}>📍 WHERE AM I?</Text>
      </View>

      {/* ── Language selection modal ── */}
      <Modal
        visible={langModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <Pressable style={styles.langModalOverlay} onPress={() => setLangModalVisible(false)}>
          <View style={styles.langModalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.langModalTitle}>{t("language:label")}</Text>
            {(["en", "es", "de", "fr", "is", "no", "sv", "da"] as const).map((lang) => (
              <Pressable
                key={lang}
                style={({ pressed }) => [
                  styles.langModalOption,
                  i18n.language === lang && styles.langModalOptionActive,
                  pressed && styles.langModalOptionPressed,
                ]}
                onPress={() => {
                  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                  i18n.changeLanguage(lang);
                  setLangModalVisible(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={t(`language:${lang}`)}
                accessibilityState={{ selected: i18n.language === lang }}
              >
                <Text style={[styles.langModalOptionText, i18n.language === lang && styles.langModalOptionTextActive]}>
                  {t(`language:${lang}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Update button ── */}
      <Pressable style={styles.primaryButton} onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null); loadData(); }}>
        <Text style={styles.primaryButtonText}>
          {loading ? t("common:loading") : t("updateLocation")}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.loadingText}>{t("fetchingData")}</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* ── Location card ── */}
      {location && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("yourLocation")}</Text>
          <Text style={styles.bodyText}>
            {address?.displayName ?? t("addressNotAvailable")}
          </Text>
          <Text style={styles.metaText}>
            Lat {location.coords.latitude.toFixed(4)} · Lon {location.coords.longitude.toFixed(4)}
          </Text>
          <Text style={styles.metaText}>
            {t("accuracy", { value: Math.round(location.coords.accuracy ?? 0) })}
          </Text>
          <Pressable style={styles.secondaryButton} onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); openMaps(); }}>
            <Text style={styles.secondaryButtonText}>{t("common:openInMaps")}</Text>
          </Pressable>
        </View>
      )}

      {/* ── Weather card ── */}
      {weather && <WeatherCard weather={weather} weatherUrl={weatherUrl} />}

      {/* ── Sunrise / Sunset card ── */}
      {sunTimes && <SunCard sunTimes={sunTimes} />}

      {/* ── Riding Suitability card ── */}
      {weather && (
        <View style={[styles.card, styles.suitabilityCard, { borderColor: suitability.color }]}>
          <Text style={styles.cardTitle}>{t("ridingSuitability", { score: suitability.score })}</Text>
          <View style={[styles.suitabilityBadge, styles.suitabilityBadgeSelf, { backgroundColor: suitability.color }]}>
            <Text style={styles.suitabilityBadgeText}>{t(suitability.labelKey)}</Text>
          </View>
        </View>
      )}

      {/* ── Riding Alerts card ── */}
      {weather && alerts.length > 0 && (
        <View style={[styles.card, styles.alertCard]}>
          <Text style={styles.cardTitle}>{t("ridingAlerts")}</Text>
          {alerts.map((key) => (
            <Text key={key} style={styles.weatherBullet}>{ALERT_ICONS[key] ?? DEFAULT_ALERT_ICON} {t(key)}</Text>
          ))}
        </View>
      )}

      {/* ── Recommendations card ── */}
      {weather && recommendations.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("recommendations")}</Text>
          {recommendations.map((key) => (
            <Text key={key} style={styles.weatherBullet}>{REC_ICONS[key] ?? DEFAULT_REC_ICON} {t(key)}</Text>
          ))}
        </View>
      )}

      {/* ── Hourly forecast card ── */}
      {weather && <HourlyForecastCard weather={weather} />}

      {/* ── 3-Day forecast card ── */}
      {weather && <DailyForecastCard weather={weather} />}

      {lastUpdated && (
        <Text style={styles.metaText}>
          {t("lastUpdated", { time: lastUpdated.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) })}
        </Text>
      )}

      {/* ── Road Conditions card ── */}
      {lastUpdated && (
        <RoadConditionsCard loading={loading} roadAlerts={roadAlerts} location={location} />
      )}

      {/* ── Quick navigation grid ── */}
      <Text style={styles.quickNavLabel}>{t("quickNav")}</Text>
      <View style={styles.quickNavGrid}>
        <Pressable
          style={({ pressed }) => [styles.quickNavBtn, pressed && styles.quickNavBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/restaurants"); }}
          accessibilityRole="button"
          accessibilityLabel={t("tabs:food")}
        >
          <Text style={styles.quickNavEmoji}>🍽️</Text>
          <Text style={styles.quickNavText}>{t("tabs:food")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.quickNavBtn, pressed && styles.quickNavBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/hotels"); }}
          accessibilityRole="button"
          accessibilityLabel={t("tabs:sleep")}
        >
          <Text style={styles.quickNavEmoji}>🛏️</Text>
          <Text style={styles.quickNavText}>{t("tabs:sleep")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.quickNavBtn, pressed && styles.quickNavBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/attractions"); }}
          accessibilityRole="button"
          accessibilityLabel={t("tabs:explore")}
        >
          <Text style={styles.quickNavEmoji}>🏁</Text>
          <Text style={styles.quickNavText}>{t("tabs:explore")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.quickNavBtn, pressed && styles.quickNavBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/mc"); }}
          accessibilityRole="button"
          accessibilityLabel={t("tabs:garage")}
        >
          <Text style={styles.quickNavEmoji}>⚙️</Text>
          <Text style={styles.quickNavText}>{t("tabs:garage")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.quickNavBtn, pressed && styles.quickNavBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.navigate("/triplogger"); }}
          accessibilityRole="button"
          accessibilityLabel={t("tabs:trip")}
        >
          <Text style={styles.quickNavEmoji}>📏</Text>
          <Text style={styles.quickNavText}>{t("tabs:trip")}</Text>
        </Pressable>
      </View>
      <Pressable
        style={({ pressed }) => [styles.quickNavBtnSos, pressed && styles.quickNavBtnSosPressed]}
        onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null); router.navigate("/emergency"); }}
        accessibilityRole="button"
        accessibilityLabel={t("tabs:sos")}
      >
        <Text style={styles.quickNavEmoji}>🆘</Text>
        <Text style={styles.quickNavTextSos}>{t("tabs:sos")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, backgroundColor: "#0a0a0a" },
  container: { padding: 20, paddingBottom: 40, backgroundColor: "#0a0a0a" },
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
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
  headerIconBtnText: { fontSize: 18 },
  logoWrapper: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  logoMoto: { fontSize: 16, lineHeight: 20, textAlign: "center", marginRight: 6 },
  logoTitle: {
    color: "#ff6600",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.8,
    textAlign: "center",
    fontFamily: LOGO_FONT,
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
  primaryButtonText: { color: "#000000", fontSize: 16, fontWeight: "800", letterSpacing: 0.8 },
  secondaryButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#ff6600",
    backgroundColor: "rgba(255,102,0,0.08)",
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButtonText: { color: "#ff6600", fontSize: 14, fontWeight: "700" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  loadingText: { color: "#c8c8c8" },
  errorText: { color: "#f87171", marginBottom: 12 },
  card: {
    backgroundColor: "#141414",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  alertCard: { borderColor: "#ff6600", borderWidth: 1 },
  cardTitle: { color: "#ffffff", fontSize: 16, fontWeight: "800", marginBottom: 8, letterSpacing: 1 },
  bodyText: { color: "#c8c8c8", fontSize: 15, marginBottom: 4 },
  metaText: { color: "#666666", fontSize: 13 },
  weatherBullet: { color: "#c8c8c8", fontSize: 14, marginBottom: 2, paddingLeft: 4 },
  suitabilityCard: { borderWidth: 1 },
  suitabilityBadgeSelf: { alignSelf: "flex-start", marginBottom: 4 },
  suitabilityBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  suitabilityBadgeText: { color: "#fff", fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
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
    color: "#ff6600",
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
  langModalOptionActive: { borderColor: "#ff6600", backgroundColor: "rgba(255,102,0,0.12)" },
  langModalOptionPressed: { backgroundColor: "rgba(255,102,0,0.22)" },
  langModalOptionText: { color: "#888888", fontSize: 14, fontWeight: "600", textAlign: "center" },
  langModalOptionTextActive: { color: "#ff6600" },
  quickNavLabel: {
    color: "#666666",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 4,
  },
  quickNavGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  quickNavBtn: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  quickNavBtnPressed: { backgroundColor: "rgba(255,102,0,0.12)", borderColor: "#ff6600" },
  quickNavEmoji: { fontSize: 34 },
  quickNavText: { color: "#ffffff", fontSize: 15, fontWeight: "800", letterSpacing: 1 },
  quickNavBtnSos: {
    flexDirection: "row",
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 2,
    borderColor: "#ef4444",
    borderRadius: 14,
    paddingVertical: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 20,
  },
  quickNavBtnSosPressed: { backgroundColor: "rgba(239,68,68,0.25)" },
  quickNavTextSos: { color: "#ef4444", fontSize: 20, fontWeight: "900", letterSpacing: 2 },
});
