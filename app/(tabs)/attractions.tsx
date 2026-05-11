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

const CACHE_KEY = "cache_attractions_v2";
const SEARCH_QUERY = "attraction|museum|viewpoint|castle|monument|artwork|zoo|theme_park|historic|memorial";

const buildSearchQuery = () => SEARCH_QUERY;

const mapPlaceItem = (item: OsmPlaceItem, userLat: number, userLon: number): Place | null => {
  const lat = item.position?.lat;
  const lon = item.position?.lng;
  if (lat === undefined || lon === undefined) return null;
  const category = (osmItemPrimaryCategory(item) || "attraction").toLowerCase();
  return {
    id: item.id || `${lat},${lon},${item.title || "attraction"}`,
    name: item.title || "Attraction",
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
    />
  );
}
