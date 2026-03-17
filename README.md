# Roamly — Biker Companion App 🏍️

A React Native / Expo app for motorcyclists. Find nearby restaurants, hotels, attractions, and motorcycle-specific POIs (fuel, repair, emergency services), log your trips, and more. Supports English, Spanish, German, French, Dutch, Norwegian, Swedish, and Danish.

> **Current version: 2.0.0** — live on Netlify and saved permanently in this GitHub repository.

---

## How your build is already saved (and how to keep it safe)

**Your code is your build.** Every time a change is pushed to GitHub, it is permanently saved in this repository. The Netlify site is built automatically from this same code.

### What "saved" means in practice

| Where | What it contains | How to restore |
|-------|-----------------|----------------|
| **GitHub repository** | All source code, every version ever committed | Clone the repo again |
| **Git tags** | Named snapshots (e.g. `v2.0.0`) | `git checkout v2.0.0` |
| **Netlify** | The compiled web build (HTML/JS/CSS) | Redeploy from GitHub at any time |

### How to download a full copy to your own computer right now

1. Install [Git](https://git-scm.com) and [Node.js 18+](https://nodejs.org) if you haven't already.
2. Open a terminal (Command Prompt / Terminal) and run:
   ```bash
   git clone https://github.com/SassaGold/storied-strudel-cb7e7a.git
   cd storied-strudel-cb7e7a
   npm install
   ```
3. That's it — you now have a complete copy on your computer. Run `npm run web` to see it working locally.

### How to make an extra offline backup (optional)

```bash
# After cloning, zip the whole folder:
# Windows — right-click the folder → "Send to" → "Compressed (zipped) folder"
# Mac     — right-click → "Compress"
# Linux   — zip -r roamly-backup.zip storied-strudel-cb7e7a/
```

Keep this zip on a USB drive or cloud storage (Google Drive, Dropbox) for extra safety.

---

## Publishing to Google Play Store

### Is the app ready?

**Yes — the technical foundation is ready.** The app already has:

- ✅ Android package name: `com.sassagold.roamly`
- ✅ Adaptive icon set (foreground, background, monochrome)
- ✅ Required permissions declared (location, background location)
- ✅ EAS Build configured (`eas.json`) with a production profile
- ✅ EAS project ID linked (`625b8a7c-5d22-4ebc-a8a6-d0a47451870e`)

**What you still need to do** (none of this is code — it's account setup):

| Step | What | Cost |
|------|------|------|
| 1 | Google Play Developer account | US $25 one-time |
| 2 | Expo account (free) | Free |
| 3 | Google Maps Android API key | Free quota / pay-as-you-go |
| 4 | App store listing (screenshots, description, privacy policy) | Free |

---

### Step-by-step: publish to Google Play

#### Step 1 — Create an Expo account

1. Go to [expo.dev](https://expo.dev) and create a free account.
2. In your terminal, log in:
   ```bash
   npm install -g eas-cli
   eas login
   ```

#### Step 2 — Add a Google Maps API key for Android

The map on Android uses Google Maps tiles and requires an API key.  
The key must **never** be committed to source control — it is injected at build time via `app.config.js`.

**For local / emulator builds:**

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a project → enable **Maps SDK for Android**.
3. Create an API key → restrict it to your Android package `com.sassagold.roamly` and its SHA-1 signing certificate.
4. In the project root, copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
5. Open `.env` and fill in your key:
   ```
   GOOGLE_MAPS_ANDROID_API_KEY=YOUR_ANDROID_MAPS_KEY_HERE
   ```
6. `.env` is gitignored — it will never be committed to GitHub.

**For EAS cloud builds (production / Play Store):**

Add the key as an EAS secret so the cloud builder can access it without committing it:
```bash
npx eas secret:create --scope project --name GOOGLE_MAPS_ANDROID_API_KEY
```
EAS will prompt you to paste the value. This replaces steps 4–6 above for cloud builds.

#### Step 3 — Build the production Android AAB (App Bundle)

An AAB is the file Google Play requires (it's like a ZIP of your app).

```bash
# In the project folder on your computer:
eas build --profile production --platform android
```

- EAS builds in the cloud — you don't need Android Studio installed.
- The build takes about 10–15 minutes.
- When done, EAS gives you a download link for the `.aab` file.

#### Step 4 — Create a Google Play Developer account

1. Go to [play.google.com/console](https://play.google.com/console).
2. Pay the one-time **US $25** registration fee.
3. Complete your developer profile.

#### Step 5 — Create a new app in Play Console

1. Click **"Create app"**.
2. Fill in:
   - App name: `Roamly`
   - Default language: English
   - App or game: **App**
   - Free or paid: **Free**
3. Accept the declarations and click **"Create app"**.

#### Step 6 — Upload your AAB and fill in the store listing

1. Go to **Production → Releases → Create new release**.
2. Upload the `.aab` file you downloaded from EAS.
3. Fill in the **Store listing**:
   - Short description (80 chars): *"Biker companion: find POIs, log rides, SOS emergency tools"*
   - Full description: describe all 9 tabs
   - Screenshots: take at least 2 phone screenshots (required)
   - Feature graphic: 1024×500 px banner image (required)
4. Fill in **App content** (privacy policy URL required — you can use a free generator at [privacypolicytemplate.net](https://privacypolicytemplate.net)).
5. Set **Content rating** by answering the questionnaire.

#### Step 7 — Submit for review

1. Click **"Review release"** → **"Start rollout to Production"**.
2. Google reviews the app — typically **1–3 days** for a first submission.
3. Once approved, your app is live on the Play Store! 🎉

---

### Updating the app after it's published

Every time you want to release a new version:

1. Increment the version in `app.json` (e.g. `"version": "2.1.0"`).
2. Push to GitHub.
3. Run `eas build --profile production --platform android` again.
4. Upload the new AAB in Play Console → create a new release.

The `"autoIncrement": true` in `eas.json` handles the Android `versionCode` automatically.

---

## Running this project on your own computer

### Prerequisites

Before you begin, make sure you have the following installed:

| Tool | Minimum version | Download |
|------|----------------|----------|
| **Git** | any | https://git-scm.com |
| **Node.js** | 18 LTS or newer | https://nodejs.org |
| **npm** | included with Node.js | — |

Verify your versions:
```bash
node --version   # should print v18 or higher
npm --version
git --version
```

### 1 — Clone the repository

```bash
git clone https://github.com/SassaGold/storied-strudel-cb7e7a.git
cd storied-strudel-cb7e7a
```

### 2 — Install dependencies

```bash
npm install
```

### 3 — Choose how to run the app

#### Option A — Web browser (quickest, no extra setup)

```bash
npm run web
# or
npx expo start --web
```

Open http://localhost:8081 in your browser. Most UI and logic works; native map tiles and GPS are limited in the browser.

#### Option B — Android emulator

1. Install [Android Studio](https://developer.android.com/studio) and create an Android Virtual Device (AVD).
2. Start your AVD from the Device Manager in Android Studio.
3. In the project folder, run:
   ```bash
   npm run android
   # or
   npx expo run:android
   ```
   Expo will build a debug APK, install it on the emulator, and launch it automatically.

#### Option C — iOS Simulator (macOS only)

> The iPhone Simulator requires **macOS** and **Xcode**. It cannot run on Windows or Linux.

1. Install [Xcode](https://developer.apple.com/xcode/) from the Mac App Store and open it once to accept the licence.
2. Run:
   ```bash
   npm run ios
   # or
   npx expo run:ios
   ```

> **Simulating GPS** — the simulator has no real GPS. Set a fake location from the Xcode menu:  
> `Simulator → Features → Location → Custom Location…`

#### Option D — Physical device via EAS cloud build

If you don't want to install Android Studio or Xcode, you can use [EAS Build](https://expo.dev/eas) (free tier available) to build in the cloud and install on a real device:

```bash
# install the EAS CLI
npm install -g eas-cli

# build for Android (generates an APK/AAB you can sideload)
npx eas build --profile development --platform android

# build for iOS (requires an Apple Developer account)
npx eas build --profile development --platform ios
```

---

## Development

### Available scripts

| Command | What it does |
|---------|-------------|
| `npm run web` | Start the app in a web browser |
| `npm run android` | Build and run on an Android emulator / device |
| `npm run ios` | Build and run on iOS Simulator (macOS only) |
| `npm run start` | Start the Expo dev server (note: Expo Go has limited native module support — see below) |
| `npm run lint` | Run the ESLint linter |

### Note on native modules

This app uses native modules (`react-native-maps`, `expo-location`) that are **not** supported in the standard Expo Go sandbox. To test the full app you need a development build (`npm run android` / `npm run ios`) or a physical device build via EAS.

---

## Learn more

- [Expo documentation](https://docs.expo.dev/)
- [Android Studio emulator guide](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS Simulator guide](https://docs.expo.dev/workflow/ios-simulator/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [Discord community](https://chat.expo.dev)
