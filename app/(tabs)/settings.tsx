import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Haptics = (() => {
  try { return require("expo-haptics"); } catch { return null; }
})();

type Language = "en" | "de" | "fr" | "es" | "nl";
type Units = "metric" | "imperial";

const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
];

const RADII = [
  { label: "2 km", value: 2000 },
  { label: "5 km", value: 5000 },
  { label: "10 km", value: 10000 },
  { label: "25 km", value: 25000 },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [language, setLanguage] = useState<Language>("en");
  const [units, setUnits] = useState<Units>("metric");
  const [radius, setRadius] = useState(5000);

  const selectLanguage = (lang: Language) => {
    Haptics?.selectionAsync?.();
    setLanguage(lang);
  };

  const selectUnits = (u: Units) => {
    Haptics?.selectionAsync?.();
    setUnits(u);
  };

  const selectRadius = (r: number) => {
    Haptics?.selectionAsync?.();
    setRadius(r);
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <Text style={styles.headerBadge}>Preferences</Text>
        <Text style={styles.title}>⚙️ Settings</Text>
        <Text style={styles.subtitle}>Customize your Roamly experience</Text>
      </View>

      {/* Language */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🌐 Language</Text>
        <View style={styles.chipsRow}>
          {LANGUAGES.map((l) => (
            <Pressable
              key={l.code}
              style={[styles.chip, language === l.code && styles.chipActive]}
              onPress={() => selectLanguage(l.code)}
            >
              <Text style={styles.chipFlag}>{l.flag}</Text>
              <Text style={[styles.chipText, language === l.code && styles.chipTextActive]}>
                {l.code.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Units */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📏 Units</Text>
        <View style={styles.chipsRow}>
          {(["metric", "imperial"] as Units[]).map((u) => (
            <Pressable
              key={u}
              style={[styles.chip, units === u && styles.chipActive]}
              onPress={() => selectUnits(u)}
            >
              <Text style={[styles.chipText, units === u && styles.chipTextActive]}>
                {u === "metric" ? "Metric (km)" : "Imperial (mi)"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Search Radius */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔍 Search Radius</Text>
        <View style={styles.chipsRow}>
          {RADII.map((r) => (
            <Pressable
              key={r.value}
              style={[styles.chip, radius === r.value && styles.chipActive]}
              onPress={() => selectRadius(r.value)}
            >
              <Text style={[styles.chipText, radius === r.value && styles.chipTextActive]}>
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Info cards */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>About Roamly</Text>
        <Text style={styles.infoText}>Version 2.0.0</Text>
        <Text style={styles.infoText}>Built for motorcycle enthusiasts</Text>
        <Text style={styles.infoText}>POI data from OpenStreetMap via Overpass API</Text>
        <Text style={styles.infoText}>Weather data from Open-Meteo</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: "#0f0a1a",
  },
  header: {
    backgroundColor: "#1a1040",
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.3)",
  },
  headerGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(99,102,241,0.25)",
    top: -60,
    right: -40,
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(99,102,241,0.2)",
    color: "#a5b4fc",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  title: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 14,
    marginTop: 4,
  },
  section: {
    backgroundColor: "#1b1030",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#140c24",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  chipActive: {
    backgroundColor: "#4f46e5",
    borderColor: "#6366f1",
  },
  chipFlag: {
    fontSize: 14,
  },
  chipText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#fff",
  },
  infoCard: {
    backgroundColor: "#1b1030",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  infoTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  infoText: {
    color: "#64748b",
    fontSize: 13,
    marginBottom: 4,
  },
});
