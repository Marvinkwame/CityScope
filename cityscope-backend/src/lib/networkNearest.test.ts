import { describe, expect, it } from 'vitest';
import type { StreetsFile } from './streets';
import { buildStreetGraph, haversineMetres } from './streetGraph';
import { NodeIndex } from './nodeIndex';
import { FAR_FROM_NETWORK_METRES, joinBlocks, joinStats, nearestByStreet } from './networkNearest';
import type { PlaceInput } from './networkNearest';

// About 1 m of latitude, and of longitude at latitude 0.
const M = 1 / 111_195;

function file(points: [number, number][], ways: number[][]): StreetsFile {
  return { version: 1, nodeCount: points.length, coords: points.flat(), ways };
}

function setup(points: [number, number][], ways: number[][]) {
  const graph = buildStreetGraph(file(points, ways));
  return { graph, index: new NodeIndex(graph) };
}

const r5 = (v: number): number => Math.round(v * 1e5) / 1e5;

/**
 * The river. West bank street x = 0 (nodes 0 south end, 1 north end), east bank
 * street x = 100 m (nodes 2, 3), 1000 m long each, joined by a bridge 400 m up
 * (nodes 4 on the west, 5 on the east). y runs north in metres.
 */
function river() {
  const pts: [number, number][] = [
    [0, 0], // 0 west south
    [0, 1000 * M], // 1 west north
    [100 * M, 0], // 2 east south
    [100 * M, 1000 * M], // 3 east north
    [0, 400 * M], // 4 west bridge end
    [100 * M, 400 * M], // 5 east bridge end
  ];
  return setup(pts, [[0, 4, 1], [2, 5, 3], [4, 5]]);
}

