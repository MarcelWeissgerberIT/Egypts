// 100 levels in 10 worlds, generated from hand-tuned patterns with a fixed seed per level.
// Every pattern is built within the explorer's jumping range, so each level can be finished;
// new mechanics are introduced world by world and difficulty rises within each world.
// Levels run to the right and climb upward through tall chambers; gates hold puzzles
// (a lever, a stone block on a pressure plate, symbols in the right order) and carved glyph
// blocks and clay jars hide power-ups.
export const T = { EMPTY: 0, SOLID: 1, ONEWAY: 2, SPIKE: 3, LADDER: 4, WATER: 5, SAND: 6, CRUMBLE: 7, CRACKED: 8, SPIKE_DOWN: 9, GATE: 10, BLOCK: 11, ITEM: 12 };
export const H = 18;                     // minimum level height in tiles (chambers make levels taller)
const HMAX = 72;
export const SYMBOLS = ['ankh', 'lotus', 'djed', 'falcon'];
export const POWERS = ['shield', 'stick', 'feather', 'sun'];
// the guardian at the end of every world; the last one is the dead pharaoh
export const BOSSES = ['scarabking', 'colossus', 'sobek', 'queen', 'mummylord', 'apep', 'anubis', 'sphinx', 'ammit', 'pharaoh'];

// world themes: background painting, block texture, light mood and what appears there
export const WORLDS = [
  { key: 'entrance', tex: 'sandstone', tint: 0xffe2b8, amb: 1.0, fog: 0x3a2050, sky: 0xffc98a, enemies: ['scarab', 'mummy'], feats: ['tower'] },
  { key: 'hieroglyphs', tex: 'sandstone', tint: 0xf0d4b0, amb: 0.9, fog: 0x2e1848, sky: 0xd8a0ff, enemies: ['scarab', 'mummy', 'hopper'], feats: ['tower', 'ladder', 'crumble'] },
  { key: 'cistern', tex: 'sandstone', tint: 0xc8e0e8, amb: 0.85, fog: 0x15304a, sky: 0x60e0ff, enemies: ['scarab', 'mummy', 'bat'], feats: ['tower', 'ladder', 'crumble', 'water', 'mover'] },
  { key: 'scarabs', tex: 'sandstone', tint: 0xe8c890, amb: 0.85, fog: 0x2a1a30, sky: 0xffb860, enemies: ['scarab', 'bat', 'flyer', 'hopper'], feats: ['tower', 'ladder', 'crumble', 'mover', 'darts'] },
  // the dark world: only torches give light; the explorer carries one and lights those on the walls
  { key: 'crypt', tex: 'granite', tint: 0xb8a8d8, amb: 0.35, fog: 0x06030c, sky: 0x8060ff, dark: true, torchlit: true, enemies: ['scarab', 'bat', 'mummy', 'flyer'], feats: ['tower', 'ladder', 'crumble', 'darts', 'water'] },
  { key: 'sandfalls', tex: 'sandstone', tint: 0xffd09a, amb: 0.95, fog: 0x3a2030, sky: 0xffa050, enemies: ['scarab', 'bat', 'hopper', 'mummy', 'jackal'], feats: ['tower', 'sand', 'sandfall', 'boulder', 'crumble', 'mover'] },
  { key: 'traps', tex: 'granite', tint: 0xd8b0a0, amb: 0.7, fog: 0x200a14, sky: 0xff6050, enemies: ['scarab', 'mummy', 'flyer', 'hopper', 'jackal'], feats: ['tower', 'crusher', 'fire', 'darts', 'mover', 'vmover', 'crumble'] },
  { key: 'treasury', tex: 'sandstone', tint: 0xffe08a, amb: 1.0, fog: 0x3a2410, sky: 0xffd040, enemies: ['scarab', 'bat', 'cobra', 'flyer', 'jackal'], feats: ['tower', 'mover', 'vmover', 'fire', 'crumble', 'darts', 'water'] },
  { key: 'stars', tex: 'granite', tint: 0xb0c0ff, amb: 0.7, fog: 0x080a28, sky: 0x9fb0ff, enemies: ['bat', 'mummy', 'cobra', 'flyer', 'hopper', 'jackal'], feats: ['tower', 'shaft', 'mover', 'vmover', 'crumble', 'crusher', 'sand'] },
  { key: 'king', tex: 'granite', tint: 0xffb0c8, amb: 0.75, fog: 0x200818, sky: 0xd060ff, enemies: ['scarab', 'bat', 'mummy', 'cobra', 'flyer', 'hopper', 'jackal'], feats: ['tower', 'shaft', 'crusher', 'fire', 'darts', 'boulder', 'mover', 'vmover', 'crumble', 'sand', 'water'] },
];

