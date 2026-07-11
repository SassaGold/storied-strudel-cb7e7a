// Tests for the background GPS point store (lib/locationTask.ts): chunked
// append-only writes so a batch never re-serializes the whole ride.

// In-mockMemory stand-in for the AsyncStorage shim so the chunk logic can be
// tested without the native module.
const mockMem = new Map<string, string>();
jest.mock("../lib/storage", () => ({
  storage: {
    getItem: async (k: string) => mockMem.get(k) ?? null,
    setItem: async (k: string, v: string) => { mockMem.set(k, v); },
    removeItem: async (k: string) => { mockMem.delete(k); },
    getAllKeys: async () => [...mockMem.keys()],
    multiRemove: async (keys: readonly string[]) => { keys.forEach((k) => mockMem.delete(k)); },
  },
}));

import {
  appendBgPoints,
  BG_POINTS_KEY,
  clearBgPoints,
  readBgPoints,
  type BgPoint,
} from "../lib/locationTask";

const pt = (ts: number): BgPoint => ({ latitude: 59.9, longitude: 10.75, timestamp: ts });

beforeEach(async () => {
  mockMem.clear();
  await clearBgPoints(); // reset the module's in-memory chunk cursor
});

describe("background point store", () => {
  it("round-trips appended points sorted by timestamp", async () => {
    await appendBgPoints([pt(3), pt(1)]);
    await appendBgPoints([pt(2)]);
    const points = await readBgPoints();
    expect(points.map((p) => p.timestamp)).toEqual([1, 2, 3]);
  });

  it("rolls over to a new chunk instead of rewriting one growing blob", async () => {
    // 200-point chunk cap → 450 points must span 3 chunks.
    for (let i = 0; i < 45; i++) {
      await appendBgPoints(Array.from({ length: 10 }, (_, j) => pt(i * 10 + j)));
    }
    const chunkKeys = [...mockMem.keys()].filter((k) => k.startsWith("triplogger_bg_chunk_v2:"));
    expect(chunkKeys.length).toBe(3);
    // The last write only touched the newest chunk, not the whole ride.
    const largest = Math.max(...chunkKeys.map((k) => (JSON.parse(mockMem.get(k)!) as BgPoint[]).length));
    expect(largest).toBeLessThanOrEqual(200);
    expect((await readBgPoints())).toHaveLength(450);
  });

  it("still reads points left under the legacy single-blob key", async () => {
    mockMem.set(BG_POINTS_KEY, JSON.stringify([pt(5)]));
    await appendBgPoints([pt(6)]);
    expect((await readBgPoints()).map((p) => p.timestamp)).toEqual([5, 6]);
  });

  it("clearBgPoints removes chunks and the legacy key", async () => {
    mockMem.set(BG_POINTS_KEY, JSON.stringify([pt(5)]));
    await appendBgPoints([pt(6)]);
    await clearBgPoints();
    expect(await readBgPoints()).toEqual([]);
    expect(mockMem.size).toBe(0);
  });

  it("survives a restarted JS context without dropping earlier chunks", async () => {
    await appendBgPoints(Array.from({ length: 200 }, (_, i) => pt(i))); // fills chunk 0 exactly
    // Simulate a context restart: reset the cursor the way a fresh module load would.
    jest.resetModules();
    const fresh = require("../lib/locationTask") as typeof import("../lib/locationTask");
    await fresh.appendBgPoints([pt(999)]);
    const points = await fresh.readBgPoints();
    expect(points).toHaveLength(201);
    expect(points[points.length - 1].timestamp).toBe(999);
  });
});
