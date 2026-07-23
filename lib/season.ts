// ── MC Season Companion — data model & storage ───────────────────────────────
// Backs the Garage → Season screen (app/(tabs)/season.tsx). Owns the yearly
// rhythm of a bike: winterize in autumn, wake it up in spring, stay on top of
// the country-mandated inspection.
//
// Scaffold scope: a SINGLE bike is modelled for now. The store is intentionally
// shaped so a `bikes: Bike[]` list can be layered on later without a data
// migration — everything hangs off the one `SeasonState` object today.
// See launch/mc-season-spec.md (in the ReceiptVault repo) for the full spec.

import { storage } from "./storage";

export const SEASON_STORAGE_KEY = "season_state_v1";

/** Nordic countries the inspection layer distinguishes between. */
export type Country = "SE" | "NO" | "DK" | "IS";
export const COUNTRIES: Country[] = ["SE", "NO", "DK", "IS"];

/**
 * Flag emoji per country, kept OUT of the translated name strings. Rendering the
 * flag and the name in the same <Text> triggers an Android measurement bug that
 * intermittently clips the name (regional-indicator emoji mis-measure width), so
 * the UI renders these in a separate <Text> from the name.
 */
export const COUNTRY_FLAG: Record<Country, string> = {
  SE: "🇸🇪",
  NO: "🇳🇴",
  DK: "🇩🇰",
  IS: "🇮🇸",
};

export type ChecklistType = "winter" | "spring";

/** How the next-inspection date was obtained. */
export type InspectionSource = "entered" | "computed" | "scanned";

export interface Bike {
  /** Make/model or the rider's nickname for the bike. */
  name: string;
  /** Drives inspection cadence calculations. ISO date (YYYY-MM-DD). */
  firstRegistration?: string;
  /** Which country's inspection rules apply. */
  country: Country;
}

export interface ChecklistItemState {
  done: boolean;
  /** ISO timestamp of when it was checked off — powers the "completed on" line. */
  completedAt?: string;
}

export interface InspectionState {
  /** The deadline (ISO date) the currently-scheduled reminder was set for. */
  nextDueDate?: string;
  /** ISO date the scheduled reminder will actually fire (deadline minus lead). */
  reminderFireDate?: string;
  source: InspectionSource;
  /** ID of the scheduled reminder notification, once wired up. */
  reminderId?: string;
}

export interface SeasonState {
  bike: Bike;
  checklists: Record<ChecklistType, Record<string, ChecklistItemState>>;
  inspection: InspectionState;
}

// ── Checklist definitions ─────────────────────────────────────────────────────
// Item ids are stable storage keys; the label/hint come from i18n
// (season.items.<id>.*). Order here is the display order.

export interface ChecklistItemDef {
  id: string;
  /** MaterialCommunityIcons name. */
  icon: string;
}

/** Winter storage checklist (autumn) — spec MVP scope §1. */
export const WINTER_ITEMS: ChecklistItemDef[] = [
  { id: "fuelStabilizer", icon: "fuel" },
  { id: "batteryTender", icon: "car-battery" },
  { id: "tyrePressure", icon: "gauge" },
  { id: "oilChange", icon: "oil" },
  { id: "washWax", icon: "spray-bottle" },
  { id: "blockExhaust", icon: "pipe" },
  { id: "cover", icon: "tent" },
];

/** Spring prep checklist — spec MVP scope §2 (roughly the reverse). */
export const SPRING_ITEMS: ChecklistItemDef[] = [
  { id: "batteryInstall", icon: "car-battery" },
  { id: "tyres", icon: "gauge" },
  { id: "brakes", icon: "car-brake-alert" },
  { id: "chain", icon: "link-variant" },
  { id: "lights", icon: "lightbulb-on" },
  { id: "fluids", icon: "oil" },
  { id: "bolts", icon: "wrench" },
  { id: "firstRide", icon: "motorbike" },
];

export const CHECKLIST_ITEMS: Record<ChecklistType, ChecklistItemDef[]> = {
  winter: WINTER_ITEMS,
  spring: SPRING_ITEMS,
};

// ── Season phase ──────────────────────────────────────────────────────────────
// Drives the "Time to winterize" / "Spring's coming" nudges. Nordic calendar:
// riding season is roughly May–Aug; autumn (Sep–Oct) is put-away time; spring
// (Mar–Apr) is wake-up time; deep winter (Nov–Feb) the bike sleeps.

export type SeasonPhase = "winterize" | "springPrep" | "riding" | "offSeason";

/** Map a 0-indexed month (0 = January) to the current season phase. */
export function seasonPhase(month: number): SeasonPhase {
  if (month >= 8 && month <= 9) return "winterize"; // Sep–Oct
  if (month >= 2 && month <= 3) return "springPrep"; // Mar–Apr
  if (month >= 4 && month <= 7) return "riding"; // May–Aug
  return "offSeason"; // Nov–Feb
}

/** Current season phase from the device clock. */
export function currentSeasonPhase(): SeasonPhase {
  return seasonPhase(new Date().getMonth());
}

// ── Defaults & persistence ────────────────────────────────────────────────────

const emptyChecklist = (): Record<string, ChecklistItemState> => ({});

export function defaultSeasonState(): SeasonState {
  return {
    bike: { name: "", country: "NO" },
    checklists: { winter: emptyChecklist(), spring: emptyChecklist() },
    inspection: { source: "entered" },
  };
}

/** Load persisted season state, or a fresh default when absent/corrupt. */
export async function loadSeasonState(): Promise<SeasonState> {
  try {
    const raw = await storage.getItem(SEASON_STORAGE_KEY);
    if (!raw) return defaultSeasonState();
    const parsed = JSON.parse(raw) as Partial<SeasonState>;
    // Shallow-merge onto defaults so older/partial payloads stay valid as the
    // shape grows.
    const base = defaultSeasonState();
    return {
      bike: { ...base.bike, ...parsed.bike },
      checklists: {
        winter: { ...base.checklists.winter, ...parsed.checklists?.winter },
        spring: { ...base.checklists.spring, ...parsed.checklists?.spring },
      },
      inspection: { ...base.inspection, ...parsed.inspection },
    };
  } catch {
    return defaultSeasonState();
  }
}

/** Persist season state. Never throws. */
export async function saveSeasonState(state: SeasonState): Promise<void> {
  try {
    await storage.setItem(SEASON_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/** Toggle a checklist item, stamping/removing completedAt. Pure — returns a new state. */
export function toggleChecklistItem(
  state: SeasonState,
  type: ChecklistType,
  itemId: string
): SeasonState {
  const current = state.checklists[type][itemId];
  const nowDone = !current?.done;
  return {
    ...state,
    checklists: {
      ...state.checklists,
      [type]: {
        ...state.checklists[type],
        [itemId]: nowDone
          ? { done: true, completedAt: new Date().toISOString() }
          : { done: false },
      },
    },
  };
}

/** Count of completed items in a checklist, for the progress indicator. */
export function checklistProgress(
  state: SeasonState,
  type: ChecklistType
): { done: number; total: number } {
  const items = CHECKLIST_ITEMS[type];
  const done = items.filter((i) => state.checklists[type][i.id]?.done).length;
  return { done, total: items.length };
}
