// Tests for lib/roads.ts — pure utility functions only, no native deps.

import {
  haversineKm,
  humanizeConstructionType,
  ROAD_TYPES,
} from "../lib/roads";

// ── haversineKm ───────────────────────────────────────────────────────────────

describe("haversineKm", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineKm(51.5, 0, 51.5, 0)).toBe(0);
  });

  it("London → Paris is approximately 340 km", () => {
    const dist = haversineKm(51.5, 0, 48.85, 2.35);
    expect(dist).toBeGreaterThan(330);
    expect(dist).toBeLessThan(360);
  });

  it("is symmetric (A→B == B→A)", () => {
    const ab = haversineKm(51.5, 0, 48.85, 2.35);
    const ba = haversineKm(48.85, 2.35, 51.5, 0);
    expect(ab).toBeCloseTo(ba, 1);
  });

  it("returns km not metres (London→Paris > 100)", () => {
    expect(haversineKm(51.5, 0, 48.85, 2.35)).toBeGreaterThan(100);
  });

  it("equator: 1° of longitude ≈ 111 km", () => {
    const dist = haversineKm(0, 0, 0, 1);
    expect(dist).toBeGreaterThan(110);
    expect(dist).toBeLessThan(112);
  });

  it("handles negative coordinates (southern hemisphere)", () => {
    // Sydney → Melbourne ≈ 713 km
    const dist = haversineKm(-33.87, 151.21, -37.81, 144.96);
    expect(dist).toBeGreaterThan(700);
    expect(dist).toBeLessThan(730);
  });

  it("handles antipodal points (max ≈ half circumference ≈ 20015 km)", () => {
    const dist = haversineKm(0, 0, 0, 180);
    expect(dist).toBeGreaterThan(19_000);
    expect(dist).toBeLessThan(21_000);
  });
});

// ── ROAD_TYPES ────────────────────────────────────────────────────────────────

describe("ROAD_TYPES", () => {
  it("contains expected primary road types", () => {
    expect(ROAD_TYPES.has("motorway")).toBe(true);
    expect(ROAD_TYPES.has("primary")).toBe(true);
    expect(ROAD_TYPES.has("secondary")).toBe(true);
    expect(ROAD_TYPES.has("residential")).toBe(true);
    expect(ROAD_TYPES.has("construction")).toBe(true);
  });

  it("contains link variants", () => {
    expect(ROAD_TYPES.has("motorway_link")).toBe(true);
    expect(ROAD_TYPES.has("primary_link")).toBe(true);
    expect(ROAD_TYPES.has("secondary_link")).toBe(true);
    expect(ROAD_TYPES.has("tertiary_link")).toBe(true);
    expect(ROAD_TYPES.has("trunk_link")).toBe(true);
  });

  it("contains special types", () => {
    expect(ROAD_TYPES.has("bridge")).toBe(true);
    expect(ROAD_TYPES.has("tunnel")).toBe(true);
    expect(ROAD_TYPES.has("living_street")).toBe(true);
  });

  it("does NOT include non-road types", () => {
    expect(ROAD_TYPES.has("footway")).toBe(false);
    expect(ROAD_TYPES.has("cycleway")).toBe(false);
    expect(ROAD_TYPES.has("path")).toBe(false);
    expect(ROAD_TYPES.has("steps")).toBe(false);
  });

  it("is case-sensitive (values are lowercase)", () => {
    expect(ROAD_TYPES.has("Motorway")).toBe(false);
    expect(ROAD_TYPES.has("CONSTRUCTION")).toBe(false);
  });
});

// ── humanizeConstructionType ──────────────────────────────────────────────────

describe("humanizeConstructionType", () => {
  const tFallback = (key: string) => key; // simulates i18next key-not-found

  it("returns the i18n translation when key is found", () => {
    const t = (key: string) =>
      key === "home.roadTypes.motorway" ? "Motorway" : key;
    expect(humanizeConstructionType("motorway", t)).toBe("Motorway");
  });

  it("falls back to title-case when translation key is not found", () => {
    expect(humanizeConstructionType("motorway", tFallback)).toBe("Motorway");
  });

  it("converts underscores to spaces in fallback", () => {
    expect(humanizeConstructionType("primary_link", tFallback)).toBe("Primary Link");
  });

  it("handles single-word type", () => {
    expect(humanizeConstructionType("construction", tFallback)).toBe("Construction");
  });

  it("handles already-translated value correctly", () => {
    const t = (key: string) => (key === "home.roadTypes.trunk" ? "Trunk Road" : key);
    expect(humanizeConstructionType("trunk", t)).toBe("Trunk Road");
  });

  it("handles mixed-case input by lowercasing first", () => {
    // Input type is normalised to lowercase before looking up translation
    expect(humanizeConstructionType("MOTORWAY", tFallback)).toBe("Motorway");
    expect(humanizeConstructionType("Primary_Link", tFallback)).toBe("Primary Link");
  });

  it("returns the fallback for unknown types", () => {
    const result = humanizeConstructionType("some_unknown_type", tFallback);
    expect(result).toBe("Some Unknown Type");
  });
});
