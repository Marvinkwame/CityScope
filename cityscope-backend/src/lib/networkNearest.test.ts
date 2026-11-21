import { describe, expect, it } from 'vitest';
import type { StreetsFile } from './streets';
import { buildStreetGraph, haversineMetres } from './streetGraph';
import { NodeIndex } from './nodeIndex';
import { FAR_FROM_NETWORK_METRES, joinBlocks, nearestByStreet } from './networkNearest';
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
    expect(stats).toEqual({ rows: 0, unreached: 2, medianDetour: null });
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
  it('joins an entry point 20 m from a node and ignores one that is farther', () => {
    const { graph, index } = river();
    const joins = joinBlocks(index, [{ h3: 'b', lng: 0, lat: 0 }]).joins;
    // Entry A is 20 m west of the street at y = 100 (joins, 100 m up); entry B is on the street at y = 900.
    const near: PlaceInput = { placeId: 1, lng: -20 * M, lat: 0 };
    const farther: PlaceInput = { placeId: 1, lng: 0, lat: 900 * M };
    const { rows } = nearestByStreet(graph, index, joins, [farther, near], 'park');
    expect(rows[0].metres).toBe(20);
    expect(rows[0].walk[rows[0].walk.length - 1]).toEqual([r5(near.lng), r5(near.lat)]);
  });

  it('uses the closest entry point when every one is over 30 m from a node', () => {
    const { graph, index } = river();
    const joins = joinBlocks(index, [{ h3: 'b', lng: 0, lat: 0 }]).joins;
    const a: PlaceInput = { placeId: 1, lng: -60 * M, lat: 200 * M };
    const b: PlaceInput = { placeId: 1, lng: -40 * M, lat: 700 * M };
    const { rows } = nearestByStreet(graph, index, joins, [a, b], 'park');
    // Entry b's node join (40 m to node 1 is farther than to...) is the smaller one: 40 m versus a's 60 m or more.
    const joinA = index.nearest(a.lng, a.lat).metres;
    const joinB = index.nearest(b.lng, b.lat).metres;
    expect(joinA).toBeGreaterThan(30);
    expect(joinB).toBeGreaterThan(30);
    const best = joinB < joinA ? b : a;
    expect(rows[0].walk[rows[0].walk.length - 1]).toEqual([r5(best.lng), r5(best.lat)]);
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
