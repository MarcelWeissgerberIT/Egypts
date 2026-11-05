import { LEVELS, tierSizes } from '../src/levels.js';
import { Tier } from '../src/logic.js';
import { randomPiece, rotate, makePiece } from '../src/pieces.js';
const fitsAny = (T, p) => { let c = p.cells; for (let r = 0; r < 4; r++) { if (T.anyFit(c)) return true; c = rotate(c); } return false; };
for (const [li, L] of LEVELS.entries()) {
  let shuffles = 0, places = 0, cells = 0, lines = 0, budget = 0, runs = 200;
  for (let run = 0; run < runs; run++) {
    for (const [t, n] of tierSizes(L.base).entries()) {
      const T = new Tier(n, t); T.setup(L.granite[t] || 0, L.ankhs[t] || 0, Math.random);
      budget += T.emptyCount() * L.secPerCell + 8; cells += T.emptyCount();
      const gen = (ensure) => { for (let a = 0; a < (ensure ? 60 : 1); a++) { const p = randomPiece(L.set, n, T.emptyCount(), L.gold); if (!ensure || fitsAny(T, p)) return p; } return makePiece('o1'); };
      const tray = [];
      const refill = (k) => { tray[k] = gen(false); if (!tray.some((p) => p && fitsAny(T, p)) && Math.random() < L.fair) tray[k] = gen(true); };
      for (let k = 0; k < 3; k++) refill(k);
      let guard = 0;
      while (!T.full() && guard++ < 500) {
        // greedy: pick the placement that touches most filled neighbours / edges
        let best = null;
        tray.forEach((p, k) => { let c = p.cells; for (let r = 0; r < 4; r++) { for (let aj = 0; aj < n; aj++) for (let ai = 0; ai < n; ai++) if (T.canPlace(c, ai, aj)) {
          let sc = 0; for (const [x, y] of c) { const i = ai + x, j = aj + y; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const a = i + dx, b = j + dy; if (!T.inside(a, b) || T.get(a, b)) sc++; } }
          sc += c.length * 0.5 + Math.random() * 0.5;
          if (!best || sc > best.sc) best = { sc, k, c, ai, aj }; } c = rotate(c); } });
        if (!best) { shuffles++; const keep = Math.floor(Math.random() * 3); for (let k = 0; k < 3; k++) tray[k] = k === keep ? gen(true) : gen(false); continue; }
        const r = T.place(best.c, best.ai, best.aj, 1); lines += r.rows.length + r.cols.length; places++;
        refill(best.k);
      }
    }
  }
  console.log(`L${li + 1} base ${L.base}: places/run ${(places / runs).toFixed(1)}, cells ${(cells / runs).toFixed(0)}, shuffles/run ${(shuffles / runs).toFixed(2)}, lines/run ${(lines / runs).toFixed(1)}, time budget ${(budget / runs).toFixed(0)}s -> ${(budget / places).toFixed(1)} s per move`);
}
