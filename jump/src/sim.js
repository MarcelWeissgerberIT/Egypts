// Platformer simulation: the explorer's movement and collisions, enemies, traps and pickups.
// Pure logic (no rendering) so it can be stepped headless; the renderer reads its state and events.
import { T, tileAt } from './levels.js';

export const P = {
  W: 0.62, H: 1.36,
  RUN: 7.2, ACC_G: 60, ACC_A: 38, FRIC: 70,
  GRAV: 40, JUMP: 15.6, CUT: 6.0, MAX_FALL: 20,
  DJUMP: 13.8, WALL_SLIDE: 3.2, WALL_JUMP_X: 8.2,
  COYOTE: 0.11, BUFFER: 0.14,
  LADDER: 4.6,
  SWIM_GRAV: 11, SWIM_MAX: 3.6, SWIM_STROKE: 6.8,
};
const EPS = 1e-4;
const solidT = (t) => t === T.SOLID || t === T.CRACKED || t === T.CRUMBLE;

export class Sim {
  constructor(level) {
    this.L = level;
    this.tiles = level.tiles.slice();          // cracked walls can break
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
    this.ents = level.ents.map((e, i) => ({ ...e, id: i, alive: true, t: 0, vx: 0, vy: 0, hp: e.type === 'mummy' ? 2 : 1, x0: e.x, y0: e.y, dir: e.dir || 1 }));
    this.darts = [];
    this.p = this._newPlayer(level.spawn.x, level.spawn.y);
    this.boulder = null;
  }

