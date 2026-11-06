// Platformer simulation: the explorer's movement and collisions, enemies, traps, pickups,
// power-ups and puzzles (levers, stone blocks on pressure plates, symbol pedestals).
// Pure logic (no rendering) so it can be stepped headless; the renderer reads its state and events.
import { T } from './levels.js';
import { BOSS_DEF, bossInit, bossStep, bossHeight } from './boss.js';

export const P = {
  W: 0.62, H: 1.36,
  RUN: 7.2, ACC_G: 60, ACC_A: 38, FRIC: 70,
  GRAV: 40, JUMP: 15.6, CUT: 6.0, MAX_FALL: 20,
  DJUMP: 13.8, WALL_SLIDE: 3.2, WALL_JUMP_X: 8.2,
  COYOTE: 0.11, BUFFER: 0.14,
  LADDER: 4.6,
  SWIM_GRAV: 11, SWIM_MAX: 3.6, SWIM_STROKE: 6.8,
  FEATHER_T: 25, SUN_T: 10, GLIDE: 2.4,
};
const EPS = 1e-4;
const solidT = (t) => t === T.SOLID || t === T.CRACKED || t === T.CRUMBLE || t === T.GATE || t === T.BLOCK || t === T.ITEM;
const FOES = new Set(['scarab', 'mummy', 'bat', 'flyer', 'hopper', 'cobra', 'jackal']);
const HP = { mummy: 2 };

export class Sim {
  constructor(level) {
    this.L = level;
    this.tiles = level.tiles.slice();          // cracked walls break, gates open, blocks move
    this.time = 0;
    this.events = [];
    this.coins = 0;
    this.found = [false, false, false];
    this.crumbles = new Map();                 // tile index -> { t, gone }
    this.hearts = 3;
    this.maxHearts = 3;
    this.deaths = 0;
    this.check = { x: level.spawn.x, y: level.spawn.y };
    this.won = false;
    this.ents = level.ents.map((e, i) => ({ ...e, id: i, alive: true, t: 0, vx: 0, vy: 0, hp: HP[e.type] || 1, x0: e.x, y0: e.y, dir: e.dir || 1 }));
    // power-ups wait hidden inside their glyph block or jar
    for (const e of this.ents.slice()) {
      if ((e.type === 'itemblock' && e.item !== 'coin') || (e.type === 'jar' && e.item !== 'coins')) {
        const pw = { type: 'power', kind: e.item, x: e.type === 'jar' ? e.x : e.x + 0.5, y: e.type === 'jar' ? e.y + 0.8 : e.y + 1.55, hidden: true, alive: true, t: 0, id: this.ents.length, src: e.id };
        this.ents.push(pw); e.power = pw.id;
      }
    }
    this.gates = new Map();
    this.puzzles = new Map();
    for (const e of this.ents) {
      if (e.type === 'gate') { e.open = !!e.startOpen; this.gates.set(e.gid, e); }
      if (e.type === 'boss') { bossInit(e); this.boss = e; }
      if (e.type === 'torch') e.lit = e.lit !== false;
      if (e.type === 'tablet') this.puzzles.set(e.gid, { seq: e.seq, step: 0 });
      if (e.type === 'block') { e.rx = e.x; e.ry = e.y; }
    }
    this.darts = [];
    this.shots = [];                           // fireballs, venom, waves, rocks, eggs, spears
    this.pw = { shield: false, stick: false, feather: 0, sun: 0 };
    this.stick = null;
    this.p = this._newPlayer(level.spawn.x, level.spawn.y);
    this.boulder = null;
  }

  _newPlayer(x, y) {
    return { x, y, vx: 0, vy: 0, face: 1, ground: false, coyote: 0, buffer: 0, jumpsUsed: 0, climb: false, swim: false, sand: false, wall: 0,
      inv: 0, hurtT: 0, dead: 0, ride: null, lockX: 0, landT: 0, cut: false, state: 'idle', drop: 0, pushT: 0, pullT: 0, pullV: 0, glide: false };
  }

  emit(type, o = {}) { this.events.push({ type, ...o }); }
  drain() { const e = this.events; this.events = []; return e; }

