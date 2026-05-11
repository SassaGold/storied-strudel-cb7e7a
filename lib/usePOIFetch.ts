// ── Shared POI data-fetching hook ────────────────────────────────────────────
// Used by restaurants, hotels, attractions, and mc tabs.
// Encapsulates: state management, AsyncStorage caching, location permission,
// Overpass API fetching, distance sorting, Google Maps navigation, and the
// Wikipedia info modal fetch.

import * as Location from "expo-location";
import { useCallback, useRef, useState } from "react";
import { Linking } from "react-native";
import { OVERPASS_DEFAULT_TIMEOUT_MS, POI_MAX_DISPLAY, WIKIPEDIA_SUMMARY_URL } from "./config";
import { fetchOsmPlaces, type OsmPlaceItem } from "./osmPlaces";
import { useLocationPermission } from "./locationPermission";
import { CACHE_TTL_MS, parseWikiTag, withRetry } from "./overpass";

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

/** Builds an Overpass amenity filter string (pipe-separated tags) from coordinates and radius.
 * The coordinates and radius are provided but buildSearchQuery can ignore them for static queries. */
export type BuildSearchQuery = (lat: number, lon: number, radiusM: number) => string;

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
  const [error, setError] = useState<string | null>(null);
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
      locationErrorMsg,
      loadErrorMsg,
      searchRadiusKm,
      fetchTimeoutMs = OVERPASS_DEFAULT_TIMEOUT_MS,
      fetchLimit = 120,
    } = optionsRef.current;

    // Serve cached data immediately so the user sees something while refreshing.
    try {
      const raw = await AsyncStorage?.getItem(cacheKey);
      if (activeCallRef.current !== callId) return;
      if (raw) {
        const parsed = JSON.parse(raw);
        const ts: number = parsed?.ts;
        const data: Place[] = parsed?.data;
        if (Array.isArray(data) && data.length > 0 && typeof ts === "number" && Date.now() - ts < CACHE_TTL_MS) {
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
      const permission = await requestForegroundPermission();
      if (activeCallRef.current !== callId) return;
      if (permission.status !== "granted") {
        setError(locationErrorMsg);
        return;
      }

      // Check whether the device's location services are enabled even when the
      // app already has permission. getCurrentPositionAsync() throws an opaque
      // error when they are off; checking here gives a clearer signal.
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (activeCallRef.current !== callId) return;
      if (!servicesEnabled) {
        setError(locationErrorMsg);
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (activeCallRef.current !== callId) return;

      const { latitude, longitude } = position.coords;
      setUserLocation({ latitude, longitude });

      const radiusM = searchRadiusKm * 1000;
      const amenities = buildSearchQuery(latitude, longitude, radiusM);
      const items = await withRetry(
        () => fetchOsmPlaces(amenities, latitude, longitude, radiusM, fetchLimit, fetchTimeoutMs)
      );
      if (activeCallRef.current !== callId) return;

      const mapped = items
        .map((item) => mapPlaceItem(item, latitude, longitude))
        .filter(Boolean) as Place[];

      const sorted = mapped
        .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
        .slice(0, POI_MAX_DISPLAY);

      setPlaces(sorted);
      setFromCache(false);
      setCacheTs(null);
      try {
        await AsyncStorage?.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: sorted }));
      } catch {}
    } catch (err) {
      if (activeCallRef.current !== callId) return;
      console.error("[usePOIFetch] loadPlaces failed:", err);
      setError(loadErrorMsg);
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
    setInfoPlace(place);
    setWikiExtract(null);
    if (place.wikipedia) {
      setWikiLoading(true);
      const { lang, title } = parseWikiTag(place.wikipedia);
      // Wikipedia REST API — free, no API key required
      fetch(WIKIPEDIA_SUMMARY_URL(lang, title))
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
    setError,
    loadPlaces,
    cancelSearch,
    openInMaps,
    openInfo,
  };
}
