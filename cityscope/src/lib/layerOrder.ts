import {
  DISTRICT_FILL_LAYER_ID,
  ISOCHRONE_FILL_LAYER_ID,
  ISOCHRONE_LINE_LAYER_ID,
  REACH_LINKS_LAYER_ID,
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
 * One exception: the everyday reach fill and columns are an answer drawn
 * beneath the district layers (the owner's decision, so the outlines stay
 * readable over the blocks). `reachBeforeId` slots them under the district fill,
 * and they are left out of ANSWER_LAYER_IDS, so district layers added later
 * still land above them through `contextBeforeId`. They also sit beneath the
 * isochrone and route. The lines to the selected block's nearest places are an
 * ordinary answer layer.
 *
 * Pure: takes the `map.getStyle().layers` array, never touches the map.
 */

/** The slice of a Mapbox style layer this module reads. */
type StackLayer = { id: string; type: string };

/**
 * The analysis-result layers: the isochrone fill and line, the route, and the
 * lines to the selected reach block's nearest places.
 */
export const ANSWER_LAYER_IDS: ReadonlyArray<string> = [
  ISOCHRONE_FILL_LAYER_ID,
  ISOCHRONE_LINE_LAYER_ID,
  ROUTE_LAYER_ID,
  REACH_LINKS_LAYER_ID,
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

/**
 * `beforeId` for the reach fill and columns: the district fill when it is on the
 * map, so the outlines draw above the blocks; failing that, the slot context
 * uses, beneath any answer layer.
 */
export function reachBeforeId(layers: ReadonlyArray<StackLayer>): string | undefined {
  return layers.find((l) => l.id === DISTRICT_FILL_LAYER_ID)?.id ?? contextBeforeId(layers);
}
