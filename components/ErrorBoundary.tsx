// ── components/ErrorBoundary.tsx ─────────────────────────────────────────────
// Reusable React error boundary that catches render errors in its subtree and
// displays a user-friendly fallback with a "Try Again" button.

import { Component } from "react";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  children: ReactNode;
  /** Heading shown in the fallback UI (default: "Something went wrong") */
  title?: string;
  /** Retry button label (default: "Try Again") */
  retryLabel?: string;
};

type State = {
  hasError: boolean;
  message: string;
};

/**
 * Wrap any subtree in `<ErrorBoundary>` to catch unhandled render errors and
 * show a graceful fallback instead of a blank / crashed screen.
 *
 * @example
 * <ErrorBoundary title="Oops!" retryLabel="Reload">
 *   <MyScreen />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  render() {
    const {
      title = "Something went wrong",
      retryLabel = "Try Again",
      children,
    } = this.props;

    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{this.state.message}</Text>
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={() => this.setState({ hasError: false, message: "" })}
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
          >
            <Text style={styles.btnText}>{retryLabel}</Text>
          </Pressable>
        </View>
      );
    }

    return children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  message: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 24,
  },
  btn: {
    backgroundColor: "#ff6600",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  btnPressed: { opacity: 0.75 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
