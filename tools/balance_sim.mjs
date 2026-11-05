// Balancing helper: a scripted builder plays each production level with the real economy
// and reports how long it needs. Deadlines in src/levels.js are set from these times.
// Run: node tools/balance_sim.mjs
import { LEVELS, tierSizes } from '../src/levels.js';
import { PLOTS } from '../src/plots.js';
import { Economy, DEFS, upgradeCost, cycleOf } from '../src/economy.js';

function bot(E) {
  const L = E.L;
  const has = (t) => E.buildings.filter((b) => b.type === t);
  const freePlot = (terrain) => PLOTS.find((p) => p.terrain === terrain && E.plotFree(p.id));
  const rate = (t) => has(t).filter((b) => b.built).reduce((a, b) => a + 1 / cycleOf(t, b.level), 0);
  const tryBuild = (t) => { const p = freePlot(DEFS[t].terrain); if (p && E.canBuild(t, p.id)) { E.build(t, p.id); return true; } return false; };
  const tryUp = (t) => { const bs = has(t).filter((b) => E.canUpgrade(b)).sort((a, b) => a.level - b.level); if (bs[0]) { E.upgrade(bs[0]); return true; } return false; };
  const grow = (t) => tryBuild(t) || tryUp(t);
  if (!has('mason').length) { grow('mason'); return; }
  if (!has('quarry').length) { grow('quarry'); return; }
  if (E.workersFree() < 2) { if (grow('house')) return; if (E.deben < 30) return; }
  const eat = has('house').reduce((a, b) => a + (1 + 0.4 * (b.level - 1)) / DEFS.house.eat, 0);
  const bread = rate('bakery') * 2, grain = rate('farm');
  if (bread < eat * 1.15) { if (grain < rate('bakery') * 1.1 + 0.05) { if (grow('farm')) return; } else if (grow('bakery')) return; return; }
  if (grain < rate('bakery')) { if (grow('farm')) return; }
  if (L.tools) {
    const toolNeed = rate('quarry') / 4, tools = rate('smithy') * 2;
    if (tools < toolNeed * 1.1) { if (rate('mine') < rate('smithy') + 0.02) { if (grow('mine')) return; } else if (grow('smithy')) return; return; }
  }
  if (rate('quarry') <= rate('mason')) { if (grow('quarry')) return; } else if (grow('mason')) return;
}

for (const [i, L] of LEVELS.entries()) {
  const times = [];
  for (let run = 0; run < 5; run++) {
    const E = new Economy(L, PLOTS, tierSizes(L.base).map((n) => n * n));
    for (const [t, p] of L.prebuilt) E.build(t, p, { free: true, instant: true });
    let t = 0;
    while (!E.done() && t < 3000) { if (Math.floor(t * 2) % 2 === 0) bot(E); E.step(0.5); t += 0.5; }
    times.push(t);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`L${i + 1} base ${L.base}: bot finishes in ${avg.toFixed(0)} s (deadline ${L.deadline} s, ratio ${(L.deadline / avg).toFixed(2)})`);
}
