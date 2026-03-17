import { useTranslation } from "react-i18next";
import POIScreen from "../../components/POIScreen";
import { haversineMeters } from "../../lib/overpass";
import type { Place } from "../../lib/usePOIFetch";

// ── Restaurants POI tab ───────────────────────────────────────────────────────

const AMENITY_TYPES =
  "restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|bakery";

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

const buildOverpassQuery = (lat: number, lon: number, radiusM: number) => `
[out:json][timeout:25];
(
  node(around:${radiusM},${lat},${lon})[amenity~"${AMENITY_TYPES}"];
  way(around:${radiusM},${lat},${lon})[amenity~"${AMENITY_TYPES}"];
  relation(around:${radiusM},${lat},${lon})[amenity~"${AMENITY_TYPES}"];
);
out center 120;`;

const mapElement = (element: any, userLat: number, userLon: number): Place | null => {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const tags = element.tags ?? {};
  return {
    id: String(element.id),
    name: tags.name || tags.amenity || "Restaurant",
    category: tags.amenity || "restaurant",
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

export default function RestaurantsScreen() {
  const { t } = useTranslation();
  return (
    <POIScreen
      cacheKey={CACHE_KEY}
      buildOverpassQuery={buildOverpassQuery}
      mapElement={mapElement}
      i18nPrefix="food"
      formatCategoryLabel={(cat) => t(`food.categories.${cat}`, { defaultValue: formatCategory(cat) })}
    />
  );
}
