// The ten guardians, one at the end of every world; the last one is the dead pharaoh.
// Each is a small state machine built from shared moves (charge, slam, shoot, spear, rain, summon,
// eggs, dive, emerge, beam, teleport). A guardian can only be hurt while it is dazed after a move:
// jump on it or hit it with the throwing stick. In the second half of its strength it gets faster.
export const BOSS_DEF = {
  scarabking: { hp: 3, w: 2.4, h: 1.5, mode: 'ground', walk: 1.0, moves: ['charge', 'charge', 'summon'], minion: 'scarab', size: 2.1 },
  colossus: { hp: 3, w: 1.9, h: 3.2, mode: 'ground', walk: 0.7, moves: ['slam', 'rain', 'slam'], size: 3.4 },
  sobek: { hp: 3, w: 2.8, h: 1.4, mode: 'hidden', moves: ['emerge'], shot: 'water', nshot: 3, size: 1.7 },
  queen: { hp: 4, w: 2.2, h: 1.5, mode: 'float', hover: 6.4, moves: ['eggs', 'dive', 'eggs', 'dive'], minion: 'scarab', size: 2.3 },
  mummylord: { hp: 4, w: 1.2, h: 3.0, mode: 'ground', walk: 1.3, moves: ['summon', 'shoot', 'slam', 'teleport'], minion: 'mummy', shot: 'curse', nshot: 3, size: 3.0 },
  apep: { hp: 4, w: 1.4, h: 3.0, mode: 'hidden', moves: ['emerge'], shot: 'venom', nshot: 5, size: 3.3 },
  anubis: { hp: 5, w: 1.2, h: 3.0, mode: 'ground', walk: 2.0, moves: ['charge', 'spear', 'slam', 'spear'], size: 3.0 },
  sphinx: { hp: 5, w: 3.4, h: 2.4, mode: 'ground', walk: 0.6, moves: ['beam', 'shoot', 'rain', 'beam'], shot: 'fire', nshot: 3, size: 2.7 },
  ammit: { hp: 5, w: 2.6, h: 2.0, mode: 'ground', walk: 1.6, moves: ['slam', 'charge', 'summon', 'slam'], minion: 'hopper', size: 2.3 },
  pharaoh: { hp: 6, w: 1.6, h: 3.2, mode: 'float', hover: 5.0, moves: ['shoot', 'dive', 'summon', 'beam', 'teleport', 'rain'], shot: 'curse', nshot: 5, minion: 'scarab', size: 3.5 },
};

const set = (B, state) => { B.state = state; B.st = 0; };

export function bossInit(B) {
  const D = BOSS_DEF[B.kind];
  Object.assign(B, { hp: D.hp, maxHp: D.hp, phase: 'sleep', state: 'idle', st: 0, mi: 0, vx: 0, vy: 0, inv: 0, vul: false, hidden: D.mode === 'hidden', beam: false, beamWarn: false, fade: 0, shake: 0, x0: B.x, y0: B.y });
  if (D.mode === 'float') B.y = B.fy + D.hover;
}

// current height of the hit box: a dazed guardian sinks down so a jump can reach its head
// (charging, it ducks its head, so it can be jumped over)
export function bossHeight(B) { const D = BOSS_DEF[B.kind]; return B.vul ? D.h * 0.6 : B.state === 'charge' ? Math.min(D.h, 2.0) * 0.8 : D.h; }

