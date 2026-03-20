# CityScope

Geospatial portfolio app for exploring Berlin's urban infrastructure through interactive 2D/3D map visualizations.

## Tech Stack

- **Frontend:** React 19, TypeScript 5.9, Vite 8
- **Map:** Mapbox GL JS 3 (dark-v11 style)
- **UI:** Material UI 7 (dark theme), Emotion
- **State:** Zustand 5

## Commands

```bash
npm run dev       # Start dev server
npm run build     # TypeScript check + Vite build
npm run lint      # ESLint
npm run preview   # Preview production build
```

## Project Structure

```
src/
  components/     # React components (MapView, Sidebar, Navbar)
  store/          # Zustand stores (layerStore)
  constants/      # Shared config (layerConfig)
  theme.ts        # MUI dark theme
  env.d.ts        # Vite env type declarations
public/
  data/           # Static GeoJSON files (berlin-districts.geojson)
```

## Architecture

- **State management:** Zustand stores for shared state between components. Components subscribe to stores directly — no prop drilling through App.
- **Map layers:** All Mapbox layer manipulation happens exclusively in `MapView.tsx`. Sidebar toggles update Zustand store; MapView reacts via `useEffect`.
- **Layer visibility:** Built-in Mapbox layers (roads, buildings) are identified by ID prefix on `style.load` and cached in refs. Custom layers (districts) are added as GeoJSON sources.

## Conventions

- Strict TypeScript — no `any` types
- Desktop-first layout
- MUI dark theme (#121212 background, #90caf9 primary accent)
- Components use MUI's `sx` prop for styling
- Type-only imports use `import type`

## Environment

Requires a Mapbox access token in `.env.local`:

```
VITE_MAPBOX_TOKEN=pk.your_token_here
```

Get a token at https://account.mapbox.com/access-tokens/

## Phase Progress

- [x] Phase 1 — Map Shell (Mapbox map, MUI navbar + sidebar)
- [x] Phase 2 — Layer Toggling (roads, buildings, districts with Zustand)
- [ ] Phase 3 — Feature Click Panel
- [ ] Phase 4 — 3D Building Extrusion
- [ ] Phase 5 — Node + PostGIS Backend
- [ ] Phase 6 — Heatmap Overlay (Deck.gl)
