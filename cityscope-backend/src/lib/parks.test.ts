import { describe, it, expect } from 'vitest';
import { buildParkQuery, parksFromOverpass } from './parks';

type Pt = { lat: number; lon: number };

const pt = (lat: number, lon: number): Pt => ({ lat, lon });

// Hand-built `out geom` output: ways carry a geometry array, and the members
// of a relation carry their own.
const A = pt(52.52, 13.3);
const B = pt(52.52, 13.32);
const C = pt(52.54, 13.32);
const D = pt(52.54, 13.3);

const OSM = {
  elements: [
    // A closed park way: five points, the last the same as the first.
    {
      type: 'way',
      id: 1001,
      nodes: [1, 2, 3, 4, 1],
      tags: { leisure: 'park', name: 'Square Park' },
      geometry: [pt(52.5, 13.4), pt(52.5, 13.41), pt(52.51, 13.41), pt(52.51, 13.4), pt(52.5, 13.4)],
    },
    // A park whose outline never comes back to its start.
    {
      type: 'way',
      id: 1002,
      nodes: [5, 6, 7, 8],
      tags: { leisure: 'park', name: 'Open Ended' },
      geometry: [pt(52.6, 13.5), pt(52.6, 13.51), pt(52.61, 13.51), pt(52.61, 13.5)],
    },
    // Closed, but a garden.
    {
      type: 'way',
      id: 1003,
      nodes: [9, 10, 11, 12, 9],
      tags: { leisure: 'garden', name: 'Just A Garden' },
      geometry: [pt(52.7, 13.6), pt(52.7, 13.61), pt(52.71, 13.61), pt(52.71, 13.6), pt(52.7, 13.6)],
    },
    // A park multipolygon whose one outer ring is split across two member ways.
    {
      type: 'relation',
      id: 2001,
      tags: { type: 'multipolygon', leisure: 'park', name: 'Split Park' },
      members: [
        { type: 'way', ref: 3001, role: 'outer', geometry: [A, B, C] },
        { type: 'way', ref: 3002, role: 'outer', geometry: [C, D, A] },
      ],
    },
  ],
};

describe('parksFromOverpass', () => {
  it('keeps closed park ways as polygons', () => {
    const park = parksFromOverpass(OSM).find((p) => p.osmId === 'way/1001');
    expect(park).toBeDefined();
    expect(park?.name).toBe('Square Park');
    expect(park?.geometry.type).toBe('Polygon');
    if (park?.geometry.type !== 'Polygon') return;
    expect(park.geometry.coordinates).toHaveLength(1);
    const ring = park.geometry.coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });

  it('assembles a multipolygon relation from its member ways', () => {
    const park = parksFromOverpass(OSM).find((p) => p.osmId === 'relation/2001');
    expect(park).toBeDefined();
    expect(park?.name).toBe('Split Park');
    const polygons =
      park?.geometry.type === 'MultiPolygon' ? park.geometry.coordinates : [park?.geometry.coordinates];
    expect(polygons).toHaveLength(1);
    const rings = polygons[0] ?? [];
    expect(rings).toHaveLength(1);
    const ring = rings[0];
    // Four corners, closed again at the start.
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('drops unclosed ways and non-parks', () => {
    const ids = parksFromOverpass(OSM).map((p) => p.osmId);
    expect(ids).not.toContain('way/1002');
    expect(ids).not.toContain('way/1003');
    expect(ids).not.toContain('way/3001');
    expect(ids).not.toContain('way/3002');
  });

  it('uses "way/<id>" and "relation/<id>" as osmId', () => {
    expect(parksFromOverpass(OSM).map((p) => p.osmId).sort()).toEqual(['relation/2001', 'way/1001']);
  });

  it('gives a park with no name a null name', () => {
    const osm = {
      elements: [
        {
          type: 'way',
          id: 7,
          nodes: [1, 2, 3, 1],
          tags: { leisure: 'park' },
          geometry: [pt(52.5, 13.4), pt(52.5, 13.41), pt(52.51, 13.41), pt(52.5, 13.4)],
        },
      ],
    };
    expect(parksFromOverpass(osm)[0]?.name).toBeNull();
  });

  it('returns nothing for a response with no elements', () => {
    expect(parksFromOverpass({ elements: [] })).toEqual([]);
  });
});

describe('buildParkQuery', () => {
  it('asks for parks inside the box, with their geometry', () => {
    const query = buildParkQuery('52.32,13.058,52.693,13.791');
    expect(query).toContain('nwr["leisure"="park"](52.32,13.058,52.693,13.791)');
    expect(query).toContain('out geom');
  });

  it('matches the documented query exactly', () => {
    expect(buildParkQuery('1,2,3,4')).toBe(
      '[out:json][timeout:180];\nnwr["leisure"="park"](1,2,3,4);\nout geom;',
    );
  });
});
