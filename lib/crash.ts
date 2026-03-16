// ── Crash Reporter ────────────────────────────────────────────────────────────
// Thin adapter that wraps crash/error reporting.
//
// In development, errors are logged to the console only.
// In production, errors are forwarded to Sentry when SENTRY_DSN is set
// (requires @sentry/react-native to be installed — see SIGNING.md for setup).
//
// Usage:
//   import { crashReporter } from "../lib/crash";
//   crashReporter.captureException(error);
//   crashReporter.captureMessage("something went wrong");

import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
const sentryDsn = (extra.sentryDsn as string | undefined) ?? "";

interface SentryLike {
  captureException: (e: unknown) => void;
  captureMessage: (msg: string) => void;
}

let _sentry: SentryLike | null = null;

/** Lazily initialise Sentry only when a DSN is configured. */
function getSentry(): SentryLike | null {
  if (_sentry) return _sentry;
  if (!sentryDsn) return null;
  try {
    // Dynamic require so the module is optional — the app won't crash if
    // @sentry/react-native is not yet installed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const Sentry: any = require("@sentry/react-native");
    Sentry.init({ dsn: sentryDsn });
    _sentry = {
      captureException: (e) => Sentry.captureException(e),
      captureMessage: (msg) => Sentry.captureMessage(msg),
    };
    return _sentry;
  } catch {
    // @sentry/react-native not installed — fall through to console fallback.
    return null;
  }
}

export const crashReporter = {
  captureException(error: unknown): void {
    const sentry = getSentry();
    if (sentry) {
      sentry.captureException(error);
    } else {
      console.error("[crash] unhandled exception:", error);
    }
  },
  captureMessage(message: string): void {
    const sentry = getSentry();
    if (sentry) {
      sentry.captureMessage(message);
    } else {
      console.warn("[crash] message:", message);
    }
  },
};

/**
 * Register a global JS error handler that forwards to crashReporter.
 * ErrorUtils is a React Native global available on iOS and Android.
 */
export function registerGlobalErrorHandler(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const EU = (global as any).ErrorUtils as
    | {
        getGlobalHandler: () => (error: unknown, isFatal: boolean) => void;
        setGlobalHandler: (
          handler: (error: unknown, isFatal: boolean) => void
        ) => void;
      }
    | undefined;

  if (!EU) return; // Not available on web

  const prev = EU.getGlobalHandler();
  EU.setGlobalHandler((error: unknown, isFatal: boolean) => {
    crashReporter.captureException(error);
    if (prev) prev(error, isFatal);
  });
}

