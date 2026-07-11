// ── GPX export ────────────────────────────────────────────────────────────────
// Pure GPX 1.1 document builder for saved rides. Kept free of native imports
// so it is unit-testable; file writing/sharing lives in the Trip Logger screen.

import type { GpsPoint } from "./tripStats";

/** Escape the five XML special characters for element/attribute content. */
const escapeXml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * Build a GPX 1.1 document for a recorded route.
 * Points carry their GPS timestamps so ride time/speed survives the export
 * (Strava, Komoot, Garmin etc. all read this format).
 */
export function buildGpx(route: GpsPoint[], name: string, startedAt?: number): string {
  const safeName = escapeXml(name);
  const metaTime = new Date(startedAt ?? route[0]?.timestamp ?? Date.now()).toISOString();
  const points = route
    .map(
      (p) =>
        `      <trkpt lat="${p.latitude.toFixed(6)}" lon="${p.longitude.toFixed(6)}">` +
        `<time>${new Date(p.timestamp).toISOString()}</time></trkpt>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Where Am I" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
    <time>${metaTime}</time>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}

/** Filesystem-safe filename for an exported ride, e.g. "ride-5-2026-07-11.gpx". */
export function gpxFileName(seq: number | undefined, dateIso: string): string {
  const day = dateIso.slice(0, 10) || "ride";
  return `ride-${seq ?? "x"}-${day}.gpx`;
}
