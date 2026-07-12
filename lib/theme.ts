// ── Shared color palette ─────────────────────────────────────────────────────
// Single source of truth for the app's dark theme. Screens and components
// import COLORS instead of repeating hex literals (the brand orange alone
// appeared 89 times before this module existed).
//
// Opacity variants (e.g. "rgba(255,102,0,0.27)") are left inline where used —
// they encode a specific alpha for one context and read clearer next to their
// solid counterpart.

export const COLORS = {
  /** Brand orange — buttons, highlights, active states. */
  brand: "#ff6600",
  /** Screen background. */
  bg: "#0a0a0a",
  /** Card / surface background. */
  card: "#141414",
  /** Card borders and dividers. */
  border: "#2a2a2a",
  /** Primary (white) text and light foregrounds. */
  white: "#ffffff",
  /** Body text. */
  body: "#c8c8c8",
  /** Muted / secondary text. Kept at ≥4.5:1 (WCAG AA) against bg/card —
   *  the previous #666666 was ~3:1 and unreadable in sunlight on a bike. */
  muted: "#8f8f8f",
  /** Success / positive (green). */
  success: "#22c55e",
  /** Danger / SOS (red). */
  danger: "#ef4444",
  /** Warning / stale-data (amber). */
  warning: "#f59e0b",
} as const;

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