describe('nearestByStreet on the river graph', () => {
  // The block sits on the west bank at y = 0; a POI 100 m across the gap, and one 300 m up its own side.
  const blockAt = { h3: 'b', lng: 0, lat: 0 };
  const across: PlaceInput = { placeId: 1, lng: 100 * M, lat: 0 };
  const ownSide: PlaceInput = { placeId: 2, lng: 0, lat: 300 * M };

  it('prefers the place on its own side to the one across the river', () => {
    const { graph, index } = river();
    const { joins } = joinBlocks(index, [blockAt]);
    const { rows } = nearestByStreet(graph, index, joins, [across, ownSide], 'poi');
    expect(rows).toHaveLength(1);
    expect(rows[0].placeId).toBe(2);
    expect(haversineMetres(0, 0, across.lng, across.lat)).toBeLessThan(
      haversineMetres(0, 0, ownSide.lng, ownSide.lat),
    );
  });

  it('adds the block join, the network distance and the place join, from the block centre', () => {
    const { graph, index } = river();
    // The block is 10 m west of node 0; the POI is 20 m west of node 4, 400 m up the street.
    const block = { h3: 'b', lng: -10 * M, lat: 0 };
    const poi: PlaceInput = { placeId: 7, lng: -20 * M, lat: 400 * M };
    const { joins } = joinBlocks(index, [block]);
    const { rows } = nearestByStreet(graph, index, joins, [poi], 'poi');
    const poiJoin = index.nearest(poi.lng, poi.lat);
    expect(joins[0].node).toBe(0);
    expect(poiJoin.node).toBe(4);
    const network = haversineMetres(graph.lngs[0], graph.lats[0], graph.lngs[4], graph.lats[4]);
    expect(rows[0].metres).toBe(Math.round(joins[0].metres + network + poiJoin.metres));
    expect(rows[0].walk[0]).toEqual([r5(block.lng), r5(block.lat)]);
    expect(rows[0].walk[rows[0].walk.length - 1]).toEqual([r5(poi.lng), r5(poi.lat)]);
  });

  it('crosses by the bridge when only the far bank has a place', () => {
    const { graph, index } = river();
    const { joins } = joinBlocks(index, [blockAt]);
    const { rows } = nearestByStreet(graph, index, joins, [across], 'poi');
    // up 400 m, over 100 m, back down 400 m
    expect(rows[0].metres).toBe(900);
    expect(rows[0].straightMetres).toBeCloseTo(100, 0);
  });

  it('gives two points when the block and the place share a node and it lies on the line', () => {
    const { graph, index } = river();
    // Block and POI straddle node 4, which lies on the straight line between them.
    const nodeBlock = { h3: 'n', lng: -1 * M, lat: 400 * M };
    const nodePoi: PlaceInput = { placeId: 4, lng: 1 * M, lat: 400 * M };
    const { joins: nodeJoins } = joinBlocks(index, [nodeBlock]);
    const { rows } = nearestByStreet(graph, index, nodeJoins, [nodePoi], 'poi');
    expect(nodeJoins[0].node).toBe(index.nearest(nodePoi.lng, nodePoi.lat).node);
    expect(rows[0].walk).toHaveLength(2);
    expect(rows[0].walk[0]).toEqual([r5(nodeBlock.lng), r5(nodeBlock.lat)]);
    expect(rows[0].walk[1]).toEqual([r5(nodePoi.lng), r5(nodePoi.lat)]);
    const blockJoin = index.nearest(nodeBlock.lng, nodeBlock.lat).metres;
    const poiJoin = index.nearest(nodePoi.lng, nodePoi.lat).metres;
    expect(rows[0].metres).toBe(Math.round(blockJoin + poiJoin));
  });

  it('draws the walk through the node when it is off the straight line', () => {
    const { graph, index } = river();
    // The shared node (4, at y = 400) is 20 m north of the centre-to-POI line.
    const block = { h3: 'b', lng: -30 * M, lat: 380 * M };
    const poi: PlaceInput = { placeId: 5, lng: -10 * M, lat: 380 * M };
    const { joins } = joinBlocks(index, [block]);
    const { rows } = nearestByStreet(graph, index, joins, [poi], 'poi');
    expect(joins[0].node).toBe(index.nearest(poi.lng, poi.lat).node);
    const blockJoin = joins[0].metres;
    const poiJoin = index.nearest(poi.lng, poi.lat).metres;
    expect(rows[0].metres).toBe(Math.round(blockJoin + poiJoin));
    expect(rows[0].walk).toHaveLength(3);
    expect(rows[0].walk[0]).toEqual([r5(block.lng), r5(block.lat)]);
    expect(rows[0].walk[2]).toEqual([r5(poi.lng), r5(poi.lat)]);
  });

  it('reports no rows and every block unreached when there are no places', () => {
    const { graph, index } = river();
    const { joins } = joinBlocks(index, [blockAt, { h3: 'c', lng: 0, lat: 100 * M }]);
    const { rows, stats } = nearestByStreet(graph, index, joins, [], 'poi');
    expect(rows).toEqual([]);
    expect(stats).toEqual({ rows: 0, unreached: 2, medianDetour: null, placeJoins: null });
  });

  it('caps metres at 65534', () => {
    // A single street 100 km long.
    const pts: [number, number][] = [
      [0, 0],
      [0, 0.45],
      [0, 0.9],
    ];
    const { graph, index } = setup(pts, [[0, 1, 2]]);
    const { joins } = joinBlocks(index, [{ h3: 'b', lng: 0, lat: 0 }]);
    const { rows } = nearestByStreet(graph, index, joins, [{ placeId: 1, lng: 0, lat: 0.9 }], 'poi');
    expect(rows[0].metres).toBe(65534);
  });

  it('gives identical rows however the places are ordered', () => {
    const { graph, index } = river();
    const blocks = [
      { h3: 'a', lng: 0, lat: 0 },
      { h3: 'b', lng: 0, lat: 800 * M },
      { h3: 'c', lng: 100 * M, lat: 100 * M },
    ];
    const { joins } = joinBlocks(index, blocks);
    // Two equidistant POIs (ties by rank), and a park with entry points on both banks.
    const pois: PlaceInput[] = [
      { placeId: 9, lng: 0, lat: 200 * M },
      { placeId: 4, lng: 0, lat: 200 * M },
      { placeId: 6, lng: 100 * M, lat: 600 * M },
    ];
    const entries: PlaceInput[] = [
      { placeId: 20, lng: 0, lat: 500 * M },
      { placeId: 20, lng: 100 * M, lat: 500 * M },
      { placeId: 21, lng: 0, lat: 900 * M },
    ];
    for (const [places, kind] of [
      [pois, 'poi'],
      [entries, 'park'],
    ] as const) {
      const base = nearestByStreet(graph, index, joins, places, kind);
      expect(base.rows.length).toBeGreaterThan(0);
      const reversed = nearestByStreet(graph, index, joins, [...places].reverse(), kind);
      const rotated = nearestByStreet(graph, index, joins, [...places.slice(1), places[0]], kind);
      expect(reversed).toEqual(base);
      expect(rotated).toEqual(base);
    }
    // The tie between placeIds 4 and 9 goes to the lower id.
    const tie = nearestByStreet(graph, index, joins.slice(0, 1), pois.slice(0, 2), 'poi');
    expect(tie.rows[0].placeId).toBe(4);
  });

  it('reports the median detour', () => {
    const { graph, index } = river();
    const { joins } = joinBlocks(index, [blockAt]);
    const { stats } = nearestByStreet(graph, index, joins, [across], 'poi');
    expect(stats.medianDetour).toBeCloseTo(9, 0);
  });
});