  _newPlayer(x, y) {
    return { x, y, vx: 0, vy: 0, face: 1, ground: false, coyote: 0, buffer: 0, jumpsUsed: 0, climb: false, swim: false, sand: false, wall: 0,
      inv: 0, hurtT: 0, dead: 0, ride: null, lockX: 0, landT: 0, cut: false, state: 'idle', drop: 0 };
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
    this._player(dt, input);
    this._interact(dt, input);
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
    if (!p.climb && onLadder && Math.abs(I.y) > 0.55 && !(I.y < 0 && p.ground && this.tile(p.x, p.y - 0.2) !== T.LADDER)) { p.climb = true; p.vx = 0; p.vy = 0; p.x += (Math.floor(p.x) + 0.5 - p.x) * 0.5; }
    if (p.climb && !onLadder && !(this.tile(p.x, p.y - 0.1) === T.LADDER)) p.climb = false;

    let ax = I.x;
    if (Math.abs(ax) < 0.18) ax = 0;
    if (ax) p.face = ax > 0 ? 1 : -1;
    let grav = P.GRAV, maxFall = P.MAX_FALL, speed = P.RUN;
    if (p.swim) { grav = P.SWIM_GRAV; maxFall = P.SWIM_MAX; speed *= 0.62; }
    if (p.sand) { speed *= 0.38; }
    const sf = this.ents.find((e) => e.type === 'sandfall' && Math.abs(p.x - e.x) < (e.w || 1.4) / 2 + P.W / 2 && p.y < e.y + 9);
    if (sf) { speed *= 0.7; }

    if (p.climb) {
      p.vx = ax * 2.6;
      p.vy = (Math.abs(I.y) > 0.25 ? I.y : 0) * P.LADDER;
      p.ground = false;
      if (p.buffer > 0) { p.climb = false; p.buffer = 0; p.vy = P.JUMP * 0.85; p.vx = ax * speed; this.emit('jump', { x: p.x, y: p.y }); }
    } else {
      // horizontal
      if (p.lockX <= 0) {
        const target = ax * speed;
        const acc = ax ? (p.ground ? P.ACC_G : P.ACC_A) : (p.ground ? P.FRIC : P.ACC_A * 0.6);
        if (p.vx < target) p.vx = Math.min(target, p.vx + acc * dt); else if (p.vx > target) p.vx = Math.max(target, p.vx - acc * dt);
      }
      // gravity
      p.vy -= grav * dt;
      if (sf) p.vy = Math.min(p.vy, -3.5);
      if (p.sand) p.vy = Math.max(p.vy, p.vy < 0 ? -0.7 : p.vy);
      // wall slide
      p.wall = 0;
      if (A.wall && !p.ground && !p.swim) {
        const side = ax > 0 ? 1 : ax < 0 ? -1 : 0;
        if (side && this._touchWall(side)) { p.wall = side; if (p.vy < -P.WALL_SLIDE) p.vy = -P.WALL_SLIDE; }
      }
      p.vy = Math.max(p.vy, -maxFall);
      // jumping
      if (p.ground || p.climb) p.coyote = P.COYOTE; else p.coyote = Math.max(0, p.coyote - dt);
      if (p.buffer > 0) {
        if (p.swim) {
          p.vy = this.tile(p.x, p.y + P.H + 0.1) === T.WATER ? P.SWIM_STROKE : P.JUMP * 0.9;
          p.buffer = 0; this.emit('swim', { x: p.x, y: p.y });
        } else if (I.y < -0.55 && p.ground && this._onOneway()) {
          p.drop = 0.25; p.y -= 0.05; p.ground = false; p.buffer = 0;
        } else if (p.coyote > 0) {
          p.vy = p.sand ? P.JUMP * 0.62 : P.JUMP; p.coyote = 0; p.buffer = 0; p.ground = false; p.cut = false; p.jumpsUsed = 0;
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
    this._move(dt);
    // falling out of the world
    if (p.y < -2) this._die('pit');
    // animation state
    const was = p.state;
    if (p.hurtT > 0) p.state = 'hurt';
    else if (p.climb) p.state = 'climb';
    else if (p.swim) p.state = 'swim';
    else if (!p.ground) p.state = p.vy > 0 ? 'jump' : 'fall';
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
        for (let y = y0; y <= y1; y++) if (this.solidAt(xr, y)) { p.x = xr - P.W / 2 - EPS; p.vx = 0; break; }
      } else if (p.vx < 0) {
        const xl = Math.floor(p.x - P.W / 2);
        for (let y = y0; y <= y1; y++) if (this.solidAt(xl, y)) { p.x = xl + 1 + P.W / 2 + EPS; p.vx = 0; break; }
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
        for (let x = x0; x <= x1; x++) if (this.solidAt(x, yt)) { p.y = yt - P.H - EPS; p.vy = 0; this.emit('bump', { x: p.x, y: yt }); break; }
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
        case 'scarab': case 'mummy': {
          const sp = e.type === 'scarab' ? 1.3 : 0.95;
          if (e.type === 'mummy' && Math.abs(p.x - e.x) < 8 && Math.abs(p.y - e.y) < 3) e.dir = p.x > e.x ? 1 : -1;
          const ahead = e.x + e.dir * 0.5;
          const wall = this.solidAt(Math.floor(ahead), Math.floor(e.y + 0.3));
          const edge = !this.solidAt(Math.floor(ahead), Math.floor(e.y - 0.5)) && this.tile(ahead, e.y - 0.5) !== T.ONEWAY;
          if (wall || edge) e.dir = -e.dir; else e.x += e.dir * sp * dt;
          break;
        }
        case 'bat': e.x = e.x0 + Math.sin(e.t * 1.1) * e.r * 1.6; e.y = e.y0 + Math.sin(e.t * 2.3) * 0.45; e.dir = Math.cos(e.t * 1.1) > 0 ? 1 : -1; break;
        case 'cobra': {
          e.dir = p.x > e.x ? 1 : -1;
          const near = Math.abs(p.x - e.x) < 2.6 && Math.abs(p.y - e.y) < 1.5;
          if (near && !(e.strike > 0) && !(e.cool > 0)) { e.strike = 0.45; this.emit('hiss', { x: e.x, y: e.y }); }
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
    // spikes
    for (let x = Math.floor(px0 + 0.1); x <= Math.floor(px1 - 0.1); x++) {
      for (let y = Math.floor(py0); y <= Math.floor(py1); y++) {
        const t = this.tile(x + 0.5, y + 0.5);
        if (t === T.SPIKE && py0 < y + 0.55 && hit(x + 0.15, y, x + 0.85, y + 0.55)) { if (y <= 1) this._die('spikes'); else this._hurt(p.x < x + 0.5 ? -1 : 1); return; }
        if (t === T.SPIKE_DOWN && hit(x + 0.15, y + 0.45, x + 0.85, y + 1)) { this._hurt(0); return; }
      }
    }
    // cracked floor/wall: the action button breaks it
    if (I.actionPressed) {
      let broke = false;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const x = Math.floor(p.x) + dx, y = Math.floor(p.y + 0.5) + dy;
        if (this.tile(x + 0.5, y + 0.5) === T.CRACKED && Math.abs(x + 0.5 - p.x) < 1.6 && Math.abs(y + 0.5 - (p.y + 0.5)) < 1.6) {
          this.tiles[y * this.L.w + x] = T.EMPTY; broke = true; this.emit('break', { x, y });
        }
      }
      if (!broke) this.emit('action', { x: p.x, y: p.y });
    }
    for (const e of this.ents) {
      if (!e.alive) continue;
      switch (e.type) {
        case 'coin': if (hit(e.x - 0.35, e.y - 0.35, e.x + 0.35, e.y + 0.35)) { e.alive = false; this.coins++; this.emit('coin', { x: e.x, y: e.y, id: e.id }); } break;
        case 'papyrus': if (hit(e.x - 0.45, e.y - 0.5, e.x + 0.45, e.y + 0.5)) { e.alive = false; this.found[e.id] = true; this.emit('papyrus', { x: e.x, y: e.y, id: e.id }); } break;
        case 'ankh': if (hit(e.x - 0.4, e.y - 0.5, e.x + 0.4, e.y + 0.5)) { e.alive = false; this.hearts = Math.min(this.maxHearts, this.hearts + 1); this.emit('heal', { x: e.x, y: e.y }); } break;
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
        case 'scarab': case 'mummy': case 'bat': {
          const hw = e.type === 'mummy' ? 0.38 : 0.4, hh = e.type === 'mummy' ? 1.4 : e.type === 'bat' ? 0.5 : 0.5;
          const by = e.type === 'bat' ? e.y - 0.25 : e.y;
          if (hit(e.x - hw, by, e.x + hw, by + hh)) {
            if (p.vy < -0.5 && p.y > by + hh * 0.5) {
              e.hp--; p.vy = I.jump ? 14 : 10.5; p.jumpsUsed = 0; p.cut = !I.jump;
              if (e.hp <= 0) { e.alive = false; this.emit('stomp', { x: e.x, y: by + hh, kind: e.type, id: e.id }); for (let k = 0; k < 2; k++) this.coins++; }
              else this.emit('stompHit', { x: e.x, y: by + hh, id: e.id });
            } else this._hurt(p.x < e.x ? -1 : 1);
          }
          break;
        }
        case 'cobra': {
          const reach = e.strike > 0 ? 1.15 : 0;
          const x0 = Math.min(e.x - 0.35, e.x - 0.35 + (e.dir < 0 ? -reach : 0)), x1 = Math.max(e.x + 0.35, e.x + 0.35 + (e.dir > 0 ? reach : 0));
          if (hit(x0, e.y, x1, e.y + 1.0)) this._hurt(p.x < e.x ? -1 : 1);
          break;
        }
        case 'crusher': { const bottom = e.y - e.k * e.drop; if (e.k > 0.6 && hit(e.x - 0.75, bottom, e.x + 0.75, bottom + 1)) this._hurt(0, true); break; }
        case 'fire': if (e.burning && hit(e.x - 0.35, e.y, e.x + 0.35, e.y + 2.2)) this._hurt(p.x < e.x ? -1 : 1); break;
        default: break;
      }
    }
    for (const d of this.darts) if (hit(d.x - 0.3, d.y - 0.08, d.x + 0.3, d.y + 0.08)) { d.alive = false; this._hurt(d.vx > 0 ? 1 : -1); }
    const B = this.boulder;
    if (B && B.active && Math.hypot(p.x - B.x, p.y + 0.7 - (B.y + 1.1)) < 1.6) this._die('boulder');
  }

  _hurt(dir, crush = false) {
    const p = this.p;
    if (p.inv > 0 || p.dead > 0 || this.won) return;
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
    if (this.boulder) { const tr = this.boulder.trig; this.boulder = null; if (tr && tr.x > c.x) tr.fired = false; }
    this.emit('respawn', { x: c.x, y: c.y });
  }
}
