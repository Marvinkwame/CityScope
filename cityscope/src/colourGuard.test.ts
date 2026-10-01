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
// A token with hex digits glued on, like `${AMBER}80`: a hand-rolled tint that
// only works while the token happens to be a 6-digit hex. Use alpha() instead.
const TOKEN_HEX_SUFFIX = /\$\{[^}]+\}[0-9a-fA-F]{2}\b/g;
const NEUTRAL_HEX = new Set(['#fff', '#ffffff', '#000', '#000000']);


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
  for (const m of line.matchAll(TOKEN_HEX_SUFFIX)) found.push(m[0]);
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

  it('flags a token with hex digits glued on as a tint', () => {
    expect(colourLiterals('borderColor: `${AMBER}80`')).toEqual(['${AMBER}80']);
  });

  it('ignores template literals that are not tints', () => {
    expect(colourLiterals('width: `${size}px`')).toEqual([]);
    expect(colourLiterals('transition: `${n}00ms`')).toEqual([]);
  });

  it('ignores hashes that are not colours', () => {
    expect(colourLiterals("if (hash.startsWith('#s=')) return;")).toEqual([]);
    expect(colourLiterals("document.querySelector('#root')")).toEqual([]);
  });
});

describe('colour guard', () => {
  it('finds no colour literals outside theme.ts', () => {
    expect(sourceFiles(SRC).flatMap(offendersIn)).toEqual([]);
  });
});
