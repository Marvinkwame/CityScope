# UI Phase 3: Welcome Card and Loading State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a first visit, explain what CityScope does and offer three one-click examples. Turn the free-tier API cold start (8–30 s) into reading time instead of a blank map.

**Architecture:**
- **Examples are data.** Each one is a typed `ShareState`, applied with the existing `applyShareState`.
- **One flag for the card.** Whether it shows lives in `uiStore`, seeded once at load from a pure, tested `welcomeMemory` helper: storage is wrapped in try/catch, and a share-link hash wins.
- **One status for loading.** "Waking / error / ready" comes from a pure `serverStatus` helper over the city-list query plus the map instance.
- **Two places show that status:** the welcome card itself, and, for returning visitors, a small `ServerStatusPill` that appears only after 1.5 s.

**Tech Stack:** React 19, TypeScript (strict), MUI 7.3 (`Dialog`, `ButtonBase`, `keyframes` and `alpha` from `@mui/material/styles`), Zustand 5, TanStack Query 5, Vitest 4 (node environment).

**Spec:** `docs/superpowers/specs/2026-09-30-ui-focused-pass-design.md`, Phase 3, plus the approved mockup "A. Centred, map dimmed" (`.superpowers/brainstorm/793-1790804961/content/welcome-layout.html`, gitignored).

**Branch:** `ui/welcome`, from `main` after Phase 2's merge (PR #12, `fdae9c1`):
`git checkout main && git pull && git checkout -b ui/welcome`, then commit this plan:
`git add docs/superpowers/plans/2026-10-05-ui-phase-3-welcome-card.md && git commit -m "docs: implementation plan for UI phase 3 (welcome card)"`.

## Global Constraints

**Code**
- Strict TypeScript, **no `any`**. Type-only imports use `import type`.
- **All Mapbox mutation lives in `cityscope/src/components/MapView.tsx`.** Examples change the view only through the existing `applyShareState` (`cityscope/src/lib/shareState.ts`), exactly as a share link does.
- **No component rendering tests.** The spec makes jsdom and Testing Library a non-goal. Pure helpers get unit tests, and components are verified by `tsc`, lint and the controller's live checks.
- Test files are named `*.test.ts`, never `*.test.tsx`. Vitest runs in the default node environment.

