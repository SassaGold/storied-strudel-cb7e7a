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

    const resolutionBlock =
      "\n// Force Material library version to replace deprecated Window color APIs (Android 15)\n" +
      "configurations.all {\n" +
      "    resolutionStrategy {\n" +
      `        force 'com.google.android.material:material:${MATERIAL_VERSION}'\n` +
      "    }\n" +
      "}\n";

    // Insert after the closing brace of the `dependencies` block when present,
    // otherwise fall back to appending at the end.
    const depBlockEnd = mod.modResults.contents.lastIndexOf("\ndependencies {");
    if (depBlockEnd !== -1) {
      // Find the matching closing brace for the dependencies block.
      let depth = 0;
      let closeIdx = -1;
      for (let i = depBlockEnd + 1; i < mod.modResults.contents.length; i++) {
        if (mod.modResults.contents[i] === "{") depth++;
        else if (mod.modResults.contents[i] === "}") {
          depth--;
          if (depth === 0) { closeIdx = i; break; }
        }
      }
      if (closeIdx !== -1) {
        mod.modResults.contents =
          mod.modResults.contents.substring(0, closeIdx + 1) +
          resolutionBlock +
          mod.modResults.contents.substring(closeIdx + 1);
      } else {
        mod.modResults.contents += resolutionBlock;
      }
    } else {
      mod.modResults.contents += resolutionBlock;
    }

    return mod;
  });
};
