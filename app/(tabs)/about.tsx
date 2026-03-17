import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Updates: typeof import("expo-updates") | null = (() => { try { return require("expo-updates"); } catch { return null; } })();

const APP_VERSION: string =
  (Constants.expoConfig?.version ?? "2.0.0") as string;

type LinkRowProps = { label: string; url: string; openLabel: string };

function LinkRow({ label, url, openLabel }: LinkRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
      onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); Linking.openURL(url); }}
      accessibilityRole="link"
      accessibilityLabel={label}
    >
      <Text style={styles.linkLabel}>{label}</Text>
      <Text style={styles.linkAction}>{openLabel}</Text>
    </Pressable>
  );
}

type SectionProps = { title: string; children: React.ReactNode };

function Section({ title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function AboutScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "latest" | "error">("idle");

  // Sync update status from expo-updates if available
  useEffect(() => {
    const available = Updates?.useUpdates?.()?.isUpdateAvailable;
    if (available === true) setUpdateStatus("available");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkForUpdate() {
    if (!Updates || typeof Updates.checkForUpdateAsync !== "function") {
      setUpdateStatus("error");
      return;
    }
    setUpdateStatus("checking");
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        setUpdateStatus("available");
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } else {
        setUpdateStatus("latest");
      }
    } catch {
      setUpdateStatus("error");
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.badge}>{t("about.badge")}</Text>
        <Text style={styles.title}>{t("about.title")}</Text>
        <Text style={styles.subtitle}>{t("about.subtitle")}</Text>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); router.back(); }}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={18} color="#ff6600" />
          <Text style={styles.backBtnLabel} accessibilityElementsHidden importantForAccessibility="no">{t("common.back")}</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Data Sources */}
        <Section title={t("about.dataSources")}>

          {/* OpenStreetMap */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🗺️ {t("about.osm")}</Text>
            <Text style={styles.cardBody}>{t("about.osmDesc")}</Text>
            <Text style={styles.licenseText}>{t("about.osmLicense")}</Text>
            <LinkRow
              label="openstreetmap.org"
              url="https://www.openstreetmap.org"
              openLabel={t("about.openLink")}
            />
          </View>

          {/* Overpass API */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🔍 {t("about.overpass")}</Text>
            <Text style={styles.cardBody}>{t("about.overpassDesc")}</Text>
            <LinkRow
              label="overpass-api.de"
              url="https://overpass-api.de"
              openLabel={t("about.openLink")}
            />
          </View>

          {/* Open-Meteo */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⛅ {t("about.weather")}</Text>
            <Text style={styles.cardBody}>{t("about.weatherDesc")}</Text>
            <Text style={styles.licenseText}>{t("about.weatherLicense")}</Text>
            <LinkRow
              label="open-meteo.com"
              url="https://open-meteo.com"
              openLabel={t("about.openLink")}
            />
          </View>

          {/* Wikipedia */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📖 {t("about.wikipedia")}</Text>
            <Text style={styles.cardBody}>{t("about.wikipediaDesc")}</Text>
            <Text style={styles.licenseText}>{t("about.wikiLicense")}</Text>
            <LinkRow
              label="wikipedia.org"
              url="https://www.wikipedia.org"
              openLabel={t("about.openLink")}
            />
          </View>

          {/* Maps */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📍 {t("about.maps")}</Text>
            <Text style={styles.cardBody}>{t("about.mapsDesc")}</Text>
          </View>
        </Section>

        {/* Privacy */}
        <Section title={t("about.privacy")}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🔒 {t("about.privacyTitle")}</Text>
            <Text style={styles.cardBody}>{t("about.privacyP1")}</Text>
            <View style={styles.divider} />
            <Text style={styles.cardBody}>{t("about.privacyP2")}</Text>
            <View style={styles.divider} />
            <Text style={styles.cardBody}>{t("about.privacyP3")}</Text>
            <View style={styles.divider} />
            <Text style={styles.cardBody}>{t("about.privacyP4")}</Text>
          </View>
        </Section>

        {/* Open-source credits */}
        <Section title={t("about.credits")}>
          <View style={styles.card}>
            <Text style={styles.cardBody}>{t("about.creditsBody")}</Text>
            <View style={styles.chipsRow}>
              {[
                "Expo",
                "React Native",
                "expo-location",
                "react-native-maps",
                "AsyncStorage",
                "i18next",
              ].map((lib) => (
                <View key={lib} style={styles.chip}>
                  <Text style={styles.chipText}>{lib}</Text>
                </View>
              ))}
            </View>
          </View>
        </Section>

        {/* Legal */}
        <Section title={t("about.legal")}>
          <View style={styles.card}>
            <Text style={styles.cardBody}>{t("about.legalBody")}</Text>
          </View>
        </Section>

        {/* Version */}
        <View style={styles.versionRow}>
          <Text style={styles.versionLabel}>{t("about.version")}</Text>
          <Text style={styles.versionValue}>{APP_VERSION}</Text>
        </View>

        {/* Check for update */}
        <Pressable
          style={({ pressed }) => [styles.updateBtn, pressed && styles.updateBtnPressed]}
          onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); checkForUpdate(); }}
          disabled={updateStatus === "checking"}
          accessibilityRole="button"
          accessibilityLabel="Check for app update"
        >
          {updateStatus === "checking" ? (
            <ActivityIndicator size="small" color="#ff6600" />
          ) : (
            <Text style={styles.updateBtnText}>
              {updateStatus === "available" ? "⬇️ Update available — installing…" :
               updateStatus === "latest"    ? "✅ You're up to date" :
               updateStatus === "error"     ? "❌ Update check failed" :
               "🔄 Check for Update"}
            </Text>
          )}
        </Pressable>

        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },

  header: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#111",
    borderBottomWidth: 2,
    borderBottomColor: "#ff6600",
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
    color: "#ff6600",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  badge: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#ff6600",
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 13,
    color: "#888",
    marginTop: 4,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  section: { marginBottom: 20 },
  sectionTitle: {
    color: "#ff6600",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 10,
    marginTop: 4,
  },

  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    marginBottom: 8,
  },
  cardBody: {
    color: "#aaa",
    fontSize: 13,
    lineHeight: 20,
  },
  licenseText: {
    color: "#555",
    fontSize: 11,
    marginTop: 8,
    fontStyle: "italic",
  },
  divider: {
    height: 1,
    backgroundColor: "#2a2a2a",
    marginVertical: 10,
  },

  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#2a2a2a",
  },
  linkRowPressed: { opacity: 0.6 },
  linkLabel: {
    color: "#888",
    fontSize: 12,
    fontFamily: "monospace" as const,
  },
  linkAction: {
    color: "#ff6600",
    fontSize: 12,
    fontWeight: "700",
  },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  chip: {
    backgroundColor: "#2a2a2a",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    color: "#aaa",
    fontSize: 11,
    fontWeight: "600",
  },

  versionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
  },
  versionLabel: {
    color: "#555",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  versionValue: {
    color: "#ff6600",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "monospace" as const,
  },

  bottomPad: { height: 20 },

  updateBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    backgroundColor: "rgba(255,102,0,0.08)",
    marginTop: 8,
    marginBottom: 8,
    minHeight: 44,
  },
  updateBtnPressed: { opacity: 0.7 },
  updateBtnText: {
    color: "#ff6600",
    fontWeight: "700",
    fontSize: 14,
  },
});
