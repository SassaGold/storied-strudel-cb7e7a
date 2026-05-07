import { Text, View } from "react-native";
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

// ── Hotels / Accommodation POI tab ────────────────────────────────────────────

const SEARCH_QUERY =
  "hotel motel hostel guest house apartment chalet resort campsite caravan park alpine hut villa bungalow";

const CACHE_KEY = "cache_hotels_v2";

const buildSearchQuery = () => SEARCH_QUERY;

const mapPlaceItem = (item: HerePlaceItem, userLat: number, userLon: number): Place | null => {
  const lat = item.position?.lat;
  const lon = item.position?.lng;
  if (lat === undefined || lon === undefined) return null;
  const categoryRaw = (hereItemPrimaryCategory(item) || "hotel").toLowerCase();
  const category =
    categoryRaw.includes("motel") ? "motel" :
    categoryRaw.includes("hostel") ? "hostel" :
    categoryRaw.includes("guest") ? "guest_house" :
    categoryRaw.includes("camp") ? "camp_site" :
    categoryRaw.includes("resort") ? "resort" :
    "hotel";
  return {
    id: item.id || `${lat},${lon},${item.title || "hotel"}`,
    name: item.title || "Accommodation",
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

export default function HotelsScreen() {
  const { t } = useTranslation();
  return (
    <POIScreen
      cacheKey={CACHE_KEY}
      buildSearchQuery={buildSearchQuery}
      mapPlaceItem={mapPlaceItem}
      i18nPrefix="sleep"
      renderExtraListTag={(place) =>
        place.stars ? (
          <Text style={{ color: "#ff6600", fontSize: 12, fontWeight: "700" }}>
            {place.stars}★
          </Text>
        ) : null
      }
      renderExtraModalRows={(place) =>
        place.stars ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Text style={{ color: "#666666", fontSize: 13 }}>{t("common.stars")}</Text>
            <Text style={{ color: "#c8c8c8", fontSize: 13, fontWeight: "500" }}>{place.stars}★</Text>
          </View>
        ) : null
      }
    />
  );
}
