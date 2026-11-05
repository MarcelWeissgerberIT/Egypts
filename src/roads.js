// Road network on the island tile grid: which tiles can carry a road, footpaths and sledge
// tracks, connections between buildings and shortest paths for the carriers.
// Footpaths carry light goods only (grain, bread, ore, tools); heavy stone, blocks and granite
// need a sledge track (wet clay with wooden sleepers) the whole way.
import { N, SIZE, inIsland, tileTerrain, siteLayout, DECOR, PALMS, DAIS, ALTAR, toUV, RIVER } from './map.js';

export const PATH = 1, TRACK = 2;
export const ROAD_COST = { 1: 1, 2: 3 };
export const idx = (x, z) => (x + N) * SIZE + (z + N);
export const tileX = (i) => Math.floor(i / SIZE) - N;
export const tileZ = (i) => (i % SIZE) - N;
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class RoadGrid {
  constructor(base, plots) {
    const n = SIZE * SIZE;
    this.road = new Uint8Array(n);
    this.blocked = new Uint8Array(n);   // 1 terrain / monument / pyramid, 2 reserved plot or plaza
    this.version = 0;
    this.site = siteLayout(base);
    const S = this.site;
    for (let x = -N; x <= N; x++) for (let z = -N; z <= N; z++) {
      const i = idx(x, z);
      if (tileTerrain(x, z) !== 'land') this.blocked[i] = 1;
      if (Math.abs(x) <= S.pyr && Math.abs(z) <= S.pyr) this.blocked[i] = 1;
    }
    // construction ramp
    const R = S.ramp;
    for (let x = Math.round(R.x0); x <= Math.floor(R.x1); x++) for (const z of new Set([Math.floor(R.zc), Math.ceil(R.zc)])) this._block(x, z);
    const solid = (o, r) => {
      for (let x = Math.floor(o.x - r - 1); x <= Math.ceil(o.x + r + 1); x++) for (let z = Math.floor(o.z - r - 1); z <= Math.ceil(o.z + r + 1); z++) {
        if (Math.abs(x - o.x) < r + 0.5 && Math.abs(z - o.z) < r + 0.5) this._block(x, z);
      }
    };
    for (const d of DECOR) solid(d, d.r);
    for (const [x, z] of PALMS) solid({ x, z }, 0.3);
    solid(DAIS, 1.0); solid(ALTAR, 0.8);
    // plots and the plaza stay free of roads
    for (const p of plots) for (const i of this.footprint(p.x, p.z)) if (!this.blocked[i] || p.terrain === 'bank') this.blocked[i] = 2;
    this.plaza = S.plaza;
    for (const i of this.footprint(S.plaza.x, S.plaza.z)) this.blocked[i] = 2;
  }

  _block(x, z) { if (inIsland(x, z)) this.blocked[idx(x, z)] = 1; }

  footprint(cx, cz) {
    const out = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (inIsland(cx + dx, cz + dz)) out.push(idx(cx + dx, cz + dz));
    return out;
  }
  // the 12 tiles touching a 3x3 footprint edge-on, with the direction back into the footprint
  ports(cx, cz) {
    const out = [];
    for (let k = -1; k <= 1; k++) {
      for (const [x, z, dx, dz] of [[cx + k, cz - 2, 0, 1], [cx + k, cz + 2, 0, -1], [cx - 2, cz + k, 1, 0], [cx + 2, cz + k, -1, 0]]) {
        if (inIsland(x, z)) out.push({ i: idx(x, z), x, z, dx, dz });
      }
    }
    return out;
  }

  get(x, z) { return inIsland(x, z) ? this.road[idx(x, z)] : 0; }
  free(x, z) { return inIsland(x, z) && !this.blocked[idx(x, z)]; }
  set(x, z, t) { this.road[idx(x, z)] = t; this.version++; }

  // breadth-first search over the roads that can carry the good, starting from a node's ports
  bfs(ports, heavy) {
    const n = SIZE * SIZE;
    const dist = new Int16Array(n).fill(-1), prev = new Int32Array(n).fill(-1);
    const ok = (i) => (heavy ? this.road[i] === TRACK : this.road[i] > 0);
    const q = [];
    for (const p of ports) if (ok(p.i) && dist[p.i] < 0) { dist[p.i] = 1; q.push(p.i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = tileX(i), z = tileZ(i);
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (!inIsland(nx, nz)) continue;
        const j = idx(nx, nz);
        if (dist[j] >= 0 || !ok(j)) continue;
        dist[j] = dist[i] + 1; prev[j] = i; q.push(j);
      }
    }
    return { dist, prev };
  }

  // best entry port of a target node and the tile path to it, or null
  pathTo(res, ports) {
    let best = null;
    for (const p of ports) { const d = res.dist[p.i]; if (d > 0 && (!best || d < best.d)) best = { d, p }; }
    if (!best) return null;
    const tiles = [];
    for (let i = best.p.i; i >= 0; i = res.prev[i]) tiles.push(i);
    tiles.reverse();
    return { d: best.d, tiles, end: best.p };
  }

  // cheapest set of new road tiles linking two nodes (existing suitable roads are free)
  suggest(fromPorts, toPorts, type) {
    const n = SIZE * SIZE;
    const cost = new Float32Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
    const usable = (i) => this.road[i] >= type || (!this.blocked[i] && this.road[i] < type);
    const step = (i) => (this.road[i] >= type ? 0.05 : 1);
    const open = [];
    for (const p of fromPorts) if (usable(p.i)) { cost[p.i] = step(p.i); prev[p.i] = -1; open.push(p.i); }
    const targets = new Set(toPorts.map((p) => p.i));
    const done = new Uint8Array(n);
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (cost[open[k]] < cost[open[bi]]) bi = k;
      const i = open[bi]; open.splice(bi, 1);
      if (done[i]) continue;
      done[i] = 1;
      if (targets.has(i)) {
        const tiles = [];
        for (let j = i; j >= 0; j = prev[j]) tiles.push(j);
        tiles.reverse();
        return tiles;
      }
      const x = tileX(i), z = tileZ(i);
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (!inIsland(nx, nz)) continue;
        const j = idx(nx, nz);
        if (done[j] || !usable(j)) continue;
        const c = cost[i] + step(j);
        if (c < cost[j]) { cost[j] = c; prev[j] = i; open.push(j); }
      }
    }
    return null;
  }
}