export function bossStep(S, B, dt) {
  const D = BOSS_DEF[B.kind], p = S.p;
  B.st += dt;
  if (B.inv > 0) B.inv -= dt;
  if (B.shake > 0) B.shake -= dt;
  if (B.phase === 'sleep') {
    if (p.x > B.ax0 + 1.5 && p.dead <= 0 && !S.won) {
      B.phase = 'intro'; B.st = 0;
      S._closeGate(B.gid + 1000);
      S.emit('bossStart', { x: B.x, y: B.y, kind: B.kind, id: B.id });
    }
    return;
  }
  if (B.phase === 'intro') { B.shake = 0.1; if (B.st > 1.8) { B.phase = 'fight'; set(B, D.mode === 'hidden' ? 'hide' : 'idle'); } return; }
  if (B.phase === 'dying') { B.shake = 0.1; if (B.st > 2.2) { B.phase = 'dead'; S._openGate(B.gid, 0.3); S.emit('bossDead', { x: B.x, y: B.y, kind: B.kind }); } return; }
  if (B.phase === 'dead') return;

  const rage = B.hp <= Math.ceil(B.maxHp / 2) ? 1.3 : 1;
  const lo = B.ax0 + D.w / 2 + 0.2, hi = B.ax1 - D.w / 2 - 0.2;
  const clampX = (x) => Math.max(lo, Math.min(hi, x));
  // a dazed guardian must not end up right under a low ledge, where no jump could reach its head
  const free = (x) => {
    x = clampX(x);
    for (const [a, b] of B.ledges || []) if (x + D.w / 2 > a && x - D.w / 2 < b) x = clampX(x < (a + b) / 2 ? a - D.w / 2 - 0.15 : b + D.w / 2 + 0.15);
    return x;
  };
  const face = () => { B.dir = p.x > B.x ? 1 : -1; };
  const hover = B.fy + (D.hover || 0);
  const next = () => {
    const mv = D.moves[B.mi++ % D.moves.length];
    B.move = mv;
    set(B, mv === 'emerge' ? 'hide' : mv === 'dive' ? 'aim' : 'tele');
  };

  B.vul = false; B.beam = false; B.beamWarn = false;
  switch (B.state) {
    case 'idle': {
      face();
      if (D.mode === 'ground' && D.walk) { const want = Math.abs(p.x - B.x) > 3 ? B.dir : 0; B.x = clampX(B.x + want * D.walk * rage * dt); }
      if (D.mode === 'float') { B.x = clampX(B.x + Math.sign(p.x - B.x) * Math.min(Math.abs(p.x - B.x), 1.6 * dt * rage)); B.y += (hover + Math.sin(B.st * 2) * 0.4 - B.y) * Math.min(1, dt * 3); }
      if (B.st > 1.3 / rage) next();
      break;
    }
    case 'recover': if (D.mode === 'float') B.y += (hover - B.y) * Math.min(1, dt * 2); if (B.st > 0.6) set(B, 'idle'); break;
    case 'tele': {
      // wind-up: the guardian shakes or glows before every move
      B.shake = 0.1;
      const mv = B.move;
      if (mv === 'beam') B.beamWarn = true;
      const T = { charge: 0.75, slam: 0.5, shoot: 0.6, spear: 0.55, rain: 0.5, summon: 0.8, eggs: 0.4, beam: 1.0, teleport: 0.3 }[mv] / rage;
      if (B.st < T) break;
      if (mv === 'charge') { face(); set(B, 'charge'); S.emit('bossRoar', { x: B.x, y: B.y }); }
      else if (mv === 'slam') { face(); const tx = free(p.x); B.vx = (tx - B.x) / 0.9; B.vy = 13.5; set(B, 'air'); S.emit('bossJump', { x: B.x, y: B.y }); }
      else if (mv === 'shoot') { shoot(S, B, D); set(B, 'recover'); }
      else if (mv === 'spear') { spear(S, B); set(B, 'recover'); }
      else if (mv === 'rain') { rain(S, B); set(B, 'recover'); }
      else if (mv === 'summon') { summon(S, B, D); set(B, 'recover'); }
      else if (mv === 'eggs') { for (let k = -1; k <= 1; k++) S._shot({ kind: 'egg', x: B.x + k * 0.5, y: B.y - 0.3, vx: k * 2.4 + (p.x - B.x) * 0.3, vy: 2, g: 18, r: 0.3, life: 4 }); S.emit('bossShoot', { x: B.x, y: B.y, kind: 'egg' }); set(B, 'recover'); }
      else if (mv === 'beam') { set(B, 'beam'); S.emit('bossBeam', { x: B.x, y: B.fy }); }
      else if (mv === 'teleport') { set(B, 'fadeout'); S.emit('bossVanish', { x: B.x, y: B.y }); }
      break;
    }
    case 'charge': {
      B.x += B.dir * 9 * rage * dt;
      if (B.x <= lo || B.x >= hi) { B.x = clampX(B.x); S.emit('bossBump', { x: B.x + B.dir * D.w / 2, y: B.y }); set(B, 'daze'); }
      break;
    }
    case 'air': {
      B.vy -= 30 * dt; B.x = clampX(B.x + B.vx * dt); B.y += B.vy * dt;
      if (B.vy < 0 && B.y <= B.fy) { B.y = B.fy; landing(S, B); set(B, 'daze'); }
      break;
    }
    case 'aim': {
      // float up and follow the explorer, then shake and drop
      B.y += (hover + 0.6 - B.y) * Math.min(1, dt * 4);
      B.x = clampX(B.x + Math.sign(p.x - B.x) * Math.min(Math.abs(p.x - B.x), 6 * dt));
      if (B.st > 1.0 / rage) { B.shake = 0.35; B.x += (free(B.x) - B.x) * Math.min(1, dt * 8); if (B.st > 1.35 / rage) { B.x = free(B.x); set(B, 'drop'); B.vy = -4; } }
      break;
    }
    case 'drop': B.vy -= 40 * dt; B.y += B.vy * dt; if (B.y <= B.fy) { B.y = B.fy; landing(S, B); set(B, 'daze'); } break;
    case 'daze': {
      B.vul = true;
      if (B.st > 1.7 / Math.sqrt(rage)) { set(B, D.mode === 'float' ? 'lift' : 'idle'); }
      break;
    }
    case 'lift': B.y += (hover - B.y) * Math.min(1, dt * 2.5); if (B.st > 0.8) set(B, 'idle'); break;
    case 'beam': B.beam = true; if (B.st > 0.9) set(B, 'daze'); break;
    case 'fadeout': B.fade = Math.min(1, B.st / 0.35); if (B.st > 0.35) { B.x = free(B.x > (B.ax0 + B.ax1) / 2 ? B.ax0 + 2 : B.ax1 - 2); set(B, 'fadein'); S.emit('bossAppear', { x: B.x, y: B.y }); } break;
    case 'fadein': B.fade = 1 - Math.min(1, B.st / 0.35); if (B.st > 0.35) { B.fade = 0; set(B, 'idle'); } break;
    // the guardians that live in water or sand: hide, rise somewhere else, spit, stay up a moment
    case 'hide': {
      B.hidden = true;
      if (B.st > 1.1 / rage) {
        const spots = B.kind === 'sobek' ? [B.ax0 + 12.5] : B.holes;
        const far = spots.filter((x) => Math.abs(x - p.x) > 2.5);
        const pool = far.length ? far : spots;
        B.x = clampX(pool[(B.mi++) % pool.length] + (B.kind === 'sobek' ? (Math.random() - 0.5) * 4 : 0));
        face(); set(B, 'rise'); S.emit('bossRise', { x: B.x, y: B.fy, kind: B.kind });
      }
      break;
    }
    case 'rise': B.hidden = false; B.rise = 1 - Math.min(1, B.st / 0.7); if (B.st > 0.7) { B.rise = 0; face(); shoot(S, B, D); set(B, 'up'); } break;
    case 'up': B.vul = B.st > 0.3; if (B.st > 2.1 / rage) set(B, 'sink'); break;
    case 'sink': B.rise = Math.min(1, B.st / 0.5); if (B.st > 0.5) { B.hidden = true; set(B, 'hide'); } break;
    default: set(B, 'idle');
  }
}

