import "../lib/i18n";
// Register background location task before any navigation renders.
import "../lib/locationTask";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import {
  useFonts,
  Oswald_600SemiBold,
  Oswald_700Bold,
} from "@expo-google-fonts/oswald";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { SettingsProvider } from "../lib/settings";
import { LocationPermissionProvider } from "../lib/locationPermission";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { pruneStaleCaches } from "../lib/storage";

/** ErrorBoundary is a class component and can't use hooks — this wrapper
 *  feeds it translated fallback strings so a crash screen isn't
 *  English-only in the 8 other supported languages. */
function LocalizedErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <ErrorBoundary title={t("common.errorTitle")} retryLabel={t("common.tryAgain")}>
      {children}
    </ErrorBoundary>
  );
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications: typeof import("expo-notifications") | null = (() => { try { return require("expo-notifications"); } catch { return null; } })();

export default function RootLayout() {
  // Display font for screen titles (see FONTS in lib/theme.ts). Rendering is
  // gated below: referencing an unloaded font family throws on native.
  const [fontsLoaded] = useFonts({ Oswald_600SemiBold, Oswald_700Bold });

  // Fire-and-forget: sweep week-old / orphaned cache_* entries so retired
  // versioned keys don't accumulate in AsyncStorage forever.
  useEffect(() => {
    pruneStaleCaches();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android" || !Notifications) return;
    Notifications.setNotificationChannelAsync("trip-logger", {
      name: "Trip Logger",
      description: "Foreground service updates while ride tracking is active",
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => {
      // Keep app startup resilient if notifications module/channel setup fails.
    });
  }, []);

  // Native splash screen stays visible during this brief gap.
  if (!fontsLoaded) return null;

  return (
    <LocalizedErrorBoundary>
      <SettingsProvider>
        <LocationPermissionProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </LocationPermissionProvider>
      </SettingsProvider>
    </LocalizedErrorBoundary>
  );
}