  tile(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || xi >= this.L.w) return T.SOLID;
    if (yi < 0 || yi >= this.L.h) return T.EMPTY;
    const t = this.tiles[yi * this.L.w + xi];
    if (t === T.CRUMBLE) { const c = this.crumbles.get(yi * this.L.w + xi); if (c && c.gone) return T.EMPTY; }
    return t;
  }
  setTile(xi, yi, t) { if (xi >= 0 && xi < this.L.w && yi >= 0 && yi < this.L.h) this.tiles[yi * this.L.w + xi] = t; }
  solidAt(xi, yi) { return solidT(this.tile(xi + 0.5, yi + 0.5)); }
  groundTop(x, fromY) { for (let y = Math.floor(fromY); y >= 0; y--) if (this.solidAt(Math.floor(x), y) || this.tile(x, y + 0.5) === T.ONEWAY) return y + 1; return -5; }

  // ------------------------------------------------------------ step
  step(dt, input) {
    this.time += dt;
    const p = this.p;
    this._entities(dt);
    if (this.won) { p.vx *= 0.8; p.state = 'win'; return; }
    if (p.dead > 0) {
      p.dead -= dt;
      if (p.dead <= 0) this._respawn();
      return;
    }
    this._powers(dt);
    this._player(dt, input);
    this._interact(dt, input);
  }

  _powers(dt) {
    const w = this.pw;
    if (w.feather > 0) { w.feather -= dt; if (w.feather <= 0) { w.feather = 0; this.emit('powerEnd', { kind: 'feather' }); } }
    if (w.sun > 0) { w.sun -= dt; if (w.sun <= 0) { w.sun = 0; this.emit('powerEnd', { kind: 'sun' }); } }
  }

  _player(dt, I) {
    const p = this.p;
    const A = this.L.abilities;
    if (p.inv > 0) p.inv -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.lockX > 0) p.lockX -= dt;
    if (I.jumpPressed) p.buffer = P.BUFFER; else p.buffer = Math.max(0, p.buffer - dt);
    // medium under the explorer
    const mid = this.tile(p.x, p.y + P.H * 0.45), feet = this.tile(p.x, p.y + 0.15), head = this.tile(p.x, p.y + P.H - 0.15);
    const wasSwim = p.swim;
    p.swim = mid === T.WATER || feet === T.WATER && head === T.WATER;
    if (p.swim && !wasSwim && p.vy < -4) this.emit('splash', { x: p.x, y: p.y + 0.6 });
    p.sand = feet === T.SAND || mid === T.SAND;
    if (head === T.SAND && mid === T.SAND) { this._die('sand'); return; }
    const onLadder = this.tile(p.x, p.y + 0.5) === T.LADDER || this.tile(p.x, p.y + 0.05) === T.LADDER;
    // standing on the top rung: down (without sideways) climbs into the ladder below the feet
    const ladderBelow = this.tile(p.x, p.y - 0.2) === T.LADDER;
    if (!p.climb && p.pullT <= 0 && I.y > 0.55 && onLadder) {
      p.climb = true; p.vx = 0; p.vy = 0; p.x += (Math.floor(p.x) + 0.5 - p.x) * 0.5;
    } else if (!p.climb && p.pullT <= 0 && I.y < -0.55 && Math.abs(I.x) < 0.5 && (ladderBelow || (onLadder && !p.ground))) {
      p.climb = true; p.vx = 0; p.vy = 0; p.ground = false; p.ride = null;
      p.x += (Math.floor(p.x) + 0.5 - p.x) * 0.7;
      if (ladderBelow && !onLadder) p.y -= 0.12;
    }
    if (p.climb && !onLadder && !(this.tile(p.x, p.y - 0.1) === T.LADDER)) p.climb = false;

    let ax = I.x;
    if (Math.abs(ax) < 0.18) ax = 0;
    if (ax && p.pullT <= 0) p.face = ax > 0 ? 1 : -1;
    let grav = P.GRAV, maxFall = P.MAX_FALL, speed = P.RUN;
    if (this.pw.sun > 0) speed *= 1.22;
    if (p.swim) { grav = P.SWIM_GRAV; maxFall = P.SWIM_MAX; speed *= 0.62; }
    if (p.sand) { speed *= 0.38; }
    const sf = this.ents.find((e) => e.type === 'sandfall' && Math.abs(p.x - e.x) < (e.w || 1.4) / 2 + P.W / 2 && p.y < e.y + 9);
    if (sf) { speed *= 0.7; }
    const jumpV = P.JUMP * (this.pw.feather > 0 ? 1.13 : 1);
    p.glide = false;

    if (p.climb) {
      p.vx = ax * 2.6;
      p.vy = (Math.abs(I.y) > 0.25 ? I.y : 0) * P.LADDER;
      p.ground = false;
      if (p.buffer > 0) { p.climb = false; p.buffer = 0; p.vy = jumpV * 0.85; p.vx = ax * speed; this.emit('jump', { x: p.x, y: p.y }); }
    } else {
      // horizontal (a pull walks the explorer back one tile)
      if (p.pullT > 0) { p.pullT -= dt; p.vx = p.pullV; if (p.pullT <= 0) p.vx = 0; }
      else if (p.lockX <= 0) {
        const target = ax * speed;
        const acc = ax ? (p.ground ? P.ACC_G : P.ACC_A) : (p.ground ? P.FRIC : P.ACC_A * 0.6);
        if (p.vx < target) p.vx = Math.min(target, p.vx + acc * dt); else if (p.vx > target) p.vx = Math.max(target, p.vx - acc * dt);
      }
      // gravity
      p.vy -= grav * dt;
      if (sf) p.vy = Math.min(p.vy, -3.5);
      if (p.sand) p.vy = Math.max(p.vy, p.vy < 0 ? -0.7 : p.vy);
      // the ibis feather lets the explorer float down while A is held
      if (this.pw.feather > 0 && I.jump && !p.swim && !p.ground && p.vy < -P.GLIDE) { p.vy = -P.GLIDE; p.glide = true; }
      // wall slide
      p.wall = 0;
      if (A.wall && !p.ground && !p.swim) {
        const side = ax > 0 ? 1 : ax < 0 ? -1 : 0;
        if (side && this._touchWall(side)) { p.wall = side; if (p.vy < -P.WALL_SLIDE) p.vy = -P.WALL_SLIDE; }
      }
      p.vy = Math.max(p.vy, -maxFall);
      // jumping
      if (p.ground || p.climb) p.coyote = P.COYOTE; else p.coyote = Math.max(0, p.coyote - dt);
      if (p.buffer > 0 && p.pullT <= 0) {
        if (p.swim) {
          p.vy = this.tile(p.x, p.y + P.H + 0.1) === T.WATER ? P.SWIM_STROKE : P.JUMP * 0.9;
          p.buffer = 0; this.emit('swim', { x: p.x, y: p.y });
        } else if (I.y < -0.55 && p.ground && this._onOneway()) {
          p.drop = 0.25; p.y -= 0.05; p.ground = false; p.buffer = 0;
        } else if (p.coyote > 0) {
          p.vy = p.sand ? jumpV * 0.62 : jumpV; p.coyote = 0; p.buffer = 0; p.ground = false; p.cut = false; p.jumpsUsed = 0;
          if (p.ride) { p.vx += (p.ride.vx || 0) * 0.5; p.ride = null; }
          this.emit('jump', { x: p.x, y: p.y });
        } else if (p.wall) {
          p.vy = P.JUMP * 0.95; p.vx = -p.wall * P.WALL_JUMP_X; p.face = -p.wall; p.lockX = 0.16; p.buffer = 0; p.cut = false;
          this.emit('walljump', { x: p.x + p.wall * 0.3, y: p.y + 0.6 });
        } else if (A.double && p.jumpsUsed < 1) {
          p.vy = P.DJUMP; p.jumpsUsed = 1; p.buffer = 0; p.cut = false;
          this.emit('djump', { x: p.x, y: p.y });
        }
      }
      // variable height: letting go cuts the rise
      if (!I.jump && p.vy > P.CUT && !p.cut && !p.swim) { p.vy = P.CUT; p.cut = true; }
    }
    if (p.drop > 0) p.drop -= dt;
    // riding a platform
    if (p.ride) { p.x += p.ride.mx || 0; p.y = p.ride.y; }
    this.blockedBy = null;
    this._move(dt);
    // pushing a stone block: keep walking against it for a moment
    const bb = this.blockedBy;
    if (bb && p.ground && !p.climb && ax && Math.sign(ax) === bb.dir && bb.y === Math.floor(p.y + 0.02)) {
      p.pushT += dt;
      if (p.pushT > 0.14) { if (this._push(bb.x, bb.y, bb.dir)) p.pushT = -0.12; else p.pushT = 0.1; }
    } else if (p.pushT > 0 || !bb) p.pushT = 0;
    // falling out of the world
    if (p.y < -2) this._die('pit');
    // animation state
    const was = p.state;
    if (p.hurtT > 0) p.state = 'hurt';
    else if (p.climb) p.state = 'climb';
    else if (p.swim) p.state = 'swim';
    else if (!p.ground) p.state = p.vy > 0 ? 'jump' : 'fall';
    else if (p.pullT > 0 || (bb && p.pushT !== 0)) p.state = 'push';
    else p.state = Math.abs(p.vx) > 0.6 ? 'run' : 'idle';
    if (was === 'fall' && p.state !== 'fall' && p.ground) { p.landT = 0.2; this.emit('land', { x: p.x, y: p.y, v: -p.lastVy }); }
    p.lastVy = p.vy;
  }

  _onOneway() { const p = this.p; const t = this.tile(p.x, p.y - 0.1); return t === T.ONEWAY || (p.ride && true); }
  _touchWall(side) {
    const p = this.p, x = p.x + side * (P.W / 2 + 0.06);
    return this.solidAt(Math.floor(x), Math.floor(p.y + 0.3)) && this.solidAt(Math.floor(x), Math.floor(p.y + P.H - 0.3));
  }

  _move(dt) {
    const p = this.p;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt / 0.3));
    const h = dt / steps;
    const wasGround = p.ground;
    p.ground = false;
    for (let s = 0; s < steps; s++) {
      // X
      p.x += p.vx * h;
      const y0 = Math.floor(p.y + 0.02), y1 = Math.floor(p.y + P.H - 0.02);
      if (p.vx > 0) {
        const xr = Math.floor(p.x + P.W / 2);
        for (let y = y0; y <= y1; y++) if (this.solidAt(xr, y)) { p.x = xr - P.W / 2 - EPS; p.vx = 0; if (this.tile(xr + 0.5, y + 0.5) === T.BLOCK) this.blockedBy = { x: xr, y, dir: 1 }; break; }
      } else if (p.vx < 0) {
        const xl = Math.floor(p.x - P.W / 2);
        for (let y = y0; y <= y1; y++) if (this.solidAt(xl, y)) { p.x = xl + 1 + P.W / 2 + EPS; p.vx = 0; if (this.tile(xl + 0.5, y + 0.5) === T.BLOCK) this.blockedBy = { x: xl, y, dir: -1 }; break; }
      }
      // Y
      const prevY = p.y;
      p.y += p.vy * h;
      const x0 = Math.floor(p.x - P.W / 2 + 0.04), x1 = Math.floor(p.x + P.W / 2 - 0.04);
      if (p.vy <= 0) {
        const yb = Math.floor(p.y);
        for (let x = x0; x <= x1; x++) {
          const t = this.tile(x + 0.5, yb + 0.5);
          const top = yb + 1;
          const oneway = (t === T.ONEWAY || (t === T.LADDER && this.tile(x + 0.5, yb + 1.5) !== T.LADDER && !p.climb)) && prevY >= top - 0.05 && p.drop <= 0;
          if (solidT(t) || oneway) {
            p.y = top; p.vy = 0; p.ground = true; if (p.climb && solidT(t)) p.climb = false;
            if (t === T.CRUMBLE) this._crumble(x, yb);
            break;
          }
        }
      } else {
        const yt = Math.floor(p.y + P.H);
        // the column under the explorer's head is checked first, so a glyph block is hit squarely
        const cx = Math.floor(p.x), order = [cx].concat([x0, x1].filter((q) => q !== cx));
        for (const x of order) {
          if (x < x0 || x > x1 || !this.solidAt(x, yt)) continue;
          p.y = yt - P.H - EPS; p.vy = 0;
          if (this.tile(x + 0.5, yt + 0.5) === T.ITEM) this._hitBlock(x, yt);
          else this.emit('bump', { x: p.x, y: yt });
          break;
        }
      }
    }
    // moving platforms (one-way from above)
    p.ride = null;
    if (p.vy <= 0 && !p.climb) {
      for (const e of this.ents) {
        if (e.type !== 'mover') continue;
        const top = e.y;
        if (p.x + P.W / 2 > e.x - 0.05 && p.x - P.W / 2 < e.x + e.w + 0.05 && p.y <= top + 0.02 && p.y >= top - 0.45 && p.drop <= 0) {
          p.y = top; p.vy = 0; p.ground = true; p.ride = e; break;
        }
      }
    }
    if (!wasGround && p.ground) p.jumpsUsed = 0;
  }

  _crumble(x, y) {
    const i = y * this.L.w + x;
    if (!this.crumbles.has(i)) { this.crumbles.set(i, { t: 0, gone: false, x, y }); this.emit('crumble', { x, y }); }
  }

  // ------------------------------------------------------------ glyph blocks, jars, power-ups
  _hitBlock(x, y) {
    const b = this.ents.find((e) => e.type === 'itemblock' && e.x === x && e.y === y);
    if (!b) return;
    if (b.used) { this.emit('bump', { x: x + 0.5, y }); return; }
    b.bounce = 0.25;
    if (b.item === 'coin') {
      this.coins++; b.n = (b.n || 1) - 1; if (b.n <= 0) b.used = true;
      this.emit('blockCoin', { x: x + 0.5, y: y + 1, id: b.id });
    } else {
      b.used = true;
      const pw = this.ents[b.power];
      if (pw) { pw.hidden = false; pw.rise = 0.5; pw.t = 0; }
      this.emit('blockPower', { x: x + 0.5, y: y + 1, id: b.id, kind: b.item });
    }
    // enemies standing on the block are knocked off
    for (const e of this.ents) if (e.alive && FOES.has(e.type) && Math.abs(e.x - (x + 0.5)) < 0.8 && Math.abs(e.y - (y + 1)) < 0.4) this._defeat(e, 'bump');
  }
  _breakJar(e) {
    if (!e.alive) return;
    e.alive = false;
    if (e.item === 'coins') { this.coins += 3; this.emit('jar', { x: e.x, y: e.y, id: e.id, coins: 3 }); }
    else { const pw = this.ents[e.power]; if (pw) { pw.hidden = false; pw.rise = 0.4; pw.t = 0; } this.emit('jar', { x: e.x, y: e.y, id: e.id, kind: e.item }); }
  }
  _gain(kind) {
    const w = this.pw;
    if (kind === 'shield') w.shield = true;
    else if (kind === 'stick') w.stick = true;
    else if (kind === 'feather') w.feather = P.FEATHER_T;
    else if (kind === 'sun') w.sun = P.SUN_T;
  }
  _defeat(e, how) {
    if (!e.alive) return;
    e.alive = false;
    this.coins += 2;
    this.emit('stomp', { x: e.x, y: e.y + 0.5, kind: e.type, id: e.id, how });
  }

  // ------------------------------------------------------------ puzzles
  _openGate(gid, delay = 0) {
    const g = this.gates.get(gid);
    if (!g || g.open || g.opening !== undefined) return;
    g.opening = delay;
  }
  _closeGate(gid) {
    const g = this.gates.get(gid);
    if (!g || !g.open) return;
    g.open = false; g.opening = undefined;
    for (let y = g.y; y < g.y + g.h; y++) this.setTile(g.x, y, T.GATE);
    this.emit('gateClose', { x: g.x + 0.5, y: g.y, gid, id: g.id });
  }
  _spawnFoe(type, x, y, o = {}) {
    const e = { type, x, y, x0: x, y0: y, id: this.ents.length, alive: true, t: 0, vx: 0, vy: 0, hp: HP[type] || 1, dir: 1, ...o };
    this.ents.push(e);
    this.emit('spawn', { id: e.id, x, y, type });
    return e;
  }
  _shot(o) { this.shots.push({ alive: true, wait: 0, ...o }); }
  _bossHit(B) {
    B.hp--; B.inv = 0.8;
    this.emit('bossHit', { x: B.x, y: B.y + bossHeight(B), hp: B.hp, id: B.id });
    if (B.hp <= 0) {
      B.phase = 'dying'; B.st = 0; B.vul = false; B.beam = false;
      this.shots = [];
      for (const e of this.ents) if (e.minion && e.alive) this._defeat(e, 'boss');
      this.emit('bossDie', { x: B.x, y: B.y, kind: B.kind });
    } else { B.state = BOSS_DEF[B.kind].mode === 'hidden' ? 'sink' : 'recover'; B.st = 0; }
  }
  _block(x, y) { return this.ents.find((e) => e.type === 'block' && e.x === x && e.y === y && !e.slide && !e.fall); }
  _push(bx, by, dir) {
    const b = this._block(bx, by);
    if (!b) return false;
    const tx = bx + dir;
    if (tx < 0 || tx >= this.L.w) return false;
    const t = this.tile(tx + 0.5, by + 0.5);
    if (t !== T.EMPTY && t !== T.WATER) return false;
    if (this.tile(bx + 0.5, by + 1.5) === T.BLOCK) return false;     // something heavy on top
    b.slide = { fx: bx, tx, t: 0, dur: 0.3 };
    this.setTile(tx, by, T.BLOCK);
    this.emit('push', { x: bx + 0.5, y: by });
    return true;
  }
  // B next to a block pulls it one tile; the explorer steps back
  _pull() {
    const p = this.p;
    if (!p.ground || p.climb) return false;
    const fy = Math.floor(p.y + 0.02);
    for (const dir of [p.face, -p.face]) {
      const bx = Math.floor(p.x + dir * (P.W / 2 + 0.3));
      const b = this._block(bx, fy);
      if (!b) continue;
      const back = -dir, nx = p.x + back;
      let ok = true;
      for (let cx = Math.floor(nx - P.W / 2); cx <= Math.floor(nx + P.W / 2); cx++) for (let cy = fy; cy <= Math.floor(p.y + P.H); cy++) if (cx !== bx && this.solidAt(cx, cy)) ok = false;
      const gx = Math.floor(nx), under = this.tile(gx + 0.5, fy - 0.5);
      if (!(solidT(under) || under === T.ONEWAY || under === T.LADDER)) ok = false;
      if (!ok) continue;
      b.slide = { fx: bx, tx: bx + back, t: 0, dur: 0.34, pull: true };
      p.pullT = 0.34; p.pullV = back / 0.34; p.face = dir; p.vx = p.pullV;
      this.emit('pull', { x: bx + 0.5, y: fy });
      return true;
    }
    return false;
  }
  _blockFalls(b) {
    if (b.y - 1 < 0) return true;
    const t = this.tile(b.x + 0.5, b.y - 0.5);
    return t === T.EMPTY || t === T.WATER || t === T.SPIKE || t === T.SPIKE_DOWN;
  }
  _symbol(e) {
    const pz = this.puzzles.get(e.gid);
    if (!pz || e.lit) return;
    if (e.sym === pz.seq[pz.step]) {
      e.lit = true; pz.step++;
      this.emit('symRight', { x: e.x, y: e.y, id: e.id, step: pz.step });
      if (pz.step >= pz.seq.length) { this._openGate(e.gid, 0.7); this.emit('solved', { x: e.x, y: e.y, gid: e.gid }); }
    } else {
      for (const q of this.ents) if (q.type === 'pedestal' && q.gid === e.gid) q.lit = false;
      pz.step = 0;
      this.emit('symWrong', { x: e.x, y: e.y, id: e.id, gid: e.gid });
    }
  }
  // what B would do here (also used to light up the button)
  actionTarget() {
    const p = this.p;
    for (const e of this.ents) {
      if (!e.alive) continue;
      if (e.type === 'lever' && !e.on && Math.abs(p.x - e.x) < 1.1 && Math.abs(p.y - e.y) < 1.3) return { kind: 'lever', e };
      if (e.type === 'pedestal' && !e.lit && Math.abs(p.x - e.x) < 1.0 && Math.abs(p.y - e.y) < 1.3) return { kind: 'pedestal', e };
      if (e.type === 'jar' && Math.abs(p.x - e.x) < 1.2 && Math.abs(p.y - e.y) < 1.2) return { kind: 'jar', e };
    }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = Math.floor(p.x) + dx, y = Math.floor(p.y + 0.5) + dy;
      if (this.tile(x + 0.5, y + 0.5) === T.CRACKED && Math.abs(x + 0.5 - p.x) < 1.6 && Math.abs(y + 0.5 - (p.y + 0.5)) < 1.6) return { kind: 'crack' };
    }
    if (p.ground) {
      const fy = Math.floor(p.y + 0.02);
      for (const dir of [1, -1]) if (this._block(Math.floor(p.x + dir * (P.W / 2 + 0.3)), fy)) return { kind: 'block' };
    }
    return null;
  }
  _action() {
    const p = this.p;
    const a = this.actionTarget();
    if (a && a.kind === 'lever') { a.e.on = true; this.emit('lever', { x: a.e.x, y: a.e.y, id: a.e.id, gid: a.e.gid }); this._openGate(a.e.gid, 0.45); return; }
    if (a && a.kind === 'pedestal') { this._symbol(a.e); return; }
    if (a && a.kind === 'jar') { this._breakJar(a.e); return; }
    if (a && a.kind === 'crack') {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const x = Math.floor(p.x) + dx, y = Math.floor(p.y + 0.5) + dy;
        if (this.tile(x + 0.5, y + 0.5) === T.CRACKED && Math.abs(x + 0.5 - p.x) < 1.6 && Math.abs(y + 0.5 - (p.y + 0.5)) < 1.6) { this.setTile(x, y, T.EMPTY); this.emit('break', { x, y }); }
      }
      return;
    }
    if (a && a.kind === 'block' && this._pull()) return;
    if (this.pw.stick && !this.stick) {
      this.stick = { x: p.x + p.face * 0.5, y: p.y + 0.95, vx: p.face * 12.5, vy: 0, t: 0, back: false, rot: 0, hit: new Set() };
      this.emit('throw', { x: p.x, y: p.y });
      return;
    }
    this.emit('action', { x: p.x, y: p.y });
  }

  // ------------------------------------------------------------ entities, pickups, hazards
  _entities(dt) {
    const p = this.p;
    for (const [i, c] of this.crumbles) {
      c.t += dt;
      if (!c.gone && c.t > 0.5) { c.gone = true; this.emit('crumbleFall', { x: c.x, y: c.y }); }
      if (c.gone && c.t > 4.5) {
        const px0 = p.x - P.W / 2, px1 = p.x + P.W / 2;
        if (!(px1 > c.x && px0 < c.x + 1 && p.y < c.y + 1 && p.y + P.H > c.y)) { this.crumbles.delete(i); this.emit('crumbleBack', { x: c.x, y: c.y }); }
      }
    }
    for (const e of this.ents) {
      if (!e.alive) continue;
      e.t += dt;
      switch (e.type) {
        case 'mover': {
          // x: left edge, y: top surface; slides back and forth along len tiles
          const len = e.len, ph = (e.t * e.speed) % (len * 2), off = ph < len ? ph : len * 2 - ph;
          const ease = (q) => (len * (1 - Math.cos(Math.PI * q / len)) / 2);
          const nx = e.x0 + (e.dx ? ease(off) : 0), ny = e.y0 + (e.dy ? ease(off) : 0);
          e.mx = nx - e.x; e.my = ny - e.y; e.vx = e.mx / Math.max(dt, 1e-4);
          e.x = nx; e.y = ny;
          break;
        }
        case 'jackal': {
          // a temple guard: patrols, spots the explorer, barks and charges
          const dist = p.x - e.x, sees = Math.abs(dist) < 7 && Math.abs(p.y - e.y) < 1.2 && Math.sign(dist) === e.dir && p.dead <= 0;
          e.mode = e.mode || 'walk';
          if (e.mode === 'walk' && sees) { e.mode = 'alert'; e.mt = 0.45; this.emit('bark', { x: e.x, y: e.y, id: e.id }); }
          const sp = e.mode === 'charge' ? 8.2 : e.mode === 'walk' ? 1.5 : 0;
          if (e.mode === 'alert' || e.mode === 'rest') { e.mt -= dt; if (e.mt <= 0) { e.mode = e.mode === 'alert' ? 'charge' : 'walk'; e.mt = 1.5; } }
          if (sp) {
            const ahead = e.x + e.dir * 0.5;
            const wall = this.solidAt(Math.floor(ahead), Math.floor(e.y + 0.3));
            const edge = !this.solidAt(Math.floor(ahead), Math.floor(e.y - 0.5)) && this.tile(ahead, e.y - 0.5) !== T.ONEWAY;
            if (wall || edge) { if (e.mode === 'charge') { e.mode = 'rest'; e.mt = 0.9; } e.dir = -e.dir; } else e.x += e.dir * sp * dt;
            if (e.mode === 'charge') { e.mt -= dt; if (e.mt <= 0) { e.mode = 'rest'; e.mt = 0.9; } }
          }
          break;
        }
        case 'scarab': case 'mummy': {
          const sp = e.type === 'scarab' ? 1.3 : 0.95;
          if (e.type === 'mummy' && Math.abs(p.x - e.x) < 8 && Math.abs(p.y - e.y) < 3) e.dir = p.x > e.x ? 1 : -1;
          const ahead = e.x + e.dir * 0.5;
          const wall = this.solidAt(Math.floor(ahead), Math.floor(e.y + 0.3));
          const edge = !this.solidAt(Math.floor(ahead), Math.floor(e.y - 0.5)) && this.tile(ahead, e.y - 0.5) !== T.ONEWAY;
          if (wall || edge) e.dir = -e.dir; else e.x += e.dir * sp * dt;
          if (e.type === 'mummy' && Math.abs(p.x - e.x) < 7 && (e.groan = (e.groan || 2 + (e.id % 3)) - dt) <= 0) { e.groan = 5 + (e.id % 4); this.emit('groan', { x: e.x, y: e.y }); }
          break;
        }
        case 'hopper': {
          // a beetle that hops toward the explorer
          if (!e.air) {
            e.hop = (e.hop ?? 0.8 + (e.id % 5) * 0.2) - dt;
            if (e.hop <= 0 && Math.abs(p.x - e.x) < 9 && Math.abs(p.y - e.y) < 5) {
              e.dir = p.x > e.x ? 1 : -1;
              const land = this.groundTop(e.x + e.dir * 1.6, e.y + 1.5);
              e.vx = Math.abs(land - e.y) <= 1.5 ? e.dir * 2.8 : 0;
              e.vy = 10; e.air = true; e.hop = 1.2 + (e.id % 3) * 0.25;
              this.emit('hop', { x: e.x, y: e.y, id: e.id });
            }
          } else {
            e.vy -= 30 * dt;
            const nx = e.x + e.vx * dt;
            if (this.solidAt(Math.floor(nx + Math.sign(e.vx) * 0.35), Math.floor(e.y + 0.3))) e.vx = 0; else e.x = nx;
            const gt = this.groundTop(e.x, e.y + 0.5);
            e.y += e.vy * dt;
            if (e.vy < 0 && e.y <= gt) { e.y = gt; e.air = false; e.vx = 0; e.vy = 0; }
            if (e.y < -3) e.alive = false;
          }
          break;
        }
        case 'bat': {
          // circles, then swoops down at the explorer and climbs back
          e.mode = e.mode || 'hover';
          if (e.mode === 'hover') {
            e.ht = (e.ht || 0) + dt; e.cool = (e.cool || 0) - dt;
            e.x = e.x0 + Math.sin(e.ht * 1.1) * e.r * 1.6; e.y = e.y0 + Math.sin(e.ht * 2.3) * 0.45; e.dir = Math.cos(e.ht * 1.1) > 0 ? 1 : -1;
            if (e.cool <= 0 && Math.abs(p.x - e.x) < 4.5 && p.y < e.y - 0.5 && e.y - p.y < 6 && p.dead <= 0) { e.mode = 'dive'; e.tx = p.x; e.ty = p.y + 0.7; e.mt = 0; this.emit('screech', { x: e.x, y: e.y }); }
          } else if (e.mode === 'dive') {
            e.mt += dt; const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy);
            e.dir = dx > 0 ? 1 : -1;
            if (d < 0.3 || e.mt > 1.2) { e.mode = 'back'; } else { e.x += dx / d * 6.5 * dt; e.y += dy / d * 6.5 * dt; }
          } else {
            const hx = e.x0 + Math.sin(e.ht * 1.1) * e.r * 1.6, hy = e.y0 + Math.sin(e.ht * 2.3) * 0.45, dx = hx - e.x, dy = hy - e.y, d = Math.hypot(dx, dy);
            if (d < 0.2) { e.mode = 'hover'; e.cool = 2.4; } else { e.x += dx / d * 3.2 * dt; e.y += dy / d * 3.2 * dt; e.dir = dx > 0 ? 1 : -1; }
          }
          break;
        }
        case 'flyer': { const a = e.t * 0.9 + (e.ph || 0); e.x = e.x0 + Math.sin(a) * e.r; e.y = e.y0 + Math.sin(e.t * 2.1) * 0.4; e.dir = Math.cos(a) > 0 ? 1 : -1; break; }
        case 'cobra': {
          e.dir = p.x > e.x ? 1 : -1;
          const near = Math.abs(p.x - e.x) < 2.6 && Math.abs(p.y - e.y) < 1.5;
          if (near && !(e.strike > 0) && !(e.cool > 0)) { e.strike = 0.45; this.emit('hiss', { x: e.x, y: e.y }); }
          // further away it spits venom in an arc
          e.spit = (e.spit ?? 1 + (e.id % 3) * 0.5) - dt;
          if (!near && e.spit <= 0 && Math.abs(p.x - e.x) < 8 && Math.abs(p.y - e.y) < 2.5 && p.dead <= 0) {
            e.spit = 2.6; const T0 = 0.9, g = 10, sx = e.x + e.dir * 0.3, sy = e.y + 1.0;
            this._shot({ kind: 'venom', x: sx, y: sy, vx: (p.x - sx) / T0, vy: (p.y + 0.5 - sy + 0.5 * g * T0 * T0) / T0, g, r: 0.25, life: 3 });
            this.emit('spit', { x: sx, y: sy });
          }
          if (e.strike > 0) { e.strike -= dt; if (e.strike <= 0) e.cool = 1.1; }
          if (e.cool > 0) e.cool -= dt;
          break;
        }
        case 'dart': {
          const ph = (e.t + (e.phase || 0)) % e.period;
          if (e.lastPh !== undefined && ph < e.lastPh) { this.darts.push({ x: e.x, y: e.y, vx: e.dir * 7.5, alive: true }); this.emit('dart', { x: e.x, y: e.y }); }
          e.lastPh = ph;
          break;
        }
        case 'crusher': {
          // up (waiting) -> slam -> rest -> rise
          const T0 = e.period, ph = (e.t + (e.phase || 0)) % T0;
          let k;
          if (ph < T0 * 0.45) k = 0; else if (ph < T0 * 0.45 + 0.18) k = (ph - T0 * 0.45) / 0.18; else if (ph < T0 * 0.65) k = 1; else k = 1 - (ph - T0 * 0.65) / (T0 * 0.35);
          if (e.k !== undefined && e.k < 1 && k >= 1) this.emit('slam', { x: e.x, y: e.y - e.drop });
          e.k = k;
          e.falling = ph >= T0 * 0.45 && ph < T0 * 0.45 + 0.18;
          break;
        }
        case 'fire': { const ph = (e.t + (e.phase || 0)) % e.period; e.warn = ph < 0.45; e.burning = ph >= 0.45 && ph < 0.45 + e.on; break; }
        case 'itemblock': if (e.bounce > 0) e.bounce -= dt; break;
        case 'boss': bossStep(this, e, dt); break;
        case 'power': if (!e.hidden && e.rise > 0) e.rise = Math.max(0, e.rise - dt); break;
        case 'gate':
          if (e.opening !== undefined && !e.open) {
            e.opening -= dt;
            if (e.opening <= 0) { e.open = true; for (let y = e.y; y < e.y + e.h; y++) this.setTile(e.x, y, T.EMPTY); this.emit('gate', { x: e.x + 0.5, y: e.y, gid: e.gid, id: e.id }); }
          }
          break;
        case 'block': {
          if (e.slide) {
            const s = e.slide; s.t += dt;
            const k = Math.min(1, s.t / s.dur);
            e.rx = s.fx + (s.tx - s.fx) * k;
            if (k >= 1) {
              e.slide = null;
              this.setTile(s.fx, e.y, T.EMPTY); this.setTile(s.tx, e.y, T.BLOCK);
              e.x = s.tx; e.rx = e.x;
              if (this._blockFalls(e)) e.fall = { t: 0 };
            }
          } else if (e.fall) {
            e.fall.t += dt;
            e.ry = e.y - Math.min(1, e.fall.t / 0.13);
            if (e.fall.t >= 0.13) {
              this.setTile(e.x, e.y, T.EMPTY); e.y--; e.ry = e.y;
              if (e.y < 0) {
                // lost in a pit: the block comes back where it started
                e.x = e.x0; e.y = e.y0; e.rx = e.x; e.ry = e.y; e.fall = null; this.setTile(e.x, e.y, T.BLOCK);
                this.emit('blockReset', { x: e.x, y: e.y });
              } else {
                this.setTile(e.x, e.y, T.BLOCK);
                if (this._blockFalls(e)) e.fall = { t: 0 }; else { e.fall = null; this.emit('blockLand', { x: e.x + 0.5, y: e.y }); }
              }
            }
          } else { e.rx = e.x; e.ry = e.y; }
          break;
        }
        case 'plate': {
          // only the weight of a stone block holds the plate down; the explorer just clicks it
          const b = this.ents.find((q) => q.type === 'block' && q.x === e.x && q.y === e.y && !q.slide && !q.fall);
          const stand = p.ground && Math.abs(p.y - e.y) < 0.05 && Math.abs(p.x - (e.x + 0.5)) < 0.6;
          if (b && !e.held) { e.held = true; this.emit('plate', { x: e.x + 0.5, y: e.y, on: true }); this._openGate(e.gid, 0.3); }
          if (stand && !e.step) this.emit('plateClick', { x: e.x + 0.5, y: e.y });
          e.step = stand;
          break;
        }
        default: break;
      }
    }
    for (const d of this.darts) {
      if (!d.alive) continue;
      d.x += d.vx * dt;
      if (this.solidAt(Math.floor(d.x), Math.floor(d.y))) d.alive = false;
      if (d.x < 0 || d.x > this.L.w) d.alive = false;
    }
    this.darts = this.darts.filter((d) => d.alive);
    // guardian and cobra shots
    for (const s2 of this.shots) {
      if (!s2.alive) continue;
      if (s2.wait > 0) { s2.wait -= dt; continue; }
      s2.life -= dt;
      s2.vy -= s2.g * dt; s2.x += s2.vx * dt; s2.y += s2.vy * dt;
      if (s2.life <= 0) { s2.alive = false; continue; }
      if (s2.kind === 'wave') { if (this.solidAt(Math.floor(s2.x + Math.sign(s2.vx) * 0.3), Math.floor(s2.y))) s2.alive = false; continue; }
      const t = this.tile(s2.x, s2.y);
      if (solidT(t) || (s2.vy < 0 && t === T.ONEWAY && s2.kind !== 'rock') || s2.y < -2 || (s2.floor !== undefined && s2.y <= s2.floor)) {
        s2.alive = false;
        if (s2.kind === 'egg' && this.ents.filter((e) => e.minion && e.alive).length < 4) this._spawnFoe('scarab', s2.x, Math.floor(s2.y) + 1, { minion: true, dir: p.x > s2.x ? 1 : -1 });
        this.emit('shotHit', { x: s2.x, y: s2.y, kind: s2.kind });
      }
    }
    this.shots = this.shots.filter((q) => q.alive);
    // the throwing stick flies out and comes back
    const s = this.stick;
    if (s) {
      s.t += dt; s.rot += dt * 22;
      if (!s.back) {
        s.x += s.vx * dt; s.vx *= 1 - dt * 1.4;
        if (s.t > 0.42 || this.solidAt(Math.floor(s.x + Math.sign(s.vx) * 0.25), Math.floor(s.y))) s.back = true;
      } else {
        const dx = p.x - s.x, dy = p.y + 0.9 - s.y, dd = Math.hypot(dx, dy) || 1;
        s.x += dx / dd * 14 * dt; s.y += dy / dd * 14 * dt;
        if (dd < 0.6 || s.t > 3 || p.dead > 0) { this.stick = null; this.emit('catch', { x: p.x, y: p.y }); }
      }
      const B2 = this.boss;
      if (this.stick && B2 && B2.phase === 'fight' && !B2.hidden && !s.hit.has(B2.id)) {
        const D = BOSS_DEF[B2.kind];
        if (Math.abs(s.x - B2.x) < D.w / 2 + 0.2 && s.y > B2.y && s.y < B2.y + bossHeight(B2) + 0.2) {
          s.hit.add(B2.id); s.back = true;
          if (B2.vul && B2.inv <= 0) this._bossHit(B2); else this.emit('clink', { x: s.x, y: s.y });
        }
      }
      if (this.stick) for (const e of this.ents) {
        if (!e.alive || s.hit.has(e.id)) continue;
        const cy = e.type === 'mummy' || e.type === 'jackal' ? e.y + 0.8 : e.type === 'bat' || e.type === 'flyer' ? e.y : e.y + 0.35;
        if (Math.abs(e.x - s.x) < 0.6 && Math.abs(cy - s.y) < 0.75) {
          if (FOES.has(e.type)) { s.hit.add(e.id); e.hp--; if (e.hp <= 0) this._defeat(e, 'stick'); else this.emit('stompHit', { x: e.x, y: e.y + 1, id: e.id }); }
          else if (e.type === 'jar') { s.hit.add(e.id); this._breakJar(e); }
        }
      }
    }
    // the rolling boulder
    const B = this.boulder;
    if (B && B.active) {
      B.x += B.speed * dt;
      const gt = this.groundTop(B.x, B.y + 3);
      B.y += (Math.max(gt, -2) - B.y) * Math.min(1, dt * 8);
      B.rot -= B.speed * dt / 1.1;
      if (B.x >= B.end) { B.active = false; this.emit('boulderCrash', { x: B.x, y: B.y }); }
    }
  }

  _interact(dt, I) {
    const p = this.p;
    if (p.dead > 0) return;
    const px0 = p.x - P.W / 2, px1 = p.x + P.W / 2, py0 = p.y, py1 = p.y + P.H;
    const hit = (x0, y0, x1, y1) => px1 > x0 && px0 < x1 && py1 > y0 && py0 < y1;
    const sun = this.pw.sun > 0;
    // spikes
    if (!sun) {
      for (let x = Math.floor(px0 + 0.1); x <= Math.floor(px1 - 0.1); x++) {
        for (let y = Math.floor(py0); y <= Math.floor(py1); y++) {
          const t = this.tile(x + 0.5, y + 0.5);
          if (t === T.SPIKE && py0 < y + 0.55 && hit(x + 0.15, y, x + 0.85, y + 0.55)) { if (y <= 1) this._die('spikes'); else this._hurt(p.x < x + 0.5 ? -1 : 1); return; }
          if (t === T.SPIKE_DOWN && hit(x + 0.15, y + 0.45, x + 0.85, y + 1)) { this._hurt(0); return; }
        }
      }
    }
    if (I.actionPressed) this._action();
    for (const e of this.ents) {
      if (!e.alive) continue;
      switch (e.type) {
        case 'coin': if (hit(e.x - 0.35, e.y - 0.35, e.x + 0.35, e.y + 0.35)) { e.alive = false; this.coins++; this.emit('coin', { x: e.x, y: e.y, id: e.id }); } break;
        case 'papyrus': if (hit(e.x - 0.45, e.y - 0.5, e.x + 0.45, e.y + 0.5)) { e.alive = false; this.found[e.id] = true; this.emit('papyrus', { x: e.x, y: e.y, id: e.id }); } break;
        case 'ankh': if (hit(e.x - 0.4, e.y - 0.5, e.x + 0.4, e.y + 0.5)) { e.alive = false; this.hearts = Math.min(this.maxHearts, this.hearts + 1); this.emit('heal', { x: e.x, y: e.y }); } break;
        case 'power': if (!e.hidden && e.rise <= 0.15 && hit(e.x - 0.45, e.y - 0.5, e.x + 0.45, e.y + 0.5)) { e.alive = false; this._gain(e.kind); this.emit('powerGet', { x: e.x, y: e.y, id: e.id, kind: e.kind }); } break;
        case 'jar': if (p.vy < -2 && p.y > e.y + 0.6 && hit(e.x - 0.4, e.y, e.x + 0.4, e.y + 0.9)) { this._breakJar(e); p.vy = 8; } break;
        case 'checkpoint': if (!e.on && hit(e.x - 0.6, e.y, e.x + 0.6, e.y + 2)) { e.on = true; this.check = { x: e.x, y: e.y }; this.hearts = this.maxHearts; this.emit('checkpoint', { x: e.x, y: e.y, id: e.id }); } break;
        case 'exit': if (!this.won && hit(e.x - 0.6, e.y, e.x + 0.6, e.y + 2.2) && p.ground) { this.won = true; p.vx = 0; this.emit('win', { x: e.x, y: e.y }); } break;
        case 'boulderTrigger':
          if (!e.fired && p.x > e.x) {
            e.fired = true;
            const end = this.ents.find((q) => q.type === 'boulderEnd' && q.x > e.x);
            this.boulder = { active: true, x: e.x - 9, y: e.y, speed: e.speed, end: end ? end.x - 0.5 : e.x + 30, rot: 0, trig: e };
            this.emit('boulder', { x: e.x });
          }
          break;
        case 'torch': if (!e.lit && Math.abs(p.x - e.x) < 1.7 && p.y > e.y - 4.5 && p.y < e.y + 1.5) { e.lit = true; this.emit('ignite', { x: e.x, y: e.y, id: e.id }); } break;
        case 'boss': {
          if (e.phase !== 'fight' || e.hidden) break;
          const D = BOSS_DEF[e.kind], bh = bossHeight(e);
          const x0 = e.x - D.w / 2, x1 = e.x + D.w / 2;
          if (e.beam && py0 < e.fy + 1.0 && (px1 < x0 || px0 > x1) && p.x > e.ax0 && p.x < e.ax1) this._hurt(p.x < e.x ? -1 : 1);
          // a dazed guardian under a ledge can be hit by landing on the ledge right above it
          const reach = e.vul && p.vy <= 0 ? 0.75 : 0;
          if (!hit(x0, e.y, x1, e.y + bh + reach)) break;
          if ((p.vy < -0.5 || (reach && p.landT > 0.15)) && p.y > e.y + bh * 0.55) {
            // jumping on a dazed guardian hurts it; otherwise the explorer just bounces off
            if (e.vul && e.inv <= 0) this._bossHit(e); else this.emit('bossBlock', { x: p.x, y: p.y });
            p.vy = I.jump ? 14.5 : 12; p.jumpsUsed = 0; p.cut = !I.jump; p.y = Math.max(p.y, e.y + bh);
          } else if (!sun) this._hurt(p.x < e.x ? -1 : 1);
          break;
        }
        case 'scarab': case 'mummy': case 'bat': case 'flyer': case 'hopper': case 'jackal': {
          const hw = e.type === 'mummy' || e.type === 'jackal' ? 0.38 : 0.4, hh = e.type === 'mummy' || e.type === 'jackal' ? 1.4 : 0.5;
          const by = e.type === 'bat' || e.type === 'flyer' ? e.y - 0.25 : e.y;
          if (hit(e.x - hw, by, e.x + hw, by + hh)) {
            if (sun) { this._defeat(e, 'sun'); break; }
            if (p.vy < -0.5 && p.y > by + hh * 0.5) {
              e.hp--; p.vy = I.jump ? 14 : 10.5; p.jumpsUsed = 0; p.cut = !I.jump;
              if (e.hp <= 0) this._defeat(e, 'stomp');
              else this.emit('stompHit', { x: e.x, y: by + hh, id: e.id });
            } else this._hurt(p.x < e.x ? -1 : 1);
          }
          break;
        }
        case 'cobra': {
          const reach = e.strike > 0 ? 1.15 : 0;
          const x0 = Math.min(e.x - 0.35, e.x - 0.35 + (e.dir < 0 ? -reach : 0)), x1 = Math.max(e.x + 0.35, e.x + 0.35 + (e.dir > 0 ? reach : 0));
          if (hit(x0, e.y, x1, e.y + 1.0)) { if (sun) this._defeat(e, 'sun'); else this._hurt(p.x < e.x ? -1 : 1); }
          break;
        }
        case 'crusher': { const bottom = e.y - e.k * e.drop; if (e.k > 0.6 && hit(e.x - 0.75, bottom, e.x + 0.75, bottom + 1)) this._hurt(0, true); break; }
        case 'fire': if (e.burning && !sun && hit(e.x - 0.35, e.y, e.x + 0.35, e.y + 2.2)) this._hurt(p.x < e.x ? -1 : 1); break;
        default: break;
      }
    }
    for (const d of this.darts) if (hit(d.x - 0.3, d.y - 0.08, d.x + 0.3, d.y + 0.08)) { d.alive = false; if (!sun) this._hurt(d.vx > 0 ? 1 : -1); }
    for (const s2 of this.shots) {
      if (!s2.alive || s2.wait > 0) continue;
      const r = s2.r || 0.3, rw = s2.kind === 'spear' ? 0.6 : r;
      if (hit(s2.x - rw, s2.y - r, s2.x + rw, s2.y + r)) { s2.alive = false; if (!sun) this._hurt(s2.vx > 0 ? 1 : s2.vx < 0 ? -1 : (p.x < s2.x ? -1 : 1)); this.emit('shotHit', { x: s2.x, y: s2.y, kind: s2.kind }); }
    }
    const B = this.boulder;
    if (B && B.active && Math.hypot(p.x - B.x, p.y + 0.7 - (B.y + 1.1)) < 1.6) this._die('boulder');
  }

  _hurt(dir, crush = false) {
    const p = this.p;
    if (p.inv > 0 || p.dead > 0 || this.won) return;
    if (!crush && this.pw.sun > 0) return;
    if (!crush && this.pw.shield) {
      // the scarab amulet takes the blow
      this.pw.shield = false;
      this.emit('shieldBreak', { x: p.x, y: p.y + 0.7 });
      p.inv = 1.5; p.hurtT = 0.3; p.vx = (dir || -p.face) * 5.5; p.vy = 8; p.lockX = 0.2; p.climb = false;
      return;
    }
    this.hearts--;
    this.emit('hurt', { x: p.x, y: p.y + 0.7 });
    if (this.hearts <= 0 || crush) { this._die('hurt'); return; }
    p.inv = 1.5; p.hurtT = 0.45;
    p.vx = (dir || -p.face) * 6.5; p.vy = 9; p.lockX = 0.25; p.climb = false;
  }

  _die(why) {
    const p = this.p;
    if (p.dead > 0) return;
    p.dead = why === 'pit' ? 0.8 : 1.25;
    p.vx = 0; p.vy = 0;
    this.deaths++;
    this.emit('die', { x: p.x, y: p.y, why });
  }

  _respawn() {
    const c = this.check;
    this.p = this._newPlayer(c.x, c.y + 0.02);
    this.p.inv = 1.2;
    this.hearts = this.maxHearts;
    // the throwing stick is kept; the amulet, feather and sun are lost
    this.pw.shield = false; this.pw.feather = 0; this.pw.sun = 0;
    this.stick = null;
    if (this.boulder) { const tr = this.boulder.trig; this.boulder = null; if (tr && tr.x > c.x) tr.fired = false; }
    // a lost guardian fight starts again from the beginning
    const B = this.boss;
    if (B && (B.phase === 'intro' || B.phase === 'fight')) {
      const kind = B.kind; Object.assign(B, { x: B.x0, y: B.y0 }); bossInit(B); B.kind = kind;
      for (const e of this.ents) if (e.minion && e.alive) e.alive = false;
      this.shots = [];
      const g = this.gates.get(B.gid + 1000);
      if (g && !g.open) { g.open = true; for (let y = g.y; y < g.y + g.h; y++) this.setTile(g.x, y, T.EMPTY); }
      this.emit('bossReset', { id: B.id });
    }
    this.emit('respawn', { x: c.x, y: c.y });
  }
}
