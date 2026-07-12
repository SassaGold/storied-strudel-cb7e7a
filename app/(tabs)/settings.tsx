import type { ComponentProps } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings } from "../../lib/settings";
import type { DefaultTab, UnitSystem } from "../../lib/settings";
import i18n, { saveLanguage, SUPPORTED_LANGS } from "../../lib/i18n";
import { storage } from "../../lib/storage";
import { COLORS } from "../../lib/theme";
import HeaderBackdrop from "../../components/HeaderBackdrop";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

const RADIUS_OPTIONS = [2, 5, 10, 15, 20] as const;

type IoniconName = ComponentProps<typeof Ionicons>["name"];

// Icons mirror the tab bar (app/(tabs)/_layout.tsx) so the chips read as the
// same destinations.
const DEFAULT_TAB_OPTIONS: { key: DefaultTab; icon: IoniconName; labelKey: string }[] = [
  { key: "index", icon: "compass", labelKey: "tabs.home" },
  { key: "restaurants", icon: "restaurant", labelKey: "tabs.food" },
  { key: "hotels", icon: "bed", labelKey: "tabs.sleep" },
  { key: "attractions", icon: "flag", labelKey: "tabs.explore" },
  { key: "mc", icon: "speedometer", labelKey: "tabs.garage" },
  { key: "triplogger", icon: "navigate", labelKey: "tabs.trip" },
  { key: "emergency", icon: "alert-circle", labelKey: "tabs.sos" },
];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { settings, setSetting } = useSettings();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const clearCache = async () => {
    try {
      const keys = await storage.getAllKeys();
      await storage.multiRemove(keys.filter((k) => k.startsWith("cache_")));
      Alert.alert(t("settings.clearCacheSuccess"), t("settings.clearCacheSuccessMsg"));
    } catch {
      // silently ignore
    }
  };

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <HeaderBackdrop />
        <Text style={styles.headerBadge}>{t("settings.badge")}</Text>
        <Text style={styles.title}>{t("settings.title")}</Text>
        <Text style={styles.subtitle}>{t("settings.subtitle")}</Text>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.back(); }}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.brand} />
          <Text style={styles.backBtnLabel} accessibilityElementsHidden importantForAccessibility="no">{t("common.back")}</Text>
        </Pressable>
      </View>

      {/* ── Units ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.units")}</Text>
        <Text style={styles.sectionDesc}>{t("settings.unitsDesc")}</Text>
        <View style={styles.chipRow}>
          {(["metric", "imperial"] as UnitSystem[]).map((u) => (
            <Pressable
              key={u}
              style={({ pressed }) => [
                styles.chip,
                settings.unitSystem === u && styles.chipActive,
                pressed && styles.chipPressed,
              ]}
              onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setSetting("unitSystem", u); }}
              accessibilityRole="button"
              accessibilityState={{ selected: settings.unitSystem === u }}
            >
              <Text style={[styles.chipText, settings.unitSystem === u && styles.chipTextActive]}>
                {t(`settings.unit_${u}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Search radius ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.searchRadius")}</Text>
        <Text style={styles.sectionDesc}>{t("settings.searchRadiusDesc")}</Text>
        <View style={styles.chipRow}>
          {RADIUS_OPTIONS.map((r) => (
            <Pressable
              key={r}
              style={({ pressed }) => [
                styles.chip,
                settings.searchRadiusKm === r && styles.chipActive,
                pressed && styles.chipPressed,
              ]}
              onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setSetting("searchRadiusKm", r); }}
              accessibilityRole="button"
              accessibilityState={{ selected: settings.searchRadiusKm === r }}
            >
              <Text style={[styles.chipText, settings.searchRadiusKm === r && styles.chipTextActive]}>
                {settings.unitSystem === "imperial" ? `${(r * 0.621371).toFixed(1)} mi` : `${r} km`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Default tab ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.defaultTab")}</Text>
        <Text style={styles.sectionDesc}>{t("settings.defaultTabDesc")}</Text>
        <View style={styles.chipRow}>
          {DEFAULT_TAB_OPTIONS.map(({ key, icon, labelKey }) => (
            <Pressable
              key={key}
              style={({ pressed }) => [
                styles.chip,
                styles.tabChip,
                settings.defaultTab === key && styles.chipActive,
                pressed && styles.chipPressed,
              ]}
              onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setSetting("defaultTab", key); }}
              accessibilityRole="button"
              accessibilityState={{ selected: settings.defaultTab === key }}
            >
              <Ionicons
                name={icon}
                size={14}
                color={settings.defaultTab === key ? COLORS.white : COLORS.brand}
              />
              <Text style={[styles.chipText, settings.defaultTab === key && styles.chipTextActive]}>
                {t(labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {/* ── Language ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.language")}</Text>
        <Text style={styles.sectionDesc}>{t("settings.languageDesc")}</Text>
        <View style={styles.chipRow}>
          {SUPPORTED_LANGS.map((lang) => (
            <Pressable
              key={lang}
              style={({ pressed }) => [
                styles.chip,
                i18n.language === lang && styles.chipActive,
                pressed && styles.chipPressed,
              ]}
              onPress={() => {
                Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                i18n.changeLanguage(lang);
                saveLanguage(lang);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: i18n.language === lang }}
            >
              <Text style={[styles.chipText, i18n.language === lang && styles.chipTextActive]}>
                {t(`language.${lang}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Clear Cache ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.clearCache")}</Text>
        <Text style={styles.sectionDesc}>{t("settings.clearCacheDesc")}</Text>
        <Pressable
          style={({ pressed }) => [styles.clearCacheButton, pressed && styles.clearCacheButtonPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null); clearCache(); }}
          accessibilityRole="button"
          accessibilityLabel={t("settings.clearCacheButton")}
        >
          <Text style={styles.clearCacheButtonText}>{t("settings.clearCacheButton")}</Text>
        </Pressable>
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
    marginBottom: 24,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    overflow: "hidden",
    backgroundColor: "#1a0900",
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,102,0,0.18)",
    color: COLORS.brand,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: 0.4,
  },
  backBtn: {
    alignSelf: "flex-end",
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,102,0,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
  },
  backBtnPressed: {
    backgroundColor: "rgba(255,102,0,0.35)",
  },
  backBtnLabel: {
    color: COLORS.brand,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  title: {
    color: COLORS.white,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  subtitle: {
    color: "#888888",
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.25)",
    backgroundColor: "#111111",
  },
  sectionTitle: {
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  sectionDesc: {
    color: "#888888",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
    backgroundColor: "rgba(255,102,0,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chipActive: {
    backgroundColor: COLORS.brand,
    borderColor: COLORS.brand,
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipText: {
    color: "#dddddd",
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: COLORS.white,
  },
  tabChip: {
    paddingHorizontal: 12,
  },
  clearCacheButton: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.5)",
    backgroundColor: "rgba(255,102,0,0.12)",
    alignSelf: "flex-start",
  },
  clearCacheButtonPressed: {
    opacity: 0.7,
  },
  clearCacheButtonText: {
    color: COLORS.brand,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
