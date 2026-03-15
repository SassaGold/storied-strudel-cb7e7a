import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
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
import { LOCATION_TASK_NAME, BG_POINTS_KEY } from "../../lib/locationTask";
import type { BgPoint } from "../../lib/locationTask";
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

  // Single watcher ref — only one GPS stream runs at a time.
  // In "idle" mode it uses Balanced accuracy for the live speedometer.
  // In "recording" mode it switches to BestForNavigation accuracy.
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const routeRef = useRef<GpsPoint[]>([]);
  const distRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const prevSpeedPointRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  /** True while Location.startLocationUpdatesAsync is active (background task running). */
  const bgTrackingRef = useRef(false);

  // Keep recordingRef in sync so the idle watcher can check it without stale closure
  useEffect(() => { recordingRef.current = recording; }, [recording]);

  // On mount: clean up any orphaned background task from a previous session
  useEffect(() => {
    if (Platform.OS === "web") return;
    Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .then((started) => {
        if (started) {
          return Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        }
      })
      .catch((e) => console.warn("[TripLogger] orphan task cleanup error:", e));
    // Also clear leftover background buffer from any previous unfinished ride
    AsyncStorage?.removeItem(BG_POINTS_KEY).catch(() => null);
  }, []);

  // Load saved rides on mount
  useEffect(() => {
    loadRides();
  }, []);

  /**
   * Merges GPS points accumulated by the background task into the live route.
   * Only points newer than the last foreground point are kept (gap-fill only),
   * and the same 3 m jitter filter used by the foreground watcher is applied.
   * The AsyncStorage buffer is cleared after a successful flush.
   */
  const flushBackgroundPoints = useCallback(async () => {
    if (!AsyncStorage || !recordingRef.current) return;
    try {
      const raw: string | null = await AsyncStorage.getItem(BG_POINTS_KEY);
      if (!raw) return;
      const bgPoints: BgPoint[] = JSON.parse(raw) as BgPoint[];
      if (!bgPoints.length) return;

      // Clear the shared buffer immediately so the next flush starts fresh
      await AsyncStorage.removeItem(BG_POINTS_KEY);

      // Only accept points that are strictly newer than the last foreground point
      // to avoid duplicate distance from the parallel foreground watcher
      const lastFgTs = routeRef.current.length > 0
        ? routeRef.current[routeRef.current.length - 1].timestamp
        : 0;
      const newPoints = bgPoints.filter((p) => p.timestamp > lastFgTs);
      if (!newPoints.length) return;

      // Sort defensively (task may batch out-of-order)
      newPoints.sort((a, b) => a.timestamp - b.timestamp);

      // Apply same 3 m jitter filter as the foreground watcher
      let last: GpsPoint | null = routeRef.current[routeRef.current.length - 1] ?? null;
      const merged: GpsPoint[] = [];
      for (const p of newPoints) {
        if (last) {
          const dist = haversineMeters(last.latitude, last.longitude, p.latitude, p.longitude);
          if (dist >= 3) {
            distRef.current += dist / 1000;
            merged.push(p);
            last = p;
          }
        } else {
          merged.push(p);
          last = p;
        }
      }

      if (merged.length > 0) {
        routeRef.current = [...routeRef.current, ...merged];
        setRoute([...routeRef.current]);
        setDistanceKm(distRef.current);
      }
    } catch (e) {
      console.warn("[TripLogger] flushBackgroundPoints error:", e);
    }
  }, []);

  /** Start the "idle" watcher (Balanced accuracy, for live speedometer only). */
  const startIdleWatch = useCallback(async () => {
    watchRef.current?.remove();
    watchRef.current = null;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === "denied") return;
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 1500 },
      (loc) => {
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
  }, []);

  // Start idle watcher on mount; clean up on unmount.
  useEffect(() => {
    let active = true;
    startIdleWatch().then(() => {
      if (!active) {
        watchRef.current?.remove();
        watchRef.current = null;
      }
    });
    return () => {
      active = false;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [startIdleWatch]);

  const loadRides = async () => {
    if (!AsyncStorage) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setRides(JSON.parse(raw));
    } catch (e) {
      console.warn("[TripLogger] loadRides error:", e);
    }
  };

  const saveRides = useCallback(async (updated: SavedRide[]) => {
    if (!AsyncStorage) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("[TripLogger] saveRides error:", e);
    }
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

  // When the app returns to the foreground, merge any GPS points that the
  // background task accumulated while the screen was off / app was suspended.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        flushBackgroundPoints();
      }
    });
    return () => sub.remove();
  }, [flushBackgroundPoints]);

  const startRecording = useCallback(async () => {
    setPermError(false);

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setPermError(true);
      return;
    }

    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);

    // Stop the idle watcher — a high-accuracy recording watcher takes over.
    watchRef.current?.remove();
    watchRef.current = null;

    // Clear any leftover background GPS buffer from a previous ride
    await AsyncStorage?.removeItem(BG_POINTS_KEY).catch(() => null);

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

    // ── Foreground watcher: live speed display + route building ─────────────────────
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

    // ── Background task: keeps tracking while app is suspended ────────────────
    // Only attempted on native; requires "Always" / background location permission.
    if (Platform.OS !== "web") {
      try {
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus === "granted") {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.BestForNavigation,
            distanceInterval: 5,
            timeInterval: 5000,
            // Android: show a persistent foreground-service notification so the
            // OS does not kill the background task.
            foregroundService: {
              notificationTitle: t("triplog.bgServiceTitle"),
              notificationBody: t("triplog.bgServiceBody"),
              notificationColor: "#ff6600",
            },
            // iOS: show the blue location pill in the status bar.
            showsBackgroundLocationIndicator: true,
          });
          bgTrackingRef.current = true;
        }
        // If permission is denied we silently continue with foreground-only
        // tracking — the ride will still be recorded while the app is open.
      } catch (e) {
        console.warn("[TripLogger] startLocationUpdatesAsync error:", e);
      }
    }
  }, [t]);

  const stopRecording = useCallback(async () => {
    // Stop the foreground watcher and immediately restart the idle watcher.
    watchRef.current?.remove();
    watchRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop the background location task (if it was started)
    if (bgTrackingRef.current) {
      try {
        const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (isStarted) {
          await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        }
      } catch (e) {
        console.warn("[TripLogger] stopLocationUpdatesAsync error:", e);
      }
      bgTrackingRef.current = false;
    }

    // Flush any GPS points buffered by the background task while the app was
    // suspended, then compute the final ride statistics.
    recordingRef.current = true; // keep flag high so flush accepts the points
    await flushBackgroundPoints();

    const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
    const distKm = distRef.current;
    const avgSpeed = durationMs > 0 ? distKm / (durationMs / 3_600_000) : 0;

    setRecording(false);

    // Restart the idle watcher so the speedometer keeps updating after the ride.
    startIdleWatch().catch((e) => console.warn("[TripLogger] idle watch restart error:", e));

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
  }, [rides, saveRides, t, startIdleWatch, flushBackgroundPoints]);

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
                    latitudeDelta: Math.max(maxLat - minLat + pad, 0.004),
                    longitudeDelta: Math.max(maxLon - minLon + pad, 0.004),
                  };
                })()}
                scrollEnabled={false}
                zoomEnabled={false}
                mapType="standard"
              >
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
            accessibilityHint={recording ? t("triplog.stopHint") : t("triplog.startHint")}
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
    <View
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${speedKmh != null ? Math.round(speedKmh) : 0} ${unit}`}
    >
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
