# Play Store Submission Checklist — Vegvísir

Use this checklist before submitting to Google Play.

---

## ✅ Already Done (in-code)

- [x] Android package name: `com.sassagold.whereami`
- [x] App version: kept in sync in `app.json` + `package.json` + `README.md` by `npm run version:patch` (currently 1.2.4)
- [x] Android `versionCode`: auto-incremented by EAS on each production build via `autoIncrement: true` in `eas.json`
- [x] Adaptive icon: foreground + background + monochrome (`assets/images/android-icon-*.png`)
- [x] Splash screen configured (white/dark background, branded icon)
- [x] Required permissions declared and used:
  - `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` — POI search, weather, map
  - `ACCESS_BACKGROUND_LOCATION` — Trip Logger background GPS recording
  - `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` — Android foreground service notification during trip recording
- [x] `expo-location` plugin configured in `app.json` with background location enabled
- [x] `expo-task-manager` plugin configured in `app.json`
- [x] Background location task implemented (`lib/locationTask.ts`) — writes GPS points to AsyncStorage while screen is locked
- [x] Background task registered at app boot (`app/_layout.tsx`)
- [x] Trip Logger requests background permission and starts `Location.startLocationUpdatesAsync` during a recording session
- [x] Permission usage descriptions written via the `expo-location` plugin config in `app.json` (the app is Android-only; there is no `ios` config)
- [x] EAS project linked (`eas.json`, project ID `c4cd3804-55c8-43d6-84cf-62d30b0fb6e2`)
- [x] Production EAS build profile with `autoIncrement: true`
- [x] Error boundaries wrapping the full app tree
- [x] No hardcoded API keys or secrets in source code
- [x] No analytics, no crash reporters, no ad SDKs
- [x] 9-language i18n (EN / ES / DE / FR / IS / NO / SV / DA / NL)
- [x] Privacy statement in About screen (links to privacy policy)
- [x] `store-listing/privacy_policy.md` created (covers background location, Trip Logger data, third-party APIs)
- [x] Listing copy in `store-listing/locales/{en-US,no-NO,is-IS}/` (title ≤30, short ≤80, full ≤4000 — all verified) ✓
- [x] Branded screenshots + feature graphics in `store-listing/graphics/` (rerun via `node scripts/render-store-assets.js`) ✓
- [x] All map tiles served from OpenStreetMap (no Google Maps API key required)
- [x] `edgeToEdgeEnabled: true` in `app.json` for Android 15+

---

## ⚠️ Required Before Submitting

### 1. Privacy Policy — Hosted URL
Google Play requires a **publicly accessible URL** for your privacy policy.

**✅ Using custom domain:** `https://sassagold.com/privacy`

The About screen links to this URL (`PRIVACY_POLICY_URL` in `lib/config.ts`); the
source document lives at `docs/privacy-policy.html`.
Paste the URL into Google Play Console → App Content → Privacy Policy.

### 2. Screenshots (Required) — ✅ GENERATED, ready to upload
Branded 1080×1920 panels live in `store-listing/graphics/<locale>/screenshots/`
(8 per locale: Rider HQ, SOS, Garage, Trip, Food, Sleep, Explore, Language).
Regenerate any time with `node scripts/render-store-assets.js` (raw captures in
`store-listing/raw/`).

Upload: Play Console → **Grow users → Store presence → Main store listing** →
scroll to **Phone screenshots** → delete the old bare captures → upload all 8
from `graphics/en-US/screenshots/` in numbered order.

### 3. Feature Graphic (Required) — ✅ GENERATED, ready to upload
`store-listing/graphics/<locale>/feature-graphic.png` (1024×500). Upload in the
same Main store listing page under **Feature graphic**. This banner is what
Play shows in search and promo placements — the listing currently has none.

### 4. Store Listing Entry
In Google Play Console → **Grow users → Store presence → Main store listing**:

