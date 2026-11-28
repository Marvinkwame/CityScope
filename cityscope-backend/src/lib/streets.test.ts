import { describe, it, expect } from 'vitest';
import {
  WALKABLE_HIGHWAYS,
  StreetsCollector,
  buildStreetQuery,
  isOverpassDate,
  isWalkable,
  isWalkableArea,
  parseStreetsFile,
  tilesOf,
} from './streets';

interface WayElement {
  type: 'way';
  id: number;
  nodes: number[];
  geometry: { lat: number; lon: number }[];
  tags: Record<string, string>;
}

// Node n sits at lat 52 + n/1000, lon 13 + n/1000, so every node has its own spot.
function way(id: number, nodes: number[], tags: Record<string, string> = { highway: 'residential' }): WayElement {
  return {
    type: 'way',
    id,
    nodes,
    geometry: nodes.map((n) => ({ lat: 52 + n / 1000, lon: 13 + n / 1000 })),
    tags,
  };
}

const answer = (elements: unknown[]) => ({ elements });

describe('isWalkable', () => {
  it('keeps streets and paths and drops what a walker cannot use', () => {
    expect(isWalkable({ highway: 'residential' })).toBe(true);
    expect(isWalkable({ highway: 'trunk' })).toBe(true);
    expect(isWalkable({ highway: 'motorway' })).toBe(false);
    expect(isWalkable({ highway: 'footway', foot: 'no' })).toBe(false);
    expect(isWalkable({ highway: 'service', access: 'private' })).toBe(false);
    expect(isWalkable({ highway: 'service', access: 'private', foot: 'yes' })).toBe(true);
    expect(isWalkable({ highway: 'track', access: 'no', foot: 'designated' })).toBe(true);
    expect(isWalkable({ highway: 'construction' })).toBe(false);
    expect(isWalkable({ route: 'ferry' })).toBe(false);
  });
});

describe('foot=private, walkable areas and dates', () => {
  it('closes a way tagged foot=private, whatever access says', () => {
    expect(isWalkable({ highway: 'footway', foot: 'private' })).toBe(false);
    expect(isWalkable({ highway: 'footway', foot: 'private', access: 'yes' })).toBe(false);
    expect(isWalkable({ highway: 'footway', access: 'private', foot: 'yes' })).toBe(true);
  });
  it('recognises a walkable area: walkable, area=yes, closed, four or more entries', () => {
    expect(isWalkableArea({ highway: 'pedestrian', area: 'yes' }, [1, 2, 3, 1])).toBe(true);
    expect(isWalkableArea({ highway: 'pedestrian', area: 'yes' }, [1, 2, 1])).toBe(false);
    expect(isWalkableArea({ highway: 'pedestrian', area: 'yes' }, [1, 2, 3, 4])).toBe(false);
    expect(isWalkableArea({ highway: 'pedestrian' }, [1, 2, 3, 1])).toBe(false);
    expect(isWalkableArea({ highway: 'motorway', area: 'yes' }, [1, 2, 3, 1])).toBe(false);
    expect(isWalkableArea({ highway: 'footway', area: 'yes', foot: 'private' }, [1, 2, 3, 1])).toBe(false);
  });
  it('accepts only full UTC timestamps as an Overpass date', () => {
    expect(isOverpassDate('2026-11-21T02:08:48Z')).toBe(true);
    expect(isOverpassDate('2026-11-21')).toBe(false);
    expect(isOverpassDate('2026-11-21T02:08:48.123Z')).toBe(false);
    expect(isOverpassDate('yesterday')).toBe(false);
  });
  it('dates the query when asked, and leaves it as it was otherwise', () => {
    const tile = { south: 52.4, west: 13.3, north: 52.5, east: 13.4 };
    expect(buildStreetQuery(tile, '2026-11-21T02:08:48Z')).toContain('[date:"2026-11-21T02:08:48Z"]');
    expect(buildStreetQuery(tile)).not.toContain('[date:');
  });
});

describe('tilesOf', () => {
  it('covers the bounds and clips the last row', () => {
    const tiles = tilesOf({ south: 0, west: 0, north: 0.25, east: 0.1 }, 0.1);
    expect(tiles).toHaveLength(3);
    expect(tiles[2]).toEqual({ south: 0.2, west: 0, north: 0.25, east: 0.1 });
  });

  it('goes row by row from the south-west and clips the east edge', () => {
    const tiles = tilesOf({ south: 0, west: 0, north: 0.2, east: 0.15 }, 0.1);
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toEqual({ south: 0, west: 0, north: 0.1, east: 0.1 });
    expect(tiles[1]).toEqual({ south: 0, west: 0.1, north: 0.1, east: 0.15 });
    expect(tiles[2].south).toBe(0.1);
  });
});

describe('buildStreetQuery', () => {
  it('asks for the walkable ways in the tile with their nodes and geometry', () => {
    const q = buildStreetQuery({ south: 52.5, west: 13.3, north: 52.6, east: 13.4 });
    expect(q).toContain('(52.5,13.3,52.6,13.4)');
    expect(q).toContain('out body geom');
    for (const h of WALKABLE_HIGHWAYS) expect(q).toContain(h);
    expect(q).not.toContain('motorway');
  });
});

