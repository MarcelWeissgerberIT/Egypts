// Balancing helper: a scripted builder plays each level with the real economy (deposits, roads,
// carriers) and reports how long it needs. Deadlines in src/levels.js are set from these times.
// Run: node tools/balance_sim.mjs
import { LEVELS, tierSizes } from '../src/levels.js';
import { PLOTS } from '../src/map.js';
import { Economy, DEFS, cycleOf, OUT_CAP, HEAVY, goodOf, PATH, TRACK } from '../src/economy.js';

const PARTNER = { quarry: ['mason'], mason: ['quarry', 'site'], farm: ['bakery'], bakery: ['farm', 'house'], brickworks: ['farm', 'site'], mine: ['smithy'], smithy: ['mine', 'quarry'], quay: ['site'], house: ['bakery'] };

function bot(E) {
  const L = E.L;
  const has = (t) => E.buildings.filter((b) => b.type === t);
  const nodesOf = (t) => (t === 'site' ? [E.site] : has(t));
  const dist = (p, n) => Math.abs(p.x - n.x) + Math.abs(p.z - n.z);
  // free plot of the right terrain closest to the partners of the new building
  const bestPlot = (t) => {
    const terr = DEFS[t].terrain;
    const partners = (PARTNER[t] || []).flatMap(nodesOf);
    const plots = PLOTS.filter((p) => p.terrain === terr && E.plotFree(p.id));
    plots.sort((a, b) => partners.reduce((s, n) => s + dist(a, n), 0) - partners.reduce((s, n) => s + dist(b, n), 0) || (dist(a, E.site) - dist(b, E.site)));
    return plots[0];
  };
  const rate = (t) => has(t).reduce((a, b) => a + 1 / cycleOf(t, b.level), 0);
  const tryBuild = (t) => { if (!L.allowed.includes(t)) return false; const p = bestPlot(t); if (p && E.canBuild(t, p.id)) { E.build(t, p.id); return true; } return false; };
  const tryUp = (t) => { const bs = has(t).filter((b) => E.canUpgrade(b)).sort((a, b) => a.level - b.level); if (bs[0]) { E.upgrade(bs[0]); return true; } return false; };
  const freeCount = (terrain) => PLOTS.filter((p) => p.terrain === terrain && E.plotFree(p.id)).length;
  const grow = (t) => (DEFS[t].terrain === 'desert' && freeCount('desert') <= 2 ? (tryUp(t) || tryBuild(t)) : (tryBuild(t) || tryUp(t)));
  // roads: join every built producer to its nearest consumer, and every consumer to a supplier
  const connect = (from, to, good) => {
    const type = HEAVY.has(good) ? TRACK : PATH;
    const tiles = E.suggestRoad(from.id, to.id, type);
    if (!tiles) return false;
    const price = tiles.reduce((s, i) => s + (type === TRACK ? 3 : 1) - (E.grid.road[i] === PATH ? 1 : 0), 0);
    if (price > E.deben) return 'poor';
    for (const i of tiles) E.placeRoad(Math.floor(i / 35) - 17, (i % 35) - 17, type);
    return true;
  };
  for (const b of E.buildings) {
    if (!b.built) continue;
    const good = goodOf(b.type);
    if (good && !DEFS[b.type].boat && !E.reachable(b).length) {
      const cons = E.consumersOf(good).filter((n) => n !== b && (b.type !== 'quay' || n.type === 'site'));
      cons.sort((x, y) => dist(b, x) - dist(b, y));
      if (cons[0]) { const r = connect(b, cons[0], good); if (r) return; }
    }
  }
  for (const n of [...E.buildings, E.site]) {
    if (!n.built) continue;
    const needs = n.type === 'site' ? [E.currentGood(), ...(L.bricks ? ['brick'] : [])] : n.type === 'house' ? ['bread'] : (DEFS[n.type].in || []).map(([g]) => g);
    for (const g of needs) {
      if (n.type === 'quay') continue; // granite arrives by boat
      const prods = E.buildings.filter((b) => b !== n && b.built && goodOf(b.type) === g && !(b.type === 'granite' && n.type === 'site'));
      if (!prods.length || prods.some((p) => E.reachable(p).some((t) => t.n === n))) continue;
      prods.sort((x, y) => dist(x, n) - dist(y, n));
      if (connect(prods[0], n, g)) return;
    }
  }
  for (const b of E.buildings) if (b.built && b.out >= OUT_CAP - 1 && b.linked && E.canAddCarrier(b)) { E.addCarrier(b); return; }
  if (!has('quarry').length) { grow('quarry'); return; }
  if (!has('mason').length) { grow('mason'); return; }
  const pending = has('house').filter((b) => !b.built).length * DEFS.house.workers[0];
  if (E.workersFree() + pending < 4) { if (grow("house")) return; if (E.deben < 30) return; }
  if (L.tools && has('quarry').length && !has('smithy').length) { if (!has('mine').length) { grow('mine'); return; } grow('smithy'); return; }
  const eat = has('house').reduce((a, b) => a + (1 + 0.4 * (b.level - 1)) / DEFS.house.eat, 0);
  if (rate('bakery') * 2 < eat * 1.15) { if (rate('farm') < rate('bakery') * 1.1 + 0.05) { if (grow('farm')) return; } else if (grow('bakery')) return; return; }
  if (rate('farm') < rate('bakery')) { if (grow('farm')) return; }
  if (L.tools) {
    const toolNeed = rate('quarry') / 4, tools = rate('smithy') * 2;
    if (tools < toolNeed * 1.1) { if (rate('mine') < rate('smithy') + 0.02) { if (grow('mine')) return; } else if (grow('smithy')) return; return; }
  }
  if (L.bricks) {
    if (!has('brickworks').length) { grow('brickworks'); return; }
    const grainNeed = rate('bakery') + rate('brickworks');
    if (rate('farm') < grainNeed) { if (grow('farm')) return; }
    if (E.site.state === 'missing' && E.site.missing === 'brick' && rate('brickworks') < 0.3) { if (grow('brickworks')) return; }
  }
  if (L.graniteTiers && E.placed > E.total * 0.15) {
    if (!has('quay').length) { grow('quay'); return; }
    if (!has('granite').length) { grow('granite'); return; }
    if (E.currentGood() === 'granite' && rate('granite') < 0.3) { if (grow('granite')) return; }
  }
  if (E.site.inv.block >= 6 && E.canUpgrade(E.site)) { E.upgrade(E.site); return; }
  if (rate('quarry') <= rate('mason')) { if (grow('quarry')) return; } else if (grow('mason')) return;
}

const verbose = process.argv.includes('-v');
for (const [i, L] of LEVELS.entries()) {
  const times = [];
  let last = null;
  for (let run = 0; run < 3; run++) {
    const E = new Economy(L, PLOTS, tierSizes(L.base));
    for (const [t, p] of L.prebuilt) E.build(t, p, { free: true, instant: true });
    let t = 0;
    while (!E.done() && t < 4000) { bot(E); E.step(0.5); t += 0.5; }
    times.push(t);
    last = E;
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`L${i + 1} base ${L.base}: bot ${avg.toFixed(0)} s (deadline ${L.deadline} s, ratio ${(L.deadline / avg).toFixed(2)})  roads ${last.roadSpent} deben, ${last.grid.road.filter((r) => r).length} tiles`);
  if (verbose) console.log('   ', last.buildings.map((b) => `${b.type}@${b.plot}L${b.level}c${b.carriers.length}`).join(' '));
}
