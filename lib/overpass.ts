// ── Shared Overpass / geo utilities ──────────────────────────────────────────
// Used by restaurants, hotels, attractions, mc, and emergency tabs.

import { Platform } from "react-native";
import Constants from "expo-constants";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single element returned by the Overpass API (node, way, or relation). */
export interface OverpassElement {
  id: number;
  type: "node" | "way" | "relation";
  /** Coordinates for nodes; ways and relations use center instead. */
  lat?: number;
  lon?: number;
  /** Bounding-box centre for ways and relations. */
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Top-level response shape for Overpass API JSON output. */
export interface OverpassResponse {
  version?: number;
  generator?: string;
  elements: OverpassElement[];
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Haversine formula: returns the great-circle distance in metres. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6_371_000;
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

/** Overpass API mirrors — free OpenStreetMap data, no API key required. */
/** Default Overpass API mirrors, tried in order. */
const DEFAULT_OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

/**
 * Resolved Overpass endpoints.  Override all mirrors at once by setting the
 * OVERPASS_ENDPOINTS env var to a comma-separated list of URLs in `.env`
 * (see `.env.example`).  Falls back to DEFAULT_OVERPASS_ENDPOINTS when the
 * variable is absent or empty.
 */
const _extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
const _envEndpoints =
  typeof _extra.overpassEndpoints === "string" && _extra.overpassEndpoints
    ? _extra.overpassEndpoints.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

export const OVERPASS_ENDPOINTS: string[] =
  _envEndpoints.length > 0 ? _envEndpoints : DEFAULT_OVERPASS_ENDPOINTS;

const DEFAULT_TIMEOUT_MS = 40_000;
/** Base delay for exponential backoff between endpoint retries (ms). */
const BACKOFF_BASE_MS = 500;
/** Maximum backoff per retry to prevent very long waits when many mirrors are added. */
const BACKOFF_MAX_MS = 5_000;

/**
 * POST a query to the Overpass API, cycling through mirrors on failure.
 * Respects HTTP 429 `Retry-After` headers and applies exponential backoff
 * with jitter between retries so bursts of requests don't all hammer the
 * same endpoint at once.
 *
 * @param signal  Optional AbortSignal so callers can cancel in-flight requests.
 */
export async function fetchOverpass(
  query: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<OverpassResponse> {
  let lastError: string | null = null;

  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    const endpoint = OVERPASS_ENDPOINTS[i];

    // Apply exponential backoff between retries (not before the first attempt)
    if (i > 0) {
      const backoffMs = Math.min(BACKOFF_BASE_MS * 2 ** (i - 1) + Math.random() * 200, BACKOFF_MAX_MS);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    // Bail early if the caller cancelled the request
    if (signal?.aborted) throw new Error("Cancelled");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    // Forward the caller's AbortSignal to the inner controller
    const onCallerAbort = () => controller.abort();
    signal?.addEventListener("abort", onCallerAbort);

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
      signal?.removeEventListener("abort", onCallerAbort);

      if (response.status === 429) {
        // Rate-limited: respect Retry-After if present, then continue to next endpoint.
        // Cap at 30 s so we honour the server's guidance up to a reasonable limit
        // without blocking the user for too long; longer waits move on to the next mirror.
        // Note: Retry-After can be either a delay-seconds string or an HTTP date;
        // parseFloat returns NaN for date strings, so we fall back to 2 s in that case.
        const retryAfter = response.headers.get("Retry-After");
        const retryAfterSec = retryAfter ? parseFloat(retryAfter) : NaN;
        const waitMs = Number.isFinite(retryAfterSec) ? Math.min(retryAfterSec * 1000, 30_000) : 2_000;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        lastError = "Rate limited (429)";
        continue;
      }

      if (!response.ok) {
        lastError = `Overpass HTTP ${response.status}`;
        continue;
      }

      const json = await response.json() as OverpassResponse;
      // Validate that the response has the expected shape (#3: API response validation)
      if (!Array.isArray(json.elements)) {
        lastError = "Overpass response missing elements array";
        continue;
      }
      return json;
    } catch (err) {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onCallerAbort);
      if (err instanceof Error && (err.name === "AbortError" || err.message === "Cancelled")) {
        throw err; // Propagate cancellation immediately
      }
      lastError = err instanceof Error ? err.message : "Network error";
    }
  }
  throw new Error(lastError ?? "Overpass request failed");
}

/** POI result cache TTL: 30 minutes. */
export const CACHE_TTL_MS = 30 * 60 * 1_000;

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

/**
 * Build a platform-appropriate "open in maps" deep-link URL.
 *  iOS   → Apple Maps  (`maps://` scheme)
 *  other → Google Maps web URL
 */
export function buildMapsUrl(lat: number, lon: number, name?: string): string {
  if (Platform.OS === "ios") {
    const q = name ? `&q=${encodeURIComponent(name)}` : `&q=${lat},${lon}`;
    return `maps://?ll=${lat},${lon}${q}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}
