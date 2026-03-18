// ── Shared POI data-fetching hook ────────────────────────────────────────────
// Used by restaurants, hotels, attractions, and mc tabs.
// Encapsulates: state management, AsyncStorage caching, location permission,
// Overpass API fetching, distance sorting, Google Maps navigation, and the
// Wikipedia info modal fetch.

import { useCallback, useRef, useState } from "react";
import { Linking } from "react-native";
import * as Location from "expo-location";
import { fetchOverpass, CACHE_TTL_MS, parseWikiTag } from "./overpass";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage: any = (() => { try { return require("@react-native-async-storage/async-storage").default; } catch { return null; } })();

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

/** Builds an Overpass QL query string from the user's coordinates and radius. */
export type BuildOverpassQuery = (lat: number, lon: number, radiusM: number) => string;

/** Maps a single raw Overpass element to a Place, or returns null to discard it. */
export type MapElement = (element: any, userLat: number, userLon: number) => Place | null;

export interface UsePOIFetchOptions {
  cacheKey: string;
  buildOverpassQuery: BuildOverpassQuery;
  mapElement: MapElement;
  locationErrorMsg: string;
  loadErrorMsg: string;
  searchRadiusKm: number;
  fetchTimeoutMs?: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Shared hook for all POI screens.
 * Manages state, caching, GPS location, Overpass fetch, and info-modal wiki lookup.
 */
export function usePOIFetch(options: UsePOIFetchOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [infoPlace, setInfoPlace] = useState<Place | null>(null);
  const [wikiExtract, setWikiExtract] = useState<string | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [fromCache, setFromCache] = useState(false);

  // Keep a stable ref to the latest options so loadPlaces never becomes stale.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const loadPlaces = useCallback(async () => {
    const {
      cacheKey,
      buildOverpassQuery,
      mapElement,
      locationErrorMsg,
      loadErrorMsg,
      searchRadiusKm,
      fetchTimeoutMs = 40_000,
    } = optionsRef.current;

    // Serve cached data immediately so the user sees something while refreshing.
    try {
      const raw = await AsyncStorage?.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const ts: number = parsed?.ts;
        const data: Place[] = parsed?.data;
        if (Array.isArray(data) && data.length > 0 && typeof ts === "number" && Date.now() - ts < CACHE_TTL_MS) {
          setPlaces(data);
          setFromCache(true);
        }
      }
    } catch {}

    setLoading(true);
    setError(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError(locationErrorMsg);
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = position.coords;
      setUserLocation({ latitude, longitude });

      const radiusM = searchRadiusKm * 1000;
      const query = buildOverpassQuery(latitude, longitude, radiusM);
      const data = await fetchOverpass(query, fetchTimeoutMs);

      const mapped = ((data.elements ?? []) as any[])
        .map((el) => mapElement(el, latitude, longitude))
        .filter(Boolean) as Place[];

      const sorted = mapped
        .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
        .slice(0, 30);

      setPlaces(sorted);
      setFromCache(false);
      try {
        await AsyncStorage?.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: sorted }));
      } catch {}
    } catch (err) {
      const suffix = err instanceof Error && err.message ? ` (${err.message})` : "";
      setError(loadErrorMsg + suffix);
    } finally {
      setLoading(false);
    }
  }, []);

  const openInMaps = useCallback((place: Place) => {
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
    ).catch(() => null);
  }, []);

  const openInfo = useCallback((place: Place) => {
    setInfoPlace(place);
    setWikiExtract(null);
    if (place.wikipedia) {
      setWikiLoading(true);
      const { lang, title } = parseWikiTag(place.wikipedia);
      // Wikipedia REST API — free, no API key required
      fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
        .then((r) => r.json())
        .then((d) => setWikiExtract((d.extract || "").trim() || null))
        .catch(() => setWikiExtract(null))
        .finally(() => setWikiLoading(false));
    }
  }, []);

  return {
    loading,
    error,
    places,
    fromCache,
    userLocation,
    infoPlace,
    wikiExtract,
    wikiLoading,
    viewMode,
    setViewMode,
    setInfoPlace,
    setWikiExtract,
    setPlaces,
    setError,
    loadPlaces,
    openInMaps,
    openInfo,
  };
}
