import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import CategoryIcon from '../components/results/CategoryIcon';
import { categoryLabel } from '../components/results/format';
import { INK, ROLE } from '../theme';

export type PinKind = 'origin' | 'a' | 'b' | 'search';

const SHADOW = '0 2px 6px rgba(0,0,0,0.5)';

/** Screen-reader names. Mapbox's Marker adds role="img" and only defaults the label if none is set. */
const PIN_LABELS: Record<PinKind, string> = {
  origin: 'Isochrone origin',
  a: 'Route start (A)',
  b: 'Route end (B)',
  search: 'Search result',
};

/**
 * DOM elements for map markers. Pins the user placed use the "you" colour and
 * shape tells them apart; result pins (a block's nearest places) use the
 * answer colour:
 *   origin — solid dot (isochrone start)
 *   a / b  — lettered disc (route endpoints)
 *   search — ring with a centre dot (geocoded address)
 *   category pin — disc with a place's category icon (see createCategoryPin)
 */
export function createPin(kind: PinKind): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-label', PIN_LABELS[kind]);

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

/**
 * A 22 px answer-colour disc with a category icon, for a place a block reaches.
 * The icon is a React root; `dispose` unmounts it on a timeout because MapView
 * calls it from effect cleanups, which run inside React's commit, where a
 * synchronous unmount logs an error.
 */
export function createCategoryPin(category: string): { element: HTMLDivElement; dispose: () => void } {
  const element = document.createElement('div');
  element.setAttribute('aria-label', categoryLabel(category));
  element.style.cssText =
    `width:22px;height:22px;border-radius:50%;box-sizing:border-box;background:${ROLE.answer};` +
    `border:2px solid ${INK};display:flex;align-items:center;justify-content:center;` +
    `box-shadow:${SHADOW};`;
  const root = createRoot(element);
  root.render(createElement(CategoryIcon, { category, size: 13, colour: INK }));
  return { element, dispose: () => setTimeout(() => root.unmount(), 0) };
}
