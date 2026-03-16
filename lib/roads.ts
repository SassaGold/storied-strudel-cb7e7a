// ── Road alert types, constants, and utilities ───────────────────────────────
// Extracted from app/(tabs)/index.tsx.

import { haversineMeters } from "./overpass";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GeoAddress = {
  displayName: string;
  city?: string;
  country?: string;
};

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

export const CONSTRUCTION_TYPE_LABELS: Record<string, string> = {
  service: "Service Road",
  residential: "Residential Road",
  primary: "Primary Road",
  primary_link: "Primary Road",
  secondary: "Secondary Road",
  secondary_link: "Secondary Road",
  tertiary: "Tertiary Road",
  tertiary_link: "Tertiary Road",
  unclassified: "Unclassified Road",
  trunk: "Trunk Road",
  trunk_link: "Trunk Road",
  motorway: "Motorway",
  motorway_link: "Motorway",
  road: "Road",
  living_street: "Living Street",
  construction: "Road Construction",
  bridge: "Bridge Works",
  tunnel: "Tunnel Works",
};

/** OSM construction/highway values that represent actual road work. */
export const ROAD_TYPES = new Set(Object.keys(CONSTRUCTION_TYPE_LABELS));

// ── Utilities ─────────────────────────────────────────────────────────────────

export function humanizeConstructionType(type: string): string {
  const normalized = type.toLowerCase().replace(/_/g, " ");
  return (
    CONSTRUCTION_TYPE_LABELS[type.toLowerCase()] ??
    normalized.replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Returns the great-circle distance in kilometres. Delegates to the canonical
 *  `haversineMeters` implementation in overpass.ts to avoid duplication. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineMeters(lat1, lon1, lat2, lon2) / 1000;
}
