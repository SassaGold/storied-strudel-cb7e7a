import { fetchOverpass } from "./overpass";

// ── OSM data types (replacing HERE types) ──────────────────────────────────────

export type OsmPlace = {
  type: string; // "node", "way", or "relation"
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type OsmPlaceItem = {
  id?: string;
  title?: string;
  position?: { lat: number; lng: number };
  categories?: Array<{ id?: string; name?: string }>;
  contacts?: { phone?: Array<{ value?: string }>; www?: Array<{ value?: string }>; email?: Array<{ value?: string }> };
  openingHours?: Array<{ text?: string[] }>;
  address?: {
    label?: string;
    street?: string;
    houseNumber?: string;
    city?: string;
    countryName?: string;
  };
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
  const radiusKm = Math.max(0.1, radiusM / 1000);
  const timeout = Math.max(10, Math.floor(timeoutMs / 1000));

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
    out center ${limit > 0 ? `limit ${Math.min(limit, 1000)}` : ""};
  `;

  try {
    const data = await fetchOverpass(query, timeoutMs);
    const elements = Array.isArray(data.elements) ? data.elements : [];
    
    return elements
      .slice(0, limit)
      .map((elem: OsmPlace): OsmPlaceItem | null => {
        let lat = elem.lat;
        let lon = elem.lon;
        
        // For ways and relations, use center if available
        if (!lat && elem.center) {
          lat = elem.center.lat;
          lon = elem.center.lon;
        }
        
        if (!lat || !lon) return null;
        
        const tags = elem.tags || {};
        const name = tags.name || tags.operator || "POI";
        const phone = tags.phone;
        const website = tags.website || tags.contact?.website;
        const email = tags.email || tags.contact?.email;
        const openingHours = tags.opening_hours;
        
        return {
          id: `${elem.type}/${elem.id}`,
          title: name,
          position: { lat, lng: lon },
          categories: [
            {
              id: tags.amenity || tags.tourism || "poi",
              name: tags.amenity || tags.tourism || "Point of Interest",
            },
          ],
          contacts: {
            phone: phone ? [{ value: phone }] : undefined,
            www: website ? [{ value: website }] : undefined,
            email: email ? [{ value: email }] : undefined,
          },
          openingHours: openingHours ? [{ text: [openingHours] }] : undefined,
          address: {
            label: [tags.street, tags.housenumber].filter(Boolean).join(" "),
            street: tags.street,
            houseNumber: tags.housenumber,
            city: tags.city || tags.town || tags.village,
            countryName: tags.country,
          },
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

// ── Helpers to extract data from OsmPlaceItem (replaces HERE helpers) ───────────

export function osmItemPrimaryCategory(item: OsmPlaceItem): string | undefined {
  const cat = item.categories?.[0];
  return (cat?.id || cat?.name || "").trim() || undefined;
}

export function osmItemPhone(item: OsmPlaceItem): string | undefined {
  return item.contacts?.phone?.[0]?.value?.trim() || undefined;
}

export function osmItemWebsite(item: OsmPlaceItem): string | undefined {
  return item.contacts?.www?.[0]?.value?.trim() || undefined;
}

export function osmItemEmail(item: OsmPlaceItem): string | undefined {
  return item.contacts?.email?.[0]?.value?.trim() || undefined;
}

export function osmItemOpeningHours(item: OsmPlaceItem): string | undefined {
  const text = item.openingHours?.[0]?.text ?? [];
  const joined = text.join(" · ").trim();
  return joined || undefined;
}

// ── Re-export for backward compatibility ───────────────────────────────────────

export type HerePlaceItem = OsmPlaceItem;
export const fetchHereDiscover = fetchOsmPlaces;
export const hereItemPrimaryCategory = osmItemPrimaryCategory;
export const hereItemPhone = osmItemPhone;
export const hereItemWebsite = osmItemWebsite;
export const hereItemEmail = osmItemEmail;
export const hereItemOpeningHours = osmItemOpeningHours;

