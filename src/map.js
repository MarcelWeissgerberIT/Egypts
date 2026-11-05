// The island map on the world tile grid. Tiles are 1x1 world units with centres on integer
// (x, z); on screen +x runs down-right and +z down-left (classic isometric diamonds).
// Shared by the economy (roads, footprints, path finding) and the 3D world (placement).
export const N = 17;                       // tiles exist for -N..N on both axes
export const SIZE = 2 * N + 1;
export const S2 = Math.SQRT2;
export const toUV = (x, z) => ({ u: (x - z) / S2, v: -(x + z) / S2 });
export const fromUV = (u, v) => ({ x: (u - v) / S2, z: (-u - v) / S2 });
export const RIVER = { near: 14.5, far: 17.9, mid: 16.2 };   // Nile band in screen-v

// building plots: 3x3 tile footprints around (x, z). Deposits decide what can be built:
// limestone -> quarry, copper -> mine, fertile Nile soil -> farm, bank -> quay, granite -> granite quarry
export const PLOTS = [
  { id: 'd1', terrain: 'desert', x: -9, z: 1 },
  { id: 'd2', terrain: 'desert', x: -3, z: 8 },
  { id: 'd3', terrain: 'desert', x: 1, z: 12 },
  { id: 'd4', terrain: 'desert', x: 5, z: 12 },
  { id: 'd5', terrain: 'desert', x: -13, z: 1 },
  { id: 'd6', terrain: 'desert', x: 11, z: 11 },
  { id: 'd7', terrain: 'desert', x: 4, z: 16 },
  { id: 'd8', terrain: 'desert', x: -11, z: 5 },
  { id: 'd9', terrain: 'desert', x: 15, z: 12 },
  { id: 'd10', terrain: 'desert', x: -2, z: -9 },
  { id: 'l1', terrain: 'limestone', x: 2, z: -10 },
  { id: 'l2', terrain: 'limestone', x: 8, z: -3 },
  { id: 'l3', terrain: 'limestone', x: 12, z: 5 },
  { id: 'c1', terrain: 'copper', x: 11, z: 1 },
  { id: 'c2', terrain: 'copper', x: 16, z: 6 },
  { id: 'f1', terrain: 'fertile', x: -14, z: -3 },
  { id: 'f2', terrain: 'fertile', x: -8, z: -9 },
  { id: 'f3', terrain: 'fertile', x: -4, z: -13 },
  { id: 'q1', terrain: 'bank', x: -13, z: -7 },
  { id: 'g1', terrain: 'granite', x: -16, z: -12 },
  { id: 'g2', terrain: 'granite', x: -12, z: -16 },
];

// decoration on the island (blocks roads). r: blocking radius in tiles
export const DECOR = [
  { name: 'temple', x: -16.2, z: -16.2, h: 3.8, r: 1.6, rot: 0 },
  { name: 'obelisk', x: -10, z: -7, h: 3.4, r: 0.4 },
  { name: 'obelisk', x: -5, z: -9, h: 3.4, r: 0.4 },
  { name: 'anubis', x: 2, z: 7, h: 1.5, r: 0.4, rot: 0.3 },
  { name: 'anubis', x: 7, z: 2, h: 1.5, r: 0.4, rot: -0.3 },
  { name: 'sphinx', x: -8, z: 6, h: 2.0, r: 0.9, rot: 0.6 },
  { name: 'sphinx', x: 8, z: 14, h: 2.0, r: 0.9, rot: 0.2 },
  { name: 'camel', x: -16, z: -3, h: 1.4, r: 0.5, rot: 1.2 },
  { name: 'camel', x: -5, z: -15, h: 1.4, r: 0.5, rot: -1.1 },
  { name: 'brazier', x: 4, z: 8, h: 0.85, r: 0.3 },
  { name: 'brazier', x: 8, z: 4, h: 0.85, r: 0.3 },
  { name: 'brazier', x: -14, z: -16, h: 0.85, r: 0.3 },
  { name: 'brazier', x: -16, z: -14, h: 0.85, r: 0.3 },
];
// palm trees: near Nile bank, far bank and a few on the land
export const PALMS = [[-16, -4], [-11, -9], [-8, -12], [-4, -16], [-17, -9], [-13, -13], [-9, -17], [8, 16], [13, 15], [12, -2], [-12, -1], [15, 3], [-2, 17]];
// pharaoh's dais and the priestess' altar in front of the pyramid
export const DAIS = { x: 6, z: 9.5 };
export const ALTAR = { x: 9.5, z: 6 };

// the pyramid, its construction ramp along the back-right face and the stone plaza at the ramp foot
export function siteLayout(base) {
  const h = base / 2;
  const pyr = (base + 1) / 2;              // blocked |x|,|z| <= pyr
  const x0 = -h - 1.5, x1 = h - 0.2, z0 = -(h + 0.3), z1 = -(h + 1.75), zc = (z0 + z1) / 2;
  const dock = { x: x0 - 0.9, z: zc + 0.2 };
  const plaza = { x: Math.round(dock.x) - 1, z: Math.round(dock.z) };
  return { h, pyr, ramp: { x0, x1, z0, z1, zc }, dock, plaza };
}

export const inIsland = (x, z) => Math.abs(x) <= N && Math.abs(z) <= N;
// terrain of a single tile: land, water (Nile) or far (beyond the Nile)
export function tileTerrain(x, z) {
  const v = -(x + z) / S2;
  if (v > RIVER.far) return 'far';
  if (v >= RIVER.near - 0.15) return 'water';
  return 'land';
}
