// Production economy for the pyramid works. Pure logic, stepped with step(dt).
// Buildings sit on plots; quarries, mines, farms and the granite quarry only on their deposits.
// Goods leave a building only along roads the player paints tile by tile: footpaths for light
// goods, sledge tracks for stone, blocks and granite. Every producer has its own carriers who
// take the goods to the nearest connected consumer with room; granite crosses the Nile by boat.
import { RoadGrid, PATH, TRACK, ROAD_COST, tilePolyline, polyLength, riverPolyline } from './roads.js';

export const GOODS = ['grain', 'bread', 'stone', 'block', 'ore', 'tools', 'granite'];
export const HEAVY = new Set(['stone', 'block', 'granite']);

export const DEFS = {
  house:   { terrain: 'desert',    cost: 30, staff: 0, workers: [7, 11, 15], eat: 22 },
  farm:    { terrain: 'fertile',   cost: 25, staff: 1, out: ['grain', 1], cycle: 7 },
  bakery:  { terrain: 'desert',    cost: 40, staff: 1, in: [['grain', 1]], out: ['bread', 2], cycle: 6 },
  quarry:  { terrain: 'limestone', cost: 35, staff: 2, out: ['stone', 1], cycle: 5, usesTools: true },
  mason:   { terrain: 'desert',    cost: 45, staff: 2, in: [['stone', 1]], out: ['block', 1], cycle: 5 },
  mine:    { terrain: 'copper',    cost: 45, staff: 2, out: ['ore', 1], cycle: 9 },
  smithy:  { terrain: 'desert',    cost: 50, staff: 2, in: [['ore', 1]], out: ['tools', 2], cycle: 8 },
  granite: { terrain: 'granite',   cost: 60, staff: 3, out: ['granite', 1], cycle: 6, boat: true },
  quay:    { terrain: 'bank',      cost: 40, staff: 1, in: [['granite', 1]], out: ['granite', 1], cycle: 0.6 },
};
export const ORDER = ['house', 'farm', 'bakery', 'quarry', 'mason', 'mine', 'smithy', 'granite', 'quay'];

// carriers: speed in tiles per second
export const CARRIER = {
  porter: { cap: 1, speed: 1.9 },
  sledge: { cap: 2, speed: 1.3 },
  ox:     { cap: 4, speed: 1.6 },
  boat:   { cap: 2, speed: 1.5 },
};
export const MAX_CARRIERS = 3;
export const CARRIER_COST = { light: 10, heavy: 20 };
export { PATH, TRACK, ROAD_COST };

export const MAX_LEVEL = 3;
const SPEED = [1, 1 / 0.7, 2];
export const IN_CAP = 6, OUT_CAP = 6, SITE_CAP = 10;
export const PAY = { block: 6, granite: 14 };
export const TIER_PAY = 40;
export const STIPEND = 0.4;
const TOOL_EVERY = 4, NO_TOOL_SLOW = 2.5;
const LOAD_TIME = 0.7;
export const SITE_PLACE = [3.0, 2.2, 1.6];      // seconds per block, by ramp crew level
export const SITE_UP = [{ cost: 70, staff: 2 }, { cost: 130, staff: 2 }];

export function upgradeCost(type, level) { return Math.round(DEFS[type].cost * (level === 1 ? 1.4 : 2.4)); }
export function staffFor(type, level) { const d = DEFS[type]; return d.staff ? d.staff + (level - 1) : 0; }
export function cycleOf(type, level) { return DEFS[type].cycle / SPEED[level - 1]; }
export const goodOf = (type) => (DEFS[type].out ? DEFS[type].out[0] : null);