**Commits**
- Commits are granular, one concern each, with **NO `Co-Authored-By` trailer** (the owner's explicit rule; it overrides any harness attribution setting).
- Stage files by explicit path; never `git add -A` or `git add .`.

**Colour**
- Colour literals are allowed **only in `cityscope/src/theme.ts`**; `src/colourGuard.test.ts` fails `npm test` otherwise. Everywhere else:
  - `rgba(255,255,255,a)` / `rgba(0,0,0,a)` are allowed;
  - tints come from `alpha(TOKEN, n)`;
  - never write `` `${TOKEN}80` ``.
- **New components colour by role:**
  - `ROLE.you` (gold) is what the user does: example icons and hover, "Explore on my own →", "Retry", the navbar Examples button;
  - `ROLE.answer` (cyan) is the "waking up" status line and its pulse dot;
  - the eyebrow "CITYSCOPE" is brand chrome and uses `AMBER`;
  - errors use the theme's `error.main`.

**Copy** (verbatim from the spec)
- Eyebrow: `CITYSCOPE`.
- Headline: `See how dense — and how reachable — a city really is.`
- Subline: `Real OpenStreetMap data for 8 cities, analysed live with PostGIS.`
- Examples:

  | Title | Kicker | Icon |
  |---|---|---|
  | `15 minutes on foot from Alexanderplatz` | `Berlin · reachability` | `DirectionsWalk` |
  | `What's inside Shoreditch?` | `London · drawn-area analysis` | `Pentagon` |
  | `Where Tokyo is busiest` | `Tokyo · density heatmap` | `BlurOn` |

  Kickers never contain POI counts, which would go stale on the next re-seed.
- Dismiss link: `Explore on my own →`.
- Loading: `Waking up the analysis server. Free hosting sleeps when idle, so this can take up to 30 s.` Error: `Couldn't reach the server` with a `Retry` button.

**Behaviour** (from the spec)
- The card shows when it has **not** been dismissed in this browser **and** the page did **not** open from a share link (a hash starting `#s=`).
- **Dismissal:**
  - It is dismissed by choosing an example, "Explore on my own", Escape, or clicking or tapping the dimmed backdrop.
  - It is stored under `localStorage['cityscope.welcomeDismissed']`.
  - Every storage read and write is wrapped in try/catch. Blocked storage means "show it", never a crash.
- The navbar **Examples** button (`Explore` icon) re-opens it.
- It is built on MUI `Dialog` (focus trap, Escape, dialog semantics), with width `min(92vw, 380px)` and examples stacked.
- **Readiness:** examples are disabled until **both** the city list and the map instance exist, because `applyShareState` needs both.
- **Returning visitors** (card closed) see a small `ServerStatusPill` with the same states, but only once loading has taken longer than **1.5 s**, so a warm server never flashes it.

**Servers**
- **Do not start, stop or restart any server.** The owner runs the frontend on :5173 and the backend on :3001.
- Live checks belong to the controller. Slow and failed `/api/cities` responses are simulated with Playwright request interception (`page.route`), never by touching the servers.

## Deviations from the spec (decided while planning, 2026-10-05)

1. **Card width:** `min(92vw, 380px)` at every size. The spec gives that value for mobile and none for desktop, and the approved mockup's card is about that wide.
2. **Pill copy:** the pill shows a shorter line, `Waking up the analysis server — up to 30 s`. The card keeps the spec's full sentence.
3. **Shared parts:**
   - `PulseDot`, a small shared component (card plus pill);
   - `useServerStatus`, a hook (card plus pill).
4. **Reloads:** the app rewrites the URL hash as you move. So reloading after any interaction counts as "opened from a share link", and the card stays away. That's acceptable: the card is for arriving, not reloading.

## Baseline (measured 2026-10-05)

Frontend: **13 files, 100 tests** (`cd cityscope && npx vitest run`). The backend is untouched.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `cityscope/src/lib/examples.ts` (+ `.test.ts`) | Create | The three examples as typed `ShareState`s |
| `cityscope/src/lib/welcomeMemory.ts` (+ `.test.ts`) | Create | Show or dismiss rules; safe storage access |
| `cityscope/src/store/uiStore.ts` | Modify | `welcomeOpen`, `openWelcome`, `closeWelcome` |
| `cityscope/src/lib/serverStatus.ts` (+ `.test.ts`) | Create | Waking / error / ready from the city list and the map |
| `cityscope/src/hooks/useServerStatus.ts` | Create | `{ status, retry }` for the card and the pill |
| `cityscope/src/components/PulseDot.tsx` | Create | The cyan "working" dot (honours reduced motion) |
| `cityscope/src/components/WelcomeDialog.tsx` | Create | The welcome card |
| `cityscope/src/components/ExamplesButton.tsx` | Create | The navbar button that re-opens the card |
| `cityscope/src/components/ServerStatusPill.tsx` | Create | Cold-start status for returning visitors |
| `cityscope/src/App.tsx`, `cityscope/src/components/Navbar.tsx` | Modify | Mount the dialog and pill; add the button |
| `cityscope/src/lib/shareState.ts`, `MapView.tsx` | Modify **only if Task 6 runs** | Explicit hydration hand-off |
| `cityscope/README.md`, the spec | Modify | Docs |

---

### Task 1: Examples as data

**Files:**
- Create: `cityscope/src/lib/examples.ts`
- Create: `cityscope/src/lib/examples.test.ts`

**Interfaces:**
- Consumes: `type ShareState`, `encodeState` and `decodeState` from `cityscope/src/lib/shareCodec.ts` (existing).
- Produces: `export interface Example { id: string; title: string; kicker: string; icon: typeof SvgIcon; state: ShareState }` and `export const EXAMPLES: ReadonlyArray<Example>`.

- [ ] **Step 1: Write the failing test**

Create `cityscope/src/lib/examples.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decodeState, encodeState } from './shareCodec';
import { EXAMPLES } from './examples';

describe('EXAMPLES', () => {
  // The decoder is strict about tool contents and drops an invalid tool
  // silently, so a typo in a hand-written example would only surface at
  // runtime as an example that "does nothing".
  it.each(EXAMPLES.map((e) => [e.id, e] as const))(
    '%s round-trips through the share codec unchanged',
    (_id, example) => {
      expect(decodeState(encodeState(example.state))).toEqual(example.state);
    },
  );

  it('has unique ids', () => {
    const ids = EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps POI counts out of the kickers, which would go stale on a re-seed', () => {
    for (const e of EXAMPLES) expect(e.kicker).not.toMatch(/\d/);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd cityscope && npx vitest run src/lib/examples.test.ts`
Expected: FAIL, because the `./examples` module can't be resolved.

- [ ] **Step 3: Implement**

Create `cityscope/src/lib/examples.ts`:

```ts
import type SvgIcon from '@mui/material/SvgIcon';
import BlurOnIcon from '@mui/icons-material/BlurOn';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import PentagonIcon from '@mui/icons-material/Pentagon';
import type { ShareState } from './shareCodec';

export interface Example {
  id: string;
  title: string;
  /** The city and the kind of analysis. No POI counts: they go stale on a re-seed. */
  kicker: string;
  icon: typeof SvgIcon;
  /** Applied with applyShareState, exactly like a shared link. */
  state: ShareState;
}

/**
 * The welcome card's one-click examples, one per analysis style. The
 * Shoreditch polygon was checked against production data: 244 POIs in
 * 0.61 km², led by restaurants, cafes, bars and pubs.
 */
export const EXAMPLES: ReadonlyArray<Example> = [
  {
    id: 'alexanderplatz-walk',
    title: '15 minutes on foot from Alexanderplatz',
    kicker: 'Berlin · reachability',
    icon: DirectionsWalkIcon,
    state: {
      v: 1,
      city: 'berlin',
      view: { lng: 13.4132, lat: 52.5219, zoom: 13.8, bearing: 0, pitch: 0 },
      layers: { roads: true, buildings: true, districts: false, heatmap: false },
      is3D: false,
      tool: {
        kind: 'isochrone',
        profile: 'walking',
        contourMinutes: [5, 10, 15],
        origin: { lng: 13.4132, lat: 52.5219 },
      },
    },
  },
  {
    id: 'shoreditch-area',
    title: "What's inside Shoreditch?",
    kicker: 'London · drawn-area analysis',
    icon: PentagonIcon,
    state: {
      v: 1,
      city: 'london',
      view: { lng: -0.0785, lat: 51.5247, zoom: 15.2, bearing: 0, pitch: 0 },
      layers: { roads: true, buildings: true, districts: false, heatmap: false },
      is3D: false,
      tool: {
        kind: 'draw',
        polygon: {
          type: 'Polygon',
          coordinates: [[
            [-0.087, 51.5265],
            [-0.0735, 51.5285],
            [-0.07, 51.523],
            [-0.08, 51.5205],
            [-0.087, 51.5265],
          ]],
        },
      },
    },
  },
  {
    id: 'tokyo-density',
    title: 'Where Tokyo is busiest',
    kicker: 'Tokyo · density heatmap',
    icon: BlurOnIcon,
    state: {
      v: 1,
      city: 'tokyo',
      view: { lng: 139.735, lat: 35.685, zoom: 11.3, bearing: 0, pitch: 0 },
      layers: { roads: true, buildings: true, districts: false, heatmap: true },
      is3D: false,
    },
  },
];
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `cd cityscope && npx vitest run src/lib/examples.test.ts`
Expected: PASS, 5 tests (3 round-trips plus 2).

- [ ] **Step 5: Verify, then commit**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false`
Expected: **14 files, 105 tests** pass; `tsc` exits 0.

```bash
git add cityscope/src/lib/examples.ts cityscope/src/lib/examples.test.ts
git commit -m "feat(web): the welcome card's three examples as share states"
```

---

### Task 2: Welcome memory and the card's store state

**Files:**
- Create: `cityscope/src/lib/welcomeMemory.ts`
- Create: `cityscope/src/lib/welcomeMemory.test.ts`
- Modify: `cityscope/src/store/uiStore.ts` (replace the whole file)

**Interfaces:**
- Produces (`welcomeMemory.ts`):
  - `WELCOME_DISMISSED_KEY = 'cityscope.welcomeDismissed'`
  - `browserStorage(): Storage | null`
  - `openedFromShareLink(hash: string): boolean`
  - `isWelcomeDismissed(storage: Pick<Storage, 'getItem'> | null): boolean`
  - `rememberWelcomeDismissed(storage: Pick<Storage, 'setItem'> | null): void`
  - `shouldShowWelcome(hash: string, storage: Pick<Storage, 'getItem'> | null): boolean`
- Produces (`uiStore`): new fields `welcomeOpen: boolean`, `openWelcome(): void` and `closeWelcome(): void`. `closeWelcome` also remembers the dismissal. The existing `sidebarOpen`, `toggleSidebar` and `setSidebarOpen` are unchanged.

- [ ] **Step 1: Write the failing test**

Create `cityscope/src/lib/welcomeMemory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  WELCOME_DISMISSED_KEY,
  openedFromShareLink,
  rememberWelcomeDismissed,
  shouldShowWelcome,
} from './welcomeMemory';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

// What private mode and strict privacy settings can do to localStorage.
const blocked: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('shouldShowWelcome', () => {
  it('greets a first visit', () => {
    expect(shouldShowWelcome('', memoryStorage())).toBe(true);
  });

  it('stays away once dismissed in this browser', () => {
    const storage = memoryStorage();
    rememberWelcomeDismissed(storage);
    expect(shouldShowWelcome('', storage)).toBe(false);
  });

  it('lets a share link land on its own view', () => {
    expect(shouldShowWelcome('#s=eyJ2IjoxfQ', memoryStorage())).toBe(false);
  });

  it('shows the card when storage throws, rather than crashing', () => {
    expect(shouldShowWelcome('', blocked)).toBe(true);
  });

  it('shows the card when there is no storage at all', () => {
    expect(shouldShowWelcome('', null)).toBe(true);
  });
});

describe('rememberWelcomeDismissed', () => {
  it('swallows a storage that refuses writes', () => {
    expect(() => rememberWelcomeDismissed(blocked)).not.toThrow();
  });

  it('stores the dismissal under the agreed key', () => {
    const storage = memoryStorage();
    rememberWelcomeDismissed(storage);
    expect(storage.getItem(WELCOME_DISMISSED_KEY)).toBe('1');
    expect(WELCOME_DISMISSED_KEY).toBe('cityscope.welcomeDismissed');
  });
});

describe('openedFromShareLink', () => {
  it('only counts the share-state hash', () => {
    expect(openedFromShareLink('#s=abc')).toBe(true);
    expect(openedFromShareLink('#other')).toBe(false);
    expect(openedFromShareLink('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd cityscope && npx vitest run src/lib/welcomeMemory.test.ts`
Expected: FAIL, because the `./welcomeMemory` module can't be resolved.

- [ ] **Step 3: Implement**

Create `cityscope/src/lib/welcomeMemory.ts`:

```ts
/**
 * Whether to greet a visitor with the welcome card.
 *
 * Every storage access is wrapped: private mode and strict privacy settings
 * can make localStorage throw (even reading the property can), and blocked
 * storage must mean "show the card", never a crash.
 */
export const WELCOME_DISMISSED_KEY = 'cityscope.welcomeDismissed';

/** localStorage, or null where it is missing or blocked. */
export function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The page was opened from a share link, so it should land on that view, not on the card. */
export function openedFromShareLink(hash: string): boolean {
  return hash.startsWith('#s=');
}

export function isWelcomeDismissed(storage: Pick<Storage, 'getItem'> | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(WELCOME_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberWelcomeDismissed(storage: Pick<Storage, 'setItem'> | null): void {
  if (!storage) return;
  try {
    storage.setItem(WELCOME_DISMISSED_KEY, '1');
  } catch {
    // Blocked storage: the card simply shows again on the next visit.
  }
}

export function shouldShowWelcome(hash: string, storage: Pick<Storage, 'getItem'> | null): boolean {
  return !openedFromShareLink(hash) && !isWelcomeDismissed(storage);
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `cd cityscope && npx vitest run src/lib/welcomeMemory.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit the helper**

```bash
git add cityscope/src/lib/welcomeMemory.ts cityscope/src/lib/welcomeMemory.test.ts
git commit -m "feat(web): remember the welcome card's dismissal, safely"
```

- [ ] **Step 6: Add the card's state to the UI store**

Replace the whole of `cityscope/src/store/uiStore.ts` with:

```ts
import { create } from 'zustand';
import { browserStorage, rememberWelcomeDismissed, shouldShowWelcome } from '../lib/welcomeMemory';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  welcomeOpen: boolean;
  openWelcome: () => void;
  closeWelcome: () => void;
}

// Default the sidebar closed on small screens so it doesn't bury the map on load.
const initialSidebarOpen =
  typeof window === 'undefined' ? true : window.innerWidth >= 600;

// Read once, at load: useShareSync starts rewriting the hash soon after, and
// only the hash the visitor arrived with says whether they followed a link.
const initialWelcomeOpen =
  typeof window === 'undefined' ? false : shouldShowWelcome(window.location.hash, browserStorage());

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: initialSidebarOpen,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  welcomeOpen: initialWelcomeOpen,
  openWelcome: () => set({ welcomeOpen: true }),
  // Every way of closing the card counts as dismissing it in this browser.
  closeWelcome: () => {
    rememberWelcomeDismissed(browserStorage());
    set({ welcomeOpen: false });
  },
}));
```

- [ ] **Step 7: Verify, then commit**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npm run lint`
Expected: **15 files, 113 tests** pass; `tsc` and lint exit 0.

```bash
git add cityscope/src/store/uiStore.ts
git commit -m "feat(web): welcome card state in the UI store"
```

---

### Task 3: Server status

**Files:**
- Create: `cityscope/src/lib/serverStatus.ts`
- Create: `cityscope/src/lib/serverStatus.test.ts`
- Create: `cityscope/src/hooks/useServerStatus.ts`

**Interfaces:**
- Consumes: `useCities()` (existing TanStack query: `data`, `isError`, `refetch`) and `useMapStore` (`map: MapboxMap | null`).
- Produces:
  - `export type ServerStatus = 'waking' | 'error' | 'ready'`;
  - `export function serverStatus(cities: { hasData: boolean; isError: boolean }, mapReady: boolean): ServerStatus`;
  - `export function useServerStatus(): { status: ServerStatus; retry: () => void }`.

- [ ] **Step 1: Write the failing test**

Create `cityscope/src/lib/serverStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serverStatus } from './serverStatus';

