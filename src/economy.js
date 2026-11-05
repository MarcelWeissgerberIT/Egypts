// Production economy for the pyramid works. Pure logic, stepped with step(dt).
// Every building has its own small stores; goods only move along routes the player creates
// (porters, sledge teams, ox carts, Nile boats). The construction site turns delivered blocks
// (and granite for the top tiers) into the pyramid.
import { landPath, riverPath, pathLength, crossesRiver, siteDock, pyramidRadius } from './routes.js';

export const GOODS = ['grain', 'bread', 'stone', 'block', 'ore', 'tools', 'granite'];
export const HEAVY = new Set(['stone', 'block', 'granite']);

export const DEFS = {
  house:   { terrain: 'desert',  cost: 30, staff: 0, workers: [6, 9, 12], eat: 22 },
  farm:    { terrain: 'fertile', cost: 25, staff: 1, out: ['grain', 1], cycle: 7 },
  bakery:  { terrain: 'desert',  cost: 45, staff: 1, in: [['grain', 1]], out: ['bread', 2], cycle: 6 },
  quarry:  { terrain: 'rock',    cost: 35, staff: 2, out: ['stone', 1], cycle: 5, usesTools: true },
  mason:   { terrain: 'desert',  cost: 50, staff: 2, in: [['stone', 1]], out: ['block', 1], cycle: 5 },
  mine:    { terrain: 'rock',    cost: 45, staff: 2, out: ['ore', 1], cycle: 9 },
  smithy:  { terrain: 'desert',  cost: 55, staff: 2, in: [['ore', 1]], out: ['tools', 2], cycle: 8 },
  granite: { terrain: 'farbank', cost: 60, staff: 3, out: ['granite', 1], cycle: 6, usesTools: true },
  quay:    { terrain: 'bank',    cost: 40, staff: 1, in: [['granite', 1]], out: ['granite', 1], cycle: 0.6 },
};
export const ORDER = ['house', 'farm', 'bakery', 'quarry', 'mason', 'mine', 'smithy', 'granite', 'quay'];

export const TRANSPORT = {
  porter: { cost: 0,  staff: 1, cap: 1, speed: 2.6, light: true },
  sledge: { cost: 20, staff: 1, cap: 2, speed: 1.9 },
  ox:     { cost: 45, staff: 1, cap: 4, speed: 2.4 },
  boat:   { cost: 60, staff: 1, cap: 4, speed: 2.2, water: true },
};
export const TRANSPORT_ORDER = ['porter', 'sledge', 'ox', 'boat'];

export const MAX_LEVEL = 3;
export const MAX_ROUTES = 3, MAX_VEHICLES = 3;
const SPEED = [1, 1 / 0.7, 2];
export const IN_CAP = 6, OUT_CAP = 6, SITE_CAP = 10;
export const PAY = { block: 6, granite: 14 };
export const TIER_PAY = 40;
export const STIPEND = 0.4;
const TOOL_EVERY = 4, NO_TOOL_SLOW = 2.5;
const LOAD_TIME = 0.6;
export const SITE_PLACE = [3.0, 2.2, 1.6];      // seconds per block, by ramp crew level
export const SITE_UP = [{ cost: 70, staff: 2 }, { cost: 130, staff: 2 }];

export function upgradeCost(type, level) { return Math.round(DEFS[type].cost * (level === 1 ? 1.4 : 2.4)); }
export function staffFor(type, level) { const d = DEFS[type]; return d.staff ? d.staff + (level - 1) : 0; }
export function cycleOf(type, level) { return DEFS[type].cycle / SPEED[level - 1]; }

