// ── lib/useEmergencyPlaces.ts ─────────────────────────────────────────────────
// Data-fetching hook for the Emergency (SOS) screen.
// Encapsulates location, HERE Places POI query, caching and state management.

import { useCallback, useRef, useState } from "react";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { haversineMeters, withRetry, CACHE_TTL_MS } from "./overpass";
import { fetchHereDiscover, type HerePlaceItem, hereItemOpeningHours, hereItemPhone, hereItemWebsite } from "./herePlaces";
import {
  EMERGENCY_SEARCH_RADIUS_M,
  EMERGENCY_MAX_RESULTS,
  EMERGENCY_MAX_DISPLAY,
  HERE_DEFAULT_TIMEOUT_MS,
} from "./config";
import { useLocationPermission } from "./locationPermission";

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
const EMERGENCY_CATEGORY_RULES: Array<{ key: string; category: string }> = [
  { key: "hospital", category: "hospital" },
  { key: "clinic", category: "clinic" },
  { key: "doctor", category: "doctors" },
  { key: "pharmacy", category: "pharmacy" },
  { key: "police", category: "police" },
  { key: "fire station", category: "fire_station" },
  { key: "ambulance", category: "ambulance_station" },
];
const EMERGENCY_CATEGORY_TITLE_PATTERNS = EMERGENCY_CATEGORY_RULES.map((rule) => ({
  ...rule,
  pattern: new RegExp(
    `\\b${rule.key
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+")}\\b`,
    "i"
  ),
}));

// ── Types ─────────────────────────────────────────────────────────────────────

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
 * Uses HERE Places discover API for emergency-location discovery.
 */
export function useEmergencyPlaces() {
  const { t } = useTranslation();
  const { requestForegroundPermission } = useLocationPermission();

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
      const perm = await requestForegroundPermission();
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

      const items = await withRetry(() =>
        fetchHereDiscover(
          "hospital clinic doctor pharmacy police fire station ambulance",
          latitude,
          longitude,
          EMERGENCY_SEARCH_RADIUS_M,
          EMERGENCY_MAX_RESULTS,
          HERE_DEFAULT_TIMEOUT_MS
        )
      );
      if (activeCallRef.current !== callId) return;

      const mapEmergencyCategory = (item: HerePlaceItem): string => {
        const categoryFields = (item.categories ?? [])
          .flatMap((c) => [c.id, c.name])
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          .map((v) => v.toLowerCase().replace(/_/g, " "));
        for (const rule of EMERGENCY_CATEGORY_RULES) {
          if (categoryFields.some((value) => value.includes(rule.key))) {
            return rule.category;
          }
        }

        const title = (item.title || "").toLowerCase();
        for (const rule of EMERGENCY_CATEGORY_TITLE_PATTERNS) {
          if (rule.pattern.test(title)) {
            return rule.category;
          }
        }
        return "other";
      };

      const mapped = items
        .map((item) => {
          const lat = item.position?.lat;
          const lon = item.position?.lng;
          if (lat === undefined || lon === undefined) return null;
          return {
            id: item.id || `${lat},${lon},${item.title || "emergency"}`,
            name: item.title || "Emergency Service",
            category: mapEmergencyCategory(item),
            latitude: lat,
            longitude: lon,
            distanceMeters: haversineMeters(latitude, longitude, lat, lon),
            phone: hereItemPhone(item),
            address: item.address?.label,
            openingHours: hereItemOpeningHours(item),
            website: hereItemWebsite(item),
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
