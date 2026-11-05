// Balancing helper: a greedy bot plays every level many times with the real rules
// (new stones only after all three are used, shuffle on dead ends) and reports how many
// seconds per move each level grants. Run: node tools/balance_sim.mjs
import { LEVELS, tierSizes } from '../src/levels.js';
import { Tier } from '../src/logic.js';
import { randomPiece, rotate, makePiece } from '../src/pieces.js';

const TARGET = [3.6, 3.2, 3.0, 2.8, 2.6, 2.4];   // intended seconds per move incl. bonuses
const fitsAny = (T, p) => { let c = p.cells; for (let r = 0; r < 4; r++) { if (T.anyFit(c)) return true; c = rotate(c); } return false; };
for (const [li, L] of LEVELS.entries()) {
  const runs = 300;
  let shuffles = 0, places = 0, cells = 0, lines = 0, ankhs = 0, tiers = 0, budget = 0;
  for (let run = 0; run < runs; run++) {
    for (const [t, n] of tierSizes(L.base).entries()) {
      const T = new Tier(n, t); T.setup(L.granite[t] || 0, L.ankhs[t] || 0, Math.random);
      tiers++; cells += T.emptyCount(); ankhs += T.ankhs.size;
      budget += T.emptyCount() * L.secPerCell + 3;
      const gen = (ensure) => { for (let a = 0; a < (ensure ? 60 : 1); a++) { const p = randomPiece(L.set, n, T.emptyCount(), L.gold); if (!ensure || fitsAny(T, p)) return p; } return makePiece('o1'); };
      let tray = [null, null, null];
      const refillAll = () => { tray = [gen(false), gen(false), gen(false)]; if (!tray.some((p) => fitsAny(T, p)) && Math.random() < L.fair) tray[Math.floor(Math.random() * 3)] = gen(true); };
      refillAll();
      let guard = 0;
      while (!T.full() && guard++ < 800) {
        let best = null;
        tray.forEach((p, k) => { if (!p) return; let c = p.cells; for (let r = 0; r < 4; r++) { for (let aj = 0; aj < n; aj++) for (let ai = 0; ai < n; ai++) if (T.canPlace(c, ai, aj)) {
          let sc = 0; for (const [x, y] of c) { const i = ai + x, j = aj + y; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + dx, b = j + dy; if (!T.inside(a, b) || T.get(a, b)) sc++; } }
          sc += c.length * 0.5 + Math.random() * 0.5;
          if (!best || sc > best.sc) best = { sc, k, c, ai, aj }; } c = rotate(c); } });
        if (!best) { shuffles++; tray = [gen(true), gen(false), gen(false)]; continue; }
        const r = T.place(best.c, best.ai, best.aj, 1); lines += r.rows.length + r.cols.length; places++;
        tray[best.k] = null;
        if (tray.every((p) => !p)) refillAll();
      }
    }
  }
  const m = places / runs;
  const spc = (TARGET[li] * places - 3 * tiers - lines - 3 * ankhs) / cells;
  const eff = (budget + lines + 3 * ankhs) / places;
  console.log(`L${li + 1} base ${L.base}: moves ${m.toFixed(1)}, shuffles ${(shuffles / runs).toFixed(2)}, current ${eff.toFixed(2)} s/move, secPerCell for target ${TARGET[li]}: ${spc.toFixed(2)}`);
}
