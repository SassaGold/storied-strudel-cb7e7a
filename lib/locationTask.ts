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

export const LOCATION_TASK_NAME = "whereami-bg-location";
/** AsyncStorage key where background GPS points are accumulated during a trip. */
export const BG_POINTS_KEY = "triplogger_bg_points_v1";

export type BgPoint = { latitude: number; longitude: number; timestamp: number };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage: any = (() => { try { return require("@react-native-async-storage/async-storage").default; } catch { return null; } })();

// Dynamically load expo-task-manager so a missing/broken native module does
// not prevent this file from being imported (which would crash the app).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TaskManager: any = (() => { try { return require("expo-task-manager"); } catch { return null; } })();

try {
  TaskManager?.defineTask(
    LOCATION_TASK_NAME,
    async ({ data, error }: { data: { locations: any[] }; error: any }) => {
      if (error || !data) return;
      const { locations } = data;
      if (!locations?.length || !AsyncStorage) return;
      try {
        const raw = await AsyncStorage.getItem(BG_POINTS_KEY);
        const existing: BgPoint[] = raw ? (JSON.parse(raw) as BgPoint[]) : [];
        const newPoints: BgPoint[] = locations.map((loc: any) => ({
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
} catch {
  // defineTask failed (Expo Go, unsupported device, etc.).
  // Foreground-only location tracking will still work without the background task.
}
