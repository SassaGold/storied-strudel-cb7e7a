// ── Shared POI-fetch hook ─────────────────────────────────────────────────────
// Encapsulates the identical data-fetching and state-management logic that was
// previously copy-pasted across restaurants.tsx, hotels.tsx and attractions.tsx.

import { useCallback, useRef, useState } from "react";
import { Linking } from "react-native";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useSettings } from "./settings";
import { fetchOverpass, parseWikiTag, OverpassElement } from "./overpass";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage: any = (() => { try { return require("@react-native-async-storage/async-storage").default; } catch { return null; } })();

/** How many results to show initially and on each "Load More" tap. */
const PAGE_SIZE = 20;

// ── Shared Place type ─────────────────────────────────────────────────────────

export type Place = {
  id: string;
  name: string;
  category: string;
  distanceMeters?: number;
  latitude: number;
  longitude: number;
  /** Hotel star rating, e.g. "4" */
  stars?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  openingHours?: string;
  wikipedia?: string;
};

// ── Hook types ────────────────────────────────────────────────────────────────

/**
 * Builds a complete Overpass QL query string for the given user position and
 * search radius (in metres).  Defined at module level so the reference is
 * stable and won't trigger extra re-renders.
 */
export type BuildOverpassQuery = (
  lat: number,
  lon: number,
  radiusM: number
) => string;

/**
 * Maps a single raw Overpass element to a Place.  Returns null when the
 * element lacks valid coordinates and should be skipped.
 */
export type MapElement = (
  element: OverpassElement,
  userLat: number,
  userLon: number
) => Place | null;

export interface UsePOIFetchOptions {
  cacheKey: string;
  buildOverpassQuery: BuildOverpassQuery;
  mapElement: MapElement;
  /** i18n key for the location-permission error message */
  locationErrorKey: string;
  /** i18n key for the generic load-failure error message */
  loadErrorKey: string;
}

