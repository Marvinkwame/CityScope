/**
 * How the reach layer recolours when the time or the needs change, and how tall
 * a block stands per resident.
 *
 * The first two are set by the recolouring measurement of 2026-11-06 (the
 * spec's "Amendments while building Phase 2", Recolouring): feature state drew
 * London's new colours in 173–197 ms against 330–488 ms for an expression, and
 * either takes several frames on a mid-range phone, so the map recolours when
 * the slider is released.
 */
export const REACH_RECOLOUR: 'feature-state' | 'expression' = 'feature-state';

/** Whether the layer recolours on slider release rather than on every move. */
export const RECOLOUR_ON_RELEASE: boolean = true;

/** Extrusion height in metres for each estimated resident in a block. */
export const REACH_EXTRUSION_M_PER_RESIDENT = 0.1;
