// ── lib/useEmergencyPlaces.ts ─────────────────────────────────────────────────
// Data-fetching hook for the Emergency (SOS) screen.
// Encapsulates location, Overpass POI query, caching and state management.

import { useCallback, useState } from "react";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { haversineMeters, fetchOverpass, CACHE_TTL_MS } from "./overpass";

// ── AsyncStorage — safe require ───────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage: any = (() => {
  try {
    return require("@react-native-async-storage/async-storage").default;
  } catch {
    return null;
  }
})();

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_KEY = "cache_emergency_v2";
const MAX_RESULTS = 80;
const AMENITY_TYPES =
  "hospital|police|fire_station|pharmacy|clinic|doctors|ambulance_station";

// ── Types ─────────────────────────────────────────────────────────────────────

type OverpassElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type EmergencyPlace = {
  id: string;
  name: string;
  category: string;
  distanceMeters?: number;
  latitude: number;
  longitude: number;
  website?: string;
  phone?: string;
  address?: string;
  openingHours?: string;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Manages fetching, caching and state for emergency services POIs.
 * Uses fetchOverpass (multi-mirror with per-endpoint timeout) for resilience.
 */
export function useEmergencyPlaces() {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<EmergencyPlace[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const loadPlaces = useCallback(async () => {
    // Show cached results immediately while fetching fresh data
    try {
      const raw = await AsyncStorage?.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const ts: number = parsed?.ts;
        const data: EmergencyPlace[] = parsed?.data;
        if (
          Array.isArray(data) &&
          data.length > 0 &&
          typeof ts === "number" &&
          Date.now() - ts < CACHE_TTL_MS
        ) {
          setPlaces(data);
          setFromCache(true);
        }
      }
    } catch {}

    setLoading(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setError(t("sos.locationError"));
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;
      setUserLocation({ latitude, longitude });

      const overpassQuery = `
[out:json][timeout:30];
(
  node(around:10000,${latitude},${longitude})[amenity~"${AMENITY_TYPES}"];
  way(around:10000,${latitude},${longitude})[amenity~"${AMENITY_TYPES}"];
  relation(around:10000,${latitude},${longitude})[amenity~"${AMENITY_TYPES}"];
);
out center ${MAX_RESULTS};`;

      const data = await fetchOverpass(overpassQuery);

      if (!data.elements) {
        setPlaces([]);
        return;
      }

      const mapped = (data.elements as OverpassElement[])
        .map((el) => {
          const lat = el.lat ?? el.center?.lat;
          const lon = el.lon ?? el.center?.lon;
          if (lat === undefined || lon === undefined) return null;
          const tags = el.tags ?? {};
          return {
            id: String(el.id),
            name: tags.name || tags.amenity || "Emergency Service",
            category: tags.amenity || "other",
            latitude: lat,
            longitude: lon,
            distanceMeters: haversineMeters(latitude, longitude, lat, lon),
            phone:
              (
                tags.phone ||
                tags["contact:phone"] ||
                tags["contact:mobile"] ||
                ""
              ).trim() || undefined,
            address:
              [
                tags["addr:housenumber"],
                tags["addr:street"],
                tags["addr:city"],
              ]
                .filter(Boolean)
                .join(" ") || undefined,
            openingHours: (tags.opening_hours || "").trim() || undefined,
            website:
              (tags.website || tags["contact:website"] || "").trim() ||
              undefined,
          } as EmergencyPlace;
        })
        .filter(Boolean) as EmergencyPlace[];

      const sorted = mapped
        .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
        .slice(0, 40);

      setPlaces(sorted);
      setFromCache(false);
      try {
        await AsyncStorage?.setItem(
          CACHE_KEY,
          JSON.stringify({ ts: Date.now(), data: sorted })
        );
      } catch {}
    } catch (err) {
      const isNetwork = err instanceof TypeError && String(err).includes("fetch");
      setError(isNetwork ? t("sos.networkError") : t("sos.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  return { loading, error, places, fromCache, userLocation, loadPlaces };
}
