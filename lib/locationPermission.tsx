/**
 * Location permission context that gates every foreground permission request
 * behind Google-required Prominent Disclosure.
 *
 * Usage:
 *   1. Wrap the app with <LocationPermissionProvider> in app/_layout.tsx.
 *   2. In any hook or component that needs location, call:
 *        const { requestForegroundPermission } = useLocationPermission();
 *      and replace Location.requestForegroundPermissionsAsync() with
 *        await requestForegroundPermission()
 *
 * The disclosure modal is shown exactly once per permission request whenever
 * the foreground permission has not already been granted.  If the user taps
 * "Allow" the OS permission dialog is shown next; if they tap "No thanks" the
 * request resolves as denied without touching the OS dialog.
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import * as Location from "expo-location";
import { LocationDisclosureModal } from "../components/LocationDisclosureModal";

type PermissionResult = Awaited<ReturnType<typeof Location.requestForegroundPermissionsAsync>>;

interface LocationPermissionCtx {
  /** Drop-in replacement for Location.requestForegroundPermissionsAsync(). */
  requestForegroundPermission: () => Promise<PermissionResult>;
}

const LocationPermissionContext = createContext<LocationPermissionCtx>({
  // Fallback for components rendered outside the provider (e.g. Storybook / tests).
  requestForegroundPermission: () => Location.requestForegroundPermissionsAsync(),
});

export function useLocationPermission(): LocationPermissionCtx {
  return useContext(LocationPermissionContext);
}

export function LocationPermissionProvider({ children }: { children: ReactNode }) {
  const [modalVisible, setModalVisible] = useState(false);
  // Holds the resolve callback of the Promise created by requestForegroundPermission().
  const resolveRef = useRef<((allowed: boolean) => void) | null>(null);
  // Shared Promise while a disclosure modal is already showing, so concurrent
  // callers wait for the same interaction rather than opening a second modal.
  const pendingRef = useRef<Promise<boolean> | null>(null);

  const requestForegroundPermission = useCallback(async (): Promise<PermissionResult> => {
    // If permission is already granted there is no need to show the disclosure.
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === "granted") return current;

    // If a disclosure is already showing, reuse its Promise so we don't open a
    // second modal or overwrite resolveRef.
    if (!pendingRef.current) {
      pendingRef.current = new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setModalVisible(true);
      });
    }

    const allowed = await pendingRef.current;

    if (!allowed) {
      // User declined — return a denied-equivalent result without calling the OS.
      return {
        status: "denied" as const,
        granted: false,
        canAskAgain: current.canAskAgain,
        expires: current.expires,
      };
    }

    // User tapped Allow — now trigger the real OS permission dialog.
    return Location.requestForegroundPermissionsAsync();
  }, []);

  const handleAllow = useCallback(() => {
    setModalVisible(false);
    pendingRef.current = null;
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleDeny = useCallback(() => {
    setModalVisible(false);
    pendingRef.current = null;
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  return (
    <LocationPermissionContext.Provider value={{ requestForegroundPermission }}>
      {children}
      <LocationDisclosureModal
        visible={modalVisible}
        onAllow={handleAllow}
        onDeny={handleDeny}
      />
    </LocationPermissionContext.Provider>
  );
}
