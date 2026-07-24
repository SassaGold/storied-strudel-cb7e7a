// Correctness guard for the inspection-date math. A wrong due date is worse than
// no date (it would fire a false reminder), so the compute logic is pinned here
// against the verified per-country cadences (see lib/inspectionRules.ts).

import {
  INSPECTION_RULES,
  computeNextDue,
  inspectionRule,
  parseRegistrationDate,
} from "../lib/inspectionRules";

const NOW = new Date("2026-07-23T12:00:00Z");

describe("computeNextDue", () => {
  describe("Norway & Denmark — not required", () => {
    it.each(["NO", "DK"] as const)("%s returns null even with a registration date", (c) => {
      const rule = inspectionRule(c);
      expect(rule.required).toBe(false);
      expect(computeNextDue(rule, "2020-06-15", NOW)).toBeNull();
    });
  });

  describe("Sweden — 48 months then every 24", () => {
    const se = inspectionRule("SE");

    it("new bike: first deadline is 48 months after registration", () => {
      // Registered 2025-03-10 → first due 2029-03-10 (still in the future).
      expect(computeNextDue(se, "2025-03-10", NOW)).toBe("2029-03-10");
    });

    it("older bike: rolls forward by 24 months past today", () => {
      // Registered 2020-06-15 → 2024-06, 2026-06 (both past NOW) → 2028-06-15.
      expect(computeNextDue(se, "2020-06-15", NOW)).toBe("2028-06-15");
    });

    it("accepts dd-mm-yyyy input (the app's display format)", () => {
      // Same dates as above, entered dd-mm-yyyy.
      expect(computeNextDue(se, "10-03-2025", NOW)).toBe("2029-03-10");
      expect(computeNextDue(se, "15-06-2020", NOW)).toBe("2028-06-15");
    });
  });

  describe("Iceland — 4th year, then 2yr twice, then annual; deadline 1 Aug", () => {
    const is = inspectionRule("IS");

    it("new bike: first due in year regYear+4, on the 1 Aug deadline", () => {
      // Registered 2026-01-15 → first inspection year 2030 → 2030-08-01.
      expect(computeNextDue(is, "2026-01-15", NOW)).toBe("2030-08-01");
    });

    it("older bike: follows 4/+2/+2 then lands on the next future deadline", () => {
      // Registered 2018 → due years 2022, 2024, 2026(, 2027…).
      // 2022-08-01 & 2024-08-01 are past; 2026-08-01 is still ahead of 2026-07-23.
      expect(computeNextDue(is, "2018-05-01", NOW)).toBe("2026-08-01");
    });
  });

  describe("guards", () => {
    const se = inspectionRule("SE");
    it("returns null without a registration date", () => {
      expect(computeNextDue(se, undefined, NOW)).toBeNull();
    });
    it("returns null on an unparseable date", () => {
      expect(computeNextDue(se, "not-a-date", NOW)).toBeNull();
    });
    it("returns null when a rule is unverified, even if required", () => {
      const unverified = { ...se, verified: false };
      expect(computeNextDue(unverified, "2025-03-10", NOW)).toBeNull();
    });
  });

  describe("data integrity", () => {
    it("every rule is verified and every required rule has a real source URL", () => {
      for (const rule of Object.values(INSPECTION_RULES)) {
        expect(rule.verified).toBe(true);
        expect(rule.sourceUrl).toMatch(/^https:\/\//);
        // required ⇒ a computable cadence; not-required ⇒ none
        expect(rule.required).toBe(rule.cadence.kind !== "none");
      }
    });
  });
});

describe("parseRegistrationDate", () => {
  const ymd = (d: Date | null) =>
    d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null;

  it("parses dd-mm-yyyy", () => {
    expect(ymd(parseRegistrationDate("15-06-2020"))).toBe("2020-6-15");
    expect(ymd(parseRegistrationDate("1-2-2020"))).toBe("2020-2-1");
  });
  it("still parses legacy yyyy-mm-dd", () => {
    expect(ymd(parseRegistrationDate("2020-06-15"))).toBe("2020-6-15");
  });
  it("rejects missing, malformed, and impossible dates", () => {
    expect(parseRegistrationDate(undefined)).toBeNull();
    expect(parseRegistrationDate("")).toBeNull();
    expect(parseRegistrationDate("not-a-date")).toBeNull();
    expect(parseRegistrationDate("31-02-2020")).toBeNull(); // no 31 Feb
    expect(parseRegistrationDate("15-13-2020")).toBeNull(); // no month 13
  });
});