// world-space polyline for a carrier: out of the source door, along the tiles, into the target door
export function tilePolyline(tiles, startPort, endPort) {
  const pts = [];
  const sx = tileX(tiles[0]), sz = tileZ(tiles[0]);
  pts.push({ x: sx + startPort.dx * 0.6, z: sz + startPort.dz * 0.6 });
  for (const i of tiles) pts.push({ x: tileX(i), z: tileZ(i) });
  const ex = tileX(tiles[tiles.length - 1]), ez = tileZ(tiles[tiles.length - 1]);
  pts.push({ x: ex + endPort.dx * 0.6, z: ez + endPort.dz * 0.6 });
  return simplify(pts);
}

function simplify(pts) {
  const out = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = out[out.length - 1], b = pts[k], c = pts[k + 1];
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) > 1e-6) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function polyLength(pts) {
  let s = 0;
  for (let k = 1; k < pts.length; k++) s += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
  return s;
}

// boats cross the Nile from a far-bank granite quarry to a quay
export function riverPolyline(from, quay) {
  const a = toUV(from.x, from.z), b = toUV(quay.x, quay.z);
  const w = (u, v) => ({ x: (u - v) / Math.SQRT2, z: (-u - v) / Math.SQRT2 });
  return [w(a.u, RIVER.far + 0.15), w((a.u + b.u) / 2, RIVER.mid), w(b.u, RIVER.near + 0.35)];
}
