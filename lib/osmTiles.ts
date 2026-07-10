// ── OSM raster-tile helpers ───────────────────────────────────────────────────
// Web-Mercator tile math shared by map previews (ride route, POI results).
// Mirrors the projection used by the trip-logger route preview.

import { OSM_TILE_URL } from "./config";

/** Standard OSM/Web-Mercator tile size in pixels. */
export const TILE_PX = 256;

const MAX_TILE_ZOOM = 16;
const MIN_TILE_ZOOM = 3;

/** Fractional tile X for a longitude at zoom z. */
export const lngToTileFrac = (lng: number, z: number): number =>
  ((lng + 180) / 360) * Math.pow(2, z);

/** Fractional tile Y for a latitude at zoom z (Web Mercator). */
export const latToTileFrac = (lat: number, z: number): number => {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, z);
};

/** Build a tile image URL from the OSM template. */
export const tileUrl = (z: number, x: number, y: number): string =>
  OSM_TILE_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));

export type Bounds = { minLat: number; maxLat: number; minLon: number; maxLon: number };

/** Bounding box of a set of points, or null if empty. */
export function boundsOf(points: { latitude: number; longitude: number }[]): Bounds | null {
  if (points.length === 0) return null;
  let minLat = points[0].latitude, maxLat = points[0].latitude;
  let minLon = points[0].longitude, maxLon = points[0].longitude;
  for (const p of points) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLon) minLon = p.longitude;
    if (p.longitude > maxLon) maxLon = p.longitude;
  }
  return { minLat, maxLat, minLon, maxLon };
}

/** Pad a bounding box by a fraction of its extent (with a small minimum). */
export function padBounds(b: Bounds, pad = 0.2): Bounds {
  const latPad = (b.maxLat - b.minLat) * pad || 0.01;
  const lonPad = (b.maxLon - b.minLon) * pad || 0.01;
  return {
    minLat: b.minLat - latPad,
    maxLat: b.maxLat + latPad,
    minLon: b.minLon - lonPad,
    maxLon: b.maxLon + lonPad,
  };
}

/** Highest zoom where the box fits within `across`×`down` tiles. */
function chooseBestZoom(b: Bounds, across: number, down: number): number {
  for (let z = MAX_TILE_ZOOM; z >= MIN_TILE_ZOOM; z--) {
    const tileW = lngToTileFrac(b.maxLon, z) - lngToTileFrac(b.minLon, z);
    const tileH = latToTileFrac(b.minLat, z) - latToTileFrac(b.maxLat, z);
    if (tileW <= across && tileH <= down) return z;
  }
  return MIN_TILE_ZOOM;
}

export type TileLayout = {
  z: number;
  txStart: number; tyStart: number; txEnd: number; tyEnd: number;
  scale: number; offsetX: number; offsetY: number;
};

/**
 * Compute the tile grid + scale to fit a padded bounding box into a container
 * of the given pixel size. Returns null until the container has been measured.
 */
export function computeTileLayout(
  bounds: Bounds,
  containerWidth: number,
  containerHeight: number,
): TileLayout | null {
  if (containerWidth <= 0 || containerHeight <= 0) return null;
  const across = Math.max(1, Math.round(containerWidth / TILE_PX) + 1);
  const down = Math.max(1, Math.round(containerHeight / TILE_PX) + 1);
  const z = chooseBestZoom(bounds, across, down);
  const txStart = Math.floor(lngToTileFrac(bounds.minLon, z));
  const txEnd = Math.floor(lngToTileFrac(bounds.maxLon, z));
  const tyStart = Math.floor(latToTileFrac(bounds.maxLat, z)); // smaller y = more northern
  const tyEnd = Math.floor(latToTileFrac(bounds.minLat, z));
  const worldW = (txEnd - txStart + 1) * TILE_PX;
  const worldH = (tyEnd - tyStart + 1) * TILE_PX;
  const scale = Math.min(containerWidth / worldW, containerHeight / worldH);
  const offsetX = (containerWidth - worldW * scale) / 2;
  const offsetY = (containerHeight - worldH * scale) / 2;
  return { z, txStart, tyStart, txEnd, tyEnd, scale, offsetX, offsetY };
}

export type Tile = { key: string; url: string; x: number; y: number; size: number };

/** The list of tiles to render for a layout. */
export function buildTiles(layout: TileLayout): Tile[] {
  const { z, txStart, txEnd, tyStart, tyEnd, scale, offsetX, offsetY } = layout;
  const renderedSize = TILE_PX * scale;
  const tiles: Tile[] = [];
  for (let tx = txStart; tx <= txEnd; tx++) {
    for (let ty = tyStart; ty <= tyEnd; ty++) {
      tiles.push({
        key: `${z}-${tx}-${ty}`,
        url: tileUrl(z, tx, ty),
        x: offsetX + (tx - txStart) * renderedSize,
        y: offsetY + (ty - tyStart) * renderedSize,
        size: renderedSize,
      });
    }
  }
  return tiles;
}

/** Project a lat/lon to container [x, y] using the same Mercator scale as the tiles. */
export function projectToScreen(layout: TileLayout, lat: number, lon: number): [number, number] {
  const { z, txStart, tyStart, scale, offsetX, offsetY } = layout;
  const x = offsetX + (lngToTileFrac(lon, z) - txStart) * TILE_PX * scale;
  const y = offsetY + (latToTileFrac(lat, z) - tyStart) * TILE_PX * scale;
  return [x, y];
}
