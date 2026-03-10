const Haptics: any = (() => {
  try { return require("expo-haptics"); }
  catch { return null; }
})();

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings } from "../../lib/settings";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { unitSystem, setUnitSystem, searchRadiusKm, setSearchRadiusKm } = useSettings();

  const radiusOptions = [2, 5, 10, 20];

  const handleUnit = (val: "metric" | "imperial") => {
    Haptics?.impactAsync(Haptics?.ImpactFeedbackStyle?.Light);
    setUnitSystem(val);
  };

  const handleRadius = (val: number) => {
    Haptics?.impactAsync(Haptics?.ImpactFeedbackStyle?.Light);
    setSearchRadiusKm(val);
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>Preferences</Text>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Customize your experience.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Unit System</Text>
        <View style={styles.chipRow}>
          {(["metric", "imperial"] as const).map((val) => (
            <Pressable
              key={val}
              style={[styles.chip, unitSystem === val && styles.chipActive]}
              onPress={() => handleUnit(val)}
            >
              <Text style={[styles.chipText, unitSystem === val && styles.chipTextActive]}>
                {val === "metric" ? "Metric" : "Imperial"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Search Radius</Text>
        <View style={styles.chipRow}>
          {radiusOptions.map((val) => (
            <Pressable
              key={val}
              style={[styles.chip, searchRadiusKm === val && styles.chipActive]}
              onPress={() => handleRadius(val)}
            >
              <Text style={[styles.chipText, searchRadiusKm === val && styles.chipTextActive]}>
                {val} km
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Language</Text>
        <Text style={styles.bodyText}>
          Language is detected automatically from your device settings.
        </Text>
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
    marginBottom: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    backgroundColor: "#1e1b4b",
  },
  headerGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(99,102,241,0.55)",
    top: -80,
    right: -40,
  },
  headerGlowSecondary: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(139,92,246,0.45)",
    bottom: -60,
    left: -20,
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(15,10,26,0.35)",
    color: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: 0.4,
  },
  title: {
    color: "#f8fafc",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  subtitle: {
    color: "#c4b5fd",
    marginTop: 6,
    fontSize: 15,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#1b1030",
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  chipActive: {
    backgroundColor: "#38bdf8",
    borderColor: "#38bdf8",
  },
  chipText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#0f172a",
  },
  bodyText: {
    color: "#94a3b8",
    fontSize: 14,
  },
});
