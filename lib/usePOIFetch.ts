// ── Shared POI-fetch hook ─────────────────────────────────────────────────────
// Encapsulates the identical data-fetching and state-management logic that was
// previously copy-pasted across restaurants.tsx, hotels.tsx and attractions.tsx.

import { useCallback, useState } from "react";
import { Linking } from "react-native";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useSettings } from "./settings";
import { fetchOverpass, CACHE_TTL_MS, parseWikiTag } from "./overpass";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage: any = (() => { try { return require("@react-native-async-storage/async-storage").default; } catch { return null; } })();

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
  element: any,
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
  places: Place[];
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  userLocation: { latitude: number; longitude: number } | null;
  infoPlace: Place | null;
  wikiExtract: string | null;
  wikiLoading: boolean;
  loadPlaces: () => Promise<void>;
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
  const { t } = useTranslation();
  const { settings } = useSettings();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [infoPlace, setInfoPlace] = useState<Place | null>(null);
  const [wikiExtract, setWikiExtract] = useState<string | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const loadPlaces = useCallback(async () => {
    // Show last-known cached results immediately while re-fetching
    try {
      const raw = await AsyncStorage?.getItem(cacheKey);
      if (raw) {
        const { ts, data }: { ts: number; data: Place[] } = JSON.parse(raw);
        if (data?.length > 0 && Date.now() - ts < CACHE_TTL_MS) {
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
      const data = await fetchOverpass(overpassQuery);
      if (!data.elements) {
        setPlaces([]);
        return;
      }

      const mapped = (data.elements as any[])
        .map((el) => mapElement(el, latitude, longitude))
        .filter(Boolean) as Place[];

      const sorted = mapped
        .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
        .slice(0, 20);

      setPlaces(sorted);
      setFromCache(false);
      try {
        await AsyncStorage?.setItem(
          cacheKey,
          JSON.stringify({ ts: Date.now(), data: sorted })
        );
      } catch {}
    } catch {
      setError(t(loadErrorKey));
    } finally {
      setLoading(false);
    }
  }, [t, settings.searchRadiusKm, cacheKey, buildOverpassQuery, mapElement, locationErrorKey, loadErrorKey]);

  const openInMaps = useCallback((place: Place) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
    Linking.openURL(url).catch(() => null);
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
        .then((d) => setWikiExtract((d.extract || "").trim() || null))
        .catch(() => setWikiExtract(null))
        .finally(() => setWikiLoading(false));
    }
  }, []);

  const closeInfo = useCallback(() => {
    setInfoPlace(null);
    setWikiExtract(null);
  }, []);

  return {
    places,
    loading,
    error,
    fromCache,
    userLocation,
    infoPlace,
    wikiExtract,
    wikiLoading,
    loadPlaces,
    openInMaps,
    openInfo,
    closeInfo,
  };
}
