# District Statistics Panel (PostGIS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a district runs real PostGIS spatial SQL on the backend and shows an analytical breakdown (POI count, area, density per km², top categories, and density vs. the city average) in the existing FeaturePanel.

**Architecture:** Add a generated `geom` column + GiST indexes to `pois` so the DB can do spatial joins. A single new endpoint `GET /api/cities/:cityId/districts/:id/stats` computes everything in one CTE query (`ST_Contains`, `ST_Area` on geography, `GROUP BY`, plus a city-average baseline). The derived density/percentage arithmetic lives in a small, unit-tested pure helper. The frontend captures the clicked district's id, fetches stats via TanStack Query, and renders them as a branch inside the existing FeaturePanel (which already handles desktop drawer / mobile bottom-sheet).

**Tech Stack:** Node + Express 5, `pg`, PostGIS (Neon), TypeScript NodeNext ESM, Vitest (new), React 19, TanStack Query 5, Zustand 5, MUI 7.

**City-average definition (pinned):** city average density = the mean of each district's (POIs ÷ km²), one district = one sample.

**Prerequisites already done:** `VITE_API_URL=http://localhost:3001` set; backend running; all 8 cities seeded (`pois` + `districts` populated on Neon `neondb`).

---

## File Structure

- `cityscope-backend/src/scripts/migrations/002-add-poi-geometry.sql` — new migration (generated geom + GiST indexes).
- `cityscope-backend/src/scripts/migrate.ts` — new tiny runner to apply a migration file via the pool.
- `cityscope-backend/src/lib/statsMath.ts` — new pure helpers (`densityPerKm2`, `pctVsAverage`). Unit-tested.
- `cityscope-backend/src/lib/statsMath.test.ts` — new Vitest unit tests.
- `cityscope-backend/src/routes/districts.ts` — add `GET /:id/stats` handler.
- `cityscope-backend/package.json` / `tsconfig.json` — add Vitest + `migrate` script; exclude tests from tsc.
- `cityscope/src/store/featureStore.ts` — add optional `featureId`.
- `cityscope/src/components/MapView.tsx` — capture `winner.feature.id` at click time.
- `cityscope/src/hooks/useDistrictStats.ts` — new hook + `DistrictStats` type.
- `cityscope/src/components/DistrictStatsView.tsx` — new presentational stats view.
- `cityscope/src/components/FeaturePanel.tsx` — branch on `type === 'districts'`.

---

## Task 1: POI geometry migration

**Files:**
- Create: `cityscope-backend/src/scripts/migrations/002-add-poi-geometry.sql`
- Create: `cityscope-backend/src/scripts/migrate.ts`
- Modify: `cityscope-backend/package.json` (add `migrate` script)

- [ ] **Step 1: Write the migration SQL**

Create `cityscope-backend/src/scripts/migrations/002-add-poi-geometry.sql`:

```sql
-- Migration 002: give POIs a real geometry so PostGIS can do spatial joins.
-- A generated STORED column keeps geom in sync with lat/lng automatically,
-- so the existing /pois endpoint and all Turf code keep working unchanged.

ALTER TABLE pois ADD COLUMN IF NOT EXISTS geom geometry(Point,4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED;

CREATE INDEX IF NOT EXISTS idx_pois_geom ON pois USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_districts_geom ON districts USING GIST (geom);
```

- [ ] **Step 2: Write the migration runner**

Create `cityscope-backend/src/scripts/migrate.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: tsx src/scripts/migrate.ts <migration-file.sql>');
    process.exit(1);
  }
  const sql = readFileSync(path.resolve(__dirname, 'migrations', file), 'utf-8');
  console.log(`Applying migration ${file} ...`);
  await pool.query(sql);
  console.log('Migration applied.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the `migrate` script**

In `cityscope-backend/package.json`, add to `"scripts"` (after `"seed:all"`):

```json
    "migrate": "tsx src/scripts/migrate.ts",
