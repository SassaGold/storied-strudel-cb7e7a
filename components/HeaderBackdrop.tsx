// ── Header gradient backdrop ──────────────────────────────────────────────────
// Soft diagonal glow rendered behind screen-header content. Replaces the old
// absolutely-positioned "glow" circles, which React Native drew with hard
// edges (plain Views cannot be blurred), so they read as solid discs rather
// than light. The parent header must keep overflow:"hidden", a dark
// backgroundColor, and position content above this (it fills the header).

import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const TINTS = {
  brand: {
    main: [
      "rgba(255,102,0,0.50)",
      "rgba(255,102,0,0.12)",
      "rgba(255,102,0,0)",
    ],
    depth: ["rgba(180,60,0,0)", "rgba(180,60,0,0.30)"],
  },
  danger: {
    main: [
      "rgba(239,68,68,0.50)",
      "rgba(239,68,68,0.12)",
      "rgba(239,68,68,0)",
    ],
    depth: ["rgba(180,0,0,0)", "rgba(180,0,0,0.30)"],
  },
} as const;

export default function HeaderBackdrop({
  tint = "brand",
}: {
  tint?: keyof typeof TINTS;
}) {
  const colors = TINTS[tint];
  return (
    <>
      <LinearGradient
        colors={colors.main}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.2, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={colors.depth}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </>
  );
}
