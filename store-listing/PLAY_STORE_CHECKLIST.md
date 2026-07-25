# Play Store Submission Checklist — Vegvísir

Use this checklist before submitting to Google Play.

---

## ✅ Already Done (in-code)

- [x] Android package name: `com.sassagold.whereami`
- [x] App version: **1.4.1** in `app.json` (the source of truth `scripts/version-bump.js` reads), bumped with `npm run version:patch` so `package.json` and `README.md` stayed in sync
  - ⚠️ **1.4.0 is still in Play review and 1.3.0 is live.** Do not submit 1.4.1 — build, listing text or assets — until 1.4.0 clears, or the change sets stack.
  - For context: 1.4.0 was hand-edited into `app.json` rather than set with `npm run version:patch`, leaving `package.json` and `README.md` at 1.2.6 until they were corrected by hand on 2026-07-25. Use `npm run version:*` and this does not happen.
- [x] Android `versionCode`: auto-incremented by EAS on each production build via `autoIncrement: true` in `eas.json`
- [x] Adaptive icon: foreground + background + monochrome (`assets/images/android-icon-*.png`)
- [x] Splash screen configured (white/dark background, branded icon)
- [x] Required permissions declared and used:
  - `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` — POI search, weather, map
  - `ACCESS_BACKGROUND_LOCATION` — Trip Logger background GPS recording
  - `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` — Android foreground service notification during trip recording
  - `POST_NOTIFICATIONS` — required on Android 13+ for the foreground-service
    notification to be visible (requested in `app/(tabs)/triplogger.tsx`)
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
- [x] Branded screenshots + feature graphics in `store-listing/graphics/` ✓
  — ⚠️ **not** regenerable with `scripts/render-store-assets.js`; that script is
  superseded and now refuses to run without `--force`. See "Regenerating store
  graphics" below.
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
| Release notes | `store-listing/locales/<locale>/whats-new-<version>.txt` (≤500) — 1.4.1 written, all five locales, longest 424/500 |
| Category | **Travel & Local** |
| Tags | motorcycle, biker, navigation, trip logger, POI |
| Email | support@sassagold.com |
| Privacy policy URL | Hosted URL from step 1 above |

### Regenerating store graphics (read before trying)

**`scripts/render-store-assets.js` does not reproduce the committed assets.** It
renders a phone-mockup feature graphic titled "Where Am I" and wraps screenshots
in a marketing panel; the committed assets are a Vegvísir stave-and-wordmark
graphic and raw unframed captures. It writes to the same paths, so running it
destroys them. It now refuses to run without `--force`.

