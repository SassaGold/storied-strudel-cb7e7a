const appJson = require("./app.json");

// Google Maps API key for Android native map tiles.
// The key must never be committed to source control.
// Set GOOGLE_MAPS_ANDROID_API_KEY in your local .env file (see .env.example)
// and as an EAS secret for cloud builds.
// The MapView components in this app use PROVIDER_GOOGLE on Android, so a
// valid key is required for map tiles to load in production Android builds.
// On iOS, MapKit (Apple Maps) is used and no key is needed.
// On web, react-native-maps is not loaded at all.
module.exports = ({ config }) => {
  const base = appJson.expo ?? config;
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? "";
  return {
    ...base,
    android: {
      ...(base.android ?? {}),
      config: {
        ...((base.android ?? {}).config ?? {}),
        googleMaps: {
          apiKey: androidMapsKey,
        },
      },
    },
  };
};
