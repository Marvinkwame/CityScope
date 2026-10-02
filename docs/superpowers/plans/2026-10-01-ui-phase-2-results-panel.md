# UI Phase 2: Shared Results Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every analysis tool presents its results with one set of shared components: a stat row, category bars, a comparison badge and a place list, with Material icons in place of emoji.

**Architecture:**
- **Pure helpers.** Formatting, bar maths and density comparison live as pure, unit-tested helpers in `cityscope/src/components/results/`.
- **Thin components.** Five small presentational components in the same folder render those helpers' output with the Phase 1 colour roles.
- **One panel at a time.** Each of the five result surfaces (district stats, drawn area, spotlight, isochrone, route) is then rebuilt on the shared parts, one task each.
- **One backend change.** The backend returns every category count, not just the top few, so the bars can say "+ N more categories".

**Tech Stack:** React 19, TypeScript (strict), MUI 7 (`@mui/material`, `@mui/icons-material`, `alpha` from `@mui/material/styles`), Zustand 5, TanStack Query 5, Vitest 4 (node environment), Express 5 + PostGIS on the backend.

**Spec:** `docs/superpowers/specs/2026-09-30-ui-focused-pass-design.md`, Phase 2, plus the approved mockup "B. Bars" (`.superpowers/brainstorm/793-1790804961/content/results-panel.html`, gitignored).

**Branch:** `ui/results-panel`. Phase 2 builds on Phase 1's tokens (`ROLE`, the colour guard), so branch from wherever Phase 1 currently is:
- **If Phase 1's PR has merged:** `git checkout main && git pull && git checkout -b ui/results-panel`.
- **If not yet merged:** `git checkout ui/colour-roles && git pull && git checkout -b ui/results-panel`. This is a stacked branch; rebase it onto `main` once Phase 1 lands.
- Then commit this plan as the branch's first commit: `git add docs/superpowers/plans/2026-10-01-ui-phase-2-results-panel.md && git commit -m "docs: implementation plan for UI phase 2 (results panel)"`.

## Global Constraints

**Code**
- Strict TypeScript, **no `any`**. Type-only imports use `import type`.
- **All Mapbox mutation lives in `cityscope/src/components/MapView.tsx`.** UI components write to stores; the map reacts in `useEffect`.
  - The one existing exception is camera moves: components call `useMapStore.getState().map?.flyTo(...)`.
  - This plan moves the two existing copies of that into `PlaceList` and adds no new map calls anywhere else.
- **No component rendering tests.** The spec makes jsdom and Testing Library a non-goal, so components are verified by `tsc`, lint and the controller's live checks. Pure helpers are unit-tested.
- Test files are named `*.test.ts`, never `*.test.tsx`. `tsconfig.app.json` excludes only `src/**/*.test.ts` from the build. Vitest runs in the default node environment.

