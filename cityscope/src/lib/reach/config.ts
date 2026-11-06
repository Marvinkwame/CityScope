/**
 * How the reach layer recolours when the time or the needs change, and how tall
 * a block stands per resident.
 *
 * PROVISIONAL: these two values are placeholders until the recolouring
 * measurement in the spec's "Amendments while building Phase 2" section is
 * recorded. That measurement may change them.
 */
export const REACH_RECOLOUR: 'feature-state' | 'expression' = 'feature-state';

/** Whether the layer recolours on slider release rather than on every move. */
export const RECOLOUR_ON_RELEASE: boolean = true;

/** Extrusion height in metres for each estimated resident in a block. */
export const REACH_EXTRUSION_M_PER_RESIDENT = 0.1;
