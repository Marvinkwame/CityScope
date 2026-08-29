# CityScope — Frontend

> **See the root [`../CLAUDE.md`](../CLAUDE.md) for the full monorepo guide, architecture, commands, and conventions.** This file only notes frontend specifics.

React 19 · TypeScript · Vite 8 · Mapbox GL JS 3 · MUI 7 (`sx`) · Zustand 5 · TanStack Query 5 · Turf.js · @mapbox/mapbox-gl-draw · Vitest.

## Frontend conventions

- Strict TypeScript — **no `any`**; type-only imports use `import type`.
- **All Mapbox mutation lives in `src/components/MapView.tsx`**; UI components write to Zustand stores, the map reacts via `useEffect`. Read stores imperatively (`useStore.getState()`) inside map event handlers to avoid stale closures.
- MUI `sx` styling on the dark "cartographer's instrument" theme (`src/theme.ts`): graphite surfaces, single gold accent (`AMBER`), cyan for live data. Responsive down to a mobile bottom-sheet.
- Analysis tools (isochrone / route / draw) are mutually exclusive; the active view is serialisable to the URL hash (`src/lib/shareCodec.ts`).

## Commands

```bash
npm run dev     # :5173
npm run build   # tsc -b && vite build
npm run lint
npm test        # Vitest
```

## Environment

`.env.local`: `VITE_MAPBOX_TOKEN`, `VITE_API_URL=http://localhost:3001`