export class Economy {
  // level: { base, startDeben, tools, flood, storm, allowed, transports, graniteTiers }
  constructor(level, plots, tierSizes) {
    this.L = level;
    this.plots = plots;
    this.tierSizes = tierSizes;
    this.tierCells = tierSizes.map((n) => n * n);
    this.total = this.tierCells.reduce((a, b) => a + b, 0);
    const gt = level.graniteTiers || 0;
    this.tierGood = tierSizes.map((_, t) => (t >= tierSizes.length - gt ? 'granite' : 'block'));
    this.R = pyramidRadius(level.base);
    this.deben = level.startDeben;
    this.pantry = { bread: level.startBread ?? 8 };
    this.buildings = [];
    this.routes = [];
    this.site = { id: 'site', type: 'site', built: true, level: 1, inv: { block: 0, granite: 0 }, incoming: { block: 0, granite: 0 }, placeT: 0, pos: siteDock(level.base) };
    this.time = 0;
    this.placed = 0;
    this.events = [];
    this.flood = { phase: 'calm', t: level.flood ? level.flood.first : Infinity };
    this.storm = { phase: 'calm', t: level.storm ? level.storm.first : Infinity };
    this.stipendAcc = 0;
    this.nextId = 1;
  }

  emit(e) { this.events.push(e); }
  drain() { const e = this.events; this.events = []; return e; }

  // ------------------------------------------------------------ nodes
  node(id) { return id === 'site' ? this.site : this.buildings.find((b) => b.id === id); }
  posOf(n) { if (n.type === 'site') return n.pos; const p = this.plots.find((q) => q.id === n.plot); return { u: p.u, v: p.v }; }
  produces(n) { return n.type !== 'site' && DEFS[n.type].out ? DEFS[n.type].out[0] : null; }
  accepts(n, good) {
    if (n.type === 'site') return good === 'block' || good === 'granite';
    if (n.type === 'house') return good === 'bread';
    const d = DEFS[n.type];
    if (good === 'tools' && d.usesTools && this.L.tools) return true;
    return !!(d.in && d.in.some(([g]) => g === good));
  }
  stockOf(n, good) {
    if (n.type === 'house') return this.pantry.bread;
    return n.inv[good] || 0;
  }
  capOf(n, good) {
    if (n.type === 'site') return SITE_CAP;
    if (n.type === 'house') return 6 * this.buildings.filter((b) => b.type === 'house' && b.built).length;
    return IN_CAP;
  }
  space(n, good) { return this.capOf(n, good) - this.stockOf(n, good) - ((n.incoming && n.incoming[good]) || 0); }
  _addStock(n, good, k) { if (n.type === 'house') this.pantry.bread += k; else n.inv[good] = (n.inv[good] || 0) + k; }

  // ------------------------------------------------------------ workers
  workersTotal() { return this.buildings.filter((b) => b.type === 'house' && b.built).reduce((a, b) => a + DEFS.house.workers[b.level - 1], 0); }
  workersUsed() {
    let w = this.buildings.reduce((a, b) => a + staffFor(b.type, b.level), 0);
    for (const r of this.routes) w += TRANSPORT[r.type].staff * r.vehicles.length;
    for (let l = 1; l < this.site.level; l++) w += SITE_UP[l - 1].staff;
    return w;
  }
  workersFree() { return this.workersTotal() - this.workersUsed(); }
  hungryShare() {
    let tot = 0, hungry = 0;
    for (const b of this.buildings) if (b.type === 'house' && b.built) { const w = DEFS.house.workers[b.level - 1]; tot += w; if (b.hungry) hungry += w; }
    return tot ? hungry / tot : 0;
  }
  productivity() {
    let p = 1 - 0.65 * this.hungryShare();
    if (this.storm.phase === 'on') p *= 0.5;
    return p;
  }
  plotFree(plotId) { return !this.buildings.some((b) => b.plot === plotId); }

  // ------------------------------------------------------------ building
  canBuild(type, plotId) {
    const d = DEFS[type], plot = this.plots.find((p) => p.id === plotId);
    if (!plot || !this.plotFree(plotId) || plot.terrain !== d.terrain) return false;
    if (!this.L.allowed.includes(type)) return false;
    return this.deben >= d.cost && this.workersFree() >= d.staff;
  }

