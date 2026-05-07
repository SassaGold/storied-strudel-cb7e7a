// ── Shared Overpass / geo utilities ──────────────────────────────────────────
// Used by restaurants, hotels, attractions, mc, and emergency tabs.

import {
  EARTH_RADIUS_M,
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
const OVERPASS_ENDPOINT_COOLDOWN_MS = 5 * 60 * 1_000;
const endpointCooldownUntil = new Map<string, number>();
let endpointRoundRobinStart = 0;

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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        if (OVERPASS_RETRYABLE_STATUS.has(response.status)) {
          const retryAfterHeader = response.headers.get("Retry-After");
          const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN;
          const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds * 1_000
            : OVERPASS_ENDPOINT_COOLDOWN_MS;
          endpointCooldownUntil.set(endpoint, Date.now() + retryAfterMs);
        }
        lastError = `Overpass error ${response.status}`;
        continue;
      }
      endpointCooldownUntil.delete(endpoint);
      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      lastError =
        err instanceof Error && err.name === "AbortError"
          ? "Timeout"
          : "Network error";
    }
  }
  throw new Error(lastError ?? "Overpass request failed");
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
