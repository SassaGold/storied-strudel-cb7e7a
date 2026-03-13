# Changelog

## [2.0.0] - 2026-03-13

### Added
- Emergency SOS tab: one-tap 112 call, location sharing, torch screen, first aid instructions
- Trip Logger tab: GPS ride tracking with SpeedGauge, stats (distance/duration/avg speed), ride history
- Settings tab: language selection (EN/DE/FR/ES/NL), units, search radius, haptic feedback
- About tab: app info, feature list, data source links
- Shared `lib/overpass.ts` utilities: haversineMeters, fetchOverpass, formatDistance, OVERPASS_ENDPOINTS, CACHE_TTL_MS
- Shared `lib/settings.ts` settings context
- Enhanced tab bar with orange active indicator and 9-tab layout
- Safe area insets support across all screens
- expo-haptics integration in Emergency, Trip Logger, and Settings tabs

### Changed
- Tab bar height increased to 64px with improved label styling
- Tab active color changed to orange (#f97316) to match brand
- App version bumped to 2.0.0

## [1.0.0] - 2026-03-13

### Added
- Home/RIDER HQ tab with live weather, geolocation, and map
- Restaurants tab: find nearby restaurants and cafés via OpenStreetMap
- Hotels tab: find nearby hotels, motels, and guest houses
- Attractions tab: find nearby tourist attractions and historic sites
- MC tab: motorcycle parking, fuel stations, and workshops nearby
- Dark purple theme (#0f0a1a background)
- Overpass API integration for POI data
- expo-location for GPS positioning
