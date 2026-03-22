// ── lib/useEmergencyPlaces.ts ─────────────────────────────────────────────────
// Data-fetching hook for the Emergency (SOS) screen.
// Encapsulates location, Overpass POI query, caching and state management.

import { useCallback, useRef, useState } from "react";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { haversineMeters, fetchOverpass, CACHE_TTL_MS } from "./overpass";
import {
  EMERGENCY_SEARCH_RADIUS_M,
  EMERGENCY_MAX_RESULTS,
  EMERGENCY_MAX_DISPLAY,
  EMERGENCY_AMENITY_TYPES,
} from "./config";

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
  /** Unix timestamp (ms) of the cache hit, or null if data is fresh. */
  const [cacheTs, setCacheTs] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Generation counter — incremented on each new call and on cancel.
  const activeCallRef = useRef(0);

  const cancelSearch = useCallback(() => {
    activeCallRef.current += 1;
    setLoading(false);
  }, []);

  const loadPlaces = useCallback(async () => {
    const callId = (activeCallRef.current += 1);

    // Show cached results immediately while fetching fresh data
    try {
      const raw = await AsyncStorage?.getItem(CACHE_KEY);
      if (activeCallRef.current !== callId) return;
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
          setCacheTs(ts);
        }
      }
    } catch {}

    if (activeCallRef.current !== callId) return;
    setLoading(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (activeCallRef.current !== callId) return;
      if (perm.status !== "granted") {
        setError(t("sos.locationError"));
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (activeCallRef.current !== callId) return;
      const { latitude, longitude } = pos.coords;
      setUserLocation({ latitude, longitude });

      const overpassQuery = `
[out:json][timeout:30];
(
  node(around:${EMERGENCY_SEARCH_RADIUS_M},${latitude},${longitude})[amenity~"${EMERGENCY_AMENITY_TYPES}"];
  way(around:${EMERGENCY_SEARCH_RADIUS_M},${latitude},${longitude})[amenity~"${EMERGENCY_AMENITY_TYPES}"];
  relation(around:${EMERGENCY_SEARCH_RADIUS_M},${latitude},${longitude})[amenity~"${EMERGENCY_AMENITY_TYPES}"];
);
out center ${EMERGENCY_MAX_RESULTS};`;

      const data = await fetchOverpass(overpassQuery);
      if (activeCallRef.current !== callId) return;

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
        .slice(0, EMERGENCY_MAX_DISPLAY);

      setPlaces(sorted);
      setFromCache(false);
      setCacheTs(null);
      try {
        await AsyncStorage?.setItem(
          CACHE_KEY,
          JSON.stringify({ ts: Date.now(), data: sorted })
        );
      } catch {}
    } catch (err) {
      if (activeCallRef.current !== callId) return;
      const isNetwork = err instanceof TypeError && String(err).includes("fetch");
      setError(isNetwork ? t("sos.networkError") : t("sos.loadError"));
    } finally {
      if (activeCallRef.current === callId) setLoading(false);
    }
  }, [t]);

  return { loading, error, places, fromCache, cacheTs, userLocation, loadPlaces, cancelSearch };
}