| Field | Value |
|-------|-------|
| App name | `store-listing/locales/en-US/title.txt` (27 chars) |
| Short description | `store-listing/locales/en-US/short_description.txt` |
| Full description | `store-listing/locales/en-US/full_description.txt` |
| App icon | Keep current (or `assets/images/icon.png`, 1024×1024) |
| Feature graphic | `store-listing/graphics/en-US/feature-graphic.png` |
| Phone screenshots | `store-listing/graphics/en-US/screenshots/01..08` |
| Category | **Travel & Local** |
| Tags | motorcycle, biker, navigation, trip logger, POI |
| Email | support@sassagold.com |
| Privacy policy URL | Hosted URL from step 1 above |

> ⚠️ The description currently LIVE on Play does not match this repo — it
> promises "offline maps", "save routes" and "share highlights", which the app
> does not have. Replace it with the text above to avoid review complaints.

### 4b. Localized listings (Norwegian & Icelandic)
On the Main store listing page, top-right language selector → **Manage
translations → Add translations** → add **Norwegian (no-NO)** and
**Icelandic (is-IS)**. For each, paste the three text files from
`store-listing/locales/<locale>/` and upload the 8 screenshots + feature
graphic from `store-listing/graphics/<locale>/`.

### 4c. "What's new" release notes
Use `store-listing/locales/en-US/whats-new-template.txt` as the pattern —
lead with rider benefits, not internal notes like "Visual Overhaul Release".

### 5. Content Rating
Complete the content rating questionnaire in Play Console.
Expected rating: **Everyone (3+)** — no violence, no adult content, no user interaction.

### 6. App Content Declaration
In Play Console → App Content, declare:
- **Ads:** No ads
- **Data Safety:**
  - Location: used on-device and anonymised coordinates sent to third-party open APIs (Nominatim, Overpass, Open-Meteo). Not shared with Vegvísir servers.
  - Trip data: stored only on-device, never uploaded.
- **Target Audience:** All ages (no children-targeted content)
- **Background Location:** Used only while a trip is actively being recorded in the Trip Logger. Not used at any other time.

### 7. Background Location Permission Declaration
Google Play will request a **Prominent Disclosure** for `ACCESS_BACKGROUND_LOCATION`.

In Play Console → App Content → Sensitive app permissions, provide:
- **Core functionality:** Trip Logger records GPS route and distance even when the screen is locked.
- **Why background access is needed:** Without background location, GPS tracking stops when the screen locks during a ride, resulting in incomplete route data.
- The foreground service notification ("Recording your ride in the background") is shown to users while background tracking is active.

### 8. Foreground Service Permission Declaration
Google Play will also ask whether the app uses any foreground service permissions.

For this app, the correct declaration is:
- **Does your app use foreground service permissions?** Yes
- **Foreground service type:** `location`
- **User-facing feature:** Trip Logger records the ride route, distance, and speed while the phone is locked.
- **Why foreground service is needed:** Android requires an ongoing foreground service notification while continuous background GPS is active. Without it, trip recording stops or becomes unreliable when the app is backgrounded.
- **User trigger:** The service starts only after the user explicitly taps Start in Trip Logger and stops when the user ends the recording.
- **Notification shown to the user:** `Vegvísir Trip Logger` / `Recording your ride in the background.`

Recommended evidence for Play review:
- Short video showing the user starting Trip Logger, locking the screen, and the persistent notification remaining visible while the ride is recorded.
- Screenshot of the Trip Logger start screen and the Android foreground-service notification.
- Recording script and adb capture steps: `store-listing/foreground_service_demo.md`

---

## 🚀 Building & Submitting

Releases are built with EAS and uploaded to the Play Console manually
(the previous GitHub Actions build/submit pipeline was removed by choice):

```bash
# 1. Bump the version (updates app.json + package.json)
npm run version:patch   # or version:minor / version:major

# 2. Commit the version bump and merge it to master

# 3. Build the production AAB (versionCode auto-increments remotely)
npx eas-cli build --platform android --profile production --non-interactive --no-wait

# 4. Download the AAB from https://expo.dev and upload it in
#    Google Play Console → Production (or a testing track) → Create release
```

> **Note:** `"autoIncrement": true` in `eas.json` automatically increments `versionCode` on each EAS production build, so the version bump must be merged to master **before** building.

