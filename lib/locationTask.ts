/**
 * Background location task for Trip Logger.
 *
 * This module must be imported once at app boot (in app/_layout.tsx) so that
 * TaskManager has the task definition registered before any location updates
 * are started.
 */
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";

export const LOCATION_TASK_NAME = "roamly-bg-location";
/** AsyncStorage key where background GPS points are accumulated during a trip. */
export const BG_POINTS_KEY = "triplogger_bg_points_v1";

export type BgPoint = { latitude: number; longitude: number; timestamp: number };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage: typeof import("@react-native-async-storage/async-storage").default | null = (() => { try { return require("@react-native-async-storage/async-storage").default; } catch { return null; } })();

TaskManager.defineTask(
  LOCATION_TASK_NAME,
  async ({
    data,
    error,
  }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
    if (error || !data) return;
    const { locations } = data;
    if (!locations?.length || !AsyncStorage) return;
    try {
      const raw = await AsyncStorage.getItem(BG_POINTS_KEY);
      const existing: BgPoint[] = raw ? (JSON.parse(raw) as BgPoint[]) : [];
      const newPoints: BgPoint[] = locations.map((loc) => ({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        timestamp: loc.timestamp,
      }));
      await AsyncStorage.setItem(
        BG_POINTS_KEY,
        JSON.stringify([...existing, ...newPoints]),
      );
    } catch {
      // Silently ignore storage failures in the background task — there is no
      // UI context available here and a crash would terminate the background service.
    }
  },
);
