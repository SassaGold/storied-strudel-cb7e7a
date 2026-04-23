# Play Store Submission Checklist — Where Am I

Use this checklist before submitting to Google Play.

---

## ✅ Already Done (in-code)

- [x] Android package name: `com.sassagold.whereami`
- [x] App version: `1.1.3` (in `app.json` and `package.json`)
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
- [x] iOS & Android permission usage descriptions written (in `app.json` `ios.infoPlist` and via `expo-location` plugin config)
- [x] iOS background mode `location` declared in `app.json` → `ios.backgroundModes`
- [x] EAS project linked (`eas.json`, project ID `c4cd3804-55c8-43d6-84cf-62d30b0fb6e2`)
- [x] Production EAS build profile with `autoIncrement: true`
- [x] Error boundaries wrapping the full app tree
- [x] No hardcoded API keys or secrets in source code
- [x] No analytics, no crash reporters, no ad SDKs
- [x] 9-language i18n (EN / ES / DE / FR / IS / NO / SV / DA / NL)
- [x] Privacy statement in About screen (links to privacy policy)
- [x] `store-listing/privacy_policy.md` created (covers background location, Trip Logger data, third-party APIs)
- [x] `store-listing/short_description.txt` (72 chars ≤ 80 limit) ✓
- [x] `store-listing/full_description.txt` (≤ 4000 chars) ✓
- [x] All map tiles served from OpenStreetMap (no Google Maps API key required)
- [x] `edgeToEdgeEnabled: true` in `app.json` for Android 15+

---

## ⚠️ Required Before Submitting

### 1. Privacy Policy — Hosted URL
Google Play requires a **publicly accessible URL** for your privacy policy.

**✅ Using custom domain:** `https://sassagold.com/privacy`

This URL is already set in `app.json` (`privacyPolicyUrl`) and in the About screen.
Paste it into Google Play Console → App Content → Privacy Policy.

### 2. Screenshots (Required)
Google Play requires **at least 2 screenshots** per device type.
Recommended: 5–8 screenshots covering each major tab.

Dimensions: **1080 × 1920 px** (or 1080 × 2160 px) PNG or JPEG.

Suggested screenshots:
1. Rider HQ / Home — map + weather card
2. Food Stops — list of nearby restaurants
3. Trip Logger — speed gauge in action
4. SOS / Emergency screen
5. Settings / Language picker

Take screenshots using an Android emulator or physical device.

### 3. Feature Graphic (Required)
- Dimensions: **1024 × 500 px** PNG or JPEG
- Shown at the top of your Play Store listing
- Design with Where Am I branding (`#ff6600` orange accent, dark background)

### 4. Store Listing Entry
In Google Play Console → Store Presence → Main Store Listing:

| Field | Value |
|-------|-------|
| App name | `Where Am I` |
| Short description | Copy from `store-listing/short_description.txt` |
| Full description | Copy from `store-listing/full_description.txt` |
| App icon | Upload `assets/images/icon.png` (1024×1024 px) |
| Feature graphic | Create 1024×500 px banner |
| Category | **Travel & Local** |
| Tags | motorcycle, biker, navigation, trip logger, POI |
| Email | Your support email address |
| Privacy policy URL | Hosted URL from step 1 above |

### 5. Content Rating
Complete the content rating questionnaire in Play Console.
Expected rating: **Everyone (3+)** — no violence, no adult content, no user interaction.

### 6. App Content Declaration
In Play Console → App Content, declare:
- **Ads:** No ads
- **Data Safety:**
  - Location: used on-device and anonymised coordinates sent to third-party open APIs (Nominatim, Overpass, Open-Meteo). Not shared with Where Am I servers.
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
- **Notification shown to the user:** `Where Am I Trip Logger` / `Recording your ride in the background.`

Recommended evidence for Play review:
- Short video showing the user starting Trip Logger, locking the screen, and the persistent notification remaining visible while the ride is recorded.
- Screenshot of the Trip Logger start screen and the Android foreground-service notification.
- Recording script and adb capture steps: `store-listing/foreground_service_demo.md`

---

## 🚀 Building & Submitting

### Automated (recommended)

Submission is fully automated via GitHub Actions:

| Step | Trigger | Workflow |
|------|---------|----------|
| 1. Build production AAB | Push a `v*` tag **or** run "EAS Build" manually | `.github/workflows/eas-build.yml` |
| 2. Submit to Play Store (internal track) | Runs automatically after "EAS Build" succeeds | `.github/workflows/eas-submit-android.yml` |

To release a new version end-to-end:

```bash
# 1. Bump the version (updates app.json + package.json)
npm run version:patch   # or version:minor / version:major

# 2. Commit the version bump
git add app.json package.json
git commit -m "chore: bump version to $(node -p "require('./package.json').version")"

# 3. Tag and push — this triggers EAS Build, which then triggers EAS Submit
git tag v$(node -p "require('./package.json').version")
git push && git push --tags
```

After CI submits the build, open **Google Play Console → Testing → Internal testing** and promote the release to the desired track (alpha → beta → production).

#### Required repository secrets

Set these under **Settings → Secrets → Actions** in your GitHub repository:

| Secret | Description |
|--------|-------------|
| `EXPO_TOKEN` | Expo personal access token (already needed for EAS Build) |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | Base64-encoded Google Play service account JSON key (see below) |

**How to create `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`:**

1. Go to [Google Play Console](https://play.google.com/console) → **Setup → API access**
2. Link to a Google Cloud project (or create one)
3. Create a service account with the **Release Manager** role
4. Download the JSON key file
5. Base64-encode it and save as a GitHub secret:

```bash
base64 -w 0 your-service-account-key.json
# Copy the output and paste it as the GOOGLE_SERVICE_ACCOUNT_KEY_JSON secret value
```

#### Manual trigger

You can also submit to a specific track without waiting for a build:

1. Go to **Actions → EAS Submit — Android (Play Store)**
2. Click **Run workflow**
3. Choose the target track: `internal`, `alpha`, `beta`, or `production`

---

### Manual (fallback)

If you prefer to submit manually:

```bash
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Log in to your Expo account
eas login

# 3. Build production AAB (Android App Bundle)
eas build --profile production --platform android

# 4. Submit the latest build to the internal track
eas submit --platform android --profile production --latest
```

---

## 📋 App Update Workflow

After first submission, for each new version:

1. Run `npm run version:patch` (or `minor`/`major`) to bump `app.json` + `package.json`
2. Commit the version bump
3. Push a `v*` tag — GitHub Actions builds and submits automatically
4. Promote the internal release to production in Play Console

> **Note:** `"autoIncrement": true` in `eas.json` automatically increments `versionCode` on each EAS production build.

