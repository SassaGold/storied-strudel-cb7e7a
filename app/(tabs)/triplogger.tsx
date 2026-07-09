import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings, fmtDist, fmtSpeed } from "../../lib/settings";
import { haversineMeters } from "../../lib/overpass";
import { LOCATION_TASK_NAME, BG_POINTS_KEY, isLocationTaskDefined, type BgPoint } from "../../lib/locationTask";
import { useLocationPermission } from "../../lib/locationPermission";
import { OSM_TILE_URL, OSM_USER_AGENT } from "../../lib/config";
import { mapMatchRoute, downsampleCoords } from "../../lib/mapMatch";
import { storage } from "../../lib/storage";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications: typeof import("expo-notifications") | null = (() => { try { return require("expo-notifications"); } catch { return null; } })();

const STORAGE_KEY = "triplogger_rides_v1";

/** Cap on saved rides kept in AsyncStorage; oldest are trimmed once exceeded. */
const MAX_SAVED_RIDES = 100;

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
  const { t, i18n } = useTranslation();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const { requestForegroundPermission, requestBackgroundPermission } = useLocationPermission();

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
  const [expandedMaps, setExpandedMaps] = useState<Set<string>>(new Set());
  const [fullscreenRide, setFullscreenRide] = useState<SavedRide | null>(null);

  const toggleMap = useCallback((id: string) => {
    setExpandedMaps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

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
      const { status } = await requestForegroundPermission();
      if (!active || status === "denied") return;
      liveSpeedWatchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 1500 },
        (loc) => {
          try {
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
          } catch {
            // Silently ignore any error in the speed update callback.
          }
        }
      );
    };
    startLiveWatch().catch(() => null);
    return () => {
      active = false;
      liveSpeedWatchRef.current?.remove();
      liveSpeedWatchRef.current = null;
    };
  }, [requestForegroundPermission]);

  const loadRides = async () => {
    try {
      const raw = await storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRides(parsed.slice(0, MAX_SAVED_RIDES));
      }
    } catch {}
  };

  const saveRides = useCallback(async (updated: SavedRide[]) => {
    try {
      await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
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
    try {
      const { status } = await requestForegroundPermission();
      if (status !== "granted") {
        setPermError(true);
        return;
      }

      if (Platform.OS === "android" && Notifications) {
        let notif = await Notifications.getPermissionsAsync();
        if (!notif.granted && notif.status !== "granted") {
          notif = await Notifications.requestPermissionsAsync();
        }
        if (!notif.granted && notif.status !== "granted") {
          Alert.alert(
            "Notifications are disabled",
            "Trip Logger needs notifications enabled so Android can show active recording in the notification shade.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => { Linking.openSettings().catch(() => null); },
              },
            ]
          );
          return;
        }
      }

      // Request background permission so the trip continues recording while the
      // screen is locked. Disclosure is shown before the OS dialog; if denied
      // we still proceed with foreground-only tracking.
      await requestBackgroundPermission().catch(() => null);

      Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium)?.catch(() => null);

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
      // Keep screen on during the ride so the odometer stays visible.
      await activateKeepAwakeAsync().catch(() => null);
      setRecording(true);

      // Clear any stale background points from a previous session.
      try { await storage.removeItem(BG_POINTS_KEY); } catch {
        // Stale data will be deduplicated on stop; not critical.
      }

      // Start the background location task (Android foreground service).
      // This ensures GPS points are captured even when the screen is locked.
      try {
        const bgGranted = (await Location.getBackgroundPermissionsAsync()).status === "granted";
        if (bgGranted && isLocationTaskDefined()) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.BestForNavigation,
            distanceInterval: 5,
            timeInterval: 3000,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: "Where Am I Trip Logger",
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
          try {
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
          } catch {
            // Silently ignore any error in the location update callback to prevent
            // an unhandled exception from crashing the app in production.
          }
        },
      );
    } catch {
      // Catch-all: prevent unhandled promise rejection from crashing the app on
      // Android production builds. Reset recording state and show a friendly alert.
      setRecording(false);
      Alert.alert(t("triplog.startErrorTitle"), t("triplog.startErrorMsg"));
    }
  }, [t, requestForegroundPermission, requestBackgroundPermission]);

  const stopRecording = useCallback(async () => {
    try {
      // Release the screen-on lock now that the ride is finished.
      deactivateKeepAwake();
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
        if (isLocationTaskDefined()) {
          const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
          if (isRunning) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        }
      } catch {
        // Non-critical: the task will stop automatically when the app is terminated.
      }

      const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      setRecording(false);
      // Don't clear speed — live watcher will continue updating it after recording stops

      // Merge foreground + background points, deduplicate by timestamp, recalculate distance.
      let mergedRoute = [...routeRef.current];
      try {
        const raw = await storage.getItem(BG_POINTS_KEY);
        if (raw) {
          const bgPoints: BgPoint[] = JSON.parse(raw);
          const fgTsSet = new Set(routeRef.current.map((p) => p.timestamp));
          const uniqueBg = bgPoints.filter((p) => !fgTsSet.has(p.timestamp));
          mergedRoute = [...routeRef.current, ...uniqueBg].sort((a, b) => a.timestamp - b.timestamp);
        }
        await storage.removeItem(BG_POINTS_KEY);
      } catch {
        // Keep foreground-only route if background data cannot be read.
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
        Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success)?.catch(() => null);
        const ride: SavedRide = {
          id: String(Date.now()),
          date: new Date().toISOString(),
          distanceKm: Math.round(mergedDistKm * 100) / 100,
          durationMs,
          avgSpeedKmh: Math.round(avgSpeed * 10) / 10,
          route: mergedRoute,
        };
        // Cap history so storage can't grow unbounded; keep the newest rides.
        const updated = [ride, ...rides].slice(0, MAX_SAVED_RIDES);
        setRides(updated);
        await saveRides(updated);
      } else {
        Alert.alert(t("triplog.tooShortTitle"), t("triplog.tooShortMsg"));
      }
    } catch {
      // Catch-all: prevent unhandled rejection from crashing the app on Android
      // production builds. Ensure recording state is cleared and inform the user.
      deactivateKeepAwake();
      setRecording(false);
      Alert.alert(t("triplog.stopErrorTitle"), t("triplog.stopErrorMsg"));
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

          {/* Start / Stop button — large, rounded, bold color */}
          <Pressable
            style={({ pressed }) => [
              styles.mainBtn,
              recording ? styles.stopBtn : styles.startBtn,
              pressed && styles.mainBtnPressed,
            ]}
            onPress={() => { (recording ? stopRecording() : startRecording()).catch(() => null); }}
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
            <Pressable onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(() => null); confirmClearAll(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("triplog.clearAll")}>
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
                {ride.route.length > 1 && (
                  <Pressable
                    style={[styles.rideBtn, styles.mapBtn, expandedMaps.has(ride.id) && styles.mapBtnActive]}
                    onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(() => null); toggleMap(ride.id); }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={expandedMaps.has(ride.id) ? t("triplog.hideRoute") : t("triplog.viewRoute")}
                  >
                    <Text style={[styles.rideBtnText, styles.mapBtnText]}>
                      {expandedMaps.has(ride.id) ? t("triplog.hideRoute") : t("triplog.viewRoute")}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.rideBtn, styles.deleteBtn]}
                  onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(() => null); deleteRide(ride.id); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t("triplog.deleteRide")}
                >
                  <Text style={[styles.rideBtnText, styles.deleteBtnText]}>{t("triplog.deleteRide")}</Text>
                </Pressable>
              </View>
              {/* Route map preview */}
              {expandedMaps.has(ride.id) && ride.route.length > 1 && (
                <View style={styles.rideMapContainer}>
                  <Pressable
                    onPress={() => setFullscreenRide(ride)}
                    accessibilityLabel={t("triplog.viewRoute")}
                  >
                    <RideMapPreview route={ride.route} />
                    <View style={styles.mapExpandHint}>
                      <Text style={styles.mapExpandHintText}>⤢ {t("triplog.tapToExpand")}</Text>
                    </View>
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Full-screen map modal */}
      {fullscreenRide && (
        <Modal
          visible={true}
          animationType="slide"
          statusBarTranslucent
          onRequestClose={() => setFullscreenRide(null)}
        >
          <View style={styles.mapModal}>
            <View style={styles.mapModalHeader}>
              <Text style={styles.mapModalTitle}>{fullscreenRide.date ? new Date(fullscreenRide.date).toLocaleDateString(i18n.language) : ""}</Text>
              <Pressable onPress={() => setFullscreenRide(null)} style={styles.mapModalClose} accessibilityLabel={t("triplog.hideRoute")}>
                <Text style={styles.mapModalCloseText}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.mapModalBody}>
              <RideMapPreview route={fullscreenRide.route} fullscreen />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const SpeedGauge = memo(function SpeedGauge({
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
});

const StatBox = memo(function StatBox({
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
});

// ── OSM tile helpers ──────────────────────────────────────────────────────────

/** Standard OSM/Web Mercator tile size in pixels. */
const TILE_PX = 256;

/** Highest zoom level considered when auto-selecting a zoom for the route preview. */
const MAX_TILE_ZOOM = 16;

/** Lowest zoom level considered when auto-selecting a zoom for the route preview. */
const MIN_TILE_ZOOM = 5;

/** Maximum number of tiles allowed horizontally in the preview grid. */
const MAX_TILES_ACROSS = 4;

/** Maximum number of tiles allowed vertically in the preview grid. */
const MAX_TILES_DOWN = 3;

/** Fractional tile X for a longitude at zoom z. */
const lngToTileFrac = (lng: number, z: number): number =>
  ((lng + 180) / 360) * Math.pow(2, z);

/** Fractional tile Y for a latitude at zoom z (Web Mercator). */
const latToTileFrac = (lat: number, z: number): number => {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, z);
};

/** Build a tile image URL from the OSM template. */
const tileUrl = (z: number, x: number, y: number): string =>
  OSM_TILE_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));

/**
 * Choose the highest zoom level where the padded bounding box fits within
 * at most `MAX_TILES_ACROSS` tiles horizontally and `MAX_TILES_DOWN` vertically.
 */
const chooseBestZoom = (
  minLat: number, maxLat: number, minLon: number, maxLon: number,
): number => {
  for (let z = MAX_TILE_ZOOM; z >= MIN_TILE_ZOOM; z--) {
    const tileW = lngToTileFrac(maxLon, z) - lngToTileFrac(minLon, z);
    const tileH = latToTileFrac(minLat, z) - latToTileFrac(maxLat, z);
    if (tileW <= MAX_TILES_ACROSS && tileH <= MAX_TILES_DOWN) return z;
  }
  return MIN_TILE_ZOOM;
};

// ── RideMapPreview ────────────────────────────────────────────────────────────

/** Height reserved for the modal header when the map is shown full-screen. */
const FULLSCREEN_MAP_HEADER_OFFSET = 100;

const RideMapPreview = memo(function RideMapPreview({ route, fullscreen = false }: { route: GpsPoint[]; fullscreen?: boolean }) {
  const MAP_HEIGHT = fullscreen ? Dimensions.get("window").height - FULLSCREEN_MAP_HEADER_OFFSET : 200;
  /** Extra space around the route so map context is visible (fraction of extent). */
  const ROUTE_PAD = 0.3;

  // Use map-matched (road-snapped) route for display
  const [matchedRoute, setMatchedRoute] = useState<{ latitude: number; longitude: number }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    mapMatchRoute(route).then((matched) => {
      if (!cancelled) setMatchedRoute(matched);
    });
    return () => { cancelled = true; };
  }, [route]);

  // Use matched route for rendering if available, otherwise fall back to raw GPS points.
  const pts = useMemo(
    () =>
      matchedRoute
        ? downsampleCoords(matchedRoute.map((p, i) => ({
            ...p,
            timestamp: route[Math.min(i, route.length - 1)]?.timestamp ?? 0,
          })), 500)
        : downsampleCoords(route, 200),
    [matchedRoute, route],
  );

  // Find the padded bounding box that contains the whole route.
  const bounds = useMemo(() => {
    let minLat = pts[0].latitude, maxLat = pts[0].latitude;
    let minLon = pts[0].longitude, maxLon = pts[0].longitude;
    for (const p of pts) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLon) minLon = p.longitude;
      if (p.longitude > maxLon) maxLon = p.longitude;
    }
    // Pad the bounding box to show map context around the route.
    const latPad = (maxLat - minLat) * ROUTE_PAD || 0.005;
    const lonPad = (maxLon - minLon) * ROUTE_PAD || 0.005;
    return {
      padMinLat: minLat - latPad,
      padMaxLat: maxLat + latPad,
      padMinLon: minLon - lonPad,
      padMaxLon: maxLon + lonPad,
    };
  }, [pts]);
  const { padMinLat, padMaxLat, padMinLon, padMaxLon } = bounds;

  const [containerWidth, setContainerWidth] = useState(0);

  // Compute tile grid and scale when container size is known
  const layout = useMemo(() => {
    if (containerWidth === 0) return null;
    const z = chooseBestZoom(padMinLat, padMaxLat, padMinLon, padMaxLon);
    const txMinFrac = lngToTileFrac(padMinLon, z);
    const txMaxFrac = lngToTileFrac(padMaxLon, z);
    const tyMinFrac = latToTileFrac(padMaxLat, z); // smaller y = more northern
    const tyMaxFrac = latToTileFrac(padMinLat, z);
    const txStart = Math.floor(txMinFrac);
    const txEnd = Math.floor(txMaxFrac);
    const tyStart = Math.floor(tyMinFrac);
    const tyEnd = Math.floor(tyMaxFrac);
    // Natural canvas size if tiles were rendered at full resolution
    const worldW = (txEnd - txStart + 1) * TILE_PX;
    const worldH = (tyEnd - tyStart + 1) * TILE_PX;
    // Scale to fit container (preserve aspect ratio)
    const scale = Math.min(containerWidth / worldW, MAP_HEIGHT / worldH);
    const offsetX = (containerWidth - worldW * scale) / 2;
    const offsetY = (MAP_HEIGHT - worldH * scale) / 2;
    return { z, txStart, tyStart, txEnd, tyEnd, scale, offsetX, offsetY };
  }, [containerWidth, padMinLat, padMaxLat, padMinLon, padMaxLon, MAP_HEIGHT]);

  /** Convert a GPS point to screen [x, y] using the same Mercator projection as the tiles. */
  const toScreen = useCallback((p: GpsPoint): [number, number] | null => {
    if (!layout) return null;
    const { z, txStart, tyStart, scale, offsetX, offsetY } = layout;
    const x = offsetX + (lngToTileFrac(p.longitude, z) - txStart) * TILE_PX * scale;
    const y = offsetY + (latToTileFrac(p.latitude, z) - tyStart) * TILE_PX * scale;
    return [x, y];
  }, [layout]);

  // Build tile list
  const tiles = useMemo(() => {
    if (!layout) return [];
    const { z, txStart, txEnd, tyStart, tyEnd, scale, offsetX, offsetY } = layout;
    const renderedSize = TILE_PX * scale;
    const list: { key: string; url: string; x: number; y: number; size: number }[] = [];
    for (let tx = txStart; tx <= txEnd; tx++) {
      for (let ty = tyStart; ty <= tyEnd; ty++) {
        list.push({
          key: `${z}-${tx}-${ty}`,
          url: tileUrl(z, tx, ty),
          x: offsetX + (tx - txStart) * renderedSize,
          y: offsetY + (ty - tyStart) * renderedSize,
          size: renderedSize,
        });
      }
    }
    return list;
  }, [layout]);

  // Build route segments
  const segments = useMemo(() => {
    if (!layout) return [];
    return pts.slice(0, -1).map((p, i) => {
      const s = toScreen(p);
      const e = toScreen(pts[i + 1]);
      if (!s || !e) return null;
      const [x1, y1] = s;
      const [x2, y2] = e;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      return { length, angle, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
    });
  }, [pts, toScreen, layout]);

  const firstPt = toScreen(pts[0]);
  const lastPt  = pts.length > 1 ? toScreen(pts[pts.length - 1]) : null;

  return (
    <View
      style={{ height: MAP_HEIGHT, backgroundColor: "#0d0d0d", borderRadius: 8, overflow: "hidden" }}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/* OSM map tiles */}
      {tiles.map((tile) => (
        <Image
          key={tile.key}
          source={{ uri: tile.url, headers: { "User-Agent": OSM_USER_AGENT } }}
          style={{
            position: "absolute",
            left: tile.x,
            top: tile.y,
            width: tile.size,
            height: tile.size,
          }}
        />
      ))}
      {/* Route line segments */}
      {segments.map((seg, i) => {
        if (!seg || seg.length < 0.5) return null;
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: seg.mx - seg.length / 2,
              top: seg.my - 1.5,
              width: seg.length,
              height: 3,
              backgroundColor: "#ff6600",
              transform: [{ rotate: `${seg.angle}deg` }],
            }}
          />
        );
      })}
      {/* Start dot (green) */}
      {firstPt && (
        <View style={{
          position: "absolute",
          left: firstPt[0] - 5,
          top: firstPt[1] - 5,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: "#22c55e",
          borderWidth: 2,
          borderColor: "#fff",
        }} />
      )}
      {/* End dot (red) */}
      {lastPt && pts.length > 1 && (
        <View style={{
          position: "absolute",
          left: lastPt[0] - 5,
          top: lastPt[1] - 5,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: "#ef4444",
          borderWidth: 2,
          borderColor: "#fff",
        }} />
      )}
    </View>
  );
});

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
  mapBtn: {
    flex: 1,
    backgroundColor: "rgba(255,102,0,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  mapBtnActive: {
    backgroundColor: "rgba(255,102,0,0.18)",
    borderColor: "#ff6600",
  },
  mapBtnText: {
    color: "#ff6600",
    fontSize: 12,
    fontWeight: "700",
  },
  rideMapContainer: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  mapExpandHint: {
    position: "absolute",
    bottom: 6,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mapExpandHintText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  mapModal: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  mapModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    backgroundColor: "#111",
    borderBottomWidth: 2,
    borderBottomColor: "#ff6600",
  },
  mapModalTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  mapModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,102,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  mapModalCloseText: {
    color: "#ff6600",
    fontSize: 18,
    fontWeight: "700",
  },
  mapModalBody: {
    flex: 1,
    padding: 0,
  },

  bottomPad: { height: 40 },
});
