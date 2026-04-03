import "../lib/i18n";
// Register background location task before any navigation renders.
import "../lib/locationTask";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { SettingsProvider } from "../lib/settings";
import { ErrorBoundary } from "../components/ErrorBoundary";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications: typeof import("expo-notifications") | null = (() => { try { return require("expo-notifications"); } catch { return null; } })();

export default function RootLayout() {
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

  return (
    <ErrorBoundary>
      <SettingsProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