describe('serverStatus', () => {
  it('is waking while the city list is still loading', () => {
    expect(serverStatus({ hasData: false, isError: false }, true)).toBe('waking');
  });

  it('is an error when the city list request failed', () => {
    expect(serverStatus({ hasData: false, isError: true }, true)).toBe('error');
  });

  it('reports the error even before the map exists', () => {
    expect(serverStatus({ hasData: false, isError: true }, false)).toBe('error');
  });

  it('is ready only with both the city list and the map', () => {
    expect(serverStatus({ hasData: true, isError: false }, true)).toBe('ready');
  });

  it('keeps waking while the map is still being created', () => {
    expect(serverStatus({ hasData: true, isError: false }, false)).toBe('waking');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd cityscope && npx vitest run src/lib/serverStatus.test.ts`
Expected: FAIL, because the `./serverStatus` module can't be resolved.

- [ ] **Step 3: Implement the helper**

Create `cityscope/src/lib/serverStatus.ts`:

```ts
/**
 * What a visitor is waiting on. The API runs on a free tier that sleeps when
 * idle, so the first request can take 8–30 s. The examples (and share links)
 * need both the city list and the map, so "ready" means both have arrived.
 */
export type ServerStatus = 'waking' | 'error' | 'ready';

export function serverStatus(
  cities: { hasData: boolean; isError: boolean },
  mapReady: boolean,
): ServerStatus {
  if (cities.hasData) return mapReady ? 'ready' : 'waking';
  return cities.isError ? 'error' : 'waking';
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `cd cityscope && npx vitest run src/lib/serverStatus.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the hook**

Create `cityscope/src/hooks/useServerStatus.ts`:

```ts
import { useCities } from './useCities';
import { useMapStore } from '../store/mapStore';
import { serverStatus, type ServerStatus } from '../lib/serverStatus';

/** The cold-start status, shared by the welcome card and the status pill. */
export function useServerStatus(): { status: ServerStatus; retry: () => void } {
  const { data, isError, refetch } = useCities();
  const mapReady = useMapStore((s) => s.map !== null);
  return {
    status: serverStatus({ hasData: data !== undefined, isError }, mapReady),
    retry: () => {
      void refetch();
    },
  };
}
```

- [ ] **Step 6: Verify, then commit**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npm run lint`
Expected: **16 files, 118 tests** pass; `tsc` and lint exit 0.

```bash
git add cityscope/src/lib/serverStatus.ts cityscope/src/lib/serverStatus.test.ts cityscope/src/hooks/useServerStatus.ts
git commit -m "feat(web): cold-start status from the city list and the map"
```

---

### Task 4: The welcome card and the navbar Examples button

**Files:**
- Create: `cityscope/src/components/PulseDot.tsx`
- Create: `cityscope/src/components/WelcomeDialog.tsx`
- Create: `cityscope/src/components/ExamplesButton.tsx`
- Modify: `cityscope/src/App.tsx` (mount the dialog)
- Modify: `cityscope/src/components/Navbar.tsx` (add the button)

**Interfaces:**
- Consumes:
  - from Task 1, `EXAMPLES` and `type Example`;
  - from Task 2, `useUIStore`'s `welcomeOpen`, `openWelcome` and `closeWelcome`;
  - from Task 3, `useServerStatus()`;
  - existing: `applyShareState(state, map, cities)` from `../lib/shareState`, `useCities()`, and `useMapStore.getState().map`.
- Produces: `<PulseDot />`, which Task 5 reuses.

- [ ] **Step 1: Create `PulseDot`**

Create `cityscope/src/components/PulseDot.tsx`:

```tsx
import Box from '@mui/material/Box';
import { alpha, keyframes } from '@mui/material/styles';
import { ROLE } from '../theme';

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 ${alpha(ROLE.answer, 0.45)}; }
  100% { box-shadow: 0 0 0 6px ${alpha(ROLE.answer, 0)}; }
`;

/** A small cyan dot that pulses while the app is working. Decorative. */
function PulseDot() {
  return (
    <Box
      aria-hidden
      sx={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        flexShrink: 0,
        background: ROLE.answer,
        animation: `${pulse} 1.6s ease-out infinite`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    />
  );
}

export default PulseDot;
```

- [ ] **Step 2: Create `WelcomeDialog`**

Create `cityscope/src/components/WelcomeDialog.tsx`:

```tsx
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useCities } from '../hooks/useCities';
import { useServerStatus } from '../hooks/useServerStatus';
import { EXAMPLES, type Example } from '../lib/examples';
import { applyShareState } from '../lib/shareState';
import { useMapStore } from '../store/mapStore';
import { useUIStore } from '../store/uiStore';
import { AMBER, DISPLAY, INK, INK_2, MONO, ROLE } from '../theme';
import PulseDot from './PulseDot';

const TITLE_ID = 'welcome-title';

/**
 * The first-visit card: what CityScope is, three one-click examples, and the
 * cold-start status. It needs no server, so it appears before the API answers
 * and turns the free-tier wake-up into reading time.
 */
function WelcomeDialog() {
  const open = useUIStore((s) => s.welcomeOpen);
  const close = useUIStore((s) => s.closeWelcome);
  const { data: cities } = useCities();
  const { status, retry } = useServerStatus();
  const ready = status === 'ready';

  const choose = (example: Example) => {
    const map = useMapStore.getState().map;
    if (!map || !cities) return;
    applyShareState(example.state, map, cities);
    close();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      aria-labelledby={TITLE_ID}
      slotProps={{
        backdrop: { sx: { background: alpha(INK, 0.62), backdropFilter: 'blur(1.5px)' } },
        paper: {
          sx: {
            width: 'min(92vw, 380px)',
            m: 0,
            p: 2.25,
            background: INK_2,
            backgroundImage: 'none',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
          },
        },
      }}
    >
      <Typography sx={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '1.6px', color: AMBER }}>
        CITYSCOPE
      </Typography>
      <Typography
        id={TITLE_ID}
        component="h2"
        sx={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: '1.3rem', lineHeight: 1.2, mt: 0.75, mb: 0.75 }}
      >
        See how dense — and how reachable — a city really is.
      </Typography>
      <Typography sx={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.45, mb: 1.75 }}>
        Real OpenStreetMap data for 8 cities, analysed live with PostGIS.
      </Typography>

      <Box component="ul" role="list" aria-label="Examples" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.75 }}>
        {EXAMPLES.map((example) => {
          const Icon = example.icon;
          return (
            <li key={example.id}>
              <ButtonBase
                disabled={!ready}
                onClick={() => choose(example)}
                sx={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: '22px 1fr',
                  columnGap: 1.1,
                  rowGap: 0.25,
                  alignItems: 'center',
                  justifyContent: 'stretch',
                  textAlign: 'left',
                  px: 1.1,
                  py: 1,
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '7px',
                  transition: 'opacity 0.2s, border-color 0.15s, background 0.15s',
                  '&.Mui-disabled': { opacity: 0.55 },
                  '&:hover': { borderColor: alpha(ROLE.you, 0.45), background: alpha(ROLE.you, 0.06) },
                  '&.Mui-focusVisible': { outline: `1px solid ${alpha(ROLE.you, 0.6)}` },
                }}
              >
                <Icon aria-hidden sx={{ gridRow: '1 / 3', fontSize: 20, color: ROLE.you }} />
                <Typography component="span" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  {example.title}
                </Typography>
                <Typography
                  component="span"
                  sx={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.3px', color: 'rgba(255,255,255,0.45)' }}
                >
                  {example.kicker}
                </Typography>
              </ButtonBase>
            </li>
          );
        })}
      </Box>

      <Box role="status" aria-live="polite" sx={{ mt: 1.5, minHeight: 20 }}>
        {status === 'waking' && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ pt: '5px' }}>
              <PulseDot />
            </Box>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.62rem', lineHeight: 1.5, color: ROLE.answer }}>
              Waking up the analysis server. Free hosting sleeps when idle, so this can take up to 30 s.
            </Typography>
          </Box>
        )}
        {status === 'error' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.62rem', color: 'error.main' }}>
              Couldn't reach the server
            </Typography>
            <Button
              size="small"
              onClick={retry}
              sx={{ color: ROLE.you, textTransform: 'none', minWidth: 0, px: 0.75, fontSize: '0.72rem' }}
            >
              Retry
            </Button>
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
        <Button
          size="small"
          onClick={close}
          sx={{
            color: ROLE.you,
            textTransform: 'none',
            fontFamily: MONO,
            fontSize: '0.68rem',
            '&:hover': { background: alpha(ROLE.you, 0.08) },
          }}
        >
          Explore on my own →
        </Button>
      </Box>
    </Dialog>
  );
}

