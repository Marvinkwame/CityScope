# CityScope — Frontend

React 19 + Mapbox GL JS 3 geospatial application. See how close every block of a city lives to six everyday needs, draw isochrones, plan routes, search places, and explore POI density across multiple cities.

🔗 **[Live Demo](https://city-scope-seven.vercel.app)** &nbsp;·&nbsp; [Backend](../cityscope-backend/)

---

## Features

- **Everyday reach** — every populated H3 block coloured by how many of six everyday needs (supermarket, pharmacy, doctor, school, park, station) lie within 5–20 minutes' walk along the streets; the headline and its range are recalculated in the browser in one pass over typed arrays; click a block for its nearest places with each walk drawn along the streets; 3D columns by residents; a card from an older build refetches itself once
- **Isochrone analysis** — reachability polygons (5–30 min) with a server-side PostGIS join per band, a band switcher, and fly-to on place click
- **District statistics** — click a district for POI count, area, density against the city average, and its top categories
- **Draw & analyse** — draw any polygon and get the same statistics for it, computed in PostGIS
- **Save & share** — the whole view, including the active analysis, round-trips through a link
- **Shared results panel** — every tool builds its results from the same parts: stat rows, category bars with shares, and place lists
- **Welcome card** — a first visit gets three one-click examples (stored share links) and turns the free-tier API's cold start into reading time; returning visitors get a small status pill instead, and the navbar's Examples button re-opens the card
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
| UI | Material UI 7 — dark theme built on three colour roles (you / answer / context) |
| State | Zustand 5 |
| Data fetching | TanStack Query 5 |

---

## Project structure

```
src/
├── components/
│   ├── MapView.tsx                # Map init, all layer/source/marker operations
│   ├── Navbar.tsx                 # App bar — city switcher, 3D toggle
│   ├── ShareButton.tsx            # Copies the shareable link to the current view
│   ├── ExamplesButton.tsx         # Navbar button that re-opens the welcome card
│   ├── Sidebar.tsx                # Layer toggles + analysis tool cards
│   ├── GeoSearch.tsx              # Floating geocoding search bar
│   ├── IsochroneControls.tsx      # Isochrone mode toggle, profile, time bands
│   ├── IsochroneResultsPanel.tsx  # Band switcher over one band's stats, bars and places
│   ├── RouteControls.tsx          # Route mode — Set A/B, travel mode, status
│   ├── RouteResultsPanel.tsx      # Distance, duration, turn-by-turn steps
│   ├── FeaturePanel.tsx           # Right drawer — clicked feature properties
│   ├── HeatmapSpotlightCard.tsx   # Bottom-left — nearest POIs on heatmap click
│   ├── WelcomeDialog.tsx          # First-visit card: three examples and the cold-start status
│   ├── ServerStatusPill.tsx       # Cold-start status for returning visitors, after 1.5 s
│   ├── PulseDot.tsx               # The cyan "working" dot (honours reduced motion)
│   ├── DistrictStatsView.tsx      # District detail — stat row, density badge and category bars
│   ├── DrawControls.tsx           # Draw Area toggle, area stats and bars, Clear area
│   ├── reach/                     # Everyday reach: panel, headline, time control, legend,
│   │                              #   method note, block card and its rows
│   └── results/                   # Shared result parts: StatRow, SectionLabel, CategoryBars,
│                                  #   ComparisonBadge, PlaceList, CategoryIcon, plus their pure, tested helpers
├── hooks/
│   ├── useIsochrone.ts            # Mapbox Isochrone API — TanStack Query
│   ├── useIsochronePois.ts        # POIs per isochrone band, joined server-side in PostGIS
│   ├── useRoute.ts                # Mapbox Directions API — TanStack Query
│   ├── useGeocode.ts              # Mapbox Geocoding API — TanStack Query
│   ├── useHeatmapSpotlight.ts     # Nearest POIs to a clicked point
│   ├── usePois.ts                 # POI dataset from backend
│   ├── useDistricts.ts            # District GeoJSON from backend
│   ├── useDistrictStats.ts        # Statistics for one district, computed in PostGIS
│   ├── useAreaAnalysis.ts         # Statistics for a drawn polygon, computed in PostGIS
│   ├── useCities.ts               # City list from backend
│   ├── useShareSync.ts            # Restores the view from the URL hash, keeps the hash current
│   ├── useServerStatus.ts         # Waking / error / ready, with a retry
│   ├── useReachPayload.ts         # A city's Everyday reach payload, held for the session
│   ├── useReachCard.ts            # One block's card, refetched once when it disagrees with the payload
│   └── useReachSummary.ts         # The headline, range and per-need shares for the chosen limit
├── store/
│   ├── mapStore.ts                # Mapbox map instance (for imperative access)
│   ├── cityStore.ts               # Active city
│   ├── layerStore.ts              # Layer visibility
│   ├── isochroneStore.ts          # Isochrone mode — enabled, origin, profile
│   ├── routeStore.ts              # Route mode — enabled, pins, profile
│   ├── drawStore.ts               # Draw mode — enabled, drawn polygon, clear request
│   ├── geoSearchStore.ts          # Geocoding result (for map pin)
│   ├── heatmapStore.ts            # Heatmap click origin
│   ├── featureStore.ts            # Clicked map feature
│   ├── reachStore.ts              # Everyday reach — on / off, minutes, chosen needs, selected block
│   └── uiStore.ts                 # Sidebar open / closed; welcome card open / closed
├── lib/
│   ├── mapPins.ts                 # DOM elements for the map pins, one shape per kind
│   ├── heatmapExposure.ts         # Per-city heatmap weight from POI density (p99 per 400 m cell)
│   ├── layerOrder.ts              # beforeId rules: context < answer < labels < you
│   ├── shareCodec.ts              # App state <-> base64url URL hash, validated on decode
│   ├── shareState.ts              # Collect / rehydrate the shareable state
│   ├── drawFeatures.ts            # Inspect mapbox-gl-draw's feature store
│   ├── examples.ts                # The welcome card's examples, as share states
│   ├── welcomeMemory.ts           # Show or dismiss rules for the card; storage-safe
│   ├── serverStatus.ts            # Cold-start status from the city list and the map
│   ├── isochronePayload.ts        # Mapbox isochrone response -> backend contract
│   └── reach/                     # Everyday reach logic, all pure and tested: the payload model and
│                                  #   API, the one-pass summary, colour expressions, card lines and pins, copy
├── constants/
│   ├── layerConfig.ts             # Layer IDs, Mapbox filter functions, layer toggle metadata
│   └── drawStyles.ts              # mapbox-gl-draw styles, recoloured to the "you" role
├── App.tsx
├── main.tsx
├── theme.ts                       # Design tokens and the three colour roles, plus the MUI dark theme
├── theme.test.ts                  # Heatmap ramp and colour role invariants
├── reachContrast.test.ts          # Contrast between the reach classes, the selection and the walks
└── colourGuard.test.ts            # Fails `npm test` on any colour literal outside theme.ts
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
