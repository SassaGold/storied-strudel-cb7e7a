// Tests for the pure helpers in lib/mapMatch.ts: the Google polyline decoder
// (bit-twiddling that is easy to break silently) and the coordinate downsampler.

import { decodePolyline, downsampleCoords } from "../lib/mapMatch";

describe("decodePolyline", () => {
  it("decodes the canonical Google example", () => {
    // Reference string from Google's polyline algorithm documentation:
    // (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(points).toHaveLength(3);
    expect(points[0].latitude).toBeCloseTo(38.5, 5);
    expect(points[0].longitude).toBeCloseTo(-120.2, 5);
    expect(points[1].latitude).toBeCloseTo(40.7, 5);
    expect(points[1].longitude).toBeCloseTo(-120.95, 5);
    expect(points[2].latitude).toBeCloseTo(43.252, 5);
    expect(points[2].longitude).toBeCloseTo(-126.453, 5);
  });

  it("decodes a single point", () => {
    // "_p~iF~ps|U" is just the first point of the example above
    const points = decodePolyline("_p~iF~ps|U");
    expect(points).toHaveLength(1);
    expect(points[0].latitude).toBeCloseTo(38.5, 5);
    expect(points[0].longitude).toBeCloseTo(-120.2, 5);
  });

  it("returns an empty array for an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });

  it("decodes negative-delta sequences (deltas are cumulative)", () => {
    // (38.5, -120.2) → (36.3, -119.45): the second point moves south-east —
    // verifies the zig-zag sign decoding and the running-sum accumulation.
    // Fixture generated with a reference encoder implementation.
    const pts = decodePolyline("_p~iF~ps|U~tlLonqC");
    expect(pts).toHaveLength(2);
    expect(pts[1].latitude).toBeCloseTo(36.3, 5);
    expect(pts[1].longitude).toBeCloseTo(-119.45, 5);
  });
});

describe("downsampleCoords", () => {
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("returns the array unchanged when already within the limit", () => {
    const arr = range(5);
    expect(downsampleCoords(arr, 5)).toBe(arr);
    expect(downsampleCoords(arr, 10)).toBe(arr);
  });

  it("downsamples to exactly max points", () => {
    expect(downsampleCoords(range(100), 10)).toHaveLength(10);
    expect(downsampleCoords(range(1001), 100)).toHaveLength(100);
  });

  it("always keeps the first and last point", () => {
    const out = downsampleCoords(range(100), 10);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(99);
  });

  it("keeps points in order without duplicates for a reasonable ratio", () => {
    const out = downsampleCoords(range(100), 10);
    const sorted = [...out].sort((a, b) => a - b);
    expect(out).toEqual(sorted);
    expect(new Set(out).size).toBe(out.length);
  });

  it("handles empty and single-element arrays", () => {
    expect(downsampleCoords([], 10)).toEqual([]);
    expect(downsampleCoords([42], 10)).toEqual([42]);
  });
});
