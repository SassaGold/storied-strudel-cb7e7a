const Haptics: any = (() => {
  try { return require("expo-haptics"); }
  catch { return null; }
})();

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haversineMeters } from "../../lib/overpass";

type TripRecord = {
  date: string;
  duration: string;
  distanceKm: string;
};

export default function TripLoggerScreen() {
  const insets = useSafeAreaInsets();
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const lastLocation = useRef<{ latitude: number; longitude: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  const formatElapsed = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
  };

  const startTrip = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status === "denied") return;

    Haptics?.impactAsync(Haptics?.ImpactFeedbackStyle?.Medium);
    setElapsedSeconds(0);
    setDistanceMeters(0);
    lastLocation.current = null;
    setIsRunning(true);

    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    locationSubRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
      (loc) => {
        const { latitude, longitude } = loc.coords;
        if (lastLocation.current) {
          const delta = haversineMeters(lastLocation.current.latitude, lastLocation.current.longitude, latitude, longitude);
          setDistanceMeters((d) => d + delta);
        }
        lastLocation.current = { latitude, longitude };
      }
    );
  }, []);

  const stopTrip = useCallback(() => {
    Haptics?.impactAsync(Haptics?.ImpactFeedbackStyle?.Medium);
    setIsRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (locationSubRef.current) locationSubRef.current.remove();

    setTrips((prev) => [
      {
        date: new Date().toLocaleString(),
        duration: formatElapsed(elapsedSeconds),
        distanceKm: (distanceMeters / 1000).toFixed(2),
      },
      ...prev,
    ]);
  }, [elapsedSeconds, distanceMeters]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (locationSubRef.current) locationSubRef.current.remove();
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerGlowSecondary} />
        <Text style={styles.headerBadge}>Track</Text>
        <Text style={styles.title}>Trip Logger</Text>
        <Text style={styles.subtitle}>Track your motorcycle journey.</Text>
      </View>

      {isRunning && (
        <View style={styles.liveCard}>
          <Text style={styles.liveLabel}>Elapsed</Text>
          <Text style={styles.liveValue}>{formatElapsed(elapsedSeconds)}</Text>
          <Text style={styles.liveLabel}>Distance</Text>
          <Text style={styles.liveValue}>{(distanceMeters / 1000).toFixed(2)} km</Text>
        </View>
      )}

      <Pressable
        style={[styles.tripButton, isRunning ? styles.stopButton : styles.startButton]}
        onPress={isRunning ? stopTrip : startTrip}
      >
        <Text style={styles.tripButtonText}>{isRunning ? "Stop Trip" : "Start Trip"}</Text>
      </Pressable>

      {trips.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>Trip Log</Text>
          {trips.map((trip, i) => (
            <View key={i} style={styles.tripCard}>
              <Text style={styles.tripDate}>{trip.date}</Text>
              <View style={styles.tripRow}>
                <Text style={styles.metaText}>Duration: {trip.duration}</Text>
                <Text style={styles.metaText}>Distance: {trip.distanceKm} km</Text>
              </View>
            </View>
          ))}
        </View>
      )}
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
  liveCard: {
    backgroundColor: "#1b1030",
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2d1b4d",
    alignItems: "center",
  },
  liveLabel: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 8,
  },
  liveValue: {
    color: "#f8fafc",
    fontSize: 32,
    fontWeight: "700",
  },
  tripButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 24,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  startButton: {
    backgroundColor: "#22c55e",
    shadowColor: "#22c55e",
  },
  stopButton: {
    backgroundColor: "#ef4444",
    shadowColor: "#ef4444",
  },
  tripButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  tripCard: {
    backgroundColor: "#1b1030",
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  tripDate: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  tripRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaText: {
    color: "#94a3b8",
    fontSize: 13,
  },
});
