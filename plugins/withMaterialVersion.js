/**
 * Expo config plugin: pin com.google.android.material to a version that uses
 * WindowInsetsControllerCompat instead of the deprecated Window.setNavigationBarColor()
 * API flagged by Google Play for Android 15 (API 35) targets.
 *
 * The obfuscated call site com.google.android.material.internal.c.a reported by
 * Google Play comes from the Material library's internal system-bar handling. Version
 * 1.12.0 replaces those deprecated window colour calls with the modern insets API.
 *
 * A Gradle configurations.all resolution strategy is appended to android/app/build.gradle
 * so the correct version is used regardless of which transitive dependency pulls it in.
 */
const { withAppBuildGradle } = require("@expo/config-plugins");

const MATERIAL_VERSION = "1.12.0";

module.exports = function withMaterialVersion(config) {
  return withAppBuildGradle(config, (mod) => {
    const marker = `com.google.android.material:material:${MATERIAL_VERSION}`;

    // Idempotent: skip if the resolution strategy is already present.
    if (mod.modResults.contents.includes(marker)) {
      return mod;
    }

    mod.modResults.contents +=
      "\n// Force Material library version to replace deprecated Window color APIs (Android 15)\n" +
      "configurations.all {\n" +
      "    resolutionStrategy {\n" +
      `        force 'com.google.android.material:material:${MATERIAL_VERSION}'\n` +
      "    }\n" +
      "}\n";

    return mod;
  });
};
