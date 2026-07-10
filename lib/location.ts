// ── Location helpers ──────────────────────────────────────────────────────────
// Shared wrappers around expo-location so screens don't each re-implement the
// same timeout / fallback logic.

import * as Location from "expo-location";
import { GPS_TIMEOUT_MS } from "./config";

/**
 * Like `Location.getCurrentPositionAsync`, but bounded by a timeout so a bad GPS
 * environment can't hang the UI with a stuck spinner. On timeout or error it
 * falls back to the last known position; if that is also unavailable it rethrows
 * so callers can surface a "couldn't get location" message.
 */
export async function getCurrentPositionWithTimeout(
  options?: Location.LocationOptions,
  timeoutMs: number = GPS_TIMEOUT_MS
): Promise<Location.LocationObject> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("GPS_TIMEOUT")), timeoutMs);
  });
  try {
    return await Promise.race([Location.getCurrentPositionAsync(options), timeout]);
  } catch (err) {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return last;
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
