import { HERE_DISCOVER_BASE_URL } from "./config";

const HERE_MIN_RADIUS_M = 100;
const HERE_MAX_LIMIT = 100;
const HERE_FALLBACK_MIN_TERM_LENGTH = 3;
const HERE_FALLBACK_QUERY_TERMS_MAX = 6;
const HERE_FALLBACK_RADIUS_MULTIPLIER = 2;
const HERE_QUERY_SPLIT_REGEX = /[\s,;|]+/;

export type HereCategory = {
  id?: string;
  name?: string;
};

export type HereContact = {
  phone?: Array<{ value?: string }>;
  www?: Array<{ value?: string }>;
  email?: Array<{ value?: string }>;
};

export type HereOpeningHours = {
  text?: string[];
};

export type HerePlaceItem = {
  id?: string;
  title?: string;
  position?: { lat: number; lng: number };
  categories?: HereCategory[];
  contacts?: HereContact[];
  openingHours?: HereOpeningHours[];
  address?: {
    label?: string;
    street?: string;
    houseNumber?: string;
    city?: string;
    countryName?: string;
  };
};

export async function fetchHereDiscover(
  query: string,
  lat: number,
  lon: number,
  radiusM: number,
  limit: number,
  timeoutMs: number
): Promise<HerePlaceItem[]> {
  const apiKey = process.env.EXPO_PUBLIC_HERE_API_KEY ?? "";
  if (!apiKey) throw new Error("Missing HERE API key");

  const requestedLimit = Math.max(1, Math.min(limit, HERE_MAX_LIMIT));
  const requestedRadius = Math.max(HERE_MIN_RADIUS_M, Math.round(radiusM));

  const fetchDiscoverPage = async (queryText: string, radius: number): Promise<HerePlaceItem[]> => {
    const params = new URLSearchParams({
      q: queryText,
      in: `circle:${lat},${lon};r=${Math.max(HERE_MIN_RADIUS_M, Math.round(radius))}`,
      limit: String(requestedLimit),
      lang: "en-US",
      apiKey,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${HERE_DISCOVER_BASE_URL}?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HERE Places ${response.status}`);
      }
      const data = (await response.json()) as { items?: HerePlaceItem[] };
      return Array.isArray(data.items) ? data.items : [];
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("HERE Places timeout");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const dedupeKey = (item: HerePlaceItem) => {
    const normalizedId = typeof item.id === "string" ? item.id.trim() : "";
    if (normalizedId.length > 0) return normalizedId;
    return [
      item.position?.lat ?? "na",
      item.position?.lng ?? "na",
      item.title?.trim() || "na",
      item.address?.label?.trim() || "na",
    ].join("|");
  };

  const collected = new Map<string, HerePlaceItem>();
  const primaryItems = await fetchDiscoverPage(query, requestedRadius);
  for (const item of primaryItems) {
    collected.set(dedupeKey(item), item);
  }
  if (collected.size >= requestedLimit) {
    return Array.from(collected.values()).slice(0, requestedLimit);
  }

  const fallbackTerms: string[] = [];
  for (const rawTerm of query.split(HERE_QUERY_SPLIT_REGEX)) {
    const term = rawTerm.trim();
    if (term.length < HERE_FALLBACK_MIN_TERM_LENGTH) continue;
    if (fallbackTerms.includes(term)) continue;
    fallbackTerms.push(term);
    if (fallbackTerms.length >= HERE_FALLBACK_QUERY_TERMS_MAX) break;
  }

  const fallbackRadius = requestedRadius * HERE_FALLBACK_RADIUS_MULTIPLIER;
  for (const term of fallbackTerms) {
    if (collected.size >= requestedLimit) break;
    try {
      const items = await fetchDiscoverPage(term, fallbackRadius);
      for (const item of items) {
        collected.set(dedupeKey(item), item);
      }
    } catch (fallbackErr) {
      // Fallback queries are best-effort only; preserve successfully collected results.
      console.warn("[herePlaces] fallback discover query failed:", fallbackErr);
    }
  }

  return Array.from(collected.values()).slice(0, requestedLimit);
}

export function hereItemPrimaryCategory(item: HerePlaceItem): string | undefined {
  const cat = item.categories?.[0];
  return (cat?.id || cat?.name || "").trim() || undefined;
}

export function hereItemPhone(item: HerePlaceItem): string | undefined {
  return item.contacts?.[0]?.phone?.[0]?.value?.trim() || undefined;
}

export function hereItemWebsite(item: HerePlaceItem): string | undefined {
  return item.contacts?.[0]?.www?.[0]?.value?.trim() || undefined;
}

export function hereItemEmail(item: HerePlaceItem): string | undefined {
  return item.contacts?.[0]?.email?.[0]?.value?.trim() || undefined;
}

export function hereItemOpeningHours(item: HerePlaceItem): string | undefined {
  const text = item.openingHours?.[0]?.text ?? [];
  const joined = text.join(" · ").trim();
  return joined || undefined;
}