export interface UsePOIFetchResult {
  /** Visible page of results (up to `visibleCount` items). */
  places: Place[];
  /** Total number of results fetched (may be > places.length when paginated). */
  totalFound: number;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  /**
   * Unix timestamp (ms) of when the currently-displayed data was cached.
   * Present whenever `fromCache` is true so the UI can show "last updated X min ago".
   */
  cacheTimestamp: number | null;
  /**
   * True when a background refresh failed but stale cached data is still visible.
   * The UI should show an "offline" indicator rather than a hard error.
   */
  refreshError: boolean;
  userLocation: { latitude: number; longitude: number } | null;
  infoPlace: Place | null;
  wikiExtract: string | null;
  wikiLoading: boolean;
  loadPlaces: () => Promise<void>;
  /**
   * Clears the local cache entry and starts a fully-fresh network search,
   * skipping the stale-data pre-fill so the user sees clean loading state.
   * Use this when the user has moved significantly and wants results for
   * their new location rather than the previously-cached area.
   */
  forceFetch: () => Promise<void>;
  /** Reveal the next page of already-fetched results. */
  loadMore: () => void;
  openInMaps: (place: Place) => void;
  openInfo: (place: Place) => void;
  closeInfo: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePOIFetch({
  cacheKey,
  buildOverpassQuery,
  mapElement,
  locationErrorKey,
  loadErrorKey,
}: UsePOIFetchOptions): UsePOIFetchResult {
  const { t } = useTranslation("common");
  const { settings } = useSettings();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // All fetched results sorted by distance
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  // How many results to expose to the UI (pagination)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [infoPlace, setInfoPlace] = useState<Place | null>(null);
  const [wikiExtract, setWikiExtract] = useState<string | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [fromCache, setFromCache] = useState(false);
  /** Unix timestamp (ms) of the cache entry currently displayed. */
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(null);
  /** True when the background refresh failed but we still have stale data. */
  const [refreshError, setRefreshError] = useState(false);

  // AbortController ref for request deduplication (#6): cancels any in-flight
  // Overpass request before starting a new one so rapid taps don't race.
  const abortRef = useRef<AbortController | null>(null);

  const loadPlaces = useCallback(async () => {
    // Cancel any in-flight request before starting a fresh one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Show last-known cached results immediately while re-fetching.
    // The TTL check is intentionally removed here: stale data is always
    // better than nothing — we show it and refresh in the background.
    let hadCachedData = false;
    try {
      const raw = await AsyncStorage?.getItem(cacheKey);
      if (raw) {
        const { ts, data }: { ts: number; data: Place[] } = JSON.parse(raw);
        if (data?.length > 0) {
          setAllPlaces(data);
          setVisibleCount(PAGE_SIZE);
          setFromCache(true);
          setCacheTimestamp(ts);
          hadCachedData = true;
        }
      }
    } catch (e) {
      console.warn("[usePOIFetch] cache read error:", e);
    }

    setLoading(true);
    setError(null);
    setRefreshError(false);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError(t(locationErrorKey));
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;
      setUserLocation({ latitude, longitude });

      const radiusM = settings.searchRadiusKm * 1000;
      const overpassQuery = buildOverpassQuery(latitude, longitude, radiusM);

      // Overpass API (OpenStreetMap) — free place/POI data, no API key required
      const data = await fetchOverpass(overpassQuery, undefined, controller.signal);

      const mapped = data.elements
        .map((el) => mapElement(el, latitude, longitude))
        .filter(Boolean) as Place[];

      const sorted = mapped
        .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));

      setAllPlaces(sorted);
      setVisibleCount(PAGE_SIZE);
      setFromCache(false);
      setCacheTimestamp(null);
      try {
        await AsyncStorage?.setItem(
          cacheKey,
          JSON.stringify({ ts: Date.now(), data: sorted })
        );
      } catch (e) {
        console.warn("[usePOIFetch] cache write error:", e);
      }
    } catch (e) {
      if (e instanceof Error && (e.name === "AbortError" || e.message === "Cancelled")) {
        return; // Silently ignore cancellation
      }
      console.warn("[usePOIFetch] load error:", e);
      if (hadCachedData) {
        // Stale data is already visible — set the offline flag instead of
        // replacing the list with a hard error message.
        setRefreshError(true);
      } else {
        setError(t(loadErrorKey));
      }
    } finally {
      setLoading(false);
    }
  }, [t, settings.searchRadiusKm, cacheKey, buildOverpassQuery, mapElement, locationErrorKey, loadErrorKey]);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  const forceFetch = useCallback(async () => {
    // Delete the cached entry so `loadPlaces` starts with a blank slate —
    // no stale data is pre-filled and the user sees a clean loading state.
    try {
      await AsyncStorage?.removeItem(cacheKey);
    } catch (e) {
      console.warn("[usePOIFetch] cache clear error:", e);
    }
    setAllPlaces([]);
    setFromCache(false);
    setCacheTimestamp(null);
    setRefreshError(false);
    await loadPlaces();
  }, [cacheKey, loadPlaces]);

  const openInMaps = useCallback((place: Place) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
    Linking.openURL(url).catch((e) => console.warn("[usePOIFetch] openInMaps error:", e));
  }, []);

  const openInfo = useCallback((place: Place) => {
    setInfoPlace(place);
    setWikiExtract(null);
    if (place.wikipedia) {
      setWikiLoading(true);
      const { lang, title } = parseWikiTag(place.wikipedia);
      // Wikipedia REST API — free, no API key required
      fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
      )
        .then((r) => r.json())
        .then((d: { extract?: string }) => setWikiExtract((d.extract || "").trim() || null))
        .catch((e) => { console.warn("[usePOIFetch] wikipedia error:", e); setWikiExtract(null); })
        .finally(() => setWikiLoading(false));
    }
  }, []);

  const closeInfo = useCallback(() => {
    setInfoPlace(null);
    setWikiExtract(null);
  }, []);

  return {
    places: allPlaces.slice(0, visibleCount),
    totalFound: allPlaces.length,
    loading,
    error,
    fromCache,
    cacheTimestamp,
    refreshError,
    userLocation,
    infoPlace,
    wikiExtract,
    wikiLoading,
    loadPlaces,
    forceFetch,
    loadMore,
    openInMaps,
    openInfo,
    closeInfo,
  };
}
