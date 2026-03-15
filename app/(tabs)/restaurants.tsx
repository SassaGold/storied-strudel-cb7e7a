import { useTranslation } from "react-i18next";
import { haversineMeters } from "../../lib/overpass";
import { usePOIFetch } from "../../lib/usePOIFetch";
import type { BuildOverpassQuery, MapElement } from "../../lib/usePOIFetch";
import POIScreen from "../../components/POIScreen";

// ── Screen-specific configuration ────────────────────────────────────────────

const AMENITY_TYPES =
  "restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|bakery";

const CACHE_KEY = "cache_restaurants_v2";

const categoryLabel: Record<string, string> = {
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
  categoryLabel[category] ??
  `🍴 ${category
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")}`;

// Defined at module level so the reference is stable across renders.
const buildOverpassQuery: BuildOverpassQuery = (lat, lon, radiusM) => `
[out:json][timeout:25];
(
  node(around:${radiusM},${lat},${lon})[amenity~"${AMENITY_TYPES}"];
  way(around:${radiusM},${lat},${lon})[amenity~"${AMENITY_TYPES}"];
  relation(around:${radiusM},${lat},${lon})[amenity~"${AMENITY_TYPES}"];
);
out center 120;`;

const mapElement: MapElement = (element, userLat, userLon) => {
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
    address:
      [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]]
        .filter(Boolean)
        .join(" ") || undefined,
    openingHours: (tags.opening_hours || "").trim() || undefined,
    wikipedia: (tags.wikipedia || "").trim() || undefined,
  };
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RestaurantsScreen() {
  const { t } = useTranslation();
  const poi = usePOIFetch({
    cacheKey: CACHE_KEY,
    buildOverpassQuery,
    mapElement,
    locationErrorKey: "food.locationError",
    loadErrorKey: "food.loadError",
  });

  return (
    <POIScreen
      {...poi}
      onLoad={poi.loadPlaces}
      onLoadMore={poi.loadMore}
      onOpenInMaps={poi.openInMaps}
      onOpenInfo={poi.openInfo}
      onCloseInfo={poi.closeInfo}
      i18nPrefix="food"
      categoryLabel={(c) =>
        t(`food.categories.${c}`, { defaultValue: formatCategory(c) })
      }
    />
  );
}
