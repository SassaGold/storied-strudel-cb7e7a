# Changelog

## v1.4.4 — The whole ride counts (2026-07-30)

**Top speed missed everything recorded with the screen off.** `maxSpeedRef`
only updates in the foreground GPS watcher, which receives nothing while the
phone is pocketed — i.e. during every fast stretch of every real ride — and the
background task stored no speed at all (`BgPoint` was lat/lon/timestamp).
Found on a real ride: 130–150 km/h ridden, a fraction of that saved. Background
points now carry the native speed and accuracy, and stop and crash recovery
fold their highest reliable speed into the saved max, using the same
stale-point bound and paused-interval exclusion as the route merge and the
same accuracy gate as the foreground watcher. Rides recorded before this
release cannot be repaired — the speeds were never stored. (PR #150)

**Nameless OSM places showed up literally named "POI".** `osmPlaces` invented
the literal for elements without a name tag, and only the Explore screen
special-cased it. The title now stays undefined (name → brand → operator) so
each screen's own fallback fires. (PR #151)

1.4.3 cleared review the same day it was submitted (2026-07-30), so this
release ships on its own rather than superseding it.

## v1.4.3 — Accuracy (2026-07-29)

**Saved rides could be longer than the ride.** On stop, background-recorded
points are merged into the foreground route. That merge filtered for duplicate
timestamps and paused intervals, but never checked whether a point belonged to
*this* ride — and the background buffer can still hold points written moments
after the previous ride stopped. So a saved route could open with a leg from
wherever the rider was last seen to where they actually set off. That leg is
never real distance: it inflated `distanceKm`, and because `durationMs` is
unaffected, `avgSpeedKmh` with it.

It needed no unusual conditions. Ride to a meeting point with the app closed,
start recording, and if the first background fix delivered is the cached one from
where you set off, that whole leg joined your ride.

Observed as a saved 9.37 km against a live 5.65 km — the 3.72 km difference being
exactly the gap between the two locations — at 72 km/h average against a true 43.

The filter moved to `lib/tripStats.ts` as `mergeBackgroundPoints`, with six tests
including the regression. Both call sites are verified on a device: the stop path
saves 0.59 km where the bug gave 4.44, and crash recovery saves 0.80 km where a
stale leak would give 4.64.

> Choosing the bound is the subtle part. `startTimeRef` shifts forward on every
> resume so that `endTime - startTime` yields *active* duration, so it is not
> safe — using it would silently discard genuine points recorded before the first
> pause. Stop passes a new wall-clock `rideStartedAtRef` that never moves; crash
> recovery passes the recovered route's own first point, because its checkpoint
> only stores the shifted value.

### The home screen is now called Vegvísir

`RIDER HQ` was the only untranslated English left in an otherwise fully localised
UI, and `HQ` is an English abbreviation that does not travel. Per-locale
translation was not viable: every Nordic word for headquarters busts the tab
budget — `HOVEDKVARTER` 12, `HÖGKVARTER` 10, `HÖFUÐSTÖÐVAR` 12, against a maximum
of 8 across all locales.

`VEGVÍSIR` is already the product name in all five locales, is exactly 8
characters so nothing truncates, and is Icelandic in origin. The tagline loses
its now-redundant prefix, since it repeated the app name directly underneath.

The header was a hardcoded `<Text>RIDER HQ</Text>`; it now renders
`t("tabs.home")`, the same key as the tab label, so the two cannot drift apart.

### The in-app privacy text now describes what actually happens

The About screen said the app *"does not collect, transmit, or share any personal
data"* and that location is *"used only on-device"*. It sends precise coordinates
to `nominatim.openstreetmap.org`, `overpass-api.de`, `overpass.kumi.systems`,
`api.open-meteo.com` and `tile.openstreetmap.de`, and **Location: collected +
shared** was filed with Google on 2026-07-27.

The site and the store listing were both corrected for this claim; the in-app
strings were in neither fix, so the app had been contradicting its own store
card. The replacement wording is taken from sassagold.com, where it is already
reviewed and live.

`privacyP3` is untouched — *"trip data stays on the device"* is true, and has been
since 1.4.1 removed the OSRM upload.

### Locale corrections

Every one of the 468 strings was read against its English source, in all five
locales. Two classes came out of it.

Mechanical slips a script catches: `TRAFIIKKARTA` and `TRAFIIKKORT` (doubled `I`),
`Dagsbirt` (missing its `-a`), `mótorhjala` (wrong stem), stray capitals in
`Oklassificerad Väg` / `Uklassificeret Vej`, English Title Case in `Ferð Ekki
Vistuð`, and a `garage.locationError` that had lost its purpose clause while its
five siblings kept theirs.

Wrong-word choices only reading catches:

- **A bicycle for a motorcycle**, 28 times. `sykkel` is a pedal bike and `hjól` is
  a wheel; both files already contained `motorsykkel-` and `mótorhjól-` compounds.
- **A map scale for the metric system** and **"folk" units for imperial** —
  Icelandic offered a choice between `Mælikvarðakerfi` and `Þjóðrænt`.
- **A payment falling due** for a vehicle inspection — `á gjalddaga`, alongside
  `skiladagsetning`, a *submission* date. Both replaced by `skoðun`, which the
  file already used nine times.
- **`ODOMETER` left in English** in Norwegian, Swedish and Danish, where Icelandic
  had translated it.
- **Icelandic Explore said "games"** — `skoðunarverðir leikir` where every other
  locale says *sights*, and where its own three sibling strings already said
  `kennileiti`.

> `{{term}}` in the inspection strings is the **country's** native term, not the
> UI language — `Kontrollbesiktning`, `Aðalskoðun`, `EU-kontroll (PKK)`,
> `Periodisk syn` — so an Icelandic UI can render "Periodisk syn …". Any gendered
> adjective around it is unsafe. Worth remembering before editing those strings.

## v1.4.2 — Housekeeping (2026-07-28)

**A barcode scanner that nothing uses no longer ships to users.**
`expo-dev-launcher` declares `play-services-code-scanner` and
`mlkit:barcode-scanning` as `implementation` rather than `debugImplementation`,
so they compiled into every variant. The app has no barcode or QR feature. Eight
artifacts leave the release classpath — the two declared plus six transitive —
and with them go `mlkitinitprovider`, a ContentProvider registered under our own
package that ran at **every launch**, `GmsBarcodeScanningDelegateActivity`, and
the Firebase `BarcodeRegistrar` / `VisionCommonRegistrar`. Smaller download, less
work at startup, and one fewer Firebase-linked surface in an app that declares no
analytics.

The exclude is **release-only** and must stay that way: `expo-dev-launcher` uses
that scanner to read the Metro QR code, so a blanket exclude would break the
development workflow instead. Implemented as `plugins/withMlkitReleaseExclude.js`
because `android/` is generated and gitignored — an edit there would work locally
and vanish from every EAS build.

This replaces `plugins/withMlkitOrientationFix.js`, which existed only to strip
`android:screenOrientation` from the scanner activity so Play would stop flagging
an orientation restriction. With the library gone from the Play artifact that
advisory has no source, and keeping the plugin would have been worse than
useless: it wrote the activity into the app's own variant-agnostic
`AndroidManifest.xml`, so with nothing contributing it in release the node would
have shipped a declaration pointing at a class no longer in the APK.

**No Data safety change.** "Device or other IDs" is declared because
`expo-notifications` links `firebase-messaging`, which is untouched here.

### Two locale fixes

- **Danish** showed a Norwegian word: the trip-log badge read `TURLOGG`, where
  Danish is `TURLOG`. Only the badge — Danish doubles a consonant before a
  vowel-initial suffix (`blog` → `bloggen`), so `Turlogger` and `Turloggen` were
  already correct and are untouched.
- **Icelandic** Explore said *games*: `skoðunarverðir leikir` where every other
  locale says *sights*. Now `kennileiti`, which the same section already used in
  its other three strings.

### Verified on a device before release

Release build on a physical phone: `ProviderRequest[HIGH_ACCURACY]` reached the
OS provider, a real fix rendered with reverse geocode and weather, the
foreground-service notification posted, and trip recording collected GPS points
and released cleanly. The R8 mapping contains **zero** MLKit classes while
`expo.modules.location` is intact. This category of change broke location in
1.3.0 and 1.4.0, and a debug build cannot detect it — R8 does not run there, and
the exclude deliberately does not apply.

## v1.4.1 — Privacy (2026-07-26)

**Recorded trip routes no longer leave the device.** Every build from 1.1.7
through 1.4.0 uploaded each ride's coordinates *and* timestamps to the public
OSRM demo server to snap the line to roads — automatically, on every route
render, with no opt-in. That is removed. Route maps now draw straight from the
recorded GPS points, which was already the fallback whenever OSRM was slow or
could not match, so no new code path was introduced. Trip statistics never used
it and are unchanged. Visible cost: GPS jitter shows in the drawn line, and
signal gaps such as tunnels draw as a straight chord rather than following the
road.

**The Russian-operated Overpass mirror (`maps.mail.ru`) is gone.** Requests
round-robin across the mirrors rather than failing over in order, so it was
taking roughly a third of all POI searches rather than acting as the rare last
resort the docs claimed. Two mirrors remain.

**The RIDER HQ tagline is localised.** It was a hardcoded English string, so
Norwegian, Swedish, Danish and Icelandic riders all saw English. Two dead locale
keys went with it, one of which still held the old app name translated per
locale.

Store assets: all 40 screenshots re-captured from this build, and the privacy
policy corrected in every copy and every locale.

## v1.4.0 — Vegvísir (2026-07-24)

**Where Am I is now Vegvísir**, named after the Icelandic wayfinding stave. An in-place rename, not a new app: the package stays `com.sassagold.whereami`, so rides, garage and settings survive the update with nothing to reinstall. Ships a new gold stave icon set, splash screen and wordmark, a localized slogan in all five languages, and refreshed store listings (title, short and full description, 1.4.0 release notes) for **all five Play locales** — en-US, no-NO, sv-SE, da-DK, is-IS — plus localized store graphics and a marketing kit (wallpapers, promo banner, generators). Also adds `scripts/push-play-listing.js`, which pushes listing text and release notes to Play through the Publishing API with a service-account key.

> ⏳ **Submitted to Play, in review** (verified in Play Console 2026-07-25). The 1.4.0 production release and the store listings for all five locales — including da-DK and sv-SE as brand-new languages — are in Google's review queue. Managed publishing is off, so they go live as soon as review clears. Until then the public Play page still shows "Where Am I — Ride Companion" at 1.3.0; that is review lag, not an unpushed change.

## v1.3.0 — MC Season & Nordic Aurora (2026-07-24)

**MC Season** (in Garage): winterize and spring-prep checklists, a multi-bike garage, per-country inspection tracking with a reminder about a month before the deadline, and weather-aware nudges. Inspection rules verified for Sweden, Norway, Denmark and Iceland. **Nordic Aurora** is a full visual makeover across the app. **Languages trimmed from nine to the five Nordic-market ones** (EN / NO / SV / DA / IS) — ES, DE, FR and NL were dropped, since the app's data sources and inspection rules are Nordic. Also addresses Play Console advisories (R8 optimization, ML Kit orientation override) and adds the professional Play listing kit plus the developer-page header graphics.

## v1.2.6 — Visual Overhaul Release (2026-07-12)

Full-app appearance overhaul (PRs #108–#112). **Look & feel**: soft gradient header cards on every screen (the old decorative "glow" circles rendered as hard-edged discs), with all eight screens now sharing the same rounded header + pill badge pattern; chrome emoji replaced with theme-tinted vector icons (home header buttons and quick-nav grid, garage category tiles, SOS quick actions, settings chips); Oswald condensed display font for screen titles and the RIDER HQ wordmark; corner radii unified to one scale; brand-orange loading spinners everywhere; dark splash screen in light mode too (no more white flash into a black app). **UX**: pulsing skeleton placeholder rows while POI/Garage/SOS searches run instead of an empty screen; Road Conditions merges duplicate roadworks per street (×N) and collapses after 5 rows behind a Show all/Show fewer toggle; truncated tab labels ("RIDER …", "EXPLO…") fixed; doubled back-button arrow fixed; Sleep screen title no longer repeats its badge. **i18n**: grammatically correct singular/plural forms for roadwork counts and GPS points in all 9 languages, replacing the "(s)" hacks. **Accessibility**: the smallest 9–10pt labels raised to 11pt; the speedometer caps font scaling at 1.4× so large accessibility fonts can't overflow its fixed circle while everything else scales freely. **Under the hood**: Food/Sleep/Explore result lists are virtualized (FlatList) so long result sets mount rows lazily, and the three data hooks (POI fetch, emergency places, home-screen data) gained 20 unit tests covering caching, offline fallbacks, and search cancellation — 320 tests total.

---

## v1.2.5 — Performance & Fixes Release (2026-07-11)

Round-2 review release (PRs #102–#106), focused on battery and correctness. **Battery/performance**: the idle speedometer's GPS watcher now stops when the Trip tab isn't visible (it previously ran forever after the first visit — the app's biggest battery drain); recording no longer re-copies the route and re-renders the whole screen on every GPS fix; background GPS points are stored in bounded chunks instead of rewriting the whole ride every 3 s; saved routes are capped at 2000 points. **Bug fixes**: POI/emergency addresses display again (wrong OSM tag names meant they never appeared), saved trip distance now matches the live odometer after pause/resume, wind warnings no longer trigger at a gentle breeze (m/s thresholds were applied to km/h data), denying the notification permission no longer blocks recording, crash-recovered rides keep their max speed, and GPX files carry the correct start time. **Cleanup**: OTA update machinery fully removed (AAB-only releases), unused release CI deleted, unwanted Android permissions blocked. **Polish**: WCAG-AA text contrast on the trip tab and tab bar, translated crash screen with error logging, accessibility labels on the home quick-nav/SOS buttons, cached road-matching (no refetch per map expand), rotation-aware fullscreen map, and a "Map unavailable" notice when tiles can't load. 12 new unit tests (300 total).

---

## v1.2.4 — Feature Release (2026-07-11)

Full-app review release (PRs #92–#99). New rider features: **GPX export** per saved ride (share to Strava/Komoot/Garmin), **pause/resume recording** (fuel stops no longer end the ride or skew stats), **max speed** per ride and **lifetime totals** (rides/distance/time), and the Garage tab now auto-loads like the other tabs. Bug fixes: forecast timezone handling (dropped/duplicated days far from UTC), SOS network-error message that could never appear, negative daylight duration at eastern longitudes, MC category results now restore from cache when switching tiles, and a background-recording task leak after leaving the Trip tab mid-ride. Under the hood: CI actually runs now (was watching the wrong branch) with a new typecheck step, timeouts on all external API calls, Overpass query hardening, a central color theme, a shared SOS info modal with call button, week-old cache pruning, 49 new unit tests (288 total), and 21 new translations × 9 languages.

---

## v1.2.3 — Patch Release (2026-07-10)

Feature and cleanup batch. Emoji + readable category labels on MC Garage results and place-info modals; map-matched road routes shown for saved trips (OSRM); tap-to-expand full-screen trip map; Netlify web deploys retired (`netlify.toml` removed). Includes all merged improvement batches since 1.2.2: offline cache banners with age, pull-to-refresh across data screens, and POI map/list view toggle powered by OSM tiles.

---

## v1.2.2 — Patch Release (2026-07-10)

Fixed two shipped UI regressions caught in visual verification: the SOS button no longer shows two emergency numbers at once (locale strings carried a hardcoded number next to the dynamic locale-aware one), and the weather Wind/Precip labels no longer contradict unit-aware values ("7 km/h" under a "(m/s)" label). All 9 locales corrected.

---

## v1.2.1 — Patch Release (2026-07-10)

Safety, robustness and accessibility batches: locale-aware emergency number on the SOS button (911/999/000/111/112 by country), GPS timeouts on all position reads (no more stuck spinners), trip-logger crash recovery via ride checkpointing, low-accuracy GPS point filtering, missing trip-logger error translations in 8 locales plus a locale-parity test, imperial unit coverage for wind/precipitation/road distances, and accessibility roles/labels across modals and controls.

---

## v1.2.0 — Patch Release (2026-07-09)

Repaired broken POI and SOS searches (Overpass query fixes) and added a rural fallback that automatically widens the search radius when nothing is found nearby.

---

## v1.1.7 — Patch Release (2026-05-10)

Completed the migration from HERE Maps to OpenStreetMap/Nominatim throughout the entire app. Removed all remaining HERE references from source code, comments, locale strings, and the About screen data-sources card. The `hereApiKey.ts` helper file was deleted (unused). The About screen now correctly credits Nominatim and links to `nominatim.openstreetmap.org`. No API keys are required for any feature.

---

## v1.1.6 — Patch Release (2026-05-09)

Resolved merge conflicts from concurrent branch work. All tab screens, shared hooks, and locale files reconciled to a single clean state. Lint and tests confirmed green.

---

## v1.1.5 — Patch Release (2026-05-08)

Migrated POI search from HERE Places API to OpenStreetMap / Overpass API. `lib/herePlaces.ts` now queries Overpass directly using `fetchOsmPlaces`, with backward-compatible type aliases (`HerePlaceItem`, `fetchHereDiscover`, etc.) retained for callers. Emergency places hook (`lib/useEmergencyPlaces.ts`) updated to use `OVERPASS_DEFAULT_TIMEOUT_MS`. All nine locale files updated to remove HERE Map Tiles references; `mapsDesc` now describes OSM tile layers.

---

## v1.1.4 — Patch Release (2026-05-07)

Dependency maintenance: updated all Expo SDK packages to latest patch versions, resolved peer-dependency warnings, confirmed lint and test suite green after upgrade.

---

## v1.1.3 — Patch Release (2026-04-16)

Added Google-required Prominent Disclosure screen for location permission. A full-screen in-app modal now appears before the OS location permission dialog, clearly explaining what location data is collected, how it is used, that it is never shared, and that the user may decline. Supported in all 9 app languages.

---

## v1.1.1 — Patch Release (2026-04-14)

Maintenance release with bug fixes and stability improvements.

---

## v2.0.0 — Version 2 (2026-03-13)

Second major release of **Where Am I**. Expanded to 9 tabs and added Trip Logger, SOS/Emergency, Settings, and About screens, plus multilingual support for 9 languages.

### New in v2

#### 🆘 SOS / Emergency tab (new)
- Big red SOS button — calls 112
- Quick-action grid: Call 112 · Share Location · Torch Screen · Instructions
- White-screen torch overlay
- Instructions bottom-sheet modal

#### 📍 Trip Logger tab (new)
- Live SpeedGauge (28-tick, 240° sweep, green→red gradient)
- Real-time distance / duration / avg-speed stats
- START/STOP button with haptic feedback
- Ride history cards with orange accent strip and stat chips
- Metric / Imperial unit support

#### ⚙️ Settings tab (new)
- Unit system toggle: Metric / Imperial
- Search radius: 2 – 20 km
- Default tab selector
- Haptic feedback on chip selection

#### ℹ️ About tab (new)
- App name, version, description, and credits

#### i18n expanded to 9 languages
- English, Spanish, German, French, Icelandic, Norwegian, Swedish, Danish, Dutch

#### Header / UI polish
- All POI tabs use safe-area insets
- Orange active-indicator glow on the tab bar
- Translucent "📍 WHERE AM I?" subtitle on RIDER HQ

### Technical Highlights (v2)
- Shared `lib/overpass.ts`: haversine distance, Overpass fetch, 30-min TTL cache
- Shared `lib/settings.ts`: SettingsContext / useSettings
- `lib/i18n.ts` + 8 locale JSON files under `lib/locales/`
- AsyncStorage caching keys: `cache_{screen}_v2`
- IIFE require pattern for optional native modules (maps, haptics)
- EAS Build configured for development, preview, and production profiles

---

## v1.0.0 — Version 1 (2026-03-13)

Initial complete release of **Where Am I** — the biker companion app.

### Features

#### 🏠 RIDER HQ (Home)
- Full-screen map showing current location
- `🏍️ RIDER HQ` header with `📍 WHERE AM I?` subtitle
- Header row: ℹ️ About · 🌐 Language selector · ⚙️ Settings
- Reverse-geocoded address display
- 5-language i18n (English, Spanish, German, French, Icelandic)

#### 🍽️ Restaurants
- Nearby restaurants via OpenStreetMap/Overpass API
- 30-minute AsyncStorage cache (`cache_restaurants_v2`)
- Map + list toggle, distance chips, phone/web/navigate actions

#### 🏨 Hotels
- Nearby hotels/accommodation via Overpass API
- 30-minute cache (`cache_hotels_v2`)

#### 🏛️ Attractions
- Nearby tourist attractions via Overpass API
- 30-minute cache (`cache_attractions_v2`)

#### 🏍️ MC (Motorcycle Services)
- Nearby motorcycle repair, fuel, parts via Overpass API
- Category filter chips (All / Repair / Fuel / Parts)
- 30-minute cache per category

#### 🆘 SOS / Emergency
- Big red SOS button — calls 112
- Quick-action grid: Call 112 · Share Location · Torch Screen · Instructions
- White-screen torch overlay
- Instructions bottom-sheet modal

#### 📍 Trip Logger
- Live SpeedGauge (28-tick, 240° sweep, green→red gradient)
- Real-time stats: distance · duration · avg speed
- Metric / Imperial unit toggle (from Settings)
- Ride history cards with orange accent strip and stat chips
- Haptic feedback on start/stop

#### ⚙️ Settings
- Unit system: Metric / Imperial
- Search radius: 2 – 20 km
- Default tab selector
- Haptic feedback on chip selection

#### ℹ️ About
- App info, version, and credits

### Technical Highlights
- Expo Router (file-based routing, 9 tabs)
- Shared utility library: `lib/overpass.ts` (Overpass fetch, haversine distance, cache TTL)
- Shared settings context: `lib/settings.ts`
- i18n via `react-i18next` / `lib/i18n.ts` with 5 locale JSON files
- Safe-area insets on all screens
- react-native-maps with Google provider on Android, default on iOS
- IIFE require pattern for optional native modules (maps, haptics)
- Tab bar with orange active-indicator glow
