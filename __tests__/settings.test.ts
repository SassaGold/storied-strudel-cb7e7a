// Tests for the pure unit-format helpers in lib/settings.ts.
// These cover both unit systems and the boundary values (ft-vs-mi cutoff,
// the < 1000 m branch) so imperial/metric regressions fail CI.

import { fmtDist, fmtDistShort, fmtPrecip, fmtSpeed, fmtTemp } from "../lib/settings";

describe("fmtTemp", () => {
  it("formats metric with one decimal", () => {
    expect(fmtTemp(21.37, "metric")).toBe("21.4°C");
  });

  it("rounds metric when round=true", () => {
    expect(fmtTemp(21.37, "metric", true)).toBe("21°C");
  });

  it("converts to Fahrenheit", () => {
    expect(fmtTemp(0, "imperial")).toBe("32.0°F");
    expect(fmtTemp(100, "imperial")).toBe("212.0°F");
  });

  it("rounds Fahrenheit when round=true", () => {
    expect(fmtTemp(21.37, "imperial", true)).toBe("70°F"); // 70.466 → 70
  });

  it("handles negative temperatures", () => {
    expect(fmtTemp(-40, "metric")).toBe("-40.0°C");
    expect(fmtTemp(-40, "imperial")).toBe("-40.0°F"); // -40 is the same in both scales
  });
});

describe("fmtDist", () => {
  it("formats km with two decimals", () => {
    expect(fmtDist(12.345, "metric")).toBe("12.35 km");
  });

  it("converts to miles", () => {
    expect(fmtDist(100, "imperial")).toBe("62.14 mi");
  });

  it("formats zero in both systems", () => {
    expect(fmtDist(0, "metric")).toBe("0.00 km");
    expect(fmtDist(0, "imperial")).toBe("0.00 mi");
  });
});

describe("fmtSpeed", () => {
  it("formats km/h with no decimals", () => {
    expect(fmtSpeed(88.6, "metric")).toBe("89 km/h");
  });

  it("converts to mph", () => {
    expect(fmtSpeed(100, "imperial")).toBe("62 mph");
  });

  it("formats zero", () => {
    expect(fmtSpeed(0, "metric")).toBe("0 km/h");
    expect(fmtSpeed(0, "imperial")).toBe("0 mph");
  });
});

describe("fmtPrecip", () => {
  it("formats mm with one decimal", () => {
    expect(fmtPrecip(2.34, "metric")).toBe("2.3 mm");
  });

  it("converts to inches with two decimals", () => {
    expect(fmtPrecip(25.4, "imperial")).toBe("1.00 in");
  });

  it("formats zero", () => {
    expect(fmtPrecip(0, "metric")).toBe("0.0 mm");
    expect(fmtPrecip(0, "imperial")).toBe("0.00 in");
  });
});

describe("fmtDistShort", () => {
  it("uses metres below 1000 m (metric)", () => {
    expect(fmtDistShort(0, "metric")).toBe("0 m");
    expect(fmtDistShort(999, "metric")).toBe("999 m");
  });

  it("switches to km at 1000 m (metric)", () => {
    expect(fmtDistShort(1000, "metric")).toBe("1.0 km");
    expect(fmtDistShort(12345, "metric")).toBe("12.3 km");
  });

  it("uses feet below the 0.1-mile cutoff (imperial)", () => {
    // 100 m = 0.0621 mi < 0.1 → feet: 100 × 3.28084 = 328 ft
    expect(fmtDistShort(100, "imperial")).toBe("328 ft");
    expect(fmtDistShort(0, "imperial")).toBe("0 ft");
  });

  it("switches to miles at the 0.1-mile cutoff (imperial)", () => {
    // 0.1 mile = 160.934 m — just above must format as miles
    expect(fmtDistShort(161, "imperial")).toBe("0.1 mi");
    // 1 mile
    expect(fmtDistShort(1609.34, "imperial")).toBe("1.0 mi");
  });

  it("just below the cutoff stays in feet (imperial)", () => {
    // 160 m = 0.0994 mi < 0.1 → 525 ft
    expect(fmtDistShort(160, "imperial")).toBe("525 ft");
  });
});