export default WelcomeDialog;
```

**Lint note:** `const Icon = example.icon` is a property load, which `react-hooks/static-components` accepts; it only rejects a component that comes from a function call. If lint does flag it, render the icon as `<Box component={example.icon} aria-hidden sx={{ … }} />` instead, and record the change.

- [ ] **Step 3: Mount it**

In `cityscope/src/App.tsx`:
- add `import WelcomeDialog from './components/WelcomeDialog';` after the `GeoSearch` import;
- add `<WelcomeDialog />` on the line after `<FeaturePanel />`.

- [ ] **Step 4: Verify, then commit**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npm run lint`
Expected: 16 files, 118 tests pass (including the colour guard); `tsc` and lint exit 0.

```bash
git add cityscope/src/components/PulseDot.tsx cityscope/src/components/WelcomeDialog.tsx cityscope/src/App.tsx
git commit -m "feat(web): welcome card with three examples and the cold-start status"
```

- [ ] **Step 5: Create `ExamplesButton`**

Create `cityscope/src/components/ExamplesButton.tsx`:

```tsx
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ExploreIcon from '@mui/icons-material/Explore';
import { alpha } from '@mui/material/styles';
import { useUIStore } from '../store/uiStore';
import { ROLE } from '../theme';

/** Re-opens the welcome card, so its examples are never more than a click away. */
function ExamplesButton() {
  const openWelcome = useUIStore((s) => s.openWelcome);
  return (
    <Tooltip title="Examples">
      <IconButton
        onClick={openWelcome}
        size="small"
        aria-label="Show examples"
        sx={{
          color: 'rgba(255,255,255,0.55)',
          flexShrink: 0,
          '&:hover': { color: ROLE.you, background: alpha(ROLE.you, 0.08) },
        }}
      >
        <ExploreIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

export default ExamplesButton;
```

