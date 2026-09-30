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