function landing(S, B) {
  S.emit('bossSlam', { x: B.x, y: B.fy });
  for (const d of [-1, 1]) S._shot({ kind: 'wave', x: B.x + d * 1.2, y: B.fy + 0.3, vx: d * 6.5, vy: 0, g: 0, r: 0.4, life: 2.6 });
}

function shoot(S, B, D) {
  const p = S.p, n = D.nshot || 3;
  const sx = B.x + B.dir * D.w * 0.35, sy = B.y + (B.kind === 'apep' ? D.h * 0.85 : D.h * 0.6);
  const lob = D.shot === 'venom' || D.shot === 'water';
  for (let k = 0; k < n; k++) {
    const o = k - (n - 1) / 2;
    if (lob) {
      // arcs that land around the explorer
      const T = 1.0, tx = p.x + o * 1.4, ty = p.y + 0.3, g = 9;
      S._shot({ kind: D.shot, x: sx, y: sy, vx: (tx - sx) / T, vy: (ty - sy + 0.5 * g * T * T) / T, g, r: 0.32, life: 4 });
    } else {
      const a = Math.atan2(p.y + 0.7 - sy, p.x - sx) + o * 0.24;
      S._shot({ kind: D.shot, x: sx, y: sy, vx: Math.cos(a) * 6.5, vy: Math.sin(a) * 6.5, g: 0, r: 0.32, life: 5 });
    }
  }
  S.emit('bossShoot', { x: sx, y: sy, kind: D.shot });
}

// Anubis throws his spear low (jump over it) or high (stay on the ground)
function spear(S, B) {
  const low = (B.spears = (B.spears || 0) + 1) % 2 === 1;
  S._shot({ kind: 'spear', x: B.x + B.dir * 0.8, y: B.fy + (low ? 0.45 : 1.75), vx: B.dir * 11, vy: 0, g: 0, r: 0.25, life: 3 });
  S.emit('bossShoot', { x: B.x, y: B.y + 1.5, kind: 'spear' });
}

function rain(S, B) {
  const p = S.p, n = 5;
  for (let k = 0; k < n; k++) {
    const x = Math.max(B.ax0 + 0.7, Math.min(B.ax1 - 0.7, p.x + (k - 2) * 2.3 + (Math.random() - 0.5)));
    S._shot({ kind: 'rock', x, y: B.top - 0.7, vx: 0, vy: 0, g: 26, r: 0.45, life: 4, wait: 0.85 + k * 0.12, floor: B.fy });
  }
  S.emit('bossRain', { x: B.x, y: B.top });
}

function summon(S, B, D) {
  const alive = S.ents.filter((e) => e.minion && e.alive).length;
  if (alive >= 3) return;
  for (const d of [-1, 1]) {
    const x = Math.max(B.ax0 + 1, Math.min(B.ax1 - 1, B.x + d * (D.w / 2 + 1.2)));
    S._spawnFoe(D.minion || 'scarab', x, B.fy, { minion: true, dir: d });
  }
  S.emit('bossSummon', { x: B.x, y: B.y });
}
