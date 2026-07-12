// ── usePOIFetch hook tests ────────────────────────────────────────────────────
// Exercises the shared POI data-fetching hook with mocked location, storage
// and Overpass layers: cache serving, permission/service failures, radius
// expansion, sorting, error fallback, and cancellation.

import { renderHook, act, waitFor } from "@testing-library/react-native";
import * as Location from "expo-location";
import { usePOIFetch, type Place } from "../lib/usePOIFetch";
import { getCurrentPositionWithTimeout } from "../lib/location";
import { fetchOsmPlaces } from "../lib/osmPlaces";
import { readTimedCache, writeTimedCache } from "../lib/storage";

const mockRequestPermission = jest.fn();

jest.mock("../lib/locationPermission", () => ({
  useLocationPermission: () => ({
    requestForegroundPermission: mockRequestPermission,
  }),
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

// mapPlaceItem fixture: passes items through, using a `dist` field on the raw
// item as the distance so sorting is easy to assert.
const mapPlaceItem = (item: any): Place | null =>
  item.position
    ? {
        id: item.id,
        name: item.title,
        category: "restaurant",
        latitude: item.position.lat,
        longitude: item.position.lng,
        distanceMeters: item.dist,
      }
    : null;

const baseOptions = {
  cacheKey: "cache_test_v1",
  buildSearchQuery: () => "restaurant",
  mapPlaceItem,
  locationErrorMsg: "LOCATION_ERROR",
  loadErrorMsg: "LOAD_ERROR",
  searchRadiusKm: 5,
};

const osmItem = (id: string, dist: number) => ({
  id,
  title: `Place ${id}`,
  position: { lat: 59.9, lng: 10.7 },
  dist,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedReadCache.mockResolvedValue(null);
  mockRequestPermission.mockResolvedValue({ status: "granted" });
  mockedServicesEnabled.mockResolvedValue(true);
  mockedPosition.mockResolvedValue({
    coords: { latitude: 59.9139, longitude: 10.7522 },
  });
});

describe("usePOIFetch", () => {
  it("fetches, sorts by distance, caps state flags and writes the cache", async () => {
    mockedFetchOsmPlaces.mockResolvedValue([
      osmItem("far", 900),
      osmItem("near", 100),
      osmItem("mid", 400),
    ]);

    const { result } = await renderHook(() => usePOIFetch(baseOptions));
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(result.current.places.map((p) => p.id)).toEqual(["near", "mid", "far"]);
    expect(result.current.fromCache).toBe(false);
    expect(result.current.cacheTs).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.userLocation).toEqual({ latitude: 59.9139, longitude: 10.7522 });
    expect(writeTimedCache).toHaveBeenCalledWith(
      "cache_test_v1",
      expect.arrayContaining([expect.objectContaining({ id: "near" })])
    );
  });

  it("serves cached places immediately while the fresh fetch is in flight", async () => {
    const cachedPlace = { ...mapPlaceItem(osmItem("cached", 50))! };
    mockedReadCache.mockResolvedValue({ data: [cachedPlace], ts: 12345 });
    // Position never resolves — the fetch stays in flight.
    mockedPosition.mockReturnValue(new Promise(() => {}));

    const { result } = await renderHook(() => usePOIFetch(baseOptions));
    await act(async () => {
      result.current.loadPlaces();
    });

    await waitFor(() => {
      expect(result.current.places.map((p) => p.id)).toEqual(["cached"]);
    });
    expect(result.current.fromCache).toBe(true);
    expect(result.current.cacheTs).toBe(12345);
    expect(result.current.loading).toBe(true);

    // Cancelling clears the spinner without touching the cached rows.
    await act(async () => {
      result.current.cancelSearch();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.places.map((p) => p.id)).toEqual(["cached"]);
  });

  it("reports the location error and skips fetching when permission is denied", async () => {
    mockRequestPermission.mockResolvedValue({ status: "denied" });

    const { result } = await renderHook(() => usePOIFetch(baseOptions));
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(result.current.error).toBe("LOCATION_ERROR");
    expect(result.current.loading).toBe(false);
    expect(mockedFetchOsmPlaces).not.toHaveBeenCalled();
  });

  it("reports the location error when device location services are off", async () => {
    mockedServicesEnabled.mockResolvedValue(false);

    const { result } = await renderHook(() => usePOIFetch(baseOptions));
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(result.current.error).toBe("LOCATION_ERROR");
    expect(mockedFetchOsmPlaces).not.toHaveBeenCalled();
  });

  it("expands the search radius when the first fetch returns nothing", async () => {
    mockedFetchOsmPlaces
      .mockResolvedValueOnce([]) // base radius: empty
      .mockResolvedValueOnce([osmItem("rural", 15000)]);

    const { result } = await renderHook(() => usePOIFetch(baseOptions));
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(mockedFetchOsmPlaces).toHaveBeenCalledTimes(2);
    // 4th positional arg of fetchOsmPlaces is the radius in metres.
    expect(mockedFetchOsmPlaces.mock.calls[0][3]).toBe(5_000);
    expect(mockedFetchOsmPlaces.mock.calls[1][3]).toBe(20_000); // 5 km × POI_EXPANDED_RADIUS_FACTOR
    expect(result.current.places.map((p) => p.id)).toEqual(["rural"]);
  });

  it("sets the load error when the fetch fails", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockedFetchOsmPlaces.mockRejectedValue(new Error("Network error"));

    const { result } = await renderHook(() => usePOIFetch(baseOptions));
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(result.current.error).toBe("LOAD_ERROR");
    expect(result.current.loading).toBe(false);
    consoleSpy.mockRestore();
  });

  it("discards results that arrive after cancelSearch", async () => {
    let resolvePosition!: (v: unknown) => void;
    mockedPosition.mockReturnValue(new Promise((res) => (resolvePosition = res)));
    mockedFetchOsmPlaces.mockResolvedValue([osmItem("late", 100)]);

    const { result } = await renderHook(() => usePOIFetch(baseOptions));
    let load!: Promise<void>;
    await act(async () => {
      load = result.current.loadPlaces();
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => {
      result.current.cancelSearch();
    });
    await act(async () => {
      resolvePosition({ coords: { latitude: 59.9, longitude: 10.7 } });
      await load;
    });

    // The superseded call must not have applied its results.
    expect(result.current.places).toEqual([]);
    expect(result.current.userLocation).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockedFetchOsmPlaces).not.toHaveBeenCalled();
  });
});
