/**
 * Unit tests for lib/settings.ts formatting helpers.
 * Covers: fmtTemp, fmtDist, fmtSpeed, fmtDistShort.
 * (The React context / provider is not tested here — that requires a
 *  component test harness which is out of scope for pure unit tests.)
 */

import { fmtTemp, fmtDist, fmtSpeed, fmtDistShort } from "../lib/settings";

// ── fmtTemp ───────────────────────────────────────────────────────────────────

describe("fmtTemp", () => {
  describe("metric", () => {
    it("formats 0°C", () => expect(fmtTemp(0, "metric")).toBe("0.0°C"));
    it("formats 20°C", () => expect(fmtTemp(20, "metric")).toBe("20.0°C"));
    it("formats negative temperature", () => expect(fmtTemp(-5, "metric")).toBe("-5.0°C"));
    it("rounds when round=true", () => expect(fmtTemp(20.6, "metric", true)).toBe("21°C"));
  });

  describe("imperial", () => {
    it("converts 0°C → 32°F", () => expect(fmtTemp(0, "imperial")).toBe("32.0°F"));
    it("converts 100°C → 212°F", () => expect(fmtTemp(100, "imperial")).toBe("212.0°F"));
    it("converts -40°C → -40°F (crossover point)", () => {
      expect(fmtTemp(-40, "imperial")).toBe("-40.0°F");
    });
    it("rounds correctly in imperial", () => {
      // 20°C = 68°F exactly
      expect(fmtTemp(20, "imperial", true)).toBe("68°F");
    });
  });
});

// ── fmtDist ───────────────────────────────────────────────────────────────────

describe("fmtDist", () => {
  it("formats in km (metric)", () => {
    expect(fmtDist(10, "metric")).toBe("10.00 km");
  });

  it("formats in miles (imperial)", () => {
    // 10 km * 0.621371 = 6.21371 → "6.21 mi"
    expect(fmtDist(10, "imperial")).toBe("6.21 mi");
  });

  it("formats 0 km", () => {
    expect(fmtDist(0, "metric")).toBe("0.00 km");
    expect(fmtDist(0, "imperial")).toBe("0.00 mi");
  });

  it("formats 1 km in imperial as approximately 0.62 mi", () => {
    expect(fmtDist(1, "imperial")).toBe("0.62 mi");
  });
});

// ── fmtSpeed ──────────────────────────────────────────────────────────────────

describe("fmtSpeed", () => {
  it("formats in km/h (metric)", () => {
    expect(fmtSpeed(100, "metric")).toBe("100 km/h");
  });

  it("formats in mph (imperial)", () => {
    // 100 km/h * 0.621371 = 62.1 → "62 mph"
    expect(fmtSpeed(100, "imperial")).toBe("62 mph");
  });

  it("formats 0 speed", () => {
    expect(fmtSpeed(0, "metric")).toBe("0 km/h");
    expect(fmtSpeed(0, "imperial")).toBe("0 mph");
  });

  it("rounds correctly for metric", () => {
    expect(fmtSpeed(99.6, "metric")).toBe("100 km/h");
  });
});

// ── fmtDistShort ──────────────────────────────────────────────────────────────

describe("fmtDistShort", () => {
  describe("metric", () => {
    it("shows metres for < 1000 m", () => {
      expect(fmtDistShort(500, "metric")).toBe("500 m");
    });

    it("shows km for >= 1000 m", () => {
      expect(fmtDistShort(1500, "metric")).toBe("1.5 km");
    });

    it("shows 0 m for 0", () => {
      expect(fmtDistShort(0, "metric")).toBe("0 m");
    });

    it("rounds metres to nearest integer", () => {
      expect(fmtDistShort(123.7, "metric")).toBe("124 m");
    });
  });

  describe("imperial", () => {
    it("shows feet for < 0.1 miles", () => {
      // 0.1 miles = 160.934 m → anything below that shows feet
      // 100 m * 3.28084 = 328 ft
      expect(fmtDistShort(100, "imperial")).toBe("328 ft");
    });

    it("shows miles for >= 0.1 miles", () => {
      // 200 m = ~0.124 miles → "0.1 mi"
      expect(fmtDistShort(200, "imperial")).toBe("0.1 mi");
    });

    it("shows 0 ft for 0 metres", () => {
      expect(fmtDistShort(0, "imperial")).toBe("0 ft");
    });

    it("shows miles for large distances", () => {
      // 10000 m ≈ 6.2 mi
      const result = fmtDistShort(10_000, "imperial");
      expect(result).toContain("mi");
      expect(result).toContain("6.");
    });
  });
});
