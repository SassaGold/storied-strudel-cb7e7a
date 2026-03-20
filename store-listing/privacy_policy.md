# Privacy Policy — Where Am I

**Last updated: 2026-03-18**

Where Am I ("the app", "we", "our") is a free motorcycle companion app. This policy explains what data the app accesses, how it is used, and how your privacy is protected.

---

## 1. Data We Do NOT Collect

Where Am I does **not** collect, store, transmit, or share any personal data. Specifically:

- ❌ No user accounts or registration
- ❌ No analytics or usage tracking
- ❌ No crash reporting sent to external servers
- ❌ No advertising SDKs or third-party trackers
- ❌ No data is ever sent to servers operated by this app

---

## 2. Location Data

The app requests access to your device's GPS location for the following purposes:

| Feature | When location is used |
|---------|----------------------|
| Rider HQ (Home tab) | Reverse geocoding your current address; fetching nearby weather and road conditions |
| Food / Hotels / Attractions / Garage tabs | Finding nearby points of interest |
| SOS / Emergency tab | Finding nearest emergency services; sharing your coordinates via your device's share sheet |
| Trip Logger tab | Recording GPS route and calculating distance while riding |

**Your location is never sent to any server operated by Where Am I.**

When location is used for POI searches, anonymised coordinates are sent to these **third-party open APIs**:

- **Nominatim (OpenStreetMap)** — reverse geocoding: `https://nominatim.openstreetmap.org` — [Privacy Policy](https://osmfoundation.org/wiki/Privacy_Policy)
- **Overpass API** — POI queries: `https://overpass-api.de` — [Privacy Policy](https://wiki.openstreetmap.org/wiki/Overpass_API)
- **Open-Meteo** — weather data: `https://open-meteo.com` — [Privacy Policy](https://open-meteo.com/en/terms)

These are anonymous, keyless public APIs. They receive coordinates but no user identifiers.

---

## 3. Trip Logger Data

GPS coordinates recorded by the Trip Logger are stored **only on your device** using local storage (AsyncStorage). This data:

- Is never uploaded or transmitted anywhere
- Can be deleted at any time from within the app (Settings → Clear Cache, or per-ride delete)
- Is lost if you uninstall the app

---

## 4. Cache Storage

POI search results (restaurants, hotels, etc.) are cached **locally on your device** for 30 minutes to reduce network requests. This cache:

- Contains only OpenStreetMap POI data (place names, coordinates, contact info)
- Contains no personal data
- Can be cleared at any time via Settings → Clear Cached Data

---

## 5. Background Location

The app uses background location access **only when a trip is actively being recorded** in the Trip Logger. Background location is used solely to track GPS points while the screen is locked. The app does not access location in the background at any other time.

---

## 6. Third-Party Services

The app uses the following third-party services. No personal data is sent to any of them beyond what is listed above.

| Service | Purpose | Privacy Policy |
|---------|---------|----------------|
| OpenStreetMap / Nominatim | Address lookup & POI data | [osmfoundation.org/wiki/Privacy_Policy](https://osmfoundation.org/wiki/Privacy_Policy) |
| Overpass API | POI queries | [wiki.openstreetmap.org/wiki/Overpass_API](https://wiki.openstreetmap.org/wiki/Overpass_API) |
| Open-Meteo | Weather forecasts | [open-meteo.com/en/terms](https://open-meteo.com/en/terms) |
| Wikipedia REST API | Place descriptions | [wikimedia.org/wiki/Privacy_policy](https://foundation.wikimedia.org/wiki/Privacy_policy) |
| Expo Updates | Over-the-air app updates | [expo.dev/privacy](https://expo.dev/privacy) |

---

## 7. Children's Privacy

Where Am I does not knowingly collect any data from children under the age of 13. The app contains no features targeting children.

---

## 8. Changes to This Policy

If this policy is updated, the "Last updated" date at the top of this document will be changed. Significant changes will be noted in the app's CHANGELOG.

---

## 9. Contact

If you have questions about this privacy policy, please open an issue at:

**https://github.com/SassaGold/storied-strudel-cb7e7a/issues**
