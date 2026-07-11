// ── POI results map ───────────────────────────────────────────────────────────
// Renders a set of places as numbered markers over OSM raster tiles. Shares the
// Web-Mercator projection used by the trip-logger route preview.

import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { OSM_USER_AGENT } from "../lib/config";
import {
  type Bounds,
  boundsOf,
  padBounds,
  computeTileLayout,
  buildTiles,
  projectToScreen,
} from "../lib/osmTiles";

import { COLORS } from "../lib/theme";
type Marker = { id: string; latitude: number; longitude: number };

type Props<T extends Marker> = {
  places: T[];
  userLocation?: { latitude: number; longitude: number } | null;
  onPressPlace?: (place: T) => void;
  /** Accessible label prefix for a marker, e.g. "Info about {name}". */
  markerLabel?: (place: T, index: number) => string;
  height?: number;
};

export default function POIMap<T extends Marker>({
  places,
  userLocation,
  onPressPlace,
  markerLabel,
  height = 320,
}: Props<T>) {
  const [width, setWidth] = useState(0);

  const bounds: Bounds | null = useMemo(() => {
    const pts = [...places, ...(userLocation ? [userLocation] : [])];
    const b = boundsOf(pts);
    return b ? padBounds(b, 0.2) : null;
  }, [places, userLocation]);

  const layout = useMemo(
    () => (bounds ? computeTileLayout(bounds, width, height) : null),
    [bounds, width, height]
  );

  const tiles = useMemo(() => (layout ? buildTiles(layout) : []), [layout]);

  return (
    <View
      style={[styles.container, { height }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {/* OSM tiles */}
      {tiles.map((tile) => (
        <Image
          key={tile.key}
          source={{ uri: tile.url, headers: { "User-Agent": OSM_USER_AGENT } }}
          style={{ position: "absolute", left: tile.x, top: tile.y, width: tile.size, height: tile.size }}
        />
      ))}

      {/* User location (blue dot) */}
      {layout && userLocation && (() => {
        const [x, y] = projectToScreen(layout, userLocation.latitude, userLocation.longitude);
        return (
          <View style={[styles.userDot, { left: x - 7, top: y - 7 }]} pointerEvents="none" />
        );
      })()}

      {/* Place markers (numbered by list order = distance) */}
      {layout && places.map((place, i) => {
        const [x, y] = projectToScreen(layout, place.latitude, place.longitude);
        return (
          <Pressable
            key={place.id}
            style={[styles.marker, { left: x - 13, top: y - 13 }]}
            onPress={() => onPressPlace?.(place)}
            accessibilityRole="button"
            accessibilityLabel={markerLabel ? markerLabel(place, i) : String(i + 1)}
          >
            <Text style={styles.markerText}>{i + 1}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#0d0d0d",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userDot: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#3b82f6",
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  marker: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.brand,
    borderWidth: 2,
    borderColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },
  markerText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "900",
  },
});
