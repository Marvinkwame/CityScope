# CityScope

**A full-stack geospatial platform for exploring urban infrastructure** — draw reachability zones, plan multi-modal routes, search places, and analyse POI density across any city, powered by Mapbox GL JS and a PostgreSQL backend.

<!-- Replace with an actual screenshot once deployed -->
![CityScope](.github/screenshot.png)

🔗 **[Live Demo](city-scope-seven.vercel.app)** &nbsp;·&nbsp; [Frontend](cityscope/) &nbsp;·&nbsp; [Backend](cityscope-backend/)

---

## What it does

| Feature | Description |
|---------|-------------|
| **Isochrone Analysis** | Click any point to draw walking / cycling / driving reachability polygons across up to 6 time bands (5–30 min). Sidebar aggregates POI counts per band with category breakdowns and fly-to on click. |
| **Route Planning** | Place two pins (A → B) and get a real-time route with total distance, duration, and a scrollable turn-by-turn step list. Supports walking, cycling, and driving profiles. |
| **Geocoding Search** | Floating search bar with 300 ms debounce — finds addresses, landmarks, and POIs worldwide, biased toward the active city. Fly-to + pin on selection. |
| **POI Heatmap** | Kernel density heatmap of points of interest. Click anywhere for a spotlight card showing the nearest places by category with fly-to. |
| **Feature Inspection** | Click any road or building to open a detail panel with its name, type, coordinates, and raw properties from the Mapbox style. |
| **Layer Toggling** | Show / hide roads, buildings, district boundaries, and heatmap from the sidebar. |
| **3D Buildings** | One-click toggle between flat and fill-extrusion building rendering. |
| **Multi-city** | City switcher in the navbar — switching city clears active analysis and flies the map to the new location. All data (districts, POIs) is served from the backend per city. |

---

## Tech stack

### Frontend

| Layer | Technology |
|-------|------------|
| Framework | React 19 · TypeScript 5.9 · Vite 8 |
| Map | Mapbox GL JS 3 (dark-v11 style) |
| Map APIs | Mapbox Isochrone API · Directions API · Geocoding API v5 |
| UI | Material UI 7 (custom dark glass theme) |
| State | Zustand 5 |
| Data fetching | TanStack Query 5 |

### Backend

| Layer | Technology |
|-------|------------|
| Runtime | Node.js · TypeScript 5.9 |
| Framework | Express 5 |
| Database | PostgreSQL (node-postgres) |

---

## Architecture highlights

**All Mapbox mutations in one place.** Every source, layer, and marker operation lives exclusively in `MapView.tsx` and reacts to store changes via `useEffect`. Sidebar components write to Zustand stores; the map reads from them. This keeps the map lifecycle isolated and prevents scattered side effects.

**Imperative store reads in event handlers.** Map click handlers use `useStore.getState()` rather than hook subscriptions to avoid stale closures inside Mapbox's event system — a common gotcha with GL JS and React.

**TanStack Query for all async data.** Isochrone polygons, route geometry, geocoding suggestions, districts, and POIs are all managed as queries with proper `queryKey` caching, `enabled` guards, and `staleTime`. No manual loading flags or ad-hoc fetch calls.

**Mode exclusivity at the toggle layer.** Isochrone and Route modes are mutually exclusive. Each control component disables the other via `getState()` on enable — avoids circular store imports and keeps the logic co-located with the UI decision.

---

## Getting started

### Prerequisites

- Node.js 18+
- PostgreSQL running locally
- Mapbox access token ([get one free](https://account.mapbox.com/access-tokens/))

### 1. Backend

```bash
cd cityscope-backend
npm install
cp .env.example .env          # add DATABASE_URL and PORT=3001
npm run seed:cities
npm run seed:pois
npm run dev                   # http://localhost:3001
```

### 2. Frontend

```bash
cd cityscope
npm install
cp .env.example .env.local    # add VITE_MAPBOX_TOKEN and VITE_API_URL=http://localhost:3001
npm run dev                   # http://localhost:5173
```

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cities` | All available cities |
| GET | `/api/cities/:id/districts` | District GeoJSON for a city |
| GET | `/api/cities/:id/pois` | POI records for a city |

---

## License

MIT
