import POIScreen from "../../components/POIScreen";
import { haversineMeters } from "../../lib/overpass";
import type { Place } from "../../lib/usePOIFetch";
import {
  type HerePlaceItem,
  hereItemEmail,
  hereItemOpeningHours,
  hereItemPhone,
  hereItemPrimaryCategory,
  hereItemWebsite,
} from "../../lib/herePlaces";

// ── Attractions POI tab ───────────────────────────────────────────────────────

const CACHE_KEY = "cache_attractions_v2";

const buildSearchQuery = (_lat: number, _lon: number, _radiusM: number) =>
  "attraction museum viewpoint castle monument artwork zoo theme park historic site";

const mapPlaceItem = (item: HerePlaceItem, userLat: number, userLon: number): Place | null => {
  const lat = item.position?.lat;
  const lon = item.position?.lng;
  if (lat === undefined || lon === undefined) return null;
  const category = (hereItemPrimaryCategory(item) || "attraction").toLowerCase();
  return {
    id: item.id || `${lat},${lon},${item.title || "attraction"}`,
    name: item.title || "Attraction",
    category,
    latitude: lat,
    longitude: lon,
    distanceMeters: haversineMeters(userLat, userLon, lat, lon),
    website: hereItemWebsite(item),
    phone: hereItemPhone(item),
    email: hereItemEmail(item),
    address: item.address?.label,
    openingHours: hereItemOpeningHours(item),
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