describe('parks', () => {
  // The block sits on node 0, so its own join is 0 m.
  const block = { h3: 'b', lng: 0, lat: 0 };

  it('ignores an entry point joined beyond 30 m even when it would win', () => {
    const { graph, index } = river();
    const joins = joinBlocks(index, [block]).joins;
    // Entry A joins node 0 at 40 m (too far), and would give a 40 m walk.
    // Entry B joins node 4 at 25 m (within 30 m): 400 m up the street, then 25 m.
    const a: PlaceInput = { placeId: 1, lng: -40 * M, lat: 0 };
    const b: PlaceInput = { placeId: 1, lng: -25 * M, lat: 400 * M };
    const { rows } = nearestByStreet(graph, index, joins, [a, b], 'park');
    expect(rows).toHaveLength(1);
    expect(rows[0].metres).toBe(425);
    expect(rows[0].walk[rows[0].walk.length - 1]).toEqual([r5(b.lng), r5(b.lat)]);
  });

  it('uses the entry point with the smallest join when all are over 30 m, not the first in order', () => {
    const { graph, index } = river();
    const joins = joinBlocks(index, [block]).joins;
    // A (first in order) joins node 0 at 60 m. B joins node 4 at 35 m, the smallest join, so it is the
    // park's one source: 400 m up the street, then 35 m.
    const a: PlaceInput = { placeId: 1, lng: -60 * M, lat: 0 };
    const b: PlaceInput = { placeId: 1, lng: -35 * M, lat: 400 * M };
    const { rows } = nearestByStreet(graph, index, joins, [a, b], 'park');
    expect(rows[0].metres).toBe(435);
    expect(rows[0].walk[rows[0].walk.length - 1]).toEqual([r5(b.lng), r5(b.lat)]);
  });
});

describe('joinBlocks', () => {
  it('lists a block 200 m from the network as far, and not one 100 m away', () => {
    const { index } = river();
    const { joins, far } = joinBlocks(index, [
      { h3: 'near', lng: -100 * M, lat: 0 },
      { h3: 'far', lng: -200 * M, lat: 0 },
    ]);
    expect(joins).toHaveLength(2);
    expect(joins[0].node).toBe(0);
    expect(far.map((f) => f.h3)).toEqual(['far']);
    expect(far[0].metres).toBeGreaterThan(FAR_FROM_NETWORK_METRES);
  });
});

describe('join stats', () => {
  it('gives the median, 95th percentile and maximum of the places joins', () => {
    const { graph, index } = river();
    const joins = joinBlocks(index, [{ h3: 'b', lng: 0, lat: 0 }]).joins;
    // Joins of 10, 20 and 30 m, to the west street's nodes 0, 4 and 1.
    const places: PlaceInput[] = [10, 20, 30].map((d, i) => ({ placeId: i + 1, lng: -d * M, lat: [0, 400, 1000][i] * M }));
    const { stats } = nearestByStreet(graph, index, joins, places, 'poi');
    expect(stats.placeJoins!.median).toBeCloseTo(20, 0);
    expect(stats.placeJoins!.p95).toBeCloseTo(30, 0);
    expect(stats.placeJoins!.max).toBeCloseTo(30, 0);
  });

  it('counts only the entry points a park uses as sources', () => {
    const { graph, index } = river();
    const joins = joinBlocks(index, [{ h3: 'b', lng: 0, lat: 0 }]).joins;
    const near: PlaceInput = { placeId: 1, lng: -20 * M, lat: 400 * M };
    const far: PlaceInput = { placeId: 1, lng: -90 * M, lat: 1000 * M };
    const { stats } = nearestByStreet(graph, index, joins, [near, far], 'park');
    expect(stats.placeJoins!.max).toBeCloseTo(20, 0);
  });

  it('is null, not an error, for no values', () => {
    expect(joinStats([])).toBeNull();
    expect(joinStats([7])).toEqual({ median: 7, p95: 7, max: 7 });
  });
});
