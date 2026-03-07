// ── Shared Overpass / geo utilities ──────────────────────────────────────────
// Used by restaurants, hotels, attractions, mc, and emergency tabs.

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
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const DEFAULT_TIMEOUT_MS = 40_000;

/** POST a query to the Overpass API, cycling through mirrors on failure. */
export async function fetchOverpass(
  query: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<any> {
  let lastError: string | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
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
        lastError = `Overpass error ${response.status}`;
        continue;
      }
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

/** POI result cache TTL: 30 minutes. */
export const CACHE_TTL_MS = 30 * 60 * 1_000;
