import "../lib/i18n";
// Register the background location task before any component mounts.
// Must be imported here (root layout) so it's always registered, even when
// the OS wakes the app for a background location event.
import "../lib/locationTask";
import { Stack } from "expo-router";
import { SettingsProvider } from "../lib/settings";

export default function RootLayout() {
  return (
    <SettingsProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </SettingsProvider>
  );
}
