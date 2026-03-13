import { createContext, useContext } from "react";

export type Language = "en" | "de" | "fr" | "es" | "nl";

export type SettingsState = {
  language: Language;
  setLanguage: (lang: Language) => void;
  units: "metric" | "imperial";
  setUnits: (units: "metric" | "imperial") => void;
  radius: number;
  setRadius: (radius: number) => void;
};

export const defaultSettings: SettingsState = {
  language: "en",
  setLanguage: () => {},
  units: "metric",
  setUnits: () => {},
  radius: 5000,
  setRadius: () => {},
};

export const SettingsContext = createContext<SettingsState>(defaultSettings);
export const useSettings = () => useContext(SettingsContext);
