// ── lib/location helper tests ────────────────────────────────────────────────
// The fallback to getLastKnownPositionAsync() has no age limit of its own, so
// these tests exist mainly to pin down that an old cached fix is not allowed to
// masquerade as a current one.

import * as Location from "expo-location";
import {
  getCurrentPositionWithTimeout,
  getPositionAllowingStale,
} from "../lib/location";
import { MAX_FIX_AGE_MS } from "../lib/config";

jest.mock("expo-location", () => ({
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}));

const mockedCurrent = Location.getCurrentPositionAsync as jest.Mock;
const mockedLast = Location.getLastKnownPositionAsync as jest.Mock;

/** A fix taken `ageMs` ago. Coordinates are the owner's home, as in the report. */
const fixAged = (ageMs: number) =>
  ({
    coords: {
      latitude: 59.28681,
      longitude: 10.42421,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now() - ageMs,
  }) as unknown as Location.LocationObject;

/** A call that never settles, so the timeout always wins. */
const neverResolves = () => new Promise(() => {});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getCurrentPositionWithTimeout", () => {
  it("returns a live fix", async () => {
    mockedCurrent.mockResolvedValue(fixAged(0));
    const position = await getCurrentPositionWithTimeout();
    expect(position.coords.latitude).toBe(59.28681);
    expect(mockedLast).not.toHaveBeenCalled();
  });

  it("falls back to the last known fix when GPS times out, if it is recent", async () => {
    mockedCurrent.mockImplementation(neverResolves);
    mockedLast.mockResolvedValue(fixAged(5_000));
    const position = await getCurrentPositionWithTimeout(undefined, 5);
    expect(position.coords.latitude).toBe(59.28681);
  });

  // The 2026-08-03 field bug: GPS had not locked, so the fallback served a fix
  // from the owner's driveway — verified afterwards as 2.5 m from his house —
  // while he was ~10 km away, and POI distances were measured from it.
  it("refuses a cached fix that is older than MAX_FIX_AGE_MS", async () => {
    mockedCurrent.mockImplementation(neverResolves);
    mockedLast.mockResolvedValue(fixAged(MAX_FIX_AGE_MS + 60_000));
    await expect(getCurrentPositionWithTimeout(undefined, 5)).rejects.toThrow("GPS_STALE");
  });

  // getCurrentPositionAsync can itself hand back a recent-but-not-instant fix,
  // so freshness is judged on the timestamp, not on which call produced it.
  it("refuses a live call that returns an old timestamp", async () => {
    mockedCurrent.mockResolvedValue(fixAged(MAX_FIX_AGE_MS + 1_000));
    await expect(getCurrentPositionWithTimeout()).rejects.toThrow("GPS_STALE");
  });

  it("rethrows the original failure when there is no cached fix at all", async () => {
    mockedCurrent.mockImplementation(neverResolves);
    mockedLast.mockResolvedValue(null);
    await expect(getCurrentPositionWithTimeout(undefined, 5)).rejects.toThrow("GPS_TIMEOUT");
  });
});

describe("getPositionAllowingStale", () => {
  it("returns an old fix, flagged and aged, rather than throwing", async () => {
    mockedCurrent.mockImplementation(neverResolves);
    mockedLast.mockResolvedValue(fixAged(20 * 60_000));

    const { position, ageMs, stale } = await getPositionAllowingStale(undefined, 5);

    expect(stale).toBe(true);
    expect(position.coords.latitude).toBe(59.28681);
    // ~20 minutes, allowing for the clock moving during the test.
    expect(Math.round(ageMs / 60_000)).toBe(20);
  });

  it("does not flag a fresh fix as stale", async () => {
    mockedCurrent.mockResolvedValue(fixAged(0));
    const { stale, ageMs } = await getPositionAllowingStale();
    expect(stale).toBe(false);
    expect(ageMs).toBeLessThan(MAX_FIX_AGE_MS);
  });

  it("treats a missing or broken timestamp as age zero rather than infinitely old", async () => {
    mockedCurrent.mockResolvedValue({
      coords: { latitude: 1, longitude: 2 },
    } as unknown as Location.LocationObject);
    const { stale, ageMs } = await getPositionAllowingStale();
    expect(ageMs).toBe(0);
    expect(stale).toBe(false);
  });
});
