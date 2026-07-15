/**
 * Expo config plugin: strip the portrait-only restriction from ML Kit's
 * GmsBarcodeScanningDelegateActivity.
 *
 * The play-services code-scanner library (pulled in transitively) declares
 *   <activity android:name="...GmsBarcodeScanningDelegateActivity"
 *             android:screenOrientation="portrait" />
 * which Google Play's release dashboard flags as an orientation restriction
 * that Android 16+ ignores on large-screen devices (foldables/tablets).
 *
 * This plugin adds a manifest-merger override in the app's AndroidManifest.xml
 * that removes the android:screenOrientation attribute from that activity
 * (tools:remove), silencing the advisory. The app itself has no barcode
 * scanning feature, so the activity is never shown to users.
 */
const { withAndroidManifest } = require("@expo/config-plugins");

const ACTIVITY_NAME =
  "com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity";

module.exports = function withMlkitOrientationFix(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    // Ensure the tools namespace is declared on the <manifest> root.
    manifest.$ = manifest.$ || {};
    if (!manifest.$["xmlns:tools"]) {
      manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    const application = manifest.application && manifest.application[0];
    if (!application) return mod;

    application.activity = application.activity || [];

    // Idempotent: reuse an existing override entry if present.
    let activity = application.activity.find(
      (a) => a.$ && a.$["android:name"] === ACTIVITY_NAME
    );
    if (!activity) {
      activity = { $: { "android:name": ACTIVITY_NAME } };
      application.activity.push(activity);
    }
    activity.$["tools:remove"] = "android:screenOrientation";

    return mod;
  });
};
