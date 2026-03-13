import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AboutScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <Text style={styles.heroIcon}>🏍️</Text>
        <Text style={styles.heroTitle}>Roamly</Text>
        <Text style={styles.heroVersion}>Version 2.0.0</Text>
        <Text style={styles.heroTagline}>The Biker's Companion App</Text>
      </View>

      {/* About */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>What is Roamly?</Text>
        <Text style={styles.cardText}>
          Roamly is a motorcycle companion app that helps riders find everything they need on the road — 
          restaurants, hotels, attractions, fuel stations, MC workshops, and emergency services.
        </Text>
        <Text style={styles.cardText}>
          Built with a focus on simplicity, speed, and reliability for riders on the go.
        </Text>
      </View>

      {/* Features */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>✨ Features</Text>
        {[
          ["🧭", "RIDER HQ", "Live weather, location, and POI overview"],
          ["🍽️", "Restaurants", "Find cafés and restaurants nearby"],
          ["🏨", "Hotels", "Discover hotels and guest houses"],
          ["📸", "Attractions", "Tourist spots and viewpoints"],
          ["🏍️", "MC Zone", "Parking, fuel, and workshops"],
          ["🆘", "Emergency SOS", "Call 112 and access first aid"],
          ["📊", "Trip Logger", "Track your rides with GPS"],
          ["⚙️", "Settings", "Customize your experience"],
        ].map(([icon, name, desc]) => (
          <View key={name} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{icon}</Text>
            <View style={styles.featureInfo}>
              <Text style={styles.featureName}>{name}</Text>
              <Text style={styles.featureDesc}>{desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Data sources */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📡 Data Sources</Text>
        <Pressable onPress={() => Linking.openURL("https://www.openstreetmap.org").catch(() => null)}>
          <Text style={styles.linkText}>🗺️ OpenStreetMap (POI data)</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL("https://open-meteo.com").catch(() => null)}>
          <Text style={styles.linkText}>🌤️ Open-Meteo (Weather)</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL("https://overpass-api.de").catch(() => null)}>
          <Text style={styles.linkText}>🔍 Overpass API</Text>
        </Pressable>
      </View>

      {/* Credits */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👨‍💻 Built With</Text>
        <Text style={styles.cardText}>React Native + Expo</Text>
        <Text style={styles.cardText}>expo-router · expo-location · expo-haptics</Text>
        <Text style={styles.cardText}>react-native-maps · react-native-safe-area-context</Text>
      </View>

      <Text style={styles.footer}>Made with ❤️ for riders everywhere</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: "#0f0a1a",
  },
  hero: {
    backgroundColor: "#1a1040",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    marginBottom: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.3)",
  },
  heroGlow: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(249,115,22,0.15)",
    top: -80,
  },
  heroIcon: {
    fontSize: 52,
    marginBottom: 8,
  },
  heroTitle: {
    color: "#f8fafc",
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroVersion: {
    color: "#f97316",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  heroTagline: {
    color: "#94a3b8",
    fontSize: 14,
    marginTop: 6,
  },
  card: {
    backgroundColor: "#1b1030",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  cardTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  cardText: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 6,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 12,
  },
  featureIcon: {
    fontSize: 20,
    marginTop: 1,
  },
  featureInfo: {
    flex: 1,
  },
  featureName: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600",
  },
  featureDesc: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 2,
  },
  linkText: {
    color: "#38bdf8",
    fontSize: 14,
    marginBottom: 8,
    textDecorationLine: "underline",
  },
  footer: {
    color: "#374151",
    textAlign: "center",
    fontSize: 13,
    marginTop: 8,
  },
});
