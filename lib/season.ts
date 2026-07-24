// ── MC Season Companion — data model & storage ───────────────────────────────
// Backs the Garage → Season screen (app/(tabs)/season.tsx). Owns the yearly
// rhythm of a bike: winterize in autumn, wake it up in spring, stay on top of
// the country-mandated inspection.
//
// The store holds a LIST of bikes (a garage), each with its own checklists and
// inspection reminder; `selectedBikeId` tracks which one the screen is showing.
// loadSeasonState() migrates the original single-bike shape forward.
// See launch/mc-season-spec.md (in the ReceiptVault repo) for the full spec.

import { storage } from "./storage";
import type { ForecastDay } from "./weather";

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

/** One bike in the garage, with its own checklists and inspection. */
export interface BikeEntry {
  id: string;
  bike: Bike;
  checklists: Record<ChecklistType, Record<string, ChecklistItemState>>;
  inspection: InspectionState;
}

export interface SeasonState {
  bikes: BikeEntry[];
  selectedBikeId: string | null;
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

// ── Weather-aware nudge ───────────────────────────────────────────────────────
// The base nudge comes from the calendar phase. When recent forecast data is
// available (from the RIDER HQ weather cache), we can surface a timelier one:
// frost incoming while the bike is still out, or a warm spell during spring prep.
// Pure + testable; returns null when there's no strong signal (caller falls back
// to the phase nudge).

/** Temp (°C) at/below which we warn about frost while the bike is still out. */
export const FROST_THRESHOLD_C = 1;
/** Temp (°C) at/above which a spring day counts as good prep weather. */
export const SPRING_WARM_C = 12;

export type WeatherSeasonNudge =
  | { key: "frostSoon"; tempC: number }
  | { key: "springWarming"; tempC: number }
  | null;

export function weatherSeasonNudge(
  phase: SeasonPhase,
  forecast: { minTempC: number; maxTempC: number }[] | null | undefined
): WeatherSeasonNudge {
  if (!forecast || forecast.length === 0) return null;
  const minLow = Math.min(...forecast.map((d) => d.minTempC));
  const maxHigh = Math.max(...forecast.map((d) => d.maxTempC));
  // Frost warning only while the bike is plausibly still out (riding / put-away).
  if ((phase === "riding" || phase === "winterize") && minLow <= FROST_THRESHOLD_C) {
    return { key: "frostSoon", tempC: Math.round(minLow) };
  }
  // A warm spell during spring prep is a good push to get the bike ready.
  if (phase === "springPrep" && maxHigh >= SPRING_WARM_C) {
    return { key: "springWarming", tempC: Math.round(maxHigh) };
  }
  return null;
}

/** RIDER HQ caches its last weather snapshot here; we borrow the forecast. */
const RIDERHQ_CACHE_KEY = "cache_riderhq_v1";
const FORECAST_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Read the cached RIDER HQ forecast (if reasonably fresh) for the weather-aware
 * nudge. Returns null when absent, stale, or malformed — the nudge then falls
 * back to the calendar phase. Never throws.
 */
export async function loadCachedForecast(now: number = Date.now()): Promise<ForecastDay[] | null> {
  try {
    const raw = await storage.getItem(RIDERHQ_CACHE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (typeof snap?.ts !== "number" || now - snap.ts > FORECAST_MAX_AGE_MS) return null;
    const f = snap?.weather?.forecast;
    return Array.isArray(f) && f.length > 0 ? (f as ForecastDay[]) : null;
  } catch {
    return null;
  }
}

// ── Bikes / garage ────────────────────────────────────────────────────────────

function makeBikeId(): string {
  return `bike_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyBikeEntry(): BikeEntry {
  return {
    id: makeBikeId(),
    bike: { name: "", country: "NO" },
    checklists: { winter: {}, spring: {} },
    inspection: { source: "entered" },
  };
}

export function defaultSeasonState(): SeasonState {
  const entry = emptyBikeEntry();
  return { bikes: [entry], selectedBikeId: entry.id };
}

/** The currently-selected bike, or the first one, or null when the garage is empty. */
export function selectedBike(state: SeasonState): BikeEntry | null {
  return state.bikes.find((b) => b.id === state.selectedBikeId) ?? state.bikes[0] ?? null;
}

export function addBike(state: SeasonState): SeasonState {
  const entry = emptyBikeEntry();
  return { bikes: [...state.bikes, entry], selectedBikeId: entry.id };
}

export function selectBike(state: SeasonState, id: string): SeasonState {
  return { ...state, selectedBikeId: id };
}

/** Remove a bike; reselect a remaining one (or null) if it was selected. */
export function removeBike(state: SeasonState, id: string): SeasonState {
  const bikes = state.bikes.filter((b) => b.id !== id);
  const selectedBikeId =
    state.selectedBikeId === id ? (bikes[0]?.id ?? null) : state.selectedBikeId;
  return { bikes, selectedBikeId };
}

function mapBike(state: SeasonState, id: string, fn: (b: BikeEntry) => BikeEntry): SeasonState {
  return { ...state, bikes: state.bikes.map((b) => (b.id === id ? fn(b) : b)) };
}

export function updateBike(state: SeasonState, id: string, partial: Partial<Bike>): SeasonState {
  return mapBike(state, id, (b) => ({ ...b, bike: { ...b.bike, ...partial } }));
}

export function updateInspection(
  state: SeasonState,
  id: string,
  partial: Partial<InspectionState>
): SeasonState {
  return mapBike(state, id, (b) => ({ ...b, inspection: { ...b.inspection, ...partial } }));
}

/** Toggle a checklist item on a bike, stamping/removing completedAt. Pure. */
export function toggleChecklistItem(
  state: SeasonState,
  bikeId: string,
  type: ChecklistType,
  itemId: string
): SeasonState {
  return mapBike(state, bikeId, (b) => {
    const nowDone = !b.checklists[type][itemId]?.done;
    return {
      ...b,
      checklists: {
        ...b.checklists,
        [type]: {
          ...b.checklists[type],
          [itemId]: nowDone
            ? { done: true, completedAt: new Date().toISOString() }
            : { done: false },
        },
      },
    };
  });
}

/** Count of completed items in a bike's checklist, for the progress indicator. */
export function checklistProgress(
  entry: BikeEntry,
  type: ChecklistType
): { done: number; total: number } {
  const items = CHECKLIST_ITEMS[type];
  const done = items.filter((i) => entry.checklists[type][i.id]?.done).length;
  return { done, total: items.length };
}

// ── Persistence ────────────────────────────────────────────────────────────────

/** Convert a stored ISO (yyyy-mm-dd) registration date to the dd-mm-yyyy the UI
 *  uses everywhere; pass anything else through unchanged. */
function toDisplayReg(s: string | undefined): string | undefined {
  if (!s) return s;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  return iso ? `${iso[3]}-${iso[2]}-${iso[1]}` : s;
}

function sanitizeEntry(raw: unknown): BikeEntry {
  const e = (raw ?? {}) as Partial<BikeEntry> & { bike?: Partial<Bike> };
  const bike: Bike = { name: "", country: "NO", ...e.bike };
  bike.firstRegistration = toDisplayReg(bike.firstRegistration);
  return {
    id: typeof e.id === "string" ? e.id : makeBikeId(),
    bike,
    checklists: {
      winter: { ...e.checklists?.winter },
      spring: { ...e.checklists?.spring },
    },
    inspection: { source: "entered", ...e.inspection },
  };
}

/**
 * Parse (and migrate) a stored payload into a valid SeasonState. Pure — split
 * out from loadSeasonState so migration is unit-testable without storage.
 */
export function parseSeasonState(raw: string | null): SeasonState {
  if (!raw) return defaultSeasonState();
  try {
    const parsed = JSON.parse(raw);

    // Legacy single-bike shape: { bike, checklists, inspection }.
    if (parsed && parsed.bike && !parsed.bikes) {
      const entry = sanitizeEntry(parsed);
      return { bikes: [entry], selectedBikeId: entry.id };
    }

    // Current shape: { bikes, selectedBikeId }.
    if (parsed && Array.isArray(parsed.bikes)) {
      const bikes = parsed.bikes.map(sanitizeEntry);
      if (bikes.length === 0) return defaultSeasonState();
      const selectedBikeId = bikes.some((b: BikeEntry) => b.id === parsed.selectedBikeId)
        ? parsed.selectedBikeId
        : bikes[0].id;
      return { bikes, selectedBikeId };
    }

    return defaultSeasonState();
  } catch {
    return defaultSeasonState();
  }
}

/** Load persisted season state, migrating the old single-bike shape forward. */
export async function loadSeasonState(): Promise<SeasonState> {
  try {
    return parseSeasonState(await storage.getItem(SEASON_STORAGE_KEY));
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
