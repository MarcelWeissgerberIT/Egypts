// 100 levels in 10 worlds, generated from hand-tuned patterns with a fixed seed per level.
// Every pattern is built within the explorer's jumping range, so each level can be finished;
// new mechanics are introduced world by world and difficulty rises within each world.
export const T = { EMPTY: 0, SOLID: 1, ONEWAY: 2, SPIKE: 3, LADDER: 4, WATER: 5, SAND: 6, CRUMBLE: 7, CRACKED: 8, SPIKE_DOWN: 9 };
export const H = 18;                     // level height in tiles

// world themes: background painting, block texture, light mood and what appears there
export const WORLDS = [
  { key: 'entrance', tex: 'sandstone', tint: 0xffe2b8, amb: 1.0, fog: 0x3a2050, sky: 0xffc98a, enemies: [], feats: [] },
  { key: 'hieroglyphs', tex: 'sandstone', tint: 0xf0d4b0, amb: 0.9, fog: 0x2e1848, sky: 0xd8a0ff, enemies: ['scarab'], feats: ['ladder', 'crumble'] },
  { key: 'cistern', tex: 'sandstone', tint: 0xc8e0e8, amb: 0.85, fog: 0x15304a, sky: 0x60e0ff, enemies: ['scarab'], feats: ['ladder', 'crumble', 'water', 'mover'] },
  { key: 'scarabs', tex: 'sandstone', tint: 0xe8c890, amb: 0.85, fog: 0x2a1a30, sky: 0xffb860, enemies: ['scarab', 'bat'], feats: ['ladder', 'crumble', 'mover', 'darts'] },
  { key: 'crypt', tex: 'granite', tint: 0xb8a8d8, amb: 0.35, fog: 0x0e0618, sky: 0x8060ff, dark: true, enemies: ['scarab', 'bat', 'mummy'], feats: ['ladder', 'crumble', 'darts', 'water'] },
  { key: 'sandfalls', tex: 'sandstone', tint: 0xffd09a, amb: 0.95, fog: 0x3a2030, sky: 0xffa050, enemies: ['scarab', 'bat'], feats: ['sand', 'sandfall', 'boulder', 'crumble', 'mover'] },
  { key: 'traps', tex: 'granite', tint: 0xd8b0a0, amb: 0.7, fog: 0x200a14, sky: 0xff6050, enemies: ['scarab', 'mummy'], feats: ['crusher', 'fire', 'darts', 'mover', 'vmover', 'crumble'] },
  { key: 'treasury', tex: 'sandstone', tint: 0xffe08a, amb: 1.0, fog: 0x3a2410, sky: 0xffd040, enemies: ['scarab', 'bat', 'cobra'], feats: ['mover', 'vmover', 'fire', 'crumble', 'darts', 'water'] },
  { key: 'stars', tex: 'granite', tint: 0xb0c0ff, amb: 0.7, fog: 0x080a28, sky: 0x9fb0ff, enemies: ['bat', 'mummy', 'cobra'], feats: ['shaft', 'mover', 'vmover', 'crumble', 'crusher', 'sand'] },
  { key: 'king', tex: 'granite', tint: 0xffb0c8, amb: 0.75, fog: 0x200818, sky: 0xd060ff, enemies: ['scarab', 'bat', 'mummy', 'cobra'], feats: ['shaft', 'crusher', 'fire', 'darts', 'boulder', 'mover', 'vmover', 'crumble', 'sand', 'water'] },
];

// abilities: double jump from world 8 (golden sandals), wall jump from world 9 (falcon gloves)
export function abilities(world) { return { double: world >= 8, wall: world >= 9, lantern: world >= 5 }; }

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function levelInfo(n) { return { world: Math.floor((n - 1) / 10) + 1, index: ((n - 1) % 10) + 1 }; }