  build(type, plotId, { free = false, instant = false } = {}) {
    const d = DEFS[type];
    if (!free) { if (!this.canBuild(type, plotId)) return null; this.deben -= d.cost; }
    const b = { id: this.nextId++, type, plot: plotId, level: 1, t: 0, busy: false, state: instant ? 'idle' : 'build', built: instant, buildT: instant ? 0 : 3,
      made: 0, eatT: d.eat || 0, hungry: false, inv: {}, incoming: {}, out: 0 };
    this.buildings.push(b);
    this.emit({ type: 'built', b, instant });
    return b;
  }

  canUpgrade(b) {
    if (b.type === 'site') return b.level < MAX_LEVEL && this.deben >= SITE_UP[b.level - 1].cost && this.workersFree() >= SITE_UP[b.level - 1].staff;
    if (!b.built || b.level >= MAX_LEVEL) return false;
    const extra = staffFor(b.type, b.level + 1) - staffFor(b.type, b.level);
    return this.deben >= upgradeCost(b.type, b.level) && this.workersFree() >= extra;
  }
  upgrade(b) {
    if (!this.canUpgrade(b)) return false;
    this.deben -= b.type === 'site' ? SITE_UP[b.level - 1].cost : upgradeCost(b.type, b.level);
    b.level++;
    this.emit({ type: 'upgraded', b });
    return true;
  }

  // ------------------------------------------------------------ routes
  routePath(from, to) {
    const a = this.posOf(from), b = this.posOf(to);
    if (crossesRiver(a, b)) return { pts: riverPath(a, b), water: true };
    return { pts: landPath(a, b, this.R), water: false };
  }

  // what a route between two nodes would carry and which transports are possible
  routeOptions(fromId, toId) {
    const from = this.node(fromId), to = this.node(toId);
    if (!from || !to || from === to || !from.built) return null;
    const good = this.produces(from);
    if (!good || !this.accepts(to, good)) return null;
    if (this.routes.some((r) => r.from === fromId && r.to === toId)) return null;
    const water = this.routePath(from, to).water;
    if (water && !(from.type === 'granite' && to.type === 'quay')) return null;
    const types = TRANSPORT_ORDER.filter((t) => this.L.transports.includes(t)).map((t) => {
      const T = TRANSPORT[t];
      const fits = water ? !!T.water : !T.water && !(T.light && HEAVY.has(good));
      return { type: t, fits, money: this.deben >= T.cost, hands: this.workersFree() >= T.staff };
    }).filter((x) => x.fits);
    return types.length ? { good, types, water } : null;
  }

  validTargets(fromId) {
    const out = [];
    for (const n of [...this.buildings, this.site]) if (this.routeOptions(fromId, n.id)) out.push(n.id);
    return out;
  }

  addRoute(fromId, toId, type) {
    const opt = this.routeOptions(fromId, toId);
    if (!opt) return null;
    const T = TRANSPORT[type];
    if (!opt.types.some((x) => x.type === type)) return null;
    if (this.routes.filter((r) => r.from === fromId).length >= MAX_ROUTES) return null;
    if (this.deben < T.cost || this.workersFree() < T.staff) return null;
    this.deben -= T.cost;
    const from = this.node(fromId), to = this.node(toId);
    const p = this.routePath(from, to);
    const r = { id: this.nextId++, from: fromId, to: toId, good: opt.good, type, pts: p.pts, len: pathLength(p.pts), vehicles: [] };
    this.routes.push(r);
    this._vehicle(r);
    this.emit({ type: 'route', r });
    return r;
  }

  _vehicle(r) {
    const v = { id: `${r.id}:${r.vehicles.length}`, route: r, phase: 'wait', t: 0, load: 0, wait: r.vehicles.length * 0.8 };
    r.vehicles.push(v);
    this.emit({ type: 'vehicle', r, v });
    return v;
  }

  canAddVehicle(r) { const T = TRANSPORT[r.type]; return r.vehicles.length < MAX_VEHICLES && this.deben >= T.cost && this.workersFree() >= T.staff; }
  addVehicle(r) {
    if (!this.canAddVehicle(r)) return false;
    this.deben -= TRANSPORT[r.type].cost;
    this._vehicle(r);
    return true;
  }

