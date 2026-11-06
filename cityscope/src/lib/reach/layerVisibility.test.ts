import { describe, expect, it } from 'vitest';
import { reachLayerVisibility } from './layerVisibility';

describe('reachLayerVisibility', () => {
  it('shows the flat fill in 2D and the columns in 3D', () => {
    expect(reachLayerVisibility({ enabled: true, ready: true, is3D: false })).toEqual({
      fill: true,
      extrusion: false,
      selection: true,
      hideBuildingExtrusion: true,
    });
    expect(reachLayerVisibility({ enabled: true, ready: true, is3D: true })).toMatchObject({
      fill: false,
      extrusion: true,
    });
  });

  it('shows nothing and hides no buildings when off', () => {
    expect(reachLayerVisibility({ enabled: false, ready: true, is3D: true })).toEqual({
      fill: false,
      extrusion: false,
      selection: false,
      hideBuildingExtrusion: false,
    });
  });

  it('hides the 3D buildings as soon as it is on, before its own layers are ready', () => {
    expect(reachLayerVisibility({ enabled: true, ready: false, is3D: true })).toEqual({
      fill: false,
      extrusion: false,
      selection: false,
      hideBuildingExtrusion: true,
    });
  });
});
