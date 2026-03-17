import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import POIScreen from "../../components/POIScreen";
import { haversineMeters } from "../../lib/overpass";
import type { Place } from "../../lib/usePOIFetch";

// ── Hotels / Accommodation POI tab ────────────────────────────────────────────

const ACCOMMODATION_TYPES =
  "hotel|motel|hostel|guest_house|apartment|chalet|resort|camp_site|caravan_site|alpine_hut|wilderness_hut|villa|bungalow";

const CACHE_KEY = "cache_hotels_v2";

const buildOverpassQuery = (lat: number, lon: number, radiusM: number) => `
[out:json][timeout:25];
(
  node(around:${radiusM},${lat},${lon})[tourism~"${ACCOMMODATION_TYPES}"];
  way(around:${radiusM},${lat},${lon})[tourism~"${ACCOMMODATION_TYPES}"];
  relation(around:${radiusM},${lat},${lon})[tourism~"${ACCOMMODATION_TYPES}"];
);
out center 120;`;

const mapElement = (element: any, userLat: number, userLon: number): Place | null => {
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
    address: [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean).join(" ") || undefined,
    openingHours: (tags.opening_hours || "").trim() || undefined,
    wikipedia: (tags.wikipedia || "").trim() || undefined,
  };
};

export default function HotelsScreen() {
  const { t } = useTranslation();
  return (
    <POIScreen
      cacheKey={CACHE_KEY}
      buildOverpassQuery={buildOverpassQuery}
      mapElement={mapElement}
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
