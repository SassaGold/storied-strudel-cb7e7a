// ── MC inspection rules (the moat) ────────────────────────────────────────────
// Per-country roadworthiness-inspection logic for MOTORCYCLES. This is the
// retention spine of the Season feature and the hardest part to get right.
//
// VERIFICATION STATUS — 2026-07-23 (see launch/mc-season-spec.md):
//   Every rule below has been checked against the cited official source for
//   motorcycles specifically. `verified` is true only where that check passed.
//   Cars often follow a different cadence — the checks confirmed the MC rule,
//   not the car rule.
//
//   SE — Kontrollbesiktning: REQUIRED. First ≤48 months after first
//        registration, then ≤24 months after each inspection. (Fits the simple
//        months model. Cars use the 3-2-1 rule 36/24/14 — do NOT reuse.)
//   IS — Aðalskoðun: REQUIRED, but NOT a fixed interval. Due in the 4th year
//        after registration (registration year excluded), then every 2 years
//        TWICE, then ANNUALLY. Calendar-year anchored, inspection month = May,
//        hard deadline 1 August. Needs the calendar-year cadence below.
//   NO — Periodisk kjøretøykontroll (EU-kontroll): NOT required for motorcycles
//        (L-category is absent from FOR-2009-05-13-591 §4). An EU proposal to
//        include MC >125cc exists but is not law and has no NO effective date.
//   DK — Periodisk syn: NOT required for private motorcycles. Denmark chose the
//        "effective alternative" (roadside inspection / vejsidesyn) permitted by
//        Directive 2014/45/EU instead, effective from the 2022-01-01 deadline.
//        (Commercial MC — taxi/rental — can differ; this app assumes private.)

import type { Country } from "./season";

/**
 * How a country's inspection deadlines are laid out. `computeNextDue` switches
 * on `kind` and returns null for `none` (no reminder to make).
 */
export type Cadence =
  | { kind: "none" }
  | {
      // Deadline counted in months from the month of first registration, then a
      // constant interval thereafter. Sweden.
      kind: "months";
      firstMonths: number;
      recurringMonths: number;
    }
  | {
      // Calendar-year anchored with a fixed inspection month and a hard deadline,
      // plus an escalating year schedule. Iceland.
      kind: "calendarYear";
      /** 1–12. When in the year the inspection window opens (IS = May). */
      inspectionMonth: number;
      /** Hard-deadline month/day the inspection must be done BY (IS = 1 Aug). */
      deadlineMonth: number;
      deadlineDay: number;
      /**
       * Years after the registration year at which the FIRST inspection falls
       * (registration year excluded). IS = 4 → reg 2026 ⇒ first due 2030.
       */
      firstYearOffset: number;
      /** How many 2-year gaps follow the first inspection before it goes annual. IS = 2. */
      biennialSteps: number;
    };

export interface InspectionRule {
  country: Country;
  /** Whether periodic inspection applies to motorcycles in this country. */
  required: boolean;
  /**
   * TRUE once the cadence has been confirmed against `sourceUrl` for
   * motorcycles specifically. Gates all date computation and reminders.
   */
  verified: boolean;
  /** Native term for the inspection, shown in the UI. */
  nativeTerm: string;
  /** Authority whose page was checked. */
  source: string;
  /** Exact URL that was verified. */
  sourceUrl: string;
  /** The deadline layout. `none` when inspection is not required. */
  cadence: Cadence;
  /** Free-text note surfaced to the rider / future maintainers. */
  note: string;
}

