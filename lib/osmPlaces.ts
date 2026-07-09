import { fetchOverpass } from "./overpass";

// ── OSM data types ─────────────────────────────────────────────────────────────
const MIN_OVERPASS_TIMEOUT_SECONDS = 10;

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

  // Build Overpass query for amenities within radius
  const query = `
    [out:json][timeout:${timeout}];
    (
      node["amenity"~"^(${amenities})$"](around:${radiusM},${lat},${lon});
      way["amenity"~"^(${amenities})$"](around:${radiusM},${lat},${lon});
      relation["amenity"~"^(${amenities})$"](around:${radiusM},${lat},${lon});
      node["tourism"~"^(${amenities})$"](around:${radiusM},${lat},${lon});
      way["tourism"~"^(${amenities})$"](around:${radiusM},${lat},${lon});
      relation["tourism"~"^(${amenities})$"](around:${radiusM},${lat},${lon});
    );
    out center${limit > 0 ? ` ${Math.min(limit, 1000)}` : ""};
  `;

  try {
    const data = await fetchOverpass(query, timeoutMs);
    const elements = Array.isArray(data.elements) ? data.elements : [];

    return elements
      .slice(0, limit)
      .map((elem: OsmPlace): OsmPlaceItem | null => {
        let itemLat = elem.lat;
        let itemLon = elem.lon;

        // For ways and relations, use center if available
        if (!itemLat && elem.center) {
          itemLat = elem.center.lat;
          itemLon = elem.center.lon;
        }

        if (!itemLat || !itemLon) return null;

        const tags = elem.tags || {};
        const name = tags.name || tags.operator || "POI";
        const phone = tags.phone;
        const website = tags.website;
        const email = tags.email;
        const openingHours = tags.opening_hours;

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
              id: tags.amenity || tags.tourism || "poi",
              name: tags.amenity || tags.tourism || "Point of Interest",
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
  } catch (err) {
    if (err instanceof Error && err.message.includes("timeout")) {
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


