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

// ── Restaurants POI tab ───────────────────────────────────────────────────────

const SEARCH_QUERY = "restaurant|cafe|fast_food|bar|pub|bakery|ice_cream|food_court";

const CATEGORY_LABEL: Record<string, string> = {
  restaurant: "🍽️ Restaurant",
  cafe: "☕ Café",
  fast_food: "🍔 Fast Food",
  bar: "🍺 Bar",
  pub: "🍻 Pub",
  food_court: "🏪 Food Court",
  ice_cream: "🍦 Ice Cream",
  bakery: "🥐 Bakery",
};

const formatCategory = (category: string) =>
  CATEGORY_LABEL[category] ??
  `🍴 ${category
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")}`;

const CACHE_KEY = "cache_restaurants_v2";

const buildSearchQuery = () => SEARCH_QUERY;

const mapPlaceItem = (item: OsmPlaceItem, userLat: number, userLon: number): Place | null => {
  const lat = item.position?.lat;
  const lon = item.position?.lng;
  if (lat === undefined || lon === undefined) return null;
  const categoryRaw = (osmItemPrimaryCategory(item) || "restaurant").toLowerCase();
  const category =
    /^cafe$/.test(categoryRaw) ? "cafe" :
    /^fast_food$/.test(categoryRaw) ? "fast_food" :
    /^bar$/.test(categoryRaw) ? "bar" :
    /^pub$/.test(categoryRaw) ? "pub" :
    /^food_court$/.test(categoryRaw) ? "food_court" :
    /^ice_cream$/.test(categoryRaw) ? "ice_cream" :
    /^bakery$/.test(categoryRaw) ? "bakery" :
    "restaurant";
  return {
    id: item.id || `${lat},${lon},${item.title || "restaurant"}`,
    name: item.title || "Restaurant",
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

export default function RestaurantsScreen() {
  return (
    <POIScreen
      cacheKey={CACHE_KEY}
      buildSearchQuery={buildSearchQuery}
      mapPlaceItem={mapPlaceItem}
      i18nPrefix="food"
      formatCategoryLabel={formatCategory}
    />
  );
}
