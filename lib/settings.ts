import React, { createContext, useContext, useState } from "react";

type UnitSystem = "metric" | "imperial";

type Settings = {
  unitSystem: UnitSystem;
  setUnitSystem: (v: UnitSystem) => void;
  searchRadiusKm: number;
  setSearchRadiusKm: (v: number) => void;
  defaultTab: string;
  setDefaultTab: (v: string) => void;
};

const SettingsContext = createContext<Settings>({
  unitSystem: "metric",
  setUnitSystem: () => {},
  searchRadiusKm: 5,
  setSearchRadiusKm: () => {},
  defaultTab: "index",
  setDefaultTab: () => {},
});

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("metric");
  const [searchRadiusKm, setSearchRadiusKm] = useState(5);
  const [defaultTab, setDefaultTab] = useState("index");
  return (
    <SettingsContext.Provider value={{ unitSystem, setUnitSystem, searchRadiusKm, setSearchRadiusKm, defaultTab, setDefaultTab }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
