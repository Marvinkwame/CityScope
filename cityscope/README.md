# CityScope — Frontend

React 19 + Mapbox GL JS 3 geospatial application. Draw isochrones, plan routes, search places, and explore POI density across multiple cities.

🔗 **[Live Demo](https://your-demo-url.vercel.app)** &nbsp;·&nbsp; [Backend](../cityscope-backend/)

---

## Features

- **Isochrone analysis** — reachability polygons (5–30 min) with per-band POI aggregation, accordion results, and fly-to on POI click
- **Route planning** — A/B pin placement, walking / cycling / driving profiles, real-time directions from Mapbox, turn-by-turn step list
- **Geocoding search** — floating pill search bar, 300 ms debounced suggestions from Mapbox Geocoding API, proximity-biased to the active city
- **POI heatmap** — kernel density layer with spotlight card (nearest POIs by category on click)
- **Feature inspection** — click any road or building to open a detail panel with properties from the Mapbox style
- **Layer toggling** — roads, buildings, district boundaries, heatmap
- **3D building extrusion** — flat ↔ fill-extrusion toggle
- **Multi-city** — city switcher, per-city districts and POIs from a PostgreSQL backend

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 · TypeScript 5.9 · Vite 8 |
| Map | Mapbox GL JS 3 (dark-v11) |
| Map APIs | Isochrone API · Directions API · Geocoding API v5 |
| UI | Material UI 7 — custom dark glass theme |
| State | Zustand 5 |
| Data fetching | TanStack Query 5 |

---

## Project structure

```
src/
├── components/
│   ├── MapView.tsx                # Map init, all layer/source/marker operations
│   ├── Navbar.tsx                 # App bar — city switcher, 3D toggle
│   ├── Sidebar.tsx                # Layer toggles + analysis tool cards
│   ├── GeoSearch.tsx              # Floating geocoding search bar
│   ├── IsochroneControls.tsx      # Isochrone mode toggle, profile, time bands
│   ├── IsochroneResultsPanel.tsx  # Band accordions, POI list, fly-to
│   ├── RouteControls.tsx          # Route mode — Set A/B, travel mode, status
│   ├── RouteResultsPanel.tsx      # Distance, duration, turn-by-turn steps
│   ├── FeaturePanel.tsx           # Right drawer — clicked feature properties
│   └── HeatmapSpotlightCard.tsx   # Bottom-left — nearest POIs on heatmap click
├── hooks/
│   ├── useIsochrone.ts            # Mapbox Isochrone API — TanStack Query
│   ├── useRoute.ts                # Mapbox Directions API — TanStack Query
│   ├── useGeocode.ts              # Mapbox Geocoding API — TanStack Query
│   ├── useIsochroneResults.ts     # Aggregate POIs per isochrone band
│   ├── useHeatmapSpotlight.ts     # Nearest POIs to a clicked point
│   ├── usePois.ts                 # POI dataset from backend
│   ├── useDistricts.ts            # District GeoJSON from backend
│   └── useCities.ts               # City list from backend
├── store/
│   ├── mapStore.ts                # Mapbox map instance (for imperative access)
│   ├── cityStore.ts               # Active city
│   ├── layerStore.ts              # Layer visibility
│   ├── isochroneStore.ts          # Isochrone mode — enabled, origin, profile
│   ├── routeStore.ts              # Route mode — enabled, pins, profile
│   ├── geoSearchStore.ts          # Geocoding result (for map pin)
│   ├── heatmapStore.ts            # Heatmap click origin
│   └── featureStore.ts            # Clicked map feature
├── constants/
│   └── layerConfig.ts             # Layer IDs, Mapbox filter functions, colours
├── App.tsx
├── main.tsx
└── theme.ts                       # MUI dark glass theme
```

---

## Architecture decisions

### All Mapbox mutations live in MapView

Every `map.addSource`, `map.addLayer`, and `new mapboxgl.Marker()` call lives in `MapView.tsx`. Components write to Zustand stores; `MapView` reacts via `useEffect`. This keeps the Mapbox lifecycle isolated — no scattered map calls across the tree, no race conditions from multiple owners.

### Imperative `getState()` in event handlers

Map click handlers (`map.on('click', ...)`) run inside a `useEffect` that fires once on mount, which means they close over stale hook values. All stores are read imperatively via `useStore.getState()` inside these handlers. This avoids the classic stale-closure problem with GL JS + React and is consistent with Zustand's documentation for this pattern.

### TanStack Query with `enabled` guards

Every external data source uses TanStack Query:

```ts
// Isochrone query only fires when origin is set
useQuery({
  queryKey: ['isochrone', origin?.lng, origin?.lat, profile, contourMinutes],
  queryFn: () => fetchIsochrone(...),
  enabled: enabled && origin !== null,
  staleTime: 5 * 60 * 1000,
})
```

The `enabled` guard means no speculative fetches, and `staleTime` prevents redundant network calls when the user toggles back to a previous configuration.

### Mode exclusivity without circular imports

Isochrone and Route modes are mutually exclusive. The naïve solution — having each store import the other — creates circular dependencies. Instead, the control components handle it: when enabling a mode, the component reads the other store imperatively via `getState()` and disables it. The stores themselves have no knowledge of each other.

### Geocoding debounce + `freeSolo` gotcha

The GeoSearch component uses a 300 ms `setTimeout` debounce before passing the query to `useGeocode`. MUI Autocomplete's `freeSolo` prop suppresses the popup when `options` is empty — which silently breaks `noOptionsText`. The fix is to control `open` explicitly via focus state and ignore `reason === 'reset'` in `onInputChange` to prevent MUI from clearing the input on blur.

---

## Commands

```bash
npm run dev       # Start dev server (http://localhost:5173)
npm run build     # TypeScript check + Vite production build
npm run lint      # ESLint
npm run preview   # Preview production build
```

---

## Environment variables

```bash
# .env.local
VITE_MAPBOX_TOKEN=pk.your_token_here
VITE_API_URL=http://localhost:3001
```

Get a free Mapbox token at [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens/).

---

## License

MIT
