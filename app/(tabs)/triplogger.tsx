import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import * as Location from "expo-location";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings, fmtDist, fmtSpeed, type UnitSystem } from "../../lib/settings";
import { haversineMeters } from "../../lib/overpass";
import { LOCATION_TASK_NAME, clearBgPoints, isLocationTaskDefined, readBgPoints } from "../../lib/locationTask";
import { useLocationPermission } from "../../lib/locationPermission";
import { OSM_USER_AGENT, TRIP_MAX_GPS_ACCURACY_M } from "../../lib/config";
import { boundsOf, buildTiles, computeTileLayout, padBounds, projectToScreen } from "../../lib/osmTiles";
import { mapMatchRoute, downsampleCoords } from "../../lib/mapMatch";
import { storage } from "../../lib/storage";
import {
  buildRide,
  formatDate,
  formatDuration,
  MAX_SAVED_ROUTE_POINTS,
  nextRideSeq,
  rideTotals,
  type GpsPoint,
  type PausedInterval,
  type SavedRide,
} from "../../lib/tripStats";
import { buildGpx, gpxFileName } from "../../lib/gpx";
import { COLORS } from "../../lib/theme";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications: typeof import("expo-notifications") | null = (() => { try { return require("expo-notifications"); } catch { return null; } })();
// File writing + share sheet for GPX export. Loaded dynamically so a missing
// native module (web, Expo Go variants) degrades gracefully instead of crashing.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FileSystem: typeof import("expo-file-system/legacy") | null = (() => { try { return require("expo-file-system/legacy"); } catch { return null; } })();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Sharing: typeof import("expo-sharing") | null = (() => { try { return require("expo-sharing"); } catch { return null; } })();

const STORAGE_KEY = "triplogger_rides_v1";

/** Snapshot of the in-progress ride, so a crash/force-kill mid-ride can be
 *  recovered on next launch instead of losing the whole foreground track. */
const CHECKPOINT_KEY = "triplogger_active_v1";

/** Minimum interval between checkpoint writes (ms) — avoids rewriting the whole
 *  route blob on every GPS fix. */
const CHECKPOINT_INTERVAL_MS = 15_000;

/** Cap on saved rides kept in AsyncStorage; oldest are trimmed once exceeded. */
const MAX_SAVED_RIDES = 100;

type Checkpoint = {
  startTime: number;
  distanceKm: number;
  route: GpsPoint[];
  /** Closed pause intervals so a recovered ride excludes paused travel. */
  pausedIntervals?: PausedInterval[];
  /** Top speed observed so far, so recovery doesn't lose the stat. */
  maxSpeedKmh?: number;
};

