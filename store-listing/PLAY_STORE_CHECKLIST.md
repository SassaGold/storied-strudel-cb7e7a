# Play Store Submission Checklist — Vegvísir

Use this checklist before submitting to Google Play.

---

## ✅ Already Done (in-code)

- [x] Android package name: `com.sassagold.whereami`
- [x] App version: **1.4.0** in `app.json` (the source of truth `scripts/version-bump.js` reads), submitted to Play and awaiting review; **live on Play: 1.3.0** until review clears
  - ⚠️ 1.4.0 was hand-edited into `app.json` rather than set with `npm run version:patch`, so `package.json` and `README.md` were left at 1.2.6 and had to be corrected by hand on 2026-07-25. Use `npm run version:*` for future bumps so all three stay in sync.
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
- [x] 5-language i18n (EN / NO / SV / DA / IS) — trimmed from nine in 1.3.0; ES, DE, FR and NL were dropped
- [x] Privacy statement in About screen (links to privacy policy)
- [x] `store-listing/privacy_policy.md` created (covers background location, Trip Logger data, third-party APIs)
- [x] Listing copy in `store-listing/locales/{en-US,no-NO,sv-SE,da-DK,is-IS}/` — all five, Vegvísir-branded (title ≤30, short ≤80, full ≤4000 — all verified) ✓
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

### 2–4c. Store listing, graphics and translations — ✅ SUBMITTED, IN REVIEW

> **Verified directly in Play Console on 2026-07-25.** The publishing overview
> reports *"Your changes are now in review"*; managed publishing is **off**, so
> everything below goes live automatically as soon as Google's review clears.
> **Do not edit these fields while the review is pending** — that stacks a second
> set of changes on top of the ones under review.

Submitted and awaiting review:

| Item | Change in review |
|------|------------------|
| Production release | **1.4.0** — start full rollout |
| en-US | app name → `Vegvísir – Nordic Ride Compass`, full description, phone screenshots, feature graphic |
| no-NO | app name → `Vegvísir – Nordisk MC-kompass`, full description, phone screenshots, feature graphic |
| is-IS | app name → `Vegvísir – áttaviti hjólafólks`, full description, phone screenshots, feature graphic |
| da-DK | **added as a new language** (`Vegvísir – Nordisk MC-kompas`) + all required information |
| sv-SE | **added as a new language** (`Vegvísir – Nordisk MC-kompass`) + all required information |

The submitted en-US copy was diffed against this repo and matches: app name is
`title.txt` verbatim (30/30 characters — at the limit, no slack), and the full
description is content-identical to `full_description.txt`. The short
description already matched `short_description.txt` exactly, which is why Play
lists no change for it — it is not an omission.

**This clears the previous 🔴 warning.** The live listing was both stale
("Where Am I — Ride Companion" at 1.3.0) and overstating functionality —
promising "offline maps", "save routes" and "share highlights", features the app
does not have, which is a Play policy problem and not merely untidy. Neither
phrase appears in the submitted description. Until review clears, the *public*
page still shows the old copy; that is review lag, not an unpushed change.

Source of the assets, for regenerating or for the next release:

| Field | Source |
|-------|--------|
| App name | `store-listing/locales/<locale>/title.txt` (≤30 chars) |
| Short description | `store-listing/locales/<locale>/short_description.txt` (≤80) |
| Full description | `store-listing/locales/<locale>/full_description.txt` (≤4000) |
| App icon | Taken automatically from the uploaded AAB |
| Feature graphic | `store-listing/graphics/<locale>/feature-graphic.png` (1024×500) |
| Phone screenshots | `store-listing/graphics/<locale>/screenshots/01..08` (1080×1920) |
| Release notes | `store-listing/locales/<locale>/whats-new-1.4.0.txt` (≤500) |
| Category | **Travel & Local** |
| Tags | motorcycle, biker, navigation, trip logger, POI |
| Email | support@sassagold.com |
| Privacy policy URL | Hosted URL from step 1 above |

Regenerate graphics with `node scripts/render-store-assets.js` (raw captures in
`store-listing/raw/`). Push text and release notes with
`node scripts/push-play-listing.js --key <sa.json> --notes-version <x.y.z>`
(`--dry-run` first to see the length report). For future release notes follow
`whats-new-template.txt` — lead with rider benefits, not internal labels like
"Visual Overhaul Release".

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

