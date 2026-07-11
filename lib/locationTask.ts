/**
 * Background location task for Trip Logger.
 *
 * This module must be imported once at app boot (in app/_layout.tsx) so that
 * TaskManager has the task definition registered before any location updates
 * are started.
 *
 * All native-module access uses dynamic require() so that if expo-task-manager
 * or expo-location are unavailable (Expo Go, missing native build, restricted
 * device) the module still loads successfully and exports its constants.
 * Foreground-only tracking in triplogger.tsx will continue to work.
 */

import { storage } from "./storage";

export const LOCATION_TASK_NAME = "whereami-bg-location";
/** Legacy single-blob AsyncStorage key (pre-chunking). Still read and cleared
 *  so points from a ride recorded under an older app version aren't lost. */
export const BG_POINTS_KEY = "triplogger_bg_points_v1";
/** Prefix for chunked background-point keys: `<prefix><chunkIndex>`. */
const BG_CHUNK_PREFIX = "triplogger_bg_chunk_v2:";
/** Points per chunk before a new chunk is started. Keeps each background
 *  write O(chunk) instead of re-serializing the whole ride every batch. */
const BG_CHUNK_MAX_POINTS = 200;

export type BgPoint = { latitude: number; longitude: number; timestamp: number };

// Dynamically load expo-task-manager so a missing/broken native module does
// not prevent this file from being imported (which would crash the app).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TaskManager: any = (() => { try { return require("expo-task-manager"); } catch { return null; } })();

/** Returns true only if the background location task has been successfully registered. */
export function isLocationTaskDefined(): boolean {
  try {
    return TaskManager != null && TaskManager.isTaskDefined(LOCATION_TASK_NAME) === true;
  } catch {
    return false;
  }
}

// In-memory write cursor for the current chunk. If the background JS context
// is killed and restarted mid-ride, the cursor re-derives from existing keys
// (previous chunks stay untouched, so no points are lost).
let chunkIndex: number | null = null;
let chunkPoints: BgPoint[] = [];

async function listChunkKeys(): Promise<string[]> {
  const keys = await storage.getAllKeys();
  return keys.filter((k) => k.startsWith(BG_CHUNK_PREFIX));
}

async function nextChunkIndex(): Promise<number> {
  let max = -1;
  for (const key of await listChunkKeys()) {
    const n = Number(key.slice(BG_CHUNK_PREFIX.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/** Append a batch of points to the current chunk. Exported for the task
 *  callback below and for unit tests. */
export async function appendBgPoints(newPoints: BgPoint[]): Promise<void> {
  if (newPoints.length === 0) return;
  if (chunkIndex === null) {
    chunkIndex = await nextChunkIndex();
    chunkPoints = [];
  }
  chunkPoints.push(...newPoints);
  await storage.setItem(BG_CHUNK_PREFIX + chunkIndex, JSON.stringify(chunkPoints));
  if (chunkPoints.length >= BG_CHUNK_MAX_POINTS) {
    chunkIndex += 1;
    chunkPoints = [];
  }
}

/** Read all background points recorded so far (all chunks + the legacy
 *  single-blob key), sorted by timestamp. Never throws. */
export async function readBgPoints(): Promise<BgPoint[]> {
  const points: BgPoint[] = [];
  try {
    const raws = await Promise.all([
      storage.getItem(BG_POINTS_KEY),
      ...(await listChunkKeys()).map((k) => storage.getItem(k)),
    ]);
    for (const raw of raws) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) points.push(...parsed);
      } catch {}
    }
  } catch {}
  return points.sort((a, b) => a.timestamp - b.timestamp);
}

/** Delete all stored background points and reset the write cursor. Never throws. */
export async function clearBgPoints(): Promise<void> {
  chunkIndex = null;
  chunkPoints = [];
  try {
    await storage.multiRemove([BG_POINTS_KEY, ...(await listChunkKeys())]);
  } catch {}
}

try {
  TaskManager?.defineTask(
    LOCATION_TASK_NAME,
    async ({ data, error }: { data: { locations: any[] }; error: any }) => {
      if (error || !data) return;
      const { locations } = data;
      if (!locations?.length) return;
      try {
        await appendBgPoints(
          locations.map((loc: any) => ({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            timestamp: loc.timestamp,
          })),
        );
      } catch {
        // Silently ignore storage failures in the background task — there is no
        // UI context available here and a crash would terminate the background service.
      }
    },
  );
} catch {
  // defineTask failed (Expo Go, unsupported device, etc.).
  // Foreground-only location tracking will still work without the background task.
}
