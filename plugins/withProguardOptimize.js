/**
 * Expo config plugin: enable R8 optimization passes in release builds.
 *
 * The React Native / Expo Gradle template configures release builds with
 * getDefaultProguardFile("proguard-android.txt"), which contains -dontoptimize,
 * so R8 only shrinks and obfuscates. Google Play's release dashboard flags this
 * as "Optimization isn't enabled" (R8 optimization advisory).
 *
 * This plugin swaps the default rules file for "proguard-android-optimize.txt"
 * in android/app/build.gradle so R8 runs its optimization passes (inlining,
 * class merging, dead-code elimination), reducing APK size and improving
 * runtime performance.
 */
const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withProguardOptimize(config) {
  return withAppBuildGradle(config, (mod) => {
    // Idempotent: skip if the optimize variant is already referenced.
    if (mod.modResults.contents.includes("proguard-android-optimize.txt")) {
      return mod;
    }

    mod.modResults.contents = mod.modResults.contents.replace(
      /getDefaultProguardFile\((["'])proguard-android\.txt\1\)/g,
      (_match, quote) =>
        `getDefaultProguardFile(${quote}proguard-android-optimize.txt${quote})`
    );

    return mod;
  });
};
