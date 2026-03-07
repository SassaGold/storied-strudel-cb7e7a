import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useSettings } from "../../lib/settings";
import type { DefaultTab, UnitSystem } from "../../lib/settings";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

const RADIUS_OPTIONS = [2, 5, 10, 15, 20] as const;

const DEFAULT_TAB_OPTIONS: { key: DefaultTab; emoji: string; labelKey: string }[] = [
  { key: "index", emoji: "🧭", labelKey: "tabs.home" },
  { key: "restaurants", emoji: "🍽️", labelKey: "tabs.food" },
  { key: "hotels", emoji: "🛏️", labelKey: "tabs.sleep" },
  { key: "attractions", emoji: "🏁", labelKey: "tabs.explore" },
  { key: "mc", emoji: "⚙️", labelKey: "tabs.garage" },
  { key: "triplogger", emoji: "📏", labelKey: "tabs.trip" },
  { key: "emergency", emoji: "🆘", labelKey: "tabs.sos" },
];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { settings, setSetting } = useSettings();
  const router = useRouter();

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backBtnText}>{t("common.back")}</Text>
        </Pressable>
        <Text style={styles.headerBadge}>{t("settings.badge")}</Text>
        <Text style={styles.title}>{t("settings.title")}</Text>
        <Text style={styles.subtitle}>{t("settings.subtitle")}</Text>
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
          {DEFAULT_TAB_OPTIONS.map(({ key, emoji, labelKey }) => (
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
              <Text style={styles.tabChipEmoji}>{emoji}</Text>
              <Text style={[styles.chipText, settings.defaultTab === key && styles.chipTextActive]}>
                {t(labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
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
    marginBottom: 24,
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
  backBtn: {
    alignSelf: "flex-start",
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,102,0,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
  },
  backBtnPressed: {
    backgroundColor: "rgba(255,102,0,0.35)",
  },
  backBtnText: {
    color: "#ff6600",
    fontSize: 16,
    fontWeight: "700",
  },
  title: {
    color: "#ffffff",
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
    color: "#ff6600",
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
    backgroundColor: "#ff6600",
    borderColor: "#ff6600",
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
    color: "#ffffff",
  },
  tabChip: {
    paddingHorizontal: 12,
  },
  tabChipEmoji: {
    fontSize: 14,
  },
});
