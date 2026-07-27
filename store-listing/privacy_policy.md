# Privacy Policy — Vegvísir (formerly Where Am I — Ride Companion)

**Last updated: 2026-07-25**

Vegvísir ("the app", "we", "our") is a free motorcycle companion app. This policy explains what data the app accesses, how it is used, and how your privacy is protected.

---

## 1. Data We Do NOT Collect

Vegvísir has **no servers of its own**. We operate no backend, and no data of any
kind is sent to, stored on, or processed by infrastructure we control.
Specifically:

- ❌ No user accounts or registration
- ❌ No analytics or usage tracking
- ❌ No crash reporting sent to external servers
- ❌ No advertising SDKs or third-party trackers
- ❌ No data is ever sent to servers operated by this app

To work, the app does send your coordinates to independent public map and
weather services — no account, identifier or profile is attached, but the
requests do leave your device. Section 2 lists every one of them.

---

## 2. Location Data

The app requests access to your device's GPS location for the following purposes:

| Feature | When location is used |
|---------|----------------------|
| Rider HQ (Home tab) | Reverse geocoding your current address; fetching nearby weather and road conditions |
| Food / Hotels / Attractions / Garage tabs | Finding nearby points of interest |
| SOS / Emergency tab | Finding nearest emergency services; sharing your coordinates via your device's share sheet |
| Trip Logger tab | Recording GPS route and calculating distance while riding |

**Your location is never sent to any server operated by Vegvísir** — we have none.

Coordinates are sent to these **third-party open APIs**, all keyless and
anonymous. They receive coordinates but no user identifier:

| Service | What it receives | Terms |
|---------|------------------|-------|
| **Nominatim (OpenStreetMap)** `nominatim.openstreetmap.org` | your current coordinates, for reverse geocoding | [Privacy Policy](https://osmfoundation.org/wiki/Privacy_Policy) |
| **Overpass API** `overpass-api.de` and the mirror `overpass.kumi.systems` | your current coordinates, for POI queries | [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) |
| **Open-Meteo** `api.open-meteo.com` | your current coordinates, for weather | [Terms](https://open-meteo.com/en/terms) |
| **OSM tile server** `tile.openstreetmap.de` | the map tiles you view, which indicate the area you are looking at | [Tile policy](https://operations.osmfoundation.org/policies/tiles/) |
| **Wikipedia REST API** `*.wikipedia.org` | a place name only — **not** your coordinates | [Privacy Policy](https://foundation.wikimedia.org/wiki/Privacy_policy) |

POI searches are spread across both Overpass servers in rotation, so each of
them sees a share of the queries. A third mirror operated in Russia
(maps.mail.ru) was removed on 2026-07-25.

---

## 3. Trip Logger Data

GPS coordinates recorded by the Trip Logger are stored **only on your device**
using local storage (AsyncStorage). Distances, speeds and ride statistics are
calculated on-device from those points. Recorded routes are drawn on the map
directly from them; nothing about a recorded ride is sent anywhere. This data:

- Is never uploaded or transmitted anywhere
- Can be deleted at any time from within the app (Settings → Clear Cache, or per-ride delete)
- Is lost if you uninstall the app

Only if *you* choose to export a ride as a GPX file does it leave the device, via
your own device's share sheet, to wherever you send it.

> **Version note.** Versions 1.1.7 through 1.4.0 sent recorded routes to a
> third-party service (`router.project-osrm.org`) to snap them to the road
> network for display. That was removed in **1.4.1**, released 2026-07-27 —
> section 3 describes the app from that release onward. If you are running 1.4.0 or earlier, your recorded routes are still
> sent when a trip's route map is displayed.

---

## 4. Cache Storage

POI search results (restaurants, hotels, etc.) are cached **locally on your device** for 30 minutes to reduce network requests. This cache:

- Contains only OpenStreetMap POI data (place names, coordinates, contact info)
- Contains no personal data
- Can be cleared at any time via Settings → Clear Cached Data

---

## 5. Background Location

The app uses background location access **only when a trip is actively being recorded** in the Trip Logger. Background location is used solely to track GPS points while the screen is locked, writing them to on-device storage; the background service itself makes no network requests. The app does not access location in the background at any other time.

While background recording is active, Android shows an ongoing notification ("Recording your ride in the background") for as long as it continues.

---

## 6. Third-Party Services

The app uses the following third-party services. No personal data is sent to any of them beyond what is described in sections 2 and 3.

| Service | Purpose | Privacy Policy |
|---------|---------|----------------|
| OpenStreetMap / Nominatim | Address lookup & POI data | [osmfoundation.org/wiki/Privacy_Policy](https://osmfoundation.org/wiki/Privacy_Policy) |
| Overpass API (+ the kumi.systems mirror) | POI queries | [wiki.openstreetmap.org/wiki/Overpass_API](https://wiki.openstreetmap.org/wiki/Overpass_API) |
| Open-Meteo | Weather forecasts | [open-meteo.com/en/terms](https://open-meteo.com/en/terms) |
| OpenStreetMap tile server (tile.openstreetmap.de) | Map imagery | [operations.osmfoundation.org/policies/tiles](https://operations.osmfoundation.org/policies/tiles/) |
| Wikipedia REST API | Place descriptions | [wikimedia.org/wiki/Privacy_policy](https://foundation.wikimedia.org/wiki/Privacy_policy) |

---

## 7. Children's Privacy

Vegvísir does not knowingly collect any data from children under the age of 13. The app contains no features targeting children.

---

## 8. Changes to This Policy

If this policy is updated, the "Last updated" date at the top of this document will be changed. Significant changes will be noted in the app's CHANGELOG.

---

## 9. Contact

If you have questions about this privacy policy, please open an issue at:

**https://github.com/SassaGold/storied-strudel-cb7e7a/issues**
