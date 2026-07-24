// ── POI results map ───────────────────────────────────────────────────────────
// Renders a set of places as numbered markers over OSM raster tiles. Shares the
// Web-Mercator projection used by the trip-logger route preview.

import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  /** Number of map tiles that failed to load (offline / tile server down). */
  const [tileErrors, setTileErrors] = useState(0);

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

  // A new tile set (layout/zoom change) gets a fresh error count.
  useEffect(() => { setTileErrors(0); }, [tiles]);

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
          onError={() => setTileErrors((n) => n + 1)}
          style={{ position: "absolute", left: tile.x, top: tile.y, width: tile.size, height: tile.size }}
        />
      ))}

      {/* All tiles failed (offline / tile server down) — explain the black box */}
      {tiles.length > 0 && tileErrors >= tiles.length && (
        <View style={styles.mapUnavailableOverlay} pointerEvents="none">
          <Text style={styles.mapUnavailableText}>{t("common.mapUnavailable")}</Text>
        </View>
      )}

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
            // 26 px marker is below the 44 px minimum touch target
            hitSlop={10}
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
    backgroundColor: "#0C1120",
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
  mapUnavailableOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  mapUnavailableText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