export const INSPECTION_RULES: Record<Country, InspectionRule> = {
  SE: {
    country: "SE",
    required: true,
    verified: true,
    nativeTerm: "Kontrollbesiktning",
    source: "Transportstyrelsen",
    sourceUrl:
      "https://www.transportstyrelsen.se/sv/vagtrafik/fordon/aga-kopa-eller-salja-fordon/fordonsbesiktning/besiktningsregler/motorcykel/",
    cadence: { kind: "months", firstMonths: 48, recurringMonths: 24 },
    note: "First inspection within 48 months of first registration, then within 24 months of each inspection. Verified 2026-07-23.",
  },
  IS: {
    country: "IS",
    required: true,
    verified: true,
    nativeTerm: "Aðalskoðun",
    source: "Samgöngustofa / Ísland.is",
    sourceUrl: "https://island.is/en/vehicle-inspection",
    cadence: {
      kind: "calendarYear",
      inspectionMonth: 5, // May
      deadlineMonth: 8,
      deadlineDay: 1, // must be inspected before 1 August
      firstYearOffset: 4, // 4th year after registration (reg year excluded)
      biennialSteps: 2, // then every 2 years twice, then annually
    },
    note: "Due in the 4th year after registration, then every 2 years twice, then annually. Inspection month May, deadline 1 Aug. Reglugerð 414/2021. Verified 2026-07-23.",
  },
  NO: {
    country: "NO",
    required: false,
    verified: true,
    nativeTerm: "EU-kontroll (PKK)",
    source: "Lovdata / Statens vegvesen",
    sourceUrl: "https://lovdata.no/dokument/SF/forskrift/2009-05-13-591",
    cadence: { kind: "none" },
    note: "Motorcycles are NOT subject to periodic inspection (L-category absent from FOR-2009-05-13-591 §4). A pending EU proposal for MC >125cc is not yet law. Verified 2026-07-23.",
  },
  DK: {
    country: "DK",
    required: false,
    verified: true,
    nativeTerm: "Periodisk syn",
    source: "Færdselsstyrelsen",
    sourceUrl: "https://www.fstyr.dk/privat/syn/stoej-og-vejsidesyn",
    cadence: { kind: "none" },
    note: "No periodic inspection for private motorcycles — Denmark uses roadside inspection (vejsidesyn) instead, per Directive 2014/45/EU. Commercial MC may differ. Verified 2026-07-23.",
  },
};

export function inspectionRule(country: Country): InspectionRule {
  return INSPECTION_RULES[country];
}

/**
 * Parse a registration date the rider entered. Accepts dd-mm-yyyy (the display
 * format used throughout the app) and legacy yyyy-mm-dd. Returns a local-time
 * Date, or null when the string is missing or not a real calendar date.
 */
export function parseRegistrationDate(s: string | undefined): Date | null {
  if (!s) return null;
  const str = s.trim();
  let yyyy: number, mm: number, dd: number;
  let m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(str); // dd-mm-yyyy
  if (m) {
    dd = +m[1]; mm = +m[2]; yyyy = +m[3];
  } else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str))) { // yyyy-mm-dd (legacy)
    yyyy = +m[1]; mm = +m[2]; dd = +m[3];
  } else {
    return null;
  }
  const d = new Date(yyyy, mm - 1, dd);
  // Reject impossible dates (e.g. 31-02-2020 rolling over into March).
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
}

/**
 * Compute the next inspection due date (YYYY-MM-DD) from a first-registration
 * date, or null when no date can honestly be given.
 *
 * Returns null when: the rule is unverified, inspection isn't required, no
 * first-registration date is available, or the date is unparseable. Callers
 * MUST treat null as "I cannot tell you a date" and show no reminder.
 *
 * The result is an ESTIMATE of the next statutory deadline based on the
 * registration date alone — it assumes inspections happen at each deadline
 * (we don't track a rider's actual inspection history yet). Good enough to
 * drive a "~1 month before" reminder; not a substitute for the official record.
 */
export function computeNextDue(
  rule: InspectionRule,
  firstRegistration: string | undefined,
  now: Date = new Date()
): string | null {
  if (!rule.verified || !rule.required || rule.cadence.kind === "none") return null;

  const first = parseRegistrationDate(firstRegistration);
  if (!first) return null;

  if (rule.cadence.kind === "months") {
    const { firstMonths, recurringMonths } = rule.cadence;
    const due = new Date(first);
    due.setMonth(due.getMonth() + firstMonths);
    while (due.getTime() < now.getTime()) {
      due.setMonth(due.getMonth() + recurringMonths);
    }
    return toISODate(due);
  }

  // calendarYear (Iceland): build the schedule of due YEARS, then pick the first
  // whose hard deadline is still in the future.
  const { inspectionMonth, deadlineMonth, deadlineDay, firstYearOffset, biennialSteps } =
    rule.cadence;
  void inspectionMonth; // window opens then; the reminder anchors on the deadline
  const regYear = first.getFullYear();
  const years: number[] = [regYear + firstYearOffset];
  for (let i = 0; i < biennialSteps; i++) {
    years.push(years[years.length - 1] + 2);
  }
  // Then annual, generated a couple of years past "now" to guarantee a hit.
  while (years[years.length - 1] < now.getFullYear() + 2) {
    years.push(years[years.length - 1] + 1);
  }
  for (const year of years) {
    const deadline = new Date(year, deadlineMonth - 1, deadlineDay);
    if (deadline.getTime() >= now.getTime()) return toISODate(deadline);
  }
  return null;
}

/** Format a Date as YYYY-MM-DD in local time (avoids UTC off-by-one from toISOString). */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
