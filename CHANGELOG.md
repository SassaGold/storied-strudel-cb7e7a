# Changelog

## v1.0.0 — Version 1 (2026-03-13)

Initial complete release of **Roamly** — the biker companion app.

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
