# Changelog

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
