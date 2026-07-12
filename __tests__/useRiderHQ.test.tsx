// ── useRiderHQ hook tests ─────────────────────────────────────────────────────
// Exercises the RIDER HQ data hook: the parallel Nominatim/Open-Meteo/Overpass
// fetch, the last-good snapshot cache (offline fallback + per-piece merge on
// partial failures), permission handling and derived values.

import { renderHook, act } from "@testing-library/react-native";
import { useRiderHQ } from "../lib/useRiderHQ";
import { getCurrentPositionWithTimeout } from "../lib/location";
import { storage } from "../lib/storage";
import { fetchOverpass, fetchWithTimeout } from "../lib/overpass";
import {
  NOMINATIM_REVERSE_GEOCODING_BASE_URL,
  OPEN_METEO_BASE_URL,
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

jest.mock("../lib/settings", () => ({
  ...jest.requireActual("../lib/settings"),
  useSettings: () => ({ settings: { searchRadiusKm: 5, unitSystem: "metric" } }),
}));

jest.mock("../lib/location", () => ({
  getCurrentPositionWithTimeout: jest.fn(),
}));

jest.mock("../lib/storage", () => ({
  storage: {
    getItem: jest.fn(),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn(),
  },
}));

// fetchWithTimeout/fetchOverpass are mocked per-test; withRetry runs the
// wrapped call once so failure paths don't sit in back-off sleeps.
jest.mock("../lib/overpass", () => ({
  ...jest.requireActual("../lib/overpass"),
  withRetry: jest.fn(<T,>(fn: () => Promise<T>) => fn()),
  fetchWithTimeout: jest.fn(),
  fetchOverpass: jest.fn(),
}));

jest.mock("expo-location", () => ({
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5 },
}));

const mockedPosition = getCurrentPositionWithTimeout as jest.Mock;
const mockedGetItem = storage.getItem as jest.Mock;
const mockedSetItem = storage.setItem as jest.Mock;
const mockedFetchWithTimeout = fetchWithTimeout as jest.Mock;
const mockedFetchOverpass = fetchOverpass as jest.Mock;

const OSLO = { latitude: 59.9139, longitude: 10.7522 };

const nominatimResponse = {
  name: "Oslo",
  display_name: "Oslo, Norway",
  address: { city: "Oslo", country: "Norway" },
};

const openMeteoResponse = {
  utc_offset_seconds: 7200,
  current: {
    temperature_2m: 20.7,
    apparent_temperature: 18.3,
    wind_speed_10m: 15,
    wind_direction_10m: 45,
    relative_humidity_2m: 48,
    precipitation: 0,
    weather_code: 2,
    precipitation_probability: 0,
  },
};

const overpassResponse = {
  elements: [
    {
      id: 42,
      lat: 59.915,
      lon: 10.75,
      tags: { highway: "construction", name: "Testgata" },
    },
  ],
};

/** Route the two REST fetches by URL; individual tests override per-endpoint. */
function mockRestEndpoints({
  nominatim = nominatimResponse,
  openMeteo = openMeteoResponse,
}: {
  nominatim?: object | Error;
  openMeteo?: object | Error;
} = {}) {
  mockedFetchWithTimeout.mockImplementation((url: string) => {
    const payload = url.startsWith(NOMINATIM_REVERSE_GEOCODING_BASE_URL)
      ? nominatim
      : url.startsWith(OPEN_METEO_BASE_URL)
        ? openMeteo
        : new Error(`Unexpected URL in test: ${url}`);
    if (payload instanceof Error) return Promise.reject(payload);
    return Promise.resolve({ ok: true, json: async () => payload });
  });
}

const cachedSnapshot = {
  ts: 1750000000000,
  coords: OSLO,
  address: { displayName: "Cached Town", city: "Cached", country: "Norway" },
  weather: { temperatureC: 11, weatherCode: "cloudy", forecast: [], hourly: [] },
  roadAlerts: [{ id: "c1", name: "Cached road", type: "construction" }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetItem.mockResolvedValue(null);
  mockedSetItem.mockResolvedValue(undefined);
  mockRequestPermission.mockResolvedValue({ status: "granted" });
  mockedPosition.mockResolvedValue({ coords: OSLO });
  mockRestEndpoints();
  mockedFetchOverpass.mockResolvedValue(overpassResponse);
});

describe("useRiderHQ", () => {
  it("loads address, weather and road alerts and persists the snapshot", async () => {
    const { result } = await renderHook(() => useRiderHQ());
    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.address).toEqual({
      displayName: "Oslo",
      city: "Oslo",
      country: "Norway",
    });
    expect(result.current.weather?.temperatureC).toBe(20.7);
    expect(result.current.roadAlerts).toHaveLength(1);
    expect(result.current.roadAlerts[0]).toMatchObject({
      id: "42",
      name: "Testgata",
      type: "construction",
    });
    expect(result.current.lastUpdated).toBeInstanceOf(Date);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);

    // Derived values from the fresh location.
    expect(result.current.weatherUrl).toContain("59.9139");
    expect(result.current.sunTimes).not.toBeNull(); // Oslo in July has sunrise/sunset

    // Snapshot persisted for the next cold start.
    expect(mockedSetItem).toHaveBeenCalledWith(
      "cache_riderhq_v1",
      expect.stringContaining("Oslo")
    );
  });

  it("keeps the cached piece when one fetch fails (partial failure merge)", async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(cachedSnapshot));
    mockRestEndpoints({ openMeteo: new Error("Open-Meteo down") });

    const { result } = await renderHook(() => useRiderHQ());
    await act(async () => {
      await result.current.loadData();
    });

    // Fresh pieces replace cache; the failed weather keeps the cached value.
    expect(result.current.address?.displayName).toBe("Oslo");
    expect(result.current.weather?.temperatureC).toBe(11);
    expect(result.current.roadAlerts[0]?.id).toBe("42");
    expect(result.current.error).toBeNull();
  });

  it("shows the cached snapshot without an error when GPS fails", async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(cachedSnapshot));
    mockedPosition.mockRejectedValue(new Error("GPS timeout"));

    const { result } = await renderHook(() => useRiderHQ());
    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.address?.displayName).toBe("Cached Town");
    expect(result.current.weather?.temperatureC).toBe(11);
    expect(result.current.roadAlerts[0]?.id).toBe("c1");
    expect(result.current.location?.coords.latitude).toBe(OSLO.latitude);
    expect(result.current.loading).toBe(false);
  });

  it("reports the data error when everything fails and no cache exists", async () => {
    mockedPosition.mockRejectedValue(new Error("GPS timeout"));

    const { result } = await renderHook(() => useRiderHQ());
    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.error).toBe("home.dataError");
    expect(result.current.address).toBeNull();
  });

  it("reports the location error on explicit permission denial without cache", async () => {
    mockRequestPermission.mockResolvedValue({ status: "denied" });

    const { result } = await renderHook(() => useRiderHQ());
    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.error).toBe("home.locationError");
    expect(mockedPosition).not.toHaveBeenCalled();
  });

  it("filters road elements whose type is not a known road type", async () => {
    mockedFetchOverpass.mockResolvedValue({
      elements: [
        { id: 1, lat: 59.91, lon: 10.75, tags: { highway: "construction" } },
        // Unknown type — must be filtered out.
        { id: 2, lat: 59.92, lon: 10.76, tags: { highway: "proposed_zipline" } },
      ],
    });

    const { result } = await renderHook(() => useRiderHQ());
    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.roadAlerts.map((a) => a.id)).toEqual(["1"]);
  });
});
