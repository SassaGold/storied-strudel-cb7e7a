import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings, fmtDist, fmtSpeed } from "../../lib/settings";
import { haversineMeters } from "../../lib/overpass";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

// Safely load react-native-maps: requires a custom dev/production build.
let rnMaps: any = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { rnMaps = require("react-native-maps"); } catch {}
const MapView: any = rnMaps?.default;
const Polyline: any = rnMaps?.Polyline;
const PROVIDER_GOOGLE = rnMaps?.PROVIDER_GOOGLE ?? null;

// Safely load AsyncStorage
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage: any = (() => { try { return require("@react-native-async-storage/async-storage").default; } catch { return null; } })();

const STORAGE_KEY = "triplogger_rides_v1";

type GpsPoint = { latitude: number; longitude: number; timestamp: number };

type SavedRide = {
  id: string;
  date: string; // ISO string
  distanceKm: number;
  durationMs: number;
  avgSpeedKmh: number;
  route: GpsPoint[];
};

const formatDuration = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function TripLoggerScreen() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();

  // Recording state
  const [recording, setRecording] = useState(false);
  const [route, setRoute] = useState<GpsPoint[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [permError, setPermError] = useState(false);

  // History state
  const [rides, setRides] = useState<SavedRide[]>([]);
  const [mapRide, setMapRide] = useState<SavedRide | null>(null);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const routeRef = useRef<GpsPoint[]>([]);
  const distRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Load saved rides on mount
  useEffect(() => {
    loadRides();
  }, []);

  const loadRides = async () => {
    if (!AsyncStorage) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setRides(JSON.parse(raw));
    } catch {}
  };

  const saveRides = useCallback(async (updated: SavedRide[]) => {
    if (!AsyncStorage) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }, []);

  // Timer tick
  useEffect(() => {
    if (recording && startTime !== null) {
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTime);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording, startTime]);

  // Recording pulse animation
  useEffect(() => {
    if (recording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.25, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => { pulse.stop(); pulseAnim.setValue(1); };
    } else {
      pulseAnim.setValue(1);
    }
  }, [recording, pulseAnim]);

  const startRecording = useCallback(async () => {
    setPermError(false);

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setPermError(true);
      return;
    }

    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);

    // Reset state
    routeRef.current = [];
    distRef.current = 0;
    const now = Date.now();
    startTimeRef.current = now;
    setRoute([]);
    setDistanceKm(0);
    setElapsedMs(0);
    setStartTime(now);
    setCurrentSpeedKmh(null);
    setRecording(true);

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 5,       // emit every 5 m moved
        timeInterval: 3000,         // or every 3 s
      },
      (loc) => {
        const { latitude, longitude, speed, accuracy: acc } = loc.coords;
        const ts = loc.timestamp;

        // Update speed
        setCurrentSpeedKmh(speed != null && speed >= 0 ? speed * 3.6 : null);
        setAccuracy(acc ?? null);

        const prev = routeRef.current[routeRef.current.length - 1];
        const newPoint: GpsPoint = { latitude, longitude, timestamp: ts };

        if (prev) {
          const dist = haversineMeters(prev.latitude, prev.longitude, latitude, longitude);
          // Ignore jitter: only count if moved >= 3 m
          if (dist >= 3) {
            distRef.current += dist / 1000;
            setDistanceKm(distRef.current);
            routeRef.current = [...routeRef.current, newPoint];
            setRoute([...routeRef.current]);
          }
        } else {
          routeRef.current = [newPoint];
          setRoute([newPoint]);
        }
      },
    );
  }, []);

  const stopRecording = useCallback(async () => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
    const distKm = distRef.current;
    const avgSpeed = durationMs > 0 ? distKm / (durationMs / 3_600_000) : 0;

    setRecording(false);
    setCurrentSpeedKmh(null);

    if (distKm > 0.01) {
      Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      const ride: SavedRide = {
        id: String(Date.now()),
        date: new Date().toISOString(),
        distanceKm: Math.round(distKm * 100) / 100,
        durationMs,
        avgSpeedKmh: Math.round(avgSpeed * 10) / 10,
        route: routeRef.current,
      };
      const updated = [ride, ...rides];
      setRides(updated);
      await saveRides(updated);
    } else {
      Alert.alert(t("triplog.tooShortTitle"), t("triplog.tooShortMsg"));
    }
  }, [rides, saveRides, t]);

  const deleteRide = useCallback(async (id: string) => {
    const updated = rides.filter((r) => r.id !== id);
    setRides(updated);
    await saveRides(updated);
  }, [rides, saveRides]);

  const confirmClearAll = useCallback(() => {
    Alert.alert(
      t("triplog.confirmClear"),
      t("triplog.confirmClearMsg"),
      [
        { text: t("triplog.cancel"), style: "cancel" },
        {
          text: t("triplog.confirm"),
          style: "destructive",
          onPress: async () => {
            setRides([]);
            await saveRides([]);
          },
        },
      ],
    );
  }, [t, saveRides]);

  // Bounding region for map modal
  const mapRegion = mapRide && mapRide.route.length > 0
    ? (() => {
        const lats = mapRide.route.map((p) => p.latitude);
        const lons = mapRide.route.map((p) => p.longitude);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const minLon = Math.min(...lons), maxLon = Math.max(...lons);
        const pad = 0.002;
        return {
          latitude: (minLat + maxLat) / 2,
          longitude: (minLon + maxLon) / 2,
          latitudeDelta: Math.max(maxLat - minLat + pad, 0.005),
          longitudeDelta: Math.max(maxLon - minLon + pad, 0.005),
        };
      })()
    : null;

  const avgSpeedKmh = elapsedMs > 0
    ? distanceKm / (elapsedMs / 3_600_000)
    : 0;

  const isImperial = settings.unitSystem === "imperial";
  const distUnit = isImperial ? "mi" : t("triplog.km");
  const speedUnit = isImperial ? "mph" : t("triplog.kmh");
  const displayDistVal = distanceKm >= 0.01 ? fmtDist(distanceKm, settings.unitSystem).split(" ")[0] : "0.00";
  const displayCurSpeedVal = currentSpeedKmh != null ? fmtSpeed(currentSpeedKmh, settings.unitSystem).split(" ")[0] : "—";
  const displayAvgSpeedVal = avgSpeedKmh > 0 ? fmtSpeed(avgSpeedKmh, settings.unitSystem).split(" ")[0] : "—";

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.badge}>{t("triplog.badge")}</Text>
        <Text style={styles.title}>{t("triplog.title")}</Text>
        <Text style={styles.subtitle}>{t("triplog.subtitle")}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Live stats card */}
        <View style={styles.card}>
          {permError && (
            <Text style={styles.errorText}>{t("triplog.locationPermRequired")}</Text>
          )}

          {recording && (
            <View style={styles.trackingBadge}>
              <Animated.View style={[styles.recDot, { opacity: pulseAnim }]} />
              <Text style={styles.trackingText}>{t("triplog.tracking")}</Text>
            </View>
          )}

          <View style={styles.statsGrid}>
            <StatBox
              label={t("triplog.distance")}
              value={displayDistVal}
              unit={distUnit}
            />
            <StatBox
              label={t("triplog.duration")}
              value={formatDuration(elapsedMs)}
              unit=""
            />
            <StatBox
              label={t("triplog.currentSpeed")}
              value={displayCurSpeedVal}
              unit={speedUnit}
            />
            <StatBox
              label={t("triplog.avgSpeed")}
              value={displayAvgSpeedVal}
              unit={speedUnit}
            />
          </View>

          {recording && accuracy != null && (
            <Text style={styles.accuracyText}>
              {t("triplog.accuracy", { value: Math.round(accuracy) })}
            </Text>
          )}

          {recording && route.length > 1 && (
            <Text style={styles.accuracyText}>
              {t("triplog.points", { count: route.length })}
            </Text>
          )}

          {/* Inline map while recording */}
          {recording && route.length > 1 && MapView && (
            <View style={styles.inlineMap}>
              <MapView
                style={StyleSheet.absoluteFill}
                provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
                region={(() => {
                  const lats = route.map((p) => p.latitude);
                  const lons = route.map((p) => p.longitude);
                  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
                  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
                  const pad = 0.001;
                  return {
                    latitude: (minLat + maxLat) / 2,
                    longitude: (minLon + maxLon) / 2,
                    latitudeDelta: Math.max(maxLat - minLat + pad, 0.003),
                    longitudeDelta: Math.max(maxLon - minLon + pad, 0.003),
                  };
                })()}
                scrollEnabled={false}
                zoomEnabled={false}
                mapType="standard"
              >
                {Polyline && (
                  <Polyline
                    coordinates={route}
                    strokeColor="#ff6600"
                    strokeWidth={4}
                  />
                )}
              </MapView>
            </View>
          )}

          {/* Start / Stop button */}
          <Pressable
            style={({ pressed }) => [
              styles.mainBtn,
              recording ? styles.stopBtn : styles.startBtn,
              pressed && styles.mainBtnPressed,
            ]}
            onPress={recording ? stopRecording : startRecording}
          >
            <Text style={styles.mainBtnText}>
              {recording ? t("triplog.stop") : t("triplog.start")}
            </Text>
          </Pressable>
        </View>

        {/* Ride History */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("triplog.history")}</Text>
          {rides.length > 0 && (
            <Pressable onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); confirmClearAll(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("triplog.clearAll")}>
              <Text style={styles.clearAllText}>{t("triplog.clearAll")}</Text>
            </Pressable>
          )}
        </View>

        {rides.length === 0 ? (
          <Text style={styles.emptyText}>{t("triplog.noRides")}</Text>
        ) : (
          rides.map((ride, idx) => (
            <View key={ride.id} style={styles.rideCard}>
              <View style={styles.rideInfo}>
                <Text style={styles.rideTitle}>
                  {t("triplog.rideLabel", { n: rides.length - idx })}
                </Text>
                <Text style={styles.rideDate}>{formatDate(ride.date)}</Text>
                <View style={styles.rideStats}>
                  <Text style={styles.rideStat}>📏 {fmtDist(ride.distanceKm, settings.unitSystem)}</Text>
                  <Text style={styles.rideStat}>⏱ {formatDuration(ride.durationMs)}</Text>
                  <Text style={styles.rideStat}>⚡ {fmtSpeed(ride.avgSpeedKmh, settings.unitSystem)}</Text>
                </View>
              </View>
              <View style={styles.rideActions}>
                {ride.route.length > 1 && MapView && (
                  <Pressable
                    style={styles.rideBtn}
                    onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setMapRide(ride); }}
                  >
                    <Text style={styles.rideBtnText}>{t("triplog.viewMap")}</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.rideBtn, styles.deleteBtn]}
                  onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); deleteRide(ride.id); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t("triplog.deleteRide")}
                >
                  <Text style={styles.rideBtnText}>{t("triplog.deleteRide")}</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Route map modal */}
      <Modal
        visible={mapRide !== null}
        animationType="slide"
        onRequestClose={() => setMapRide(null)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.modalTitle}>{t("triplog.mapTitle")}</Text>
            <Pressable onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setMapRide(null); }}>
              <Text style={styles.modalClose}>{t("triplog.closeMap")}</Text>
            </Pressable>
          </View>
          {mapRide && mapRegion && MapView ? (
            <MapView
              style={styles.fullMap}
              provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
              initialRegion={mapRegion}
              mapType="standard"
            >
              {Polyline && (
                <Polyline
                  coordinates={mapRide.route}
                  strokeColor="#ff6600"
                  strokeWidth={4}
                />
              )}
            </MapView>
          ) : (
            <View style={styles.noMapMsg}>
              <Text style={styles.noMapText}>{t("triplog.mapUnavailable")}</Text>
            </View>
          )}
          {mapRide && (
            <View style={styles.modalStats}>
              <Text style={styles.modalStat}>📏 {fmtDist(mapRide.distanceKm, settings.unitSystem)}</Text>
              <Text style={styles.modalStat}>⏱ {formatDuration(mapRide.durationMs)}</Text>
              <Text style={styles.modalStat}>⚡ {fmtSpeed(mapRide.avgSpeedKmh, settings.unitSystem)}</Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

function StatBox({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      <Text style={styles.statLabel}>{label}</Text>
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
  scrollContent: { padding: 16, paddingBottom: 32 },

  // Stats card
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 20,
    marginBottom: 20,
  },
  trackingBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ff6600",
    marginRight: 8,
  },
  trackingText: {
    color: "#ff6600",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 2,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
    gap: 8,
  },
  statBox: {
    flex: 1,
    minWidth: "44%",
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#ff6600",
    fontVariant: ["tabular-nums"],
  },
  statUnit: {
    fontSize: 11,
    color: "#888",
    fontWeight: "600",
    marginTop: 2,
  },
  statLabel: {
    fontSize: 10,
    color: "#555",
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 4,
    textTransform: "uppercase",
  },
  accuracyText: {
    fontSize: 11,
    color: "#555",
    textAlign: "center",
    marginBottom: 4,
  },
  inlineMap: {
    height: 160,
    borderRadius: 8,
    overflow: "hidden",
    marginVertical: 12,
    backgroundColor: "#222",
  },
  mainBtn: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  startBtn: { backgroundColor: "#ff6600" },
  stopBtn: { backgroundColor: "#ef4444" },
  mainBtnPressed: { opacity: 0.75 },
  mainBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 2,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#ff6600",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 2,
  },
  clearAllText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyText: {
    color: "#555",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 20,
  },

  // Ride cards
  rideCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  rideInfo: { flex: 1 },
  rideTitle: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    marginBottom: 2,
  },
  rideDate: {
    color: "#888",
    fontSize: 11,
    marginBottom: 8,
  },
  rideStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rideStat: {
    color: "#aaa",
    fontSize: 12,
  },
  rideActions: {
    flexDirection: "column",
    gap: 6,
    marginLeft: 10,
  },
  rideBtn: {
    backgroundColor: "#ff6600",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  deleteBtn: { backgroundColor: "#333" },
  rideBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },

  // Modal
  modalContainer: { flex: 1, backgroundColor: "#0a0a0a" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#111",
    borderBottomWidth: 1,
    borderBottomColor: "#ff6600",
  },
  modalTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 1,
  },
  modalClose: {
    color: "#ff6600",
    fontWeight: "700",
    fontSize: 14,
  },
  fullMap: { flex: 1 },
  noMapMsg: { flex: 1, justifyContent: "center", alignItems: "center" },
  noMapText: { color: "#555", fontSize: 16 },
  modalStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 16,
    backgroundColor: "#111",
    borderTopWidth: 1,
    borderTopColor: "#2a2a2a",
  },
  modalStat: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  bottomPad: { height: 40 },
});
