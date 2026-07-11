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
  /** Muted / secondary text. */
  muted: "#666666",
  /** Success / positive (green). */
  success: "#22c55e",
  /** Danger / SOS (red). */
  danger: "#ef4444",
  /** Warning / stale-data (amber). */
  warning: "#f59e0b",
} as const;
