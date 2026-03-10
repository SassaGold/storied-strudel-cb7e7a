import React, { createContext, useContext, useMemo, useState } from "react";

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
  const value = useMemo(
    () => ({ unitSystem, setUnitSystem, searchRadiusKm, setSearchRadiusKm, defaultTab, setDefaultTab }),
    [unitSystem, searchRadiusKm, defaultTab]
  );
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
