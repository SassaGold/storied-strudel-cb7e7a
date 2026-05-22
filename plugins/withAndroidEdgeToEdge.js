/**
 * Expo config plugin: fix deprecated Android Window color APIs in edge-to-edge setup.
 *
 * React Native's WindowUtilKt.enableEdgeToEdge() calls the deprecated
 * Window.setStatusBarColor() and Window.setNavigationBarColor() APIs, which
 * Google Play flags for apps targeting Android 15 (API 35).
 *
 * This plugin patches the generated MainActivity.kt to:
 *   1. Override isEdgeToEdgeEnabled() → false in the ReactActivityDelegate so
 *      WindowUtilKt.enableEdgeToEdge() is never invoked.
 *   2. Add an onCreate() override that calls WindowCompat.setDecorFitsSystemWindows()
 *      instead — the non-deprecated equivalent that still gives proper edge-to-edge
 *      behaviour on Android 12–14 while satisfying Android 15's requirements.
 *
 * Layout/safe-area handling is unaffected because the app uses
 * react-native-safe-area-context (useSafeAreaInsets) which reads actual window
 * insets directly, independently of React Native's isEdgeToEdgeEnabled constant.
 */
const { withMainActivity } = require("@expo/config-plugins");

module.exports = function withAndroidEdgeToEdge(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== "kotlin") return mod;

    let { contents } = mod.modResults;

    // 1. Add required imports before the class declaration (idempotent).
    if (!contents.includes("androidx.core.view.WindowCompat")) {
      contents = contents.replace(
        "\nclass MainActivity",
        "\nimport android.os.Bundle\nimport androidx.core.view.WindowCompat\n\nclass MainActivity"
      );
    }

    // 2. Override isEdgeToEdgeEnabled() inside the anonymous DefaultReactActivityDelegate
    //    subclass so WindowUtilKt.enableEdgeToEdge() is never called.
    //    The generated body is empty: ) {}  — we replace it with the override.
    if (!contents.includes("isEdgeToEdgeEnabled")) {
      contents = contents.replace(
        /(object\s*:\s*DefaultReactActivityDelegate\s*\([\s\S]*?\))\s*\{\s*\}/,
        "$1 {\n        override fun isEdgeToEdgeEnabled(): Boolean = false\n      }"
      );
    }

    // 3. Add MainActivity.onCreate() to enable edge-to-edge via the non-deprecated API.
    if (!contents.includes("override fun onCreate")) {
      const onCreateMethod =
        "\n  override fun onCreate(savedInstanceState: Bundle?) {\n" +
        "    // Non-deprecated edge-to-edge setup replacing WindowUtilKt.enableEdgeToEdge()\n" +
        "    WindowCompat.setDecorFitsSystemWindows(window, false)\n" +
        "    super.onCreate(savedInstanceState)\n" +
        "  }";

      // Insert just before the final closing brace of the class.
      const lastBrace = contents.lastIndexOf("\n}");
      if (lastBrace !== -1) {
        contents =
          contents.substring(0, lastBrace) +
          onCreateMethod +
          "\n" +
          contents.substring(lastBrace);
      }
    }

    mod.modResults.contents = contents;
    return mod;
  });
};
