# App Signing & Release Process

This document covers how to build, sign, and submit Roamly to the App Store and Google Play using [EAS Build](https://docs.expo.dev/build/introduction/).

---

## Prerequisites

1. Install the EAS CLI: `npm install -g eas-cli`
2. Log in: `eas login`
3. Copy `.env.example` → `.env` and fill in your secrets.

---

## Signing credentials

EAS manages signing credentials for you. Run the interactive setup once per platform:

```bash
# iOS — creates/uses an Apple Distribution certificate and Provisioning Profile
eas credentials --platform ios

# Android — creates/uses an upload keystore
eas credentials --platform android
```

Credentials are stored securely in EAS and are never committed to the repo.

---

## Build profiles (`eas.json`)

| Profile | Purpose | Distribution |
|---|---|---|
| `development` | Debug build with dev-client for local testing | Internal (TestFlight / Internal sharing) |
| `development-simulator` | iOS Simulator build | Internal |
| `preview` | Release-like build for QA / stakeholder testing | Internal |
| `production` | Store-ready build, auto-increments build number | Store |

---

## Building

```bash
# Development (for physical device testing)
eas build --profile development --platform all

# Preview (share with testers via URL)
eas build --profile preview --platform all

# Production (store submission)
eas build --profile production --platform all
```

---

## Version bumping

The `production` profile has `"autoIncrement": true`, which automatically bumps the build number for each EAS build. The **marketing version** (`package.json` / `app.json` `version`) is bumped manually:

```bash
npm run version:bump          # patch:  2.0.1 → 2.0.2
npm run version:bump -- minor # minor:  2.0.1 → 2.1.0
npm run version:bump -- major # major:  2.0.1 → 3.0.0
```

Commit and push the version bump before triggering a production build.

---

## Submitting to stores

```bash
# After a successful production build:
eas submit --platform ios
eas submit --platform android
```

EAS Submit handles App Store Connect and Google Play API authentication. Configure store credentials in the `submit.production` section of `eas.json` if needed.

---

## Crash reporting (Sentry)

To enable Sentry crash reporting in production:

1. Create a project at [sentry.io](https://sentry.io/).
2. Install the SDK: `npx expo install @sentry/react-native`
3. Add your DSN to `.env`:
   ```
   SENTRY_DSN=https://your-dsn@o123.ingest.sentry.io/456
   ```
4. Rebuild — `lib/crash.ts` will automatically initialise Sentry when the DSN is present.

Source maps are uploaded automatically by the Sentry Expo plugin. Add it to `app.json` plugins:

```json
{
  "expo": {
    "plugins": [
      [
        "@sentry/react-native/expo",
        { "organization": "your-org", "project": "roamly" }
      ]
    ]
  }
}
```

---

## Environment variables reference

See `.env.example` for the full list of supported environment variables. All secrets must be added to your EAS project environment via:

```bash
eas secret:create --scope project --name MY_SECRET --value "value"
```

Secrets set this way are injected at build time and are never stored in the repository.
