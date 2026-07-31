// ── usePOIFetch hook tests ────────────────────────────────────────────────────
// Exercises the shared POI data-fetching hook with mocked location, storage
// and Overpass layers: cache serving, permission/service failures, radius
// expansion, sorting, error fallback, and cancellation.

import { renderHook, act, waitFor } from "@testing-library/react-native";
import * as Location from "expo-location";
import { poiRadiusLadder, rescopeCachedPlaces, usePOIFetch, type Place } from "../lib/usePOIFetch";
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

  it("does not show cached places until the position is known", async () => {
    // Cached distances were measured wherever the last search happened. Until
    // we know where the rider is now, they cannot be trusted — so nothing is
    // painted. This used to render immediately, which is how a station 123 km
    // away came to be listed as "10 m" on a real ride.
    const cachedPlace = { ...mapPlaceItem(osmItem("cached", 50))! };
    mockedReadCache.mockResolvedValue({ data: [cachedPlace], ts: 12345 });
    // Position never resolves — the fetch stays in flight.
    mockedPosition.mockReturnValue(new Promise(() => {}));

    const { result } = await renderHook(() => usePOIFetch(baseOptions));
    await act(async () => {
      result.current.loadPlaces();
    });

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.places).toEqual([]);
    expect(result.current.fromCache).toBe(false);

    await act(async () => {
      result.current.cancelSearch();
    });
    expect(result.current.loading).toBe(false);
  });

  it("serves cached places once the position lands, re-measured from here", async () => {
    // Two cached places: one still nearby, one left 120 km behind. The stored
    // distanceMeters on both is a lie from the previous search location.
    const near = { ...mapPlaceItem(osmItem("near", 50))! };
    const leftBehind = {
      ...mapPlaceItem(osmItem("left-behind", 10))!,
      id: "left-behind",
      latitude: 58.9,
      longitude: 12.4,
    };
    mockedReadCache.mockResolvedValue({ data: [leftBehind, near], ts: 12345 });
    mockedFetchOsmPlaces.mockReturnValue(new Promise(() => {})); // fetch stays in flight

    const { result } = await renderHook(() => usePOIFetch(baseOptions));
    await act(async () => {
      result.current.loadPlaces();
    });

    await waitFor(() => {
      expect(result.current.places.map((p) => p.id)).toEqual(["near"]);
    });
    expect(result.current.fromCache).toBe(true);
    expect(result.current.cacheTs).toBe(12345);
    // Re-measured against the current position, not the stale stored value.
    expect(result.current.places[0].distanceMeters).not.toBe(50);
    expect(result.current.places[0].distanceMeters).toBeGreaterThan(1_000);
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

  it("re-resolves an on-screen error when the messages change (language switch)", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockedFetchOsmPlaces.mockRejectedValue(new Error("Network error"));

    const { result, rerender } = await renderHook(
      (props: typeof baseOptions) => usePOIFetch(props),
      { initialProps: baseOptions }
    );
    await act(async () => {
      await result.current.loadPlaces();
    });
    expect(result.current.error).toBe("LOAD_ERROR");

    // A language switch re-renders callers with freshly translated options; the
    // error already on screen must follow. It used to keep the language that
    // was active when the fetch failed.
    await rerender({ ...baseOptions, loadErrorMsg: "INDLÆS_FEJL" });
    expect(result.current.error).toBe("INDLÆS_FEJL");
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

describe("rescopeCachedPlaces", () => {
  const place = (id: string, lat: number, lon: number, stored: number): Place => ({
    id, name: id, category: "restaurant", latitude: lat, longitude: lon, distanceMeters: stored,
  });

  it("replaces stored distances with ones measured from the current position", () => {
    // The Arboga→Sigtuna case: a station cached 123 km ago still claiming 10 m.
    const arboga = place("OKQ8", 59.42595, 15.82918, 10);
    const [out] = rescopeCachedPlaces([arboga], 59.42600, 15.82930, 5_000);
    expect(out.distanceMeters).toBeLessThan(50);
    expect(out.distanceMeters).not.toBe(10);
  });

  it("drops places the rider has left behind", () => {
    const arboga = place("OKQ8", 59.42595, 15.82918, 10);
    // Now in Sigtuna, 123 km away — nothing cached is nearby any more.
    expect(rescopeCachedPlaces([arboga], 59.65351, 17.95674, 5_000)).toEqual([]);
  });

  it("re-sorts by the new distances", () => {
    const here = { lat: 59.9, lon: 10.7 };
    const a = place("a", 59.905, 10.7, 10);   // ~556 m, but stored as nearest
    const b = place("b", 59.901, 10.7, 900);  // ~111 m, but stored as farthest
    expect(rescopeCachedPlaces([a, b], here.lat, here.lon, 5_000).map((p) => p.id))
      .toEqual(["b", "a"]);
  });
});

describe("poiRadiusLadder", () => {
  it("ascends and never exceeds the cap", () => {
    for (const km of [1, 2, 5, 10, 25, 50, 100, 500]) {
      const ladder = poiRadiusLadder(km * 1000);
      expect(ladder).toEqual([...ladder].sort((a, b) => a - b));
      expect(new Set(ladder).size).toBe(ladder.length);
      expect(Math.max(...ladder)).toBeLessThanOrEqual(100_000);
    }
  });

  it("reaches the 100 km cap from the default 5 km setting", () => {
    // The regression this exists for: a single 4x expansion capped reach at
    // 20 km, so POI_MAX_RADIUS_M was unreachable unless the user had manually
    // set 25 km or more. Rural riders hit that ceiling constantly.
    expect(poiRadiusLadder(5_000)).toContain(100_000);
    expect(poiRadiusLadder(5_000)[0]).toBe(5_000);
  });

  it("collapses to a single step when the user already searches at the cap", () => {
    expect(poiRadiusLadder(100_000)).toEqual([100_000]);
    expect(poiRadiusLadder(200_000)).toEqual([100_000]);
  });
});

describe("sparse-area escalation", () => {
  it("keeps widening past 20 km when nothing is found, then stops on the first hit", async () => {
    mockedFetchOsmPlaces
      .mockResolvedValueOnce([])                          // 5 km
      .mockResolvedValueOnce([])                          // 20 km — where it used to give up
      .mockResolvedValueOnce([osmItem("far", 40000)]);    // 50 km

    const { result } = await renderHook(() => usePOIFetch(baseOptions));
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(mockedFetchOsmPlaces).toHaveBeenCalledTimes(3);
    expect(mockedFetchOsmPlaces.mock.calls.map((c) => c[3])).toEqual([5_000, 20_000, 50_000]);
    expect(result.current.places.map((p) => p.id)).toEqual(["far"]);
  });

  it("does not keep querying once results are found", async () => {
    mockedFetchOsmPlaces.mockResolvedValueOnce([osmItem("near", 1000)]);

    const { result } = await renderHook(() => usePOIFetch(baseOptions));
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(mockedFetchOsmPlaces).toHaveBeenCalledTimes(1);
  });
});

describe("stale cache fallback on failure", () => {
  it("shows expired cached places rather than an empty screen when the search fails", async () => {
    // Fresh read (CACHE_TTL_MS) misses — the cache has aged out. The fallback
    // read, with an infinite TTL, still has yesterday's results.
    mockedReadCache
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        data: [{ id: "old", name: "Yesterday's cafe", latitude: 59.9, longitude: 10.7 }],
        ts: 1_000,
      });
    mockedFetchOsmPlaces.mockRejectedValue(new Error("Overpass error 504"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const { result } = await renderHook(() => usePOIFetch(baseOptions));
    await act(async () => {
      await result.current.loadPlaces();
    });

    // The rider sees something useful AND is told it is old and that the search failed.
    expect(result.current.places.map((p) => p.id)).toEqual(["old"]);
    expect(result.current.fromCache).toBe(true);
    expect(result.current.cacheTs).toBe(1_000);
    expect(result.current.error).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it("does not overwrite live results with stale ones", async () => {
    // A fresh hit is already on screen; a later failure must not replace it.
    mockedReadCache.mockResolvedValue({
      data: [{ id: "fresh", name: "Open now", latitude: 59.9, longitude: 10.7 }],
      ts: 9_000,
    });
    mockedFetchOsmPlaces.mockRejectedValue(new Error("Overpass error 504"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const { result } = await renderHook(() => usePOIFetch(baseOptions));
    await act(async () => {
      await result.current.loadPlaces();
    });

    expect(result.current.places.map((p) => p.id)).toEqual(["fresh"]);
    expect(result.current.cacheTs).toBe(9_000);
    consoleSpy.mockRestore();
  });
});