  removeRoute(r) {
    const i = this.routes.indexOf(r);
    if (i < 0) return;
    const to = this.node(r.to), from = this.node(r.from);
    for (const v of r.vehicles) {
      if (v.load) {
        // cargo on the way goes back to the source (or is lost if it is full)
        if (to && to.incoming) to.incoming[r.good] = Math.max(0, (to.incoming[r.good] || 0) - v.load);
        if (from) from.out = Math.min(OUT_CAP, from.out + v.load);
      }
    }
    this.routes.splice(i, 1);
    this.emit({ type: 'unroute', r });
  }

  // ------------------------------------------------------------ events: Nile flood and sandstorm
  floodActive() { return this.flood.phase === 'on'; }
  floodBonus() { return this.flood.phase === 'bonus' ? 1.5 : 1; }

  _events(dt) {
    const F = this.L.flood;
    if (F) {
      this.flood.t -= dt;
      if (this.flood.t <= 0) {
        if (this.flood.phase === 'calm') { this.flood.phase = 'warn'; this.flood.t = 6; this.emit({ type: 'floodWarn' }); }
        else if (this.flood.phase === 'warn') { this.flood.phase = 'on'; this.flood.t = F.dur; this.emit({ type: 'floodOn' }); }
        else if (this.flood.phase === 'on') { this.flood.phase = 'bonus'; this.flood.t = 30; this.emit({ type: 'floodOff' }); }
        else { this.flood.phase = 'calm'; this.flood.t = F.every - F.dur - 36; }
      }
    }
    const S = this.L.storm;
    if (S) {
      this.storm.t -= dt;
      if (this.storm.t <= 0) {
        if (this.storm.phase === 'calm') { this.storm.phase = 'on'; this.storm.t = S.dur; this.emit({ type: 'stormOn' }); }
        else { this.storm.phase = 'calm'; this.storm.t = S.every - S.dur; this.emit({ type: 'stormOff' }); }
      }
    }
  }

  currentTier() { return this._tierOf(this.placed); }
  currentGood() { return this.tierGood[Math.min(this.currentTier(), this.tierGood.length - 1)]; }

