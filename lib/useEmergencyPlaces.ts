// ── lib/useEmergencyPlaces.ts ─────────────────────────────────────────────────
// Data-fetching hook for the Emergency (SOS) screen.
// Encapsulates location, Overpass/OSM POI query, caching and state management.

import { useCallback, useRef, useState } from "react";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { haversineMeters, isOverpassNetworkError, withRetry, CACHE_TTL_MS } from "./overpass";
import { fetchOsmPlaces, type OsmPlaceItem, osmItemOpeningHours, osmItemPhone, osmItemWebsite } from "./osmPlaces";
import {
  EMERGENCY_AMENITY_TYPES,
  EMERGENCY_SEARCH_RADIUS_M,
  EMERGENCY_EXPANDED_SEARCH_RADIUS_M,
  EMERGENCY_MAX_RESULTS,
  EMERGENCY_MAX_DISPLAY,
  OVERPASS_DEFAULT_TIMEOUT_MS,
  OVERPASS_RETRY_ATTEMPTS,
} from "./config";
import { useLocationPermission } from "./locationPermission";
import { rescopeCachedPlaces } from "./usePOIFetch";
import { readTimedCache, writeTimedCache } from "./storage";
import { getPositionAllowingStale } from "./location";

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
      .replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
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
 * Uses OSM/Overpass for emergency-location discovery.
 */