**Commits**
- Commits are granular, one concern each, with **NO `Co-Authored-By` trailer** (the owner's explicit rule; it overrides any harness attribution setting).
- Stage files by explicit path; never `git add -A` or `git add .`.

**Colour**
- Colour literals are allowed **only in `cityscope/src/theme.ts`**; `src/colourGuard.test.ts` fails `npm test` otherwise. Everywhere else:
  - `rgba(255,255,255,a)` / `rgba(0,0,0,a)` are allowed;
  - tints come from `alpha(TOKEN, n)`;
  - never hand-build a tint like `` `${TOKEN}80` ``.
- **Every component this plan creates or rewrites uses `ROLE.*`, never `AMBER` or `CYAN` directly.** Those two are reserved for brand chrome (the logo and the live readout). Existing chrome such as the navbar and sidebar is out of scope and keeps its imports. The roles:
  - `ROLE.you` (gold) is what the user does: the band switcher's selection, "Show all", "Clear area";
  - `ROLE.answer` (cyan) is analysis results: bars, the comparison badge, result headings, result loading spinners;
  - `ROLE.context` (warm white) is not used in this phase.

**Copy and formatting** (from the spec)
- Numbers: `formatCount` gives `3,350`, `formatShare` gives `28%`, `formatDistance` gives `120 m` below 1 km and `1.4 km` from 1 km up.
- **Bars:** the top 5 categories, each with icon, name, count, share of the total, and a `ROLE.answer` bar scaled to the largest. Then "+ N more categories".
  - Each row's accessible label reads like "Restaurant: 924, 28%".
  - Icons are `aria-hidden`.
- **Comparison badge:** `▲ +142% vs city avg 35/km²` or `▼ −62% vs city avg 35/km²` (a real minus, U+2212). `≈ city average` when `densityVsCityPct` is null. Always `ROLE.answer`, never green or red.
- **Icons:**

  | Category | Icon | Category | Icon |
  |---|---|---|---|
  | restaurant | `Restaurant` | park | `Park` |
  | cafe | `LocalCafe` | playground | `ChildCare` |
  | pub | `SportsBar` | attraction | `Attractions` |
  | bar | `LocalBar` | museum | `Museum` |
  | supermarket | `LocalGroceryStore` | hotel | `Hotel` |
  | bakery | `BakeryDining` | anything else | `Place` |

- **Isochrone:** the stacked accordions become a band switcher, which **defaults to the outermost band**.

**Servers**
- **Do not start any dev server.** The owner runs the frontend on :5173 and the backend on :3001. The backend runs under `tsx watch`, so it reloads on save. Live browser checks belong to the controller, not to implementers.

## Deviations from the spec (decided while planning, 2026-10-01)

1. **The backend returns every category, not `LIMIT 5`.**
   - The spec said to change district stats from `LIMIT 3` to `LIMIT 5`. But the approved mockup shows "+ 6 more categories" under Mitte's top 5, and that number can only be computed if the client sees every category.
   - There are exactly 11 categories, so this is at most 11 rows.
   - The field keeps its name, `topCategories`, now meaning "every category present, largest first". Old and new frontends and backends stay compatible in either deploy order.
2. **`CategoryIcon` looks its icon up inline** (`CATEGORY_ICONS[...] ?? FALLBACK_ICON`) instead of calling a helper.
   - `eslint-plugin-react-hooks` 7's `static-components` rule rejects `<Icon />` when `Icon` comes from a function call. A lint probe on 2026-10-01 confirmed it.
   - A direct lookup passes lint and `tsc`. The unit test therefore targets the map and the fallback.
3. **`PlaceList` owns a "Show all N places" toggle** (a gold "you" action).
   - It replaces both the spotlight's own "See all" expander and the isochrone's long scroll list.
   - `useHeatmapSpotlight` drops its now-unused `topPois` field.
4. **The isochrone band's `StatRow` shows Places and Categories.** Band results carry no area, so there is no density.
5. **Two small additions not named in the spec:**
   - `SectionLabel`, the uppercase eyebrow heading that every panel repeats;
   - `distanceParts`, so a `StatRow` can show "6.4" with a small "km".

## Baseline (measured 2026-10-01 on `ui/colour-roles` @ `256d8e5`)

- Frontend (`cd cityscope && npx vitest run`): **7 files, 62 tests**.
- Backend (`cd cityscope-backend && npx vitest run`): **4 files, 50 tests**.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `cityscope-backend/src/routes/districts.ts` | Modify | District stats return every category |
| `cityscope-backend/src/routes/pois.ts` | Modify | Drawn-area analysis returns every category |
| `cityscope/src/hooks/useDistrictStats.ts`, `useAreaAnalysis.ts` | Modify | Document that `topCategories` is now every category |
| `cityscope/src/components/results/format.ts` (+ `.test.ts`) | Create | `formatCount`, `formatShare`, `distanceParts`, `formatDistance`, `categoryLabel` |
| `cityscope/src/components/results/bars.ts` (+ `.test.ts`) | Create | `toBars`, `barLabel`, bar types |
| `cityscope/src/components/results/comparison.ts` (+ `.test.ts`) | Create | `compareToCity` (arrow, delta, context, label) |
| `cityscope/src/components/results/categoryIcons.ts` (+ `.test.ts`) | Create | `CATEGORY_ICONS`, `FALLBACK_ICON` |
| `cityscope/src/components/results/CategoryIcon.tsx` | Create | Renders a category's icon, decorative |
| `cityscope/src/components/results/SectionLabel.tsx` | Create | The uppercase eyebrow heading |
| `cityscope/src/components/results/StatRow.tsx` | Create | 2–3 headline numbers |
| `cityscope/src/components/results/CategoryBars.tsx` | Create | Top-5 bars and "+ N more" |
| `cityscope/src/components/results/ComparisonBadge.tsx` | Create | Density vs the city average |
| `cityscope/src/components/results/PlaceList.tsx` | Create | Rows that fly the map to a place, with a "Show all" toggle |
| `cityscope/src/components/DistrictStatsView.tsx` | Rewrite | StatRow + ComparisonBadge + CategoryBars |
| `cityscope/src/components/DrawControls.tsx` | Modify | StatRow + CategoryBars, gold "Clear area" |
| `cityscope/src/components/HeatmapSpotlightCard.tsx` | Rewrite | CategoryBars + PlaceList; sits beside the open sidebar |
| `cityscope/src/hooks/useHeatmapSpotlight.ts` | Modify | Drop `topPois` |
| `cityscope/src/components/IsochroneResultsPanel.tsx` | Rewrite | Band switcher + StatRow + CategoryBars + PlaceList |
| `cityscope/src/components/RouteResultsPanel.tsx` | Rewrite | StatRow; shared `formatDistance` |
| `cityscope/src/theme.ts` | Modify | Header comment: components use `ROLE.*` |
| `cityscope/README.md`, the spec | Modify | Docs |

## Controller pre-flight (before Task 1, not an implementer task)

If the owner's servers are up on :5173 and :3001, take **"before" screenshots** of all five result surfaces with Playwright, read-only against the owner's server, and save them outside the repo:
- district stats for Berlin Mitte;
- a drawn area in central Berlin;
- the isochrone for the Alexanderplatz 15-minute walk;
- the spotlight after a heatmap click near Alexanderplatz;
- a route from Brandenburger Tor to Ostkreuz.

These pair with the "after" set in the final live verification.

---

### Task 1: Backend returns every category count

**Files:**
- Modify: `cityscope-backend/src/routes/districts.ts:68`
- Modify: `cityscope-backend/src/routes/pois.ts:50`
- Modify: `cityscope/src/hooks/useDistrictStats.ts:16`
- Modify: `cityscope/src/hooks/useAreaAnalysis.ts:15`

**Interfaces:**
- Produces: `GET /api/cities/:cityId/districts/:id/stats` and `POST /api/cities/:cityId/pois/within` both return `topCategories: { category: string; count: number }[]`. The list now holds **every category present, largest first**, not 3 or 5.

There are no route unit tests in this repo; the SQL is verified with `curl` against the owner's running backend, which reloads on save.

- [ ] **Step 1: Drop the district stats limit**

In `cityscope-backend/src/routes/districts.ts`, replace:

```sql
             FROM inside GROUP BY category ORDER BY count(*) DESC LIMIT 3
```

with:

```sql
             -- Every category (there are 11), largest first. The client shows
             -- the top 5 and counts the rest as "+ N more categories".
             FROM inside GROUP BY category ORDER BY count(*) DESC
```

- [ ] **Step 2: Drop the drawn-area limit**

In `cityscope-backend/src/routes/pois.ts`, replace:

```sql
             FROM inside GROUP BY category ORDER BY count(*) DESC LIMIT 5
```

with:

```sql
             -- Every category (there are 11), largest first. The client shows
             -- the top 5 and counts the rest as "+ N more categories".
             FROM inside GROUP BY category ORDER BY count(*) DESC
```

- [ ] **Step 3: Document the contract on the frontend types**

In `cityscope/src/hooks/useDistrictStats.ts`, replace:

```ts
  topCategories: DistrictCategoryCount[];
```

with:

```ts
  /** Every category present in the district, largest first. */
  topCategories: DistrictCategoryCount[];
```

In `cityscope/src/hooks/useAreaAnalysis.ts`, replace:

```ts
  topCategories: AreaCategoryCount[];
```

with:

```ts
  /** Every category present in the area, largest first. */
  topCategories: AreaCategoryCount[];
```

- [ ] **Step 4: Run the backend tests and build**

Run: `cd cityscope-backend && npx vitest run && npm run build`
Expected: `Test Files  4 passed (4)`, `Tests  50 passed (50)`, and `tsc` exits 0.

- [ ] **Step 5: Verify against the running backend**

Run:

```bash
curl -s http://localhost:3001/api/cities/berlin/districts/10/stats | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.name, j.topCategories.length, JSON.stringify(j.topCategories.slice(0,3)))})"
curl -s -X POST http://localhost:3001/api/cities/berlin/pois/within -H "Content-Type: application/json" -d '{"polygon":{"type":"Polygon","coordinates":[[[13.38,52.51],[13.42,52.51],[13.42,52.53],[13.38,52.53],[13.38,52.51]]]}}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.poiCount, j.topCategories.length)})"
```

Expected:
- **District stats:** `Mitte` followed by a number **greater than 3** (Mitte has 11 categories), then the three largest, sorted descending.
- **Area analysis:** a POI count followed by a number **greater than 5**.
- If :3001 doesn't answer, don't start a server. Report it, and the controller will verify.

- [ ] **Step 6: Commit**

```bash
git add cityscope-backend/src/routes/districts.ts cityscope-backend/src/routes/pois.ts cityscope/src/hooks/useDistrictStats.ts cityscope/src/hooks/useAreaAnalysis.ts
git commit -m "feat(api): return every category count, not just the top few" -m "The shared results panel shows the top 5 categories and counts the rest as '+ N more categories', which needs every count. There are only 11 categories. The field keeps its name, so old and new frontends and backends stay compatible in either deploy order."
```

---

### Task 2: Pure result helpers (formatting, bars, comparison)

**Files:**
- Create: `cityscope/src/components/results/format.ts`, `cityscope/src/components/results/format.test.ts`
- Create: `cityscope/src/components/results/bars.ts`, `cityscope/src/components/results/bars.test.ts`
- Create: `cityscope/src/components/results/comparison.ts`, `cityscope/src/components/results/comparison.test.ts`

**Interfaces:**
- Produces (`format.ts`):
  - `formatCount(n: number): string`
  - `formatShare(share: number): string`
  - `distanceParts(metres: number): { value: string; unit: 'm' | 'km' }`
  - `formatDistance(metres: number): string`
  - `categoryLabel(category: string): string`
- Produces (`bars.ts`):
  - types `CategoryCount { category: string; count: number }`, `CategoryCounts = ReadonlyArray<CategoryCount> | Readonly<Record<string, number>>`, `BarRow { category; count; share; barPct }` and `Bars { rows: BarRow[]; moreCount: number }`;
  - `toBars(counts: CategoryCounts, total: number, limit = 5): Bars`;
  - `barLabel(row: BarRow): string`.
- Produces (`comparison.ts`):
  - type `Comparison { arrow: '▲' | '▼' | '≈'; delta: string | null; context: string; label: string }`;
  - `compareToCity(pct: number | null, cityAvgDensity: number): Comparison`.

#### 2a: Formatters

- [ ] **Step 1: Write the failing test**

Create `cityscope/src/components/results/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { categoryLabel, distanceParts, formatCount, formatDistance, formatShare } from './format';

describe('formatCount', () => {
  it('groups thousands with commas', () => {
    expect(formatCount(3350)).toBe('3,350');
    expect(formatCount(179819)).toBe('179,819');
  });

  it('leaves small numbers alone', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(85)).toBe('85');
  });

  it('rounds to a whole number', () => {
    expect(formatCount(84.6)).toBe('85');
  });
});

describe('formatShare', () => {
  it('shows a fraction as a whole percentage', () => {
    expect(formatShare(0.2757)).toBe('28%');
    expect(formatShare(1)).toBe('100%');
    expect(formatShare(0)).toBe('0%');
  });

  it('never shows a real share as 0%', () => {
    expect(formatShare(0.004)).toBe('<1%');
    expect(formatShare(0.005)).toBe('1%');
  });
});

describe('formatDistance', () => {
  it('uses metres below 1 km', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(120)).toBe('120 m');
    expect(formatDistance(999.4)).toBe('999 m');
  });

  it('switches to kilometres at 1 km, one decimal', () => {
    expect(formatDistance(999.6)).toBe('1.0 km');
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(1400)).toBe('1.4 km');
    expect(formatDistance(6420)).toBe('6.4 km');
  });

  it('splits into a value and a unit for stat rows', () => {
    expect(distanceParts(120)).toEqual({ value: '120', unit: 'm' });
    expect(distanceParts(6420)).toEqual({ value: '6.4', unit: 'km' });
  });
});

describe('categoryLabel', () => {
  it('capitalises the first letter', () => {
    expect(categoryLabel('restaurant')).toBe('Restaurant');
  });

  it('copes with an empty string', () => {
    expect(categoryLabel('')).toBe('');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd cityscope && npx vitest run src/components/results/format.test.ts`
Expected: FAIL, because the `./format` module can't be resolved.

- [ ] **Step 3: Implement**

Create `cityscope/src/components/results/format.ts`:

```ts
/**
 * Number formatting for the result panels. The locale is fixed to en-US so
 * the numbers read the same on every machine.
 */
const COUNT = new Intl.NumberFormat('en-US');

/** 3350 -> "3,350". Rounds to a whole number first. */
export function formatCount(n: number): string {
  return COUNT.format(Math.round(n));
}

/**
 * A fraction of a whole (0..1) as a percentage: 0.2757 -> "28%". A real share
 * too small to round up to 1% reads "<1%", never "0%".
 */
export function formatShare(share: number): string {
  if (share > 0 && share < 0.005) return '<1%';
  return `${Math.round(share * 100)}%`;
}

/** Metres below 1 km, kilometres with one decimal from 1 km up. */
export function distanceParts(metres: number): { value: string; unit: 'm' | 'km' } {
  const rounded = Math.round(metres);
  if (rounded < 1000) return { value: String(rounded), unit: 'm' };
  return { value: (metres / 1000).toFixed(1), unit: 'km' };
}

/** "120 m" / "1.4 km". */
export function formatDistance(metres: number): string {
  const { value, unit } = distanceParts(metres);
  return `${value} ${unit}`;
}

/** "restaurant" -> "Restaurant". */
export function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `cd cityscope && npx vitest run src/components/results/format.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add cityscope/src/components/results/format.ts cityscope/src/components/results/format.test.ts
git commit -m "feat(web): number formatting for the shared results panel"
```

#### 2b: Bars

- [ ] **Step 6: Write the failing test**

Create `cityscope/src/components/results/bars.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { barLabel, toBars } from './bars';

// Berlin Mitte, largest first, as the district stats endpoint returns it.
const MITTE = [
  { category: 'restaurant', count: 924 },
  { category: 'cafe', count: 572 },
  { category: 'playground', count: 509 },
  { category: 'bar', count: 257 },
  { category: 'park', count: 256 },
  { category: 'hotel', count: 240 },
  { category: 'pub', count: 200 },
];

describe('toBars', () => {
  it('keeps the top 5 and counts the rest', () => {
    const { rows, moreCount } = toBars(MITTE, 3350);
    expect(rows.map((r) => r.category)).toEqual(['restaurant', 'cafe', 'playground', 'bar', 'park']);
    expect(moreCount).toBe(2);
  });

  it('measures share against the total, not against the rows shown', () => {
    const { rows } = toBars(MITTE, 3350);
    expect(rows[0].share).toBeCloseTo(924 / 3350);
  });

  it('scales each bar to the largest category', () => {
    const { rows } = toBars(MITTE, 3350);
    expect(rows[0].barPct).toBe(100);
    expect(rows[1].barPct).toBeCloseTo((572 / 924) * 100);
  });

  it('sorts unsorted input, largest first, ties alphabetical', () => {
    const { rows } = toBars({ park: 3, cafe: 9, bar: 3 }, 15);
    expect(rows.map((r) => r.category)).toEqual(['cafe', 'bar', 'park']);
  });

  it('shows everything when there are fewer than 5 categories', () => {
    const { rows, moreCount } = toBars({ cafe: 2, bar: 1 }, 3);
    expect(rows).toHaveLength(2);
    expect(moreCount).toBe(0);
  });

  it('honours a custom limit', () => {
    expect(toBars(MITTE, 3350, 3).moreCount).toBe(4);
  });

  it('drops zero counts', () => {
    const { rows, moreCount } = toBars({ cafe: 2, bar: 0 }, 2);
    expect(rows.map((r) => r.category)).toEqual(['cafe']);
    expect(moreCount).toBe(0);
  });

  it('handles empty input and a zero total', () => {
    expect(toBars([], 0)).toEqual({ rows: [], moreCount: 0 });
    expect(toBars({ cafe: 1 }, 0).rows[0].share).toBe(0);
  });
});

describe('barLabel', () => {
  it('reads name, count and share, so the chart is never colour-only', () => {
    expect(barLabel({ category: 'restaurant', count: 924, share: 924 / 3350, barPct: 100 })).toBe(
      'Restaurant: 924, 28%',
    );
  });
});
```

- [ ] **Step 7: Run it to make sure it fails**

Run: `cd cityscope && npx vitest run src/components/results/bars.test.ts`
Expected: FAIL, because the `./bars` module can't be resolved.

- [ ] **Step 8: Implement**

Create `cityscope/src/components/results/bars.ts`:

```ts
import { categoryLabel, formatCount, formatShare } from './format';

export interface CategoryCount {
  category: string;
  count: number;
}

/** Either shape the API returns: a list of counts, or a category -> count record. */
export type CategoryCounts = ReadonlyArray<CategoryCount> | Readonly<Record<string, number>>;

export interface BarRow {
  category: string;
  count: number;
  /** count / total, 0..1: this category's share of every place in the area. */
  share: number;
  /** count / the largest count, 0..100: the bar's width. */
  barPct: number;
}

export interface Bars {
  rows: BarRow[];
  /** How many categories did not make the top `limit`. */
  moreCount: number;
}

function isList(counts: CategoryCounts): counts is ReadonlyArray<CategoryCount> {
  return Array.isArray(counts);
}

/**
 * The top `limit` categories as bar rows, largest first (ties alphabetical,
 * so the order is stable), plus how many categories were left out. Zero
 * counts are dropped.
 */
export function toBars(counts: CategoryCounts, total: number, limit = 5): Bars {
  const entries = (isList(counts)
    ? counts.map(({ category, count }) => ({ category, count }))
    : Object.entries(counts).map(([category, count]) => ({ category, count })))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const top = entries.slice(0, limit);
  const largest = top[0]?.count ?? 0;

  return {
    rows: top.map(({ category, count }) => ({
      category,
      count,
      share: total > 0 ? count / total : 0,
      barPct: largest > 0 ? (count / largest) * 100 : 0,
    })),
    moreCount: entries.length - top.length,
  };
}

/** What a screen reader hears for one row, e.g. "Restaurant: 924, 28%". */
export function barLabel(row: BarRow): string {
  return `${categoryLabel(row.category)}: ${formatCount(row.count)}, ${formatShare(row.share)}`;
}
```

- [ ] **Step 9: Run it to make sure it passes**

Run: `cd cityscope && npx vitest run src/components/results/bars.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 10: Commit**

```bash
git add cityscope/src/components/results/bars.ts cityscope/src/components/results/bars.test.ts
git commit -m "feat(web): top-category bars with shares and a +N more count"
```

#### 2c: Comparison with the city average

- [ ] **Step 11: Write the failing test**

Create `cityscope/src/components/results/comparison.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { compareToCity } from './comparison';

describe('compareToCity', () => {
  it('points up for denser than average', () => {
    expect(compareToCity(142.4, 35.2)).toEqual({
      arrow: '▲',
      delta: '+142%',
      context: 'vs city avg 35/km²',
      label: '142% above the city average of 35 per km²',
    });
  });

  it('points down for sparser, with a real minus sign', () => {
    const c = compareToCity(-61.6, 35.2);
    expect(c.arrow).toBe('▼');
    expect(c.delta).toBe('−62%');
    expect(c.label).toBe('62% below the city average of 35 per km²');
  });

  it('reads "city average" when there is no comparison', () => {
    expect(compareToCity(null, 0)).toEqual({
      arrow: '≈',
      delta: null,
      context: 'city average',
      label: 'About the city average density',
    });
  });

  it('treats anything that rounds to 0% as average', () => {
    expect(compareToCity(0.4, 35).arrow).toBe('≈');
    expect(compareToCity(-0.4, 35).arrow).toBe('≈');
  });

  it('groups a large average', () => {
    expect(compareToCity(10, 1234.5).context).toBe('vs city avg 1,235/km²');
  });
});
```

- [ ] **Step 12: Run it to make sure it fails**

Run: `cd cityscope && npx vitest run src/components/results/comparison.test.ts`
Expected: FAIL, because the `./comparison` module can't be resolved.

- [ ] **Step 13: Implement**

Create `cityscope/src/components/results/comparison.ts`:

```ts
import { formatCount } from './format';

export interface Comparison {
  /** ▲ above, ▼ below, ≈ about the same. The arrow carries the direction; colour never does. */
  arrow: '▲' | '▼' | '≈';
  /** "+142%" or "−62%", or null when there is nothing to quantify. */
  delta: string | null;
  /** The muted half of the badge: "vs city avg 35/km²", or "city average". */
  context: string;
  /** The whole comparison as a sentence, for screen readers. */
  label: string;
}

/**
 * How an area's density compares with the city's average district. `pct` is
 * the API's `densityVsCityPct`: null when no meaningful comparison exists.
 * Density is neither good nor bad, so there is no "better" or "worse" here,
 * only above and below. Anything that rounds to 0% reads as average.
 */
export function compareToCity(pct: number | null, cityAvgDensity: number): Comparison {
  const rounded = pct === null ? 0 : Math.round(pct);
  if (rounded === 0) {
    return { arrow: '≈', delta: null, context: 'city average', label: 'About the city average density' };
  }

  const size = Math.abs(rounded);
  const avg = formatCount(cityAvgDensity);
  const context = `vs city avg ${avg}/km²`;

  if (rounded > 0) {
    return { arrow: '▲', delta: `+${size}%`, context, label: `${size}% above the city average of ${avg} per km²` };
  }
  return { arrow: '▼', delta: `−${size}%`, context, label: `${size}% below the city average of ${avg} per km²` };
}
```

- [ ] **Step 14: Run the whole frontend suite**

Run: `cd cityscope && npx vitest run`
Expected: PASS, **10 files, 86 tests** (62 + 10 + 9 + 5).

- [ ] **Step 15: Commit**

```bash
git add cityscope/src/components/results/comparison.ts cityscope/src/components/results/comparison.test.ts
git commit -m "feat(web): density comparison that uses an arrow, not a colour"
```

---

### Task 3: Category icons

**Files:**
- Create: `cityscope/src/components/results/categoryIcons.ts`, `cityscope/src/components/results/categoryIcons.test.ts`
- Create: `cityscope/src/components/results/CategoryIcon.tsx`

**Interfaces:**
- Produces:
  - `CATEGORY_ICONS: Readonly<Partial<Record<string, CategoryIconComponent>>>`
  - `FALLBACK_ICON: CategoryIconComponent`
  - `type CategoryIconComponent = typeof SvgIcon`
  - `<CategoryIcon category={string} size?={number} />`, default size 15.

- [ ] **Step 1: Write the failing test**

Create `cityscope/src/components/results/categoryIcons.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import PlaceIcon from '@mui/icons-material/Place';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import { CATEGORY_ICONS, FALLBACK_ICON } from './categoryIcons';

// The backend's 11 categories (cityscope-backend/src/lib/poiCategories.ts).
const CATEGORIES = [
  'restaurant', 'cafe', 'pub', 'bar', 'supermarket', 'bakery',
  'park', 'playground', 'attraction', 'museum', 'hotel',
];

describe('category icons', () => {
  it('gives every backend category its own icon', () => {
    const icons = CATEGORIES.map((c) => CATEGORY_ICONS[c]);
    icons.forEach((icon, i) => {
      expect(icon, CATEGORIES[i]).toBeDefined();
      expect(icon, CATEGORIES[i]).not.toBe(FALLBACK_ICON);
    });
    expect(new Set(icons).size).toBe(CATEGORIES.length);
  });

  it('maps no category the backend does not have', () => {
    expect(Object.keys(CATEGORY_ICONS).sort()).toEqual([...CATEGORIES].sort());
  });

  it('uses the agreed glyphs', () => {
    expect(CATEGORY_ICONS.restaurant).toBe(RestaurantIcon);
    // Material has no playground glyph; Toys renders as a toy car.
    expect(CATEGORY_ICONS.playground).toBe(ChildCareIcon);
  });

  it('falls back to a pin for unknown categories', () => {
    expect(CATEGORY_ICONS.spaceport).toBeUndefined();
    expect(FALLBACK_ICON).toBe(PlaceIcon);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd cityscope && npx vitest run src/components/results/categoryIcons.test.ts`
Expected: FAIL, because the `./categoryIcons` module can't be resolved.

- [ ] **Step 3: Implement the map**

Create `cityscope/src/components/results/categoryIcons.ts`:

```ts
import type SvgIcon from '@mui/material/SvgIcon';
import AttractionsIcon from '@mui/icons-material/Attractions';
import BakeryDiningIcon from '@mui/icons-material/BakeryDining';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import HotelIcon from '@mui/icons-material/Hotel';
import LocalBarIcon from '@mui/icons-material/LocalBar';
import LocalCafeIcon from '@mui/icons-material/LocalCafe';
import LocalGroceryStoreIcon from '@mui/icons-material/LocalGroceryStore';
import MuseumIcon from '@mui/icons-material/Museum';
import ParkIcon from '@mui/icons-material/Park';
import PlaceIcon from '@mui/icons-material/Place';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import SportsBarIcon from '@mui/icons-material/SportsBar';

export type CategoryIconComponent = typeof SvgIcon;

/**
 * One Material icon per POI category: the 11 in the backend's
 * poiCategories.ts. Material has no playground glyph; ChildCare reads closest
 * (Toys renders as a toy car).
 */
export const CATEGORY_ICONS: Readonly<Partial<Record<string, CategoryIconComponent>>> = {
  restaurant: RestaurantIcon,
  cafe: LocalCafeIcon,
  pub: SportsBarIcon,
  bar: LocalBarIcon,
  supermarket: LocalGroceryStoreIcon,
  bakery: BakeryDiningIcon,
  park: ParkIcon,
  playground: ChildCareIcon,
  attraction: AttractionsIcon,
  museum: MuseumIcon,
  hotel: HotelIcon,
};

/** The icon for any category not in the map. */
export const FALLBACK_ICON: CategoryIconComponent = PlaceIcon;
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `cd cityscope && npx vitest run src/components/results/categoryIcons.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Implement the component**

Create `cityscope/src/components/results/CategoryIcon.tsx`:

```tsx
import { CATEGORY_ICONS, FALLBACK_ICON } from './categoryIcons';

/**
 * A category's icon. Decorative: the category's name is always next to it.
 *
 * The icon is looked up inline rather than through a helper function on
 * purpose. react-hooks/static-components rejects `<Icon />` when `Icon` comes
 * from a function call, but accepts a direct lookup.
 */
function CategoryIcon({ category, size = 15 }: { category: string; size?: number }) {
  const Icon = CATEGORY_ICONS[category.toLowerCase()] ?? FALLBACK_ICON;
  return <Icon aria-hidden sx={{ fontSize: size, color: 'rgba(255,255,255,0.62)' }} />;
}

export default CategoryIcon;
```

- [ ] **Step 6: Verify the whole frontend**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npx eslint src/components/results`
Expected: **11 files, 90 tests** pass; `tsc` exits 0; eslint prints nothing.

- [ ] **Step 7: Commit**

```bash
git add cityscope/src/components/results/categoryIcons.ts cityscope/src/components/results/categoryIcons.test.ts cityscope/src/components/results/CategoryIcon.tsx
git commit -m "feat(web): Material icons for the POI categories, replacing emoji"
```

---

### Task 4: Shared stat, bar and badge components, adopted in district stats

**Files:**
- Create: `cityscope/src/components/results/SectionLabel.tsx`
- Create: `cityscope/src/components/results/StatRow.tsx`
- Create: `cityscope/src/components/results/CategoryBars.tsx`
- Create: `cityscope/src/components/results/ComparisonBadge.tsx`
- Rewrite: `cityscope/src/components/DistrictStatsView.tsx`

**Interfaces:**
- Consumes: from Task 2,
  - `formatCount`, `formatShare` and `categoryLabel` from `./format`;
  - `toBars`, `barLabel` and `type CategoryCounts` from `./bars`;
  - `compareToCity` from `./comparison`.
- Consumes: from Task 3, `CategoryIcon`.
- Produces:
  - `<SectionLabel>{children}</SectionLabel>`;
  - `<StatRow stats={ReadonlyArray<StatItem>} />`, with `export interface StatItem { label: string; value: string; unit?: string }`;
  - `<CategoryBars counts={CategoryCounts} total={number} title?={string} />`, where the title defaults to "Top categories" and the component renders nothing when there are no rows;
  - `<ComparisonBadge pct={number | null} cityAvgDensity={number} />`.

- [ ] **Step 1: Create `SectionLabel`**

Create `cityscope/src/components/results/SectionLabel.tsx`:

```tsx
import type { ReactNode } from 'react';
import Typography from '@mui/material/Typography';
import { MONO } from '../../theme';

/** The small uppercase heading above each part of a result panel. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={{
        fontFamily: MONO,
        fontSize: '0.55rem',
        letterSpacing: '1.5px',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
        mb: 1,
      }}
    >
      {children}
    </Typography>
  );
}

export default SectionLabel;
```

- [ ] **Step 2: Create `StatRow`**

Create `cityscope/src/components/results/StatRow.tsx`:

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MONO } from '../../theme';

export interface StatItem {
  label: string;
  value: string;
  unit?: string;
}

/** Two or three headline numbers for a result, each with an optional unit and a label. */
function StatRow({ stats }: { stats: ReadonlyArray<StatItem> }) {
  return (
    <Box sx={{ display: 'flex', gap: 3, mb: 1.5 }}>
      {stats.map((s) => (
        <Box key={s.label}>
          <Typography
            sx={{ fontFamily: MONO, fontSize: '1.3rem', fontWeight: 600, color: 'rgba(255,255,255,0.92)', lineHeight: 1.1 }}
          >
            {s.value}
            {s.unit ? (
              <Box component="span" sx={{ fontSize: '0.65rem', fontWeight: 400, color: 'rgba(255,255,255,0.4)', ml: 0.5 }}>
                {s.unit}
              </Box>
            ) : null}
          </Typography>
          <Typography
            sx={{ fontFamily: MONO, fontSize: '0.55rem', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', mt: 0.25 }}
          >
            {s.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export default StatRow;
```

- [ ] **Step 3: Create `CategoryBars`**

Create `cityscope/src/components/results/CategoryBars.tsx`:

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MONO, ROLE } from '../../theme';
import CategoryIcon from './CategoryIcon';
import SectionLabel from './SectionLabel';
import { barLabel, toBars, type CategoryCounts } from './bars';
import { categoryLabel, formatCount, formatShare } from './format';

/**
 * The top categories as bars. Each row has an icon, the name, the count, the
 * share of all places, and a bar scaled to the largest category, so the
 * proportions that chips used to hide are visible at a glance.
 */
function CategoryBars({
  counts,
  total,
  title = 'Top categories',
}: {
  counts: CategoryCounts;
  total: number;
  title?: string;
}) {
  const { rows, moreCount } = toBars(counts, total);
  if (rows.length === 0) return null;

  return (
    <Box>
      <SectionLabel>{title}</SectionLabel>
      <Box role="list" aria-label={title}>
        {rows.map((row) => (
          <Box
            key={row.category}
            role="listitem"
            aria-label={barLabel(row)}
            sx={{
              display: 'grid',
              gridTemplateColumns: '18px 1fr auto',
              alignItems: 'center',
              columnGap: 1,
              rowGap: 0.5,
              mb: 1.1,
            }}
          >
            <CategoryIcon category={row.category} />
            <Typography aria-hidden sx={{ fontSize: '0.78rem' }}>
              {categoryLabel(row.category)}
            </Typography>
            <Typography aria-hidden sx={{ fontFamily: MONO, fontSize: '0.7rem', color: 'rgba(255,255,255,0.92)' }}>
              {formatCount(row.count)}
              <Box component="span" sx={{ color: 'rgba(255,255,255,0.4)', ml: 0.75 }}>
                {formatShare(row.share)}
              </Box>
            </Typography>
            <Box
              aria-hidden
              sx={{ gridColumn: '2 / 4', height: 4, borderRadius: '2px', background: 'rgba(255,255,255,0.06)' }}
            >
              <Box
                sx={{ width: `${row.barPct}%`, height: '100%', borderRadius: '2px', background: ROLE.answer, opacity: 0.85 }}
              />
            </Box>
          </Box>
        ))}
      </Box>
      {moreCount > 0 && (
        <Typography sx={{ fontFamily: MONO, fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)' }}>
          + {moreCount} more {moreCount === 1 ? 'category' : 'categories'}
        </Typography>
      )}
    </Box>
  );
}

export default CategoryBars;
```

- [ ] **Step 4: Create `ComparisonBadge`**

Create `cityscope/src/components/results/ComparisonBadge.tsx`:

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { MONO, ROLE } from '../../theme';
import { compareToCity } from './comparison';

/**
 * Density against the city's average district. Both directions use the
 * answer colour: density is neither good nor bad, so it is never green or red.
 */
function ComparisonBadge({ pct, cityAvgDensity }: { pct: number | null; cityAvgDensity: number }) {
  const c = compareToCity(pct, cityAvgDensity);

  return (
    <Box
      role="img"
      aria-label={c.label}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1,
        py: 0.5,
        borderRadius: '5px',
        border: `1px solid ${alpha(ROLE.answer, 0.35)}`,
        background: alpha(ROLE.answer, 0.08),
        mb: 2,
      }}
    >
      <Typography component="span" sx={{ fontFamily: MONO, fontSize: '0.72rem', color: ROLE.answer }}>
        {c.delta ? `${c.arrow} ${c.delta}` : c.arrow}
      </Typography>
      <Typography component="span" sx={{ fontFamily: MONO, fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
        {c.context}
      </Typography>
    </Box>
  );
}

export default ComparisonBadge;
```

- [ ] **Step 5: Rebuild `DistrictStatsView` on the shared parts**

Replace the whole of `cityscope/src/components/DistrictStatsView.tsx` with:

```tsx
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useDistrictStats } from '../hooks/useDistrictStats';
import { ROLE } from '../theme';
import CategoryBars from './results/CategoryBars';
import ComparisonBadge from './results/ComparisonBadge';
import StatRow from './results/StatRow';
import { formatCount } from './results/format';

function DistrictStatsView({ cityId, districtId }: { cityId: string; districtId: string | number }) {
  const { data, isLoading, isError } = useDistrictStats(cityId, districtId);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size={20} sx={{ color: ROLE.answer }} />
      </Box>
    );
  }

  if (isError || !data) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Couldn't load district statistics.
      </Typography>
    );
  }

  return (
    <Box sx={{ mt: 0.5 }}>
      <StatRow
        stats={[
          { label: 'POIs', value: formatCount(data.poiCount) },
          { label: 'Area', value: data.areaKm2.toFixed(1), unit: 'km²' },
          { label: 'Density', value: formatCount(data.densityPerKm2), unit: '/km²' },
        ]}
      />
      {data.poiCount > 0 ? (
        <>
          <ComparisonBadge pct={data.densityVsCityPct} cityAvgDensity={data.cityAvgDensity} />
          <CategoryBars counts={data.topCategories} total={data.poiCount} />
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No POIs in this district.
        </Typography>
      )}
    </Box>
  );
}

export default DistrictStatsView;
```

- [ ] **Step 6: Verify**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npm run lint`
Expected:
- 11 files, 90 tests pass, including `colourGuard.test.ts`.
- `tsc` and lint exit 0.

- [ ] **Step 7: Commit (two commits, one concern each)**

```bash
git add cityscope/src/components/results/SectionLabel.tsx cityscope/src/components/results/StatRow.tsx cityscope/src/components/results/CategoryBars.tsx cityscope/src/components/results/ComparisonBadge.tsx
git commit -m "feat(web): shared stat row, category bars and comparison badge"
git add cityscope/src/components/DistrictStatsView.tsx
git commit -m "refactor(web): district stats on the shared results components"
```

**Live check (controller):** click Berlin Mitte.
- Three stats, POIs reading `3,350` style.
- A badge reading `▲ +NNN% vs city avg NN/km²` in cyan.
- Five bars with icons, counts and shares, then `+ N more categories`.
- A district with no POIs still shows "No POIs in this district."

---

### Task 5: Drawn area on the shared components

**Files:**
- Modify: `cityscope/src/components/DrawControls.tsx` (replace the whole file)

**Interfaces:**
- Consumes: from Task 4, `StatRow` and `CategoryBars`; from Task 2, `formatCount`.

- [ ] **Step 1: Rebuild `DrawControls`**

Replace the whole of `cityscope/src/components/DrawControls.tsx` with:

```tsx
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useDrawStore } from '../store/drawStore';
import { useIsochroneStore } from '../store/isochroneStore';
import { useRouteStore } from '../store/routeStore';
import { useCityStore } from '../store/cityStore';
import { useAreaAnalysis } from '../hooks/useAreaAnalysis';
import { ROLE } from '../theme';
import CategoryBars from './results/CategoryBars';
import StatRow from './results/StatRow';
import { formatCount } from './results/format';

function DrawControls() {
  const enabled = useDrawStore((s) => s.enabled);
  const polygon = useDrawStore((s) => s.polygon);
  const setEnabled = useDrawStore((s) => s.setEnabled);
  const requestClear = useDrawStore((s) => s.requestClear);
  const cityId = useCityStore((s) => s.selectedCity.id);
  const { data, isLoading, isError } = useAreaAnalysis(cityId, polygon);

  const handleToggle = (checked: boolean) => {
    if (checked) {
      useIsochroneStore.getState().setEnabled(false);
      useRouteStore.getState().setEnabled(false);
    }
    setEnabled(checked);
  };

  return (
    <Box sx={{ p: 1.25 }}>
      <FormControlLabel
        control={<Switch checked={enabled} onChange={(e) => handleToggle(e.target.checked)} size="small" />}
        label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Draw Area</Typography>}
        sx={{ ml: 0, mb: enabled ? 1.5 : 0 }}
      />

      {enabled && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {!polygon && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
              Click points on the map, double-click to finish.
            </Typography>
          )}

          {polygon && isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={18} sx={{ color: ROLE.answer }} />
            </Box>
          )}

          {polygon && isError && (
            <Typography variant="caption" sx={{ color: 'error.main' }}>
              Couldn't analyse this area.
            </Typography>
          )}

          {polygon && data && (
            <Box>
              <StatRow
                stats={[
                  { label: 'POIs', value: formatCount(data.poiCount) },
                  { label: 'Area', value: data.areaKm2.toFixed(1), unit: 'km²' },
                  { label: 'Density', value: formatCount(data.densityPerKm2), unit: '/km²' },
                ]}
              />
              {data.poiCount > 0 ? (
                <CategoryBars counts={data.topCategories} total={data.poiCount} />
              ) : (
                <Typography variant="body2" color="text.secondary">No POIs in this area.</Typography>
              )}
            </Box>
          )}

          {polygon && (
            // Clearing the shape is something the user does, so it takes the "you" colour.
            <Button
              size="small"
              onClick={requestClear}
              sx={{
                alignSelf: 'flex-start',
                color: ROLE.you,
                textTransform: 'none',
                fontSize: '0.75rem',
                px: 0.75,
                minWidth: 0,
                '&:hover': { background: alpha(ROLE.you, 0.08) },
              }}
            >
              Clear area
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

export default DrawControls;
```

- [ ] **Step 2: Verify**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npm run lint`
Expected: 11 files, 90 tests pass; `tsc` and lint exit 0.

- [ ] **Step 3: Commit**

```bash
git add cityscope/src/components/DrawControls.tsx
git commit -m "refactor(web): drawn-area results on the shared components"
```

**Live check (controller):** draw a polygon over central Berlin.
- The stat row and bars match the district panel's look, with "+ N more" when there are more than 5 categories.
- "Clear area" is gold and still clears the shape.
- A share-link reload restores the shape and its results.

---

### Task 6: Place list, adopted in the heatmap spotlight

**Files:**
- Create: `cityscope/src/components/results/PlaceList.tsx`
- Rewrite: `cityscope/src/components/HeatmapSpotlightCard.tsx`
- Modify: `cityscope/src/hooks/useHeatmapSpotlight.ts:14` and `:49` (drop `topPois`)

**Interfaces:**
- Consumes: from Task 2, `categoryLabel`, `formatCount` and `formatDistance`; from Task 3, `CategoryIcon`; from Task 4, `SectionLabel` and `CategoryBars`.
- Produces:
  - `export interface PlaceItem { id: number | string; name: string | null; category: string; lng: number; lat: number; meta?: string }`;
  - `<PlaceList places={ReadonlyArray<PlaceItem>} initialLimit?={number} title?={string} />`, where `initialLimit` defaults to 5.

- [ ] **Step 1: Create `PlaceList`**

Create `cityscope/src/components/results/PlaceList.tsx`:

```tsx
import { useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useMapStore } from '../../store/mapStore';
import { MONO, ROLE } from '../../theme';
import CategoryIcon from './CategoryIcon';
import SectionLabel from './SectionLabel';
import { categoryLabel, formatCount } from './format';

export interface PlaceItem {
  id: number | string;
  name: string | null;
  category: string;
  lng: number;
  lat: number;
  /** Optional right-hand detail, such as "120 m". */
  meta?: string;
}

// A camera move, not a source or layer change. This is the one map call
// components make directly, and it now lives only here.
function flyTo(place: PlaceItem) {
  useMapStore.getState().map?.flyTo({ center: [place.lng, place.lat], zoom: 16, duration: 800 });
}

/**
 * Places as rows that fly the map to the place. Shows `initialLimit` rows and
 * then a "Show all" toggle. Expanding is something the user does, so the
 * toggle takes the "you" colour.
 */
function PlaceList({
  places,
  initialLimit = 5,
  title,
}: {
  places: ReadonlyArray<PlaceItem>;
  initialLimit?: number;
  title?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (places.length === 0) return null;

  const shown = expanded ? places : places.slice(0, initialLimit);
  const canExpand = places.length > initialLimit;

  return (
    <Box>
      {title && <SectionLabel>{title}</SectionLabel>}
      <Box
        component="ul"
        sx={{ listStyle: 'none', m: 0, p: 0, maxHeight: expanded ? 220 : 'none', overflowY: expanded ? 'auto' : 'visible' }}
      >
        {shown.map((p) => {
          const name = p.name ?? 'Unnamed';
          return (
            <Box component="li" key={p.id}>
              <ButtonBase
                disableRipple
                onClick={() => flyTo(p)}
                aria-label={`${name}, ${categoryLabel(p.category)}${p.meta ? `, ${p.meta}` : ''}. Show on map`}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: 0.75,
                  py: 0.5,
                  px: 0.5,
                  borderRadius: 0.5,
                  textAlign: 'left',
                  '&:hover': { background: 'rgba(255,255,255,0.04)' },
                  '&.Mui-focusVisible': { outline: `1px solid ${alpha(ROLE.you, 0.6)}` },
                }}
              >
                <CategoryIcon category={p.category} size={13} />
                <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.86)' }}>
                  {name}
                  <Box component="span" sx={{ color: 'rgba(255,255,255,0.4)', ml: 0.75 }}>
                    {categoryLabel(p.category)}
                  </Box>
                </Typography>
                {p.meta && (
                  <Typography sx={{ fontFamily: MONO, fontSize: '0.64rem', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
                    {p.meta}
                  </Typography>
                )}
              </ButtonBase>
            </Box>
          );
        })}
      </Box>
      {canExpand && (
        <ButtonBase
          onClick={() => setExpanded((v) => !v)}
          sx={{ mt: 0.75, px: 0.5, fontSize: '0.72rem', color: ROLE.you, borderRadius: 0.5 }}
        >
          {expanded ? 'Show fewer' : `Show all ${formatCount(places.length)} places`}
        </ButtonBase>
      )}
    </Box>
  );
}

export default PlaceList;
```

- [ ] **Step 2: Drop `topPois` from the spotlight hook**

In `cityscope/src/hooks/useHeatmapSpotlight.ts`, delete the interface line:

```ts
  topPois: SpotlightPoi[];
```

and delete the return-object line:

```ts
      topPois: nearby.slice(0, 5),
```

(`PlaceList` now takes the first five itself. `allPois` is already sorted nearest first.)

- [ ] **Step 3: Rebuild the spotlight card**

Replace the whole of `cityscope/src/components/HeatmapSpotlightCard.tsx` with:

```tsx
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Slide from '@mui/material/Slide';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import PlaceIcon from '@mui/icons-material/Place';
import { alpha } from '@mui/material/styles';
import { useLayerStore } from '../store/layerStore';
import { useHeatmapStore } from '../store/heatmapStore';
import { useHeatmapSpotlight } from '../hooks/useHeatmapSpotlight';
import { INK_1, ROLE } from '../theme';
import CategoryBars from './results/CategoryBars';
import PlaceList from './results/PlaceList';
import { formatCount, formatDistance } from './results/format';

function HeatmapSpotlightCard() {
  const heatmapOn = useLayerStore((s) => s.layers.heatmap);
  const clickOrigin = useHeatmapStore((s) => s.clickOrigin);
  const spotlight = useHeatmapSpotlight();

  const visible = heatmapOn && spotlight !== null && spotlight.total > 0;

  return (
    <Slide direction="up" in={visible} mountOnEnter unmountOnExit>
      <Box
        sx={{
          position: 'absolute',
          bottom: { xs: 40, sm: 32 },
          left: 12,
          width: { xs: 'calc(100vw - 24px)', sm: 280 },
          maxWidth: 300,
          background: alpha(INK_1, 0.92),
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.25,
            py: 0.75,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PlaceIcon aria-hidden sx={{ fontSize: 14, color: ROLE.answer }} />
            <Typography sx={{ color: ROLE.answer, fontWeight: 700, fontSize: 12 }}>
              {formatCount(spotlight?.total ?? 0)} places within 300 m
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={() => useHeatmapStore.getState().setClickOrigin(null)}
            aria-label="Close spotlight"
            sx={{ color: 'rgba(255,255,255,0.4)', p: 0.25 }}
          >
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>

        {spotlight && (
          <Box sx={{ px: 1.25, py: 1, maxHeight: '60vh', overflowY: 'auto' }}>
            <CategoryBars counts={spotlight.categoryCounts} total={spotlight.total} />
            <Box sx={{ mt: 1.5 }}>
              <PlaceList
                // A new click is a new list: start collapsed again.
                key={clickOrigin ? `${clickOrigin.lng},${clickOrigin.lat}` : 'none'}
                title="Nearest"
                places={spotlight.allPois.map((p) => ({
                  id: p.id,
                  name: p.name,
                  category: p.category,
                  lng: p.lng,
                  lat: p.lat,
                  meta: formatDistance(p.distanceM),
                }))}
              />
            </Box>
          </Box>
        )}
      </Box>
    </Slide>
  );
}

export default HeatmapSpotlightCard;
```

- [ ] **Step 4: Verify**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npm run lint`
Expected: 11 files, 90 tests pass; `tsc` and lint exit 0.

- [ ] **Step 5: Commit (two commits, one concern each)**

```bash
git add cityscope/src/components/results/PlaceList.tsx
git commit -m "feat(web): shared place list that flies the map to a place"
git add cityscope/src/hooks/useHeatmapSpotlight.ts cityscope/src/components/HeatmapSpotlightCard.tsx
git commit -m "refactor(web): heatmap spotlight on category bars and the place list"
```

- [ ] **Step 6: Keep the card clear of the open sidebar** (added in pre-flight, 2026-10-02, owner's decision)

**Pre-flight finding:** on desktop the card is fully hidden. It sits at `left: 12` inside the full-width map area, and the 296 px sidebar overlays that area. Measured on `main`: the card rendered "53 places within 300m" at x=23, completely under the sidebar.

In `cityscope/src/components/HeatmapSpotlightCard.tsx`, add these two imports after the `useHeatmapSpotlight` import:

```tsx
import { useUIStore } from '../store/uiStore';
import { SIDEBAR_WIDTH } from './Sidebar';
```

add this line after `const clickOrigin = …`:

```tsx
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
```

and in the card's outer `Box` `sx`, replace:

```tsx
          left: 12,
```

with:

```tsx
          // On desktop the sidebar overlays the map, so the card rides beside
          // it, sliding with the same timing. On phones the sidebar is a
          // modal drawer, and covering the card while open is intended.
          left: { xs: 12, sm: sidebarOpen ? SIDEBAR_WIDTH + 12 : 12 },
          transition: 'left 0.24s cubic-bezier(0.4,0,0.2,1)',
```

- [ ] **Step 7: Verify**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npm run lint`
Expected: 11 files, 90 tests pass; `tsc` and lint exit 0.

- [ ] **Step 8: Commit**

```bash
git add cityscope/src/components/HeatmapSpotlightCard.tsx
git commit -m "fix(web): keep the heatmap spotlight clear of the open sidebar" -m "The card sat at left: 12 inside the full-width map area, which the 296 px sidebar overlays, so on desktop it was rendered but invisible. It now rides beside the open sidebar and slides with it; on phones the sidebar is a modal drawer, so nothing changes there."
```

**Live check (controller):** turn the heatmap on and click near Alexanderplatz.
- The header has a Place icon and reads `NN places within 300 m`.
- Bars appear, then the five nearest places with `NN m` distances.
- "Show all NN places" is gold and expands into a scrolling list.
- Clicking a row flies the map there.
- A second click on the map collapses the list again.
- **With the sidebar open, the card sits just right of it** and is fully visible. Collapsing the sidebar slides the card back to the left edge. At 375 px width the card is unchanged.

---

### Task 7: Isochrone band switcher

**Files:**
- Rewrite: `cityscope/src/components/IsochroneResultsPanel.tsx`

**Interfaces:**
- Consumes: from Task 4, `StatRow` and `CategoryBars`; from Task 6, `PlaceList`; from Task 2, `formatCount`.
- Consumes (unchanged): `useIsochronePois(isochroneData)` returns `IsochroneBandResult[]`, each `{ contour: number; poiCount: number; categoryCounts: Record<string, number>; pois: BandPoi[] }`, sorted ascending by `contour`.

The three stacked accordions become one `ToggleButtonGroup`, the band switcher, above a single view of the selected band. The theme already styles a selected `ToggleButton` in gold, which is right for a control the user operates.

- [ ] **Step 1: Rebuild the panel**

Replace the whole of `cityscope/src/components/IsochroneResultsPanel.tsx` with:

```tsx
import { useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import PlaceIcon from '@mui/icons-material/Place';
import { useIsochroneStore } from '../store/isochroneStore';
import { useIsochrone } from '../hooks/useIsochrone';
import { useIsochronePois } from '../hooks/useIsochronePois';
import { MONO, ROLE } from '../theme';
import CategoryBars from './results/CategoryBars';
import PlaceList from './results/PlaceList';
import StatRow from './results/StatRow';
import { formatCount } from './results/format';

const PROFILE_LABEL: Record<string, string> = {
  walking: 'walking',
  cycling: 'cycling',
  driving: 'driving',
};

function IsochroneResultsPanel() {
  const enabled = useIsochroneStore((s) => s.enabled);
  const origin = useIsochroneStore((s) => s.origin);
  const profile = useIsochroneStore((s) => s.profile);
  const loading = useIsochroneStore((s) => s.loading);

  const { data: isochroneData } = useIsochrone();
  const { data: bands, isLoading: bandsLoading, isError: bandsError } = useIsochronePois(isochroneData);

  // The band the user picked, if any. Until they pick one, the outermost band
  // is shown: the time they actually asked about.
  const [pickedContour, setPickedContour] = useState<number | null>(null);

  // The tool is live but the Mapbox stage has not resolved yet, so stay hidden.
  if (!enabled || origin === null || loading) return null;

  // Second async stage. Without this the whole panel would vanish while the
  // join is in flight, which reads as the feature being broken.
  if (bandsLoading) {
    return (
      <Box sx={{ mt: 1.5 }}>
        <Divider sx={{ mb: 1.5 }} />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={18} sx={{ color: ROLE.answer }} />
        </Box>
      </Box>
    );
  }

  if (bandsError) {
    return (
      <Box sx={{ mt: 1.5 }}>
        <Divider sx={{ mb: 1.5 }} />
        <Typography variant="caption" sx={{ color: 'error.main' }}>
          Couldn't analyse reachable places.
        </Typography>
      </Box>
    );
  }

  if (!bands || bands.length === 0) return null;

  const band = bands.find((b) => b.contour === pickedContour) ?? bands[bands.length - 1];

  return (
    <Box sx={{ mt: 1.5 }}>
      <Divider sx={{ mb: 1.5 }} />

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <PlaceIcon aria-hidden sx={{ fontSize: 14, color: ROLE.answer }} />
        <Typography
          variant="caption"
          sx={{ color: ROLE.answer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          Reachability by {PROFILE_LABEL[profile]}
        </Typography>
        <IconButton
          size="small"
          onClick={() => useIsochroneStore.getState().reset()}
          sx={{ ml: 'auto', color: 'text.secondary', p: 0.25 }}
          aria-label="Clear isochrone"
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      {/* Band switcher */}
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={band.contour}
        onChange={(_event, value: number | null) => {
          if (value !== null) setPickedContour(value);
        }}
        aria-label="Travel time"
        sx={{ mb: 1.5 }}
      >
        {bands.map((b) => (
          <ToggleButton
            key={b.contour}
            value={b.contour}
            sx={{ fontFamily: MONO, fontSize: '0.68rem', py: 0.4, textTransform: 'none' }}
          >
            {b.contour} min
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* The selected band */}
      <StatRow
        stats={[
          { label: 'Places', value: formatCount(band.poiCount) },
          { label: 'Categories', value: String(Object.keys(band.categoryCounts).length) },
        ]}
      />
      {band.poiCount === 0 ? (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
          No places within {band.contour} min.
        </Typography>
      ) : (
        <>
          <CategoryBars counts={band.categoryCounts} total={band.poiCount} />
          <Box sx={{ mt: 1.5 }}>
            {/* Switching band starts the list collapsed again. */}
            <PlaceList key={band.contour} title="Places" places={band.pois} />
          </Box>
        </>
      )}
    </Box>
  );
}

export default IsochroneResultsPanel;
```

- [ ] **Step 2: Verify**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npm run lint`
Expected: 11 files, 90 tests pass; `tsc` and lint exit 0.

- [ ] **Step 3: Commit**

```bash
git add cityscope/src/components/IsochroneResultsPanel.tsx
git commit -m "feat(web): isochrone results as a band switcher, outermost band first" -m "The three stacked accordions become a 5 | 10 | 15 min switcher above one view of the selected band, so the panel is shorter and each band shows its complete picture. It opens on the outermost band, the time the user asked about."
```

**Live check (controller):** run the Alexanderplatz 15-minute walk.
- The switcher reads `5 min | 10 min | 15 min`, with **15 selected** (gold).
- Places and Categories stats, then bars and a five-row place list with "Show all".
- Switching to 5 min updates every part and collapses the list.
- Changing MAX TIME to 30 rebuilds the switcher with the new contours.
- Clearing the isochrone (×) hides the panel.

---

### Task 8: Route results on the shared stat row

**Files:**
- Rewrite: `cityscope/src/components/RouteResultsPanel.tsx`

**Interfaces:**
- Consumes: from Task 4, `StatRow` and `type StatItem`; from Task 2, `distanceParts` and `formatDistance`.

- [ ] **Step 1: Rebuild the panel**

Replace the whole of `cityscope/src/components/RouteResultsPanel.tsx` with:

```tsx
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { useRoute } from '../hooks/useRoute';
import { useRouteStore } from '../store/routeStore';
import { MONO, ROLE } from '../theme';
import StatRow, { type StatItem } from './results/StatRow';
import { distanceParts, formatDistance } from './results/format';

/** "45 min", or "1h 17m" / "2h" from an hour up. */
function durationStat(seconds: number): StatItem {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return { label: 'Duration', value: String(mins), unit: 'min' };
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return { label: 'Duration', value: rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m` };
}

function maneuverArrow(type: string, modifier?: string): string {
  if (type === 'depart') return '↑';
  if (type === 'arrive') return '⚑';
  if (type === 'turn' || type === 'end of road') {
    if (modifier === 'right' || modifier === 'sharp right') return '↱';
    if (modifier === 'left' || modifier === 'sharp left') return '↰';
    if (modifier === 'uturn') return '↩';
  }
  return '↑';
}

function RouteResultsPanel() {
  const { data: routeData } = useRoute();

  if (!routeData) return null;

  const distance = distanceParts(routeData.distanceM);

  return (
    <Box sx={{ mt: 1 }}>
      <StatRow
        stats={[
          { label: 'Distance', value: distance.value, unit: distance.unit },
          durationStat(routeData.durationS),
        ]}
      />

      {/* Turn-by-turn steps */}
      <Box
        sx={{
          maxHeight: 220,
          overflowY: 'auto',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.07)',
          mb: 1,
        }}
      >
        {routeData.steps.map((step, i) => (
          <Box
            key={`${i}-${step.maneuverType}-${step.distanceM}`}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              px: 1.25,
              py: 0.75,
              borderBottom:
                i < routeData.steps.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            }}
          >
            <Typography
              sx={{
                fontFamily: MONO,
                color: ROLE.answer,
                fontSize: '0.8rem',
                minWidth: 14,
                mt: 0.1,
              }}
            >
              {maneuverArrow(step.maneuverType, step.maneuverModifier)}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'rgba(255,255,255,0.75)', flex: 1, lineHeight: 1.4 }}
            >
              {step.instruction}
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontFamily: MONO, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}
            >
              {formatDistance(step.distanceM)}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Clear button */}
      <Box sx={{ textAlign: 'center' }}>
        <IconButton
          size="small"
          onClick={() => useRouteStore.getState().reset()}
          sx={{ color: 'text.secondary', p: 0.25 }}
          aria-label="Clear route"
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
    </Box>
  );
}

export default RouteResultsPanel;
```

- [ ] **Step 2: Verify**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npm run lint`
Expected: 11 files, 90 tests pass; `tsc` and lint exit 0.

- [ ] **Step 3: Commit**

```bash
git add cityscope/src/components/RouteResultsPanel.tsx
git commit -m "refactor(web): route distance and duration on the shared stat row"
```

**Live check (controller):** plan a walk from Brandenburger Tor to Ostkreuz.
- The stat row reads `6.4 km` (a small "km") and `1h 17m`.
- The turn-by-turn list is unchanged apart from distances now reading `150 m` with a space.
- The arrows are cyan; × clears the route.

---

### Task 9: Sweep and docs

**Files:**
- Modify: `cityscope/src/theme.ts:4-8` (header comment)
- Modify: `cityscope/README.md`
- Modify: `docs/superpowers/specs/2026-09-30-ui-focused-pass-design.md` (append to the amendments)

- [ ] **Step 1: Confirm nothing the spec retires is left**

Run:

```bash
cd cityscope && grep -rn "categoryEmoji\|function Stat(" src; grep -rn "AMBER\|CYAN" src/components/results src/components/DistrictStatsView.tsx src/components/DrawControls.tsx src/components/HeatmapSpotlightCard.tsx src/components/IsochroneResultsPanel.tsx src/components/RouteResultsPanel.tsx
node -e "const fs=require('fs'),p=require('path');const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap((e)=>e.isDirectory()?walk(p.join(d,e.name)):[p.join(d,e.name)]);for(const f of walk('src'))fs.readFileSync(f,'utf8').split('\n').forEach((l,i)=>{if(/[\u{1F300}-\u{1FAFF}☕⛪]/u.test(l))console.log(f+':'+(i+1)+': '+l.trim())})"
```

The Node line scans for emoji pictographs (the U+1F300–1FAFF block, plus the old ☕ and ⛪). `grep -P` with Unicode ranges depends on the shell's locale, so Node is used instead.

Expected: **no output at all**. That means no `categoryEmoji`, no `Stat` component, no emoji pictographs, and no raw `AMBER`/`CYAN` in result components. If anything prints, fix it before continuing. The route's turn arrows (`↑ ↱ ↰ ↩ ⚑`) sit outside the emoji range on purpose and stay.

- [ ] **Step 2: Record the "components use roles" rule in the theme header**

In `cityscope/src/theme.ts`, replace:

```ts
/**
 * "Cartographer's Instrument" design tokens.
 *
 * The only file allowed to contain colour literals — src/colourGuard.test.ts
 * fails `npm test` if one appears anywhere else.
 */
```

with:

```ts
/**
 * "Cartographer's Instrument" design tokens.
 *
 * The only file allowed to contain colour literals — src/colourGuard.test.ts
 * fails `npm test` if one appears anywhere else.
 *
 * Components colour things by meaning, through ROLE below. AMBER and CYAN
 * themselves are for brand chrome only: the logo and the live readout.
 */
```

- [ ] **Step 3: Update the frontend README**

In `cityscope/README.md`:

(a) Replace the placeholder demo link line:

```markdown
🔗 **[Live Demo](https://your-demo-url.vercel.app)** &nbsp;·&nbsp; [Backend](../cityscope-backend/)
```

with:

```markdown
🔗 **[Live Demo](https://city-scope-seven.vercel.app)** &nbsp;·&nbsp; [Backend](../cityscope-backend/)
```

(b) Replace the isochrone feature bullet:

```markdown
- **Isochrone analysis** — reachability polygons (5–30 min) with per-band POI aggregation, accordion results, and fly-to on POI click
```

with:

```markdown
- **Isochrone analysis** — reachability polygons (5–30 min) with a server-side PostGIS join per band, a band switcher, and fly-to on place click
- **District statistics** — click a district for POI count, area, density against the city average, and its top categories
- **Draw & analyse** — draw any polygon and get the same statistics for it, computed in PostGIS
- **Save & share** — the whole view, including the active analysis, round-trips through a link
- **Shared results panel** — every tool shows results the same way: a stat row, category bars with shares, and a place list
```

(c) In the project tree, replace:

```text
│   ├── IsochroneResultsPanel.tsx  # Band accordions, POI list, fly-to
```

with:

```text
│   ├── IsochroneResultsPanel.tsx  # Band switcher over one band's stats, bars and places
```

then replace:

```text
│   └── HeatmapSpotlightCard.tsx   # Bottom-left — nearest POIs on heatmap click
```

with:

```text
│   ├── HeatmapSpotlightCard.tsx   # Bottom-left — nearest POIs on heatmap click
│   └── results/                   # Shared result parts: StatRow, CategoryBars, ComparisonBadge,
│                                  #   PlaceList, CategoryIcon, plus their pure, tested helpers
```

and delete the line for the hook that no longer exists:

```text
│   ├── useIsochroneResults.ts     # Aggregate POIs per isochrone band
```

- [ ] **Step 4: Record the Phase 2 deviations in the spec**

Append to the end of `docs/superpowers/specs/2026-09-30-ui-focused-pass-design.md`:

```markdown

## Amendments while planning Phase 2 (2026-10-01)

- **Every category, not `LIMIT 5`.** The approved mockup shows "+ 6 more categories" under Mitte's top 5, which needs every count. District stats and drawn-area analysis now return every category present, largest first; there are only 11. The field keeps its name, `topCategories`, so the deployed frontend and backend stay compatible in either order.
- **`PlaceList` owns "Show all".** It replaces the spotlight's own expander and the isochrone's long scroll list, and is a gold "you" action.
- **Isochrone band stats** are Places and Categories, since a band has no area to compute a density from.
- **Two small additions:** `SectionLabel` (the shared uppercase heading) and `distanceParts` (so a stat row can show "6.4" with a small "km").
- **`CategoryIcon` looks its icon up inline.** `react-hooks/static-components` rejects a JSX tag bound to a function call's result.
```

- [ ] **Step 5: Final verification**

Run:

```bash
cd cityscope && npx vitest run && npm run lint && npm run build
cd ../cityscope-backend && npx vitest run && npm run build
```

Expected:
- Frontend: 11 files, 90 tests pass; lint exits 0; the build succeeds (the existing chunk-size warning is fine).
- Backend: 4 files, 50 tests pass; `tsc` exits 0.

- [ ] **Step 6: Commit (three commits, one concern each)**

```bash
git add cityscope/src/theme.ts
git commit -m "docs(web): components colour by role; AMBER and CYAN are brand chrome"
git add cityscope/README.md
git commit -m "docs(web): README for the shared results panel and the live demo link"
git add docs/superpowers/specs/2026-09-30-ui-focused-pass-design.md
git commit -m "docs: record the phase 2 planning decisions in the spec"
```

---

## Live verification (controller, after Task 9)

Run against the owner's servers on :5173 and :3001 if they are up. Use Playwright, read-only, saving screenshots outside the repo. If the servers aren't running, hand this list to the owner.

- [ ] **"After" screenshots** of the five surfaces, matching the pre-flight "before" set.
- [ ] **District stats:** Berlin Mitte shows three stats, the badge, five bars and "+ N more categories". Selection still works, and the gold outline is still drawn.
- [ ] **Drawn area:** bars appear, "Clear area" is gold, and a share-link reload restores the shape and its results.
- [ ] **Spotlight:** bars, then the five nearest with distances, then "Show all" (gold). Clicking a row flies the map. The card sits beside the open sidebar, not under it.
- [ ] **Isochrone:** the switcher opens on the outermost band; switching updates the stats, bars and places. MAX TIME 30 rebuilds the switcher.
- [ ] **Route:** the stat row shows distance with a small unit, and duration.
- [ ] **Accessibility tree** (`browser_snapshot`):
  - bar rows read like "Restaurant: 924, 28%";
  - the badge reads "142% above the city average of 35 per km²";
  - place rows are buttons named "<name>, <Category>, <meta>. Show on map";
  - icons are hidden.
- [ ] **Keyboard:** Tab reaches the place rows and "Show all"; Enter on a row flies the map; the band switcher works with the arrow keys.
- [ ] **Mobile width** (375 px): the bars and switcher fit, and nothing scrolls sideways.
- [ ] **Console:** 0 errors, 0 warnings.
