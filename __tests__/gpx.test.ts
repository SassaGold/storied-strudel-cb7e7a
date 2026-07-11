// Tests for the GPX 1.1 document builder (lib/gpx.ts).

import { buildGpx, gpxFileName } from "../lib/gpx";
import type { GpsPoint } from "../lib/tripStats";

const route: GpsPoint[] = [
  { latitude: 59.9139, longitude: 10.7522, timestamp: 1760000000000 },
  { latitude: 59.9149, longitude: 10.7532, timestamp: 1760000010000 },
];

describe("buildGpx", () => {
  it("produces a GPX 1.1 document with one trkpt per point", () => {
    const gpx = buildGpx(route, "Morning Ride");
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect((gpx.match(/<trkpt /g) ?? []).length).toBe(2);
  });

  it("writes coordinates with 6 decimals and ISO timestamps", () => {
    const gpx = buildGpx(route, "Ride");
    expect(gpx).toContain('lat="59.913900" lon="10.752200"');
    expect(gpx).toContain(`<time>${new Date(1760000000000).toISOString()}</time>`);
  });

  it("uses the first point's time as metadata time by default", () => {
    const gpx = buildGpx(route, "Ride");
    const metaTime = new Date(1760000000000).toISOString();
    expect(gpx).toContain(`<metadata>\n    <name>Ride</name>\n    <time>${metaTime}</time>`);
  });

  it("prefers an explicit startedAt for metadata time", () => {
    const gpx = buildGpx(route, "Ride", 1759999990000);
    expect(gpx).toContain(`<time>${new Date(1759999990000).toISOString()}</time>`);
  });

  it("escapes XML special characters in the name", () => {
    const gpx = buildGpx(route, 'Tom & "Jerry" <ride>');
    expect(gpx).toContain("<name>Tom &amp; &quot;Jerry&quot; &lt;ride&gt;</name>");
    expect(gpx).not.toContain("<name>Tom & ");
  });

  it("handles an empty route without throwing", () => {
    const gpx = buildGpx([], "Empty");
    expect(gpx).toContain("<trkseg>");
    expect(gpx).not.toContain("<trkpt");
  });
});

describe("gpxFileName", () => {
  it("builds a filesystem-safe name from seq and date", () => {
    expect(gpxFileName(5, "2026-07-11T09:30:00.000Z")).toBe("ride-5-2026-07-11.gpx");
  });

  it("falls back when seq is missing", () => {
    expect(gpxFileName(undefined, "2026-07-11T09:30:00.000Z")).toBe("ride-x-2026-07-11.gpx");
  });
});
