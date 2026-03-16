import "../lib/i18n";
// Register the background location task before any component mounts.
// Must be imported here (root layout) so it's always registered, even when
// the OS wakes the app for a background location event.
import "../lib/locationTask";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { SettingsProvider } from "../lib/settings";
import ErrorBoundary from "../components/ErrorBoundary";
import { registerGlobalErrorHandler } from "../lib/crash";

export default function RootLayout() {
  useEffect(() => {
    registerGlobalErrorHandler();
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