- [ ] **Step 6: Put it in the navbar**

In `cityscope/src/components/Navbar.tsx`:
- add `import ExamplesButton from './ExamplesButton';` after the `ShareButton` import;
- immediately **before** the existing lines

  ```tsx
          {/* Copy shareable link */}
          <ShareButton />
  ```

  insert:

  ```tsx
          {/* Re-open the welcome card's examples */}
          <ExamplesButton />
  ```

- [ ] **Step 7: Verify, then commit**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npm run lint`
Expected: 16 files, 118 tests pass; `tsc` and lint exit 0.

```bash
git add cityscope/src/components/ExamplesButton.tsx cityscope/src/components/Navbar.tsx
git commit -m "feat(web): navbar button that re-opens the examples"
```

**Live check (controller).** Use Playwright against the owner's :5173. Clear `localStorage` and load with no hash. To simulate the cold start, delay or fail `**/api/cities` with `page.route`.

**First visit:**
- The card is centred over a dimmed map, with the exact copy.
- Examples are disabled at 0.55 opacity, with the cyan pulsing "Waking up…" line, while `/api/cities` is delayed.
- They become clickable once it answers.

**Failure and retry:**
- With `/api/cities` aborted, the card shows "Couldn't reach the server" and Retry.
- Removing the route and clicking Retry brings the examples to life.

**Each example applies completely:**
- **Alexanderplatz:** an isochrone with three cyan bands, and the band switcher on 15 min.
- **Shoreditch:** London, a gold polygon, and area bars.
- **Tokyo:** chosen **while viewing Berlin**, it must arrive with the heatmap on at the example's view. This is the spec's cross-city risk. If the view is lost, the heatmap is off, or the map flies to Tokyo's default view, **run Task 6**.

**Dismissal:**
- Escape, a backdrop click, "Explore on my own" and an example each close the card.
- After a reload with the hash cleared, it stays closed.

**Other ways in:**
- A `#s=` share link never shows it.
- The navbar Examples button re-opens it.
- At 375 px the card fits (`min(92vw, 380px)`), and tapping the backdrop closes it.