export class Economy {
  // level: { base, startDeben, tools, flood, storm, allowed, ox, graniteTiers }
  constructor(level, plots, tierSizes) {
    this.L = level;
    this.plots = plots;
    this.tierSizes = tierSizes;
    this.tierCells = tierSizes.map((n) => n * n);
    this.total = this.tierCells.reduce((a, b) => a + b, 0);
    const gt = level.graniteTiers || 0;
    this.tierGood = tierSizes.map((_, t) => (t >= tierSizes.length - gt ? 'granite' : 'block'));
    this.grid = new RoadGrid(level.base, plots);
    this.deben = level.startDeben;
    this.pantry = { bread: level.startBread ?? 8 };
    this.buildings = [];
    const P = this.grid.plaza;
    this.site = { id: 'site', type: 'site', built: true, level: 1, inv: { block: 0, granite: 0 }, incoming: { block: 0, granite: 0 }, placeT: 0, x: P.x, z: P.z };
    this.time = 0;
    this.placed = 0;
    this.events = [];
    this.flood = { phase: 'calm', t: level.flood ? level.flood.first : Infinity };
    this.storm = { phase: 'calm', t: level.storm ? level.storm.first : Infinity };
    this.stipendAcc = 0;
    this.nextId = 1;
    this.topo = 0;            // bumps whenever roads or buildings change
    this._bfsCache = new Map();
    this.roadSpent = 0;
  }

  emit(e) { this.events.push(e); }
  drain() { const e = this.events; this.events = []; return e; }

  // ------------------------------------------------------------ nodes
  node(id) { return id === 'site' ? this.site : this.buildings.find((b) => b.id === id); }
  plotOf(id) { return this.plots.find((p) => p.id === id); }
  produces(n) { return n.type !== 'site' && DEFS[n.type].out ? DEFS[n.type].out[0] : null; }
  accepts(n, good) {
    if (!n.built) return false;
    if (n.type === 'site') return good === 'block' || good === 'granite';
    if (n.type === 'house') return good === 'bread';
    const d = DEFS[n.type];
    if (good === 'tools' && d.usesTools && this.L.tools) return true;
    return !!(d.in && d.in.some(([g]) => g === good));
  }
  stockOf(n, good) { return n.type === 'house' ? this.pantry.bread : (n.inv[good] || 0); }
  capOf(n) {
    if (n.type === 'site') return SITE_CAP;
    if (n.type === 'house') return 6 * this.buildings.filter((b) => b.type === 'house' && b.built).length;
    return IN_CAP;
  }
  incomingOf(n, good) {
    if (n.type === 'house') return this.buildings.reduce((a, b) => a + (b.type === 'house' ? (b.incoming.bread || 0) : 0), 0);
    return n.incoming[good] || 0;
  }
  space(n, good) { return this.capOf(n) - this.stockOf(n, good) - this.incomingOf(n, good); }
  _addStock(n, good, k) { if (n.type === 'house') this.pantry.bread += k; else n.inv[good] = (n.inv[good] || 0) + k; }
  ports(n) { return this.grid.ports(n.x, n.z); }