```

- [ ] **Step 4: Apply the migration**

Run (from `cityscope-backend`):

```bash
npm run migrate -- 002-add-poi-geometry.sql
```

Expected output:
```
Applying migration 002-add-poi-geometry.sql ...
Migration applied.
```

- [ ] **Step 5: Verify the geometry populated**

Run (from `cityscope-backend`):

```bash
npx tsx -e "import pool from './src/db.ts'; const r = await pool.query('SELECT count(*) AS total, count(geom) AS with_geom FROM pois'); console.log(r.rows[0]); await pool.end();"
```

Expected: `total` and `with_geom` are equal and > 0 (every POI got a geometry). If your shell mangles the quotes, instead run `npm run migrate -- 002-add-poi-geometry.sql` again (idempotent) and trust the column — `GENERATED ALWAYS ... STORED` always backfills.

- [ ] **Step 6: Commit**

```bash
git add cityscope-backend/src/scripts/migrations/002-add-poi-geometry.sql cityscope-backend/src/scripts/migrate.ts cityscope-backend/package.json
git commit -m "feat(backend): add POI geometry column + GiST indexes (migration 002)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Pure stats helper (TDD with Vitest)

**Files:**
- Modify: `cityscope-backend/package.json` (add vitest + test script)
- Modify: `cityscope-backend/tsconfig.json` (exclude test files from build)
- Create: `cityscope-backend/src/lib/statsMath.ts`
- Test: `cityscope-backend/src/lib/statsMath.test.ts`

- [ ] **Step 1: Install Vitest**

Run (from `cityscope-backend`):

```bash
npm i -D vitest
```

- [ ] **Step 2: Add test script + exclude tests from tsc**

In `cityscope-backend/package.json` `"scripts"`, add:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

In `cityscope-backend/tsconfig.json`, change the `exclude` array to:

```json
  "exclude": ["node_modules", "dist", "src/scripts", "src/**/*.test.ts"]
```

- [ ] **Step 3: Write the failing test**

Create `cityscope-backend/src/lib/statsMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { densityPerKm2, pctVsAverage } from './statsMath';

describe('densityPerKm2', () => {
  it('divides count by area', () => {
    expect(densityPerKm2(100, 4)).toBe(25);
  });
  it('returns 0 when area is 0 (no divide-by-zero)', () => {
    expect(densityPerKm2(100, 0)).toBe(0);
  });
});

describe('pctVsAverage', () => {
  it('is positive above the average', () => {
    expect(pctVsAverage(42, 30)).toBeCloseTo(40);
  });
  it('is negative below the average', () => {
    expect(pctVsAverage(24, 30)).toBeCloseTo(-20);
  });
  it('returns null when the average is 0', () => {
    expect(pctVsAverage(10, 0)).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run (from `cityscope-backend`): `npm test`
Expected: FAIL — cannot resolve `./statsMath` (module does not exist yet).

- [ ] **Step 5: Write the minimal implementation**

Create `cityscope-backend/src/lib/statsMath.ts`:

```ts
/** POIs per km². Guards against divide-by-zero. */
export function densityPerKm2(count: number, areaKm2: number): number {
  return areaKm2 > 0 ? count / areaKm2 : 0;
}

/**
 * Percentage difference of `value` vs `average`.
 * Returns null when the average is 0 (no meaningful comparison).
 */