**Console:** 0 errors.

---

### Task 5: Status pill for returning visitors

**Files:**
- Create: `cityscope/src/components/ServerStatusPill.tsx`
- Modify: `cityscope/src/App.tsx` (mount the pill)

**Interfaces:**
- Consumes: from Task 3, `useServerStatus()`; from Task 2, `useUIStore`'s `welcomeOpen`; from Task 4, `PulseDot`.

- [ ] **Step 1: Create the pill**

Create `cityscope/src/components/ServerStatusPill.tsx`:

```tsx
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useServerStatus } from '../hooks/useServerStatus';
import { useUIStore } from '../store/uiStore';
import { INK_1, MONO, ROLE } from '../theme';
import PulseDot from './PulseDot';

/** Only a noticeable wait earns the pill, so a warm server never flashes it. */
const SHOW_AFTER_MS = 1500;

/**
 * The cold-start status for visitors who don't see the welcome card. While
 * the card is open it shows the same status itself, so the pill stays away.
 */
function ServerStatusPill() {
  const welcomeOpen = useUIStore((s) => s.welcomeOpen);
  const { status, retry } = useServerStatus();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (status !== 'waking') return;
    const timer = setTimeout(() => setSlow(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (welcomeOpen || status === 'ready') return null;
  if (status === 'waking' && !slow) return null;

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'absolute',
        left: '50%',
        bottom: { xs: 40, sm: 32 },
        transform: 'translateX(-50%)',
        zIndex: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.75,
        maxWidth: 'calc(100vw - 24px)',
        borderRadius: '999px',
        background: alpha(INK_1, 0.92),
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
      }}
    >
      {status === 'waking' ? (
        <>
          <PulseDot />
          <Typography sx={{ fontFamily: MONO, fontSize: '0.64rem', color: ROLE.answer, whiteSpace: 'nowrap' }}>
            Waking up the analysis server — up to 30 s
          </Typography>
        </>
      ) : (
        <>
          <Typography sx={{ fontFamily: MONO, fontSize: '0.64rem', color: 'error.main', whiteSpace: 'nowrap' }}>
            Couldn't reach the server
          </Typography>
          <Button
            size="small"
            onClick={retry}
            sx={{ color: ROLE.you, textTransform: 'none', minWidth: 0, px: 0.75, py: 0, fontSize: '0.7rem' }}
          >
            Retry
          </Button>
        </>
      )}
    </Box>
  );
}

export default ServerStatusPill;
```

