// ── Safe optional-module loaders ─────────────────────────────────────────────
// Several native modules (expo-haptics, AsyncStorage, react-native-maps) are
// unavailable in Expo Go and some CI environments.  Wrapping each require() in
// a try/catch IIFE prevents a module-not-found crash while still exposing a
// null-safe reference that callers can guard with `?.`.
//
// Centralising the pattern here avoids repeating the same 1-liner across every
// screen file and components.

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const Haptics: typeof import("expo-haptics") | null =
  (() => { try { return require("expo-haptics"); } catch { return null; } })();

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
export const AsyncStorage: any =
  (() => { try { return require("@react-native-async-storage/async-storage").default; } catch { return null; } })();

// react-native-maps requires a custom native build; not available in Expo Go.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
const _rnMaps: any = (() => { try { return require("react-native-maps"); } catch { return null; } })();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MapView: any = _rnMaps?.default ?? null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Marker: any = _rnMaps?.Marker ?? null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Polyline: any = _rnMaps?.Polyline ?? null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PROVIDER_GOOGLE: any = _rnMaps?.PROVIDER_GOOGLE ?? null;
