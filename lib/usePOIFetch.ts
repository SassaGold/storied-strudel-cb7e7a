// ── Shared POI data-fetching hook ────────────────────────────────────────────
// Used by restaurants, hotels, attractions, and mc tabs.
// Encapsulates: state management, AsyncStorage caching, location permission,
// Overpass API fetching, distance sorting, Google Maps navigation, and the
// Wikipedia info modal fetch.

import * as Location from "expo-location";
import { useCallback, useRef, useState } from "react";
import { Linking } from "react-native";
import { HTTP_FETCH_TIMEOUT_MS, OVERPASS_DEFAULT_TIMEOUT_MS, OVERPASS_RETRY_ATTEMPTS, POI_EXPANDED_RADIUS_FACTOR, POI_MAX_DISPLAY, POI_MAX_RADIUS_M, WIKIPEDIA_SUMMARY_URL } from "./config";
import { fetchOsmPlaces, type OsmPlaceItem } from "./osmPlaces";
import { useLocationPermission } from "./locationPermission";
import { CACHE_TTL_MS, fetchWithTimeout, haversineMeters, parseWikiTag, withRetry } from "./overpass";
import { readTimedCache, writeTimedCache } from "./storage";
import { getCurrentPositionWithTimeout } from "./location";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Place = {
  id: string;
  name: string;
  category: string;
  distanceMeters?: number;
  latitude: number;
  longitude: number;
  /** Star rating (hotels) */
  stars?: string;
  /** Short note shown in list (e.g. "Free parking" for MC parking) */
  note?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  openingHours?: string;
  wikipedia?: string;
  /** Fuel types available at a fuel station (MC tab) */
  fuelTypes?: string[];
};

/** Builds an Overpass amenity filter string (pipe-separated tags) from coordinates and radius.
 * The coordinates and radius are provided but buildSearchQuery can ignore them for static queries. */
export type BuildSearchQuery = (lat: number, lon: number, radiusM: number) => string;

/**
 * Search radii to try, in order, stopping at the first that returns anything.
 *
 * Replaces a single 4x expansion, which capped reach at 4x the user's setting —
 * so the default 5 km could never look past 20 km, and POI_MAX_RADIUS_M was
 * unreachable below a 25 km setting. Rural riders hit that ceiling constantly.
 *
 * Ascending and de-duplicated, so a user who has already set a wide radius does
 * not re-query the same circle twice, and nothing ever exceeds the cap.
 */
export const poiRadiusLadder = (baseRadiusM: number): number[] => {
  const ladder: number[] = [];
  for (const candidate of [
    baseRadiusM,
    baseRadiusM * POI_EXPANDED_RADIUS_FACTOR,
    baseRadiusM * POI_EXPANDED_RADIUS_FACTOR * 2.5,
    POI_MAX_RADIUS_M,
  ]) {
    const r = Math.round(Math.min(candidate, POI_MAX_RADIUS_M));
    if (r > (ladder[ladder.length - 1] ?? 0)) ladder.push(r);
  }
  return ladder;
};

/**
 * Re-measure cached places against where the rider is *now*, dropping the ones
 * that are no longer nearby.
 *
 * `distanceMeters` is baked into each Place when it is fetched, and the cache
 * key carries no location — so a cache written in one town is served unchanged
 * in the next one. Measured on a real ride 2026-07-31: stopped in Sigtuna, the
 * fuel list offered "OKQ8 — 10 m" for a station in Arboga, 123 km back down
 * the road. The age banner was honest; the distances were fiction, and distance
 * is the thing a rider acts on.
 *
 * Coordinates travel with each Place, so the distances can simply be recomputed.
 * Anything beyond the search radius is dropped rather than shown as far-away
 * clutter: the cache is knowledge about *here*, and when none of it is here any
 * more the honest answer is nothing.
 */
export const rescopeCachedPlaces = <T extends {
  latitude: number;
  longitude: number;
  distanceMeters?: number;
}>(
  places: T[],
  lat: number,
  lon: number,
  maxDistanceM: number
): T[] =>
  places
    .map((p) => ({
      ...p,
      distanceMeters: haversineMeters(lat, lon, p.latitude, p.longitude),
    }))
    .filter((p) => (p.distanceMeters ?? Infinity) <= maxDistanceM)
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));

/** Maps a single Overpass place item to a Place, or returns null to discard it. */
export type MapPlaceItem = (item: OsmPlaceItem, userLat: number, userLon: number) => Place | null;

