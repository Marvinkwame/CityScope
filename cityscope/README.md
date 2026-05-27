# CityScope

A geospatial web application for exploring urban infrastructure through interactive map visualisations. Analyse walking distances, plan routes, and inspect city layers across multiple cities — all in a dark-themed, sidebar-driven interface.

<!-- ![CityScope Screenshot](screenshot.png) -->

## Features

- **Interactive Map** — Full-screen Mapbox GL map with dark-v11 style, 2D/3D toggle, and smooth city-switching fly animations
- **Layer Toggling** — Show/hide roads, buildings, and district boundaries from the sidebar
- **District Boundaries** — GeoJSON overlay of city Bezirke/districts with fill and outline
- **3D Building Extrusion** — Toggle fill-extrusion rendering of city buildings
- **Feature Click Panel** — Click any road or building to see its name, type, and coordinates in a detail panel
- **POI Heatmap** — Kernel density heatmap of points of interest with a colour-scale legend; click anywhere to open a spotlight card showing nearby POI counts by category
- **Isochrone Analysis** — Click the map to draw walking, cycling, or driving reachability polygons (5/10/15/20/25/30 min bands); sidebar shows POI counts per band in collapsible accordions with a scrollable POI list and fly-to on click
- **Route Planning** — Place A and B pins on the map to draw a walking, cycling, or driving route; sidebar shows total distance, duration, and a scrollable turn-by-turn step list
- **Multi-city Support** — City switcher in the navbar; switching city clears all active analysis and flies the map to the new location

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 19, TypeScript 5.9 |
| Build | Vite 8 |
| Map | Mapbox GL JS 3 |
| UI | Material UI 7 |
| State | Zustand 5 |
| Data fetching | TanStack Query 5 |
| Map APIs | Mapbox Isochrone API, Mapbox Directions API |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Mapbox](https://www.mapbox.com/) account with an access token

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/cityscope.git
cd cityscope

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
```

Edit `.env.local` and add your Mapbox access token:

```
VITE_MAPBOX_TOKEN=pk.your_mapbox_token_here
```

You can get a free token at [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens/).

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
├── components/
│   ├── FeaturePanel.tsx           # Clicked feature detail panel (road/building)
│   ├── HeatmapSpotlightCard.tsx   # POI category breakdown on map click
│   ├── IsochroneControls.tsx      # Isochrone mode toggle, profile, time bands
│   ├── IsochroneResultsPanel.tsx  # Band accordions, POI list, fly-to, clear
│   ├── MapView.tsx                # Map init, layers, click/hover handlers
│   ├── Navbar.tsx                 # App bar with city switcher
│   ├── RouteControls.tsx          # Route toggle, Set A/B buttons, travel mode
│   ├── RouteResultsPanel.tsx      # Distance, duration, turn-by-turn steps
│   └── Sidebar.tsx                # Layer toggles + analysis tools panel
├── hooks/
│   ├── useCities.ts               # Fetch available cities from API
│   ├── useDistricts.ts            # Fetch district GeoJSON
│   ├── useHeatmapSpotlight.ts     # POI counts near a clicked point
│   ├── useIsochrone.ts            # Mapbox Isochrone API query
│   ├── useIsochroneResults.ts     # Aggregate POIs per isochrone band
│   ├── usePois.ts                 # Fetch POI dataset
│   └── useRoute.ts                # Mapbox Directions API query
├── store/
│   ├── cityStore.ts               # Active city selection
│   ├── featureStore.ts            # Clicked map feature state
│   ├── heatmapStore.ts            # Heatmap click origin
│   ├── isochroneStore.ts          # Isochrone mode, origin, profile
│   ├── layerStore.ts              # Layer visibility flags
│   ├── mapStore.ts                # Mapbox map instance ref
│   └── routeStore.ts              # Route mode, pins, profile
├── constants/
│   └── layerConfig.ts             # Layer IDs, Mapbox filters, colours
├── App.tsx                        # Root layout
├── main.tsx                       # Entry point with providers
└── theme.ts                       # MUI dark theme configuration
public/
└── data/
    └── berlin-districts.geojson   # Berlin Bezirke boundaries
```

## Architecture Notes

- **State management** — Zustand stores for all shared state. Components subscribe to stores directly; no prop drilling through `App`.
- **Map mutations** — All Mapbox source/layer operations happen exclusively in `MapView.tsx`. Sidebar components update stores; `MapView` reacts via `useEffect`.
- **Mode exclusivity** — Isochrone and Route Planning modes are mutually exclusive. Enabling either one disables the other at the toggle level.
- **Data fetching** — TanStack Query handles all async calls (cities, districts, POIs, isochrone polygons, directions). Query results are cached and keyed to prevent redundant network requests.
- **Imperative store reads** — Click handlers inside `map.on('click', ...)` use `useStore.getState()` (not hooks) to read current state without stale closure issues.

## License

MIT