describe('StreetsCollector', () => {
  it('counts a way returned by two tiles once and keeps its shared nodes', () => {
    const c = new StreetsCollector();
    c.addOverpassAnswer(answer([way(10, [1, 2, 3])]));
    c.addOverpassAnswer(answer([way(10, [1, 2, 3]), way(11, [3, 4])]));
    const f = c.toFile();
    expect(f.ways).toHaveLength(2);
    expect(f.nodeCount).toBe(4);
    expect(f.ways[0][2]).toBe(f.ways[1][0]); // node 3 shared
  });

  it('sorts nodes by OSM id and rounds coordinates to 7 decimals', () => {
    const w = way(1, [9, 5]);
    w.geometry = [
      { lat: 52.123456789, lon: 13.987654321 },
      { lat: 52.5, lon: 13.5 },
    ];
    const c = new StreetsCollector();
    c.addOverpassAnswer(answer([w]));
    const f = c.toFile();
    // node 5 sorts before node 9
    expect(f.coords).toEqual([13.5, 52.5, 13.9876543, 52.1234568]);
    expect(f.ways).toEqual([[1, 0]]);
  });

  it('sorts ways by OSM way id', () => {
    const c = new StreetsCollector();
    c.addOverpassAnswer(answer([way(20, [3, 4]), way(10, [1, 2])]));
    expect(c.toFile().ways).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('drops a non-walkable way and a one-node way, and reports the counts', () => {
    const c = new StreetsCollector();
    const counts = c.addOverpassAnswer(
      answer([way(1, [1, 2]), way(2, [3, 4], { highway: 'motorway' }), way(3, [5]), { type: 'node', id: 7 }]),
    );
    expect(counts).toEqual({ ways: 3, kept: 1, areas: 0, footPrivate: 0 });
    const f = c.toFile();
    expect(f.ways).toHaveLength(1);
    expect(f.nodeCount).toBe(2);
  });

  it('records walkable areas by index and counts foot=private drops once per way', () => {
    const c = new StreetsCollector();
    const elements = [
      way(30, [1, 2, 3, 1], { highway: 'pedestrian', area: 'yes' }),
      way(20, [3, 4]),
      way(10, [5, 6], { highway: 'footway', foot: 'private' }),
      way(11, [7, 8], { highway: 'motorway', foot: 'private' }),
    ];
    expect(c.addOverpassAnswer(answer(elements))).toEqual({ ways: 4, kept: 2, areas: 1, footPrivate: 1 });
    // The same private way in a neighbouring tile is not counted again.
    expect(c.addOverpassAnswer(answer(elements)).footPrivate).toBe(0);
    const f = c.toFile();
    expect(f.version).toBe(2);
    expect(f.ways).toHaveLength(2);
    expect(f.areas).toEqual([1]); // way 30 sorts after way 20
  });

  it('does not count foot=private on a way that access already closed', () => {
    const c = new StreetsCollector();
    const counts = c.addOverpassAnswer(
      answer([
        way(1, [1, 2], { highway: 'footway', foot: 'private', access: 'private' }),
        way(2, [3, 4], { highway: 'footway', foot: 'private', access: 'no' }),
      ]),
    );
    expect(counts).toEqual({ ways: 2, kept: 0, areas: 0, footPrivate: 0 });
    expect(c.toFile().ways).toHaveLength(0);
  });

  it('rejects an answer with no elements array', () => {
    expect(() => new StreetsCollector().addOverpassAnswer({})).toThrow();
  });
});

describe('parseStreetsFile', () => {
  it('round-trips a collected file', () => {
    const c = new StreetsCollector();
    c.addOverpassAnswer(answer([way(10, [1, 2, 3]), way(11, [3, 4])]));
    const f = c.toFile();
    expect(parseStreetsFile(JSON.stringify(f))).toEqual(f);
  });

  it('reads a version 1 file as version 2 with no areas', () => {
    const v1 = { version: 1, nodeCount: 2, coords: [1, 2, 3, 4], ways: [[0, 1]] };
    expect(parseStreetsFile(JSON.stringify(v1))).toEqual({ ...v1, version: 2, areas: [] });
  });

  it('validates the areas list', () => {
    const base = { version: 2, nodeCount: 3, coords: [0, 0, 1, 0, 1, 1], ways: [[0, 1, 2, 0], [0, 1], [1, 2, 0, 1]] };
    const parse = (areas: number[]) => parseStreetsFile(JSON.stringify({ ...base, areas }));
    expect(parse([0]).areas).toEqual([0]);
    expect(() => parse([3])).toThrow(/area index/);
    expect(() => parse([-1])).toThrow(/area index/);
    expect(() => parse([1])).toThrow(/not closed/);
    expect(() => parse([0, 0])).toThrow(/ascending/);
    expect(() => parse([2, 0])).toThrow(/ascending/);
  });

  it('throws for a bad coords length', () => {
    const bad = { version: 1, nodeCount: 2, coords: [1, 2, 3], ways: [[0, 1]] };
    expect(() => parseStreetsFile(JSON.stringify(bad))).toThrow();
  });

  it('throws for a way index at or beyond nodeCount', () => {
    const bad = { version: 1, nodeCount: 2, coords: [1, 2, 3, 4], ways: [[0, 2]] };
    expect(() => parseStreetsFile(JSON.stringify(bad))).toThrow();
  });
});
