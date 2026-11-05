// Balancing helper: a scripted builder plays each level with the real economy (buildings, routes,
// vehicles) and reports how long it needs. Deadlines in src/levels.js are set from these times.
// Run: node tools/balance_sim.mjs
import { LEVELS, tierSizes } from '../src/levels.js';
import { PLOTS } from '../src/plots.js';
import { Economy, DEFS, cycleOf, OUT_CAP } from '../src/economy.js';

function bot(E) {
  const L = E.L;
  const has = (t) => E.buildings.filter((b) => b.type === t);
  const freePlot = (terrain) => PLOTS.find((p) => p.terrain === terrain && E.plotFree(p.id));
  const rate = (t) => has(t).filter((b) => b.built).reduce((a, b) => a + 1 / cycleOf(t, b.level), 0);
  const tryBuild = (t) => { if (!L.allowed.includes(t)) return false; const p = freePlot(DEFS[t].terrain); if (p && E.canBuild(t, p.id)) { E.build(t, p.id); return true; } return false; };
  const tryUp = (t) => { const bs = has(t).filter((b) => E.canUpgrade(b)).sort((a, b) => a.level - b.level); if (bs[0]) { E.upgrade(bs[0]); return true; } return false; };
  const freeCount = (terrain) => PLOTS.filter((p) => p.terrain === terrain && E.plotFree(p.id)).length;
  const grow = (t) => (DEFS[t].terrain === 'desert' && freeCount('desert') <= 3 ? (tryUp(t) || tryBuild(t)) : (tryBuild(t) || tryUp(t)));
  // connect every built producer to a consumer, cheapest suitable transport
  for (const b of E.buildings) {
    if (!b.built || !E.produces(b)) continue;
    const mine = E.routes.filter((r) => r.from === b.id);
    if (!mine.length) {
      const targets = E.validTargets(b.id).map((id) => E.node(id));
      targets.sort((x, y) => { const px = E.posOf(x), py = E.posOf(y), pb = E.posOf(b); return Math.hypot(px.u - pb.u, px.v - pb.v) - Math.hypot(py.u - pb.u, py.v - pb.v); });
      for (const t of targets) {
        if (b.type === 'quay' && t.type !== 'site') continue;
        const opt = E.routeOptions(b.id, t.id);
        const pick = opt.types.find((x) => x.type === 'ox' && x.money && x.hands) || opt.types.find((x) => x.money && x.hands);
        if (pick && E.addRoute(b.id, t.id, pick.type)) return;
      }
    } else if (b.out >= OUT_CAP - 1) {
      const r = mine.find((x) => E.canAddVehicle(x));
      if (r && E.addVehicle(r)) return;
    }
  }
  if (!has('mason').length) { grow('mason'); return; }
  if (!has('quarry').length) { grow('quarry'); return; }
  const pending = has('house').filter((b) => !b.built).length * DEFS.house.workers[0];
  if (E.workersFree() + pending < 2) { if (grow('house')) return; if (E.deben < 30) return; }
  if (L.tools && has('quarry').length && !has('smithy').length) { if (!has('mine').length) { grow('mine'); return; } grow('smithy'); return; }
  const eat = has('house').reduce((a, b) => a + (1 + 0.4 * (b.level - 1)) / DEFS.house.eat, 0);
  if (rate('bakery') * 2 < eat * 1.15) { if (rate('farm') < rate('bakery') * 1.1 + 0.05) { if (grow('farm')) return; } else if (grow('bakery')) return; return; }
  if (rate('farm') < rate('bakery')) { if (grow('farm')) return; }
  if (L.tools) {
    const toolNeed = (rate('quarry') + rate('granite')) / 4, tools = rate('smithy') * 2;
    if (tools < toolNeed * 1.1) { if (rate('mine') < rate('smithy') + 0.02) { if (grow('mine')) return; } else if (grow('smithy')) return; return; }
  }
  if (L.graniteTiers && E.placed > E.total * 0.15) {
    if (!has('granite').length) { grow('granite'); return; }
    if (!has('quay').length) { grow('quay'); return; }
    if (E.currentGood() === 'granite' && rate('granite') < 0.3) { if (grow('granite')) return; }
  }
  if (E.site.inv.block >= 6 && E.canUpgrade(E.site)) { E.upgrade(E.site); return; }
  if (rate('quarry') <= rate('mason')) { if (grow('quarry')) return; } else if (grow('mason')) return;
}

for (const [i, L] of LEVELS.entries()) {
  const times = [];
  for (let run = 0; run < 4; run++) {
    const E = new Economy(L, PLOTS, tierSizes(L.base));
    for (const [t, p] of L.prebuilt) E.build(t, p, { free: true, instant: true });
    let t = 0;
    while (!E.done() && t < 4000) { bot(E); E.step(0.5); t += 0.5; }
    times.push(t);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`L${i + 1} base ${L.base}: bot ${avg.toFixed(0)} s (deadline ${L.deadline} s, ratio ${(L.deadline / avg).toFixed(2)})`);
}
