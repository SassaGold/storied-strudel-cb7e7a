# Play Store Submission Checklist — Where Am I

Use this checklist before submitting to Google Play.

---

## ✅ Already Done (in-code)

- [x] Android package name: `com.sassagold.whereami`
- [x] App version: `2.0.0` (in `app.json` and `package.json`)
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

**Recommended — GitHub Pages (free, uses this repo):**

1. Go to your repository on GitHub → **Settings → Pages**.
2. Under **Source**, select **Deploy from a branch**, choose `main`, and set the folder to `/docs`.
3. Click **Save**. After a minute the policy will be live at:
   `https://sassagold.github.io/storied-strudel-cb7e7a/privacy-policy.html`
4. This URL is already set in `app.json` (`privacyPolicyUrl`) and in the About screen.

The HTML privacy policy file is at `docs/privacy-policy.html` in this repository.

**Alternative options:**
- **Free generators** — [privacypolicytemplate.net](https://privacypolicytemplate.net), [app-privacy-policy-generator.firebaseapp.com](https://app-privacy-policy-generator.firebaseapp.com)
- Host the `store-listing/privacy_policy.md` on any free static host.

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

---

## 🚀 Building & Submitting

```bash
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Log in to your Expo account
eas login

# 3. Build production AAB (Android App Bundle)
eas build --profile production --platform android

# 4. Download the .aab file from the EAS dashboard
# 5. Upload to Google Play Console → Production → Create release
```

---

## 📋 App Update Workflow

After first submission, for each new version:

1. Update `"version"` in `app.json` (e.g. `"2.1.0"`)
2. Commit and push to GitHub
3. Run `eas build --profile production --platform android`
4. Upload new `.aab` in Play Console

> **Note:** `"autoIncrement": true` in `eas.json` automatically increments `versionCode` on each EAS production build.