- [ ] **Step 2: Mount it**

In `cityscope/src/App.tsx`:
- add `import ServerStatusPill from './components/ServerStatusPill';` after the `WelcomeDialog` import;
- inside the `<Box component="main" …>`, add `<ServerStatusPill />` on the line after `<HeatmapSpotlightCard />`.

- [ ] **Step 3: Verify, then commit**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npm run lint`
Expected: 16 files, 118 tests pass; `tsc` and lint exit 0.

```bash
git add cityscope/src/components/ServerStatusPill.tsx cityscope/src/App.tsx
git commit -m "feat(web): cold-start status pill for returning visitors"
```

**Live check (controller).** Set `localStorage['cityscope.welcomeDismissed'] = '1'` before loading.
- **Warm server:** no pill ever appears.
- **`/api/cities` delayed 5 s:** the pill appears after about 1.5 s, bottom-centre, cyan, and disappears when the cities arrive.
- **`/api/cities` aborted:** "Couldn't reach the server" and Retry; Retry recovers.
- **With the card open:** no pill.

---

### Task 6 (contingency): explicit hydration hand-off

**Run this task only if Task 4's live check shows the cross-city example losing its state.** That means the Tokyo example chosen while viewing Berlin arrives without the heatmap, or at Tokyo's default view instead of the example's. If the check passes, skip it, and say so in the Task 7 docs.

**Why it could fail:**
- `applyShareState` clears its `hydrating` flag on the next macrotask (`setTimeout 0`).
- MapView's city-change effect skips its reset only if it runs while the flag is still set.
- For a click, React flushes effects synchronously, so it should be in time. The spec still asks for a live check, not an assumption.

**Files:**
- Modify: `cityscope/src/lib/shareState.ts`
- Modify: `cityscope/src/components/MapView.tsx` (the "Fly to city on change" effect)

- [ ] **Step 1: Let MapView end the hydration itself**

In `cityscope/src/lib/shareState.ts`:

(a) After `export const isHydrating = (): boolean => hydrating;`, add:

```ts
/** MapView calls this once its city-change effect has seen, and skipped, the hydration. */
export function endHydration(): void {
  hydrating = false;
}
```

(b) In `applyShareState`, replace the first two statements:

```ts
  hydrating = true;

  const city = cities.find((c) => c.id === state.city);
  if (city) useCityStore.getState().setCity(city);
```

with:

```ts
  hydrating = true;

  const city = cities.find((c) => c.id === state.city);
  const cityChanges = city !== undefined && city.id !== useCityStore.getState().selectedCity.id;
  if (city) useCityStore.getState().setCity(city);
```

(c) Replace the final block:

```ts
  // Clear the flag on the next macrotask, after React has flushed the
  // city-change effect (which reads isHydrating() and bails).
  setTimeout(() => {
    hydrating = false;
  }, 0);
```

with:

```ts
  // When the city changes, MapView's city-change effect ends the hydration
  // itself, after skipping its reset, however late React runs it. When it
  // doesn't, no such effect will run, so end it on the next macrotask.
  if (!cityChanges) setTimeout(endHydration, 0);
