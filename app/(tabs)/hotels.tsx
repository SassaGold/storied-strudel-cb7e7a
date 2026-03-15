import { haversineMeters } from "../../lib/overpass";
import { usePOIFetch } from "../../lib/usePOIFetch";
import type { BuildOverpassQuery, MapElement } from "../../lib/usePOIFetch";
import POIScreen from "../../components/POIScreen";

// ── Screen-specific configuration ────────────────────────────────────────────

const ACCOMMODATION_TYPES =
  "hotel|motel|hostel|guest_house|apartment|chalet|resort|camp_site|caravan_site|alpine_hut|wilderness_hut|villa|bungalow";

const CACHE_KEY = "cache_hotels_v2";

// Defined at module level so the reference is stable across renders.
const buildOverpassQuery: BuildOverpassQuery = (lat, lon, radiusM) => `
[out:json][timeout:25];
(
  node(around:${radiusM},${lat},${lon})[tourism~"${ACCOMMODATION_TYPES}"];
  way(around:${radiusM},${lat},${lon})[tourism~"${ACCOMMODATION_TYPES}"];
  relation(around:${radiusM},${lat},${lon})[tourism~"${ACCOMMODATION_TYPES}"];
);
out center 120;`;

const mapElement: MapElement = (element, userLat, userLon) => {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const tags = element.tags ?? {};
  return {
    id: String(element.id),
    name: tags.name || tags.tourism || "Accommodation",
    category: tags.tourism || "hotel",
    latitude: lat,
    longitude: lon,
    distanceMeters: haversineMeters(userLat, userLon, lat, lon),
    stars: tags.stars || tags["stars:official"] || undefined,
    website: (tags.website || tags["contact:website"] || "").trim() || undefined,
    phone: (tags.phone || tags["contact:phone"] || "").trim() || undefined,
    email: (tags.email || tags["contact:email"] || "").trim() || undefined,
    address:
      [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]]
        .filter(Boolean)
        .join(" ") || undefined,
    openingHours: (tags.opening_hours || "").trim() || undefined,
    wikipedia: (tags.wikipedia || "").trim() || undefined,
  };
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HotelsScreen() {
  const poi = usePOIFetch({
    cacheKey: CACHE_KEY,
    buildOverpassQuery,
    mapElement,
    locationErrorKey: "sleep.locationError",
    loadErrorKey: "sleep.loadError",
  });

  return (
    <POIScreen
      {...poi}
      onLoad={poi.loadPlaces}
      onOpenInMaps={poi.openInMaps}
      onOpenInfo={poi.openInfo}
      onCloseInfo={poi.closeInfo}
      i18nPrefix="sleep"
    />
  );
}