export interface UsePOIFetchOptions {
  cacheKey: string;
  buildSearchQuery: BuildSearchQuery;
  mapPlaceItem: MapPlaceItem;
  locationErrorMsg: string;
  loadErrorMsg: string;
  searchRadiusKm: number;
  fetchTimeoutMs?: number;
  fetchLimit?: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Shared hook for all POI screens.
 * Manages state, caching, GPS location, Overpass Places fetch, and info-modal wiki lookup.
 */
export function usePOIFetch(options: UsePOIFetchOptions) {
  const [loading, setLoading] = useState(false);
  // What failed, not the message for it. The message is derived at render from
  // the current options, so an error already on screen re-localizes when the
  // user switches language — storing the resolved string kept it in whatever
  // language was active when the fetch failed.
  const [errorKind, setErrorKind] = useState<"location" | "load" | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [infoPlace, setInfoPlace] = useState<Place | null>(null);
  const [wikiExtract, setWikiExtract] = useState<string | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [fromCache, setFromCache] = useState(false);
  /** Unix timestamp (ms) of the cache hit, or null if data is fresh. */
  const [cacheTs, setCacheTs] = useState<number | null>(null);

  const { requestForegroundPermission } = useLocationPermission();

  // Keep a stable ref to the latest options so loadPlaces never becomes stale.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Generation counter — incremented on each new call and on cancel.
  // Allows in-flight calls to detect they've been superseded and bail out early.
  const activeCallRef = useRef(0);

  // Generation counter for the Wikipedia info fetch. Incremented every time the
  // info modal opens or closes so a slow response can't overwrite a newer place
  // (or repopulate a closed modal).
  const wikiCallRef = useRef(0);

  const cancelSearch = useCallback(() => {
    activeCallRef.current += 1;
    setLoading(false);
  }, []);

  const loadPlaces = useCallback(async () => {
    const callId = (activeCallRef.current += 1);

    const {
      cacheKey,
      buildSearchQuery,
      mapPlaceItem,
      searchRadiusKm,
      fetchTimeoutMs = OVERPASS_DEFAULT_TIMEOUT_MS,
      fetchLimit = 120,
    } = optionsRef.current;

    // Read the cache now, but do NOT paint it until we know where the rider is:
    // its distances were measured wherever the last search happened, which on a
    // ride can be a hundred kilometres back. Re-scoped below against the fresh
    // position; see rescopeCachedPlaces.
    const hit = await readTimedCache<Place>(cacheKey, CACHE_TTL_MS);
    if (activeCallRef.current !== callId) return;

    if (activeCallRef.current !== callId) return;
    setLoading(true);
    setErrorKind(null);

    // Where the rider actually is, once known — the yardstick any cached result
    // has to be re-measured against, including in the catch below.
    let here: { latitude: number; longitude: number } | null = null;

    try {
      const permission = await requestForegroundPermission();
      if (activeCallRef.current !== callId) return;
      if (permission.status !== "granted") {
        setErrorKind("location");
        return;
      }

      // Check whether the device's location services are enabled even when the
      // app already has permission. getCurrentPositionAsync() throws an opaque
      // error when they are off; checking here gives a clearer signal.
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (activeCallRef.current !== callId) return;
      if (!servicesEnabled) {
        setErrorKind("location");
        return;
      }

      const position = await getCurrentPositionWithTimeout({
        accuracy: Location.Accuracy.Balanced,
      });
      if (activeCallRef.current !== callId) return;

      const { latitude, longitude } = position.coords;
      setUserLocation({ latitude, longitude });
      here = { latitude, longitude };

      // Now that the position is known, the cache can be shown honestly:
      // distances re-measured from here, anything no longer nearby dropped.
      if (hit) {
        const rescoped = rescopeCachedPlaces(
          hit.data, latitude, longitude, searchRadiusKm * 1000
        );
        if (rescoped.length > 0) {
          setPlaces(rescoped);
          setFromCache(true);
          setCacheTs(hit.ts);
        }
      }

      // Fetch and map POIs within a given radius (metres).
      const fetchWithinRadius = async (radiusM: number): Promise<Place[]> => {
        const amenities = buildSearchQuery(latitude, longitude, radiusM);
        // OVERPASS_RETRY_ATTEMPTS (not the default 3): fetchOsmPlaces already
        // cycles Overpass mirrors internally, so retries compound.
        const items = await withRetry(
          () => fetchOsmPlaces(amenities, latitude, longitude, radiusM, fetchLimit, fetchTimeoutMs),
          OVERPASS_RETRY_ATTEMPTS
        );
        return items
          .map((item) => mapPlaceItem(item, latitude, longitude))
          .filter(Boolean) as Place[];
      };

      // Widen in steps until something turns up, rather than one 4x jump.
      // A single expansion capped at 4x the user's radius meant the default 5 km
      // setting could never look past 20 km, leaving POI_MAX_RADIUS_M (100 km)
      // unreachable unless someone had manually set 25 km or more. In sparse
      // country that is the difference between results and an empty screen:
      // measured at 58.92/14.44 in rural Sweden, a food search returns 0 places
      // at 5 km, 17 at 20 km and over a thousand at 100 km.
      //
      // Costs nothing in the common case — the loop stops at the first radius
      // that returns anything, which near a town is the first one.
      let mapped: Place[] = [];
      for (const radiusM of poiRadiusLadder(searchRadiusKm * 1000)) {
        mapped = await fetchWithinRadius(radiusM);
        if (activeCallRef.current !== callId) return;
        if (mapped.length > 0) break;
      }

      const sorted = mapped
        .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
        .slice(0, POI_MAX_DISPLAY);

      setPlaces(sorted);
      setFromCache(false);
      setCacheTs(null);
      await writeTimedCache(cacheKey, sorted);
    } catch (err) {
      if (activeCallRef.current !== callId) return;
      console.error("[usePOIFetch] loadPlaces failed:", err);
      setErrorKind("load");

      // Fall back to expired cache rather than showing the rider nothing.
      //
      // Overpass 504s under load — measured ~9 s per search, failing
      // intermittently — and on a roadside "here is what was nearby earlier"
      // beats an empty screen. Results are marked as cached with their real
      // timestamp, so the age is visible rather than implied.
      //
      // Only when nothing is displayed: never replace live results with older
      // ones, and never overwrite a fresher cache hit with a staler read.
      //
      // `here` gates it: without a position there is no way to know whether any
      // of this is nearby, and a confident list of far-away places is worse than
      // an empty one. That was the 123 km "OKQ8 — 10 m" of 2026-07-31.
      if (places.length === 0 && here) {
        try {
          const stale = await readTimedCache<Place>(cacheKey, Number.POSITIVE_INFINITY);
          if (stale && stale.data.length > 0 && activeCallRef.current === callId) {
            const rescoped = rescopeCachedPlaces(
              stale.data, here.latitude, here.longitude, searchRadiusKm * 1000
            );
            if (rescoped.length > 0) {
              setPlaces(rescoped);
              setFromCache(true);
              setCacheTs(stale.ts);
            }
          }
        } catch {
          // Cache unreadable too — the error message already stands.
        }
      }
    } finally {
      if (activeCallRef.current === callId) setLoading(false);
    }
  }, []);

  const openInMaps = useCallback((place: Place) => {
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
    ).catch(() => null);
  }, []);

