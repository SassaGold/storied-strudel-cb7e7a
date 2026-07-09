// ── Road-condition utilities ──────────────────────────────────────────────────
// Pure, side-effect-free helpers used by the RIDER HQ screen.

import { haversineMeters } from "./overpass";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RoadAlert = {
  id: string;
  name: string;
  type: string;
  description?: string;
  ref?: string;
  operator?: string;
  distance?: number;
  lat?: number;
  lon?: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

/** OSM highway/construction values that represent actual road work. */
export const ROAD_TYPES = new Set([
  "service", "residential",
  "primary", "primary_link",
  "secondary", "secondary_link",
  "tertiary", "tertiary_link",
  "unclassified", "trunk", "trunk_link",
  "motorway", "motorway_link",
  "road", "living_street",
  "construction", "bridge", "tunnel",
]);

// ── Functions ─────────────────────────────────────────────────────────────────

/**
 * Haversine formula — returns great-circle distance in kilometres.
 * Thin wrapper over {@link haversineMeters} (the single source of truth) so
 * road alerts get km without duplicating the formula.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return haversineMeters(lat1, lon1, lat2, lon2) / 1000;
}

/**
 * Convert an OSM `construction` or `highway` tag value to a human-readable
 * road-type label. Looks up an i18n key first, then falls back to title-case.
 */
export function humanizeConstructionType(
  type: string,
  t: (key: string) => string
): string {
  const key = `home.roadTypes.${type.toLowerCase()}`;
  const translated = t(key);
  // i18next returns the key itself when not found; fall back to formatted type
  if (translated !== key) return translated;
  return type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
