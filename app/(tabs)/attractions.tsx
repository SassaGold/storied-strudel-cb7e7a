import POIScreen from "../../components/POIScreen";
import { haversineMeters } from "../../lib/overpass";
import type { Place } from "../../lib/usePOIFetch";

// ── Attractions POI tab ───────────────────────────────────────────────────────

const CACHE_KEY = "cache_attractions_v2";

const buildOverpassQuery = (lat: number, lon: number, radiusM: number) => `
[out:json][timeout:25];
(
  node(around:${radiusM},${lat},${lon})[tourism~"attraction|museum|viewpoint|castle|monument|artwork|zoo|theme_park"];
  way(around:${radiusM},${lat},${lon})[tourism~"attraction|museum|viewpoint|castle|monument|artwork|zoo|theme_park"];
  relation(around:${radiusM},${lat},${lon})[tourism~"attraction|museum|viewpoint|castle|monument|artwork|zoo|theme_park"];
  node(around:${radiusM},${lat},${lon})[historic~"monument|castle|ruins|memorial"];
  way(around:${radiusM},${lat},${lon})[historic~"monument|castle|ruins|memorial"];
  relation(around:${radiusM},${lat},${lon})[historic~"monument|castle|ruins|memorial"];
);
out center 120;`;

const mapElement = (element: any, userLat: number, userLon: number): Place | null => {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const tags = element.tags ?? {};
  return {
    id: String(element.id),
    name: tags.name || tags.tourism || tags.historic || "Attraction",
    category: tags.tourism || tags.historic || "attraction",
    latitude: lat,
    longitude: lon,
    distanceMeters: haversineMeters(userLat, userLon, lat, lon),
    website: (tags.website || tags["contact:website"] || "").trim() || undefined,
    phone: (tags.phone || tags["contact:phone"] || "").trim() || undefined,
    email: (tags.email || tags["contact:email"] || "").trim() || undefined,
    address: [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean).join(" ") || undefined,
    openingHours: (tags.opening_hours || "").trim() || undefined,
    wikipedia: (tags.wikipedia || "").trim() || undefined,
  };
};

export default function AttractionsScreen() {
  return (
    <POIScreen
      cacheKey={CACHE_KEY}
      buildOverpassQuery={buildOverpassQuery}
      mapElement={mapElement}
      i18nPrefix="explore"
    />
  );
}