// what a level looks like: block stone, background painting, statues and things standing around,
// banner colour. Each world has a few of each; the levels of a world cycle through them.
const LOOKS = {
  entrance: { tex: ['sandstone', 'limestone'], props: ['palm', 'vase', 'pharaoh', 'column', 'brazier', 'cat'], banner: '#7a2ab0' },
  hieroglyphs: { tex: ['sandstone', 'limestone'], props: ['vase', 'cat', 'anubis', 'column', 'brazier', 'pharaoh'], banner: '#1f8a8a' },
  cistern: { tex: ['limestone', 'sandstone', 'basalt'], props: ['palm', 'vase', 'column', 'cat'], banner: '#2a5ab0' },
  scarabs: { tex: ['sandstone', 'mudbrick'], props: ['treasure', 'cat', 'vase', 'column', 'brazier'], banner: '#b0601a' },
  crypt: { tex: ['granite', 'basalt'], props: ['sarcophagus', 'anubis', 'vase', 'brazier'], banner: '#4a2a70' },
  sandfalls: { tex: ['sandstone', 'mudbrick'], props: ['column', 'pharaoh', 'palm', 'vase'], banner: '#b0401a' },
  traps: { tex: ['granite', 'basalt', 'mudbrick'], props: ['brazier', 'column', 'anubis', 'vase'], banner: '#a01a2a' },
  treasury: { tex: ['sandstone', 'limestone'], props: ['treasure', 'cat', 'pharaoh', 'vase', 'sarcophagus'], banner: '#c08a10' },
  stars: { tex: ['granite', 'basalt', 'limestone'], props: ['cat', 'anubis', 'column', 'brazier'], banner: '#2a3ab0' },
  king: { tex: ['granite', 'basalt', 'limestone'], props: ['pharaoh', 'sarcophagus', 'anubis', 'treasure', 'brazier'], banner: '#8a1ab0' },
};
export const PROPS = ['pharaoh', 'anubis', 'vase', 'sarcophagus', 'brazier', 'palm', 'treasure', 'cat', 'column'];

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
  // Fisher-Yates with the level's own random numbers (Array.sort differs between browsers)
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const W = WORLDS[world - 1];
  const A = abilities(world);
  const d = Math.min(1, (world - 1) / 9 * 0.75 + (index - 1) / 9 * 0.35);   // difficulty 0..1
  const maxGap = (A.double ? 6 : 4) - (d < 0.25 ? 1 : 0);
  const maxUp = A.double ? 3 : 2;
  const bossLevel = index === 10;
  const width = Math.round((64 + world * 9 + index * 6) * (bossLevel ? 0.62 : 1));
  const cols = [];                       // columns of tile codes
  const ents = [];
  const full = [];                       // columns filled solid from a height up to the ceiling
  const L = { n, world, index, theme: W, abilities: A, ents };
  // decoration has its own random numbers, so it never changes the layout
  const RD = rng(n * 104729 + 77);
  const look = LOOKS[W.key];
  const shuffled = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(RD() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  L.style = {
    tex: look.tex[Math.floor((index - 1) / 2) % look.tex.length],
    bg: `w${world}${index % 2 === 0 ? 'b' : ''}`,
    props: shuffled(look.props).slice(0, 3),
    banner: look.banner,
    hue: (RD() - 0.5) * 0.12, light: 0.9 + RD() * 0.2, banners: RD() < 0.75,
  };
  let x = 0, g = 4;                      // cursor and ground height (player stands at y = g)
  let calm = false;                      // no random enemies while building puzzle rooms
  let gid = 0;                           // puzzle / gate ids
  const col = () => new Uint8Array(HMAX);
  const ensure = (xx) => { while (cols.length <= xx) cols.push(col()); };
  const set = (xx, y, t) => { if (y < 0 || y >= HMAX) return; ensure(xx); cols[xx][y] = t; };
  const get = (xx, y) => (xx < 0 || xx >= cols.length || y < 0 || y >= HMAX ? 0 : cols[xx][y]);
  const ground = (xx, h, t = T.SOLID) => { ensure(xx); for (let y = 0; y < h; y++) cols[xx][y] = t; };
  const ent = (type, ex, ey, o = {}) => { const e = { type, x: ex, y: ey, ...o }; ents.push(e); return e; };
  const coinArc = (x0, x1, y0, hgt) => { for (let xx = x0; xx <= x1; xx++) { const t = (xx - x0) / Math.max(1, x1 - x0); ent('coin', xx + 0.5, y0 + 0.6 + Math.sin(t * Math.PI) * hgt); } };
  const coinRow = (x0, x1, y) => { for (let xx = x0; xx <= x1; xx += 1) ent('coin', xx + 0.5, y + 0.6); };
  const setG = (ng) => { g = Math.max(2, Math.min(HMAX - 16, ng)); };

  // enemies: beetles from the first level, mummies from level 3, more kinds world by world
  const foeTypes = W.enemies.filter((t) => !(t === 'mummy' && world === 1 && index < 3));
  const foeRate = 0.38 + d * 0.3;
  const foe = (ex, gy, type = pick(foeTypes)) => {
    if (type === 'bat') ent('bat', ex + 0.5, gy + 2.6, { r: 1.2 + R() });
    else if (type === 'flyer') ent('flyer', ex + 0.5, gy + 2.3, { r: 1.5 + R() * 1.5, ph: R() * 6 });
    else if (type === 'cobra') ent('cobra', ex + 0.5, gy);
    else ent(type, ex + 0.5, gy, { dir: R() < 0.5 ? -1 : 1 });
  };
  const flat = (w, coins = true) => {
    for (let k = 0; k < w; k++) ground(x + k, g);
    if (coins && R() < 0.6) coinRow(x + 1, x + w - 2, g + (R() < 0.5 ? 0 : 2));
    if (R() < (W.torchlit ? 0.6 : 0.35)) ent('torch', x + ri(1, w - 1) + 0.5, g + 2.2, { lit: !W.torchlit });
    if (!calm && w >= 3 && x > 15 && R() < foeRate) foe(x + ri(1, w - 2), g);
    if (w >= 3 && RD() < 0.55) ent('prop', x + Math.floor(RD() * w) + 0.5, g, { kind: L.style.props[Math.floor(RD() * L.style.props.length)], yaw: (RD() - 0.5) * 0.6 });
    if (L.style.banners && w >= 4 && RD() < 0.3) ent('banner', x + Math.floor(RD() * w) + 0.5, g + 3.4);
    if (!calm && w >= 4 && x > 12 && R() < 0.1) jar(x + ri(1, w - 2), g);
    x += w;
  };

  // power-ups: a few per level, hidden in glyph blocks (hit from below) and clay jars
  const kinds = world === 1 ? ['stick', 'shield', 'feather', 'stick'] : POWERS;
  let powersLeft = index <= 2 ? 2 : 1 + (R() < 0.5 ? 1 : 0);
  const takePower = () => { if (powersLeft <= 0) return null; powersLeft--; return pick(kinds); };
  function jar(jx, jy) { const p = R() < 0.3 ? takePower() : null; ent('jar', jx + 0.5, jy, { item: p || 'coins' }); }

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
      const n2 = ri(2, 3 + Math.round(d * 2));
      let px = x, py = g;
      const base = g;
      for (let k = 0; k < n2; k++) {
        const gapW = ri(2, Math.min(maxGap - 1, 3 + Math.round(d)));
        px += gapW;
        py = Math.max(base - 1, Math.min(base + maxUp, py + ri(-1, maxUp)));
        const pw = ri(2, d > 0.6 ? 2 : 3);
        for (let q = 0; q < pw; q++) set(px + q, py - 1, R() < 0.5 && W.key !== 'entrance' ? T.ONEWAY : T.SOLID);
        coinRow(px, px + pw - 1, py);
        if (k === n2 - 1 && R() < 0.3) ent('ankh', px + 0.5, py + 1.5);
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
      // half the time the way back down is a second ladder
      if (R() < 0.5) { const dn = ri(2, h); for (let y = top - dn; y < top; y++) set(x, y, T.LADDER); ground(x, top - dn); x++; setG(top - dn); flat(3); }
      else { setG(top - ri(2, h)); flat(3); }
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
      const was = calm; calm = true; flat(w, false); calm = was;
      coinRow(start + 2, start + w - 3, g + 2);
      const n2 = 2 + (d > 0.45 ? 1 : 0);
      for (let k = 0; k < n2; k++) foe(start + 3 + k * Math.floor((w - 4) / n2), g);
    },
    // a row of carved glyph blocks above the path: bump them from below for coins or a power-up
    treasure() {
      const w = ri(7, 9);
      const start = x;
      const was = calm; calm = true; flat(w, false); calm = was;
      const nb = ri(1, 3), bx = start + ri(2, 3), slot = ri(0, nb - 1);
      for (let k = 0; k < nb; k++) {
        const pw = k === slot ? takePower() : null;
        set(bx + k, g + 3, T.ITEM);
        ent('itemblock', bx + k, g + 3, { item: pw || 'coin', n: pw ? 1 : ri(1, 4) });
      }
      coinRow(bx, bx + nb - 1, g + 4);
      if (d > 0.2 && R() < 0.6) foe(start + w - 2, g, pick(foeTypes.filter((t) => t !== 'bat' && t !== 'flyer').concat(['scarab'])));
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
      const was = calm; calm = true; flat(w, false); calm = was;
      for (let k = -1; k <= w; k++) set(start + k, g + 5, T.SOLID);
      const nc = 1 + Math.floor(w / 4);
      for (let k = 0; k < nc; k++) ent('crusher', start + 1.5 + k * 3, g + 5, { drop: 5, period: 2.6 - d * 0.6, phase: k * 0.8 });
      coinRow(start + 1, start + w - 2, g);
    },
    fire() {
      const w = ri(7, 10);
      const start = x;
      const was = calm; calm = true; flat(w, false); calm = was;
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
      const was = calm; calm = true;
      while (x < end - 6) {
        if (R() < 0.5) { flat(ri(3, 5)); } else { const w = ri(2, 3); coinArc(x, x + w - 1, g, 2); x += w; flat(3); }
      }
      calm = was;
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
      ent('chamber', x, base, { w: wide, h: h + 3 });
      x += wide;
      setG(base + h - 1);
      for (let k = 0; k < 5; k++) ground(x + k, g);
      x += 5;
    },
    // a tall chamber climbed by ledges, ladders and lifts; the path goes on high up
    tower() {
      const rise = Math.min(HMAX - 18 - g, ri(6, 9 + Math.round(d * 8)) + (index % 5 === 0 ? 4 : 0));
      if (rise < 5) { P.descent(); return; }
      flat(3, false);
      const wide = 8, base = g, x0 = x, top = base + rise;
      for (let k = 0; k < wide; k++) ground(x0 + k, base);
      // entrance on the left (a doorway), exit opening in the right wall at the top
      for (let y = base + 4; y < top + 6; y++) set(x0 - 1, y, T.SOLID);
      ground(x0 + wide, top);
      ent('chamber', x0, base, { w: wide, h: rise + 6 });
      const was = calm; calm = true;
      let y = base, side = 0;                   // side the explorer stands on: 0 left, 1 right
      const ladders = W.feats.includes('ladder') || world >= 1;
      const lifts = W.feats.includes('vmover');
      const ledge = (s, sy, w = 4) => { for (let q = 0; q < w; q++) set(s === 0 ? x0 + q : x0 + wide - 1 - q, sy - 1, T.ONEWAY); };
      while (top - y > 2) {
        const left = top - y;
        const r = R();
        if (lifts && r < 0.25 && left >= 4) {
          // a lift in the middle carries the explorer up to a ledge on the other side
          const up = Math.min(left, ri(3, 5));
          ent('mover', x0 + 3, y, { w: 2, dy: 1, len: up, speed: 1.4 + d * 0.6 });
          y += up; side = 1 - side; ledge(side, y, 3);
        } else if (ladders && r < 0.55 && left >= 4) {
          // a ladder at the inner edge of this ledge, then a ledge on the other side at its top
          const up = Math.min(left, ri(3, 5));
          const lx = side === 0 ? x0 + 3 : x0 + wide - 4;
          if (y > base) ledge(side, y);
          for (let q = y; q < y + up; q++) set(lx, q, T.LADDER);
          y += up; side = 1 - side; ledge(side, y);
          if (R() < 0.5) ent('coin', lx + 0.5, y - 1.2);
        } else {
          const up = Math.min(left, 2);
          y += up; side = 1 - side; ledge(side, y, 3 + (R() < 0.4 ? 1 : 0));
          ent('coin', (side === 0 ? x0 + 1 : x0 + wide - 2) + 0.5, y + 1.4);
        }
        if (R() < 0.18 + d * 0.2 && foeTypes.some((t) => t === 'bat' || t === 'flyer')) foe(x0 + 3, y - 1, foeTypes.includes('flyer') ? 'flyer' : 'bat');
      }
      // the top ledge leads to the exit on the right
      ledge(1, top, 4);
      calm = was;
      x = x0 + wide + 1;
      setG(top);
      flat(3);
    },
    // down again: a cliff with a ladder and coins in the fall line
    descent() {
      const drop = Math.min(g - 3, ri(4, 9));
      if (drop < 3) { P.run(); return; }
      flat(2, false);
      const base = g - drop, x0 = x;
      for (let y = base; y < g; y++) set(x0, y, T.LADDER);
      ground(x0, base);
      for (let k = 1; k < 4; k++) ground(x0 + k, base);
      for (let y = base + 1; y < g; y += 2) ent('coin', x0 + 2.5, y + 0.6);
      if (drop > 5) { set(x0 + 3, base + 3, T.ONEWAY); }
      x = x0 + 4;
      setG(base);
      flat(3);
    },
  };

  // ---------------------------------------------------------------- puzzles
  // a gate in a wall that reaches the ceiling
  function gate(gx, id, h = 3) { for (let y = g; y < g + h; y++) set(gx, y, T.GATE); ground(gx, g); full.push([gx, g + h]); ent('gate', gx, g, { h, gid: id, gem: id % 4 }); }
  const PZ = {
    // the lever sits up on a ledge, down in a pit or behind a short climb
    lever() {
      const id = gid++;
      calm = true;
      flat(3, false);
      const variant = g >= 5 && R() < 0.4 ? 'pit' : R() < 0.5 ? 'ledge' : 'steps';
      const s = x;
      if (variant === 'pit') {
        flat(2, false);
        const px = x;
        for (let k = 0; k < 5; k++) ground(px + k, g - 3);
        for (let y = g - 3; y < g; y++) set(px, y, T.LADDER);
        ent('lever', px + 3.5, g - 3, { gid: id, gem: id % 4 });
        ent('torch', px + 2.5, g - 1);
        x += 5;
        flat(4, false);
      } else if (variant === 'ledge') {
        flat(3, false);
        const lx = x;
        flat(6, false);
        for (let y = g; y < g + 4; y++) set(lx, y, T.LADDER);
        for (let k = 1; k < 5; k++) set(lx + k, g + 3, T.SOLID);
        ent('lever', lx + 3.5, g + 4, { gid: id, gem: id % 4 });
        flat(2, false);
      } else {
        flat(2, false);
        const sx = x;
        flat(8, false);
        set(sx + 1, g + 1, T.ONEWAY); set(sx + 2, g + 1, T.ONEWAY);
        set(sx + 4, g + 3, T.ONEWAY); set(sx + 5, g + 3, T.ONEWAY); set(sx + 6, g + 3, T.ONEWAY);
        ent('lever', sx + 5.5, g + 4, { gid: id, gem: id % 4 });
      }
      coinRow(s + 1, s + 3, g + 2);
      gate(x, id); x++;
      calm = false;
      flat(3);
    },
    // a stone block must rest on the pressure plate in front of the gate
    block() {
      const id = gid++;
      calm = true;
      flat(2, false);
      // a step down into the room keeps the block inside
      setG(g + 1); flat(2, false); setG(g - 1);
      const s = x, w = 11;
      flat(w, false);
      // the plate lies in front of the gate, or back at the start: then the block goes the other way
      if (index <= 3 || R() < 0.5) {
        set(s + 3, g, T.BLOCK); ent('block', s + 3, g, { gid: id });
        ent('plate', s + w - 1, g, { gid: id, gem: id % 4 });
      } else {
        set(s + 6, g, T.BLOCK); ent('block', s + 6, g, { gid: id });
        ent('plate', s + 1, g, { gid: id, gem: id % 4 });
        coinRow(s + 8, s + 9, g + 2);
      }
      gate(x, id); x++;
      calm = false;
      flat(3);
    },
    // a tablet shows symbols in order; pedestals carry them in another order
    symbols() {
      const id = gid++;
      calm = true;
      flat(2, false);
      const s = x, nsym = world >= 4 ? 4 : 3, w = 6 + nsym * 3;
      flat(w, false);
      const seq = shuffle(SYMBOLS).slice(0, nsym);
      let order = seq;
      for (let t = 0; t < 8 && order.every((v, i) => v === seq[i]); t++) order = shuffle(seq);
      if (order.every((v, i) => v === seq[i])) order = seq.slice(1).concat(seq[0]);
      ent('tablet', s + 1.5, g + 2.4, { gid: id, seq });
      order.forEach((sym, i) => {
        const px = s + 5 + i * 3;
        // in later worlds one pedestal stands up on a ledge
        if (world >= 3 && i === nsym - 1 && R() < 0.6) { set(px - 1, g + 1, T.ONEWAY); set(px, g + 1, T.ONEWAY); set(px + 1, g + 1, T.ONEWAY); ent('pedestal', px + 0.5, g + 2, { gid: id, sym }); }
        else ent('pedestal', px + 0.5, g, { gid: id, sym });
      });
      ent('torch', s + 0.5, g + 2.2);
      gate(x, id); x++;
      calm = false;
      flat(3);
    },
  };

  // start: entrance hall
  flat(10, false);
  L.spawn = { x: 4.5, y: g };
  ent('torch', 2.5, g + 2.2, { lit: true });
  const pool = ['run', 'hill', 'gap', 'gap', 'floaters', 'spikes', 'stairs', 'treasure', 'patrol'];
  const feat = { ladder: 'ladder', crumble: 'crumble', water: 'pool', mover: 'mover', vmover: 'vmover', darts: 'darts', crusher: 'crusher', fire: 'fire', sand: 'sand', sandfall: 'sandfall', boulder: 'boulder', shaft: 'shaft', tower: 'tower' };
  for (const f of W.feats) pool.push(feat[f], feat[f]);
  if (foeTypes.length) pool.push('patrol', 'patrol', 'patrol');
  // every fifth level is an ascent with more chambers
  if (index === 5 || index === 10 || index === 8) pool.push('tower', 'tower', 'tower');
  // the newest mechanic of the world shows up early so it is learnt in a calm spot
  const intro = W.feats[W.feats.length - 1] ? feat[W.feats[W.feats.length - 1]] : 'floaters';
  // puzzles: one from the second level on, two later; each kind is introduced once
  const pzKinds = world === 1 && index < 5 ? ['lever', 'block'] : ['lever', 'block', 'symbols'];
  const firstPz = { 2: 'lever', 3: 'block', 5: 'symbols' }[n];
  const nPz = n === 1 ? 0 : (index <= 3 && world === 1) ? 1 : 1 + (R() < 0.45 + d * 0.3 ? 1 : 0);
  const puzzlesAt = nPz === 1 ? [Math.round(width * 0.45)] : nPz === 2 ? [Math.round(width * 0.35), Math.round(width * 0.7)] : [];
  let pzDone = 0;
  let lastCheck = 0, k = 0, lastPat = '';
  const secretsAt = [0.25, 0.55, 0.82].map((f) => Math.round(f * width));
  let secret = 0;
  while (x < width) {
    let p = k === 0 && (index <= 3 || n <= 12) ? 'treasure' : k === 1 ? intro : k === 2 && index <= 3 ? 'patrol' : pick(pool);
    if (p === lastPat && R() < 0.7) p = pick(pool);
    if (p === 'boulder' && (x > width - 45 || index < 3)) p = 'run';
    if (p === 'tower' && g > 30) p = 'descent';
    if (g > 24 && R() < 0.25) p = 'descent';
    lastPat = p;
    P[p]();
    k++;
    if (pzDone < puzzlesAt.length && x >= puzzlesAt[pzDone]) {
      const kind = pzDone === 0 && firstPz ? firstPz : pick(pzKinds);
      if (x - lastCheck > 18) { flat(3, false); ent('checkpoint', x - 1.5, g); lastCheck = x; }
      PZ[kind](); pzDone++;
    }
    if (x - lastCheck > 42 && x < width - 10) { flat(3, false); ent('checkpoint', x - 1.5, g); lastCheck = x; }
    if (secret < 3 && x >= secretsAt[secret]) { placeSecret(secret); secret++; }
  }
  while (secret < 3) { placeSecret(secret); secret++; }
  if (bossLevel) arena();
  // finish: the golden door
  flat(4, false);
  ent('exit', x + 2, g);
  flat(7, false);
  full.push([x, 0]);
  ensure(x);
  x++;

  // the guardian's hall: a closed arena; the door shuts behind the explorer and opens again when
  // the guardian falls, then the way to the golden door is free
  function arena() {
    calm = true;
    const kind = BOSSES[world - 1];
    // a power-up and a checkpoint before the fight
    flat(3, false);
    set(x + 1, g + 3, T.ITEM); ent('itemblock', x + 1, g + 3, { item: world % 2 ? 'shield' : 'stick', n: 1 });
    set(x + 3, g + 3, T.ITEM); ent('itemblock', x + 3, g + 3, { item: world % 2 ? 'stick' : 'shield', n: 1 });
    flat(6, false);
    ent('checkpoint', x - 1.5, g);
    flat(2, false);
    const AW = 24, ax0 = x, fy = g, top = g + 11, id = gid++;
    // entry door (open until the fight starts) and the wall above it
    ground(ax0, g); full.push([ax0, g + 4]);
    ent('gate', ax0, g, { h: 4, gid: id + 1000, gem: 1, startOpen: true, entry: true });
    x = ax0 + 1;
    flat(AW, false);
    for (let xx = ax0; xx <= ax0 + AW + 1; xx++) set(xx, top, T.SOLID);
    // two side ledges and a higher middle ledge to dodge and to jump from
    for (let q = 0; q < 4; q++) { set(ax0 + 4 + q, g + 1, T.ONEWAY); set(ax0 + AW - 7 + q, g + 1, T.ONEWAY); }
    for (let q = 0; q < 5; q++) set(ax0 + 10 + q, g + 3, T.ONEWAY);
    if (kind === 'sobek') {
      // a pool in the middle of the hall
      for (let q = 0; q < 8; q++) { const cx = ax0 + 9 + q; ground(cx, g - 3); for (let y = g - 3; y < g; y++) set(cx, y, T.WATER); }
    }
    for (const tx of [ax0 + 2, ax0 + AW - 1, ax0 + 9, ax0 + 17]) ent('torch', tx + 0.5, g + 3.6, { lit: true });
    ent('boss', ax0 + AW * 0.68, fy, { kind, gid: id, ax0: ax0 + 1, ax1: ax0 + AW + 1, fy, top, holes: [ax0 + 2.6, ax0 + 12.5, ax0 + AW - 1.6], ledges: [[ax0 + 4, ax0 + 8], [ax0 + AW - 7, ax0 + AW - 3]] });
    ent('chamber', ax0, fy, { w: AW + 1, h: 11 });
    // exit door, opened when the guardian falls
    gate(x, id); x++;
    calm = false;
  }

  // three hidden papyrus fragments per level
  function placeSecret(i) {
    const kind = (n + i) % 3;
    calm = true;
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
      // a cellar under a plank floor: drop through (down + jump) or climb down the ladder
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
    calm = false;
  }

  // level height: everything built plus room above
  let topY = H - 9;
  for (const c of cols) for (let y = HMAX - 1; y > topY; y--) if (c[y]) { topY = y; break; }
  for (const e of ents) if (e.y + 3 > topY) topY = Math.ceil(e.y + 3);
  L.h = Math.min(HMAX, Math.max(H, topY + 9));
  for (const [cx, y0] of full) for (let y = y0; y < L.h; y++) cols[cx][y] = T.SOLID;
  // pack tiles
  L.w = cols.length;
  L.tiles = new Uint8Array(L.w * L.h);
  for (let xx = 0; xx < L.w; xx++) for (let y = 0; y < L.h; y++) L.tiles[y * L.w + xx] = cols[xx][y];
  L.exit = ents.find((e) => e.type === 'exit');
  L.coins = ents.filter((e) => e.type === 'coin').length;
  return L;
}

export const tileAt = (L, x, y) => (x < 0 || x >= L.w ? T.SOLID : y < 0 || y >= L.h ? T.EMPTY : L.tiles[y * L.w + x]);
