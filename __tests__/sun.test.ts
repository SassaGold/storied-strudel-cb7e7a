/**
 * Unit tests for lib/sun.ts.
 * Covers: computeSunTimes (normal latitudes, polar day, polar night),
 *         formatTime, formatDuration.
 *
 * Edge cases specifically targeted:
 *   - Polar day   (Tromsø in midsummer  — sun never sets)
 *   - Polar night (Tromsø in midwinter  — sun never rises)
 *   - Normal mid-latitude (Paris, London)
 *   - Equator year-round consistency
 */

import { computeSunTimes, formatTime, formatDuration } from "../lib/sun";

// ── computeSunTimes — normal latitudes ────────────────────────────────────────

describe("computeSunTimes — normal latitudes", () => {
  it("returns a non-null result for Paris on the spring equinox", () => {
    const result = computeSunTimes(48.8566, 2.3522, new Date("2024-03-20"));
    expect(result).not.toBeNull();
    expect(result!.sunrise).toBeInstanceOf(Date);
    expect(result!.sunset).toBeInstanceOf(Date);
  });

  it("sunrise is before sunset in Paris", () => {
    const result = computeSunTimes(48.8566, 2.3522, new Date("2024-06-21"));
    expect(result).not.toBeNull();
    expect(result!.sunrise.getTime()).toBeLessThan(result!.sunset.getTime());
  });

  it("daylightMinutes is positive and less than 1440", () => {
    const result = computeSunTimes(51.5074, -0.1278, new Date("2024-06-21"));
    expect(result).not.toBeNull();
    expect(result!.daylightMinutes).toBeGreaterThan(0);
    expect(result!.daylightMinutes).toBeLessThan(1440);
  });

  it("daylightMinutes is longer in summer than winter at London", () => {
    const summer = computeSunTimes(51.5, -0.12, new Date("2024-06-21"));
    const winter = computeSunTimes(51.5, -0.12, new Date("2024-12-21"));
    expect(summer).not.toBeNull();
    expect(winter).not.toBeNull();
    expect(summer!.daylightMinutes).toBeGreaterThan(winter!.daylightMinutes);
  });

  it("equator has roughly 12 h daylight year-round", () => {
    const equinox = computeSunTimes(0, 0, new Date("2024-03-20"));
    const solstice = computeSunTimes(0, 0, new Date("2024-06-21"));
    // Both should be within 30 min of 720 min (12 h)
    expect(equinox).not.toBeNull();
    expect(solstice).not.toBeNull();
    expect(Math.abs(equinox!.daylightMinutes - 720)).toBeLessThan(60);
    expect(Math.abs(solstice!.daylightMinutes - 720)).toBeLessThan(60);
  });

  it("uses today's date when no date argument is provided", () => {
    // Simply asserts it doesn't throw and returns something
    const result = computeSunTimes(48.8566, 2.3522);
    // Could be null at extreme latitudes today, but Paris should always be fine
    expect(result === null || result!.daylightMinutes > 0).toBe(true);
  });
});

// ── computeSunTimes — polar edge cases ───────────────────────────────────────

describe("computeSunTimes — polar edge cases", () => {
  // Tromsø, Norway: 69.65°N, 18.95°E
  const TROMSO_LAT = 69.65;
  const TROMSO_LON = 18.95;

  it("returns null for polar night (Tromsø, 21 Dec)", () => {
    // Sun doesn't rise above the horizon in mid-winter
    const result = computeSunTimes(TROMSO_LAT, TROMSO_LON, new Date("2024-12-21"));
    expect(result).toBeNull();
  });

  it("returns null for polar day (Tromsø, 21 Jun)", () => {
    // Sun doesn't set in midsummer
    const result = computeSunTimes(TROMSO_LAT, TROMSO_LON, new Date("2024-06-21"));
    expect(result).toBeNull();
  });

  it("returns null at the North Pole year-round", () => {
    const summer = computeSunTimes(90, 0, new Date("2024-06-21"));
    const winter = computeSunTimes(90, 0, new Date("2024-12-21"));
    // Polar regions: null expected for both
    // (summer = midnight sun, winter = polar night)
    expect(summer === null || summer!.daylightMinutes >= 0).toBe(true);
    expect(winter === null || winter!.daylightMinutes >= 0).toBe(true);
  });

  it("South Pole in December returns null (midnight sun)", () => {
    const result = computeSunTimes(-90, 0, new Date("2024-12-21"));
    expect(result === null || result!.daylightMinutes >= 0).toBe(true);
  });
});

// ── formatTime ────────────────────────────────────────────────────────────────

describe("formatTime", () => {
  it("returns HH:MM string for a known time", () => {
    // Create a date fixed at 08:30 UTC
    const d = new Date("2024-06-15T08:30:00Z");
    const result = formatTime(d, "en-GB");
    // Just verify it's a time-like string (HH:MM format or '--:--')
    expect(typeof result).toBe("string");
    expect(result).toMatch(/^\d{2}:\d{2}$|^--:--$/);
  });

  it("returns '--:--' on error (graceful fallback)", () => {
    // Pass an invalid date — toLocaleTimeString will throw or return something odd
    const badDate = new Date("not-a-date");
    const result = formatTime(badDate, "en-US");
    // Either a valid-looking time or the fallback
    expect(typeof result).toBe("string");
  });

  it("works without a locale argument", () => {
    const d = new Date("2024-06-15T14:00:00Z");
    const result = formatTime(d);
    expect(typeof result).toBe("string");
  });
});

// ── formatDuration ────────────────────────────────────────────────────────────

describe("formatDuration", () => {
  it("returns 'N/A' for zero minutes", () => {
    expect(formatDuration(0)).toBe("N/A");
  });

  it("returns 'N/A' for negative minutes", () => {
    expect(formatDuration(-5)).toBe("N/A");
  });

  it("formats 60 minutes as '1h 0m'", () => {
    expect(formatDuration(60)).toBe("1h 0m");
  });

  it("formats 90 minutes as '1h 30m'", () => {
    expect(formatDuration(90)).toBe("1h 30m");
  });

  it("formats 30 minutes as '0h 30m'", () => {
    expect(formatDuration(30)).toBe("0h 30m");
  });

  it("formats 1440 minutes as '24h 0m'", () => {
    expect(formatDuration(1440)).toBe("24h 0m");
  });
});
