# UI Phase 1 — Colour Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every colour in the app — UI, map layers, markers and the drawn polygon — onto three semantic roles defined in `theme.ts`, and add a test that makes hard-coding a colour anywhere else fail the build.

**Architecture:** `theme.ts` gains role tokens (`ROLE.you` / `ROLE.answer` / `ROLE.context`), neutral surface tokens, and one heatmap ramp with two builders (a Mapbox expression and a CSS gradient), so map and legend share one source. A guard test scans `src/` for colour literals. It starts with a list of not-yet-migrated files, and each task removes its files from that list and fixes them, so the guard enforces each file as soon as it is migrated and every commit stays green. The last task deletes the list.

**Tech Stack:** React 19, TypeScript (strict), Vite 8, Mapbox GL JS 3.20, @mapbox/mapbox-gl-draw 1.5.1, MUI 7 (`alpha`, `darken` from `@mui/material/styles`), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-30-ui-focused-pass-design.md` (Phase 1). Phases 2 and 3 get their own plans after this lands.

**Branch:** `ui/colour-roles` (already created from `main`; holds the `.gitignore` and spec commits).

## Global Constraints

- Strict TypeScript, **no `any`**. Type-only imports use `import type`.
- **All Mapbox mutation lives in `cityscope/src/components/MapView.tsx`.** UI components write to stores; the map reacts in `useEffect`.
- Test files are named `*.test.ts`, never `*.test.tsx` — `tsconfig.app.json` excludes only `src/**/*.test.ts` from the build.
- Commits are granular, one concern each, with **NO `Co-Authored-By` trailer** (the owner's explicit rule; it overrides any harness attribution setting).
- The three roles: `ROLE.you` = AMBER `#E3B04A` (what the user did), `ROLE.answer` = CYAN `#56C7BE` (analysis results), `ROLE.context` = `#F3EEE4` (context layers).
- Colour literals are allowed **only in `cityscope/src/theme.ts`**. Everywhere else: exactly `#fff`, `#ffffff`, `#000`, `#000000`, and `rgb()`/`rgba()` of pure white (255,255,255) or black (0,0,0) at any opacity. Hex of 3, 4, 6 or 8 digits and any `hsl()` are banned.
- Tinted colours come from `alpha(TOKEN, n)` and darker variants from `darken(TOKEN, n)`, both from `@mui/material/styles` — never a hand-written `rgba(...)` of a token.
- Live browser checks: if :5173 is free, run the frontend there (backend CORS defaults to that origin) with the backend on :3001. If the owner's server holds :5173, hand the browser checks to the owner instead of starting a server on another port, which breaks CORS.

## Baseline (measured 2026-09-30 on `ui/colour-roles`)

- Frontend: 3 test files, 36 tests.
- A prototype of the guard found **75 offending lines in 12 files**. The migration tasks below cover every one; the list in Task 2 is exactly those 12 files.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `cityscope/src/theme.ts` | Modify | Role, surface and heat-ramp tokens plus the two ramp builders |
| `cityscope/src/theme.test.ts` | Create | Tests pinning the roles and the ramp's single-hue, rising-opacity property |
| `cityscope/src/colourGuard.test.ts` | Create | Fails on colour literals outside `theme.ts` |
| `cityscope/src/constants/layerConfig.ts` | Modify | Layer dots on `ROLE.context`; drop `ISOCHRONE_COLOR`; add `DISTRICT_SELECTED_LAYER_ID` |
| `cityscope/src/lib/mapPins.ts` | Create | `createPin(kind)`: the DOM element for every map marker |
| `cityscope/src/constants/drawStyles.ts` | Create | mapbox-gl-draw's 7 default styles, recoloured to `ROLE.you` |
| `cityscope/src/components/MapView.tsx` | Modify | Basemap tint, extrusion, districts + selection outline, heatmap, isochrone, route, pins, draw styles |
| `cityscope/src/components/FeaturePanel.tsx` | Modify | Chip fallback colour |
| `cityscope/src/components/Navbar.tsx` | Modify | Old lemon gold, surface alpha, ink text |
| `cityscope/src/components/GeoSearch.tsx` | Modify | Old blue-black background |
| `cityscope/src/components/IsochroneControls.tsx` | Modify | Off-palette golds |
| `cityscope/src/components/RouteControls.tsx` | Modify | Green/orange A/B → `ROLE.you` |
| `cityscope/src/components/RouteResultsPanel.tsx` | Modify | Cyan tints via `alpha` |
| `cityscope/src/components/Sidebar.tsx` | Modify | Panel gradient, heat legend from the ramp, hover and card tints |
| `cityscope/src/components/DistrictStatsView.tsx` | Modify | Comparison colour → `ROLE.answer`; fixes an invalid-CSS bug |
| `cityscope/src/components/IsochroneResultsPanel.tsx` | Modify | Band colours from `ROLE.answer` |
| `cityscope/src/components/HeatmapSpotlightCard.tsx` | Modify | Orange accent and greys → roles and text tones |
| `CLAUDE.md`, `cityscope/CLAUDE.md` | Modify | Document the roles and the guard |

---

### Task 1: Colour role tokens

**Files:**
- Modify: `cityscope/src/theme.ts:1-18`
- Test: `cityscope/src/theme.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `cityscope/src/theme.ts`):
  - `SURFACE: { land: '#101113'; water: '#181A1F'; panelTop: '#16171A'; hover: '#1C1D22'; extrusion: '#3E424B' }` (readonly)
  - `PANEL_GRADIENT: string`
  - `ROLE: { you: string; answer: string; context: string }` (readonly; `you === AMBER`, `answer === CYAN`)
  - `HEAT_RAMP: ReadonlyArray<readonly [number, string]>`
  - `heatmapColorExpression(): ExpressionSpecification`
  - `heatRampGradientCss(): string`

- [ ] **Step 1: Write the failing test**

Create `cityscope/src/theme.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AMBER, CYAN, ROLE, HEAT_RAMP, heatmapColorExpression, heatRampGradientCss } from './theme';

const alphaOf = (colour: string): number => {
  const parts = colour.slice(colour.indexOf('(') + 1, -1).split(',').map((p) => p.trim());
  return parts.length === 4 ? Number(parts[3]) : 1;
};

describe('colour roles', () => {
  it('maps the roles onto the two theme accents', () => {
    expect(ROLE.you).toBe(AMBER);
    expect(ROLE.answer).toBe(CYAN);
  });
});

describe('HEAT_RAMP', () => {
  it('runs from density 0 to 1 in increasing order', () => {
    const densities = HEAT_RAMP.map(([d]) => d);
    expect(densities[0]).toBe(0);
    expect(densities[densities.length - 1]).toBe(1);
    densities.slice(1).forEach((d, i) => expect(d).toBeGreaterThan(densities[i]));
  });

  // The point of replacing the rainbow: more density must always look like more.
  it('never gets less opaque as density rises', () => {
    const alphas = HEAT_RAMP.map(([, c]) => alphaOf(c));
    alphas.slice(1).forEach((a, i) => expect(a).toBeGreaterThanOrEqual(alphas[i]));
  });

  it('uses a single hue', () => {
    const hues = new Set(HEAT_RAMP.map(([, c]) => c.slice(c.indexOf('(') + 1).split(',').slice(0, 3).join(',')));
    expect(hues.size).toBe(1);
  });
});

