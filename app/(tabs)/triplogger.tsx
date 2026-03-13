import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { haversineMeters, formatDistance } from "../../lib/overpass";

const Haptics = (() => {
  try { return require("expo-haptics"); } catch { return null; }
})();

function SpeedGauge({ speedKmh, maxSpeed = 200 }: { speedKmh: number; maxSpeed?: number }) {
  const pct = Math.min(speedKmh / maxSpeed, 1);
  const numTicks = 28;
  const sweepDeg = 240;
  const startAngle = 150;

  const getColor = (p: number) => {
    if (p < 0.5) {
      const r = Math.round(34 + (234 - 34) * (p / 0.5));
      const g = Math.round(197 + (179 - 197) * (p / 0.5));
      return `rgb(${r},${g},8)`;
    } else {
      const r = Math.round(234 + (239 - 234) * ((p - 0.5) / 0.5));
      const g = Math.round(179 + (68 - 179) * ((p - 0.5) / 0.5));
      return `rgb(${r},${g},8)`;
    }
  };

  const toRad = (d: number) => (d * Math.PI) / 180;
  const cx = 100, cy = 100, r = 80;

  return (
    <View style={gaugeStyles.container}>
      <View style={gaugeStyles.gauge}>
        {Array.from({ length: numTicks }).map((_, i) => {
          const angle = startAngle + (i / (numTicks - 1)) * sweepDeg;
          const tickPct = i / (numTicks - 1);
          const isActive = tickPct <= pct;
          const innerX = cx + (r - 12) * Math.cos(toRad(angle));
          const innerY = cy + (r - 12) * Math.sin(toRad(angle));
          const color = isActive ? getColor(tickPct) : "#2d2d4d";
          return (
            <View
              key={i}
              style={[
                gaugeStyles.tick,
                {
                  position: "absolute",
                  left: innerX + 95,
                  top: innerY + 95,
                  width: isActive ? 3 : 2,
                  height: isActive ? 12 : 10,
                  backgroundColor: color,
                  transform: [{ rotate: `${angle + 90}deg` }],
                  opacity: isActive ? 1 : 0.4,
                },
              ]}
            />
          );
        })}
        <View style={gaugeStyles.centerDisplay}>
          <Text style={[gaugeStyles.speedText, { color: getColor(pct) }]}>
            {Math.round(speedKmh)}
          </Text>
          <Text style={gaugeStyles.unitText}>km/h</Text>
        </View>
      </View>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginBottom: 16,
  },
  gauge: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "#140c24",
    borderWidth: 2,
    borderColor: "#2d1b4d",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  tick: {
    borderRadius: 2,
  },
  centerDisplay: {
    alignItems: "center",
    position: "absolute",
  },
  speedText: {
    fontSize: 48,
    fontWeight: "800",
    letterSpacing: -1,
  },
  unitText: {
    color: "#64748b",
    fontSize: 14,
    marginTop: -4,
  },
});

type RideRecord = {
  id: string;
  date: string;
  distanceKm: number;
  durationSec: number;
  avgSpeedKmh: number;
};

