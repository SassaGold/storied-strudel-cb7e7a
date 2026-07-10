// Tests for lib/osmTiles.ts — pure Web-Mercator tile math.

import {
  lngToTileFrac,
  latToTileFrac,
  boundsOf,
  padBounds,
  computeTileLayout,
  buildTiles,
  projectToScreen,
} from "../lib/osmTiles";

describe("tile fraction math", () => {
  it("maps lon 0 to the horizontal middle at zoom 0", () => {
    expect(lngToTileFrac(0, 0)).toBeCloseTo(0.5, 6);
  });
  it("maps the equator to the vertical middle at zoom 0", () => {
    expect(latToTileFrac(0, 0)).toBeCloseTo(0.5, 6);
  });
  it("increases tile X with longitude", () => {
    expect(lngToTileFrac(10, 5)).toBeGreaterThan(lngToTileFrac(-10, 5));
  });
  it("increases tile Y as latitude decreases (south)", () => {
    expect(latToTileFrac(50, 5)).toBeLessThan(latToTileFrac(40, 5));
  });
});

describe("boundsOf / padBounds", () => {
  const pts = [
    { latitude: 59.9, longitude: 10.7 },
    { latitude: 60.0, longitude: 10.8 },
  ];
  it("computes a bounding box", () => {
    expect(boundsOf(pts)).toEqual({ minLat: 59.9, maxLat: 60.0, minLon: 10.7, maxLon: 10.8 });
  });
  it("returns null for no points", () => {
    expect(boundsOf([])).toBeNull();
  });
  it("expands the box", () => {
    const b = padBounds(boundsOf(pts)!, 0.2);
    expect(b.minLat).toBeLessThan(59.9);
    expect(b.maxLat).toBeGreaterThan(60.0);
    expect(b.minLon).toBeLessThan(10.7);
    expect(b.maxLon).toBeGreaterThan(10.8);
  });
});

describe("computeTileLayout / projectToScreen", () => {
  const bounds = padBounds({ minLat: 59.9, maxLat: 60.0, minLon: 10.7, maxLon: 10.8 });
  const W = 320, H = 200;
  const layout = computeTileLayout(bounds, W, H);

  it("returns null before the container is measured", () => {
    expect(computeTileLayout(bounds, 0, 0)).toBeNull();
  });

  it("produces a layout and at least one tile", () => {
    expect(layout).not.toBeNull();
    expect(buildTiles(layout!).length).toBeGreaterThan(0);
  });

  it("projects points inside the bounds within the container", () => {
    for (const [lat, lon] of [[59.95, 10.75], [59.9, 10.7], [60.0, 10.8]] as const) {
      const [x, y] = projectToScreen(layout!, lat, lon);
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(W + 1);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(H + 1);
    }
  });

  it("places more-western points left of more-eastern ones", () => {
    const [xWest] = projectToScreen(layout!, 59.95, 10.71);
    const [xEast] = projectToScreen(layout!, 59.95, 10.79);
    expect(xWest).toBeLessThan(xEast);
  });
});
