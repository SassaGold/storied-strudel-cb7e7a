import { createContext, createElement, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  C_TO_F_FACTOR,
  C_TO_F_OFFSET,
  KM_TO_MILES,
  KMH_TO_MPH,
  METRES_PER_MILE,
  M_TO_FEET,
  SHORT_DISTANCE_THRESHOLD_MILES,
} from "./config";

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
          const parsed = JSON.parse(raw);
          if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
            setSettings({ ...DEFAULT_SETTINGS, ...parsed });
          }
        }
      } catch {}
    })();
  }, []);

  const setSetting = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: val };
      try {
        AsyncStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  return createElement(
    SettingsContext.Provider,
    { value: { settings, setSetting } },
    children
  );
}

// ── Conversion helpers ────────────────────────────────────────────────────────

export function fmtTemp(tempC: number, unit: UnitSystem, round = false): string {
  if (unit === "imperial") {
    const f = tempC * C_TO_F_FACTOR + C_TO_F_OFFSET;
    return round ? `${Math.round(f)}°F` : `${f.toFixed(1)}°F`;
  }
  return round ? `${Math.round(tempC)}°C` : `${tempC.toFixed(1)}°C`;
}

export function fmtDist(km: number, unit: UnitSystem): string {
  if (unit === "imperial") {
    return `${(km * KM_TO_MILES).toFixed(2)} mi`;
  }
  return `${km.toFixed(2)} km`;
}

export function fmtSpeed(kmh: number, unit: UnitSystem): string {
  if (unit === "imperial") {
    return `${(kmh * KMH_TO_MPH).toFixed(0)} mph`;
  }
  return `${kmh.toFixed(0)} km/h`;
}

export function fmtDistShort(meters: number, unit: UnitSystem): string {
  if (unit === "imperial") {
    const miles = meters / METRES_PER_MILE;
    if (miles < SHORT_DISTANCE_THRESHOLD_MILES) return `${Math.round(meters * M_TO_FEET)} ft`;
    return `${miles.toFixed(1)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
