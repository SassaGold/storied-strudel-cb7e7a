import POIScreen from "../../components/POIScreen";
import {
    type OsmPlaceItem,
    osmItemEmail,
    osmItemOpeningHours,
    osmItemPhone,
    osmItemPrimaryCategory,
    osmItemWebsite,
} from "../../lib/osmPlaces";
import { haversineMeters } from "../../lib/overpass";
import type { Place } from "../../lib/usePOIFetch";

// ── Attractions POI tab ───────────────────────────────────────────────────────

const CACHE_KEY = "cache_attractions_v3";
const SEARCH_QUERY = "attraction|museum|viewpoint|castle|monument|artwork|zoo|theme_park|historic|memorial";

const buildSearchQuery = () => SEARCH_QUERY;

/** Emoji + readable name for common attraction OSM values. */
const CATEGORY_LABEL: Record<string, string> = {
  attraction: "🎡 Attraction",
  museum: "🏛️ Museum",
  gallery: "🖼️ Gallery",
  artwork: "🎨 Artwork",
  viewpoint: "🔭 Viewpoint",
  zoo: "🦁 Zoo",
  theme_park: "🎢 Theme Park",
  castle: "🏰 Castle",
  fort: "🏰 Fort",
  monument: "🗿 Monument",
  memorial: "🕯️ Memorial",
  ruins: "🏚️ Ruins",
  park: "🌳 Park",
};

/** Title-case a raw OSM value, e.g. "theme_park" → "Theme Park". */
const titleCase = (raw: string) =>
  raw.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const formatCategory = (category: string) =>
  CATEGORY_LABEL[category] ?? `📍 ${titleCase(category)}`;

const mapPlaceItem = (item: OsmPlaceItem, userLat: number, userLon: number): Place | null => {
  const lat = item.position?.lat;
  const lon = item.position?.lng;
  if (lat === undefined || lon === undefined) return null;
  const category = (osmItemPrimaryCategory(item) || "attraction").toLowerCase();
  // fetchOsmPlaces uses "POI" as the generic no-name fallback; show the readable
  // category name instead (e.g. "Artwork") so unnamed sights aren't just "POI".
  const hasName = item.title && item.title !== "POI";
  return {
    id: item.id || `${lat},${lon},${item.title || category}`,
    name: hasName ? item.title! : titleCase(category),
    category,
    latitude: lat,
    longitude: lon,
    distanceMeters: haversineMeters(userLat, userLon, lat, lon),
    website: osmItemWebsite(item),
    phone: osmItemPhone(item),
    email: osmItemEmail(item),
    address: item.address?.label,
    openingHours: osmItemOpeningHours(item),
  };
};

export default function AttractionsScreen() {
  return (
    <POIScreen
      cacheKey={CACHE_KEY}
      buildSearchQuery={buildSearchQuery}
      mapPlaceItem={mapPlaceItem}
      i18nPrefix="explore"
      formatCategoryLabel={formatCategory}
    />
  );
}
