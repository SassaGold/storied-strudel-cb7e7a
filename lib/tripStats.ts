// ── Trip Logger pure logic ────────────────────────────────────────────────────
// Route distance/stats math and display helpers, extracted from
// app/(tabs)/triplogger.tsx so they can be unit-tested without the component.

import { downsampleCoords } from "./coords";
import { haversineMeters } from "./overpass";

export type GpsPoint = { latitude: number; longitude: number; timestamp: number };

/** A [start, end] epoch-ms interval during which the ride was paused. */
export type PausedInterval = [number, number];

export type SavedRide = {
  id: string;
  date: string; // ISO string
  distanceKm: number;
  durationMs: number;
  avgSpeedKmh: number;
  route: GpsPoint[];
  /** Stable ride number assigned at save time (doesn't renumber on delete). */
  seq?: number;
  /** Optional user-given name; falls back to "Ride {seq}" when absent. */
  name?: string;
  /** Highest speed observed during the ride (km/h). Absent on legacy rides. */
  maxSpeedKmh?: number;
};

/** GPS jitter threshold: point-to-point moves below this are ignored (metres). */
export const MIN_MOVE_M = 3;

/** Rides shorter than this are discarded as noise on stop (km). */
export const MIN_RIDE_KM = 0.01;

/** Cap on route points persisted per ride. Distance/stats are computed from
 *  the full route first; only the stored polyline is thinned. 2000 points is
 *  one point every ~15 s on an 8-hour ride — well above what the map preview
 *  (≤500 points) or a GPX consumer needs, while keeping the AsyncStorage blob
 *  bounded. */
export const MAX_SAVED_ROUTE_POINTS = 2000;

/** Next stable ride number = one more than the highest existing seq. */
export const nextRideSeq = (rides: SavedRide[]): number =>
  rides.reduce((max, r) => Math.max(max, r.seq ?? 0), 0) + 1;

/** Format a duration as h:mm:ss (or m:ss under an hour). */
export const formatDuration = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/** Format a ride date in the app's language (i18n.language), not device locale. */
export const formatDate = (iso: string, locale?: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Sum a route's great-circle distance in km, ignoring < 3 m GPS jitter.
 * Segments that span a paused interval are skipped: no points are recorded
 * while paused, so the leg from the last pre-pause point to the first
 * post-resume point is ground covered while NOT riding and must not count
 * (the live odometer already excludes it — this keeps the recomputed saved
 * distance consistent with what the rider saw).
 */
export const routeDistanceKm = (
  route: GpsPoint[],
  pausedIntervals: PausedInterval[] = []
): number => {
  let km = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    if (pausedIntervals.some(([s, e]) => a.timestamp <= e && b.timestamp >= s)) continue;
    const d = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
    if (d >= MIN_MOVE_M) km += d / 1000;
  }
  return km;
};

/**
 * Merge background-recorded points into the foreground route.
 *
 * `earliestValidTs` is the crucial argument. The background buffer can still
 * hold points written moments after the *previous* ride stopped, and merging
 * those makes the saved route open with a leg from wherever the rider was last
 * seen to where this ride actually started. That leg is never real distance —
 * it inflates distanceKm, and because durationMs is unaffected, avgSpeedKmh
 * with it.
 *
 * Seen in the wild as a saved 9.37 km against a live 5.65 km, the 3.72 km
 * difference being exactly the distance between the two locations, and an
 * average of 72 km/h against a true 43 km/h.
 *
 * Callers must pass a bound that cannot move: the ride's wall-clock start, or
 * its earliest recorded point. NOT a pause-adjusted start time, which shifts
 * forward on every resume and would discard genuine pre-pause points.
 */
export const mergeBackgroundPoints = (
  foreground: GpsPoint[],
  background: GpsPoint[],
  earliestValidTs: number,
  pausedIntervals: PausedInterval[] = []
): GpsPoint[] => {
  if (background.length === 0) return [...foreground];
  const fgTs = new Set(foreground.map((p) => p.timestamp));
  const inPaused = (ts: number) =>
    pausedIntervals.some(([s, e]) => ts >= s && ts <= e);
  const extra = background.filter(
    (p) =>
      p.timestamp >= earliestValidTs &&
      !fgTs.has(p.timestamp) &&
      !inPaused(p.timestamp)
  );
  return [...foreground, ...extra].sort((a, b) => a.timestamp - b.timestamp);
};

/**
 * Highest reliable speed (km/h) among background-recorded points.
 *
 * The foreground watcher tracks maxSpeedRef, but it only receives fixes while
 * the app is foregrounded — on a real ride the phone is pocketed and every
 * fast stretch is recorded by the background task instead, so a 140 km/h ride
 * saved with a walking-pace max. Fold this value in at stop/recovery.
 *
 * Same filters as mergeBackgroundPoints (stale points from before the ride and
 * paused intervals contribute nothing) plus the foreground's reliability gate:
 * a fix with accuracy worse than `maxAccuracyM` must not set the max.
 */
export const maxSpeedKmhFromBgPoints = (
  points: Array<GpsPoint & { speed?: number; accuracy?: number }>,
  earliestValidTs: number,
  pausedIntervals: PausedInterval[] = [],
  maxAccuracyM: number = Number.POSITIVE_INFINITY
): number => {
  const inPaused = (ts: number) =>
    pausedIntervals.some(([s, e]) => ts >= s && ts <= e);
  let max = 0;
  for (const p of points) {
    if (p.timestamp < earliestValidTs || inPaused(p.timestamp)) continue;
    if (p.speed == null || p.speed < 0) continue;
    if (p.accuracy != null && p.accuracy > maxAccuracyM) continue;
    const kmh = p.speed * 3.6;
    if (kmh > max) max = kmh;
  }
  return max;
};

/** Build a SavedRide from a route + timing, or null if it's too short (< ~10 m). */
export const buildRide = (
  route: GpsPoint[],
  startTime: number | null,
  endTime: number,
  seq: number,
  maxSpeedKmh?: number,
  pausedIntervals: PausedInterval[] = []
): SavedRide | null => {
  const distanceKm = routeDistanceKm(route, pausedIntervals);
  if (distanceKm <= MIN_RIDE_KM) return null;
  const durationMs = startTime ? Math.max(0, endTime - startTime) : 0;
  const avgSpeedKmh = durationMs > 0 ? distanceKm / (durationMs / 3_600_000) : 0;
  return {
    id: String(endTime),
    date: new Date(endTime).toISOString(),
    distanceKm: Math.round(distanceKm * 100) / 100,
    durationMs,
    avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
    route: downsampleCoords(route, MAX_SAVED_ROUTE_POINTS),
    seq,
    ...(maxSpeedKmh != null && maxSpeedKmh > 0
      ? { maxSpeedKmh: Math.round(maxSpeedKmh * 10) / 10 }
      : {}),
  };
};

/** Lifetime totals across the saved ride history. */
export const rideTotals = (rides: SavedRide[]) => {
  let distanceKm = 0;
  let durationMs = 0;
  for (const r of rides) {
    distanceKm += r.distanceKm;
    durationMs += r.durationMs;
  }
  return { count: rides.length, distanceKm, durationMs };
};
