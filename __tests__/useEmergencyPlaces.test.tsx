// ── useEmergencyPlaces hook tests ─────────────────────────────────────────────
// Exercises the SOS data hook: category mapping, fresh-cache display, the
// stale-cache fallback on failed refreshes (safety-critical), radius
// expansion, and error classification.

import { renderHook, act } from "@testing-library/react-native";
import * as Location from "expo-location";
import { useEmergencyPlaces, type EmergencyPlace } from "../lib/useEmergencyPlaces";
import { getCurrentPositionWithTimeout } from "../lib/location";
import { fetchOsmPlaces } from "../lib/osmPlaces";
import { readTimedCache, writeTimedCache } from "../lib/storage";
import { CACHE_TTL_MS } from "../lib/overpass";
import {
  EMERGENCY_SEARCH_RADIUS_M,
  EMERGENCY_EXPANDED_SEARCH_RADIUS_M,
} from "../lib/config";

const mockRequestPermission = jest.fn();

jest.mock("../lib/locationPermission", () => ({
  useLocationPermission: () => ({
    requestForegroundPermission: mockRequestPermission,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("../lib/location", () => ({
  getCurrentPositionWithTimeout: jest.fn(),
}));

jest.mock("../lib/osmPlaces", () => ({
  ...jest.requireActual("../lib/osmPlaces"),
  fetchOsmPlaces: jest.fn(),
}));

jest.mock("../lib/storage", () => ({
  readTimedCache: jest.fn(),
  writeTimedCache: jest.fn().mockResolvedValue(undefined),
  storage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

// Run withRetry without back-off delays so failure paths don't slow the suite.
jest.mock("../lib/overpass", () => ({
  ...jest.requireActual("../lib/overpass"),
  withRetry: jest.fn(<T,>(fn: () => Promise<T>) => fn()),
}));

jest.mock("expo-location", () => ({
  hasServicesEnabledAsync: jest.fn(),
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5 },
}));

const mockedFetchOsmPlaces = fetchOsmPlaces as jest.Mock;
const mockedReadCache = readTimedCache as jest.Mock;
const mockedPosition = getCurrentPositionWithTimeout as jest.Mock;
const mockedServicesEnabled = Location.hasServicesEnabledAsync as jest.Mock;

// User position for all tests; item positions offset northwards so the
// real haversine distance sorts them deterministically.
const USER = { latitude: 59.9, longitude: 10.75 };

const osmItem = (
  id: string,
  latOffset: number,
  extra: Record<string, unknown> = {}
) => ({
  id,
  title: `Item ${id}`,
  position: { lat: USER.latitude + latOffset, lng: USER.longitude },
  ...extra,
});

const cachedPlace = (id: string): EmergencyPlace => ({
  id,
  name: `Cached ${id}`,
  category: "hospital",
  latitude: USER.latitude,
  longitude: USER.longitude,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedReadCache.mockResolvedValue(null);
  mockRequestPermission.mockResolvedValue({ status: "granted" });
  mockedServicesEnabled.mockResolvedValue(true);
  mockedPosition.mockResolvedValue({ coords: USER });
});

describe("useEmergencyPlaces", () => {
  it("maps OSM categories and title keywords onto emergency categories", async () => {
    mockedFetchOsmPlaces.mockResolvedValue([
      osmItem("h", 0.001, { categories: [{ id: "hospital", name: "Hospital" }] }),
      // No category data — classified from the title.
      osmItem("p", 0.002, { title: "Oslo Police Station" }),
      // Underscore ids are normalized before matching.
      osmItem("f", 0.003, { categories: [{ id: "fire_station" }] }),
      osmItem("x", 0.004, { title: "Somewhere Else" }),
    ]);

    const { result } = await renderHook(() => useEmergencyPlaces());
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(result.current.places.map((p) => [p.id, p.category])).toEqual([
      ["h", "hospital"],
      ["p", "police"],
      ["f", "fire_station"],
      ["x", "other"],
    ]);
    expect(result.current.error).toBeNull();
    expect(writeTimedCache).toHaveBeenCalled();
  });

  it("shows a fresh cache immediately, then replaces it with fetched data", async () => {
    mockedReadCache.mockResolvedValue({
      data: [cachedPlace("old")],
      ts: Date.now() - 1000, // well within CACHE_TTL_MS
    });
    mockedFetchOsmPlaces.mockResolvedValue([
      osmItem("fresh", 0.001, { categories: [{ id: "hospital" }] }),
    ]);

    const { result } = await renderHook(() => useEmergencyPlaces());
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(result.current.places.map((p) => p.id)).toEqual(["fresh"]);
    expect(result.current.fromCache).toBe(false);
    expect(result.current.cacheTs).toBeNull();
  });

  it("falls back to an expired cache when the refresh fails", async () => {
    const staleTs = Date.now() - CACHE_TTL_MS * 10;
    mockedReadCache.mockResolvedValue({
      data: [cachedPlace("stale")],
      ts: staleTs,
    });
    mockedFetchOsmPlaces.mockRejectedValue(new Error("Network error"));

    const { result } = await renderHook(() => useEmergencyPlaces());
    await act(async () => {
      await result.current.loadPlaces();
    });

    // Outdated nearby hospitals still beat an empty SOS list.
    expect(result.current.places.map((p) => p.id)).toEqual(["stale"]);
    expect(result.current.fromCache).toBe(true);
    expect(result.current.cacheTs).toBe(staleTs);
    expect(result.current.error).toBeNull();
  });

  it("classifies a network failure without any cache as a network error", async () => {
    mockedFetchOsmPlaces.mockRejectedValue(new Error("Network error"));

    const { result } = await renderHook(() => useEmergencyPlaces());
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(result.current.places).toEqual([]);
    expect(result.current.error).toBe("sos.networkError");
  });

  it("classifies a non-network failure as a load error", async () => {
    mockedFetchOsmPlaces.mockRejectedValue(new Error("boom"));

    const { result } = await renderHook(() => useEmergencyPlaces());
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(result.current.error).toBe("sos.loadError");
  });

  it("reports the location error when permission is denied", async () => {
    mockRequestPermission.mockResolvedValue({ status: "denied" });

    const { result } = await renderHook(() => useEmergencyPlaces());
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(result.current.error).toBe("sos.locationError");
    expect(mockedFetchOsmPlaces).not.toHaveBeenCalled();
  });

  it("expands the search radius when nothing is found nearby", async () => {
    mockedFetchOsmPlaces
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        osmItem("far", 0.2, { categories: [{ id: "hospital" }] }),
      ]);

    const { result } = await renderHook(() => useEmergencyPlaces());
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(mockedFetchOsmPlaces).toHaveBeenCalledTimes(2);
    expect(mockedFetchOsmPlaces.mock.calls[0][3]).toBe(EMERGENCY_SEARCH_RADIUS_M);
    expect(mockedFetchOsmPlaces.mock.calls[1][3]).toBe(EMERGENCY_EXPANDED_SEARCH_RADIUS_M);
    expect(result.current.places.map((p) => p.id)).toEqual(["far"]);
  });
});
