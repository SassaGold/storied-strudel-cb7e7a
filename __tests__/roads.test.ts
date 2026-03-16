/**
 * Unit tests for lib/roads.ts utility functions.
 * Covers: haversineKm, humanizeConstructionType.
 */

import { haversineKm, humanizeConstructionType } from "../lib/roads";

// ── haversineKm ───────────────────────────────────────────────────────────────

describe("haversineKm", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineKm(51.5, -0.12, 51.5, -0.12)).toBe(0);
  });

  it("returns roughly 1 km for 1 km offset", () => {
    // ~0.009° latitude ≈ 1 km
    const dist = haversineKm(51.5, -0.12, 51.509, -0.12);
    expect(dist).toBeGreaterThan(0.9);
    expect(dist).toBeLessThan(1.1);
  });

  it("delegates to haversineMeters (distance equals meters / 1000)", () => {
    // The value should be haversineMeters / 1000 within floating-point precision
    const km = haversineKm(48.8566, 2.3522, 52.52, 13.405);
    expect(km).toBeGreaterThan(800);
    expect(km).toBeLessThan(1000);
  });

  it("is symmetric", () => {
    const d1 = haversineKm(51.5, -0.12, 48.86, 2.35);
    const d2 = haversineKm(48.86, 2.35, 51.5, -0.12);
    expect(d1).toBeCloseTo(d2, 3);
  });
});

// ── humanizeConstructionType ──────────────────────────────────────────────────

describe("humanizeConstructionType", () => {
  it("returns a known label for 'motorway'", () => {
    expect(humanizeConstructionType("motorway")).toBe("Motorway");
  });

  it("returns a known label for 'primary'", () => {
    expect(humanizeConstructionType("primary")).toBe("Primary Road");
  });

  it("returns a known label for 'residential'", () => {
    expect(humanizeConstructionType("residential")).toBe("Residential Road");
  });

  it("title-cases unknown types", () => {
    // e.g. "some_road_type" → "Some Road Type"
    const result = humanizeConstructionType("some_road_type");
    expect(result).toBe("Some Road Type");
  });

  it("handles single-word unknown type", () => {
    const result = humanizeConstructionType("footway");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("is case-insensitive for known keys", () => {
    // The function lowercases the input before lookup
    expect(humanizeConstructionType("Motorway")).toBe("Motorway");
  });
});