```

- [ ] **Step 2: Hand off in MapView**

In `cityscope/src/components/MapView.tsx`:
- add `endHydration` to the existing import: `import { endHydration, isHydrating } from '../lib/shareState';`;
- in the "Fly to city on change" effect, replace `if (isHydrating()) return;` with:

  ```ts
      if (isHydrating()) {
        // The city came from a share link or an example: keep its view and tools.
        isInitialMountRef.current = false;
        endHydration();
        return;
      }
  ```

  The order matters. This branch sits **after** the existing `if (!map || !mapReady) return;`, so a hydration that happens before the map has loaded is handed off when `mapReady` flips. `isInitialMountRef` is cleared because this run *is* the first run, and leaving it set would swallow the next real city change.

- [ ] **Step 3: Verify, then commit**

Run: `cd cityscope && npx vitest run && npx tsc -p tsconfig.app.json --noEmit --incremental false && npm run lint`
Expected: 16 files, 118 tests pass; `tsc` and lint exit 0.

```bash
git add cityscope/src/lib/shareState.ts cityscope/src/components/MapView.tsx
git commit -m "fix(web): MapView ends a cross-city hydration itself" -m "applyShareState cleared its flag on the next macrotask and relied on React running MapView's city-change effect first. Choosing an example in another city showed that timing doesn't hold, so MapView now ends the hydration once it has skipped its reset."
```

**Live check (controller):**
- Tokyo from Berlin keeps the example's view and heatmap.
- A share link for another city still restores on page load.
- Choosing a city manually afterwards still flies there and resets the tools.

---

### Task 7: Docs

**Files:**
- Modify: `cityscope/README.md`
- Modify: `docs/superpowers/specs/2026-09-30-ui-focused-pass-design.md` (append)

- [ ] **Step 1: README feature bullet**

In `cityscope/README.md`, insert after the line starting `- **Shared results panel**`:

```markdown
- **Welcome card** — a first visit gets three one-click examples (stored share links) and turns the free-tier API's cold start into reading time; returning visitors get a small status pill instead, and the navbar's Examples button re-opens the card
```

- [ ] **Step 2: README project tree**

In the project tree, add these lines next to their siblings, keeping the `#` column aligned:

**components/**
- after the `ShareButton.tsx` line:

  ```text
  │   ├── ExamplesButton.tsx         # Navbar button that re-opens the welcome card
  ```

- after the `HeatmapSpotlightCard.tsx` line:

  ```text
  │   ├── WelcomeDialog.tsx          # First-visit card: three examples and the cold-start status
  │   ├── ServerStatusPill.tsx       # Cold-start status for returning visitors, after 1.5 s
  │   ├── PulseDot.tsx               # The cyan "working" dot (honours reduced motion)
  ```

**hooks/**, after the `useShareSync.ts` line:

```text
│   ├── useServerStatus.ts         # Waking / error / ready, with a retry
```

If `useShareSync.ts` is drawn with `└──` as the last entry, switch it to `├──` and make the new line `└──`.

**lib/**, among the other lib lines:

```text
│   ├── examples.ts                # The welcome card's examples, as share states
│   ├── welcomeMemory.ts           # Show or dismiss rules for the card; storage-safe
│   ├── serverStatus.ts            # Cold-start status from the city list and the map
```

**store/**: change the `uiStore.ts` comment to `# Sidebar open / closed; welcome card open / closed`.

- [ ] **Step 3: Spec amendments**

Append to the end of `docs/superpowers/specs/2026-09-30-ui-focused-pass-design.md`:

```markdown

## Amendments while planning and building Phase 3 (2026-10-05)

- **Card width** is `min(92vw, 380px)` at every size; the spec gave only the mobile value, and the approved mockup's card is about that wide.
- **The pill's copy is shorter** ("Waking up the analysis server — up to 30 s"); the card keeps the full sentence.
- **Shared parts:** `PulseDot` (the cyan working dot, still under reduced motion) and `useServerStatus` (card and pill).
- **Reloads count as share links.** The app rewrites the hash as you move, so reloading after any interaction lands on that view rather than the card. The card is for arriving, not reloading.
```

Then append **exactly one** of these two bullets, matching what the controller tells you about the cross-city live check:

- If Task 6 did **not** run:

  ```markdown
  - **The cross-city risk did not materialise.** Choosing the Tokyo example while viewing Berlin keeps the example's view and heatmap: React flushes the click's effects synchronously, so `applyShareState`'s next-macrotask flag is still set when MapView's city-change effect runs. Verified live.
  ```

- If Task 6 **did** run:

  ```markdown
  - **The cross-city risk was real, and fixed.** Choosing the Tokyo example while viewing Berlin lost the example's state, so `MapView` now ends the hydration itself (`endHydration`) after skipping its city-change reset, instead of relying on a next-macrotask timer.
  ```

- [ ] **Step 4: Final verification**

Run: `cd cityscope && npx vitest run && npm run lint && npm run build`
Expected: 16 files, 118 tests pass; lint exits 0; the build succeeds (the existing chunk-size warning is fine).

- [ ] **Step 5: Commit (two commits, one concern each)**

```bash
git add cityscope/README.md
git commit -m "docs(web): README for the welcome card and the status pill"
git add docs/superpowers/specs/2026-09-30-ui-focused-pass-design.md
git commit -m "docs: record the phase 3 decisions in the spec"
```

---

## Live verification (controller, after Task 7)

Use Playwright, read-only, against the owner's servers. Take "after" screenshots, saved outside the repo, of:
- the welcome card while waking, and when ready;
- each example after it's applied;
- the pill while waking, and in the error state;
- the card at 375 px.

Then confirm:
- The accessibility tree shows the dialog named by its headline, the examples as a list of buttons, and the status line announced.
- Keyboard: Tab moves through the examples, "Explore on my own" and Retry; Enter applies an example; Escape closes the card; focus returns to the page.
- The console has 0 errors.
