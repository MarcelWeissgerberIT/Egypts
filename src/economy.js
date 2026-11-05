// Production economy for the pyramid works. Pure logic (no rendering), stepped with step(dt).
// Goods: grain, bread, stone (raw), block (cut), ore, tools. Currency: deben.

export const GOODS = ['bread', 'grain', 'stone', 'block', 'ore', 'tools'];

export const DEFS = {
  house:  { terrain: 'desert',  cost: 30, staff: 0, workers: [5, 8, 11], eat: 22 },
  farm:   { terrain: 'fertile', cost: 25, staff: 1, out: ['grain', 1], cycle: 7 },
  bakery: { terrain: 'desert',  cost: 45, staff: 1, in: [['grain', 1]], out: ['bread', 2], cycle: 6 },
  quarry: { terrain: 'rock',    cost: 35, staff: 2, out: ['stone', 1], cycle: 5, usesTools: true },
  mason:  { terrain: 'desert',  cost: 50, staff: 2, in: [['stone', 1]], out: ['block', 1], cycle: 5 },
  mine:   { terrain: 'rock',    cost: 45, staff: 2, out: ['ore', 1], cycle: 9 },
  smithy: { terrain: 'desert',  cost: 55, staff: 2, in: [['ore', 1]], out: ['tools', 2], cycle: 8 },
};
export const ORDER = ['house', 'farm', 'bakery', 'quarry', 'mason', 'mine', 'smithy'];
export const MAX_LEVEL = 3;
const SPEED = [1, 1 / 0.7, 2];            // production speed per level
export const BLOCK_PAY = 6;               // deben per delivered block
export const TIER_PAY = 40;               // deben bonus per finished tier
export const HAUL_TIME = 3;               // seconds a sledge needs to the pyramid
export const STIPEND = 0.4;               // deben per second from the pharaoh's treasury (no soft-lock)
const TOOL_EVERY = 4;                     // stones per tool
const NO_TOOL_SLOW = 2.5;

export function upgradeCost(type, level) {
  const c = DEFS[type].cost;
  return Math.round(c * (level === 1 ? 1.4 : 2.4));
}
export function staffFor(type, level) {
  const d = DEFS[type];
  return d.staff ? d.staff + (level - 1) : 0;
}
export function cycleOf(type, level) { return DEFS[type].cycle / SPEED[level - 1]; }

export class Economy {
  // level: { blocks, startDeben, tools, flood, storm, allowed:[types] }
  constructor(level, plots, tierCells) {
    this.L = level;
    this.plots = plots;                       // [{id, terrain}]
    this.deben = level.startDeben;
    this.stock = Object.fromEntries(GOODS.map((g) => [g, 0]));
    this.stock.bread = level.startBread ?? 8;
    this.stipendAcc = 0;
    this.buildings = [];                      // {id, type, plot, level, t, busy, state, built}
    this.time = 0;
    this.placed = 0;                          // blocks in the pyramid
    this.total = tierCells.reduce((a, b) => a + b, 0);
    this.tierCells = tierCells;
    this.hauling = [];                        // pending deliveries (seconds left)
    this.events = [];                         // emitted for the view: {type, ...}
    this.flood = { phase: 'calm', t: level.flood ? level.flood.first : Infinity };
    this.storm = { phase: 'calm', t: level.storm ? level.storm.first : Infinity };
    this.nextId = 1;
  }

  emit(e) { this.events.push(e); }
  drain() { const e = this.events; this.events = []; return e; }

  workersTotal() { return this.buildings.filter((b) => b.type === 'house' && b.built).reduce((a, b) => a + DEFS.house.workers[b.level - 1], 0); }
  workersUsed() { return this.buildings.reduce((a, b) => a + staffFor(b.type, b.level), 0); }
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

