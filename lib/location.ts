// ── Location helpers ──────────────────────────────────────────────────────────
// Shared wrappers around expo-location so screens don't each re-implement the
// same timeout / fallback logic.

import * as Location from "expo-location";
import { GPS_TIMEOUT_MS, MAX_FIX_AGE_MS } from "./config";

/** A position together with how old the underlying fix actually is. */
export type TimedPosition = {
  position: Location.LocationObject;
  /** Age of the fix in ms, clamped at 0 (some devices report a skewed clock). */
  ageMs: number;
  /** True when the fix is older than `MAX_FIX_AGE_MS` — never present as current. */
  stale: boolean;
};

function age(position: Location.LocationObject, now: number): number {
  const ts = position.timestamp;
  if (typeof ts !== "number" || !Number.isFinite(ts)) return 0;
  return Math.max(0, now - ts);
}

/**
 * Race a live fix against a timeout, falling back to the last known position.
 *
 * Always reports how old the result is. `getLastKnownPositionAsync()` applies no
 * age limit of its own, so the fallback can be arbitrarily stale — callers must
 * decide what to do about that rather than being handed a fix that merely looks
 * current. (Deliberately called with no arguments: passing options would build
 * `expo.modules.location.records.LocationLastKnownOptions`, the reflection-built
 * record class R8 mangled in 1.3.0/1.4.0 — see CLAUDE.md. Filtering by age here
 * in JS is equivalent and cannot be optimized away.)
 */
async function getTimedPosition(
  options?: Location.LocationOptions,
  timeoutMs: number = GPS_TIMEOUT_MS
): Promise<TimedPosition> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("GPS_TIMEOUT")), timeoutMs);
  });
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync(options),
      timeout,
    ]);
    const ageMs = age(position, Date.now());
    return { position, ageMs, stale: ageMs > MAX_FIX_AGE_MS };
  } catch (err) {
    const last = await Location.getLastKnownPositionAsync();
    if (!last) throw err;
    const ageMs = age(last, Date.now());
    return { position: last, ageMs, stale: ageMs > MAX_FIX_AGE_MS };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * A position that is genuinely current, or an error.
 *
 * Use this anywhere a stale fix would produce a confidently wrong answer —
 * every "near you" distance, which is all of them. A cached fix older than
 * `MAX_FIX_AGE_MS` is treated as no fix at all: an honest "couldn't get your
 * location" beats a list of places measured from where you were an hour ago.
 */
export async function getCurrentPositionWithTimeout(
  options?: Location.LocationOptions,
  timeoutMs: number = GPS_TIMEOUT_MS
): Promise<Location.LocationObject> {
  const { position, stale } = await getTimedPosition(options, timeoutMs);
  if (stale) throw new Error("GPS_STALE");
  return position;
}

/**
 * A position even if it is old, with its age attached.
 *
 * Only for callers where showing something beats showing nothing — SOS, where a
 * position from ten minutes ago still narrows the search. Such callers must say
 * how old it is; that is the whole reason `ageMs` is returned.
 */
export async function getPositionAllowingStale(
  options?: Location.LocationOptions,
  timeoutMs: number = GPS_TIMEOUT_MS
): Promise<TimedPosition> {
  return getTimedPosition(options, timeoutMs);
}
