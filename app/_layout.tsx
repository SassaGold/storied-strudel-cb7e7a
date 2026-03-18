import "../lib/i18n";
import { Stack } from "expo-router";
import { SettingsProvider } from "../lib/settings";
import { ErrorBoundary } from "../components/ErrorBoundary";

export default function RootLayout() {
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