  const openInfo = useCallback((place: Place) => {
    const callId = (wikiCallRef.current += 1);
    setInfoPlace(place);
    setWikiExtract(null);
    if (place.wikipedia) {
      setWikiLoading(true);
      const { lang, title } = parseWikiTag(place.wikipedia);
      // Wikipedia REST API — free, no API key required
      fetchWithTimeout(WIKIPEDIA_SUMMARY_URL(lang, title), {}, HTTP_FETCH_TIMEOUT_MS)
        .then((r) => {
          if (!r.ok) throw new Error(`Wikipedia HTTP ${r.status}`);
          return r.json();
        })
        .then((d) => {
          if (wikiCallRef.current !== callId) return;
          setWikiExtract((d.extract || "").trim() || null);
        })
        .catch(() => {
          if (wikiCallRef.current !== callId) return;
          setWikiExtract(null);
        })
        .finally(() => {
          if (wikiCallRef.current === callId) setWikiLoading(false);
        });
    }
  }, []);

  // Close the info modal and invalidate any in-flight Wikipedia fetch so its
  // late response can't repopulate the just-closed modal.
  const closeInfo = useCallback(() => {
    wikiCallRef.current += 1;
    setInfoPlace(null);
    setWikiExtract(null);
    setWikiLoading(false);
  }, []);

  const clearError = useCallback(() => setErrorKind(null), []);

  // Resolved from the options passed on *this* render, which the caller
  // re-translates every render — see the errorKind comment above.
  const error =
    errorKind === "location"
      ? options.locationErrorMsg
      : errorKind === "load"
        ? options.loadErrorMsg
        : null;

  return {
    loading,
    error,
    places,
    fromCache,
    cacheTs,
    userLocation,
    infoPlace,
    wikiExtract,
    wikiLoading,
    setInfoPlace,
    setWikiExtract,
    setPlaces,
    setFromCache,
    setCacheTs,
    clearError,
    loadPlaces,
    cancelSearch,
    openInMaps,
    openInfo,
    closeInfo,
  };
}
