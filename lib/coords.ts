/**
 * Pure coordinate helpers shared by the Trip Logger route map and trip stats.
 *
 * This file was `lib/mapMatch.ts`, which also called the public OSRM demo
 * server to snap recorded rides to the road network. That was removed on
 * 2026-07-25: it sent the full trip trace (coordinates + timestamps) to a
 * third party automatically on every route render, which is a privacy and
 * Play Data-safety cost the app was paying for a purely cosmetic improvement.
 * Routes now render from the raw GPS points, which was already the fallback
 * path whenever OSRM was slow, overloaded or unable to match.
 */

/**
 * Downsample an array of coordinates to at most `max` points,
 * keeping the first and last point.
 */
export function downsampleCoords<T>(coords: T[], max: number): T[] {
  if (coords.length <= max) return coords;
  const result: T[] = [];
  const step = (coords.length - 1) / (max - 1);
  for (let i = 0; i < max - 1; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  result.push(coords[coords.length - 1]);
  return result;
}
