// ── Skeleton placeholder list ─────────────────────────────────────────────────
// Pulsing placeholder rows shown while a nearby-places search is in flight,
// so the screen shows where results will land instead of a large empty void
// (Overpass searches routinely take several seconds).

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { COLORS } from "../lib/theme";

const TINT_COLORS = {
  brand: COLORS.brand,
  danger: COLORS.danger,
} as const;

export default function SkeletonList({
  rows = 4,
  tint = "brand",
}: {
  rows?: number;
  /** Accent used for the row's left edge — matches the screen's theme. */
  tint?: keyof typeof TINT_COLORS;
}) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: rows }, (_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.row,
            { opacity: pulse, borderLeftColor: TINT_COLORS[tint] },
          ]}
        >
          <View style={styles.lineWide} />
          <View style={styles.lineNarrow} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: COLORS.card,
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
  },
  lineWide: {
    height: 14,
    width: "65%",
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  lineNarrow: {
    height: 11,
    width: "35%",
    borderRadius: 4,
    backgroundColor: COLORS.border,
    marginTop: 9,
  },
});