  canBuild(type, plotId) {
    const d = DEFS[type], plot = this.plots.find((p) => p.id === plotId);
    if (!plot || !this.plotFree(plotId) || plot.terrain !== d.terrain) return false;
    if (!this.L.allowed.includes(type)) return false;
    return this.deben >= d.cost && this.workersFree() >= d.staff;
  }

  build(type, plotId, { free = false, instant = false } = {}) {
    const d = DEFS[type];
    if (!free) { if (!this.canBuild(type, plotId)) return null; this.deben -= d.cost; }
    const b = { id: this.nextId++, type, plot: plotId, level: 1, t: 0, busy: false, state: 'build', built: instant, buildT: instant ? 0 : 3, made: 0, eatT: d.eat || 0, hungry: false };
    if (instant) b.state = 'idle';
    this.buildings.push(b);
    this.emit({ type: 'built', b, instant });
    return b;
  }

  canUpgrade(b) {
    if (!b.built || b.level >= MAX_LEVEL) return false;
    const extra = staffFor(b.type, b.level + 1) - staffFor(b.type, b.level);
    return this.deben >= upgradeCost(b.type, b.level) && this.workersFree() >= extra;
  }
  upgrade(b) {
    if (!this.canUpgrade(b)) return false;
    this.deben -= upgradeCost(b.type, b.level);
    b.level++;
    this.emit({ type: 'upgraded', b });
    return true;
  }

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
          if (this.stock.bread > 0) {
            this.stock.bread--; b.eatT = d.eat;
            if (b.hungry) { b.hungry = false; this.emit({ type: 'fed', b }); }
            this.emit({ type: 'eat', b });
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
        // start a cycle if the inputs are in stock
        const need = d.in || [];
        if (need.every(([g, n]) => this.stock[g] >= n)) {
          for (const [g, n] of need) this.stock[g] -= n;
          for (const [g] of need) this.emit({ type: 'take', b, good: g });
          b.busy = true; b.t = 0;
          b.slow = 1;
          if (d.usesTools && this.L.tools) {
            if (b.made % TOOL_EVERY === 0 || !b.toolOk) {
              if (this.stock.tools > 0) { this.stock.tools--; b.toolOk = true; this.emit({ type: 'take', b, good: 'tools' }); }
              else b.toolOk = false;
            }
            if (!b.toolOk) b.slow = NO_TOOL_SLOW;
          }
          b.state = b.slow > 1 ? 'noTools' : 'work';
        } else {
          b.state = 'missing';
          b.missing = need.find(([g, n]) => this.stock[g] < n)[0];
        }
      }
      if (b.busy) {
        const speed = prod * (b.type === 'farm' ? this.floodBonus() : 1) / b.slow;
        b.t += dt * speed;
        if (b.t >= cycleOf(b.type, b.level)) {
          b.busy = false; b.made++;
          const [g, n] = d.out;
          this.stock[g] += n;
          this.emit({ type: 'made', b, good: g, n });
        }
      }
    }
    // blocks leave the stock for the pyramid on sledges
    while (this.stock.block > 0 && this.placed + this.hauling.length < this.total) {
      this.stock.block--;
      this.hauling.push(HAUL_TIME);
      this.emit({ type: 'haul' });
    }
    for (let i = this.hauling.length - 1; i >= 0; i--) {
      this.hauling[i] -= dt;
      if (this.hauling[i] <= 0) {
        this.hauling.splice(i, 1);
        this.placed++;
        this.deben += BLOCK_PAY;
        const tierDone = this._tierOf(this.placed - 1) !== this._tierOf(this.placed) || this.placed === this.total;
        this.emit({ type: 'placed', index: this.placed - 1 });
        if (tierDone) { this.deben += TIER_PAY; this.emit({ type: 'tier', tier: this._tierOf(this.placed - 1) }); }
      }
    }
  }

  _tierOf(i) {
    let acc = 0;
    for (let t = 0; t < this.tierCells.length; t++) { acc += this.tierCells[t]; if (i < acc) return t; }
    return this.tierCells.length;
  }
  done() { return this.placed >= this.total; }
}
