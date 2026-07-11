import { fetchOverpass } from "./overpass";

// ── OSM data types ─────────────────────────────────────────────────────────────
const MIN_OVERPASS_TIMEOUT_SECONDS = 10;

/**
 * OSM keys under which POI values can live. amenity/tourism cover most food and
 * lodging, but shop (car_repair, bakery…), historic (castle, memorial…) and
 * leisure (stadium, track…) hold the rest, so all are queried. A value only
 * matches its real key, so unrelated keys simply return nothing.
 */
const OSM_POI_SEARCH_KEYS = ["amenity", "tourism", "shop", "historic", "leisure"] as const;

export type OsmPlace = {
  type: string; // "node", "way", or "relation"
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type ContactInfo = {
  phone?: Array<{ value?: string }>;
  www?: Array<{ value?: string }>;
  email?: Array<{ value?: string }>;
};

export type OsmPlaceItem = {
  id?: string;
  title?: string;
  position?: { lat: number; lng: number };
  categories?: Array<{ id?: string; name?: string }>;
  // Keep array shape for backward-compatible aliases.
  contacts?: ContactInfo[];
  openingHours?: Array<{ text?: string[] }>;
  address?: {
    label?: string;
    street?: string;
    houseNumber?: string;
    city?: string;
    countryName?: string;
  };
  /** Raw OSM tags, preserved for consumers that need type-specific tags
   *  (e.g. the MC screen reads `fuel:*` and `fee`). */
  tags?: Record<string, string>;
};

/** Builds an Overpass query for discovering POI by keywords/tags.
 * Returns OSM data which is normalized to OsmPlaceItem format. */
export async function fetchOsmPlaces(
  amenities: string, // e.g., "restaurant|cafe|fast_food"
  lat: number,
  lon: number,
  radiusM: number,
  limit: number,
  timeoutMs: number
): Promise<OsmPlaceItem[]> {
  const timeout = Math.max(MIN_OVERPASS_TIMEOUT_SECONDS, Math.floor(timeoutMs / 1000));

  // Build Overpass query within the radius. Plain tokens (e.g. "fuel") match the
  // value across every supported OSM key. "key=value" tokens (e.g.
  // "club=motorcycle", "highway=raceway") match that exact key only — needed for
  // tags that don't live under the generic keys.
  // Escape regex metacharacters so token values match literally inside the
  // Overpass regex ["key"~"^(v1|v2)$"]. Double backslash: Overpass QL unescapes
  // string literals once before the regex engine sees them ("\\." → \. → literal dot).
  const escapeValue = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&");
  // OSM keys are plain identifiers (letters/digits/underscore/colon); anything
  // else would break out of the quoted key in the query, so reject it.
  const isSafeKey = (s: string): boolean => /^[A-Za-z0-9_:]+$/.test(s);

  const tokens = amenities.split("|").map((s) => s.trim()).filter(Boolean);
  const plainValues: string[] = [];
  const keyedValues: Record<string, string[]> = {};
  for (const tok of tokens) {
    const eq = tok.indexOf("=");
    if (eq > 0) {
      const key = tok.slice(0, eq).trim();
      const value = tok.slice(eq + 1).trim();
      if (key && value && isSafeKey(key)) {
        if (!keyedValues[key]) keyedValues[key] = [];
        keyedValues[key].push(escapeValue(value));
      }
    } else {
      plainValues.push(escapeValue(tok));
    }
  }

  const elementTypes = ["node", "way", "relation"] as const;
  const clauseFor = (key: string, valueRe: string) =>
    elementTypes.map(
      (el) => `${el}["${key}"~"^(${valueRe})$"](around:${radiusM},${lat},${lon});`
    );

  const clauseList: string[] = [];
  if (plainValues.length > 0) {
    const valueRe = plainValues.join("|");
    for (const key of OSM_POI_SEARCH_KEYS) clauseList.push(...clauseFor(key, valueRe));
  }
  for (const [key, values] of Object.entries(keyedValues)) {
    clauseList.push(...clauseFor(key, values.join("|")));
  }
  const clauses = clauseList.join("\n      ");
  const query = `
    [out:json][timeout:${timeout}];
    (
      ${clauses}
    );
    out center${limit > 0 ? ` ${Math.min(limit, 1000)}` : ""};
  `;

  try {
    const data = await fetchOverpass(query, timeoutMs);
    const elements = Array.isArray(data.elements) ? data.elements : [];

    const items = elements
      .map((elem: OsmPlace): OsmPlaceItem | null => {
        let itemLat = elem.lat;
        let itemLon = elem.lon;

        // For ways and relations, use center if available. Use == null (not
        // falsy) checks so lat/lon 0 (equator / prime meridian) stay valid.
        if (itemLat == null && elem.center) {
          itemLat = elem.center.lat;
          itemLon = elem.center.lon;
        }

        if (itemLat == null || itemLon == null || !Number.isFinite(itemLat) || !Number.isFinite(itemLon)) {
          return null;
        }

        const tags = elem.tags || {};
        const name = tags.name || tags.operator || "POI";
        const phone = tags.phone;
        const website = tags.website;
        const email = tags.email;
        const openingHours = tags.opening_hours;
        // Primary type comes from whichever supported key this element was
        // matched on (a bakery is shop=bakery, a castle historic=castle, etc.).
        const primaryType =
          tags.amenity || tags.tourism || tags.shop || tags.historic || tags.leisure;

        const primaryContact: ContactInfo = {
          phone: phone ? [{ value: phone }] : undefined,
          www: website ? [{ value: website }] : undefined,
          email: email ? [{ value: email }] : undefined,
        };
        const hasContactData = Boolean(primaryContact.phone || primaryContact.www || primaryContact.email);

        return {
          id: `${elem.type}/${elem.id}`,
          title: name,
          position: { lat: itemLat, lng: itemLon },
          categories: [
            {
              id: primaryType || "poi",
              name: primaryType || "Point of Interest",
            },
          ],
          contacts: hasContactData ? [primaryContact] : undefined,
          openingHours: openingHours ? [{ text: [openingHours] }] : undefined,
          address: {
            label: [tags.street, tags.housenumber].filter(Boolean).join(" "),
            street: tags.street,
            houseNumber: tags.housenumber,
            city: tags.city || tags.town || tags.village,
            countryName: tags.country,
          },
          tags,
        };
      })
      .filter(Boolean) as OsmPlaceItem[];
    // The query already caps results server-side ("out center N"); this slice
    // is only a safety net for over-returning mirrors. limit <= 0 means
    // unlimited (the query is built uncapped), so don't slice to zero.
    return limit > 0 ? items.slice(0, limit) : items;
  } catch (err) {
    // fetchOverpass throws Error("Timeout") — match case-insensitively.
    if (err instanceof Error && /timeout/i.test(err.message)) {
      throw new Error("Overpass Places timeout");
    }
    throw err;
  }
}

// ── Helpers to extract data from OsmPlaceItem ─────────────────────────────────

export function osmItemPrimaryCategory(item: OsmPlaceItem): string | undefined {
  const cat = item.categories?.[0];
  return (cat?.id || cat?.name || "").trim() || undefined;
}

function getPrimaryContact(item: OsmPlaceItem): ContactInfo | undefined {
  return item.contacts?.[0];
}

export function osmItemPhone(item: OsmPlaceItem): string | undefined {
  return getPrimaryContact(item)?.phone?.[0]?.value?.trim() || undefined;
}

export function osmItemWebsite(item: OsmPlaceItem): string | undefined {
  return getPrimaryContact(item)?.www?.[0]?.value?.trim() || undefined;
}

export function osmItemEmail(item: OsmPlaceItem): string | undefined {
  return getPrimaryContact(item)?.email?.[0]?.value?.trim() || undefined;
}

export function osmItemOpeningHours(item: OsmPlaceItem): string | undefined {
  const text = item.openingHours?.[0]?.text ?? [];
  const joined = text.join(" · ").trim();
  return joined || undefined;
}

// ── Fuel & parking tag extraction (MC screen) ─────────────────────────────────

/** OSM tag values that mean a fuel type is available at the station. */
const FUEL_AVAILABLE_VALUES = new Set(["yes", "true", "1", "only"]);

/** Human-readable labels for common OSM `fuel:*` tag suffixes. */
const FUEL_LABELS: Record<string, string> = {
  diesel: "Diesel",
  biodiesel: "Biodiesel",
  gtl_diesel: "GTL Diesel",
  hgv_diesel: "HGV Diesel",
  lpg: "LPG",
  cng: "CNG",
  lng: "LNG",
  e5: "E5",
  e10: "E10",
  e85: "E85",
  adblue: "AdBlue",
  electricity: "Electric",
  hydrogen: "Hydrogen",
  kerosene: "Kerosene",
  octane_91: "91",
  octane_92: "92",
  octane_95: "95",
  octane_98: "98",
  octane_100: "100",
};

/**
 * Extract available fuel types from a fuel station's OSM `fuel:*` tags
 * (e.g. `fuel:diesel=yes`, `fuel:octane_95=yes`). Returns undefined when none
 * are tagged.
 */
export function osmItemFuelTypes(item: OsmPlaceItem): string[] | undefined {
  const tags = item.tags;
  if (!tags) return undefined;
  const types: string[] = [];
  for (const [key, value] of Object.entries(tags)) {
    if (!key.startsWith("fuel:")) continue;
    if (!FUEL_AVAILABLE_VALUES.has(value.trim().toLowerCase())) continue;
    const suffix = key.slice("fuel:".length).toLowerCase();
    const label =
      FUEL_LABELS[suffix] ??
      suffix.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (label && !types.includes(label)) types.push(label);
  }
  return types.length > 0 ? types : undefined;
}

/** Whether a parking OSM item is explicitly free to use (`fee=no`). */
export function osmItemIsFreeParking(item: OsmPlaceItem): boolean {
  return item.tags?.fee?.trim().toLowerCase() === "no";
}