export function generateLevel(n) {
  const { world, index } = levelInfo(n);
  const R = rng(n * 7919 + 1301);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const W = WORLDS[world - 1];
  const A = abilities(world);
  const d = Math.min(1, (world - 1) / 9 * 0.75 + (index - 1) / 9 * 0.35);   // difficulty 0..1
  const maxGap = (A.double ? 6 : 4) - (d < 0.25 ? 1 : 0);
  const maxUp = A.double ? 3 : 2;
  const width = 64 + world * 9 + index * 6;
  const cols = [];                       // columns of tile codes
  const ents = [];
  const L = { n, world, index, theme: W, abilities: A, ents };
  let x = 0, g = 4;                      // cursor and ground height (player stands at y = g)
  const col = () => { const c = new Uint8Array(H); return c; };
  const ensure = (xx) => { while (cols.length <= xx) cols.push(col()); };
  const set = (xx, y, t) => { if (y < 0 || y >= H) return; ensure(xx); cols[xx][y] = t; };
  const get = (xx, y) => (xx < 0 || xx >= cols.length || y < 0 || y >= H ? 0 : cols[xx][y]);
  const ground = (xx, h, t = T.SOLID) => { ensure(xx); for (let y = 0; y < h; y++) cols[xx][y] = t; };
  const ent = (type, ex, ey, o = {}) => ents.push({ type, x: ex, y: ey, ...o });
  const coinArc = (x0, x1, y0, hgt) => { for (let xx = x0; xx <= x1; xx++) { const t = (xx - x0) / Math.max(1, x1 - x0); ent('coin', xx + 0.5, y0 + 0.6 + Math.sin(t * Math.PI) * hgt); } };
  const coinRow = (x0, x1, y) => { for (let xx = x0; xx <= x1; xx += 1) ent('coin', xx + 0.5, y + 0.6); };
  const flat = (w, coins = true) => { for (let k = 0; k < w; k++) ground(x + k, g); if (coins && R() < 0.6) coinRow(x + 1, x + w - 2, g + (R() < 0.5 ? 0 : 2)); if (R() < 0.35) ent('torch', x + ri(1, w - 1) + 0.5, g + 2.2); x += w; };
  const setG = (ng) => { g = Math.max(2, Math.min(10, ng)); };

  const P = {
    run() { flat(ri(4, 7)); },
    hill() {
      const up = ri(1, maxUp);
      flat(2);
      setG(g + up); flat(ri(3, 6));
      if (R() < 0.5) { setG(g - ri(1, 3)); }
      flat(2);
    },
    gap() {
      flat(2, false);
      const w = ri(2, Math.max(2, Math.round(2 + (maxGap - 2) * (0.4 + d * 0.6))));
      coinArc(x, x + w - 1, g, 2.2);
      if (d > 0.3 && R() < 0.5) for (let k = 0; k < w; k++) { ground(x + k, 1); set(x + k, 1, T.SPIKE); }
      x += w;
      if (R() < 0.4) setG(g + ri(-1, 1));
      flat(3);
    },
    floaters() {
      flat(2, false);
      const n = ri(2, 3 + Math.round(d * 2));
      let px = x, py = g;
      const base = g;
      for (let k = 0; k < n; k++) {
        const gapW = ri(2, Math.min(maxGap - 1, 3 + Math.round(d)));
        px += gapW;
        py = Math.max(base - 1, Math.min(base + maxUp, py + ri(-1, maxUp)));
        const pw = ri(2, d > 0.6 ? 2 : 3);
        for (let q = 0; q < pw; q++) set(px + q, py - 1, R() < 0.5 && W.key !== 'entrance' ? T.ONEWAY : T.SOLID);
        coinRow(px, px + pw - 1, py);
        if (k === n - 1 && R() < 0.3) ent('ankh', px + 0.5, py + 1.5);
        px += pw;
      }
      for (let xx = x; xx < px; xx++) ensure(xx);
      x = px + ri(2, Math.min(maxGap - 1, 3));
      setG(Math.max(base - 1, Math.min(py, base + maxUp)));
      flat(3);
    },
    spikes() {
      flat(2, false);
      const w = ri(1, 2 + Math.round(d * 2));
      for (let k = 0; k < w; k++) { ground(x + k, g); set(x + k, g, T.SPIKE); }
      coinArc(x, x + w - 1, g + 1, 1.6);
      if (d > 0.45 && R() < 0.5) for (let k = -1; k <= w; k++) set(x + k, g + 4, T.SOLID);
      x += w;
      flat(2);
    },
    stairs() {
      const steps = ri(2, 4);
      for (let s = 0; s < steps; s++) { setG(g + 1); flat(2, false); }
      coinRow(x - 4, x - 1, g + 1);
      flat(ri(2, 4));
      for (let s = 0; s < steps; s++) { setG(g - 1); flat(1, false); }
    },
    ladder() {
      flat(2);
      const h = ri(4, 6);
      ground(x, g); for (let y = g; y < g + h; y++) set(x, y, T.LADDER);
      x++;
      setG(g + h); const top = g;
      for (let k = 0; k < ri(4, 7); k++) ground(x + k, top);
      coinRow(x + 1, x + 3, top);
      x += 5;
      if (R() < 0.5) { set(x, top - 1, T.ONEWAY); }
      setG(top - ri(2, h)); flat(3);
    },
    crumble() {
      flat(2, false);
      const w = ri(4, 6 + Math.round(d * 3));
      for (let k = 0; k < w; k++) set(x + k, g - 1, T.CRUMBLE);
      coinRow(x, x + w - 1, g + 1);
      for (let k = 0; k < w; k++) ensure(x + k);
      x += w;
      flat(3);
    },
    pool() {
      flat(2, false);
      const w = ri(6, 9 + Math.round(d * 4)), depth = ri(3, 4);
      for (let k = 0; k < w; k++) { ground(x + k, Math.max(1, g - depth)); for (let y = Math.max(1, g - depth); y < g - 0.01; y++) set(x + k, y, T.WATER); }
      for (let k = 1; k < w - 1; k += 2) ent('coin', x + k + 0.5, g - depth + 1.5);
      if (R() < 0.35) set(x + Math.floor(w / 2), Math.max(1, g - depth), T.SPIKE);
      x += w;
      flat(3);
    },
    mover() {
      flat(2, false);
      const w = ri(6, 9 + Math.round(d * 3));
      ent('mover', x + 0.3, g, { w: 2, dx: 1, len: w - 2.6, speed: 1.6 + d * 1.6 });
      coinArc(x + 1, x + w - 2, g + 1, 1.5);
      for (let k = 0; k < w; k++) ensure(x + k);
      x += w;
      flat(3);
    },
    vmover() {
      flat(2, false);
      const up = ri(3, 5);
      ent('mover', x, g, { w: 2, dy: 1, len: up, speed: 1.5 + d });
      for (let k = 0; k < 2; k++) ensure(x + k);
      x += 2;
      setG(g + up); flat(ri(4, 6));
    },
    patrol() {
      const w = ri(8, 12);
      const start = x;
      flat(w, false);
      coinRow(start + 2, start + w - 3, g + 2);
      const n = 1 + (d > 0.4 ? 1 : 0) + (d > 0.8 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const type = pick(W.enemies);
        const ex = start + 3 + k * Math.floor((w - 4) / n);
        if (type === 'bat') ent('bat', ex + 0.5, g + 2.6, { r: 1.2 + R() });
        else if (type === 'cobra') ent('cobra', ex + 0.5, g, {});
        else ent(type, ex + 0.5, g, { dir: R() < 0.5 ? -1 : 1 });
      }
    },
    darts() {
      const w = ri(8, 11);
      const start = x;
      flat(w, false);
      for (let k = -1; k <= w; k++) set(start + k, g + 3, T.SOLID);
      ground(start + w, g + 3); for (let y = g; y < g + 3; y++) set(start + w, y, T.SOLID);
      set(start + w, g, T.EMPTY); set(start + w, g + 1, T.EMPTY); set(start + w, g + 2, T.EMPTY);
      ent('dart', start + w - 0.5, g + (R() < 0.5 ? 0.45 : 1.25), { dir: -1, period: 2.4 - d * 0.8, phase: R() * 2 });
      coinRow(start + 1, start + w - 2, g);
    },
    crusher() {
      const w = ri(7, 10);
      const start = x;
      flat(w, false);
      for (let k = -1; k <= w; k++) set(start + k, g + 5, T.SOLID);
      const n = 1 + Math.floor(w / 4);
      for (let k = 0; k < n; k++) ent('crusher', start + 1.5 + k * 3, g + 5, { drop: 5, period: 2.6 - d * 0.6, phase: k * 0.8 });
      coinRow(start + 1, start + w - 2, g);
    },
    fire() {
      const w = ri(7, 10);
      const start = x;
      flat(w, false);
      for (let k = 2; k < w - 1; k += 3) ent('fire', start + k + 0.5, g, { period: 2.8 - d * 0.4, on: 1.0, phase: k * 0.45 });
      coinRow(start + 1, start + w - 2, g + 3);
    },
    sand() {
      flat(2, false);
      const w = ri(4, 6 + Math.round(d * 2));
      for (let k = 0; k < w; k++) { ground(x + k, g - 2); set(x + k, g - 2, T.SAND); set(x + k, g - 1, T.SAND); }
      if (w > 5) set(x + Math.floor(w / 2), g - 1, T.SOLID);
      coinArc(x, x + w - 1, g, 2);
      x += w;
      flat(3);
    },
    sandfall() {
      flat(2, false);
      const w = ri(3, 4);
      ent('sandfall', x + w / 2, g, { w: 1.4 });
      x += w;
      flat(3);
    },
    boulder() {
      flat(3, false);
      ent('boulderTrigger', x + 0.5, g, { speed: 5.0 + d * 0.8 });
      const len = ri(26, 36);
      const end = x + len;
      while (x < end - 6) {
        if (R() < 0.5) { flat(ri(3, 5)); } else { const w = ri(2, 3); coinArc(x, x + w - 1, g, 2); x += w; flat(3); }
      }
      ent('boulderEnd', x + 0.5, g);
      flat(4);
    },
    shaft() {
      // a vertical climb: zig-zag ledges (and wall-jump walls in the star shaft)
      flat(2, false);
      const h = ri(7, 10);
      const wide = 5;
      const base = g;
      for (let k = 0; k < wide; k++) ground(x + k, base);
      for (let y = base; y < base + h + 3; y++) { if (y >= base + 3) set(x - 1, y, T.SOLID); set(x + wide, y, T.SOLID); }
      for (let y = base + h - 1; y < base + h + 3; y++) set(x + wide, y, T.EMPTY);
      for (let s = 0, y = base + 2; y < base + h; s++, y += 2) {
        const left = s % 2 === 0;
        for (let q = 0; q < 2; q++) set(x + (left ? q : wide - 1 - q), y, A.wall && s % 3 === 2 ? T.EMPTY : T.ONEWAY);
        ent('coin', x + (left ? 1 : wide - 1) + 0.0, y + 1.6);
      }
      x += wide;
      setG(base + h - 1);
      for (let k = 0; k < 5; k++) ground(x + k, g);
      x += 5;
    },
  };

  // start: entrance hall
  flat(10, false);
  L.spawn = { x: 4.5, y: g };
  ent('torch', 2.5, g + 2.2);
  const pool = ['run', 'hill', 'gap', 'gap', 'floaters', 'spikes', 'stairs'];
  const feat = { ladder: 'ladder', crumble: 'crumble', water: 'pool', mover: 'mover', vmover: 'vmover', darts: 'darts', crusher: 'crusher', fire: 'fire', sand: 'sand', sandfall: 'sandfall', boulder: 'boulder', shaft: 'shaft' };
  for (const f of W.feats) pool.push(feat[f], feat[f]);
  if (W.enemies.length) pool.push('patrol', 'patrol', 'patrol');
  // the newest mechanic of the world shows up early so it is learnt in a calm spot
  const intro = W.feats[W.feats.length - 1] ? feat[W.feats[W.feats.length - 1]] : 'floaters';
  let lastCheck = 0, k = 0, lastPat = '';
  const secretsAt = [0.25, 0.55, 0.82].map((f) => Math.round(f * width));
  let secret = 0;
  while (x < width) {
    let p = k === 1 ? intro : pick(pool);
    if (p === lastPat && R() < 0.7) p = pick(pool);
    if (p === 'boulder' && (x > width - 45 || index < 3)) p = 'run';
    lastPat = p;
    P[p]();
    k++;
    if (x - lastCheck > 42 && x < width - 10) { flat(3, false); ent('checkpoint', x - 1.5, g); lastCheck = x; }
    if (secret < 3 && x >= secretsAt[secret]) { placeSecret(secret); secret++; }
  }
  while (secret < 3) { placeSecret(secret); secret++; }
  // finish: the golden door
  flat(4, false);
  ent('exit', x + 2, g);
  flat(7, false);
  for (let y = 0; y < H; y++) set(x, y, T.SOLID);
  x++;
  // left boundary wall
  for (let y = g + 0; y < H; y++) if (!get(0, y)) set(0, y, T.EMPTY);

  // three hidden papyrus fragments per level
  function placeSecret(i) {
    let kind = (n + i) % 3;
    if (kind !== 1 && g < 4) { flat(1, false); setG(4); flat(2, false); }
    if (kind === 0) {
      // cracked floor stones: the action button breaks them and opens a small vault
      flat(2, false);
      for (let k2 = 0; k2 < 2; k2++) { ground(x + k2, g - 2); set(x + k2, g - 1, T.CRACKED); }
      ent('papyrus', x + 1, g - 2 + 0.7, { id: i });
      x += 2;
      flat(3, false);
    } else if (kind === 1) {
      // a lofty ledge high above the path
      flat(3, false);
      const hx = x - 2;
      const top = g + 3 + (A.double ? 2 : 0);
      set(hx, g + 1, T.ONEWAY); set(hx + 1, g + 1, T.ONEWAY);
      set(hx + 3, top, T.ONEWAY); set(hx + 4, top, T.ONEWAY);
      ent('papyrus', hx + 4, top + 1.7, { id: i });
      flat(4, false);
    } else {
      // a cellar under a plank floor: drop through (down + jump), climb out by the ladder
      flat(2, false);
      const sx = x;
      for (let k2 = 0; k2 < 5; k2++) {
        ground(x + k2, g - 3);
        set(x + k2, g - 1, k2 < 4 ? T.ONEWAY : T.LADDER);
        set(x + k2, g - 2, k2 < 4 ? T.EMPTY : T.LADDER);
        set(x + k2, g - 3, k2 < 4 ? T.EMPTY : T.LADDER);
      }
      ent('papyrus', sx + 1.5, g - 3 + 0.7, { id: i });
      x += 5;
      flat(3, false);
    }
  }

  // pack tiles
  L.w = cols.length; L.h = H;
  L.tiles = new Uint8Array(L.w * H);
  for (let xx = 0; xx < L.w; xx++) for (let y = 0; y < H; y++) L.tiles[y * L.w + xx] = cols[xx][y];
  L.exit = ents.find((e) => e.type === 'exit');
  L.coins = ents.filter((e) => e.type === 'coin').length;
  return L;
}

export const tileAt = (L, x, y) => (x < 0 || x >= L.w ? T.SOLID : y < 0 || y >= L.h ? T.EMPTY : L.tiles[y * L.w + x]);
