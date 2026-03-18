// Tests for lib/overpass.ts — pure utility functions only, no network calls.

import { haversineMeters, parseWikiTag } from "../lib/overpass";

// ── haversineMeters ───────────────────────────────────────────────────────────

describe("haversineMeters", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineMeters(51.5, 0, 51.5, 0)).toBe(0);
  });

  it("returns a positive distance for distinct points", () => {
    // London (51.5°N, 0°) → Paris (48.85°N, 2.35°E) ≈ 340 km
    const dist = haversineMeters(51.5, 0, 48.85, 2.35);
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeGreaterThan(330_000);
    expect(dist).toBeLessThan(360_000);
  });

  it("is symmetric (A→B == B→A)", () => {
    const ab = haversineMeters(51.5, 0, 48.85, 2.35);
    const ba = haversineMeters(48.85, 2.35, 51.5, 0);
    expect(ab).toBeCloseTo(ba, 0);
  });

  it("equator length: 1° of longitude ≈ 111 km", () => {
    const dist = haversineMeters(0, 0, 0, 1);
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });

  it("handles negative coordinates (southern hemisphere)", () => {
    // Sydney (-33.87, 151.21) → Melbourne (-37.81, 144.96) ≈ 713 km
    const dist = haversineMeters(-33.87, 151.21, -37.81, 144.96);
    expect(dist).toBeGreaterThan(700_000);
    expect(dist).toBeLessThan(730_000);
  });

  it("returns metres not kilometres (London→Paris > 100_000)", () => {
    const dist = haversineMeters(51.5, 0, 48.85, 2.35);
    expect(dist).toBeGreaterThan(100_000);
  });
});

// ── parseWikiTag ──────────────────────────────────────────────────────────────

describe("parseWikiTag", () => {
  it("parses a standard lang:title tag", () => {
    const result = parseWikiTag("en:Eiffel_Tower");
    expect(result.lang).toBe("en");
    expect(result.title).toBe("Eiffel_Tower");
  });

  it("parses a German Wikipedia tag", () => {
    const result = parseWikiTag("de:Berliner_Mauer");
    expect(result.lang).toBe("de");
    expect(result.title).toBe("Berliner_Mauer");
  });

  it("defaults to 'en' for a tag without language prefix", () => {
    const result = parseWikiTag("Paris");
    expect(result.lang).toBe("en");
    expect(result.title).toBe("Paris");
  });

  it("replaces spaces with underscores in title", () => {
    const result = parseWikiTag("en:Eiffel Tower");
    expect(result.title).toBe("Eiffel_Tower");
  });

  it("handles a tag that is just 'en:' (empty title)", () => {
    const result = parseWikiTag("en:");
    expect(result.lang).toBe("en");
    expect(result.title).toBe("");
  });

  it("preserves existing underscores", () => {
    const result = parseWikiTag("fr:Tour_Eiffel");
    expect(result.lang).toBe("fr");
    expect(result.title).toBe("Tour_Eiffel");
  });
});
