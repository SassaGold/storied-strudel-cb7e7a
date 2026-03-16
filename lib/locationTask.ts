// ── Background Location Task ──────────────────────────────────────────────────
// Registers the TaskManager task that buffers GPS points while the app is
// suspended.  The task definition MUST be at module scope so the JS runtime
// can re-register it when the app is woken from the background by the OS.
//
// This file is imported from app/_layout.tsx (root layout) to guarantee the
// task is always registered before it could fire.

import { Platform } from "react-native";

// expo-task-manager is only meaningful on native; skip the import on web.
let TaskManager: typeof import("expo-task-manager") | null = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (Platform.OS !== "web") { try { TaskManager = require("expo-task-manager"); } catch { /* not available in Expo Go or web builds — background location won't run */ } }

/** Unique task name shared between registerTask and Location.start/stop calls. */
export const LOCATION_TASK_NAME = "roamly-bg-location";

/**
 * AsyncStorage key where the background task accumulates GPS points.
 * Cleared at ride-start; read + cleared when the app returns to the
 * foreground or when recording is stopped.
 */
export const BG_POINTS_KEY = "triplogger_bg_points_v1";

export type BgPoint = { latitude: number; longitude: number; timestamp: number };

// ── Task definition ────────────────────────────────────────────────────────────
// Runs in a separate JS context (separate from the React app) on each batch of
// location updates.  We can't update React state here — write to AsyncStorage
// instead, and let the foreground component merge on the next resume.

if (TaskManager && Platform.OS !== "web") {
  TaskManager.defineTask(
    LOCATION_TASK_NAME,
    async ({
      data,
      error,
    }: import("expo-task-manager").TaskManagerTaskBody<{
      locations: import("expo-location").LocationObject[];
    }>) => {
      if (error) {
        console.warn("[BG Location] task error:", error.message);
        return;
      }
      if (!data?.locations?.length) return;

      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const AsyncStorage = require("@react-native-async-storage/async-storage").default;
        const raw: string | null = await AsyncStorage.getItem(BG_POINTS_KEY);
        const existing: BgPoint[] = raw ? (JSON.parse(raw) as BgPoint[]) : [];
        const incoming: BgPoint[] = data.locations.map((loc) => ({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp,
        }));
        await AsyncStorage.setItem(
          BG_POINTS_KEY,
          JSON.stringify([...existing, ...incoming])
        );
      } catch (e) {
        console.warn("[BG Location] AsyncStorage error:", e);
      }
    }
  );
}
