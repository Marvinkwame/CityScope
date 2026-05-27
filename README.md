# CityScope

A full-stack geospatial web application for exploring urban infrastructure through interactive map visualisations. Analyse walking distances, plan routes, inspect city layers, and explore POI density — across multiple cities — in a dark-themed, sidebar-driven interface.

<!-- ![CityScope Screenshot](screenshot.png) -->

## Repository Structure

```
cityscope-app/
├── cityscope/           # React frontend (Vite + Mapbox GL JS)
└── cityscope-backend/   # Node.js REST API (Express + PostgreSQL)
```

## Features

- **Interactive Map** — Full-screen Mapbox GL map with dark-v11 style, 2D/3D building toggle, and smooth city-switching fly animations
- **Layer Toggling** — Show/hide roads, buildings, and district boundaries from the sidebar
- **District Boundaries** — GeoJSON overlay of city Bezirke/districts with fill and outline, served from the backend
- **3D Building Extrusion** — Toggle fill-extrusion rendering of buildings at street level
- **Feature Click Panel** — Click any road or building to see its name, type, and coordinates in a detail panel
- **POI Heatmap** — Kernel density heatmap of points of interest with a colour-scale legend; click anywhere to open a spotlight card showing nearby POI counts by category
- **Isochrone Analysis** — Click the map to draw walking, cycling, or driving reachability polygons (5–30 min bands); sidebar shows POI counts per band in collapsible accordions with a scrollable POI list and fly-to on click
- **Route Planning** — Place A and B pins on the map to draw a walking, cycling, or driving route; sidebar shows total distance, duration, and a scrollable turn-by-turn step list
- **Multi-city Support** — City switcher in the navbar; switching city clears all active analysis and flies the map to the new location

## Tech Stack

### Frontend (`cityscope/`)

| Category | Technology |
|----------|------------|
| Framework | React 19, TypeScript 5.9 |
| Build | Vite 8 |
| Map | Mapbox GL JS 3 |
| UI | Material UI 7 |
| State | Zustand 5 |
| Data fetching | TanStack Query 5 |
| Map APIs | Mapbox Isochrone API, Mapbox Directions API |

### Backend (`cityscope-backend/`)

| Category | Technology |
|----------|------------|
| Runtime | Node.js |
| Framework | Express 5, TypeScript 5.9 |
| Database | PostgreSQL |
| Driver | node-postgres (pg) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [PostgreSQL](https://www.postgresql.org/) running locally
- A [Mapbox](https://www.mapbox.com/) account with an access token

---

### Backend

```bash
cd cityscope-backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
```

Edit `.env`:
```
DATABASE_URL=postgres://user:password@localhost:5432/cityscope
PORT=3001
```

Seed the database:
```bash
npm run seed:cities   # Insert city records
npm run seed:pois     # Fetch and insert POI data
```

Start the server:
```bash
npm run dev
```

API runs at [http://localhost:3001](http://localhost:3001).

---

### Frontend

```bash
cd cityscope

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
```

Edit `.env.local`:
```
VITE_MAPBOX_TOKEN=pk.your_mapbox_token_here
VITE_API_URL=http://localhost:3001
```

Start the dev server:
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

### Frontend Build

```bash
cd cityscope
npm run build
npm run preview
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cities` | List all available cities |
| GET | `/api/cities/:cityId/districts` | District GeoJSON for a city |
| GET | `/api/cities/:cityId/pois` | POI records for a city |

## License

MIT