export default function TripLoggerScreen() {
  const insets = useSafeAreaInsets();
  const [recording, setRecording] = useState(false);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [rides, setRides] = useState<RideRecord[]>([]);

  const startTimeRef = useRef<number | null>(null);
  const lastCoordRef = useRef<{ lat: number; lon: number } | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const distanceMRef = useRef(0);
  distanceMRef.current = distanceM;

  const startRide = useCallback(async () => {
    Haptics?.impactAsync?.(Haptics?.ImpactFeedbackStyle?.Heavy);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status === "denied") return;

    setDistanceM(0);
    setDurationSec(0);
    setSpeedKmh(0);
    lastCoordRef.current = null;
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setDurationSec((s) => s + 1);
    }, 1000);

    locationSubRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
      (loc) => {
        const { latitude, longitude, speed } = loc.coords;
        setSpeedKmh(Math.max(0, (speed ?? 0) * 3.6));
        if (lastCoordRef.current) {
          const d = haversineMeters(lastCoordRef.current.lat, lastCoordRef.current.lon, latitude, longitude);
          setDistanceM((prev) => prev + d);
        }
        lastCoordRef.current = { lat: latitude, lon: longitude };
      }
    );

    setRecording(true);
  }, []);

  const stopRide = useCallback(() => {
    Haptics?.impactAsync?.(Haptics?.ImpactFeedbackStyle?.Heavy);
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    setSpeedKmh(0);

    const dur = durationSec;
    const dist = distanceMRef.current;
    if (dist > 10 || dur > 5) {
      const avgKmh = dur > 0 ? (dist / 1000) / (dur / 3600) : 0;
      const rec: RideRecord = {
        id: String(Date.now()),
        date: new Date().toLocaleDateString(),
        distanceKm: dist / 1000,
        durationSec: dur,
        avgSpeedKmh: avgKmh,
      };
      setRides((prev) => [rec, ...prev].slice(0, 20));
    }
  }, [durationSec]);

  useEffect(() => {
    return () => {
      locationSubRef.current?.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatDuration = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const avgSpeedKmh = durationSec > 0 ? (distanceM / 1000) / (durationSec / 3600) : 0;

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <Text style={styles.headerBadge}>Trip Logger</Text>
        <Text style={styles.title}>🏍️ Ride Tracker</Text>
        <Text style={styles.subtitle}>Track your motorcycle journeys</Text>
      </View>

      {/* Speed Gauge */}
      <SpeedGauge speedKmh={speedKmh} />

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>{(distanceM / 1000).toFixed(2)}</Text>
          <Text style={styles.statLabel}>km</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>{formatDuration(durationSec)}</Text>
          <Text style={styles.statLabel}>duration</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>{avgSpeedKmh.toFixed(1)}</Text>
          <Text style={styles.statLabel}>avg km/h</Text>
        </View>
      </View>

      {/* Start/Stop button */}
      <Pressable
        style={[styles.startBtn, recording && styles.stopBtn]}
        onPress={recording ? stopRide : startRide}
      >
        <Text style={styles.startBtnText}>{recording ? "⏹  STOP RIDE" : "▶  START RIDE"}</Text>
      </Pressable>

      {/* Ride history */}
      {rides.length > 0 && (
        <>
          <Text style={styles.historyTitle}>Ride History</Text>
          {rides.map((ride) => (
            <View key={ride.id} style={styles.rideCard}>
              <View style={styles.rideAccent} />
              <View style={styles.rideContent}>
                <Text style={styles.rideDate}>{ride.date}</Text>
                <View style={styles.rideStats}>
                  <View style={styles.rideStatChip}>
                    <Text style={styles.rideStatVal}>{ride.distanceKm.toFixed(2)}</Text>
                    <Text style={styles.rideStatLbl}>km</Text>
                  </View>
                  <View style={styles.rideStatChip}>
                    <Text style={styles.rideStatVal}>{formatDuration(ride.durationSec)}</Text>
                    <Text style={styles.rideStatLbl}>time</Text>
                  </View>
                  <View style={styles.rideStatChip}>
                    <Text style={styles.rideStatVal}>{ride.avgSpeedKmh.toFixed(1)}</Text>
                    <Text style={styles.rideStatLbl}>avg km/h</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </>
      )}

      {rides.length === 0 && !recording && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🏍️</Text>
          <Text style={styles.emptyText}>No rides recorded yet.</Text>
          <Text style={styles.emptySubText}>Tap START RIDE to begin tracking.</Text>
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
    backgroundColor: "#1a1040",
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.3)",
  },
  headerGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(249,115,22,0.25)",
    top: -60,
    right: -40,
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(249,115,22,0.2)",
    color: "#fb923c",
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
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  statChip: {
    flex: 1,
    backgroundColor: "#1b1030",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  statValue: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700",
  },
  statLabel: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 2,
  },
  startBtn: {
    backgroundColor: "#22c55e",
    borderRadius: 32,
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#22c55e",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  stopBtn: {
    backgroundColor: "#dc2626",
    shadowColor: "#dc2626",
  },
  startBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  historyTitle: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  rideCard: {
    flexDirection: "row",
    backgroundColor: "#1b1030",
    borderRadius: 14,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  rideAccent: {
    width: 4,
    backgroundColor: "#f97316",
  },
  rideContent: {
    flex: 1,
    padding: 12,
  },
  rideDate: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 8,
  },
  rideStats: {
    flexDirection: "row",
    gap: 8,
  },
  rideStatChip: {
    backgroundColor: "#140c24",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
  },
  rideStatVal: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
  rideStatLbl: {
    color: "#64748b",
    fontSize: 10,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
  },
  emptySubText: {
    color: "#64748b",
    fontSize: 14,
  },
});
