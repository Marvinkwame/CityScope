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
  'components/GeoSearch.tsx',
  'components/HeatmapSpotlightCard.tsx',
  'components/IsochroneControls.tsx',
  'components/IsochroneResultsPanel.tsx',
  'components/MapView.tsx',
  'components/Navbar.tsx',
  'components/RouteControls.tsx',
  'components/RouteResultsPanel.tsx',
  'components/Sidebar.tsx',
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

/** Path relative to src/, with forward slashes on every OS. */
const relPath = (file: string) => relative(SRC, file).split(sep).join('/');

function offendersIn(file: string): string[] {
  const rel = relPath(file);
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .flatMap((line, i) => colourLiterals(line).map((c) => `${rel}:${i + 1}  ${c}`));
}

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