export function pctVsAverage(value: number, average: number): number | null {
  if (!(average > 0)) return null;
  return ((value - average) / average) * 100;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run (from `cityscope-backend`): `npm test`
Expected: PASS — 5 tests passing.

- [ ] **Step 7: Commit**

```bash
git add cityscope-backend/src/lib/statsMath.ts cityscope-backend/src/lib/statsMath.test.ts cityscope-backend/package.json cityscope-backend/package-lock.json cityscope-backend/tsconfig.json
git commit -m "test(backend): add stats math helpers with Vitest

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: District stats endpoint

**Files:**
- Modify: `cityscope-backend/src/routes/districts.ts`

- [ ] **Step 1: Import the helper**

At the top of `cityscope-backend/src/routes/districts.ts`, below the existing imports, add:

```ts
import { densityPerKm2, pctVsAverage } from '../lib/statsMath.js';
```

- [ ] **Step 2: Add the `/:id/stats` handler**

In `cityscope-backend/src/routes/districts.ts`, add this handler **before** the existing `districtRouter.get('/:id', ...)` handler (so the two-segment route is registered explicitly):

```ts
districtRouter.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const cityId = req.params.cityId ?? 'berlin';
    const { id } = req.params;

    const result = await pool.query(
      `WITH target AS (
         SELECT id, name, geom, ST_Area(geom::geography) / 1e6 AS area_km2
         FROM districts
         WHERE id = $1 AND city_id = $2
       ),
       inside AS (
         SELECT p.category
         FROM pois p, target t
         WHERE p.city_id = $2 AND ST_Contains(t.geom, p.geom)
       ),
       per_district AS (
         SELECT count(p.id)::float / NULLIF(ST_Area(d.geom::geography) / 1e6, 0) AS density
         FROM districts d
         LEFT JOIN pois p ON p.city_id = d.city_id AND ST_Contains(d.geom, p.geom)
         WHERE d.city_id = $2
         GROUP BY d.id, d.geom
       )
       SELECT
         t.id        AS district_id,
         t.name      AS name,
         t.area_km2  AS area_km2,
         (SELECT count(*) FROM inside)                 AS poi_count,
         (SELECT AVG(density) FROM per_district)       AS city_avg_density,
         COALESCE((
           SELECT json_agg(tc) FROM (
             SELECT category, count(*)::int AS count
             FROM inside GROUP BY category ORDER BY count(*) DESC LIMIT 3
           ) tc
         ), '[]'::json)                                AS top_categories
       FROM target t`,
      [id, cityId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'District not found' });
      return;
    }

    const row = result.rows[0];
    const poiCount = Number(row.poi_count);
    const areaKm2 = Number(row.area_km2);
    const cityAvgDensity = row.city_avg_density === null ? 0 : Number(row.city_avg_density);
    const density = densityPerKm2(poiCount, areaKm2);
    const pct = pctVsAverage(density, cityAvgDensity);

    res.json({
      districtId: row.district_id,
      name: row.name,
      poiCount,
      areaKm2: Number(areaKm2.toFixed(3)),
      densityPerKm2: Number(density.toFixed(1)),
      topCategories: row.top_categories,
      cityAvgDensity: Number(cityAvgDensity.toFixed(1)),
      densityVsCityPct: pct === null ? null : Number(pct.toFixed(1)),
    });
  } catch (err) {
    console.error('Failed to fetch district stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 3: Verify the endpoint against seeded data**

Ensure the backend is running (`npm run dev` in `cityscope-backend`). Run:

```bash
curl -sS http://localhost:3001/api/cities/berlin/districts/1/stats
```

Expected: JSON like `{"districtId":1,"name":"Reinickendorf","poiCount":<n>,"areaKm2":<a>,"densityPerKm2":<d>,"topCategories":[{"category":"...","count":...}],"cityAvgDensity":<c>,"densityVsCityPct":<p>}` with `poiCount > 0`.

Also verify the 404 path:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/cities/berlin/districts/999999/stats
```
Expected: `404`.

- [ ] **Step 4: Commit**

```bash
git add cityscope-backend/src/routes/districts.ts
git commit -m "feat(backend): district stats endpoint (ST_Contains / ST_Area / city avg)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Capture the clicked district id on the frontend

**Files:**
- Modify: `cityscope/src/store/featureStore.ts`
- Modify: `cityscope/src/components/MapView.tsx`

- [ ] **Step 1: Add `featureId` to the selected-feature type**

In `cityscope/src/store/featureStore.ts`, update the `SelectedFeature` interface to add `featureId`:

```ts
export interface SelectedFeature {
  type: LayerId;
  sourceLayerId: string;
  featureId?: string | number;
  name: string | null;
  coordinates: { lng: number; lat: number };
  properties: Record<string, unknown>;
}
```

- [ ] **Step 2: Capture `winner.feature.id` at click time**

In `cityscope/src/components/MapView.tsx`, find the `useFeatureStore.getState().selectFeature({ ... })` call inside the map click handler. Add a `featureId` line so it reads:

```ts
        useFeatureStore.getState().selectFeature({
          type: winner.type,
          sourceLayerId: winner.feature.layer!.id,
          featureId: winner.feature.id,
          name,
          coordinates: { lng: e.lngLat.lng, lat: e.lngLat.lat },
          properties: props,
        });
```

- [ ] **Step 3: Verify it type-checks**

Run (from `cityscope`): `npm run build`
Expected: build succeeds (TypeScript passes). `winner.feature.id` is typed `string | number | undefined` on a Mapbox feature, matching the optional `featureId`.

- [ ] **Step 4: Commit**

```bash
git add cityscope/src/store/featureStore.ts cityscope/src/components/MapView.tsx
git commit -m "feat(map): capture clicked feature id for district lookups

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: District stats hook + type

**Files:**
- Create: `cityscope/src/hooks/useDistrictStats.ts`

- [ ] **Step 1: Write the hook and DTO type**

Create `cityscope/src/hooks/useDistrictStats.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface DistrictCategoryCount {
  category: string;
  count: number;
}

export interface DistrictStats {
  districtId: number;
  name: string;
  poiCount: number;
  areaKm2: number;
  densityPerKm2: number;
  topCategories: DistrictCategoryCount[];
  cityAvgDensity: number;
  densityVsCityPct: number | null;
}

async function fetchDistrictStats(
  cityId: string,
  districtId: string | number,
): Promise<DistrictStats> {
  const res = await fetch(
    `${API_BASE}/api/cities/${cityId}/districts/${districtId}/stats`,
  );
  if (!res.ok) throw new Error(`Failed to fetch district stats: ${res.status}`);
  return res.json() as Promise<DistrictStats>;
}

export function useDistrictStats(
  cityId: string,
  districtId: string | number | undefined,
) {
  return useQuery({
    queryKey: ['district-stats', cityId, districtId],
    queryFn: () => fetchDistrictStats(cityId, districtId as string | number),
    enabled: districtId !== undefined && districtId !== null,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Verify it type-checks**

Run (from `cityscope`): `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add cityscope/src/hooks/useDistrictStats.ts
git commit -m "feat(frontend): useDistrictStats query hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: District stats panel UI

**Files:**
- Create: `cityscope/src/components/DistrictStatsView.tsx`
- Modify: `cityscope/src/components/FeaturePanel.tsx`

- [ ] **Step 1: Build the stats view component**

Create `cityscope/src/components/DistrictStatsView.tsx`:

```tsx
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useDistrictStats } from '../hooks/useDistrictStats';
import { AMBER, MONO } from '../theme';

const DOWN = '#E08A6B';

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Box>
      <Typography
        sx={{ fontFamily: MONO, fontSize: '1.3rem', fontWeight: 600, color: 'rgba(255,255,255,0.92)', lineHeight: 1.1 }}
      >
        {value}
        {unit ? (
          <Box component="span" sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', ml: 0.5 }}>
            {unit}
          </Box>
        ) : null}
      </Typography>
      <Typography
        sx={{ fontFamily: MONO, fontSize: '0.55rem', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', mt: 0.25 }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function DistrictStatsView({ cityId, districtId }: { cityId: string; districtId: string | number }) {
  const { data, isLoading, isError } = useDistrictStats(cityId, districtId);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size={20} sx={{ color: AMBER }} />
      </Box>
    );
  }

  if (isError || !data) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Couldn’t load district statistics.
      </Typography>
    );
  }

  const pct = data.densityVsCityPct;
  const hasPois = data.poiCount > 0;
  const pctColor = pct === null ? 'rgba(255,255,255,0.5)' : pct >= 0 ? AMBER : DOWN;
  const pctLabel =
    pct === null ? '~ city avg' : `${pct > 0 ? '+' : ''}${pct.toFixed(0)}% vs city avg`;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 3, mt: 0.5, mb: 2 }}>
        <Stat label="POIs" value={String(data.poiCount)} />
        <Stat label="Area" value={data.areaKm2.toFixed(1)} unit="km²" />
        <Stat label="Density" value={data.densityPerKm2.toFixed(0)} unit="/km²" />
      </Box>

      {hasPois ? (
        <>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              px: 1,
              py: 0.5,
              borderRadius: '5px',
              border: `1px solid ${pctColor}55`,
              background: `${pctColor}14`,
              mb: 2,
            }}
          >
            <Typography sx={{ fontFamily: MONO, fontSize: '0.72rem', color: pctColor }}>
              {pctLabel}
            </Typography>
          </Box>

          <Typography
            sx={{ fontFamily: MONO, fontSize: '0.55rem', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', mb: 1 }}
          >
            Top categories
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {data.topCategories.map((c) => (
              <Chip
                key={c.category}
                label={`${c.category} · ${c.count}`}
                size="small"
                sx={{
                  fontFamily: MONO,
                  fontSize: '0.7rem',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.8)',
                }}
              />
            ))}
          </Box>
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

- [ ] **Step 2: Branch the FeaturePanel for districts**

In `cityscope/src/components/FeaturePanel.tsx`:

(a) Add imports below the existing imports:

```ts
import { useCityStore } from '../store/cityStore';
import DistrictStatsView from './DistrictStatsView';
```

(b) Inside `FeaturePanel`, add near the other hooks (after the `useMediaQuery` line):

```ts
  const cityId = useCityStore((s) => s.selectedCity.id);
```

(c) Replace the entire block that starts with the `Properties` header `<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>` and ends with the closing of the `filteredProps` conditional (the `) : (` … `)}` for "No properties available") with this conditional:

```tsx
          {selectedFeature.type === 'districts' && selectedFeature.featureId != null ? (
            <DistrictStatsView cityId={cityId} districtId={selectedFeature.featureId} />
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography
                  sx={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.25)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Properties
                </Typography>
                <Box sx={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
              </Box>

              {Object.keys(filteredProps).length > 0 ? (
                <Table size="small">
                  <TableBody>
                    {Object.entries(filteredProps).map(([key, value]) => (
                      <TableRow key={key}>
                        <TableCell
                          sx={{
                            color: 'text.secondary',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            pl: 0,
                          }}
                        >
                          {key}
                        </TableCell>
                        <TableCell
                          sx={{
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            pr: 0,
                            fontFamily: MONO,
                            fontSize: '0.78rem',
                          }}
                        >
                          {String(value)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No properties available
                </Typography>
              )}
            </>
          )}
```

- [ ] **Step 3: Verify the build**

Run (from `cityscope`): `npm run build`
Expected: build succeeds (no unused imports — `Table`/`TableBody`/`TableRow`/`TableCell` are still used in the else branch).

- [ ] **Step 4: Manual verification in the browser**

Start the dev server, ensure the backend is running and data is seeded. In the app: select Berlin → toggle **Districts** on → click inside a district polygon (away from roads). The FeaturePanel (right drawer on desktop, bottom sheet on mobile) should show the district name, POI / Area / Density stats, a "+X% vs city avg" chip (gold if above average, warm-red if below), and top-category chips. Click a sparsely-populated district to confirm the "No POIs in this district." path if applicable.

- [ ] **Step 5: Commit**

```bash
git add cityscope/src/components/DistrictStatsView.tsx cityscope/src/components/FeaturePanel.tsx
git commit -m "feat(frontend): district statistics panel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes & deviations from the spec

- **Tests:** the spec mentioned a frontend helper test, but the frontend has no test runner and the testable logic (density + percentage) now lives in the backend `statsMath` helper, which Vitest covers. Adding a whole frontend test runner is out of scope here; the frontend formatting is trivial display logic. The endpoint's spatial SQL is verified manually against seeded data (Task 3, Step 3) rather than via an automated integration test against the live Neon DB (which would be flaky and pollute the portfolio database).
- **Derived math placement:** `ST_Contains` / `ST_Area` / `GROUP BY` / the city-average baseline all run in PostGIS; only the final density division and percentage are computed in the (unit-tested) TS helper. This keeps the impressive spatial work in SQL while making the arithmetic testable without a DB.
- **`docs/` is untracked** and has been wiped by `git clean` before — commit this plan if you want it preserved.