  // ------------------------------------------------------------ workers
  workersTotal() { return this.buildings.filter((b) => b.type === 'house' && b.built).reduce((a, b) => a + DEFS.house.workers[b.level - 1], 0); }
  workersUsed() {
    let w = this.buildings.reduce((a, b) => a + staffFor(b.type, b.level) + b.carriers.length, 0);
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
  staffNeeded(type) { return DEFS[type].staff + (DEFS[type].out ? 1 : 0); }

  // ------------------------------------------------------------ building
  canBuild(type, plotId) {
    const d = DEFS[type], plot = this.plotOf(plotId);
    if (!plot || !this.plotFree(plotId) || plot.terrain !== d.terrain) return false;
    if (!this.L.allowed.includes(type)) return false;
    return this.deben >= d.cost && this.workersFree() >= this.staffNeeded(type);
  }

  build(type, plotId, { free = false, instant = false } = {}) {
    const d = DEFS[type];
    if (!free) { if (!this.canBuild(type, plotId)) return null; this.deben -= d.cost; }
    const p = this.plotOf(plotId);
    const b = { id: this.nextId++, type, plot: plotId, x: p.x, z: p.z, level: 1, t: 0, busy: false, state: instant ? 'idle' : 'build', built: instant, buildT: instant ? 0 : 3,
      made: 0, eatT: d.eat || 0, hungry: false, inv: {}, incoming: {}, out: 0, carriers: [], linked: false };
    this.buildings.push(b);
    if (d.out) this._carrier(b);
    this.topo++;
    this.emit({ type: 'built', b, instant });
    return b;
  }

  carrierKind(b) {
    if (DEFS[b.type].boat) return 'boat';
    if (!HEAVY.has(goodOf(b.type))) return 'porter';
    return this.L.ox && b.level >= 3 ? 'ox' : 'sledge';
  }
  _carrier(b) {
    const c = { id: `${b.id}:${b.carriers.length}`, home: b.id, slot: b.carriers.length, kind: this.carrierKind(b), phase: 'idle', t: 0, load: 0, good: goodOf(b.type), wait: b.carriers.length * 0.7, path: null, len: 0, progress: 0 };
    b.carriers.push(c);
    this.emit({ type: 'carrier', b, c });
    return c;
  }
  carrierCost(b) { return HEAVY.has(goodOf(b.type)) ? CARRIER_COST.heavy : CARRIER_COST.light; }
  canAddCarrier(b) { return b.built && !!DEFS[b.type].out && b.carriers.length < MAX_CARRIERS && this.deben >= this.carrierCost(b) && this.workersFree() >= 1; }
  addCarrier(b) {
    if (!this.canAddCarrier(b)) return false;
    this.deben -= this.carrierCost(b);
    this._carrier(b);
    return true;
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

  // ------------------------------------------------------------ roads
  roadAt(x, z) { return this.grid.get(x, z); }
  // cost of painting a tile (0 = nothing to do, -1 = not possible here)
  roadPrice(x, z, type) {
    if (!this.grid.free(x, z)) return -1;
    const cur = this.grid.get(x, z);
    if (cur >= type) return 0;
    return ROAD_COST[type] - (cur ? ROAD_COST[cur] : 0);
  }
  // returns the price paid, 0 (already there), -1 (not buildable) or -2 (too expensive)
  placeRoad(x, z, type) {
    const price = this.roadPrice(x, z, type);
    if (price <= 0) return price;
    if (this.deben < price) return -2;
    this.deben -= price;
    this.roadSpent += price;
    this.grid.set(x, z, type);
    this.topo++;
    this.emit({ type: 'road', x, z, kind: type });
    return price;
  }
  eraseRoad(x, z) {
    const cur = this.grid.get(x, z);
    if (!cur) return false;
    this.deben += Math.floor(ROAD_COST[cur] / 2);
    this.grid.set(x, z, 0);
    this.topo++;
    this.emit({ type: 'unroad', x, z });
    return true;
  }
  // tiles of road still to build so that two nodes are joined by the given road type
  suggestRoad(fromId, toId, type) {
    const a = this.node(fromId), b = this.node(toId);
    if (!a || !b) return null;
    const tiles = this.grid.suggest(this.ports(a), this.ports(b), type);
    if (!tiles) return null;
    return tiles.filter((i) => this.grid.road[i] < type);
  }

  _bfs(n, heavy) {
    const key = `${n.id}:${heavy ? 1 : 0}`;
    const c = this._bfsCache.get(key);
    if (c && c.topo === this.topo) return c.res;
    const res = this.grid.bfs(this.ports(n), heavy);
    this._bfsCache.set(key, { topo: this.topo, res });
    return res;
  }

  consumersOf(good) {
    const out = [];
    for (const n of [...this.buildings, this.site]) if (this.accepts(n, good)) out.push(n);
    return out;
  }

  // nodes a producer can deliver to over the current roads, nearest first
  reachable(b) {
    const good = goodOf(b.type);
    if (!good || !b.built) return [];
    const cons = this.consumersOf(good).filter((n) => n !== b);
    if (DEFS[b.type].boat) return cons.filter((n) => n.type === 'quay').map((n) => ({ n, d: Math.hypot(n.x - b.x, n.z - b.z), boat: true }));
    const res = this._bfs(b, HEAVY.has(good));
    const out = [];
    for (const n of cons) {
      const p = this.grid.pathTo(res, this.ports(n));
      if (p) out.push({ n, d: p.d, p });
    }
    out.sort((x, y) => x.d - y.d);
    return out;
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
        if (b.buildT <= 0) { b.built = true; b.state = 'idle'; this.topo++; this.emit({ type: 'ready', b }); }
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
      if (b._topo !== this.topo) { b._topo = this.topo; b.targets = this.reachable(b); b.linked = b.targets.length > 0; }
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

    // carriers
    const tempo = Math.max(0.4, prod);
    for (const b of this.buildings) {
      if (!b.carriers.length || !b.built) continue;
      for (const c of b.carriers) this._stepCarrier(b, c, dt, tempo);
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

  _stepCarrier(b, c, dt, tempo) {
    if (c.wait > 0) { c.wait -= dt; return; }
    const T = CARRIER[c.kind];
    if (c.phase === 'idle') {
      const kind = this.carrierKind(b);
      if (kind !== c.kind) { c.kind = kind; this.emit({ type: 'carrierKind', b, c }); }
      if (b.out < 1 || !b.targets || !b.targets.length) return;
      // nearest consumer with room
      let pick = null;
      for (const t of b.targets) {
        if (!this.accepts(t.n, c.good)) continue;
        const room = this.space(t.n, c.good);
        if (room >= 1) { pick = { t, room }; break; }
      }
      if (!pick) return;
      const k = Math.min(CARRIER[c.kind].cap, b.out, pick.room);
      const to = pick.t.n;
      b.out -= k; c.load = k; c.to = to.id;
      to.incoming[c.good] = (to.incoming[c.good] || 0) + k;
      if (pick.t.boat) c.path = riverPolyline(b, to);
      else c.path = tilePolyline(pick.t.p.tiles, this.ports(b).find((p) => p.i === pick.t.p.tiles[0]), pick.t.p.end);
      c.len = Math.max(0.5, polyLength(c.path));
      c.phase = 'load'; c.t = 0;
      this.emit({ type: 'load', b, c });
    } else if (c.phase === 'load') {
      c.t += dt; if (c.t >= LOAD_TIME) { c.phase = 'go'; c.t = 0; }
    } else if (c.phase === 'go') {
      c.t += dt * T.speed * tempo;
      if (c.t >= c.len) { c.phase = 'unload'; c.t = 0; }
    } else if (c.phase === 'unload') {
      c.t += dt;
      if (c.t >= LOAD_TIME) {
        const to = this.node(c.to);
        if (to) {
          to.incoming[c.good] = Math.max(0, (to.incoming[c.good] || 0) - c.load);
          this._addStock(to, c.good, c.load);
          this.emit({ type: 'deliver', b, c, good: c.good, n: c.load, to });
        }
        c.load = 0; c.phase = 'back'; c.t = 0;
      }
    } else if (c.phase === 'back') {
      c.t += dt * T.speed * tempo * 1.15;
      if (c.t >= c.len) { c.phase = 'idle'; c.t = 0; c.path = null; }
    }
    c.progress = c.phase === 'go' ? Math.min(1, c.t / c.len) : c.phase === 'back' ? 1 - Math.min(1, c.t / c.len) : c.phase === 'unload' ? 1 : 0;
  }

  _tierOf(i) {
    let acc = 0;
    for (let t = 0; t < this.tierCells.length; t++) { acc += this.tierCells[t]; if (i < acc) return t; }
    return this.tierCells.length;
  }
  done() { return this.placed >= this.total; }
}
