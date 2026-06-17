/**
 * OSRM Map Matching – snaps a sequence of GPS points to the road network
 * and returns the actual road geometry the user traveled.
 *
 * Uses the free OSRM public demo server for the "match" service which performs
 * GPS trace snapping (map matching) and returns the matched route geometry.
 *
 * @see https://project-osrm.org/docs/v5.24.0/api/#match-service
 */

type Coordinate = { latitude: number; longitude: number; timestamp?: number };

/** Decoded polyline point */
type LatLng = { latitude: number; longitude: number };

/**
 * Decode a Google-encoded polyline string (precision 5) into an array of coordinates.
 * OSRM returns geometries in this format by default.
 * @see https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

/** Maximum number of coordinates OSRM accepts per request */
const MAX_COORDS_PER_REQUEST = 100;

/**
 * Downsample an array of coordinates to at most `max` points,
 * keeping the first and last point.
 */
function downsampleCoords<T>(coords: T[], max: number): T[] {
  if (coords.length <= max) return coords;
  const result: T[] = [];
  const step = (coords.length - 1) / (max - 1);
  for (let i = 0; i < max - 1; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  result.push(coords[coords.length - 1]);
  return result;
}

/**
 * Call OSRM map-match API to snap GPS points to the road network.
 * Returns the matched road geometry as an array of LatLng points.
 *
 * Falls back to the original points if the API call fails or returns no match.
 */
export async function mapMatchRoute(points: Coordinate[]): Promise<LatLng[]> {
  if (points.length < 2) {
    return points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  }

  // OSRM has a limit of 100 coordinates per request – downsample if needed
  const sampled = downsampleCoords(points, MAX_COORDS_PER_REQUEST);

  // Build coordinates string: "lng,lat;lng,lat;..."
  const coordsStr = sampled
    .map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`)
    .join(";");

  // Build timestamps string if available
  const hasTimestamps = sampled.every((p) => p.timestamp != null);
  const timestampsParam = hasTimestamps
    ? `&timestamps=${sampled.map((p) => Math.round(p.timestamp! / 1000)).join(";")}`
    : "";

  // Radiuses: allow up to 50m deviation per point to improve matching
  const radiusesParam = `&radiuses=${sampled.map(() => "50").join(";")}`;

  const url =
    `https://router.project-osrm.org/match/v1/driving/${coordsStr}` +
    `?overview=full&geometries=polyline${timestampsParam}${radiusesParam}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "WhereAmI/1.0 (https://sassagold.com)" },
    });

    if (!response.ok) {
      // Fall back to original points on HTTP error
      return points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    }

    const data = await response.json();

    if (data.code !== "Ok" || !data.matchings || data.matchings.length === 0) {
      // No match found – fall back to original points
      return points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    }

    // Combine geometry from all matchings (there may be multiple if gaps exist)
    const allPoints: LatLng[] = [];
    for (const matching of data.matchings) {
      if (matching.geometry) {
        const decoded = decodePolyline(matching.geometry);
        allPoints.push(...decoded);
      }
    }

    return allPoints.length > 0
      ? allPoints
      : points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  } catch {
    // Network error – fall back to original points
    return points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  }
}
