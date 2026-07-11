# Where Am I — Biker Companion App 🏍️

A React Native / Expo app for motorcyclists. Find nearby restaurants, hotels, attractions, and motorcycle-specific POIs (fuel, repair, parking, clubs & tracks, ATMs), log your rides with GPS, and get riding weather, road conditions and emergency tools. Supports English, Spanish, German, French, Icelandic, Norwegian, Swedish, Danish, and Dutch.

> **Current version: 1.2.4** (see [CHANGELOG.md](CHANGELOG.md)) — distributed as an Android app via Google Play, built in the cloud with [EAS Build](https://docs.expo.dev/build/introduction/).

---

## The app at a glance

| Tab | What it does |
|-----|-------------|
| **Rider HQ** | Your location, live weather + 3-day/hourly forecast, sunrise/sunset, road conditions & alerts |
| **Food / Sleep / Explore** | Nearby restaurants, accommodation and attractions (OpenStreetMap Overpass), list or map view |
| **Garage** | MC services, fuel stations (with fuel types), parking, MC clubs & race tracks, ATMs, sports & fitness |
| **Trip** | GPS ride logger with background recording, crash recovery, map-matched route preview and ride history |
| **SOS** | Locale-aware emergency number, nearby hospitals/pharmacies/police, share-location tools |

All data comes from free, no-API-key services: OpenStreetMap (Nominatim, Overpass, tiles), Open-Meteo weather, OSRM map matching, and Wikipedia summaries.

---

## Running the project locally

### Prerequisites

| Tool | Minimum version | Download |
|------|----------------|----------|
| **Git** | any | https://git-scm.com |
| **Node.js** | 18 LTS or newer | https://nodejs.org |
| **npm** | included with Node.js | — |

### Setup

```bash
git clone https://github.com/SassaGold/storied-strudel-cb7e7a.git
cd storied-strudel-cb7e7a
npm install
```

No API keys are required.

### Run it

```bash
# Web browser (quickest; GPS and some native features are limited)
npm run web        # open http://localhost:8081

# Android emulator or connected device (full feature set)
npm run android    # requires Android Studio / an AVD or a device with USB debugging
```

> **Native modules note:** Trip Logger's background recording uses `expo-task-manager` / `expo-location` foreground services, which are not available in the Expo Go sandbox. Use `npm run android` (development build) to test the full app.

---

## Development

| Command | What it does |
|---------|-------------|
| `npm run web` | Start the app in a web browser |
| `npm run android` | Build and run on an Android emulator / device |
| `npm start` | Start the Expo dev server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`, strict mode) |
| `npm test` | Jest test suite (locales parity, Overpass, weather, sun, roads, tiles…) |
| `npm run version:patch` / `:minor` / `:major` | Bump the version in `app.json` + `package.json` + `README.md` |

CI (GitHub Actions, [.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint + typecheck + tests on every push and PR to `master`.

---

## Building & releasing to Google Play

Builds are done in the cloud with EAS — no Android Studio needed:

```bash
npm install -g eas-cli
eas login

# Production AAB (Google Play upload format)
eas build --platform android --profile production
```

- `eas.json` uses `appVersionSource: "remote"` with `autoIncrement`, so the Android `versionCode` is bumped automatically on every build.
- The user-facing version (`1.2.4`) lives in `app.json`/`package.json` — bump it with `npm run version:patch` (which also updates this README) and merge to master **before** building.
- When the build finishes, download the `.aab` from the EAS build page and upload it in Play Console → **Production → Create new release**.

Play Console data-safety answers for this app: location collected (foreground + background for Trip Logger), foreground service type `location`, no ads/analytics/crash reporters, no data shared with third parties.

Store listing assets and the full submission checklist live in [`store-listing/`](store-listing/).

---

## Project structure

```
app/(tabs)/        Screens (Expo Router file-based routing)
components/        Shared UI (POIScreen, POIMap, PlaceInfoModal, weather cards…)
lib/               Hooks & services (Overpass, weather, sun, trip task, i18n, settings)
lib/locales/       9 locale files (a Jest test enforces key parity with en.json)
__tests__/         Jest suites
store-listing/     Play Store texts & checklist
.github/workflows/ CI (lint+typecheck+test on master pushes/PRs)
```

## Learn more

- [Expo documentation](https://docs.expo.dev/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [Android emulator guide](https://docs.expo.dev/workflow/android-studio-emulator/)
