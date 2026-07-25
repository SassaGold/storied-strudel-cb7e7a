// Tests for the coordinate downsampler in lib/coords.ts.
//
// The decodePolyline tests were removed on 2026-07-25 alongside the OSRM
// map-matching call — the decoder existed only to parse OSRM polyline
// geometry and has no remaining caller.

import { downsampleCoords } from "../lib/coords";

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
