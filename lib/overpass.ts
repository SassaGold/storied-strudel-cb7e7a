// ── Shared Overpass / geo utilities ──────────────────────────────────────────
// Used by restaurants, hotels, attractions, mc, and emergency tabs.

import {
  EARTH_RADIUS_M,
  OSM_USER_AGENT,
  OVERPASS_ENDPOINTS,
  OVERPASS_DEFAULT_TIMEOUT_MS,
  CACHE_TTL_MS as CACHE_TTL_MS_CFG,
  RETRY_MAX_ATTEMPTS,
  RETRY_INITIAL_DELAY_MS,
} from "./config";

// Re-export so existing importers of OVERPASS_ENDPOINTS / CACHE_TTL_MS
// and OVERPASS_ENDPOINTS from this module keep working unchanged.
export { OVERPASS_ENDPOINTS, CACHE_TTL_MS_CFG as CACHE_TTL_MS };

const OVERPASS_RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504]);
// Server-side failures that tend to clear on an immediate retry of the same
// endpoint. Rate limits (403/429) are deliberately excluded — retrying into
// a rate limit makes it worse.
const OVERPASS_TRANSIENT_5XX = new Set([500, 502, 503, 504]);
const OVERPASS_SAME_ENDPOINT_RETRY_DELAY_MS = 1_000;
const OVERPASS_ENDPOINT_COOLDOWN_MINUTES = 5;
const OVERPASS_ENDPOINT_COOLDOWN_MS = OVERPASS_ENDPOINT_COOLDOWN_MINUTES * 60 * 1_000;
const endpointCooldownUntil = new Map<string, number>();
let endpointRoundRobinStart = 0;

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const retryAfterSeconds = Number(trimmed);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return retryAfterSeconds * 1_000;
    }
  }
  const retryAtMs = Date.parse(trimmed);
  if (Number.isFinite(retryAtMs)) {
    const delta = retryAtMs - Date.now();
    return delta > 0 ? delta : null;
  }
  return null;
}

/** Haversine formula: returns the great-circle distance in metres. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = EARTH_RADIUS_M;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** POST a query to the Overpass API, cycling through mirrors on failure. */
export async function fetchOverpass(
  query: string,
  timeoutMs: number = OVERPASS_DEFAULT_TIMEOUT_MS
): Promise<any> {
  let lastError: string | null = null;
  if (OVERPASS_ENDPOINTS.length === 0) {
    throw new Error("No Overpass endpoints configured");
  }

  const now = Date.now();
  const orderedEndpoints = OVERPASS_ENDPOINTS
    .slice(endpointRoundRobinStart)
    .concat(OVERPASS_ENDPOINTS.slice(0, endpointRoundRobinStart));
  endpointRoundRobinStart = (endpointRoundRobinStart + 1) % OVERPASS_ENDPOINTS.length;

  const preferred = orderedEndpoints.filter(
    (endpoint) => (endpointCooldownUntil.get(endpoint) ?? 0) <= now
  );
  // If all mirrors are currently cooling down, still attempt all to avoid lockout.
  const endpointsToTry = preferred.length > 0 ? preferred : orderedEndpoints;

  for (const endpoint of endpointsToTry) {
    // Up to two attempts per endpoint: a transient 5xx usually answers fast
    // and clears on an immediate retry (measured 2026-08-06 against
    // overpass-api.de: 504 after 7 s, then 200 with full results 3 s later).
    // With a single healthy mirror configured, failing over on the first 504
    // means failing outright. Timeouts get no second attempt — one has
    // already cost the full timeoutMs.
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            // OSM usage etiquette: identify the app (also sent to Nominatim and
            // the tile servers). Reduces the risk of being throttled.
            "User-Agent": OSM_USER_AGENT,
            Accept: "application/json",
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          lastError = `Overpass error ${response.status}`;
          if (OVERPASS_TRANSIENT_5XX.has(response.status) && attempt === 0) {
            await new Promise<void>((resolve) =>
              setTimeout(resolve, OVERPASS_SAME_ENDPOINT_RETRY_DELAY_MS)
            );
            continue;
          }
          if (OVERPASS_RETRYABLE_STATUS.has(response.status)) {
            const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After")) ?? OVERPASS_ENDPOINT_COOLDOWN_MS;
            endpointCooldownUntil.set(endpoint, Date.now() + retryAfterMs);
          }
          break;
        }
        endpointCooldownUntil.delete(endpoint);
        return await response.json();
      } catch (err) {
        clearTimeout(timeoutId);
        // A mirror that hangs until the timeout — or refuses the connection —
        // gets the same cooldown as one that answers 429/504. Without this,
        // every later search re-pays the full timeout on the dead mirror before
        // reaching a healthy one: measured 2026-08-01, a tarpitting mirror made
        // every second search hang 40 s from a network where the other mirror
        // answered in 5 s. If connectivity itself is down, every mirror cools
        // and the all-cooling fallback above still tries them, so no lockout.
        endpointCooldownUntil.set(endpoint, Date.now() + OVERPASS_ENDPOINT_COOLDOWN_MS);
        lastError =
          err instanceof Error && err.name === "AbortError"
            ? "Timeout"
            : "Network error";
        break;
      }
    }
  }
  throw new Error(lastError ?? "Overpass request failed");
}

/**
 * fetch() with an AbortController timeout — a stalled socket otherwise hangs
 * forever (React Native fetch has no default timeout). Used for all non-Overpass
 * HTTP calls (Nominatim, Open-Meteo, Wikipedia); fetchOverpass has its own
 * per-mirror timeout handling above.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = OVERPASS_DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Timeout");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * True when an error thrown by fetchOverpass (or a wrapper such as
 * fetchOsmPlaces) represents a network/timeout failure rather than a data
 * problem. Kept next to fetchOverpass so the message strings it matches live
 * in one module.
 */
export function isOverpassNetworkError(err: unknown): boolean {
  return err instanceof Error && /timeout|network error/i.test(err.message);
}

/**
 * Retry a promise-returning function with exponential back-off.
 *
 * @param fn             Function returning a Promise. Called up to `maxAttempts` times.
 * @param maxAttempts    Total number of attempts (default: RETRY_MAX_ATTEMPTS from config).
 * @param initialDelayMs Milliseconds before the first retry (default: RETRY_INITIAL_DELAY_MS).
 *                       Each subsequent retry doubles the delay.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = RETRY_MAX_ATTEMPTS,
  initialDelayMs = RETRY_INITIAL_DELAY_MS,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts - 1) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, initialDelayMs * 2 ** attempt)
        );
      }
    }
  }
  throw lastErr;
}

/**
 * Parse an OpenStreetMap `wikipedia` tag (e.g. "en:Eiffel_Tower" or just "Paris")
 * into a { lang, title } pair suitable for the Wikipedia REST API.
 */
export function parseWikiTag(tag: string): { lang: string; title: string } {
  const colonIdx = tag.indexOf(":");
  return {
    lang: colonIdx > 0 ? tag.slice(0, colonIdx) : "en",
    title: (colonIdx > 0 ? tag.slice(colonIdx + 1) : tag).replace(/ /g, "_"),
  };
}