  // ------------------------------------------------------------ simulation
  step(dt) {
    this.time += dt;
    this._events(dt);
    this.stipendAcc += dt * STIPEND;
    if (this.stipendAcc >= 1) { const n = Math.floor(this.stipendAcc); this.stipendAcc -= n; this.deben += n; }
    const prod = this.productivity();

    for (const b of this.buildings) {
      if (!b.built) {
        b.buildT -= dt;
        if (b.buildT <= 0) { b.built = true; b.state = 'idle'; this.emit({ type: 'ready', b }); }
        continue;
      }
      const d = DEFS[b.type];
      if (b.type === 'house') {
        b.eatT -= dt * (1 + 0.4 * (b.level - 1));
        if (b.eatT <= 0) {
          if (this.pantry.bread > 0) {
            this.pantry.bread--; b.eatT = d.eat;
            if (b.hungry) { b.hungry = false; this.emit({ type: 'fed', b }); }
          } else {
            b.eatT = 3;
            if (!b.hungry) { b.hungry = true; this.emit({ type: 'hungry', b }); }
          }
        }
        b.state = b.hungry ? 'hungry' : 'ok';
        continue;
      }
      if (b.type === 'farm' && this.floodActive()) { b.state = 'flooded'; continue; }
      if (!b.busy) {
        const need = d.in || [];
        if (b.out >= (b.type === 'quay' ? 8 : OUT_CAP)) { b.state = 'full'; continue; }
        if (need.every(([g, n]) => (b.inv[g] || 0) >= n)) {
          for (const [g, n] of need) b.inv[g] -= n;
          b.busy = true; b.t = 0; b.slow = 1;
          if (d.usesTools && this.L.tools) {
            if (b.made % TOOL_EVERY === 0 || !b.toolOk) {
              if ((b.inv.tools || 0) > 0) { b.inv.tools--; b.toolOk = true; } else b.toolOk = false;
            }
            if (!b.toolOk) b.slow = NO_TOOL_SLOW;
          }
          b.state = b.slow > 1 ? 'noTools' : 'work';
        } else {
          b.state = 'missing';
          b.missing = need.find(([g, n]) => (b.inv[g] || 0) < n)[0];
        }
      }
      if (b.busy) {
        const speed = prod * (b.type === 'farm' ? this.floodBonus() : 1) / b.slow;
        b.t += dt * speed;
        if (b.t >= cycleOf(b.type, b.level)) {
          b.busy = false; b.made++;
          const [g, n] = d.out;
          b.out = Math.min(b.type === 'quay' ? 8 : OUT_CAP, b.out + n);
          if (b.type !== 'quay') this.emit({ type: 'made', b, good: g, n });
        }
      }
    }

    // vehicles
    for (const r of this.routes) {
      const from = this.node(r.from), to = this.node(r.to);
      const T = TRANSPORT[r.type];
      const travel = r.len / (T.speed * Math.max(0.35, prod));
      for (const v of r.vehicles) {
        if (v.wait > 0) { v.wait -= dt; continue; }
        if (v.phase === 'wait') {
          if (!from || !to) continue;
          const k = Math.min(T.cap, from.out, this.space(to, r.good));
          if (k >= 1 && from.built) {
            from.out -= k; v.load = k;
            if (to.incoming) to.incoming[r.good] = (to.incoming[r.good] || 0) + k;
            v.phase = 'load'; v.t = 0;
            this.emit({ type: 'load', r, v });
          }
        } else if (v.phase === 'load') {
          v.t += dt; if (v.t >= LOAD_TIME) { v.phase = 'go'; v.t = 0; }
        } else if (v.phase === 'go') {
          v.t += dt;
          if (v.t >= travel) { v.phase = 'unload'; v.t = 0; }
        } else if (v.phase === 'unload') {
          v.t += dt;
          if (v.t >= LOAD_TIME) {
            if (to) {
              if (to.incoming) to.incoming[r.good] = Math.max(0, (to.incoming[r.good] || 0) - v.load);
              this._addStock(to, r.good, v.load);
              this.emit({ type: 'deliver', r, v, good: r.good, n: v.load, to });
            }
            v.load = 0; v.phase = 'back'; v.t = 0;
          }
        } else if (v.phase === 'back') {
          v.t += dt;
          if (v.t >= travel) { v.phase = 'wait'; v.t = 0; }
        }
        v.progress = v.phase === 'go' ? Math.min(1, v.t / travel) : v.phase === 'back' ? 1 - Math.min(1, v.t / travel) : v.phase === 'unload' ? 1 : 0;
      }
    }

    // construction site: the ramp crew hauls one stone at a time up and sets it
    const S = this.site;
    const good = this.currentGood();
    if (this.placed < this.total) {
      if (S.inv[good] > 0) {
        S.placeT += dt * prod;
        S.state = 'work';
        if (S.placeT >= SITE_PLACE[S.level - 1]) {
          S.placeT = 0;
          S.inv[good]--;
          const tierBefore = this.currentTier();
          this.placed++;
          this.deben += PAY[good];
          this.emit({ type: 'placed', index: this.placed - 1, good });
          if (this.currentTier() !== tierBefore || this.placed === this.total) { this.deben += TIER_PAY; this.emit({ type: 'tier', tier: tierBefore }); }
        }
      } else { S.placeT = Math.min(S.placeT, SITE_PLACE[S.level - 1] * 0.3); S.state = 'missing'; S.missing = good; }
    }
  }

  _tierOf(i) {
    let acc = 0;
    for (let t = 0; t < this.tierCells.length; t++) { acc += this.tierCells[t]; if (i < acc) return t; }
    return this.tierCells.length;
  }
  done() { return this.placed >= this.total; }
}
