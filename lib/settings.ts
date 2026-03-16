import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

const AsyncStorage: any = (() => {
  try {
    return require("@react-native-async-storage/async-storage").default;
  } catch {
    return null;
  }
})();

export type UnitSystem = "metric" | "imperial";

export type DefaultTab =
  | "index"
  | "restaurants"
  | "hotels"
  | "attractions"
  | "mc"
  | "triplogger"
  | "emergency";

export interface AppSettings {
  unitSystem: UnitSystem;
  searchRadiusKm: number;
  defaultTab: DefaultTab;
}

export const DEFAULT_SETTINGS: AppSettings = {
  unitSystem: "metric",
  searchRadiusKm: 5,
  defaultTab: "index",
};

const STORAGE_KEY = "app_settings_v1";

interface SettingsCtx {
  settings: AppSettings;
  setSetting: <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => void;
}

const SettingsContext = createContext<SettingsCtx>({
  settings: DEFAULT_SETTINGS,
  setSetting: () => {},
});

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage?.getItem(STORAGE_KEY);
        if (raw) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
        }
      } catch (e) {
        console.warn("[Settings] load error:", e);
      }
    })();
  }, []);

  const setSetting = useCallback(<K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: val };
      try {
        AsyncStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn("[Settings] save error:", e);
      }
      return next;
    });
  }, []);

  const ctxValue = useMemo(() => ({ settings, setSetting }), [settings, setSetting]);

  return createElement(
    SettingsContext.Provider,
    { value: ctxValue },
    children
  );
}

// ── Conversion helpers ────────────────────────────────────────────────────────

export function fmtTemp(tempC: number, unit: UnitSystem, round = false): string {
  if (unit === "imperial") {
    const f = tempC * 1.8 + 32;
    return round ? `${Math.round(f)}°F` : `${f.toFixed(1)}°F`;
  }
  return round ? `${Math.round(tempC)}°C` : `${tempC.toFixed(1)}°C`;
}

export function fmtDist(km: number, unit: UnitSystem): string {
  if (unit === "imperial") {
    return `${(km * 0.621371).toFixed(2)} mi`;
  }
  return `${km.toFixed(2)} km`;
}

export function fmtSpeed(kmh: number, unit: UnitSystem): string {
  if (unit === "imperial") {
    return `${(kmh * 0.621371).toFixed(0)} mph`;
  }
  return `${kmh.toFixed(0)} km/h`;
}

export function fmtDistShort(meters: number, unit: UnitSystem): string {
  if (unit === "imperial") {
    const miles = meters / 1609.34;
    if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
    return `${miles.toFixed(1)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