export function useEmergencyPlaces() {
  const { t } = useTranslation();
  const { requestForegroundPermission } = useLocationPermission();

  const [loading, setLoading] = useState(false);
  // What failed, not the message for it — translated at render below, so an
  // error already on screen re-localizes when the user switches language.
  const [errorKind, setErrorKind] = useState<"location" | "network" | "load" | null>(null);
  const [places, setPlaces] = useState<EmergencyPlace[]>([]);
  const [fromCache, setFromCache] = useState(false);
  /** Unix timestamp (ms) of the cache hit, or null if data is fresh. */
  const [cacheTs, setCacheTs] = useState<number | null>(null);
  /** Age of the position these distances were measured from, when it is not current. */
  const [staleFixAgeMs, setStaleFixAgeMs] = useState<number | null>(null);
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

    // Retain the last cached results (even if expired) so that, on the
    // safety-critical SOS tab, a failed refresh can still show something.
    let staleData: EmergencyPlace[] | null = null;
    let staleTs = 0;
    // Where the rider is, once known — the yardstick for any cached result.
    let here: { latitude: number; longitude: number } | null = null;

    // Show cached results immediately while fetching fresh data.
    // Infinity TTL: even an expired entry is kept as the stale fallback;
    // freshness for display is checked against CACHE_TTL_MS below.
    const hit = await readTimedCache<EmergencyPlace>(CACHE_KEY, Infinity);
    if (activeCallRef.current !== callId) return;
    if (hit) {
      staleData = hit.data;
      staleTs = hit.ts;
    }
    // Deliberately NOT painted here. Cached distances were measured wherever
    // the last search ran, and on this screen "nearest hospital 200 m" for one
    // 120 km behind is the worst possible lie. Shown below, re-measured, once
    // the position is known.

    if (activeCallRef.current !== callId) return;
    setLoading(true);
    setErrorKind(null);
    setStaleFixAgeMs(null);
    try {
      const perm = await requestForegroundPermission();
      if (activeCallRef.current !== callId) return;
      if (perm.status !== "granted") {
        setErrorKind("location");
        return;
      }

      // Distinguish "location services off" from other failures so the user
      // gets a clear message instead of an opaque error.
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (activeCallRef.current !== callId) return;
      if (!servicesEnabled) {
        setErrorKind("location");
        return;
      }

      // Unlike the other screens this one accepts an old fix rather than
      // refusing it. A rider who needs the nearest hospital is usually stopped,
      // and a position from a few minutes ago still points rescue at roughly the
      // right place — whereas "couldn't get your location" points them nowhere.
      // The age is surfaced instead, so the distances are read for what they are.
      const { position: pos, ageMs: fixAgeMs, stale: fixStale } =
        await getPositionAllowingStale({ accuracy: Location.Accuracy.Balanced });
      if (activeCallRef.current !== callId) return;
      setStaleFixAgeMs(fixStale ? fixAgeMs : null);
      const { latitude, longitude } = pos.coords;
      setUserLocation({ latitude, longitude });
      here = { latitude, longitude };

      // Results already on screen live in state across navigations, so they
      // need the same re-measure as the cache — a failed refresh must not
      // leave the previous town's "nearest hospital" standing at its old
      // distance (the Karlstad-list-in-Årjäng bug of 2026-08-01, on SOS).
      setPlaces((prev) =>
        prev.length
          ? rescopeCachedPlaces(prev, latitude, longitude, EMERGENCY_EXPANDED_SEARCH_RADIUS_M)
          : prev
      );

      // Position known — a still-fresh cache can now be shown honestly, with
      // distances re-measured from here and anything left behind dropped.
      if (staleData && Date.now() - staleTs < CACHE_TTL_MS) {
        const rescoped = rescopeCachedPlaces(
          staleData, latitude, longitude, EMERGENCY_EXPANDED_SEARCH_RADIUS_M
        );
        if (rescoped.length > 0) {
          setPlaces(rescoped);
          setFromCache(true);
          setCacheTs(staleTs);
        }
      }

      const mapEmergencyCategory = (item: OsmPlaceItem): string => {
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

      // Fetch emergency amenities within a given radius and map them to places.
      const fetchWithinRadius = async (radiusM: number): Promise<EmergencyPlace[]> => {
        // OVERPASS_RETRY_ATTEMPTS (not the default 3): fetchOsmPlaces already
        // cycles Overpass mirrors internally, so retries compound.
        const items = await withRetry(
          () =>
            fetchOsmPlaces(
              EMERGENCY_AMENITY_TYPES,
              latitude,
              longitude,
              radiusM,
              EMERGENCY_MAX_RESULTS,
              OVERPASS_DEFAULT_TIMEOUT_MS
            ),
          OVERPASS_RETRY_ATTEMPTS
        );
        return items
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
              phone: osmItemPhone(item),
              address: item.address?.label,
              openingHours: osmItemOpeningHours(item),
              website: osmItemWebsite(item),
            } as EmergencyPlace;
          })
          .filter(Boolean) as EmergencyPlace[];
      };

      let mapped = await fetchWithinRadius(EMERGENCY_SEARCH_RADIUS_M);
      if (activeCallRef.current !== callId) return;

      // Nothing nearby — widen the search so rural users still get results.
      if (mapped.length === 0) {
        mapped = await fetchWithinRadius(EMERGENCY_EXPANDED_SEARCH_RADIUS_M);
        if (activeCallRef.current !== callId) return;
      }

      const sorted = mapped
        .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
        .slice(0, EMERGENCY_MAX_DISPLAY);

      setPlaces(sorted);
      setFromCache(false);
      setCacheTs(null);
      await writeTimedCache(CACHE_KEY, sorted);
    } catch (err) {
      if (activeCallRef.current !== callId) return;
      // Fall back to expired cache rather than leaving the SOS list empty when
      // the network fails — outdated nearby hospitals still beat nothing.
      //
      // Gated on `here`: an out-of-date hospital that is genuinely close by is
      // useful, one 120 km away presented as "nearest" is dangerous. Without a
      // position we cannot tell the two apart, so we show neither.
      const rescopedStale = staleData && here
        ? rescopeCachedPlaces(staleData, here.latitude, here.longitude, EMERGENCY_EXPANDED_SEARCH_RADIUS_M)
        : [];
      if (rescopedStale.length > 0) {
        setPlaces(rescopedStale);
        setFromCache(true);
        setCacheTs(staleTs);
      } else {
        // fetchOverpass normalizes failures to Error("Network error"/"Timeout");
        // a raw fetch TypeError is also possible from other call paths.
        const isNetwork =
          isOverpassNetworkError(err) ||
          (err instanceof TypeError && String(err).includes("fetch"));
        setErrorKind(isNetwork ? "network" : "load");
      }
    } finally {
      if (activeCallRef.current === callId) setLoading(false);
    }
  }, []);

  const error =
    errorKind === "location"
      ? t("sos.locationError")
      : errorKind === "network"
        ? t("sos.networkError")
        : errorKind === "load"
          ? t("sos.loadError")
          : null;

  return { loading, error, places, fromCache, cacheTs, staleFixAgeMs, userLocation, loadPlaces, cancelSearch };
}
