// ── Resilient AsyncStorage shim ───────────────────────────────────────────────
// AsyncStorage is a native module and may be unavailable in some environments
// (Expo Go without the package, restricted devices, web). This wraps it in a
// typed, null-safe interface so callers don't each re-declare `AsyncStorage: any`
// and re-implement the try/require guard.

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativeStorage: AsyncStorageLike | null = (() => {
  try {
    return require("@react-native-async-storage/async-storage").default;
  } catch {
    return null;
  }
})();

/** True when the native AsyncStorage module is available on this platform. */
export const hasStorage = nativeStorage !== null;

/**
 * Null-safe AsyncStorage wrapper. Reads resolve to `null` and writes resolve
 * without effect when the native module is unavailable, so callers can use it
 * unconditionally without their own presence checks.
 */
export const storage: AsyncStorageLike = {
  async getItem(key) {
    if (!nativeStorage) return null;
    return nativeStorage.getItem(key);
  },
  async setItem(key, value) {
    if (!nativeStorage) return;
    await nativeStorage.setItem(key, value);
  },
  async removeItem(key) {
    if (!nativeStorage) return;
    await nativeStorage.removeItem(key);
  },
};