export default function TripLoggerScreen() {
  const { t, i18n } = useTranslation();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const { requestForegroundPermission, requestBackgroundPermission } = useLocationPermission();

  // Recording state
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  // Number of recorded points. The points themselves live only in routeRef —
  // holding the growing array in state would copy it and re-render the whole
  // screen on every GPS fix.
  const [pointCount, setPointCount] = useState(0);
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
  const [renamingRide, setRenamingRide] = useState<SavedRide | null>(null);
  const [renameText, setRenameText] = useState("");

  const toggleMap = useCallback((id: string) => {
    setExpandedMaps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const liveSpeedWatchRef = useRef<Location.LocationSubscription | null>(null);
  /** True while startRecording is between entry and its watcher being live —
   *  blocks a second Start tap from racing the first. */
  const startingRef = useRef(false);
  /** Bumped by stop/unmount so an in-flight watchPositionAsync from a stale
   *  start can detect it lost the race and release its subscription. */
  const watchGenRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const routeRef = useRef<GpsPoint[]>([]);
  const distRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  /** Highest reliable speed observed during the current recording (km/h). */
  const maxSpeedRef = useRef(0);
  // ── Pause bookkeeping ──
  // While paused the recording watcher keeps running (live speed stays visible)
  // but appends no points. On resume, startTimeRef is shifted forward by the
  // paused duration, which keeps the timer, checkpoints and final ride stats
  // consistent without special-casing them.
  const pausedRef = useRef(false);
  /** Epoch ms when the current pause began, or null when not paused. */
  const pauseStartedAtRef = useRef<number | null>(null);
  /** Paused [start, end] intervals — used to drop background points recorded
   *  during a pause when the route is merged on stop. */
  const pausedIntervalsRef = useRef<PausedInterval[]>([]);
  /** True right after a resume: the next accepted point must not add distance
   *  (the rider may have rolled a short way while paused). */
  const skipNextDistanceRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const prevSpeedPointRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const lastCheckpointRef = useRef(0);

  // Keep recordingRef in sync so the live speed watcher can check it without stale closure
  useEffect(() => { recordingRef.current = recording; }, [recording]);

  // The tab stays mounted once visited, so the idle speedometer's GPS watcher
  // must stop whenever the screen isn't actually visible — otherwise it would
  // keep the GPS radio on forever (battery) while the user is on another tab
  // or the app is backgrounded.
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState !== "background");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => sub.remove();
  }, []);

  // Live speed watcher so the speedometer shows current speed when NOT recording.
  // During a recording the recording watcher already provides speed, so we skip
  // this one to avoid a redundant second GPS subscription (battery).
  useEffect(() => {
    if (recording || !isFocused || !appActive) return;
    let active = true;
    const startLiveWatch = async () => {
      // Check-only: don't pop the OS permission dialog just because the tab
      // was opened. The prompt (with disclosure) happens when Start is tapped;
      // the idle speedometer simply stays at rest until permission exists.
      const { status } = await Location.getForegroundPermissionsAsync();
      if (!active || status !== "granted") return;
      const sub = await Location.watchPositionAsync(
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
      // The effect may have been cleaned up while watchPositionAsync was in
      // flight — release the subscription instead of leaking it.
      if (!active) {
        sub.remove();
        return;
      }
      liveSpeedWatchRef.current = sub;
    };
    startLiveWatch().catch(() => null);
    return () => {
      active = false;
      liveSpeedWatchRef.current?.remove();
      liveSpeedWatchRef.current = null;
    };
  }, [recording, isFocused, appActive]);

  // Release the recording watcher and keep-awake lock if the screen unmounts
  // mid-ride so they don't leak (the checkpoint above allows later recovery).
  useEffect(() => {
    return () => {
      // watchGenRef is a plain counter, not a node ref — bumping the *latest*
      // value on unmount is exactly the point (invalidates in-flight starts).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      watchGenRef.current++;
      watchRef.current?.remove();
      watchRef.current = null;
      deactivateKeepAwake();
    };
  }, []);

  const saveRides = useCallback(async (updated: SavedRide[]) => {
    try {
      await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }, []);

  /** Throttled snapshot of the in-progress ride so a crash can be recovered. */
  const checkpointRide = useCallback(() => {
    const now = Date.now();
    if (now - lastCheckpointRef.current < CHECKPOINT_INTERVAL_MS) return;
    lastCheckpointRef.current = now;
    const cp: Checkpoint = {
      startTime: startTimeRef.current ?? now,
      distanceKm: distRef.current,
      // Thin very long rides so the periodic checkpoint write stays bounded;
      // recovery fidelity matches what buildRide would persist anyway.
      route: downsampleCoords(routeRef.current, MAX_SAVED_ROUTE_POINTS),
      pausedIntervals: pausedIntervalsRef.current,
      maxSpeedKmh: maxSpeedRef.current,
    };
    storage.setItem(CHECKPOINT_KEY, JSON.stringify(cp)).catch(() => null);
  }, []);

  const clearCheckpoint = useCallback(() => {
    lastCheckpointRef.current = 0;
    storage.removeItem(CHECKPOINT_KEY).catch(() => null);
  }, []);

  /** If a previous session was killed mid-ride, rebuild that ride from its
   *  checkpoint (+ any leftover background points) so it isn't lost. */
  const recoverCheckpointRide = useCallback(async (seq: number): Promise<SavedRide | null> => {
    try {
      const raw = await storage.getItem(CHECKPOINT_KEY);
      if (!raw) return null;
      await storage.removeItem(CHECKPOINT_KEY);
      const cp: Checkpoint = JSON.parse(raw);
      let route = Array.isArray(cp.route) ? cp.route : [];
      const pausedIntervals = Array.isArray(cp.pausedIntervals) ? cp.pausedIntervals : [];
      const inPausedInterval = (ts: number) =>
        pausedIntervals.some(([s, e]) => ts >= s && ts <= e);
      try {
        const bg = await readBgPoints();
        if (bg.length > 0) {
          const fgTs = new Set(route.map((p) => p.timestamp));
          // Same filtering as a normal stop: drop background points captured
          // while the ride was paused.
          route = [...route, ...bg.filter((p) => !fgTs.has(p.timestamp) && !inPausedInterval(p.timestamp))]
            .sort((a, b) => a.timestamp - b.timestamp);
        }
        await clearBgPoints();
      } catch {}
      const lastTs = route.length > 0 ? route[route.length - 1].timestamp : cp.startTime;
      return buildRide(route, cp.startTime, lastTs, seq, cp.maxSpeedKmh, pausedIntervals);
    } catch {
      return null;
    }
  }, []);

  const loadRides = useCallback(async () => {
    // If a previous mount left the background task running (screen unmounted
    // mid-ride), stop it before recovering: otherwise the OS foreground service
    // stays alive with no Stop button, and keeps appending points that the next
    // Start would wipe. The checkpoint recovery below preserves the ride data.
    // Never touch the task while a recording is actively in progress.
    try {
      if (
        !recordingRef.current &&
        isLocationTaskDefined() &&
        (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME))
      ) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch {
      // Task manager unavailable (Expo Go) — nothing to stop.
    }
    let existing: SavedRide[] = [];
    try {
      const raw = await storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) existing = parsed;
      }
    } catch {}
    // Backfill a stable seq for rides saved before this field existed (list is
    // newest-first, so the newest gets the highest number).
    const needsBackfill = existing.some((r) => r.seq == null);
    if (needsBackfill) {
      existing = existing.map((r, i) => (r.seq != null ? r : { ...r, seq: existing.length - i }));
    }
    const recovered = await recoverCheckpointRide(nextRideSeq(existing));
    const all = (recovered ? [recovered, ...existing] : existing).slice(0, MAX_SAVED_RIDES);
    setRides(all);
    if (recovered || needsBackfill) await saveRides(all);
  }, [recoverCheckpointRide, saveRides]);

  // Load saved rides (and recover a crashed in-progress ride) on mount.
  useEffect(() => {
    loadRides();
  }, [loadRides]);

  // Timer tick — frozen while paused (startTime is shifted forward on resume,
  // so the displayed elapsed time excludes the paused stretch).
  useEffect(() => {
    if (recording && !paused && startTime !== null) {
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTime);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording, paused, startTime]);

  // Recording pulse animation (steady while paused)
  useEffect(() => {
    if (recording && !paused) {
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
  }, [recording, paused, pulseAnim]);

  const startRecording = useCallback(async () => {
    // A second tap while the permission dialogs are still up would run the
    // whole start sequence again and orphan the first watcher.
    if (startingRef.current || recordingRef.current) return;
    startingRef.current = true;
    const gen = ++watchGenRef.current;
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
          // Denying the notification only hides the ongoing-trip notification;
          // it must not block recording. Warn once and continue.
          Alert.alert(
            t("triplog.notifDisabledTitle"),
            t("triplog.notifDeniedContinueMsg"),
            [
              { text: t("common.ok") },
              {
                text: t("triplog.openSettings"),
                onPress: () => { Linking.openSettings().catch(() => null); },
              },
            ]
          );
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
      maxSpeedRef.current = 0;
      pausedRef.current = false;
      pauseStartedAtRef.current = null;
      pausedIntervalsRef.current = [];
      skipNextDistanceRef.current = false;
      setPaused(false);
      const now = Date.now();
      startTimeRef.current = now;
      setPointCount(0);
      setDistanceKm(0);
      setElapsedMs(0);
      setStartTime(now);
      setCurrentSpeedKmh(null);
      // Keep screen on during the ride so the odometer stays visible.
      await activateKeepAwakeAsync().catch(() => null);
      recordingRef.current = true;
      setRecording(true);

      // Clear any stale background points + checkpoint from a previous session.
      await clearBgPoints();
      clearCheckpoint();

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
              notificationTitle: t("triplog.notifTitle"),
              notificationBody: t("triplog.notifBody"),
              notificationColor: COLORS.brand,
            },
          });
        }
      } catch {
        // Background task may not be available in Expo Go or on restricted devices.
        // Foreground-only tracking (watchPositionAsync below) will still work.
      }

      const sub = await Location.watchPositionAsync(
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
            let speedKmh: number | null = null;
            if (speed != null && speed >= 0) {
              speedKmh = speed * 3.6;
            } else if (prev) {
              const distM = haversineMeters(prev.latitude, prev.longitude, latitude, longitude);
              const dtSec = (ts - prev.timestamp) / 1000;
              if (dtSec > 0.5) {
                speedKmh = distM > 1 ? (distM / dtSec) * 3.6 : 0;
              }
            }
            if (speedKmh != null) setCurrentSpeedKmh(speedKmh);
            setAccuracy(acc ?? null);

            // Discard unreliable fixes — a poor GPS fix that "jumps" would
            // inflate the recorded distance. Speed/accuracy are still shown above.
            if (acc != null && acc > TRIP_MAX_GPS_ACCURACY_M) return;

            // Paused: keep the live speed display but record nothing.
            if (pausedRef.current) return;

            // Track the ride's top speed from reliable fixes only (a bad fix
            // past this guard would otherwise fake a huge max).
            if (speedKmh != null && speedKmh > maxSpeedRef.current) {
              maxSpeedRef.current = speedKmh;
            }

            const newPoint: GpsPoint = { latitude, longitude, timestamp: ts };

            if (prev) {
              const dist = haversineMeters(prev.latitude, prev.longitude, latitude, longitude);
              // Ignore jitter: only count if moved >= 3 m
              if (dist >= 3) {
                if (skipNextDistanceRef.current) {
                  // First point after a resume: re-anchor the track without
                  // counting the way rolled while paused as ridden distance.
                  skipNextDistanceRef.current = false;
                  routeRef.current.push(newPoint);
                  setPointCount(routeRef.current.length);
                  checkpointRide();
                } else {
                  distRef.current += dist / 1000;
                  setDistanceKm(distRef.current);
                  routeRef.current.push(newPoint);
                  setPointCount(routeRef.current.length);
                  checkpointRide();
                }
              } else if (skipNextDistanceRef.current) {
                // Rider didn't move during the pause — nothing to re-anchor.
                skipNextDistanceRef.current = false;
              }
            } else {
              routeRef.current = [newPoint];
              setPointCount(1);
              checkpointRide();
            }
          } catch {
            // Silently ignore any error in the location update callback to prevent
            // an unhandled exception from crashing the app in production.
          }
        },
      );
      // Stop/unmount may have won the race while watchPositionAsync was in
      // flight — release the fresh subscription instead of leaking it.
      if (watchGenRef.current !== gen) {
        sub.remove();
        return;
      }
      watchRef.current = sub;
    } catch {
      // Catch-all: prevent unhandled promise rejection from crashing the app on
      // Android production builds. Reset recording state and show a friendly alert.
      recordingRef.current = false;
      setRecording(false);
      Alert.alert(t("triplog.startErrorTitle"), t("triplog.startErrorMsg"));
    } finally {
      startingRef.current = false;
    }
  }, [t, requestForegroundPermission, requestBackgroundPermission, checkpointRide, clearCheckpoint]);

  /** Pause the recording: time and distance stop accumulating; GPS stays on so
   *  the speedometer keeps working and resume is instant. */
  const pauseRecording = useCallback(() => {
    if (pausedRef.current) return;
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium)?.catch(() => null);
    pausedRef.current = true;
    pauseStartedAtRef.current = Date.now();
    setPaused(true);
  }, []);

  /** Resume after a pause. startTimeRef is shifted forward by the paused
   *  duration so elapsed time / avg speed / checkpoints all exclude the stop. */
  const resumeRecording = useCallback(() => {
    if (!pausedRef.current) return;
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium)?.catch(() => null);
    const pausedAt = pauseStartedAtRef.current ?? Date.now();
    const now = Date.now();
    pausedIntervalsRef.current.push([pausedAt, now]);
    if (startTimeRef.current != null) {
      startTimeRef.current += now - pausedAt;
      setStartTime(startTimeRef.current);
    }
    pausedRef.current = false;
    pauseStartedAtRef.current = null;
    skipNextDistanceRef.current = true;
    setPaused(false);
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      // Invalidate any in-flight start so it can't install a watcher after stop.
      watchGenRef.current++;
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

      recordingRef.current = false;
      setRecording(false);
      // Don't clear speed — live watcher will continue updating it after recording stops

      // Stopping while paused: close the open pause interval and shift the
      // start forward like resume would, so the final duration excludes it.
      if (pausedRef.current) {
        const pausedAt = pauseStartedAtRef.current ?? Date.now();
        const now = Date.now();
        pausedIntervalsRef.current.push([pausedAt, now]);
        if (startTimeRef.current != null) startTimeRef.current += now - pausedAt;
        pausedRef.current = false;
        pauseStartedAtRef.current = null;
        setPaused(false);
      }
      const pausedIntervals = pausedIntervalsRef.current;
      const inPausedInterval = (ts: number) =>
        pausedIntervals.some(([s, e]) => ts >= s && ts <= e);

      // Merge foreground + background points, deduplicate by timestamp, recalculate distance.
      let mergedRoute = [...routeRef.current];
      try {
        const bgPoints = await readBgPoints();
        if (bgPoints.length > 0) {
          const fgTsSet = new Set(routeRef.current.map((p) => p.timestamp));
          // Drop background points captured while the ride was paused — the
          // foreground watcher already skipped that stretch.
          const uniqueBg = bgPoints.filter(
            (p) => !fgTsSet.has(p.timestamp) && !inPausedInterval(p.timestamp)
          );
          mergedRoute = [...routeRef.current, ...uniqueBg].sort((a, b) => a.timestamp - b.timestamp);
        }
        await clearBgPoints();
      } catch {
        // Keep foreground-only route if background data cannot be read.
      }

      // Recompute distance/stats from the merged route and persist the ride.
      // pausedIntervals also excludes the leg rolled while paused from the
      // recomputed distance, keeping it consistent with the live odometer.
      const ride = buildRide(mergedRoute, startTimeRef.current, Date.now(), nextRideSeq(rides), maxSpeedRef.current, pausedIntervals);
      // The ride is finalized — drop the crash-recovery checkpoint.
      clearCheckpoint();

      if (ride) {
        Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success)?.catch(() => null);
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
      recordingRef.current = false;
      setRecording(false);
      Alert.alert(t("triplog.stopErrorTitle"), t("triplog.stopErrorMsg"));
    }
  }, [rides, saveRides, t, clearCheckpoint]);

  const deleteRide = useCallback(async (id: string) => {
    const updated = rides.filter((r) => r.id !== id);
    setRides(updated);
    await saveRides(updated);
  }, [rides, saveRides]);

  /** Export a ride as a GPX 1.1 file and open the OS share sheet
   *  (browser download on web). */
  const exportRide = useCallback(async (ride: SavedRide) => {
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(() => null);
    try {
      const name = ride.name?.trim() || t("triplog.rideLabel", { n: ride.seq ?? 0 });
      // ride.date is the ride's END time; metadata <time> should be the start.
      const startedAt = new Date(ride.date).getTime() - ride.durationMs;
      const gpx = buildGpx(ride.route, name, Number.isFinite(startedAt) ? startedAt : undefined);
      const fileName = gpxFileName(ride.seq, ride.date);

      if (Platform.OS === "web") {
        // Browser: trigger a plain file download.
        const doc: any = (globalThis as any).document;
        if (!doc) throw new Error("no DOM");
        const blob = new Blob([gpx], { type: "application/gpx+xml" });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      if (!FileSystem || !Sharing || !(await Sharing.isAvailableAsync())) {
        Alert.alert(t("triplog.exportFailed"), t("triplog.exportFailedMsg"), [{ text: t("common.ok") }]);
        return;
      }
      const uri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(uri, gpx);
      await Sharing.shareAsync(uri, {
        mimeType: "application/gpx+xml",
        dialogTitle: name,
        UTI: "com.topografix.gpx",
      });
    } catch {
      Alert.alert(t("triplog.exportFailed"), t("triplog.exportFailedMsg"), [{ text: t("common.ok") }]);
    }
  }, [t]);

  const openRename = useCallback((ride: SavedRide) => {
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(() => null);
    setRenamingRide(ride);
    setRenameText(ride.name ?? "");
  }, []);

  const saveRename = useCallback(async () => {
    if (!renamingRide) return;
    const name = renameText.trim();
    const updated = rides.map((r) =>
      r.id === renamingRide.id ? { ...r, name: name || undefined } : r
    );
    setRenamingRide(null);
    setRides(updated);
    await saveRides(updated);
  }, [renamingRide, renameText, rides, saveRides]);

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

          {recording && pointCount > 1 && (
            <Text style={styles.accuracyText}>
              {t("triplog.points", { count: pointCount })}
            </Text>
          )}

          {/* Start button, or Pause/Resume + Stop while recording */}
          {!recording ? (
            <Pressable
              style={({ pressed }) => [
                styles.mainBtn,
                styles.startBtn,
                pressed && styles.mainBtnPressed,
              ]}
              onPress={() => { startRecording().catch(() => null); }}
              accessibilityRole="button"
              accessibilityLabel={t("triplog.start")}
            >
              <Text style={styles.mainBtnText}>{`▶  ${t("triplog.start")}`}</Text>
            </Pressable>
          ) : (
            <View style={styles.recordingBtnRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.mainBtn,
                  styles.recordingRowBtn,
                  paused ? styles.resumeBtn : styles.pauseBtn,
                  pressed && styles.mainBtnPressed,
                ]}
                onPress={() => { if (paused) resumeRecording(); else pauseRecording(); }}
                accessibilityRole="button"
                accessibilityLabel={paused ? t("triplog.resume") : t("triplog.pause")}
                accessibilityState={{ selected: paused }}
              >
                <Text style={[styles.mainBtnText, styles.recordingRowBtnText]}>
                  {paused ? `▶  ${t("triplog.resume")}` : `⏸  ${t("triplog.pause")}`}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.mainBtn,
                  styles.recordingRowBtn,
                  styles.stopBtn,
                  pressed && styles.mainBtnPressed,
                ]}
                onPress={() => { stopRecording().catch(() => null); }}
                accessibilityRole="button"
                accessibilityLabel={t("triplog.stop")}
              >
                <Text style={[styles.mainBtnText, styles.recordingRowBtnText]}>{`⏹  ${t("triplog.stopShort")}`}</Text>
              </Pressable>
            </View>
          )}
          {recording && paused && (
            <Text style={styles.pausedHint}>⏸ {t("triplog.pausedHint")}</Text>
          )}
        </View>

        {/* Ride History — memoized so the per-fix state updates during a
            recording don't re-reconcile the whole list on every GPS tick. */}
        <RideHistorySection
          rides={rides}
          expandedMaps={expandedMaps}
          unitSystem={settings.unitSystem}
          language={i18n.language}
          onToggleMap={toggleMap}
          onOpenRename={openRename}
          onExport={exportRide}
          onDelete={deleteRide}
          onClearAll={confirmClearAll}
          onFullscreen={setFullscreenRide}
        />

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
          <View style={styles.mapModal} accessibilityViewIsModal>
            <View style={styles.mapModalHeader}>
              <Text style={styles.mapModalTitle} accessibilityRole="header">{fullscreenRide.date ? new Date(fullscreenRide.date).toLocaleDateString(i18n.language) : ""}</Text>
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

      {/* Rename ride modal */}
      <Modal
        visible={renamingRide !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenamingRide(null)}
      >
        <Pressable style={styles.renameOverlay} onPress={() => setRenamingRide(null)} accessibilityLabel={t("triplog.cancel")}>
          <Pressable style={styles.renameCard} onPress={() => {}} accessibilityViewIsModal>
            <Text style={styles.renameTitle} accessibilityRole="header">{t("triplog.rename")}</Text>
            <TextInput
              style={styles.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder={t("triplog.renamePlaceholder")}
              placeholderTextColor="#555555"
              maxLength={60}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => { saveRename(); }}
              accessibilityLabel={t("triplog.renamePlaceholder")}
            />
            <View style={styles.renameActions}>
              <Pressable style={[styles.renameBtn, styles.renameCancelBtn]} onPress={() => setRenamingRide(null)} accessibilityRole="button" accessibilityLabel={t("triplog.cancel")}>
                <Text style={styles.renameCancelText}>{t("triplog.cancel")}</Text>
              </Pressable>
              <Pressable style={[styles.renameBtn, styles.renameSaveBtn]} onPress={() => { saveRename(); }} accessibilityRole="button" accessibilityLabel={t("triplog.save")}>
                <Text style={styles.renameSaveText}>{t("triplog.save")}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const RideHistorySection = memo(function RideHistorySection({
  rides,
  expandedMaps,
  unitSystem,
  language,
  onToggleMap,
  onOpenRename,
  onExport,
  onDelete,
  onClearAll,
  onFullscreen,
}: {
  rides: SavedRide[];
  expandedMaps: Set<string>;
  unitSystem: UnitSystem;
  language: string;
  onToggleMap: (id: string) => void;
  onOpenRename: (ride: SavedRide) => void;
  onExport: (ride: SavedRide) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onFullscreen: (ride: SavedRide) => void;
}) {
  const { t } = useTranslation();
  const totals = useMemo(() => rideTotals(rides), [rides]);

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("triplog.history")}</Text>
        {rides.length > 0 && (
          <Pressable onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(() => null); onClearAll(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("triplog.clearAll")}>
            <Text style={styles.clearAllText}>{t("triplog.clearAll")}</Text>
          </Pressable>
        )}
      </View>

      {/* Lifetime totals across the saved history */}
      {rides.length > 0 && (
        <View style={styles.totalsRow}>
          <View style={styles.totalsItem}>
            <Text style={styles.totalsValue}>{totals.count}</Text>
            <Text style={styles.totalsLabel}>{t("triplog.totalRides")}</Text>
          </View>
          <View style={styles.totalsDivider} />
          <View style={styles.totalsItem}>
            <Text style={styles.totalsValue}>{fmtDist(totals.distanceKm, unitSystem)}</Text>
            <Text style={styles.totalsLabel}>{t("triplog.totalDistance")}</Text>
          </View>
          <View style={styles.totalsDivider} />
          <View style={styles.totalsItem}>
            <Text style={styles.totalsValue}>{formatDuration(totals.durationMs)}</Text>
            <Text style={styles.totalsLabel}>{t("triplog.totalTime")}</Text>
          </View>
        </View>
      )}

      {rides.length === 0 ? (
        <Text style={styles.emptyText}>{t("triplog.noRides")}</Text>
      ) : (
        rides.map((ride, idx) => (
          <View key={ride.id} style={styles.rideCard}>
            {/* Orange accent top strip */}
            <View style={styles.rideCardAccent} />
            {/* Card header: title (tap to rename) + date */}
            <View style={styles.rideCardHeader}>
              <Pressable
                onPress={() => onOpenRename(ride)}
                hitSlop={8}
                style={styles.rideTitleBtn}
                accessibilityRole="button"
                accessibilityLabel={t("triplog.rename")}
              >
                <Text style={styles.rideTitle}>
                  🏍️ {ride.name?.trim() || t("triplog.rideLabel", { n: ride.seq ?? (rides.length - idx) })}
                  <Text style={styles.rideRenameHint}>  ✎</Text>
                </Text>
              </Pressable>
              <Text style={styles.rideDate}>{formatDate(ride.date, language)}</Text>
            </View>
            {/* Stat chips */}
            <View style={styles.rideStatChips}>
              <View style={styles.rideStatChip}>
                <Text style={styles.rideStatChipValue}>{fmtDist(ride.distanceKm, unitSystem)}</Text>
                <Text style={styles.rideStatChipLabel}>📏 {t("triplog.distance")}</Text>
              </View>
              <View style={styles.rideStatChip}>
                <Text style={styles.rideStatChipValue}>{formatDuration(ride.durationMs)}</Text>
                <Text style={styles.rideStatChipLabel}>⏱ {t("triplog.duration")}</Text>
              </View>
              <View style={styles.rideStatChip}>
                <Text style={styles.rideStatChipValue}>{fmtSpeed(ride.avgSpeedKmh, unitSystem)}</Text>
                <Text style={styles.rideStatChipLabel}>⚡ {t("triplog.avgSpeed")}</Text>
              </View>
              {ride.maxSpeedKmh != null && (
                <View style={styles.rideStatChip}>
                  <Text style={styles.rideStatChipValue}>{fmtSpeed(ride.maxSpeedKmh, unitSystem)}</Text>
                  <Text style={styles.rideStatChipLabel}>🚀 {t("triplog.maxSpeed")}</Text>
                </View>
              )}
            </View>
            {/* Action buttons */}
            <View style={styles.rideActions}>
              {ride.route.length > 1 && (
                <Pressable
                  style={[styles.rideBtn, styles.mapBtn, expandedMaps.has(ride.id) && styles.mapBtnActive]}
                  onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(() => null); onToggleMap(ride.id); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={expandedMaps.has(ride.id) ? t("triplog.hideRoute") : t("triplog.viewRoute")}
                >
                  <Text style={[styles.rideBtnText, styles.mapBtnText]}>
                    {expandedMaps.has(ride.id) ? t("triplog.hideRoute") : t("triplog.viewRoute")}
                  </Text>
                </Pressable>
              )}
              {ride.route.length > 1 && (
                <Pressable
                  style={[styles.rideBtn, styles.exportBtn]}
                  onPress={() => onExport(ride)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t("triplog.exportGpx")}
                >
                  <Text style={[styles.rideBtnText, styles.exportBtnText]}>{t("triplog.exportGpx")}</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.rideBtn, styles.deleteBtn]}
                onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(() => null); onDelete(ride.id); }}
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
                  onPress={() => onFullscreen(ride)}
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
    </>
  );
});

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
    pct > 0.85 ? COLORS.danger :
    pct > 0.6  ? "#f97316" :
    pct > 0.3  ? "#fbbf24" : COLORS.success;

  return (
    <View
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${speedKmh != null ? Math.round(speedKmh) : "—"} ${unit}`}
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
          borderColor: COLORS.border,
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

// ── RideMapPreview ────────────────────────────────────────────────────────────
// Tile math comes from lib/osmTiles.ts (shared with POIMap); the preview keeps
// its historical parameters via TileLayoutOptions: a fixed 4×3 tile cap and a
// minimum zoom of 5.

/** Maximum number of tiles allowed horizontally in the preview grid. */
const MAX_TILES_ACROSS = 4;

/** Maximum number of tiles allowed vertically in the preview grid. */
const MAX_TILES_DOWN = 3;

/** Lowest zoom level considered when auto-selecting a zoom for the route preview. */
const MIN_PREVIEW_ZOOM = 5;

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
  const paddedBounds = useMemo(() => {
    const b = boundsOf(pts);
    return b ? padBounds(b, ROUTE_PAD, 0.005) : null;
  }, [pts]);

  const [containerWidth, setContainerWidth] = useState(0);

  // Compute tile grid and scale when container size is known
  const layout = useMemo(() => {
    if (!paddedBounds) return null;
    return computeTileLayout(paddedBounds, containerWidth, MAP_HEIGHT, {
      maxAcross: MAX_TILES_ACROSS,
      maxDown: MAX_TILES_DOWN,
      minZoom: MIN_PREVIEW_ZOOM,
    });
  }, [containerWidth, paddedBounds, MAP_HEIGHT]);

  /** Convert a GPS point to screen [x, y] using the same Mercator projection as the tiles. */
  const toScreen = useCallback((p: GpsPoint): [number, number] | null => {
    if (!layout) return null;
    return projectToScreen(layout, p.latitude, p.longitude);
  }, [layout]);

  // Build tile list
  const tiles = useMemo(() => (layout ? buildTiles(layout) : []), [layout]);

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
              backgroundColor: COLORS.brand,
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
          backgroundColor: COLORS.success,
          borderWidth: 2,
          borderColor: COLORS.white,
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
          backgroundColor: COLORS.danger,
          borderWidth: 2,
          borderColor: COLORS.white,
        }} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#111",
    borderBottomWidth: 2,
    borderBottomColor: COLORS.brand,
  },
  badge: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    color: COLORS.brand,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.white,
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
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.brand,
    marginRight: 8,
  },
  trackingText: {
    color: COLORS.brand,
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
    color: COLORS.brand,
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
    backgroundColor: COLORS.success,
    shadowColor: COLORS.success,
  },
  stopBtn: {
    backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger,
  },
  pauseBtn: {
    backgroundColor: COLORS.warning,
    shadowColor: COLORS.warning,
  },
  resumeBtn: {
    backgroundColor: COLORS.success,
    shadowColor: COLORS.success,
  },
  recordingBtnRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  recordingRowBtn: {
    flex: 1,
    width: undefined,
    paddingHorizontal: 8,
  },
  recordingRowBtnText: {
    fontSize: 15,
    letterSpacing: 0.5,
  },
  pausedHint: {
    color: COLORS.warning,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 10,
  },
  mainBtnPressed: { opacity: 0.8 },
  mainBtnText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 20,
    letterSpacing: 2,
  },
  errorText: {
    color: COLORS.danger,
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
    color: COLORS.brand,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 2,
  },
  clearAllText: {
    color: COLORS.danger,
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
    borderColor: COLORS.border,
    marginBottom: 14,
    overflow: "hidden",
  },
  rideCardAccent: {
    height: 3,
    backgroundColor: COLORS.brand,
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
  rideTitleBtn: { flexShrink: 1, marginRight: 8 },
  rideTitle: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 14,
  },
  rideRenameHint: { color: COLORS.brand, fontSize: 13 },
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
    color: COLORS.brand,
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
    color: COLORS.success,
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
    borderColor: COLORS.brand,
  },
  mapBtnText: {
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: "700",
  },
  exportBtn: {
    flex: 1,
    backgroundColor: "rgba(59,130,246,0.08)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.35)",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  exportBtnText: {
    color: "#3b82f6",
    fontSize: 12,
    fontWeight: "700",
  },
  totalsRow: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    marginBottom: 14,
  },
  totalsItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  totalsDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: 2,
  },
  totalsValue: {
    color: COLORS.brand,
    fontSize: 15,
    fontWeight: "800",
  },
  totalsLabel: {
    color: COLORS.muted,
    fontSize: 11,
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
    color: COLORS.white,
    fontSize: 11,
    fontWeight: "600",
  },
  mapModal: {
    flex: 1,
    backgroundColor: COLORS.bg,
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
    borderBottomColor: COLORS.brand,
  },
  mapModalTitle: {
    color: COLORS.white,
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
    color: COLORS.brand,
    fontSize: 18,
    fontWeight: "700",
  },
  mapModalBody: {
    flex: 1,
    padding: 0,
  },

  bottomPad: { height: 40 },

  // Rename modal
  renameOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  renameCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    width: "100%",
    gap: 14,
  },
  renameTitle: { color: COLORS.white, fontSize: 16, fontWeight: "800", letterSpacing: 1 },
  renameInput: {
    backgroundColor: "#111",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
    color: COLORS.white,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  renameActions: { flexDirection: "row", gap: 10 },
  renameBtn: { flex: 1, borderRadius: 8, paddingVertical: 11, alignItems: "center" },
  renameCancelBtn: { backgroundColor: "#111", borderWidth: 1, borderColor: "#333" },
  renameCancelText: { color: "#888", fontWeight: "700", fontSize: 14 },
  renameSaveBtn: { backgroundColor: COLORS.brand },
  renameSaveText: { color: "#000", fontWeight: "800", fontSize: 14 },
});
