// ── Nordic Aurora theme ───────────────────────────────────────────────────────
// Single source of truth for the app's dark theme. Screens and components import
// COLORS instead of repeating hex literals.
//
// Direction: a deep midnight-navy base lit by an aurora — teal primary, violet
// partner, ice-blue frost highlights. Semantic colors (success/danger/warning)
// are kept recognizable but tuned to sit on navy. Opacity variants
// (e.g. "rgba(47,212,196,0.27)") are left inline where used — they encode a
// specific alpha for one context and read clearer next to their solid counterpart.

export const COLORS = {
  /** Aurora teal — buttons, highlights, active states (primary accent). */
  brand: "#2FD4C4",
  /** Darker teal for pressed / deep accents. */
  brandDeep: "#17B9AC",
  /** Aurora violet — gradient partner and secondary accent. */
  secondary: "#8E86F5",
  /** Ice blue — cool highlights (frost, weather, cold cues). */
  frost: "#7DD3FC",
  /** Screen background — midnight navy. */
  bg: "#0A0E1A",
  /** Card / surface background. */
  card: "#141C2E",
  /** Raised surface — inputs and subtly-elevated fills. */
  surface: "#1B2438",
  /** Card borders and dividers. */
  border: "#28324A",
  /** Primary (near-white) text and light foregrounds. */
  white: "#F4F7FC",
  /** Body text. */
  body: "#C4CCDC",
  /** Muted / secondary text. Kept at ≥4.5:1 (WCAG AA) against bg/card. */
  muted: "#8A93A8",
  /** Text/icon color on top of the teal/aurora accent (buttons). */
  onAccent: "#04121A",
  /** Success / positive (green). */
  success: "#22c55e",
  /** Danger / SOS (red). */
  danger: "#ef4444",
  /** Warning / stale-data (amber sun). */
  warning: "#f59e0b",
} as const;

// ── Aurora gradients ───────────────────────────────────────────────────────────
// Used by hero headers and primary CTAs (via expo-linear-gradient) for the
// signature northern-lights sweep. Keep stops in this teal → sky → violet order.

/** Vivid aurora sweep for primary buttons / accents. */
export const AURORA = ["#2FD4C4", "#4FB8E0", "#8E86F5"] as const;
/** Soft aurora wash for hero header backdrops (low alpha over navy). */
export const AURORA_SOFT = [
  "rgba(47,212,196,0.20)",
  "rgba(79,184,224,0.10)",
  "rgba(142,134,245,0.20)",
] as const;
/** Deep navy vertical fade for header cards (top → base). */
export const HEADER_FADE = ["#132138", "#0C1424"] as const;

// ── Typography ───────────────────────────────────────────────────────────────
// Oswald (condensed sans) is loaded once in app/_layout.tsx via
// @expo-google-fonts/oswald. Body text stays on the system font; these
// families are for screen titles and other display-sized text only.
export const FONTS = {
  /** Display face for big screen titles (FEED THE BEAST, THE GARAGE, …). */
  display: "Oswald_700Bold",
  /** Lighter display face for sub-headers / badges when needed. */
  displayMedium: "Oswald_600SemiBold",
} as const;
