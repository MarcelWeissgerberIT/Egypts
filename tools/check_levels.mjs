// Verifies that every generated level can be finished: starting from the spawn, it tries runs,
// jumps, short hops, ladder climbs and swims with the real platformer physics from every place the
// explorer can stand, and reports levels whose exit or papyrus fragments cannot be reached.
// Enemies and timed traps are ignored; moving platforms count as ledges along their whole path.
// Run: node tools/check_levels.mjs [from] [to]
import { generateLevel, T } from '../jump/src/levels.js';
import { Sim } from '../jump/src/sim.js';

const from = +process.argv[2] || 1, to = +process.argv[3] || 100;
const H = 1 / 60;
const patterns = [];
for (const d of [-1, -0.5, 0, 0.5, 1]) {
  patterns.push({ d, jump: 0 });            // walk / fall off the edge
  patterns.push({ d, jump: 0.5 });          // full jump
  patterns.push({ d, jump: 0.08 });         // short hop
  patterns.push({ d, jump: 0.5, late: 0.18 }); // jump after a short run-up
  patterns.push({ d, jump: 0.5, dbl: 0.35 });  // double jump (where available)
}
patterns.push({ d: 0, climb: 1 }, { d: 0, climb: -1 }, { d: 1, swim: true }, { d: -1, swim: true }, { d: 0, swim: true }, { d: 0, drop: true });

let bad = 0;
const PZ = new Set(['lever', 'plate', 'pedestal', 'block', 'boss']);
for (let n = from; n <= to; n++) {
  const L = generateLevel(n);
  // movers become fixed ledges along their whole path for the check
  const tiles = L.tiles.slice();
  for (const e of L.ents) if (e.type === 'mover') {
    for (let k = 0; k <= Math.ceil(e.len); k++) {
      const x0 = Math.floor(e.x + (e.dx ? k : 0)), y = Math.floor(e.y + (e.dy ? k : 0)) - 1;
      for (let q = 0; q < Math.ceil(e.w); q++) if (y >= 0 && tiles[y * L.w + x0 + q] === T.EMPTY) tiles[y * L.w + x0 + q] = T.ONEWAY;
    }
  }
  const LL = { ...L, tiles, ents: [] };
  // gates open once everything that works them (lever, block + plate, pedestals) is reachable
  const gates = L.ents.filter((e) => e.type === 'gate');
  const opened = new Set(gates.filter((g) => g.startOpen).map((g) => g.gid));
  let points = [];
  const near = (e, r = 1.4) => points.some((p) => Math.abs(p.x - e.x) < r && e.y - p.y > -0.6 && e.y - p.y < 3.6);
  for (let round = 0; round <= gates.length; round++) {
    points = explore(LL, L);
    let more = false;
    for (const gt of gates) {
      if (opened.has(gt.gid)) continue;
      const trig = L.ents.filter((e) => PZ.has(e.type) && e.gid === gt.gid);
      if (trig.length && trig.every((e) => near(e.type === 'plate' || e.type === 'block' ? { x: e.x + 0.5, y: e.y } : e, 1.6))) {
        opened.add(gt.gid); more = true;
        for (let y = gt.y; y < gt.y + gt.h; y++) tiles[y * L.w + gt.x] = T.EMPTY;
      }
    }
    if (!more) break;
  }
  const exitOk = near(L.exit, 1.2);
  const pap = L.ents.filter((e) => e.type === 'papyrus');
  // cracked vaults: reachable if the cracked floor above is reachable
  const papOk = pap.map((e) => near(e, 1.6) || points.some((p) => Math.abs(p.x - e.x) < 1.6 && p.y > e.y && p.y - e.y < 2.6));
  const ok = exitOk && papOk.every(Boolean) && opened.size === gates.length;
  if (!ok) bad++;
  if (!ok || process.argv.includes('-v')) console.log(`level ${n}: ${L.w}x${L.h}, exit ${exitOk ? 'ok' : 'UNREACHABLE'}, papyri ${papOk.map((b) => (b ? 'ok' : 'NO')).join(' ')}, gates ${opened.size}/${gates.length}, reached ${points.length} spots`);
}
console.log(`checked ${to - from + 1} levels, ${bad} with problems`);

function explore(LL, L) {
  const seen = new Set();
  const key = (x, y) => Math.round(x * 2) + ',' + Math.round(y * 2);
  const queue = [{ x: L.spawn.x, y: L.spawn.y }];
  seen.add(key(L.spawn.x, L.spawn.y));
  const points = [];
  let steps = 0;
  while (queue.length && steps < 20000) {
    const s0 = queue.shift(); steps++;
    points.push(s0);
    for (const pt of patterns) {
      if ((pt.dbl && !L.abilities.double)) continue;
      const S = new Sim(LL);
      S.p.x = s0.x; S.p.y = s0.y; S.p.vx = (pt.late ? 0 : pt.d * 7.2); S.p.ground = true;
      S.check = { x: s0.x, y: s0.y };
      let t = 0, landed = null;
      for (let k = 0; k < 150; k++) {
        t += H;
        const I = { x: pt.d, y: pt.climb || (pt.drop ? -1 : 0), jump: false, jumpPressed: false, actionPressed: false };
        const jt = t - (pt.late || 0);
        if (pt.jump && jt > 0 && jt <= pt.jump) { I.jump = true; I.jumpPressed = jt <= H * 1.01; }
        if (pt.dbl && Math.abs(t - pt.dbl) < H * 0.6) { I.jump = true; I.jumpPressed = true; }
        if (pt.swim) { I.jump = true; I.jumpPressed = k % 12 === 0; I.y = 0.2; }
        if (pt.drop && k === 1) { I.jumpPressed = true; I.jump = true; }
        S.step(H, I);
        if (S.p.dead > 0) break;
        const p = S.p;
        if (t > 0.08 && (p.ground || p.climb || p.swim)) {
          landed = { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 };
          if (p.ground || (p.climb && k > 30) || (p.swim && k > 40)) break;
        }
      }
      if (!landed) continue;
      const kk = key(landed.x, landed.y);
      if (!seen.has(kk)) { seen.add(kk); queue.push(landed); }
    }
  }
  return points;
}