- **Feature graphics — reconstructed generator, 2026-07-25.**
  `store-listing/brand/feature-graphic-generator.html` renders all five:

  ```bash
  node tools/render.js storied-strudel-cb7e7a/store-listing/brand/feature-graphic-generator.html \
    --only=feat-en-US,feat-no-NO,feat-sv-SE,feat-da-DK,feat-is-IS \
    --flatten=feat-en-US,feat-no-NO,feat-sv-SE,feat-da-DK,feat-is-IS
  ```

  The original generator was never committed (`dda7b26` added the PNGs and the
  uploader, no renderer). This rebuilds the design from parts that do exist: the
  stave drawn as vector, lifted from `scripts/render-brand.js`, and the photo
  `sassagold-landing/assets/herofinal.jpg`. The stave is **drawn**, not pasted
  from `brand/vegvisir-gold-ring.png` — that PNG has an opaque background and
  would show as a square patch.

  ⚠️ **A faithful reconstruction, not a byte-exact reproducer.** Mean
  per-channel difference against the committed graphics is ~24/255, almost all
  of it in the blurred photo. Use it for *new* output — a new locale, a changed
  slogan. **The committed PNGs remain the source of truth for what was
  submitted** and are deliberately left untouched.

  `herofinal.jpg` used to have "Where Am I – Explore. Ride. Discover" burned
  into it, which forced a radial darkening over the lower right to hide it —
  and it ghosted back through once when a gradient was tweaked. The photo was
  cleaned in `sassagold-landing` (PR #44) and the workaround is gone. **If ghost
  text ever reappears, the photo has been reverted, not the crop.**
- **Screenshots — reproducible.** They are raw 1080×1920 device captures. Take
  them with `adb exec-out screencap -p` against a build of the version being
  shipped, one set per locale, matching the existing 8-shot order.
- ⚠️ **The 40 screenshots now in review show "Where Am I" in the app header** —
  they were captured from a 1.3.0-era build. Re-capture them for 1.4.1.

Push text and release notes with
`node scripts/push-play-listing.js --key <sa.json> --notes-version <x.y.z>`
(`--dry-run` first to see the length report). For future release notes follow
`whats-new-template.txt` — lead with rider benefits, not internal labels like
"Visual Overhaul Release".

> **Steps 5–8 audited against the source on 2026-07-25.** Every claim below was
> checked against the actual code, not carried forward from an earlier draft.
> What follows is *what the app really does* — the Console state itself has
> **not** been read, so treat these as the values to enter/verify, not as
> confirmation that the Console already says this.

### 5. Content Rating
Complete the content rating questionnaire in Play Console.
Expected rating: **Everyone (3+)** — no violence, no adult content, no user interaction.

✅ **Verified.** No user-generated content, messaging, social or sharing-to-other-users
surface exists in the app. GPX export (`lib/gpx.ts`) hands a file to the Android
share sheet on explicit user action — that is the user exporting their own data,
not in-app user interaction, and does not change the rating.

### 6. App Content Declaration
In Play Console → App Content, declare:
- **Ads:** No ads ✅ verified — no ad SDK in `package.json`
- **Data Safety:**
  - **Location — collected AND transferred off-device.** Precise coordinates are
    sent to third-party map and weather APIs (full list below). Not sent to any
    SassaGold server — there is no SassaGold backend.
  - **Trip data — on-device only.** Recorded routes, distances and statistics
    live in on-device AsyncStorage and are not transmitted. True as of the OSRM
    removal below; it was **not** true in 1.4.0 and earlier.
- **Target Audience:** All ages (no children-targeted content)
- **Background Location:** Used only while a trip is actively being recorded in the Trip Logger. Not used at any other time. ✅ verified — see step 7.

#### Trip routes used to be sent off-device — removed 2026-07-25

The 1.4.0 and earlier builds sent each recorded ride's GPS trace — coordinates
**and** per-point timestamps — to the public OSRM demo server
`router.project-osrm.org`, to snap the route to roads for display. It fired
automatically from a `useEffect` whenever a trip route was rendered, with no
user opt-in, so under Play's Data safety definitions it was *collection and
transfer* of precise location to a third party.

It was removed rather than declared: the feature was cosmetic, the demo server
carries no uptime or privacy guarantee, and the code already fell back to raw
GPS points whenever OSRM was slow or failed to match. Routes now render from the
recorded points directly (`lib/coords.ts`). Trip statistics never used OSRM and
are unchanged. **If a route-shape upload is ever reintroduced, it needs an
explicit user opt-in, a privacy-policy update, and a Data-safety change** — it
was the only thing that ever put trip data off-device.

#### Complete list of hosts the app contacts (audited 2026-07-25, `lib/config.ts`)

| Host | Purpose | What leaves the device | Declared in privacy policy? |
|---|---|---|---|
| `nominatim.openstreetmap.org` | reverse geocoding | current coordinates | ✅ yes |
| `overpass-api.de` | POI queries | current coordinates | ✅ yes |
| `overpass.kumi.systems` | Overpass mirror (round-robin, **not** fallback) | current coordinates | ✅ added 2026-07-25 |
| `api.open-meteo.com` | weather | current coordinates | ✅ yes |
| `tile.openstreetmap.de` | map tiles | coordinates, via tile path per pan/zoom | ✅ added 2026-07-25 |
| `*.wikipedia.org` | place descriptions | place title (not coordinates) | ✅ yes |
| `www.yr.no` | outbound link to forecast page | nothing until the user taps | n/a |

`fetchOverpass` **round-robins** across the endpoints rather than failing over in
order, so every mirror in the list receives a share of the queries. A third
mirror, `maps.mail.ru`, was operated in Russia and was therefore taking roughly a
third of all POI searches — not the rare last resort the docs previously implied.
It was removed on 2026-07-25.

### 7. Background Location Permission Declaration
Google Play will request a **Prominent Disclosure** for `ACCESS_BACKGROUND_LOCATION`.

In Play Console → App Content → Sensitive app permissions, provide:
- **Core functionality:** Trip Logger records GPS route and distance even when the screen is locked.
- **Why background access is needed:** Without background location, GPS tracking stops when the screen locks during a ride, resulting in incomplete route data.
- The foreground service notification ("Recording your ride in the background") is shown to users while background tracking is active.

✅ **Verified against the source.** `ACCESS_BACKGROUND_LOCATION` is declared in
`app.json:15` and `isAndroidBackgroundLocationEnabled: true` is set on the
`expo-location` plugin. `Location.startLocationUpdatesAsync` is called in exactly
one place (`app/(tabs)/triplogger.tsx:429`), inside the user's Start action, and
only after `getBackgroundPermissionsAsync()` returns `granted` — so the app never
attempts background tracking on a refusal, it silently degrades to
foreground-only `watchPositionAsync`. It is stopped on Stop
(`triplogger.tsx:297`) and on unmount (`triplogger.tsx:585`). The background task
(`lib/locationTask.ts`) writes `{latitude, longitude, timestamp}` to on-device
AsyncStorage only and performs **no** network I/O — the off-device transfer in
step 6 happens later, at render time, not in the background service.
`showsBackgroundLocationIndicator: true` is set.

### 8. Foreground Service Permission Declaration
Google Play will also ask whether the app uses any foreground service permissions.

For this app, the correct declaration is:
- **Does your app use foreground service permissions?** Yes
- **Foreground service type:** `location`
- **User-facing feature:** Trip Logger records the ride route, distance, and speed while the phone is locked.
- **Why foreground service is needed:** Android requires an ongoing foreground service notification while continuous background GPS is active. Without it, trip recording stops or becomes unreliable when the app is backgrounded.
- **User trigger:** The service starts only after the user explicitly taps Start in Trip Logger and stops when the user ends the recording.
- **Notification shown to the user:** `Vegvísir · Trip Logger` / `Recording your ride in the background.`

✅ **Verified.** `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` are declared
(`app.json:16-17`) and `location` is the correct and only service type — the
`foregroundService` block at `triplogger.tsx:434` is attached to a location
update request and nothing else. The notification strings above are
`triplog.notifTitle` / `triplog.notifBody`, quoted verbatim from
`lib/locales/en.json`; the title uses a **middle dot** (`Vegvísir · Trip Logger`),
which this checklist previously mis-transcribed as a plain space. The strings are
localised, so a reviewer on a no/sv/da/is device sees that locale's wording.

⚠️ **`POST_NOTIFICATIONS` is declared (`app.json:18`) but was missing from the
"Already Done" permission list above.** It is genuinely used — `expo-notifications`
is requested at `triplogger.tsx:373` — and Android 13+ requires it for the
foreground-service notification to be visible at all. Include it if the Console
asks for a per-permission justification.

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

