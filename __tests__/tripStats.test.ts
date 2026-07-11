// Tests for the Trip Logger's pure route/stats math (lib/tripStats.ts),
// previously untestable inside the triplogger component.

import {
  buildRide,
  formatDuration,
  nextRideSeq,
  routeDistanceKm,
  type GpsPoint,
  type SavedRide,
} from "../lib/tripStats";

/** Build a GpsPoint n metres north of a base point (1° lat ≈ 111 320 m). */
const pointNorthOf = (baseLat: number, meters: number, ts: number): GpsPoint => ({
  latitude: baseLat + meters / 111_320,
  longitude: 10.75,
  timestamp: ts,
});

const rideWith = (over: Partial<SavedRide>): SavedRide => ({
  id: "1",
  date: "2026-07-11T10:00:00.000Z",
  distanceKm: 1,
  durationMs: 60_000,
  avgSpeedKmh: 60,
  route: [],
  ...over,
});

describe("routeDistanceKm", () => {
  it("returns 0 for empty and single-point routes", () => {
    expect(routeDistanceKm([])).toBe(0);
    expect(routeDistanceKm([pointNorthOf(59.9, 0, 0)])).toBe(0);
  });

  it("sums the distance of a straight route", () => {
    const route = [
      pointNorthOf(59.9, 0, 0),
      pointNorthOf(59.9, 500, 1),
      pointNorthOf(59.9, 1000, 2),
    ];
    expect(routeDistanceKm(route)).toBeCloseTo(1.0, 2);
  });

  it("ignores GPS jitter below 3 m", () => {
    const route = [
      pointNorthOf(59.9, 0, 0),
      pointNorthOf(59.9, 1, 1), // 1 m — jitter
      pointNorthOf(59.9, 2, 2), // 1 m — jitter
    ];
    expect(routeDistanceKm(route)).toBe(0);
  });

  it("counts moves at exactly the 3 m threshold", () => {
    const route = [pointNorthOf(59.9, 0, 0), pointNorthOf(59.9, 3.01, 1)];
    expect(routeDistanceKm(route)).toBeGreaterThan(0);
  });
});

describe("buildRide", () => {
  const now = 1_760_000_000_000;

  it("returns null for a too-short ride (< ~10 m)", () => {
    const route = [pointNorthOf(59.9, 0, now - 60_000), pointNorthOf(59.9, 5, now)];
    expect(buildRide(route, now - 60_000, now, 1)).toBeNull();
  });

  it("builds a ride with rounded distance and average speed", () => {
    // 1 km in 2 minutes → 30 km/h
    const start = now - 120_000;
    const route = [
      pointNorthOf(59.9, 0, start),
      pointNorthOf(59.9, 500, start + 60_000),
      pointNorthOf(59.9, 1000, now),
    ];
    const ride = buildRide(route, start, now, 7);
    expect(ride).not.toBeNull();
    expect(ride!.distanceKm).toBeCloseTo(1.0, 1);
    expect(ride!.avgSpeedKmh).toBeCloseTo(30, 0);
    expect(ride!.durationMs).toBe(120_000);
    expect(ride!.seq).toBe(7);
    expect(ride!.id).toBe(String(now));
    expect(ride!.date).toBe(new Date(now).toISOString());
  });

  it("handles a missing startTime (0 duration, 0 avg speed)", () => {
    const route = [pointNorthOf(59.9, 0, now - 60_000), pointNorthOf(59.9, 200, now)];
    const ride = buildRide(route, null, now, 1);
    expect(ride).not.toBeNull();
    expect(ride!.durationMs).toBe(0);
    expect(ride!.avgSpeedKmh).toBe(0);
  });

  it("clamps a negative duration to 0 (clock skew)", () => {
    const route = [pointNorthOf(59.9, 0, now), pointNorthOf(59.9, 200, now)];
    const ride = buildRide(route, now + 5_000, now, 1);
    expect(ride).not.toBeNull();
    expect(ride!.durationMs).toBe(0);
  });
});

describe("nextRideSeq", () => {
  it("starts at 1 for an empty history", () => {
    expect(nextRideSeq([])).toBe(1);
  });

  it("is one more than the highest seq, not the count", () => {
    // Rides 1 and 3 remain after deleting ride 2 → next must be 4, not 3
    expect(nextRideSeq([rideWith({ seq: 3 }), rideWith({ seq: 1 })])).toBe(4);
  });

  it("treats missing seq as 0 (legacy rides)", () => {
    expect(nextRideSeq([rideWith({ seq: undefined })])).toBe(1);
  });
});

describe("formatDuration", () => {
  it("formats sub-hour durations as m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(59_000)).toBe("0:59");
    expect(formatDuration(60_000)).toBe("1:00");
    expect(formatDuration(605_000)).toBe("10:05");
  });

  it("formats hour+ durations as h:mm:ss", () => {
    expect(formatDuration(3_600_000)).toBe("1:00:00");
    expect(formatDuration(3_661_000)).toBe("1:01:01");
    expect(formatDuration(36_000_000 + 754_000)).toBe("10:12:34");
  });
});
