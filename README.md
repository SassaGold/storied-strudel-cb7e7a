# Rider HQ — Biker Companion App 🏍️

A React Native / Expo app for motorcyclists. Find nearby restaurants, hotels, attractions, and motorcycle-specific POIs (fuel, repair, emergency services), log your trips, and more. Supports English, Spanish, German, French, Icelandic, Norwegian, Swedish, and Danish.

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
