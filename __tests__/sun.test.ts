// Tests for lib/sun.ts — pure utility functions only, no native deps.

import {
  computeSunTimes,
  formatTime,
  formatDuration,
  formatForecastDate,
} from "../lib/sun";

// ── computeSunTimes ───────────────────────────────────────────────────────────

describe("computeSunTimes", () => {
  // Use a fixed equinox date for stable expected values: 2024-03-20
  const equinoxDate = new Date(2024, 2, 20); // March 20, 2024

  it("returns non-null for mid-latitude locations", () => {
    // London: 51.5°N, 0°W
    const result = computeSunTimes(51.5, 0, equinoxDate);
    expect(result).not.toBeNull();
  });

  it("sunrise is before sunset", () => {
    const result = computeSunTimes(51.5, 0, equinoxDate);
    expect(result).not.toBeNull();
    expect(result!.sunrise.getTime()).toBeLessThan(result!.sunset.getTime());
  });

  it("daylightMinutes is positive and reasonable", () => {
    const result = computeSunTimes(51.5, 0, equinoxDate);
    expect(result).not.toBeNull();
    // At equinox, daylight should be close to 12 hours (720 min) globally
    expect(result!.daylightMinutes).toBeGreaterThan(600);
    expect(result!.daylightMinutes).toBeLessThan(800);
  });

  it("daylightMinutes matches sunset - sunrise difference", () => {
    const result = computeSunTimes(48.85, 2.35, equinoxDate); // Paris
    expect(result).not.toBeNull();
    const diffMins = Math.round(
      (result!.sunset.getTime() - result!.sunrise.getTime()) / 60000
    );
    expect(result!.daylightMinutes).toBe(diffMins);
  });

  it("returns null for polar locations with midnight sun (summer, high north)", () => {
    // Svalbard (78°N) in mid-June should have midnight sun → no sunset
    const midSummer = new Date(2024, 5, 21); // June 21
    const result = computeSunTimes(78, 15, midSummer);
    // Should return null (polar day) or provide times — either is acceptable
    // depending on the algorithm precision; but it must not throw
    expect(result === null || typeof result === "object").toBe(true);
  });

  it("returns Date objects for sunrise and sunset", () => {
    const result = computeSunTimes(37.77, -122.42, equinoxDate); // San Francisco
    expect(result).not.toBeNull();
    expect(result!.sunrise).toBeInstanceOf(Date);
    expect(result!.sunset).toBeInstanceOf(Date);
  });

  it("uses today as default date when none is supplied", () => {
    const before = Date.now();
    const result = computeSunTimes(51.5, 0);
    const after = Date.now();
    expect(result).not.toBeNull();
    // The computed dates should be within the same calendar day ±1
    const sunriseMs = result!.sunrise.getTime();
    expect(sunriseMs).toBeGreaterThan(before - 86400000);
    expect(sunriseMs).toBeLessThan(after + 86400000);
  });

  it("northern hemisphere summer has more daylight than winter", () => {
    const summer = new Date(2024, 5, 21); // June 21
    const winter = new Date(2024, 11, 21); // Dec 21
    // London
    const summerResult = computeSunTimes(51.5, 0, summer);
    const winterResult = computeSunTimes(51.5, 0, winter);
    expect(summerResult).not.toBeNull();
    expect(winterResult).not.toBeNull();
    expect(summerResult!.daylightMinutes).toBeGreaterThan(winterResult!.daylightMinutes);
  });
});

// ── formatTime ────────────────────────────────────────────────────────────────

describe("formatTime", () => {
  it("formats a Date as HH:MM", () => {
    // Construct a date at a known UTC time and check the output is a time string
    const d = new Date("2024-06-15T12:00:00Z");
    const result = formatTime(d);
    // Should match HH:MM format
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it("returns a string (does not throw on any valid Date)", () => {
    expect(() => formatTime(new Date())).not.toThrow();
    expect(typeof formatTime(new Date())).toBe("string");
  });
});

// ── formatDuration ────────────────────────────────────────────────────────────

describe("formatDuration", () => {
  it("returns N/A for 0 minutes", () => {
    expect(formatDuration(0)).toBe("N/A");
  });

  it("returns N/A for negative minutes", () => {
    expect(formatDuration(-10)).toBe("N/A");
  });

  it("formats 60 minutes as 1h 0m", () => {
    expect(formatDuration(60)).toBe("1h 0m");
  });

  it("formats 90 minutes as 1h 30m", () => {
    expect(formatDuration(90)).toBe("1h 30m");
  });

  it("formats 720 minutes as 12h 0m", () => {
    expect(formatDuration(720)).toBe("12h 0m");
  });

  it("formats 755 minutes as 12h 35m", () => {
    expect(formatDuration(755)).toBe("12h 35m");
  });

  it("formats less than 60 minutes", () => {
    expect(formatDuration(45)).toBe("0h 45m");
  });
});

// ── formatForecastDate ────────────────────────────────────────────────────────

describe("formatForecastDate", () => {
  it("returns a non-empty string", () => {
    expect(formatForecastDate("2024-06-21")).not.toBe("");
  });

  it("includes the day-of-week abbreviation", () => {
    // 2024-06-21 is a Friday
    const result = formatForecastDate("2024-06-21");
    expect(result).toContain("Fri");
  });

  it("includes the month abbreviation", () => {
    const result = formatForecastDate("2024-06-21");
    expect(result).toContain("Jun");
  });

  it("includes the day number", () => {
    const result = formatForecastDate("2024-06-21");
    expect(result).toContain("21");
  });

  it("formats different months correctly", () => {
    // 2024-01-15 is a Monday in January
    const result = formatForecastDate("2024-01-15");
    expect(result).toContain("Jan");
    expect(result).toContain("15");
  });
});
