export interface ReachLayerVisibility {
  fill: boolean;
  extrusion: boolean;
  selection: boolean;
  hideBuildingExtrusion: boolean;
}

/**
 * Which reach layers show: the flat fill in 2D, the columns in 3D, and the
 * selected block's outline in either, once the switch is on and the payload has
 * arrived. The 3D buildings hide as soon as the switch is on, payload or not,
 * because `applyLayerVisibility` reads the store and cannot see the query.
 */
export function reachLayerVisibility(s: { enabled: boolean; ready: boolean; is3D: boolean }): ReachLayerVisibility {
  const shown = s.enabled && s.ready;
  return {
    fill: shown && !s.is3D,
    extrusion: shown && s.is3D,
    selection: shown,
    hideBuildingExtrusion: s.enabled,
  };
}
