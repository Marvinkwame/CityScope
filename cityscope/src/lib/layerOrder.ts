import {
  ISOCHRONE_FILL_LAYER_ID,
  ISOCHRONE_LINE_LAYER_ID,
  ROUTE_LAYER_ID,
} from '../constants/layerConfig';

/**
 * Where each colour role's map layers sit, bottom to top:
 *
 *   basemap and roads  <  context  <  answer  <  basemap labels  <  you
 *   (heatmap, districts)  (isochrone, route)   (selected district, gl-draw)
 *
 * Layers are created lazily, in whatever order the user triggers things, so the
 * order is enforced with `beforeId` at creation rather than by creation order:
 * a context layer added after a result slides in under it, and a result added
 * after context lands between the context and the labels. "You" layers pass no
 * `beforeId`, so they stay on top.
 *
 * Pure: takes the `map.getStyle().layers` array, never touches the map.
 */

/** The slice of a Mapbox style layer this module reads. */
type StackLayer = { id: string; type: string };

/** The analysis-result layers: the isochrone fill and line, and the route. */
export const ANSWER_LAYER_IDS: ReadonlyArray<string> = [
  ISOCHRONE_FILL_LAYER_ID,
  ISOCHRONE_LINE_LAYER_ID,
  ROUTE_LAYER_ID,
];

/**
 * `beforeId` for an answer layer: the first label (symbol) layer, so results sit
 * above context but under the basemap's labels. `undefined` appends on top.
 */
export function answerBeforeId(layers: ReadonlyArray<StackLayer>): string | undefined {
  return layers.find((l) => l.type === 'symbol')?.id;
}

/**
 * `beforeId` for a context layer: the lowest answer layer already on the map, so
 * context stays beneath results; failing that, the same slot answers use.
 */
export function contextBeforeId(layers: ReadonlyArray<StackLayer>): string | undefined {
  return layers.find((l) => ANSWER_LAYER_IDS.includes(l.id))?.id ?? answerBeforeId(layers);
}
