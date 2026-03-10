import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AboutScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>About</Text>
        <Text style={styles.title}>Leander</Text>
        <Text style={styles.subtitle}>Your trusted motorcycle travel companion</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Version</Text>
        <Text style={styles.cardBody}>1.0.0</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Description</Text>
        <Text style={styles.cardBody}>
          Leander is a motorcycle travel app built to help riders find what they need on the road.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Features</Text>
        {[
          "🍽️  Restaurant & café finder",
          "🏨  Hotel & accommodation search",
          "📸  Tourist attraction discovery",
          "🏍️  Motorcycle parking, fuel & workshops",
          "🚨  Emergency services locator",
          "📍  Trip logging & distance tracking",
          "🌍  5 languages supported",
        ].map((f, i) => (
          <Text key={i} style={styles.featureItem}>{f}</Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Languages</Text>
        <Text style={styles.cardBody}>English, Español, Deutsch, Français, Íslenska</Text>
      </View>

      <Text style={styles.copyright}>© 2025 Leander. All rights reserved.</Text>
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
  card: {
    backgroundColor: "#1b1030",
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  cardTitle: {
    color: "#38bdf8",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  cardBody: {
    color: "#e2e8f0",
    fontSize: 15,
  },
  featureItem: {
    color: "#e2e8f0",
    fontSize: 14,
    marginBottom: 6,
  },
  copyright: {
    color: "#475569",
    fontSize: 13,
    textAlign: "center",
    marginTop: 10,
  },
});
