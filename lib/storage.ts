// ── Resilient AsyncStorage shim ───────────────────────────────────────────────
// AsyncStorage is a native module and may be unavailable in some environments
// (Expo Go without the package, restricted devices, web). This wraps it in a
// typed, null-safe interface so callers don't each re-declare `AsyncStorage: any`
// and re-implement the try/require guard.

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

interface AsyncStorageNative extends AsyncStorageLike {
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativeStorage: AsyncStorageNative | null = (() => {
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
  async getAllKeys() {
    if (!nativeStorage) return [];
    return nativeStorage.getAllKeys();
  },
  async multiRemove(keys) {
    if (!nativeStorage || keys.length === 0) return;
    await nativeStorage.multiRemove(keys);
  },
};

/**
 * Read a `{ ts, data }` cache envelope written with `writeTimedCache` (or the
 * equivalent inline JSON.stringify). Returns null when the key is absent, the
 * payload is malformed, `data` is empty, or the entry is older than `ttlMs`.
 * Shared by the POI/emergency/MC screens so the cache format lives in one place.
 */
export async function readTimedCache<T>(
  key: string,
  ttlMs: number
): Promise<{ data: T[]; ts: number } | null> {
  try {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ts: number = parsed?.ts;
    const data: T[] = parsed?.data;
    if (
      Array.isArray(data) &&
      data.length > 0 &&
      typeof ts === "number" &&
      Date.now() - ts < ttlMs
    ) {
      return { data, ts };
    }
  } catch {}
  return null;
}

/** Write a `{ ts, data }` cache envelope for `readTimedCache`. Never throws. */
export async function writeTimedCache<T>(key: string, data: T[]): Promise<void> {
  try {
    await storage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

/** Cache entries older than this are deleted by pruneStaleCaches. */
const CACHE_PRUNE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000; // 7 days

/**
 * Delete stale `cache_*` entries on app boot. Old versioned keys (e.g. a
 * retired `cache_hotels_v1`) stop being rewritten when the key version bumps,
 * so they age past the cutoff and get removed here instead of leaking in
 * AsyncStorage forever. Unparsable payloads are removed immediately.
 * Never throws; runs fire-and-forget.
 */
export async function pruneStaleCaches(): Promise<void> {
  if (!nativeStorage) return;
  try {
    const keys = (await nativeStorage.getAllKeys()).filter((k) => k.startsWith("cache_"));
    const toRemove: string[] = [];
    for (const key of keys) {
      try {
        const raw = await nativeStorage.getItem(key);
        if (!raw) continue;
        const ts = JSON.parse(raw)?.ts;
        if (typeof ts !== "number" || Date.now() - ts > CACHE_PRUNE_MAX_AGE_MS) {
          toRemove.push(key);
        }
      } catch {
        toRemove.push(key); // unparsable → junk
      }
    }
    if (toRemove.length > 0) await nativeStorage.multiRemove(toRemove);
  } catch {}
}
