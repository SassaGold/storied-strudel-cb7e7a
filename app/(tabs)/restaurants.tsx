import { useTranslation } from "react-i18next";
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

// ── Restaurants POI tab ───────────────────────────────────────────────────────

const SEARCH_QUERY = "restaurant cafe fast food bar pub bakery ice cream food court";

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

const mapPlaceItem = (item: HerePlaceItem, userLat: number, userLon: number): Place | null => {
  const lat = item.position?.lat;
  const lon = item.position?.lng;
  if (lat === undefined || lon === undefined) return null;
  const categoryRaw = (hereItemPrimaryCategory(item) || "restaurant").toLowerCase();
  const category =
    /\bcafe\b/.test(categoryRaw) ? "cafe" :
    /\bfast[_\s-]?food\b/.test(categoryRaw) ? "fast_food" :
    /\bbar\b/.test(categoryRaw) ? "bar" :
    /\bpub\b/.test(categoryRaw) ? "pub" :
    /\bfood[_\s-]?court\b/.test(categoryRaw) ? "food_court" :
    /\bice[_\s-]?cream\b/.test(categoryRaw) ? "ice_cream" :
    /\bbakery\b/.test(categoryRaw) ? "bakery" :
    "restaurant";
  return {
    id: item.id || `${lat},${lon},${item.title || "restaurant"}`,
    name: item.title || "Restaurant",
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

export default function RestaurantsScreen() {
  const { t } = useTranslation();
  return (
    <POIScreen
      cacheKey={CACHE_KEY}
      buildSearchQuery={buildSearchQuery}
      mapPlaceItem={mapPlaceItem}
      i18nPrefix="food"
      formatCategoryLabel={(cat) => t(`food.categories.${cat}`, { defaultValue: formatCategory(cat) })}
    />
  );
}
