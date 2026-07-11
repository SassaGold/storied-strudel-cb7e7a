// ── Trip Logger pure logic ────────────────────────────────────────────────────
// Route distance/stats math and display helpers, extracted from
// app/(tabs)/triplogger.tsx so they can be unit-tested without the component.

import { haversineMeters } from "./overpass";

export type GpsPoint = { latitude: number; longitude: number; timestamp: number };

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
};

/** GPS jitter threshold: point-to-point moves below this are ignored (metres). */
export const MIN_MOVE_M = 3;

/** Rides shorter than this are discarded as noise on stop (km). */
export const MIN_RIDE_KM = 0.01;

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

/** Sum a route's great-circle distance in km, ignoring < 3 m GPS jitter. */
export const routeDistanceKm = (route: GpsPoint[]): number => {
  let km = 0;
  for (let i = 1; i < route.length; i++) {
    const d = haversineMeters(
      route[i - 1].latitude, route[i - 1].longitude,
      route[i].latitude, route[i].longitude,
    );
    if (d >= MIN_MOVE_M) km += d / 1000;
  }
  return km;
};

/** Build a SavedRide from a route + timing, or null if it's too short (< ~10 m). */
export const buildRide = (
  route: GpsPoint[],
  startTime: number | null,
  endTime: number,
  seq: number
): SavedRide | null => {
  const distanceKm = routeDistanceKm(route);
  if (distanceKm <= MIN_RIDE_KM) return null;
  const durationMs = startTime ? Math.max(0, endTime - startTime) : 0;
  const avgSpeedKmh = durationMs > 0 ? distanceKm / (durationMs / 3_600_000) : 0;
  return {
    id: String(endTime),
    date: new Date(endTime).toISOString(),
    distanceKm: Math.round(distanceKm * 100) / 100,
    durationMs,
    avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
    route,
    seq,
  };
};
