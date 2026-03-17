import "../lib/i18n";
import { Component } from "react";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { SettingsProvider } from "../lib/settings";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errStyles.container}>
          <Text style={errStyles.emoji}>⚠️</Text>
          <Text style={errStyles.title}>Something went wrong</Text>
          <Text style={errStyles.message}>{this.state.message}</Text>
          <Pressable
            style={({ pressed }) => [errStyles.btn, pressed && errStyles.btnPressed]}
            onPress={() => this.setState({ hasError: false, message: "" })}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={errStyles.btnText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const errStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  message: { color: "#888", fontSize: 13, textAlign: "center", marginBottom: 24 },
  btn: {
    backgroundColor: "#ff6600",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  btnPressed: { opacity: 0.75 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <SettingsProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </SettingsProvider>
    </AppErrorBoundary>
  );
}
