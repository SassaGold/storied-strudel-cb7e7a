/**
 * Unit tests for lib/overpass.ts pure utility functions.
 * Covers: haversineMeters, parseWikiTag, buildMapsUrl, CACHE_TTL_MS.
 */

import {
  haversineMeters,
  parseWikiTag,
  buildMapsUrl,
  CACHE_TTL_MS,
} from "../lib/overpass";

// ── haversineMeters ───────────────────────────────────────────────────────────

describe("haversineMeters", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineMeters(51.5, -0.12, 51.5, -0.12)).toBe(0);
  });

  it("returns approximately 640 km between London and Frankfurt", () => {
    // London: 51.5074, -0.1278 | Frankfurt: 50.1109, 8.6821
    const dist = haversineMeters(51.5074, -0.1278, 50.1109, 8.6821);
    expect(dist).toBeGreaterThan(600_000);
    expect(dist).toBeLessThan(700_000);
  });

  it("returns approximately 111 km for 1 degree of latitude", () => {
    const dist = haversineMeters(0, 0, 1, 0);
    expect(dist).toBeGreaterThan(110_500);
    expect(dist).toBeLessThan(111_500);
  });

  it("is symmetric — distance A→B equals distance B→A", () => {
    const d1 = haversineMeters(48.8566, 2.3522, 52.52, 13.405);
    const d2 = haversineMeters(52.52, 13.405, 48.8566, 2.3522);
    expect(d1).toBeCloseTo(d2, 1);
  });

  it("handles antipodal points (~20 015 km)", () => {
    const dist = haversineMeters(0, 0, 0, 180);
    expect(dist).toBeGreaterThan(20_000_000);
    expect(dist).toBeLessThan(20_100_000);
  });

  it("handles pole-to-pole distance (~20 000 km)", () => {
    const dist = haversineMeters(90, 0, -90, 0);
    expect(dist).toBeGreaterThan(19_900_000);
    expect(dist).toBeLessThan(20_100_000);
  });

  it("handles negative coordinates", () => {
    // Sydney ↔ Buenos Aires
    const dist = haversineMeters(-33.87, 151.21, -34.61, -58.38);
    expect(dist).toBeGreaterThan(11_000_000);
    expect(dist).toBeLessThan(12_500_000);
  });
});

// ── parseWikiTag ─────────────────────────────────────────────────────────────

describe("parseWikiTag", () => {
  it("parses a standard 'lang:title' tag", () => {
    expect(parseWikiTag("en:Eiffel_Tower")).toEqual({ lang: "en", title: "Eiffel_Tower" });
  });

  it("defaults to 'en' when no language prefix is present", () => {
    expect(parseWikiTag("Paris")).toEqual({ lang: "en", title: "Paris" });
  });

  it("replaces spaces with underscores in title", () => {
    expect(parseWikiTag("de:Brandenburger Tor")).toEqual({ lang: "de", title: "Brandenburger_Tor" });
  });

  it("handles two-character language codes", () => {
    expect(parseWikiTag("fr:Tour_Eiffel")).toEqual({ lang: "fr", title: "Tour_Eiffel" });
  });

  it("handles a colon inside the title (only first colon is the separator)", () => {
    // e.g. "en:History:Foo" — lang=en, title=History:Foo
    const result = parseWikiTag("en:History:Foo");
    expect(result.lang).toBe("en");
    expect(result.title).toContain("History");
  });
});

// ── buildMapsUrl ──────────────────────────────────────────────────────────────

describe("buildMapsUrl", () => {
  it("returns a string containing the coordinates", () => {
    const url = buildMapsUrl(48.8566, 2.3522, "Eiffel Tower");
    expect(url).toContain("48.8566");
    expect(url).toContain("2.3522");
  });

  it("returns a valid URL string", () => {
    const url = buildMapsUrl(51.5, -0.12);
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
  });
});

// ── CACHE_TTL_MS ──────────────────────────────────────────────────────────────

describe("CACHE_TTL_MS", () => {
  it("is 30 minutes in milliseconds", () => {
    expect(CACHE_TTL_MS).toBe(30 * 60 * 1000);
  });
});
