# Play Store Submission Checklist — Roamly

Use this checklist before submitting to Google Play.

---

## ✅ Already Done (in-code)

- [x] Android package name: `com.sassagold.roamly`
- [x] App version: `2.0.0`
- [x] Android `versionCode`: `1` (in `app.json`; auto-incremented by EAS on each production build)
- [x] Adaptive icon: foreground + background + monochrome (`assets/images/android-icon-*.png`)
- [x] Splash screen configured (white/dark background, branded icon)
- [x] Required permissions declared in `app.json`:
  - `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`
  - `ACCESS_BACKGROUND_LOCATION`
  - `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`
- [x] iOS & Android permission usage descriptions written
- [x] EAS project linked (`eas.json`, project ID `625b8a7c-5d22-4ebc-a8a6-d0a47451870e`)
- [x] Production EAS build profile with `autoIncrement: true`
- [x] Error boundaries wrapping the full app tree
- [x] No hardcoded API keys or secrets in source code
- [x] No analytics, no crash reporters, no ad SDKs
- [x] 9-language i18n (EN / ES / DE / FR / IS / NO / SV / DA / NL)
- [x] Privacy statement in About screen
- [x] `store-listing/privacy_policy.md` created
- [x] `store-listing/short_description.txt` (72 chars ≤ 80 limit) ✓
- [x] `store-listing/full_description.txt` (≤ 4000 chars) ✓

---

## ⚠️ Required Before Submitting

### 1. Google Maps API Key
The Android map requires a Google Maps API key for production.

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable **Maps SDK for Android**
3. Create an API key → restrict to package `com.sassagold.roamly`
4. In `app.json`, set:
   ```json
   "android": {
     "config": {
       "googleMaps": {
         "apiKey": "YOUR_KEY_HERE"
       }
     }
   }
   ```

### 2. Privacy Policy — Hosted URL
Google Play requires a **publicly accessible URL** for your privacy policy.

Options:
- **GitHub Pages** — enable GitHub Pages for this repo; the URL will be:
  `https://sassagold.github.io/storied-strudel-cb7e7a/store-listing/privacy_policy`
- **Free generators** — [privacypolicytemplate.net](https://privacypolicytemplate.net), [app-privacy-policy-generator.firebaseapp.com](https://app-privacy-policy-generator.firebaseapp.com)
- Host the `store-listing/privacy_policy.md` on any free static host.

### 3. Screenshots (Required)
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

### 4. Feature Graphic (Required)
- Dimensions: **1024 × 500 px** PNG or JPEG
- Shown at the top of your Play Store listing
- Design with Roamly branding (`#ff6600` orange accent, dark background)

### 5. Store Listing Entry
In Google Play Console → Store Presence → Main Store Listing:

| Field | Value |
|-------|-------|
| App name | `Roamly` |
| Short description | Copy from `store-listing/short_description.txt` |
| Full description | Copy from `store-listing/full_description.txt` |
| App icon | Upload `assets/images/icon.png` (1024×1024 px) |
| Feature graphic | Create 1024×500 px banner |
| Category | **Travel & Local** |
| Tags | motorcycle, biker, navigation, trip logger, POI |
| Email | Your support email address |
| Privacy policy URL | Hosted URL from step 2 above |

### 6. Content Rating
Complete the content rating questionnaire in Play Console.
Expected rating: **Everyone (3+)** — no violence, no adult content, no user interaction.

### 7. App Content Declaration
In Play Console → App Content, declare:
- **Ads:** No ads
- **Data Safety:** Location (used on-device, not collected or shared)
- **Target Audience:** All ages (no children-targeted content)

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
