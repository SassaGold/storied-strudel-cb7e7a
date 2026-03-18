// ── Sunrise / sunset utilities ────────────────────────────────────────────────
// Pure, side-effect-free functions used by the RIDER HQ screen.

// ── Types ─────────────────────────────────────────────────────────────────────

export type SunTimes = {
  sunrise: Date;
  sunset: Date;
  daylightMinutes: number;
} | null;

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Compute sunrise and sunset times for a given location and date.
 * Pure JS implementation of the USNO/NOAA simplified solar algorithm.
 * Returns `null` for polar locations experiencing midnight sun or polar night.
 */
export function computeSunTimes(
  lat: number,
  lon: number,
  date: Date = new Date()
): SunTimes {
  const DEG = Math.PI / 180;
  const zenith = 90.833; // official civil zenith for sunrise/sunset

  const doy = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(date.getFullYear(), 0, 0)) /
      86400000
  );
  const lngHour = lon / 15;

  function calcUTCHour(isRise: boolean): number | null {
    const t = doy + ((isRise ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * DEG) + 0.02 * Math.sin(2 * M * DEG) + 282.634;
    L = ((L % 360) + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * DEG)) / DEG;
    RA = ((RA % 360) + 360) % 360;
    const RA_norm = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
    const sinDec = 0.39782 * Math.sin(L * DEG);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH =
      (Math.cos(zenith * DEG) - sinDec * Math.sin(lat * DEG)) /
      (cosDec * Math.cos(lat * DEG));
    if (cosH > 1 || cosH < -1) return null; // polar day / polar night
    const H = (isRise ? 360 - Math.acos(cosH) / DEG : Math.acos(cosH) / DEG) / 15;
    const T = H + RA_norm - 0.06571 * t - 6.622;
    return ((T - lngHour) % 24 + 24) % 24;
  }

  const utcRise = calcUTCHour(true);
  const utcSet = calcUTCHour(false);
  if (utcRise === null || utcSet === null) return null;

  const toDate = (utcH: number): Date => {
    const d = new Date(date);
    const h = Math.floor(utcH);
    const m = Math.round((utcH - h) * 60);
    d.setUTCHours(h, m, 0, 0);
    return d;
  };

  const sunrise = toDate(utcRise);
  const sunset = toDate(utcSet);
  const daylightMinutes = Math.round((sunset.getTime() - sunrise.getTime()) / 60000);
  return { sunrise, sunset, daylightMinutes };
}

// ── Display helpers ───────────────────────────────────────────────────────────

/** Format a Date as HH:MM (24-hour clock). Returns "--:--" on failure. */
export const formatTime = (date: Date): string => {
  try {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "--:--";
  }
};

/**
 * Format a duration given in minutes as "Xh Ym".
 * Returns "N/A" for non-positive values.
 */
export const formatDuration = (minutes: number): string => {
  if (minutes <= 0) return "N/A";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

/**
 * Format a forecast date string (YYYY-MM-DD) as a human-readable string.
 * Example: "2024-06-21" → "Fri, Jun 21"
 */
export const formatForecastDate = (dateStr: string): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};
