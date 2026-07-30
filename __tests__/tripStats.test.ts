// Tests for the Trip Logger's pure route/stats math (lib/tripStats.ts),
// previously untestable inside the triplogger component.

import {
  buildRide,
  formatDuration,
  MAX_SAVED_ROUTE_POINTS,
  maxSpeedKmhFromBgPoints,
  mergeBackgroundPoints,
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

  it("skips the segment spanning a paused interval (way rolled while paused)", () => {
    // Ride 500 m, pause at t=1000–2000 and roll 300 m, then ride 500 m more.
    const route = [
      pointNorthOf(59.9, 0, 0),
      pointNorthOf(59.9, 500, 900),    // last point before the pause
      pointNorthOf(59.9, 800, 2100),   // first point after resume (300 m rolled)
      pointNorthOf(59.9, 1300, 3000),
    ];
    const full = routeDistanceKm(route);
    const excludingPause = routeDistanceKm(route, [[1000, 2000]]);
    expect(full).toBeCloseTo(1.3, 2);
    expect(excludingPause).toBeCloseTo(1.0, 2);
  });

  it("does not skip segments entirely outside paused intervals", () => {
    const route = [
      pointNorthOf(59.9, 0, 0),
      pointNorthOf(59.9, 500, 900),
      pointNorthOf(59.9, 1000, 1800),
    ];
    expect(routeDistanceKm(route, [[5000, 6000]])).toBeCloseTo(1.0, 2);
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

  it("excludes paused-interval travel from the recomputed ride distance", () => {
    const start = now - 300_000;
    const route = [
      pointNorthOf(59.9, 0, start),
      pointNorthOf(59.9, 500, start + 60_000),
      // 300 m rolled during a pause between +60 s and +120 s
      pointNorthOf(59.9, 800, start + 130_000),
      pointNorthOf(59.9, 1300, now),
    ];
    const ride = buildRide(route, start, now, 1, undefined, [[start + 61_000, start + 120_000]]);
    expect(ride).not.toBeNull();
    expect(ride!.distanceKm).toBeCloseTo(1.0, 1);
  });

  it("keeps short routes intact but caps very long stored routes", () => {
    const start = now - 3_600_000;
    const short = [pointNorthOf(59.9, 0, start), pointNorthOf(59.9, 500, now)];
    expect(buildRide(short, start, now, 1)!.route).toHaveLength(2);

    const long = Array.from({ length: MAX_SAVED_ROUTE_POINTS + 500 }, (_, i) =>
      pointNorthOf(59.9, i * 5, start + i * 1000),
    );
    const ride = buildRide(long, start, now, 1)!;
    expect(ride.route).toHaveLength(MAX_SAVED_ROUTE_POINTS);
    // First/last points survive and distance reflects the FULL route.
    expect(ride.route[0]).toEqual(long[0]);
    expect(ride.route[ride.route.length - 1]).toEqual(long[long.length - 1]);
    expect(ride.distanceKm).toBeCloseTo(routeDistanceKm(long), 1);
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

describe("mergeBackgroundPoints", () => {
  const at = (ts: number, lat = 59.9): GpsPoint => ({ latitude: lat, longitude: 10.75, timestamp: ts });

  it("merges background points into the foreground route in timestamp order", () => {
    const fg = [at(1000), at(3000)];
    const bg = [at(2000), at(4000)];
    expect(mergeBackgroundPoints(fg, bg, 0).map((p) => p.timestamp)).toEqual([
      1000, 2000, 3000, 4000,
    ]);
  });

  it("deduplicates points the foreground watcher already recorded", () => {
    const fg = [at(1000), at(2000)];
    const bg = [at(2000), at(3000)];
    expect(mergeBackgroundPoints(fg, bg, 0).map((p) => p.timestamp)).toEqual([1000, 2000, 3000]);
  });

  it("drops background points captured while the ride was paused", () => {
    const fg = [at(1000), at(5000)];
    const bg = [at(2500), at(6000)];
    const merged = mergeBackgroundPoints(fg, bg, 0, [[2000, 3000]]);
    expect(merged.map((p) => p.timestamp)).toEqual([1000, 5000, 6000]);
  });

  // The regression this function exists for. The background buffer can still
  // hold points written just after the PREVIOUS ride stopped; merging them made
  // the saved route open with a leg from wherever the rider was last seen to
  // where this ride actually began. Observed as a saved 9.37 km against a live
  // 5.65 km — the 3.72 km difference being exactly that gap — and an average of
  // 72 km/h against a true 43 km/h.
  it("drops stale points from before the ride began", () => {
    const staleFarAway = { latitude: 59.88, longitude: 10.82, timestamp: 500 };
    const fg = [at(1000), at(2000)];
    const merged = mergeBackgroundPoints(fg, [staleFarAway, at(3000)], 1000);
    expect(merged.map((p) => p.timestamp)).toEqual([1000, 2000, 3000]);
  });

  it("does not inflate distance or average speed with a stale point", () => {
    // ~1 km of real riding, plus a stale fix 3.7 km away recorded beforehand.
    const fg = [pointNorthOf(59.9, 0, 1000), pointNorthOf(59.9, 1000, 61_000)];
    const stale = { latitude: 59.9 - 3700 / 111_320, longitude: 10.75, timestamp: 500 };

    const withBound = mergeBackgroundPoints(fg, [stale], 1000);
    const withoutBound = mergeBackgroundPoints(fg, [stale], 0);

    expect(routeDistanceKm(withBound)).toBeCloseTo(1, 1);
    // Without the bound the stale leg is counted — the bug.
    expect(routeDistanceKm(withoutBound)).toBeGreaterThan(4);

    const good = buildRide(withBound, 1000, 61_000, 1);
    const bad = buildRide(withoutBound, 1000, 61_000, 1);
    expect(good?.avgSpeedKmh).toBeCloseTo(60, 0);
    expect(bad!.avgSpeedKmh).toBeGreaterThan(good!.avgSpeedKmh * 4);
  });

  it("returns a copy of the foreground route when there are no background points", () => {
    const fg = [at(1000)];
    const merged = mergeBackgroundPoints(fg, [], 0);
    expect(merged).toEqual(fg);
    expect(merged).not.toBe(fg);
  });
});

describe("maxSpeedKmhFromBgPoints", () => {
  const bg = (ts: number, speed?: number, accuracy?: number) => ({
    latitude: 59.9,
    longitude: 10.75,
    timestamp: ts,
    ...(speed != null ? { speed } : {}),
    ...(accuracy != null ? { accuracy } : {}),
  });

  it("returns the highest reliable speed in km/h", () => {
    // 40 m/s = 144 km/h — the motorway stretch a pocketed phone records in
    // the background while the foreground max only ever saw walking pace.
    const points = [bg(1000, 10), bg(2000, 40), bg(3000, 25)];
    expect(maxSpeedKmhFromBgPoints(points, 0)).toBeCloseTo(144, 5);
  });

  it("ignores points from before the ride started (stale buffer)", () => {
    const points = [bg(500, 50), bg(2000, 20)];
    expect(maxSpeedKmhFromBgPoints(points, 1000)).toBeCloseTo(72, 5);
  });

  it("ignores points inside paused intervals", () => {
    const points = [bg(1000, 20), bg(2500, 50), bg(4000, 15)];
    expect(maxSpeedKmhFromBgPoints(points, 0, [[2000, 3000]])).toBeCloseTo(72, 5);
  });

  it("applies the same accuracy gate as the foreground watcher", () => {
    const points = [bg(1000, 20, 10), bg(2000, 60, 80)];
    expect(maxSpeedKmhFromBgPoints(points, 0, [], 50)).toBeCloseTo(72, 5);
  });

  it("returns 0 when no point carries a usable speed", () => {
    const points = [bg(1000), bg(2000, -1)];
    expect(maxSpeedKmhFromBgPoints(points, 0)).toBe(0);
  });
});
