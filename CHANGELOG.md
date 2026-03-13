# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - Unreleased

### Added
- *(version 2 features coming soon)*

---

## [1.0.0] - 2026-03-13

### Added
- **Home tab** – GPS-based "Where am I?" screen with real-time geocoding (reverse address lookup via Nominatim), live weather data (Open-Meteo API: temperature, wind speed, precipitation, weather code), and a list of nearby points of interest sorted by distance.
- **Restaurants tab** – Finds nearby restaurants, cafés, and fast-food outlets using the OpenStreetMap Overpass API; shows name, category, and distance; links to Google Maps for directions.
- **Hotels tab** – Finds nearby hotels, motels, hostels, and guest houses using the Overpass API; displays star rating when available; links to Google Maps for directions.
- **Attractions tab** – Discovers nearby tourist attractions, viewpoints, museums, and landmarks via the Overpass API; links to Google Maps for directions.
- **MC tab** – Locates nearby motorcycle-relevant POIs (fuel stations, repair shops, parking) via the Overpass API; links to Google Maps for directions.
- Location permission handling for iOS, Android, and web (Safari).
- Haversine distance calculation for sorting POIs by proximity.
- Multiple Overpass API endpoint fallback for reliability.
- Expo Router file-based navigation with bottom tab bar.
- Responsive design supporting iOS, Android, and web (Netlify static export).
