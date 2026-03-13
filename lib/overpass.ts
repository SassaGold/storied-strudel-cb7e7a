export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];

export const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export const haversineMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const formatDistance = (distance?: number): string => {
  if (distance === undefined) return "";
  if (distance < 1000) return `${Math.round(distance)} m`;
  return `${(distance / 1000).toFixed(1)} km`;
};

export const fetchOverpass = async (query: string, timeoutMs = 25000): Promise<any> => {
  let lastError: string | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        if (!response.ok) {
          lastError = `Overpass error ${response.status}`;
          continue;
        }
        return await response.json();
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Network error";
    }
  }
  throw new Error(lastError ?? "Overpass request failed");
};
