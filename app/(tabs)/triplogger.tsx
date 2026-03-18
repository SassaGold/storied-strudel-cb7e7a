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
import { LOCATION_TASK_NAME, BG_POINTS_KEY, type BgPoint } from "../../lib/locationTask";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

// Safely load react-native-maps: requires a custom dev/production build.
let rnMaps: any = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { rnMaps = require("react-native-maps"); } catch {}
const MapView: any = rnMaps?.default;
const Polyline: any = rnMaps?.Polyline;
const UrlTile: any = rnMaps?.UrlTile ?? null;

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
  const liveSpeedWatchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const routeRef = useRef<GpsPoint[]>([]);
  const distRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const prevSpeedPointRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);

  // Keep recordingRef in sync so the live speed watcher can check it without stale closure
  useEffect(() => { recordingRef.current = recording; }, [recording]);

  // Load saved rides on mount
  useEffect(() => {
    loadRides();
  }, []);

  // Always-on live speed watcher so the speedometer shows current speed even when not recording
  useEffect(() => {
    let active = true;
    const startLiveWatch = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active || status === "denied") return;
      liveSpeedWatchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 1500 },
        (loc) => {
          if (recordingRef.current) return; // recording watcher handles speed during active trip
          const { latitude, longitude, speed } = loc.coords;
          const ts = loc.timestamp;
          if (speed != null && speed >= 0) {
            setCurrentSpeedKmh(speed * 3.6);
          } else if (prevSpeedPointRef.current) {
            const distM = haversineMeters(prevSpeedPointRef.current.latitude, prevSpeedPointRef.current.longitude, latitude, longitude);
            const dtSec = (ts - prevSpeedPointRef.current.timestamp) / 1000;
            if (dtSec > 0.5) {
              setCurrentSpeedKmh(distM > 1 ? (distM / dtSec) * 3.6 : 0);
            }
          } else {
            setCurrentSpeedKmh(0);
          }
          prevSpeedPointRef.current = { latitude, longitude, timestamp: ts };
        }
      );
    };
    startLiveWatch();
    return () => {
      active = false;
      liveSpeedWatchRef.current?.remove();
      liveSpeedWatchRef.current = null;
    };
  }, []);

  const loadRides = async () => {
    if (!AsyncStorage) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRides(parsed);
      }
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

    // Request background permission so the trip continues recording while the
    // screen is locked. If denied we still proceed with foreground-only tracking.
    await Location.requestBackgroundPermissionsAsync().catch(() => null);

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

    // Clear any stale background points from a previous session.
    if (AsyncStorage) {
      try { await AsyncStorage.removeItem(BG_POINTS_KEY); } catch {
        // Stale data will be deduplicated on stop; not critical.
      }
    }

    // Start the background location task (Android foreground service + iOS bg mode).
    // This ensures GPS points are captured even when the screen is locked.
    try {
      const bgGranted = (await Location.getBackgroundPermissionsAsync()).status === "granted";
      if (bgGranted) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 3000,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: "Roamly Trip Logger",
            notificationBody: "Recording your ride in the background.",
            notificationColor: "#ff6600",
          },
        });
      }
    } catch {
      // Background task may not be available in Expo Go or on restricted devices.
      // Foreground-only tracking (watchPositionAsync below) will still work.
    }

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 5,       // emit every 5 m moved
        timeInterval: 3000,         // or every 3 s
      },
      (loc) => {
        const { latitude, longitude, speed, accuracy: acc } = loc.coords;
        const ts = loc.timestamp;

        // Update speed — use native GPS speed if available, otherwise calculate from GPS delta
        const prev = routeRef.current[routeRef.current.length - 1];
        if (speed != null && speed >= 0) {
          setCurrentSpeedKmh(speed * 3.6);
        } else if (prev) {
          const distM = haversineMeters(prev.latitude, prev.longitude, latitude, longitude);
          const dtSec = (ts - prev.timestamp) / 1000;
          if (dtSec > 0.5) {
            setCurrentSpeedKmh(distM > 1 ? (distM / dtSec) * 3.6 : 0);
          }
        }
        setAccuracy(acc ?? null);

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

    // Stop the background location task if it is running.
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (isRunning) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    } catch {
      // Non-critical: the task will stop automatically when the app is terminated.
    }

    const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
    setRecording(false);
    // Don't clear speed — live watcher will continue updating it after recording stops

    // Merge foreground + background points, deduplicate by timestamp, recalculate distance.
    let mergedRoute = [...routeRef.current];
    if (AsyncStorage) {
      try {
        const raw = await AsyncStorage.getItem(BG_POINTS_KEY);
        if (raw) {
          const bgPoints: BgPoint[] = JSON.parse(raw);
          const fgTsSet = new Set(routeRef.current.map((p) => p.timestamp));
          const uniqueBg = bgPoints.filter((p) => !fgTsSet.has(p.timestamp));
          mergedRoute = [...routeRef.current, ...uniqueBg].sort((a, b) => a.timestamp - b.timestamp);
        }
        await AsyncStorage.removeItem(BG_POINTS_KEY);
      } catch {
        // Keep foreground-only route if background data cannot be read.
      }
    }

    // Recalculate distance from merged route.
    let mergedDistKm = 0;
    for (let i = 1; i < mergedRoute.length; i++) {
      const dist = haversineMeters(
        mergedRoute[i - 1].latitude,
        mergedRoute[i - 1].longitude,
        mergedRoute[i].latitude,
        mergedRoute[i].longitude,
      );
      // Filter GPS jitter: only count movements of ≥ 3 m (same threshold as the foreground watcher).
      if (dist >= 3) mergedDistKm += dist / 1000;
    }

    const avgSpeed = durationMs > 0 ? mergedDistKm / (durationMs / 3_600_000) : 0;

    if (mergedDistKm > 0.01) {
      Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      const ride: SavedRide = {
        id: String(Date.now()),
        date: new Date().toISOString(),
        distanceKm: Math.round(mergedDistKm * 100) / 100,
        durationMs,
        avgSpeedKmh: Math.round(avgSpeed * 10) / 10,
        route: mergedRoute,
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

          {/* Circular speedometer */}
          <View style={styles.gaugeRow}>
            <SpeedGauge
              speedKmh={currentSpeedKmh}
              maxKmh={isImperial ? 100 : 160}
              unit={speedUnit}
              label={t("triplog.speedLabel")}
              size={190}
            />
          </View>

          {/* 3-stat row: distance / duration / avg speed */}
          <View style={styles.statsRow}>
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

          {/* Inline map while recording — shows from first GPS point */}
          {recording && MapView && route.length === 0 && (
            <View style={styles.inlineMapPlaceholder}>
              <Text style={styles.mapWaitText}>📍 Waiting for GPS…</Text>
            </View>
          )}
          {recording && route.length >= 1 && MapView && (
            <View style={styles.inlineMap}>
              <MapView
                style={StyleSheet.absoluteFill}
                mapType={Platform.OS === "android" ? "none" : "standard"}
                region={(() => {
                  const lats = route.map((p) => p.latitude);
                  const lons = route.map((p) => p.longitude);
                  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
                  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
                  const pad = 0.001;
                  return {
                    latitude: (minLat + maxLat) / 2,
                    longitude: (minLon + maxLon) / 2,
                    latitudeDelta: Math.max(maxLat - minLat + pad, 0.004),
                    longitudeDelta: Math.max(maxLon - minLon + pad, 0.004),
                  };
                })()}
                scrollEnabled={false}
                zoomEnabled={false}
              >
                {Platform.OS === "android" && UrlTile && (
                  <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />
                )}
                {Polyline && route.length > 1 && (
                  <Polyline
                    coordinates={route}
                    strokeColor="#ff6600"
                    strokeWidth={4}
                  />
                )}
              </MapView>
            </View>
          )}

          {/* Start / Stop button — large, rounded, bold color */}
          <Pressable
            style={({ pressed }) => [
              styles.mainBtn,
              recording ? styles.stopBtn : styles.startBtn,
              pressed && styles.mainBtnPressed,
            ]}
            onPress={recording ? stopRecording : startRecording}
            accessibilityRole="button"
            accessibilityLabel={recording ? t("triplog.stop") : t("triplog.start")}
            accessibilityState={{ selected: recording }}
          >
            <Text style={styles.mainBtnText}>
              {recording ? `⏹  ${t("triplog.stop")}` : `▶  ${t("triplog.start")}`}
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
              {/* Orange accent top strip */}
              <View style={styles.rideCardAccent} />
              {/* Card header: title + date */}
              <View style={styles.rideCardHeader}>
                <Text style={styles.rideTitle}>
                  🏍️ {t("triplog.rideLabel", { n: rides.length - idx })}
                </Text>
                <Text style={styles.rideDate}>{formatDate(ride.date)}</Text>
              </View>
              {/* Stat chips */}
              <View style={styles.rideStatChips}>
                <View style={styles.rideStatChip}>
                  <Text style={styles.rideStatChipValue}>{fmtDist(ride.distanceKm, settings.unitSystem)}</Text>
                  <Text style={styles.rideStatChipLabel}>📏 {t("triplog.distance")}</Text>
                </View>
                <View style={styles.rideStatChip}>
                  <Text style={styles.rideStatChipValue}>{formatDuration(ride.durationMs)}</Text>
                  <Text style={styles.rideStatChipLabel}>⏱ {t("triplog.duration")}</Text>
                </View>
                <View style={styles.rideStatChip}>
                  <Text style={styles.rideStatChipValue}>{fmtSpeed(ride.avgSpeedKmh, settings.unitSystem)}</Text>
                  <Text style={styles.rideStatChipLabel}>⚡ {t("triplog.avgSpeed")}</Text>
                </View>
              </View>
              {/* Action buttons */}
              <View style={styles.rideActions}>
                {ride.route.length > 1 && MapView && (
                  <Pressable
                    style={[styles.rideBtn, styles.viewRouteBtn]}
                    onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setMapRide(ride); }}
                    accessibilityRole="button"
                    accessibilityLabel={t("triplog.viewMap")}
                  >
                    <Text style={styles.rideBtnText}>🗺  {t("triplog.viewMap")}</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.rideBtn, styles.deleteBtn]}
                  onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); deleteRide(ride.id); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t("triplog.deleteRide")}
                >
                  <Text style={[styles.rideBtnText, styles.deleteBtnText]}>{t("triplog.deleteRide")}</Text>
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
            <Pressable onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); setMapRide(null); }} accessibilityRole="button" accessibilityLabel={t("triplog.closeMap")}>
              <Text style={styles.modalClose}>{t("triplog.closeMap")}</Text>
            </Pressable>
          </View>
          {mapRide && mapRegion && MapView ? (
            <MapView
              style={styles.fullMap}
              mapType={Platform.OS === "android" ? "none" : "standard"}
              initialRegion={mapRegion}
            >
              {Platform.OS === "android" && UrlTile && (
                <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />
              )}
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

function SpeedGauge({
  speedKmh,
  maxKmh = 160,
  unit,
  label,
  size = 190,
}: {
  speedKmh: number | null;
  maxKmh?: number;
  unit: string;
  label: string;
  size?: number;
}) {
  const pct = speedKmh != null ? Math.min(speedKmh / maxKmh, 1) : 0;
  const TICKS = 28;
  const SWEEP = 240;
  const START = -120; // degrees from 12-o'clock

  // Color: green → yellow → orange → red
  const gaugeColor =
    pct > 0.85 ? "#ef4444" :
    pct > 0.6  ? "#f97316" :
    pct > 0.3  ? "#fbbf24" : "#22c55e";

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* Tick marks around the gauge */}
      {Array.from({ length: TICKS }).map((_, i) => {
        const frac = i / (TICKS - 1);
        const angle = START + frac * SWEEP;
        const isMajor = i % 7 === 0;
        const isActive = speedKmh != null && frac <= pct;
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              width: size,
              height: size,
              alignItems: "center",
              justifyContent: "flex-start",
              transform: [{ rotate: `${angle}deg` }],
            }}
          >
            <View
              style={{
                width: isMajor ? 4 : 2.5,
                height: isMajor ? 14 : 9,
                borderRadius: 2,
                backgroundColor: isActive ? gaugeColor : "#252525",
                marginTop: 4,
              }}
            />
          </View>
        );
      })}
      {/* Center circle with speed value */}
      <View
        style={{
          width: size * 0.62,
          height: size * 0.62,
          borderRadius: size * 0.31,
          backgroundColor: "#111",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: "#2a2a2a",
        }}
      >
        <Text
          style={{
            fontSize: Math.round(size * 0.25),
            fontWeight: "900",
            color: speedKmh != null ? gaugeColor : "#444",
            fontVariant: ["tabular-nums"],
            lineHeight: Math.round(size * 0.27),
          }}
        >
          {speedKmh != null ? Math.round(speedKmh) : "—"}
        </Text>
        <Text style={{ fontSize: 12, color: "#777", fontWeight: "600" }}>{unit}</Text>
        <Text style={{ fontSize: 9, color: "#444", letterSpacing: 1.5, marginTop: 2 }}>{label}</Text>
      </View>
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
  },
  trackingBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    alignSelf: "flex-start",
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
  // Gauge layout
  gaugeRow: {
    alignItems: "center",
    marginBottom: 12,
  },
  // 3-stat row below gauge
  statsRow: {
    flexDirection: "row",
    width: "100%",
    gap: 8,
    marginBottom: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#ff6600",
    fontVariant: ["tabular-nums"],
  },
  statUnit: {
    fontSize: 10,
    color: "#888",
    fontWeight: "600",
    marginTop: 1,
  },
  statLabel: {
    fontSize: 9,
    color: "#555",
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 3,
    textTransform: "uppercase",
  },
  accuracyText: {
    fontSize: 11,
    color: "#555",
    textAlign: "center",
    marginBottom: 4,
  },
  // Inline map while recording
  inlineMapPlaceholder: {
    width: "100%",
    height: 60,
    borderRadius: 10,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
  },
  mapWaitText: {
    color: "#555",
    fontSize: 13,
    fontStyle: "italic",
  },
  inlineMap: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    overflow: "hidden",
    marginVertical: 12,
    backgroundColor: "#222",
  },
  // Start / Stop button — large, bold, rounded
  mainBtn: {
    width: "100%",
    borderRadius: 32,
    paddingVertical: 22,
    alignItems: "center",
    marginTop: 12,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
  },
  startBtn: {
    backgroundColor: "#22c55e",
    shadowColor: "#22c55e",
  },
  stopBtn: {
    backgroundColor: "#ef4444",
    shadowColor: "#ef4444",
  },
  mainBtnPressed: { opacity: 0.8 },
  mainBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 20,
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

  // Ride cards — vertical card layout
  rideCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    marginBottom: 14,
    overflow: "hidden",
  },
  rideCardAccent: {
    height: 3,
    backgroundColor: "#ff6600",
    width: "100%",
  },
  rideCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  rideTitle: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  rideDate: {
    color: "#666",
    fontSize: 11,
  },
  // Stat chips grid
  rideStatChips: {
    flexDirection: "row",
    paddingHorizontal: 14,
    gap: 8,
    marginBottom: 12,
  },
  rideStatChip: {
    flex: 1,
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  rideStatChipValue: {
    color: "#ff6600",
    fontWeight: "800",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  rideStatChipLabel: {
    color: "#555",
    fontSize: 10,
    marginTop: 3,
    textAlign: "center",
  },
  // Action buttons row
  rideActions: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  rideBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  viewRouteBtn: {
    backgroundColor: "#1e3a2a",
    borderWidth: 1,
    borderColor: "#22c55e",
  },
  deleteBtn: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#333",
    flex: 0,
    paddingHorizontal: 16,
  },
  rideBtnText: {
    color: "#22c55e",
    fontSize: 12,
    fontWeight: "700",
  },
  deleteBtnText: {
    color: "#666",
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