describe('ramp builders', () => {
  it('builds a Mapbox interpolate expression from the ramp stops', () => {
    expect(heatmapColorExpression()).toEqual([
      'interpolate', ['linear'], ['heatmap-density'],
      ...HEAT_RAMP.flat(),
    ]);
  });

  it('builds a CSS gradient listing every stop colour in order', () => {
    const css = heatRampGradientCss();
    expect(css.startsWith('linear-gradient(to right, ')).toBe(true);
    let from = 0;
    for (const [, colour] of HEAT_RAMP) {
      const at = css.indexOf(colour, from);
      expect(at).toBeGreaterThanOrEqual(from);
      from = at + colour.length;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd cityscope && npx vitest run src/theme.test.ts
```

Expected: FAIL. `ROLE`, `HEAT_RAMP` and the builders are not exported yet, so the assertions error on `undefined`.

- [ ] **Step 3: Add the tokens**

In `cityscope/src/theme.ts`, add a type import as the new second line, directly under `import { createTheme } from '@mui/material/styles';`:

```typescript
import type { ExpressionSpecification } from 'mapbox-gl';
```

Replace the comment block and accent lines at the top (lines 3–14) — from `/**` down to `export const INK_2 = '#1A1C20'; // higher surface / cards` — with:

```typescript
/**
 * "Cartographer's Instrument" design tokens.
 *
 * The only file allowed to contain colour literals — src/colourGuard.test.ts
 * fails the build if one appears anywhere else.
 */
export const AMBER = '#E3B04A'; // honey gold
export const CYAN = '#56C7BE'; // quiet cyan
export const INK = '#0C0D0F'; // neutral graphite base
export const INK_1 = '#141517'; // raised surface (sidebar / navbar)
export const INK_2 = '#1A1C20'; // higher surface / cards

/**
 * Colour roles. Every colour on the map and in the panels plays one of these.
 *   you     — what the user did: pins, drawn areas, the selected district, actions
 *   answer  — the result of an analysis: isochrones, routes, stats, category bars
 *   context — the backdrop an answer sits on: the heatmap, district lines
 * Only one analysis tool can be active at a time, so the map never has to tell
 * two answers apart — it only has to make answers stand out from context.
 */
export const ROLE = {
  you: AMBER,
  answer: CYAN,
  context: '#F3EEE4',
} as const;

/** Neutral surfaces outside the MUI palette. */
export const SURFACE = {
  land: '#101113', // basemap land tint
  water: '#181A1F', // basemap water tint
  panelTop: '#16171A', // top of the sidebar gradient
  hover: '#1C1D22', // hover fill on graphite
  extrusion: '#3E424B', // 3D buildings
} as const;

export const PANEL_GRADIENT = `linear-gradient(180deg, ${SURFACE.panelTop} 0%, ${SURFACE.land} 100%)`;

/**
 * Heatmap stops as [density, colour]: one hue that only gains opacity, so more
 * density always looks like more. The rainbow ramp this replaced peaked in
 * brightness at yellow, which made middling densities look like the maximum.
 */
export const HEAT_RAMP: ReadonlyArray<readonly [number, string]> = [
  [0, 'rgba(243,238,228,0)'],
  [0.2, 'rgba(243,238,228,0.12)'],
  [0.4, 'rgba(243,238,228,0.25)'],
  [0.6, 'rgba(243,238,228,0.45)'],
  [0.8, 'rgba(243,238,228,0.65)'],
  [1, 'rgba(243,238,228,0.85)'],
];

/** HEAT_RAMP as a Mapbox `heatmap-color` expression. */
export function heatmapColorExpression(): ExpressionSpecification {
  return ['interpolate', ['linear'], ['heatmap-density'], ...HEAT_RAMP.flat()];
}

/** HEAT_RAMP as a CSS gradient for the sidebar legend — the same stops as the map. */
export function heatRampGradientCss(): string {
  return `linear-gradient(to right, ${HEAT_RAMP.map(([, colour]) => colour).join(', ')})`;
}
```

Leave `MONO`, `DISPLAY`, `BODY` and the `createTheme` call below unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd cityscope && npm test
```

Expected: PASS — 4 test files, 42 tests (36 existing + 6 new).

- [ ] **Step 5: Typecheck**

```bash
cd cityscope && npx tsc -b; echo "TSC_EXIT=$?"
```

Expected: `TSC_EXIT=0`. (The spread into `ExpressionSpecification` was compile-checked during planning.)

- [ ] **Step 6: Commit**

```bash
git add cityscope/src/theme.ts cityscope/src/theme.test.ts
git commit -m "feat(web): add colour role, surface and heat-ramp tokens"
```

---

### Task 2: Colour guard test

**Files:**
- Test: `cityscope/src/colourGuard.test.ts`

**Interfaces:**
- Consumes: nothing (reads source files from disk).
- Produces: a `PENDING` set in `colourGuard.test.ts`. **Every later task removes its own files from `PENDING` as its first step.** Keys are paths relative to `cityscope/src` with forward slashes, e.g. `'components/MapView.tsx'`.

- [ ] **Step 1: Write the guard**

Create `cityscope/src/colourGuard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Colour literals belong in theme.ts only. Anything else must use a token
 * (ROLE, SURFACE, INK…) or MUI's alpha()/darken() on one. Plain white and black
 * stay allowed because they are the idiom for text and surface contrast.
 */
const SRC = fileURLToPath(new URL('.', import.meta.url));
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const COLOUR_FN = /\b(rgba?|hsla?)\(([^)]*)\)/g;
const NEUTRAL_HEX = new Set(['#fff', '#ffffff', '#000', '#000000']);

/**
 * Files not yet migrated to tokens. Each Phase 1 task deletes its files from
 * this set as its first step; the final task deletes the set itself.
 */
const PENDING = new Set<string>([
  'components/DistrictStatsView.tsx',
  'components/FeaturePanel.tsx',
  'components/GeoSearch.tsx',
  'components/HeatmapSpotlightCard.tsx',
  'components/IsochroneControls.tsx',
  'components/IsochroneResultsPanel.tsx',
  'components/MapView.tsx',
  'components/Navbar.tsx',
  'components/RouteControls.tsx',
  'components/RouteResultsPanel.tsx',
  'components/Sidebar.tsx',
  'constants/layerConfig.ts',
]);

function isNeutralRgb(args: string): boolean {
  const [r, g, b] = args.split(',').map((part) => part.trim());
  return (r === '255' && g === '255' && b === '255') || (r === '0' && g === '0' && b === '0');
}

/** Every colour literal on a line that isn't plain white or black. */
function colourLiterals(line: string): string[] {
  const found: string[] = [];
  for (const m of line.matchAll(HEX)) {
    if (!NEUTRAL_HEX.has(m[0].toLowerCase())) found.push(m[0]);
  }
  for (const m of line.matchAll(COLOUR_FN)) {
    if (m[1].startsWith('hsl') || !isNeutralRgb(m[2])) found.push(m[0]);
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    const isSource = /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts');
    return isSource && entry.name !== 'theme.ts' ? [path] : [];
  });
}

function offendersIn(file: string): string[] {
  const rel = relative(SRC, file).split(sep).join('/');
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .flatMap((line, i) => colourLiterals(line).map((c) => `${rel}:${i + 1}  ${c}`));
}

const relPath = (file: string) => relative(SRC, file).split(sep).join('/');

describe('colourLiterals', () => {
  it('flags hex colours of every length', () => {
    expect(colourLiterals("color: '#FF7043'")).toEqual(['#FF7043']);
    expect(colourLiterals("color: '#999'")).toEqual(['#999']);
    expect(colourLiterals("c: '#56C7BE55', d: '#abcd'")).toEqual(['#56C7BE55', '#abcd']);
  });

  it('flags coloured rgb/rgba and any hsl', () => {
    expect(colourLiterals("bg: 'rgba(20,21,23,0.92)'")).toEqual(['rgba(20,21,23,0.92)']);
    expect(colourLiterals("c: 'rgb(255,0,0)'")).toEqual(['rgb(255,0,0)']);
    expect(colourLiterals("c: 'hsl(0, 0%, 100%)'")).toEqual(['hsl(0, 0%, 100%)']);
  });

  it('allows plain white and black', () => {
    expect(colourLiterals("a: '#fff', b: '#FFFFFF', c: '#000'")).toEqual([]);
    expect(colourLiterals("a: 'rgba(255,255,255,0.5)', b: 'rgba(0, 0, 0, 0.4)'")).toEqual([]);
  });

  it('ignores hashes that are not colours', () => {
    expect(colourLiterals("if (hash.startsWith('#s=')) return;")).toEqual([]);
    expect(colourLiterals("document.querySelector('#root')")).toEqual([]);
  });
});

describe('colour guard', () => {
  it('finds no colour literals outside theme.ts', () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => !PENDING.has(relPath(f)))
      .flatMap(offendersIn);
    expect(offenders).toEqual([]);
  });

  // Keeps PENDING honest: a migrated file must leave the list.
  it('lists only files that still contain colour literals', () => {
    const clean = sourceFiles(SRC)
      .filter((f) => PENDING.has(relPath(f)))
      .filter((f) => offendersIn(f).length === 0)
      .map(relPath);
    expect(clean).toEqual([]);
  });
});
```

- [ ] **Step 2: Prove the guard catches today's code**

Temporarily empty the list: change `new Set<string>([` … `])` to `new Set<string>([])` (keep the file otherwise identical), then run:

```bash
cd cityscope && npx vitest run src/colourGuard.test.ts
```

Expected: FAIL on "finds no colour literals outside theme.ts", listing **75** offenders across the 12 files, e.g. `components/MapView.tsx:153  #CE93D8`, `components/Navbar.tsx:47  rgba(241,196,83,0.55)`, `components/FeaturePanel.tsx:109  #999`.

Then restore the 12-entry list exactly as written in Step 1.

- [ ] **Step 3: Run the guard with the list restored**

```bash
cd cityscope && npm test
```

Expected: PASS — 5 test files, 48 tests (42 + 6 new).

- [ ] **Step 4: Commit**

```bash
git add cityscope/src/colourGuard.test.ts
git commit -m "test(web): fail the build on colour literals outside theme.ts"
```

---

### Task 3: Layer config on roles, and drop `ISOCHRONE_COLOR`

**Files:**
- Modify: `cityscope/src/constants/layerConfig.ts:1-14,36`
- Modify: `cityscope/src/components/FeaturePanel.tsx:109-110`
- Modify: `cityscope/src/components/MapView.tsx` (import block ending line 39; lines 588 and 610)
- Modify: `cityscope/src/components/IsochroneResultsPanel.tsx:21-22,77,102,106`
- Modify: `cityscope/src/colourGuard.test.ts` (`PENDING`)

**Interfaces:**
- Consumes: `ROLE` from Task 1.
- Produces: `ISOCHRONE_COLOR` **no longer exists**; later tasks use `ROLE.answer`. `LAYER_CONFIGS[*].color === ROLE.context`.

- [ ] **Step 1: Make the guard enforce these files**

In `cityscope/src/colourGuard.test.ts`, delete these two lines from `PENDING`:

```typescript
  'components/FeaturePanel.tsx',
  'constants/layerConfig.ts',
```

- [ ] **Step 2: Run the guard to verify it fails**

```bash
cd cityscope && npx vitest run src/colourGuard.test.ts
```

Expected: FAIL, listing `components/FeaturePanel.tsx:109  #999`, `components/FeaturePanel.tsx:110  #999`, and `constants/layerConfig.ts` lines 10–13 and 36.

- [ ] **Step 3: Move `layerConfig.ts` onto roles**

At the top of `cityscope/src/constants/layerConfig.ts`, add as the first line:

```typescript
import { ROLE } from '../theme';
```

Replace the `LAYER_CONFIGS` array with:

```typescript
export const LAYER_CONFIGS: LayerConfig[] = [
  // All four are context: the backdrop an analysis result sits on.
  { id: 'roads', label: 'Roads', color: ROLE.context },
  { id: 'buildings', label: 'Buildings', color: ROLE.context },
  { id: 'districts', label: 'Districts', color: ROLE.context },
  { id: 'heatmap', label: 'POI Heatmap', color: ROLE.context },
];
```

Delete the line:

```typescript
export const ISOCHRONE_COLOR = '#00BCD4';
```

- [ ] **Step 4: Fix the FeaturePanel fallback**

In `cityscope/src/components/FeaturePanel.tsx`, replace:

```typescript
                border: `1px solid ${config?.color ?? '#999'}`,
                color: config?.color ?? '#999',
```

with:

```typescript
                border: `1px solid ${config?.color ?? 'rgba(255,255,255,0.6)'}`,
                color: config?.color ?? 'rgba(255,255,255,0.6)',
```

- [ ] **Step 5: Replace `ISOCHRONE_COLOR` in MapView**

In `cityscope/src/components/MapView.tsx`, delete the line `  ISOCHRONE_COLOR,` from the `import { … } from '../constants/layerConfig';` block. Directly below `import type { LayerId } from '../constants/layerConfig';`, add:

```typescript
import { ROLE } from '../theme';
```

Replace `'line-color': ISOCHRONE_COLOR,` with `'line-color': ROLE.answer,`, and replace `new mapboxgl.Marker({ color: ISOCHRONE_COLOR })` with `new mapboxgl.Marker({ color: ROLE.answer })`. (Task 5 swaps this marker for a pin.)

- [ ] **Step 6: Replace `ISOCHRONE_COLOR` in IsochroneResultsPanel**

In `cityscope/src/components/IsochroneResultsPanel.tsx`, replace:

```typescript
import { ISOCHRONE_COLOR } from '../constants/layerConfig';
import { MONO } from '../theme';
```

with:

```typescript
import { MONO, ROLE } from '../theme';
```

Then replace all three remaining occurrences of `ISOCHRONE_COLOR` in that file with `ROLE.answer`.

- [ ] **Step 7: Verify**

```bash
cd cityscope && grep -rn "ISOCHRONE_COLOR" src; echo "(no output above = constant fully removed)"; npx tsc -b; echo "TSC_EXIT=$?"; npm test 2>&1 | grep -E "Tests |Test Files"
```

Expected: no `ISOCHRONE_COLOR` matches, `TSC_EXIT=0`, 5 files / 48 tests passing.

- [ ] **Step 8: Commit**

```bash
git add cityscope/src/constants/layerConfig.ts cityscope/src/components/FeaturePanel.tsx cityscope/src/components/MapView.tsx cityscope/src/components/IsochroneResultsPanel.tsx cityscope/src/colourGuard.test.ts
git commit -m "refactor(web): layer colours on roles; drop ISOCHRONE_COLOR"
```

---

### Task 4: Map layers on roles, plus the selected-district outline

**Files:**
- Modify: `cityscope/src/constants/layerConfig.ts` (district ids)
- Modify: `cityscope/src/components/MapView.tsx` (basemap tint ~line 48, extrusion ~124, `addDistrictLayers` ~144–175, `applyLayerVisibility` ~94, hooks ~204, heatmap ~495, isochrone ~566, route ~646)

**Interfaces:**
- Consumes: `ROLE`, `SURFACE`, `INK`, `heatmapColorExpression` from Task 1.
- Produces: `DISTRICT_SELECTED_LAYER_ID = 'city-districts-selected'` exported from `layerConfig.ts`.

MapView stays in `PENDING` until Task 5, because its marker colours are fixed there.

- [ ] **Step 1: Add the selected-district layer id**

In `cityscope/src/constants/layerConfig.ts`, directly below `export const DISTRICT_LINE_LAYER_ID = 'city-districts-line';`, add:

```typescript
export const DISTRICT_SELECTED_LAYER_ID = 'city-districts-selected';
```

- [ ] **Step 2: Update MapView's imports**

In `cityscope/src/components/MapView.tsx`, add `  DISTRICT_SELECTED_LAYER_ID,` to the layerConfig import block directly after `  DISTRICT_LINE_LAYER_ID,`. Replace `import { ROLE } from '../theme';` (added in Task 3) with:

```typescript
import { INK, ROLE, SURFACE, heatmapColorExpression } from '../theme';
```

- [ ] **Step 3: Basemap tint and extrusion**

Replace:

```typescript
const BASEMAP_TINT = {
  background: '#0C0D0F', // matches theme INK
  land: '#101113',
  water: '#181A1F',
};
```

with:

```typescript
const BASEMAP_TINT = {
  background: INK,
  land: SURFACE.land,
  water: SURFACE.water,
};
```

Replace `'fill-extrusion-color': '#3E424B',` with `'fill-extrusion-color': SURFACE.extrusion,`.

- [ ] **Step 4: District layers**

Replace the whole body of `addDistrictLayers` after `map.addSource(DISTRICT_SOURCE_ID, { type: 'geojson', data });` — the two `map.addLayer({...})` calls — with:

```typescript
  map.addLayer({
    id: DISTRICT_FILL_LAYER_ID,
    type: 'fill',
    source: DISTRICT_SOURCE_ID,
    paint: {
      // Invisible but required: this is the layer queryRenderedFeatures hits
      // to make districts clickable. Removing it would silently break selection.
      'fill-color': ROLE.context,
      'fill-opacity': 0,
    },
    layout: {
      visibility: 'none',
    },
  });

  map.addLayer({
    id: DISTRICT_LINE_LAYER_ID,
    type: 'line',
    source: DISTRICT_SOURCE_ID,
    paint: {
      'line-color': ROLE.context,
      'line-width': 1,
      'line-opacity': 0.3,
      'line-dasharray': [2, 2],
    },
    layout: {
      visibility: 'none',
    },
  });

  // The district the user clicked, outlined in the "you" colour. Starts
  // matching nothing; the selection effect updates the filter.
  map.addLayer({
    id: DISTRICT_SELECTED_LAYER_ID,
    type: 'line',
    source: DISTRICT_SOURCE_ID,
    filter: ['==', ['id'], -1],
    paint: {
      'line-color': ROLE.you,
      'line-width': 2.5,
    },
    layout: {
      visibility: 'none',
    },
  });
```

- [ ] **Step 5: Show and hide the outline with the districts layer**

In `applyLayerVisibility`, replace:

```typescript
    [DISTRICT_FILL_LAYER_ID, DISTRICT_LINE_LAYER_ID],
```

with:

```typescript
    [DISTRICT_FILL_LAYER_ID, DISTRICT_LINE_LAYER_ID, DISTRICT_SELECTED_LAYER_ID],
```

- [ ] **Step 6: Follow the selection**

Directly below `const geoSearchResult = useGeoSearchStore((s) => s.result);`, add:

```typescript
  const selectedFeature = useFeatureStore((s) => s.selectedFeature);
```

Directly after the effect commented `// Add district layers when both map and data are ready` (the one ending `}, [districtsData, mapReady]);`), add:

```typescript
  // Outline the selected district. Depends on districtsData so it re-runs once
  // the layer exists; any non-district selection resets the filter to nothing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(DISTRICT_SELECTED_LAYER_ID)) return;
    const id =
      selectedFeature?.type === 'districts' && selectedFeature.featureId != null
        ? selectedFeature.featureId
        : -1;
    map.setFilter(DISTRICT_SELECTED_LAYER_ID, ['==', ['id'], id]);
  }, [selectedFeature, mapReady, districtsData]);
```

- [ ] **Step 7: Heatmap**

Replace the whole `'heatmap-color': [ … ],` array (from `'heatmap-color': [` through the `],` after `1, 'rgb(255,0,0)',`) with:

```typescript
          'heatmap-color': heatmapColorExpression(),
```

and replace `'heatmap-opacity': 0.7,` with `'heatmap-opacity': 1,`. The ramp now carries its own opacity; multiplying by 0.7 would dim the densest areas to ~0.6.

- [ ] **Step 8: Isochrone**

Replace the isochrone fill `paint` block:

```typescript
          paint: {
            'fill-color': [
              'step', ['get', 'contour'],
              '#00E5FF',      // ≤ 10 min: brightest cyan (innermost)
              11, '#00BCD4',  // 11–20 min: standard cyan
              21, '#0097A7',  // 21+ min: dark teal (outermost)
            ],
            'fill-opacity': [
              'interpolate',
              ['linear'],
              ['get', 'contour'],
              5, 0.45,
              30, 0.08,
            ],
          },
```

with:

```typescript
          paint: {
            // One hue; bands differ only by opacity, fading outward.
            'fill-color': ROLE.answer,
            'fill-opacity': ['interpolate', ['linear'], ['get', 'contour'], 5, 0.3, 30, 0.08],
          },
```

and in the isochrone line layer replace:

```typescript
            'line-color': ROLE.answer,
            'line-width': 2,
            'line-opacity': 0.6,
```

with:

```typescript
            'line-color': ROLE.answer,
            'line-width': 1.5,
            'line-opacity': 0.55,
```

- [ ] **Step 9: Route**

Replace `'line-color': '#4FC3F7',` with `'line-color': ROLE.answer,`.

- [ ] **Step 10: Typecheck, lint, test**

```bash
cd cityscope && npx tsc -b; echo "TSC_EXIT=$?"; npm run lint; echo "LINT_EXIT=$?"; npm test 2>&1 | grep -E "Tests |Test Files"
```

Expected: both exits `0`; 5 files / 48 tests passing.

- [ ] **Step 11: Live check — the risky one**

Start the backend (`cd cityscope-backend && npm run dev`) and frontend (:5173 per Global Constraints). Then:

1. Turn on **Districts**. The boundaries show as thin dashed warm-white lines, with no fill.
2. **Click inside a district.** The feature panel opens with district stats, **and** the district gains a gold outline. Click a different district: the outline moves. Click empty map: the outline disappears.
3. Turn on **POI Heatmap**. Dense areas glow warm white; there's no rainbow.
4. Run an **isochrone**: single-cyan bands, fading outward. Run a **route**: cyan line.

**If step 2's click does not register**, the zero-opacity fill isn't being hit by `queryRenderedFeatures`. Change `'fill-opacity': 0` to `'fill-opacity': 0.001`, reload, repeat step 2, and note in the commit message that 0 was not queryable.

- [ ] **Step 12: Commit**

```bash
git add cityscope/src/constants/layerConfig.ts cityscope/src/components/MapView.tsx
git commit -m "feat(web): map layers on colour roles; outline the selected district"
```

---

### Task 5: Map pins

**Files:**
- Create: `cityscope/src/lib/mapPins.ts`
- Modify: `cityscope/src/components/MapView.tsx` (markers ~lines 600–700)
- Modify: `cityscope/src/colourGuard.test.ts` (`PENDING`)

**Interfaces:**
- Consumes: `INK`, `ROLE` from Task 1.
- Produces: `type PinKind = 'origin' | 'a' | 'b' | 'search'`; `createPin(kind: PinKind): HTMLDivElement`.

- [ ] **Step 1: Make the guard enforce MapView**

Delete `  'components/MapView.tsx',` from `PENDING` in `cityscope/src/colourGuard.test.ts`.

- [ ] **Step 2: Run the guard to verify it fails**

```bash
cd cityscope && npx vitest run src/colourGuard.test.ts
```

Expected: FAIL, listing exactly `components/MapView.tsx` `#4CAF50` and `#FF7043` (the route A/B markers). Every other MapView colour was fixed in Task 4.

- [ ] **Step 3: Create the pin factory**

Create `cityscope/src/lib/mapPins.ts`:

```typescript
import { INK, ROLE } from '../theme';

export type PinKind = 'origin' | 'a' | 'b' | 'search';

const SHADOW = '0 2px 6px rgba(0,0,0,0.5)';

/**
 * DOM elements for map markers. Every pin marks something the user placed, so
 * every pin uses the "you" colour and shape tells them apart:
 *   origin — solid dot (isochrone start)
 *   a / b  — lettered disc (route endpoints)
 *   search — ring with a centre dot (geocoded address)
 */
export function createPin(kind: PinKind): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');

  if (kind === 'origin') {
    el.style.cssText =
      `width:14px;height:14px;border-radius:50%;background:${ROLE.you};` +
      `border:3px solid ${INK};box-shadow:0 0 0 1px ${ROLE.you},${SHADOW};`;
  } else if (kind === 'search') {
    el.style.cssText =
      `width:16px;height:16px;border-radius:50%;box-sizing:border-box;` +
      `border:3px solid ${ROLE.you};` +
      `background:radial-gradient(circle, ${ROLE.you} 0 2px, ${INK} 2.5px);` +
      `box-shadow:${SHADOW};`;
  } else {
    el.style.cssText =
      `width:20px;height:20px;border-radius:50%;background:${ROLE.you};` +
      `border:2px solid ${INK};display:flex;align-items:center;justify-content:center;` +
      `font:700 10px/1 system-ui,sans-serif;color:${INK};` +
      `box-shadow:0 0 0 1px ${ROLE.you},${SHADOW};cursor:pointer;`;
    el.textContent = kind === 'a' ? 'A' : 'B';
  }

  return el;
}
```

- [ ] **Step 4: Use it in MapView**

In `cityscope/src/components/MapView.tsx`, add below the `import { hasCompletePolygon } from '../lib/drawFeatures';` line:

```typescript
import { createPin } from '../lib/mapPins';
```

Replace `new mapboxgl.Marker({ color: ROLE.answer })` (isochrone origin) with `new mapboxgl.Marker({ element: createPin('origin') })`.

Replace the origin marker block:

```typescript
    // Origin marker (A — green)
    routeOriginMarkerRef.current?.remove();
    routeOriginMarkerRef.current = null;
    if (routeOrigin && routeEnabled) {
      const elA = document.createElement('div');
      elA.style.cssText =
        'width:20px;height:20px;background:#4CAF50;border:2px solid white;' +
        'border-radius:50%;display:flex;align-items:center;justify-content:center;' +
        'font-size:10px;font-weight:bold;color:white;box-shadow:0 2px 6px rgba(0,0,0,0.5);' +
        'cursor:pointer;';
      elA.textContent = 'A';
      routeOriginMarkerRef.current = new mapboxgl.Marker({ element: elA })
```

with:

```typescript
    // Origin marker (A)
    routeOriginMarkerRef.current?.remove();
    routeOriginMarkerRef.current = null;
    if (routeOrigin && routeEnabled) {
      routeOriginMarkerRef.current = new mapboxgl.Marker({ element: createPin('a') })
```

Replace the destination marker block:

```typescript
    // Destination marker (B — orange)
    routeDestinationMarkerRef.current?.remove();
    routeDestinationMarkerRef.current = null;
    if (routeDestination && routeEnabled) {
      const elB = document.createElement('div');
      elB.style.cssText =
        'width:20px;height:20px;background:#FF7043;border:2px solid white;' +
        'border-radius:50%;display:flex;align-items:center;justify-content:center;' +
        'font-size:10px;font-weight:bold;color:white;box-shadow:0 2px 6px rgba(0,0,0,0.5);' +
        'cursor:pointer;';
      elB.textContent = 'B';
      routeDestinationMarkerRef.current = new mapboxgl.Marker({ element: elB })
```

with:

```typescript
    // Destination marker (B)
    routeDestinationMarkerRef.current?.remove();
    routeDestinationMarkerRef.current = null;
    if (routeDestination && routeEnabled) {
      routeDestinationMarkerRef.current = new mapboxgl.Marker({ element: createPin('b') })
```

Replace `geoSearchMarkerRef.current = new mapboxgl.Marker()` with `geoSearchMarkerRef.current = new mapboxgl.Marker({ element: createPin('search') })`.

- [ ] **Step 5: Verify**

```bash
cd cityscope && npx tsc -b; echo "TSC_EXIT=$?"; npm run lint; echo "LINT_EXIT=$?"; npm test 2>&1 | grep -E "Tests |Test Files"
```

Expected: both exits `0`; 5 files / 48 tests passing. The guard now enforces `MapView.tsx`.

- [ ] **Step 6: Live check**

Place an isochrone origin (gold dot), route A and B (gold lettered discs), and search an address (gold ring). All sit centred on the clicked point — custom-element markers anchor at their centre, unlike the default teardrop, which anchors at its tip.

- [ ] **Step 7: Commit**

```bash
git add cityscope/src/lib/mapPins.ts cityscope/src/components/MapView.tsx cityscope/src/colourGuard.test.ts
git commit -m "feat(web): gold map pins for everything the user places"
```

---

### Task 6: Gold drawn polygon

**Files:**
- Create: `cityscope/src/constants/drawStyles.ts`
- Modify: `cityscope/src/components/MapView.tsx` (`new MapboxDraw({...})`)

**Interfaces:**
- Consumes: `ROLE` from Task 1.
- Produces: `DRAW_STYLES: object[]` (the type `@types/mapbox__mapbox-gl-draw` declares for `styles`).

The guard scans this new file automatically; it contains only `ROLE.you` and `#fff`, which is allowed.

- [ ] **Step 1: Create the styles**

Create `cityscope/src/constants/drawStyles.ts`:

```typescript
import { ROLE } from '../theme';

/**
 * mapbox-gl-draw's default styles (v1.5.1, src/lib/theme.js), recoloured.
 * The defaults use blue for inactive and orange for active shapes; both become
 * the "you" colour, because a drawn area is always something the user made.
 * Active and inactive shapes stay distinguishable by the dashed outline and the
 * larger vertices, which are unchanged.
 */
const you = ROLE.you;
const white = '#fff';

export const DRAW_STYLES: object[] = [
  {
    id: 'gl-draw-polygon-fill',
    type: 'fill',
    filter: ['all', ['==', '$type', 'Polygon']],
    paint: {
      'fill-color': you,
      'fill-opacity': 0.1,
    },
  },
  {
    id: 'gl-draw-lines',
    type: 'line',
    filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': you,
      'line-dasharray': ['case', ['==', ['get', 'active'], 'true'], [0.2, 2], [2, 0]],
      'line-width': 2,
    },
  },
  {
    id: 'gl-draw-point-outer',
    type: 'circle',
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'feature']],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'active'], 'true'], 7, 5],
      'circle-color': white,
    },
  },
  {
    id: 'gl-draw-point-inner',
    type: 'circle',
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'feature']],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'active'], 'true'], 5, 3],
      'circle-color': you,
    },
  },
  {
    id: 'gl-draw-vertex-outer',
    type: 'circle',
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex'], ['!=', 'mode', 'simple_select']],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'active'], 'true'], 7, 5],
      'circle-color': white,
    },
  },
  {
    id: 'gl-draw-vertex-inner',
    type: 'circle',
    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex'], ['!=', 'mode', 'simple_select']],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'active'], 'true'], 5, 3],
      'circle-color': you,
    },
  },
  {
    id: 'gl-draw-midpoint',
    type: 'circle',
    filter: ['all', ['==', 'meta', 'midpoint']],
    paint: {
      'circle-radius': 3,
      'circle-color': you,
    },
  },
];
```

- [ ] **Step 2: Pass them to MapboxDraw**

In `cityscope/src/components/MapView.tsx`, add below `import { createPin } from '../lib/mapPins';`:

```typescript
import { DRAW_STYLES } from '../constants/drawStyles';
```

Replace:

```typescript
        drawRef.current = new MapboxDraw({
          displayControlsDefault: false,
          controls: { polygon: true, trash: false },
        });
```

with:

```typescript
        drawRef.current = new MapboxDraw({
          displayControlsDefault: false,
          controls: { polygon: true, trash: false },
          styles: DRAW_STYLES,
        });
```

- [ ] **Step 3: Verify**

```bash
cd cityscope && npx tsc -b; echo "TSC_EXIT=$?"; npm run lint; echo "LINT_EXIT=$?"; npm test 2>&1 | grep -E "Tests |Test Files"
```

Expected: both exits `0`; 5 files / 48 tests passing.

- [ ] **Step 4: Live check — the draw tool must still work end to end**

Custom styles replace the defaults entirely, so a missing or malformed layer shows up only at runtime. Check every interaction:

1. Turn on **Draw Area**. While drawing, the outline is gold and dashed, with gold vertices.
2. Double-click to finish. The polygon has a faint gold fill and a solid gold outline, and the sidebar shows area results.
3. Click the polygon, then drag a vertex. The vertex has a white ring and gold centre; midpoints are small gold dots; the results update.
4. **Clear area** removes the shape, and the tool re-arms for a new one.
5. Copy the share link, open it in a fresh tab, and confirm the restored polygon draws gold.
6. Check the browser console: no `gl-draw` layer or style errors.

- [ ] **Step 5: Commit**

```bash
git add cityscope/src/constants/drawStyles.ts cityscope/src/components/MapView.tsx
git commit -m "feat(web): draw polygons in the 'you' colour"
```

---

### Task 7: Chrome onto tokens

**Files:**
- Modify: `cityscope/src/components/Navbar.tsx:15,47,139,259,264`
- Modify: `cityscope/src/components/GeoSearch.tsx:12,110`
- Modify: `cityscope/src/components/IsochroneControls.tsx:16,144,147`
- Modify: `cityscope/src/components/RouteControls.tsx:15,76-112,157,166`
- Modify: `cityscope/src/components/RouteResultsPanel.tsx:8,45,47`
- Modify: `cityscope/src/components/Sidebar.tsx:15,26,125,220,357,365,386-387`
- Modify: `cityscope/src/colourGuard.test.ts` (`PENDING`)

**Interfaces:**
- Consumes: `AMBER`, `INK`, `INK_1`, `ROLE`, `SURFACE`, `PANEL_GRADIENT`, `heatRampGradientCss` from Task 1; `alpha`, `darken` from `@mui/material/styles`.
- Produces: nothing new.

- [ ] **Step 1: Make the guard enforce these six files**

Delete from `PENDING`:

```typescript
  'components/GeoSearch.tsx',
  'components/IsochroneControls.tsx',
  'components/Navbar.tsx',
  'components/RouteControls.tsx',
  'components/RouteResultsPanel.tsx',
  'components/Sidebar.tsx',
```

- [ ] **Step 2: Run the guard to verify it fails**

```bash
cd cityscope && npx vitest run src/colourGuard.test.ts
```

Expected: FAIL, listing the offenders in those six files, including `Navbar.tsx:47  rgba(241,196,83,0.55)` (the pre-redesign lemon gold) and `GeoSearch.tsx:110  rgba(10,19,29,0.92)` (the pre-graphite blue-black).

- [ ] **Step 3: Navbar**

Replace `import { AMBER, CYAN, MONO, DISPLAY } from '../theme';` with:

```typescript
import { alpha } from '@mui/material/styles';
import { AMBER, CYAN, INK, INK_1, MONO, DISPLAY } from '../theme';
```

Replace `border: '1px solid rgba(241,196,83,0.55)',` with `` border: `1px solid ${alpha(AMBER, 0.55)}`, ``.
Replace `background: 'rgba(20,21,23,0.82)',` with `background: alpha(INK_1, 0.82),`.
Replace both `color: active ? '#04090F' : 'rgba(255,255,255,0.55)',` and `color: active ? '#04090F' : 'rgba(255,255,255,0.85)',` so that `'#04090F'` becomes `INK` in each.

- [ ] **Step 4: GeoSearch**

Replace `import { AMBER } from '../theme';` with:

```typescript
import { alpha } from '@mui/material/styles';
import { AMBER, INK_1 } from '../theme';
```

Replace `background: 'rgba(10,19,29,0.92)',` with `background: alpha(INK_1, 0.92),`.

- [ ] **Step 5: IsochroneControls**

Replace `import { AMBER, CYAN, MONO } from '../theme';` with:

```typescript
import { alpha, darken } from '@mui/material/styles';
import { AMBER, CYAN, INK, MONO } from '../theme';
```

Replace `color: maxMinutes === preset ? '#040C14' : AMBER,` with `color: maxMinutes === preset ? INK : AMBER,`.
Replace `bgcolor: maxMinutes === preset ? '#C09A28' : 'rgba(232,185,58,0.08)',` with `bgcolor: maxMinutes === preset ? darken(AMBER, 0.15) : alpha(AMBER, 0.08),`.

- [ ] **Step 6: RouteControls — both endpoints are "you"**

Replace `import { MONO } from '../theme';` with:

```typescript
import { alpha, darken } from '@mui/material/styles';
import { INK, MONO, ROLE } from '../theme';
```

Replace the **Set A** button's `sx` block:

```typescript
              sx={{
                flex: 1,
                borderColor: '#4CAF50',
                color: setMode === 'origin' ? '#000' : '#4CAF50',
                bgcolor: setMode === 'origin' ? '#4CAF50' : 'transparent',
                '&:hover': {
                  bgcolor:
                    setMode === 'origin' ? '#43A047' : 'rgba(76,175,80,0.1)',
                  borderColor: '#4CAF50',
                },
              }}
```

with:

```typescript
              sx={{
                flex: 1,
                borderColor: ROLE.you,
                color: setMode === 'origin' ? INK : ROLE.you,
                bgcolor: setMode === 'origin' ? ROLE.you : 'transparent',
                '&:hover': {
                  bgcolor: setMode === 'origin' ? darken(ROLE.you, 0.15) : alpha(ROLE.you, 0.1),
                  borderColor: ROLE.you,
                },
              }}
```

Replace the **Set B** button's `sx` block:

```typescript
              sx={{
                flex: 1,
                borderColor: '#FF7043',
                color: setMode === 'destination' ? '#000' : '#FF7043',
                bgcolor: setMode === 'destination' ? '#FF7043' : 'transparent',
                '&:hover': {
                  bgcolor:
                    setMode === 'destination'
                      ? '#F4511E'
                      : 'rgba(255,112,67,0.1)',
                  borderColor: '#FF7043',
                },
              }}
```

with:

```typescript
              sx={{
                flex: 1,
                borderColor: ROLE.you,
                color: setMode === 'destination' ? INK : ROLE.you,
                bgcolor: setMode === 'destination' ? ROLE.you : 'transparent',
                '&:hover': {
                  bgcolor: setMode === 'destination' ? darken(ROLE.you, 0.15) : alpha(ROLE.you, 0.1),
                  borderColor: ROLE.you,
                },
              }}
```

Replace `color: origin ? '#4CAF50' : '#555',` with `color: origin ? ROLE.you : 'text.disabled',` and `color: destination ? '#FF7043' : '#555',` with `color: destination ? ROLE.you : 'text.disabled',`.

- [ ] **Step 7: RouteResultsPanel**

Replace `import { CYAN, MONO } from '../theme';` with:

```typescript
import { alpha } from '@mui/material/styles';
import { CYAN, MONO, ROLE } from '../theme';
```

Replace `background: 'rgba(86,199,190,0.05)',` with `background: alpha(ROLE.answer, 0.05),` and `border: '1px solid rgba(86,199,190,0.18)',` with `` border: `1px solid ${alpha(ROLE.answer, 0.18)}`, ``.

- [ ] **Step 8: Sidebar**

Replace `import { useTheme } from '@mui/material/styles';` with `import { alpha, useTheme } from '@mui/material/styles';`, and replace `import { AMBER, CYAN, MONO, DISPLAY } from '../theme';` with:

```typescript
import { AMBER, CYAN, MONO, DISPLAY, PANEL_GRADIENT, SURFACE, heatRampGradientCss } from '../theme';
```

Replace **both** occurrences of `background: 'linear-gradient(180deg, #16171A 0%, #101113 100%)',` with `background: PANEL_GRADIENT,`.

Replace the heat legend's background:

```typescript
                            background:
                              'linear-gradient(to right, rgb(65,105,225), rgb(0,180,120), rgb(255,255,0), rgb(255,165,0), rgb(255,0,0))',
```

with:

```typescript
                            // Built from the same stops the map uses, so they can't drift apart.
                            background: heatRampGradientCss(),
```

Replace `'&:hover': { color: AMBER, background: '#1C1D22' },` with `'&:hover': { color: AMBER, background: SURFACE.hover },`.

In `ModuleCard`, replace:

```typescript
        border: `1px solid ${active ? 'rgba(227,176,74,0.32)' : 'rgba(255,255,255,0.06)'}`,
        background: active ? 'rgba(227,176,74,0.04)' : 'rgba(255,255,255,0.015)',
```

with:

```typescript
        border: `1px solid ${active ? alpha(AMBER, 0.32) : 'rgba(255,255,255,0.06)'}`,
        background: active ? alpha(AMBER, 0.04) : 'rgba(255,255,255,0.015)',
```

- [ ] **Step 9: Verify**

```bash
cd cityscope && npx tsc -b; echo "TSC_EXIT=$?"; npm run lint; echo "LINT_EXIT=$?"; npm test 2>&1 | grep -E "Tests |Test Files"
```

Expected: both exits `0`; 5 files / 48 tests passing. If `CYAN` becomes unused in `RouteResultsPanel.tsx` or `IsochroneControls.tsx`, `tsc` reports it under `noUnusedLocals` — remove it from that file's import and re-run.

- [ ] **Step 10: Commit**

```bash
git add cityscope/src/components/Navbar.tsx cityscope/src/components/GeoSearch.tsx cityscope/src/components/IsochroneControls.tsx cityscope/src/components/RouteControls.tsx cityscope/src/components/RouteResultsPanel.tsx cityscope/src/components/Sidebar.tsx cityscope/src/colourGuard.test.ts
git commit -m "refactor(web): chrome colours onto theme tokens"
```

---

### Task 8: Result cards onto roles

**Files:**
- Modify: `cityscope/src/components/DistrictStatsView.tsx:6,8,53,74-75`
- Modify: `cityscope/src/components/IsochroneResultsPanel.tsx:22,31-34`
- Modify: `cityscope/src/components/HeatmapSpotlightCard.tsx:13,37,66,86,93,146,149,165,168,192,195`
- Modify: `cityscope/src/colourGuard.test.ts` (`PENDING`)

**Interfaces:**
- Consumes: `ROLE`, `INK_1` from Task 1; `alpha` from `@mui/material/styles`.
- Produces: nothing new. (Phase 2 rebuilds these three panels on shared components; this task only makes their colours role-correct.)

- [ ] **Step 1: Make the guard enforce the last three files**

Delete the remaining three entries from `PENDING`, leaving it empty:

```typescript
const PENDING = new Set<string>([]);
```

- [ ] **Step 2: Run the guard to verify it fails**

```bash
cd cityscope && npx vitest run src/colourGuard.test.ts
```

Expected: FAIL, listing `DistrictStatsView.tsx:8  #E08A6B`, `IsochroneResultsPanel.tsx:31` (three cyans), and the `HeatmapSpotlightCard.tsx` offenders (`#FF7043`, `rgba(20,21,23,0.92)`, `#555`, `#ddd`, `rgba(255,112,67,0.06)`).

- [ ] **Step 3: DistrictStatsView — and fix an invalid-CSS bug**

The badge builds its border as `` `${pctColor}55` ``. When the comparison is unavailable, `pctColor` is `'rgba(255,255,255,0.5)'`, producing the invalid `rgba(255,255,255,0.5)55`, so the browser silently drops the border. `alpha()` works for both hex and `rgba()`.

Replace `import { AMBER, MONO } from '../theme';` with:

```typescript
import { alpha } from '@mui/material/styles';
import { AMBER, MONO, ROLE } from '../theme';
```

Delete the line `const DOWN = '#E08A6B';`.

Replace `const pctColor = pct === null ? 'rgba(255,255,255,0.5)' : pct >= 0 ? AMBER : DOWN;` with:

```typescript
  // Density above or below average is neither good nor bad, so both directions
  // use the answer colour; the sign carries the direction.
  const pctColor = pct === null ? 'rgba(255,255,255,0.5)' : ROLE.answer;
```

Replace:

```typescript
              border: `1px solid ${pctColor}55`,
              background: `${pctColor}14`,
```

with:

```typescript
              border: `1px solid ${alpha(pctColor, 0.33)}`,
              background: alpha(pctColor, 0.08),
```

`AMBER` stays imported: the loading spinner still uses it.

- [ ] **Step 4: IsochroneResultsPanel bands**

Replace `import { MONO, ROLE } from '../theme';` with:

```typescript
import { alpha } from '@mui/material/styles';
import { MONO, ROLE } from '../theme';
```

Replace:

```typescript
/** Band colours mirror the map fill-color step expression */
const BAND_COLORS = ['#00C8E0', '#00BCD4', '#0097A7'] as const;
function bandColor(idx: number): string {
  return BAND_COLORS[Math.min(idx, BAND_COLORS.length - 1)];
}
```

with:

```typescript
/** Bands share the answer colour and fade outward, mirroring the map. */
const BAND_OPACITY = [1, 0.65, 0.4] as const;
function bandColor(idx: number): string {
  return alpha(ROLE.answer, BAND_OPACITY[Math.min(idx, BAND_OPACITY.length - 1)]);
}
```

- [ ] **Step 5: HeatmapSpotlightCard**

Replace `import { MONO } from '../theme';` with:

```typescript
import { alpha } from '@mui/material/styles';
import { INK_1, MONO, ROLE } from '../theme';
```

Delete the line `const ACCENT = '#FF7043';`. Then:

- `background: 'rgba(20,21,23,0.92)',` → `background: alpha(INK_1, 0.92),`
- `<Typography sx={{ color: ACCENT, fontWeight: 700, fontSize: 12 }}>` → `<Typography sx={{ color: ROLE.answer, fontWeight: 700, fontSize: 12 }}>` (the count is the answer)
- `sx={{ color: '#555', p: 0.25 }}` → `sx={{ color: 'rgba(255,255,255,0.4)', p: 0.25 }}`
- both `color: '#ddd'` → `color: 'rgba(255,255,255,0.86)'`
- both `color: '#555', fontSize: 10` → `color: 'rgba(255,255,255,0.4)', fontSize: 10`
- `'&:hover': { background: 'rgba(255,112,67,0.06)' },` → `'&:hover': { background: alpha(ROLE.you, 0.06) },`
- `<Typography sx={{ color: ACCENT, fontSize: 11 }}>` → `<Typography sx={{ color: ROLE.you, fontSize: 11 }}>` (the see-all toggle is an action)

- [ ] **Step 6: Verify**

```bash
cd cityscope && grep -n "ACCENT\|DOWN\|BAND_COLORS" src/components/HeatmapSpotlightCard.tsx src/components/DistrictStatsView.tsx src/components/IsochroneResultsPanel.tsx; echo "(no output = old constants gone)"; npx tsc -b; echo "TSC_EXIT=$?"; npm run lint; echo "LINT_EXIT=$?"; npm test 2>&1 | grep -E "Tests |Test Files"
```

Expected: no matches; both exits `0`; 5 files / 48 tests passing. **The guard now covers every file.**

- [ ] **Step 7: Commit**

```bash
git add cityscope/src/components/DistrictStatsView.tsx cityscope/src/components/IsochroneResultsPanel.tsx cityscope/src/components/HeatmapSpotlightCard.tsx cityscope/src/colourGuard.test.ts
git commit -m "refactor(web): result card colours onto roles"
```

---

### Task 9: Remove the pending list, prove the guard, verify live

**Files:**
- Modify: `cityscope/src/colourGuard.test.ts`
- Modify: `CLAUDE.md` (Conventions), `cityscope/CLAUDE.md` (Frontend conventions)

**Interfaces:**
- Consumes: everything above.
- Produces: the final guard, with no escape hatch.

- [ ] **Step 1: Delete the escape hatch**

In `cityscope/src/colourGuard.test.ts`, delete the `PENDING` declaration and its doc comment, delete the whole `it('lists only files that still contain colour literals', …)` test and its comment, and replace the remaining guard test with:

```typescript
describe('colour guard', () => {
  it('finds no colour literals outside theme.ts', () => {
    expect(sourceFiles(SRC).flatMap(offendersIn)).toEqual([]);
  });
});
```

If `relPath` is now unused, delete it too (`tsc -b` doesn't check test files, but lint does).

- [ ] **Step 2: Prove the guard still bites**

Temporarily append this line to the end of `cityscope/src/components/ShareButton.tsx`:

```typescript
export const guardProbe = '#FF7043';
```

Run:

```bash
cd cityscope && npx vitest run src/colourGuard.test.ts
```

Expected: FAIL, listing `components/ShareButton.tsx:<last line>  #FF7043`. Then remove the line and confirm the file is back to its committed state:

```bash
cd cityscope && git checkout -- src/components/ShareButton.tsx && git status --short src/components/ShareButton.tsx; echo "(no output = restored)"
```

- [ ] **Step 3: Full verification**

```bash
cd cityscope && npm test 2>&1 | grep -E "Tests |Test Files"; npx tsc -b; echo "TSC_EXIT=$?"; npm run lint; echo "LINT_EXIT=$?"; npm run build 2>&1 | grep -E "built in|error"
```

Expected: 5 files / **47** tests passing (48 minus the removed pending test), `TSC_EXIT=0`, `LINT_EXIT=0`, and a Vite `built in` line. Vite's existing >500 kB chunk warning is expected and unrelated.

- [ ] **Step 4: Live walkthrough**

With backend and frontend running (see Global Constraints), check every surface once:

- [ ] Navbar: the brand ring is gold (no lemon tint); the active 2D/3D button is gold with dark text.
- [ ] Search pill background is graphite, not blue-black.
- [ ] Sidebar gradient unchanged; the heat legend fades from clear to warm white.
- [ ] Districts: dashed warm-white lines; clicking selects **and** draws the gold outline.
- [ ] Heatmap: warm-white "city lights".
- [ ] Isochrone: gold origin dot, single-cyan bands; the results panel band borders are cyan, fading.
- [ ] Route: gold A/B pins and buttons; cyan line; stats box cyan-tinted.
- [ ] Search pin: gold ring.
- [ ] Draw Area: gold throughout; draw, edit, clear, and restore from a share link all work.
- [ ] District stats badge: cyan for both above and below average; the border appears when the comparison is unavailable (the invalid-CSS fix).
- [ ] Spotlight card: cyan count, gold "See all" toggle.
- [ ] Browser console: no errors.

Take one screenshot of the map mid-analysis (isochrone over the heatmap with districts on) for the before/after record.

- [ ] **Step 5: Document the rule**

In `CLAUDE.md`, replace the Conventions line:

```markdown
- MUI `sx` styling; dark "cartographer's instrument" theme — graphite surfaces + a single gold accent (`AMBER`), cyan reserved for live data (`cityscope/src/theme.ts`).
```

with:

```markdown
- MUI `sx` styling; dark "cartographer's instrument" theme with three colour roles in `cityscope/src/theme.ts`: `ROLE.you` gold (what the user did — pins, drawn areas, selection, actions), `ROLE.answer` cyan (analysis results), `ROLE.context` warm white (heatmap, district lines). **No colour literals outside `theme.ts`** — use a token, or `alpha()`/`darken()` on one; `cityscope/src/colourGuard.test.ts` fails the build otherwise.
```

In `cityscope/CLAUDE.md`, replace:

```markdown
- MUI `sx` styling on the dark "cartographer's instrument" theme (`src/theme.ts`): graphite surfaces, single gold accent (`AMBER`), cyan for live data. Responsive down to a mobile bottom-sheet.
```

with:

```markdown
- MUI `sx` styling on the dark "cartographer's instrument" theme (`src/theme.ts`): colours come from three roles — `ROLE.you` (gold), `ROLE.answer` (cyan), `ROLE.context` (warm white) — and no colour literal may appear outside `theme.ts` (enforced by `src/colourGuard.test.ts`). Responsive down to a mobile bottom-sheet.
```

- [ ] **Step 6: Commit**

```bash
git add cityscope/src/colourGuard.test.ts CLAUDE.md cityscope/CLAUDE.md
git commit -m "test(web): enforce the colour guard on every file; document the roles"
```

---

## Phase 1 success criteria (from the spec)

- [ ] Zero colour literals outside `theme.ts`, enforced by `colourGuard.test.ts` with no pending list.
- [ ] Map layers, markers and the drawn polygon all use the three roles; the rainbow heatmap is gone.
- [ ] District selection still works, and the selected district is outlined in gold.
- [ ] The drawn polygon is gold and every draw interaction still works.
- [ ] Build, lint and all frontend tests are clean.
