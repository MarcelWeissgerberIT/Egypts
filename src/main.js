import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { World, H } from './world.js';
import { UI, drawPiece, pieceCentroid, pieceScreenSize } from './ui.js';
import { Audio } from './audio.js';
import { LEVELS, tierSizes } from './levels.js';
import { Tier, STONE, GOLD } from './logic.js';
import { randomPiece, rotatePiece, rotate, makePiece } from './pieces.js';

const SAVE_KEY = 'purple-sun-pyramid-v1';
const SHUFFLE_COST = 7;

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && Array.isArray(s.eyes)) return s;
  } catch (e) { /* storage unavailable */ }
  return { unlocked: 0, eyes: [], best: [], muted: false, tut: false };
}
function writeSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

// ------------------------------------------------------------------ assets
async function loadAssets(onProgress) {
  const texNames = ['sand', 'limestone', 'gold', 'strata', 'water', 'bedrock'];
  const texFiles = { ...Object.fromEntries(texNames.map((n) => [n, `assets/tex/${n}.jpg`])), cloud: 'assets/tex/cloud.webp', dust: 'assets/tex/dust.webp', glyph: 'assets/tex/glyph.webp', sparkle: 'assets/ui/sparkle.webp', ankhIcon: 'assets/ui/icon_ankh.webp' };
  const models = ['worker', 'pharaoh', 'priestess', 'sphinx', 'obelisk', 'palm', 'camel', 'sledge', 'temple', 'anubis', 'boat', 'brazier',
    'anim_worker_walk', 'anim_worker_cheer', 'anim_worker_idle', 'anim_pharaoh_cheer', 'anim_pharaoh_stomp', 'anim_priestess_cast', 'anim_priestess_dance'];
  const uiImgs = ['btn_play', 'btn_pause', 'btn_restart', 'btn_next', 'btn_home', 'btn_sound_on', 'btn_sound_off', 'btn_shuffle', 'icon_scarab', 'icon_sun',
    'icon_ankh', 'icon_eye', 'icon_eye_empty', 'icon_lock', 'icon_pyramid', 'icon_rotate', 'hand', 'panel', 'banner_win', 'banner_lose', 'medallion', 'plaque',
    'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd_plus', 'd_x'];
  const total = Object.keys(texFiles).length + models.length + uiImgs.length;
  let done = 0;
  const tick = () => { done++; onProgress(done / total); };
  const tl = new THREE.TextureLoader();
  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
  const assets = { tex: {}, models: {}, img: {} };
  const jobs = [];
  for (const [k, f] of Object.entries(texFiles)) jobs.push(tl.loadAsync(f).then((t) => { t.colorSpace = THREE.SRGBColorSpace; assets.tex[k] = t; tick(); }));
  // Hosts that cannot serve .glb get base64 text copies (window.__B64_MODELS is set by that page).
  const loadModel = async (m) => {
    if (!window.__B64_MODELS) return gl.loadAsync(`assets/models/${m}.glb`);
    const txt = await (await fetch(`assets/models/${m}.glb.txt`)).text();
    const raw = atob(txt.trim());
    const bin = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
    return gl.parseAsync(bin.buffer, 'assets/models/');
  };
  for (const m of models) jobs.push(loadModel(m).then((g) => { assets.models[m] = g; tick(); }));
  for (const u of uiImgs) jobs.push(new Promise((res) => { const i = new Image(); i.onload = i.onerror = () => { tick(); res(); }; i.src = `assets/ui/${u}.webp`; assets.img[u] = i; }));
  await Promise.all(jobs);
  assets.img.lime = assets.tex.limestone.image;
  assets.img.gold = assets.tex.gold.image;
  return assets;
}

// ------------------------------------------------------------------ game
class Game {
  constructor() {
    this.app = document.getElementById('app');
    this.save = loadSave();
    this.audio = new Audio();
    this.audio.muted = !!this.save.muted;
    this.state = 'loading';
    this.tray = [null, null, null];
  }

  async boot() {
    this.ui = new UI(this.app, null);
    this.ui.setSound(!this.save.muted);
    this.assets = await loadAssets((p) => this.ui.setLoad(p));
    this.ui.assets = this.assets;
    this.world = new World(document.getElementById('gl'), this.assets);
    this._wire();
    this._layout();
    window.addEventListener('resize', () => this._layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this._layout(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.state === 'play') this.pause(); if (this.audio.ctx) this.audio.ctx.suspend(); }
      else if (this.audio.ctx && this.state !== 'loading') this.audio.ctx.resume().catch(() => {});
    });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    // iOS only starts WebAudio from touchend/click - unlock on the first one
    const unlock = () => { this.audio.unlock(); if (this.state !== 'title' && this.state !== 'loading') this.audio.playMusic(); };
    document.addEventListener('touchend', unlock, { passive: true });
    document.addEventListener('click', unlock);
    this.last = performance.now();
    requestAnimationFrame((t) => this._frame(t));
    setTimeout(() => { this.state = 'title'; this.ui.show('scrTitle'); }, 300);
  }

  _wire() {
    const ui = this.ui;
    const click = () => this.audio.button();
    ui.on('start', () => { this.audio.unlock(); this.audio.playMusic(); click(); this.openLevels(); });
    ui.on('sound', () => {
      this.audio.unlock();
      this.save.muted = !this.save.muted; writeSave(this.save);
      this.audio.setMuted(this.save.muted); ui.setSound(!this.save.muted); click();
      if (!this.save.muted) this.audio.playMusic();
    });
    ui.on('home', () => { click(); this.state = 'title'; ui.show('scrTitle'); });
    ui.on('levels', () => { click(); this.openLevels(); });
    ui.on('play', (i) => { this.audio.unlock(); this.audio.playMusic(); click(); this.startLevel(i); });
    ui.on('pause', () => { if (this.state === 'play') { click(); this.pause(); } });
    ui.on('resume', () => { click(); this.resume(); });
    ui.on('restart', () => { click(); this.startLevel(this.levelIndex); });
    ui.on('next', () => { click(); if (this.levelIndex + 1 < LEVELS.length) this.startLevel(this.levelIndex + 1); else this.openLevels(); });
    ui.on('shuffle', () => this.shuffle());

    const c = ui.trayCanvas;
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    c.addEventListener('pointerup', (e) => this._up(e));
    c.addEventListener('pointercancel', (e) => this._cancel(e));
  }

  openLevels() {
    this.session = (this.session || 0) + 1;
    this.state = 'menu';
    this.world.setOrbit(false);
    this.ui.setInGame(false);
    this.ui.buildLevels(LEVELS, this.save);
    this.ui.show('scrLevels');
    this.ui.hideHand();
  }

  // ------------------------------------------------------------ layout
  _layout() {
    const w = window.innerWidth, h = window.innerHeight;
    this.vw = w; this.vh = h;
    const probe = getComputedStyle(document.documentElement);
    const sab = parseFloat(probe.getPropertyValue('--sab')) || 0;
    const trayH = Math.round(Math.min(220, Math.max(150, h * 0.215)) + sab * 0.6);
    this.trayH = trayH;
    this.ui.tray.style.height = trayH + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const tc = this.ui.trayCanvas;
    tc.width = Math.round(w * dpr); tc.height = Math.round(trayH * dpr);
    const dc = this.ui.dragCanvas;
    dc.width = Math.round(w * dpr); dc.height = Math.round(h * dpr);
    const hudRect = this.ui.hud.getBoundingClientRect();
    const hudBottom = this.ui.hud.offsetTop + this.ui.hud.offsetHeight;
    this.freeTop = (hudRect.height ? hudBottom : 130) + 6;
    this.freeBottom = h - trayH - 6;
    this.world.setLayout(w, h, this.freeTop, this.freeBottom);
    this._drawTray();
  }

  // ------------------------------------------------------------ level flow
  later(ms, fn) { const s = this.session; setTimeout(() => { if (s === this.session) fn(); }, ms); }

  startLevel(i) {
    this.session = (this.session || 0) + 1;
    this.levelIndex = i;
    const L = LEVELS[i];
    this.L = L;
    this.sizes = tierSizes(L.base);
    this.tiers = this.sizes.map((n, t) => {
      const tier = new Tier(n, t);
      tier.setup(L.granite[t] || 0, L.ankhs[t] || 0, Math.random);
      return tier;
    });
    this.score = 0; this.shownScore = 0;
    this.lives = 3;
    this.combo = 0;
    this.timeStats = { left: 0, max: 0 };
    this.tierIndex = 0;
    this.drag = null; this.press = null;
    this.world.setupLevel(this.sizes);
    this.world.priestessIdle();
    this.world.setDaylight(0);
    this.ui.show(null);
    this.ui.setInGame(true);
    this.ui.setLevel(i);
    this.ui.setLives(3);
    this.ui.setScore(0);
    this.ui.setShuffleCost(SHUFFLE_COST);
    this.ui.setTiers(this.sizes.length, 0);
    this.ui.hideHand();
    this.tutorial = (i === 0 && !this.save.tut) ? { phase: 'drag', t: 0 } : null;
    requestAnimationFrame(() => this._layout());
    this.startTier(0);
  }

  startTier(t) {
    this.tierIndex = t;
    this.tier = this.tiers[t];
    this.world.showTier(t, this.tier);
    this.world.focusTier(t);
    this.timeMax = Math.round(this.tier.emptyCount() * this.L.secPerCell + 3);
    this.timeLeft = this.timeMax;
    this.lastTick = 99;
    this.ui.setTiers(this.sizes.length, t);
    this.refillAll();
    this._checkDeadEnd();
    this.state = 'intro';
    this.introT = 0.7;
    this._drawTray();
  }

  // ------------------------------------------------------------ stones
  fitsAny(piece) {
    let c = piece.cells;
    for (let r = 0; r < 4; r++) { if (this.tier.anyFit(c)) return true; c = rotate(c); }
    return false;
  }
  trayHasFit() { return this.tray.some((p) => p && this.fitsAny(p)); }
  genPiece(ensureFit) {
    const e = this.tier.emptyCount();
    for (let a = 0; a < (ensureFit ? 60 : 1); a++) {
      const p = randomPiece(this.L.set, this.tier.size, e, this.L.gold);
      if (!ensureFit || this.fitsAny(p)) return p;
    }
    return makePiece('o1');
  }
  // a fresh set of three stones - only once all three have been placed
  refillAll() {
    const now = performance.now();
    this.tray = [0, 1, 2].map(() => this.genPiece(false));
    if (!this.trayHasFit() && Math.random() < this.L.fair) this.tray[Math.floor(Math.random() * 3)] = this.genPiece(true);
    this.tray.forEach((p, k) => { p.born = now + k * 90; });
  }
  _checkDeadEnd() {
    const dead = !this.trayHasFit();
    this.ui.shuffleHint(dead);
    return dead;
  }

  shuffle() {
    if (this.state !== 'play' || this.drag) return;
    this.audio.unlock();
    this.audio.shuffle();
    this.timeLeft -= SHUFFLE_COST;
    const r = this.ui.btnShuffle.getBoundingClientRect();
    this.ui.popup(r.left - 30, r.top + this.trayH * 0 + 10, SHUFFLE_COST, { icon: 'icon_sun', size: 22, prefix: null });
    const keep = Math.floor(Math.random() * 3);
    const now = performance.now();
    for (let k = 0; k < 3; k++) { this.tray[k] = k === keep ? this.genPiece(true) : this.genPiece(false); this.tray[k].born = now + k * 90; }
    this._checkDeadEnd();
    this._drawTray();
  }

  // ------------------------------------------------------------ input
  _slotAt(x) {
    const sw = (this.vw - 24) / 3;
    const k = Math.floor((x - 12) / sw);
    return k >= 0 && k < 3 ? k : -1;
  }

  _down(e) {
    if (this.state !== 'play' && this.state !== 'intro') return;
    if (this.drag) return;
    const rect = this.ui.trayCanvas.getBoundingClientRect();
    const k = this._slotAt(e.clientX - rect.left);
    if (k < 0 || !this.tray[k]) return;
    this.audio.unlock();
    e.preventDefault();
    try { this.ui.trayCanvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    this.press = { k, x0: e.clientX, y0: e.clientY, t0: performance.now(), id: e.pointerId };
  }

  _move(e) {
    if (!this.press || e.pointerId !== this.press.id) return;
    e.preventDefault();
    const dx = e.clientX - this.press.x0, dy = e.clientY - this.press.y0;
    if (!this.drag && Math.hypot(dx, dy) > 9) {
      this.drag = { k: this.press.k, piece: this.tray[this.press.k], x: e.clientX, y: e.clientY, s: 0 };
      this.audio.pick();
      this._drawTray();
      if (this.tutorial && this.tutorial.phase === 'drag') this.ui.hideHand();
    }
    if (this.drag) { this.drag.x = e.clientX; this.drag.y = e.clientY; this._updateDrag(); }
  }

  _up(e) {
    if (!this.press || e.pointerId !== this.press.id) return;
    const press = this.press; this.press = null;
    if (this.drag) { this._drop(); return; }
    // tap -> rotate
    if (performance.now() - press.t0 < 450) {
      const p = this.tray[press.k];
      if (p) {
        rotatePiece(p);
        p.spin = performance.now();
        this.audio.rotate();
        if (this.tutorial && this.tutorial.phase === 'rotate') this._endTutorial();
        this._drawTray();
      }
    }
  }

  _cancel() { this.press = null; if (this.drag) { this.drag = null; this.world.setGhost(); this._clearDrag(); this._drawTray(); } }

  _dragGeometry() {
    const ax = this.world.screenAxes();
    const d = this.drag;
    d.s = Math.min(1, d.s + 0.34);
    const scale = this.trayScale + (1 - this.trayScale) * d.s;
    const cen = pieceCentroid(d.piece, ax, scale);
    const size = pieceScreenSize(d.piece, ax, H, 1);
    const lift = this._lift(d.piece, ax);
    const tx = d.x, ty = d.y - lift;
    // origin of the piece drawing at plane level (cell 0,0 corner)
    const ox = tx - cen.x, oy = ty - cen.y;
    return { ax, scale, ox, oy, cen };
  }

  // the stone floats above the finger so the finger never hides the landing spot
  _lift(piece, ax) { return 46 + pieceScreenSize(piece, ax, H, 1).h * 0.5; }

  _updateDrag() {
    const d = this.drag;
    const g = this._dragGeometry();
    // find snapped anchor: project the screen point of cell (0,0)'s centre onto the tier plane
    const t = this.tierIndex;
    const n = this.tier.size, off = (n - 1) / 2;
    const fullCen = pieceCentroid(d.piece, g.ax, 1);
    const cx = d.x, cy = d.y - this._lift(d.piece, g.ax);
    // piece origin at full scale
    const o1x = cx - fullCen.x, o1y = cy - fullCen.y;
    const sx = o1x + 0.5 * g.ax.ex.x + 0.5 * g.ax.ez.x;
    const sy = o1y + 0.5 * g.ax.ex.y + 0.5 * g.ax.ez.y;
    const wp = this.world.screenToPlane(sx, sy, this.world.tierBaseY(t));
    const prev = d.anchor;
    d.anchor = null;
    if (wp) {
      const fi = wp.x + off, fj = wp.z + off;
      const ri = Math.round(fi), rj = Math.round(fj);
      let best = null;
      if (prev && Math.abs(fi - prev[0]) < 0.72 && Math.abs(fj - prev[1]) < 0.72 && this.tier.canPlace(d.piece.cells, prev[0], prev[1])) {
        best = prev;   // hysteresis: stay put until the finger clearly moves to another cell
      } else if (this.tier.canPlace(d.piece.cells, ri, rj)) {
        best = [ri, rj];
      } else {
        // small edge assist: accept a direct neighbour if the finger is close to it
        let bd = 0.8;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ai = ri + a, aj = rj + b;
          const dist = Math.hypot(ai - fi, aj - fj);
          if (dist < bd && this.tier.canPlace(d.piece.cells, ai, aj)) { bd = dist; best = [ai, aj]; }
        }
      }
      const near = d.piece.cells.some(([x, y]) => { const i = ri + x, j = rj + y; return i >= -1 && j >= -1 && i <= n && j <= n; });
      if (best) {
        d.anchor = best;
        if (!prev || prev[0] !== best[0] || prev[1] !== best[1]) {
          this.world.setGhost(t, d.piece.cells, best[0], best[1], true, d.piece.gold);
          this.world.setLinePreview(t, this._linePreview(d.piece.cells, best[0], best[1]));
          this.audio.snap();
        }
      } else if (near) { this.world.setGhost(t, d.piece.cells, ri, rj, false); this.world.setLinePreview(t, null); }
      else { this.world.setGhost(); this.world.setLinePreview(t, null); }
    } else { this.world.setGhost(); this.world.setLinePreview(this.tierIndex, null); }
    this._drawDrag(g);
  }

  // every cell of the rows/columns that this placement would complete
  _linePreview(cells, ai, aj) {
    const T = this.tier, n = T.size;
    const mine = new Set(cells.map(([x, y]) => (aj + y) * n + ai + x));
    const filled = (i, j) => T.get(i, j) !== 0 || mine.has(j * n + i);
    const out = [];
    for (const j of new Set(cells.map(([, y]) => aj + y))) {
      if (T.rowsDone.has(j)) continue;
      let ok = true; for (let i = 0; i < n && ok; i++) ok = filled(i, j);
      if (ok) for (let i = 0; i < n; i++) out.push([i, j]);
    }
    for (const i of new Set(cells.map(([x]) => ai + x))) {
      if (T.colsDone.has(i)) continue;
      let ok = true; for (let j = 0; j < n && ok; j++) ok = filled(i, j);
      if (ok) for (let j = 0; j < n; j++) out.push([i, j]);
    }
    return out;
  }

  _drawDrag(g) {
    const c = this.ui.dragCanvas, ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.shadowColor = 'rgba(20,0,40,0.5)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 10;
    // once it snaps, the 3D preview on the pyramid takes over and the floating stone fades back
    if (this.drag.anchor) return;
    drawPiece(ctx, this.drag.piece, g.ox, g.oy, g.ax, H, this.assets.img, 0.97, g.scale);
  }
  _clearDrag() {
    const c = this.ui.dragCanvas, ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
  }

  _drop() {
    const d = this.drag;
    this.drag = null;
    this.world.setGhost();
    this._clearDrag();
    if (d.anchor && (this.state === 'play' || this.state === 'intro')) {
      this.placePiece(d.k, d.piece, d.anchor[0], d.anchor[1]);
    } else {
      this.audio.invalid();
      this._drawTray();
    }
  }

  // ------------------------------------------------------------ placing
  placePiece(k, piece, ai, aj) {
    const t = this.tierIndex;
    const kind = piece.gold ? GOLD : STONE;
    const res = this.tier.place(piece.cells, ai, aj, kind);
    res.placed.forEach(([i, j], n) => this.world.addBlock(t, i, j, kind, { delay: n * 0.035 }));
    this.audio.place(piece.gold);
    // score popups at the stone's centre
    const c = res.placed.reduce((a, [i, j]) => a.add(this.world.cellWorld(t, i, j)), new THREE.Vector3()).multiplyScalar(1 / res.placed.length);
    c.y += H;
    const sp = this.world.worldToScreen(c);
    let pts = res.placed.length * (piece.gold ? 30 : 10);
    const lines = res.rows.length + res.cols.length;
    if (lines) {
      this.combo++;
      const bonus = Math.round(40 * lines * lines * (1 + 0.5 * (this.combo - 1)));
      pts += bonus;
      const tb = lines;
      this.timeLeft = Math.min(this.timeMax, this.timeLeft + tb);
      const cells = [];
      for (const j of res.rows) for (let i = 0; i < this.tier.size; i++) cells.push([i, j]);
      for (const i of res.cols) for (let j = 0; j < this.tier.size; j++) cells.push([i, j]);
      this.later(260, () => { this.world.flashCells(t, cells, 0.03, 0.45); this.audio.line(lines); });
      this.later(420, () => this.ui.popup(sp.x, sp.y - 46, tb, { icon: 'icon_sun', size: 24 }));
      if (this.combo >= 2) this.later(300, () => this.ui.popup(sp.x + 50, sp.y - 90, this.combo, { prefix: 'x', size: 34, big: true }));
    } else this.combo = 0;
    for (const [i, j] of res.ankhs) {
      this.later(200, () => {
        this.world.removeAnkh(i, j);
        this.audio.ankh();
        this.world.priestessCast();
        const p = this.world.worldToScreen(this.world.cellWorld(t, i, j).setY(this.world.tierBaseY(t) + H * 1.5));
        this.ui.popup(p.x, p.y - 10, 3, { icon: 'icon_sun', size: 26 });
        this.ui.popIcon(p.x, p.y - 70, 'icon_ankh', 70);
      });
      this.timeLeft = Math.min(this.timeMax, this.timeLeft + 3);
      pts += 100;
    }
    this.score += pts;
    this.ui.popup(sp.x, sp.y, pts, { size: 26 });
    this.tray[k] = null;
    if (this.tutorial && this.tutorial.phase === 'drag') { this.tutorial.phase = 'rotate'; this.tutorial.t = 0; }
    if (res.complete) { this.tierComplete(); return; }
    if (this.tray.every((p) => !p)) this.refillAll();
    this._checkDeadEnd();
    this._drawTray();
  }

  tierComplete() {
    this.state = 'transition';
    this.timeStats.left += Math.max(0, this.timeLeft);
    this.timeStats.max += this.timeMax;
    this.ui.hideHand();
    this.ui.shuffleHint(false);
    const t = this.tierIndex;
    const bonus = Math.round(this.timeLeft) * 5;
    this.score += bonus;
    this.world.tierComplete(t);
    this.world.workersCheer(2.4);
    this.world.pharaohCheer();
    this.audio.tier();
    this.ui.flash();
    this.later(250, () => {
      this.ui.popIcon(this.vw / 2, (this.freeTop + this.freeBottom) / 2 - 40, 'icon_pyramid', 110);
      this.ui.popup(this.vw / 2, (this.freeTop + this.freeBottom) / 2 + 40, bonus, { size: 34, big: true });
    });
    this.tray = [null, null, null];
    this._drawTray();
    this.ui.setTiers(this.sizes.length, t + 1);
    this.later(1700, () => {
      if (t + 1 < this.tiers.length) this.startTier(t + 1);
      else this.levelComplete();
    });
  }

  async levelComplete() {
    this.state = 'finale';
    this.ui.tray.classList.add('hidden');
    this.ui.setTime(1, false);
    this.world.gridMesh.visible = false;
    this.world.focusTier(this.sizes.length - 1);
    this.audio.capstone();
    this.ui.hideHand();
    const session = this.session;
    await this.world.placeCapstone(this.sizes.length);
    if (session !== this.session) return;
    this.ui.flash();
    this.audio.fanfare();
    this.world.setOrbit(true);
    this.world.priestessDance();
    this.world.workersCheer(8);
    this.world.pharaohCheer();
    // Horus eyes: 3 = no scarab lost and a quarter of the sun time left over, 2 = at most one scarab lost
    const spare = this.timeStats.left / Math.max(1, this.timeStats.max);
    const eyes = this.lives === 3 && spare >= 0.25 ? 3 : (this.lives === 3 || (this.lives === 2 && spare >= 0.1)) ? 2 : 1;
    const i = this.levelIndex;
    this.save.eyes[i] = Math.max(this.save.eyes[i] || 0, eyes);
    this.save.best[i] = Math.max(this.save.best[i] || 0, this.score);
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(LEVELS.length - 1, i + 1));
    writeSave(this.save);
    this.later(1600, () => {
      this.state = 'won';
      this.ui.hud.classList.add('hidden');
      this.ui.showWin(eyes, this.score);
      this.ui.btnNextW.style.display = i + 1 < LEVELS.length ? '' : 'none';
    });
  }

  loseLife() {
    this.lives--;
    this.ui.setLives(this.lives);
    this.audio.loseLife();
    this.world.pharaohStomp();
    this.world.shake = 0.45;
    this.ui.shakeHud();
    this.ui.popIcon(this.vw / 2, (this.freeTop + this.freeBottom) / 2, 'icon_scarab', 100);
    if (this.lives <= 0) {
      this.state = 'lost';
      this.ui.setTime(0, false);
      this.ui.tray.classList.add('hidden');
      this.world.setGhost();
      this.later(1300, () => { this.ui.hud.classList.add('hidden'); this.ui.show('scrLose'); });
      return;
    }
    this.timeLeft = this.timeMax * 0.5;
  }

  pause() {
    this.state = 'pause';
    this._cancel();
    this.ui.show('scrPause');
  }
  resume() {
    this.ui.show(null);
    this.state = 'play';
    this.last = performance.now();
  }

  _endTutorial() {
    this.tutorial = null;
    this.save.tut = true; writeSave(this.save);
    this.ui.hideHand();
  }

  // ------------------------------------------------------------ tray drawing
  _drawTray() {
    if (!this.world || !this.ui) return;
    const c = this.ui.trayCanvas, ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const ax = this.world.screenAxes();
    const w = this.vw, h = this.trayH;
    const sw = (w - 24) / 3;
    // one scale for all three stones (so sizes compare honestly), as large as the slots allow
    const innerH = h - 30;
    let rw = pieceScreenSize({ cells: [[0, 0], [1, 1]] }, ax, H, 1).w, rh = pieceScreenSize({ cells: [[0, 0], [1, 1]] }, ax, H, 1).h;
    for (const p of this.tray) if (p) { const z = pieceScreenSize(p, ax, H, 1); rw = Math.max(rw, z.w); rh = Math.max(rh, z.h); }
    const target = Math.min(1.9, (sw * 0.86) / rw, (innerH * 0.86) / rh);
    // ease towards the new scale so the tray does not jump when stones change
    this.trayScale = this.trayScale ? this.trayScale + (target - this.trayScale) * 0.35 : target;
    if (Math.abs(this.trayScale - target) > 0.01) this._scaleEasing = true; else { this.trayScale = target; this._scaleEasing = false; }
    const now = performance.now();
    for (let k = 0; k < 3; k++) {
      const p = this.tray[k];
      const cx = 12 + sw * (k + 0.5), cy = 14 + innerH * 0.52;
      // slot plate
      ctx.save();
      ctx.beginPath(); ctx.ellipse(cx, cy + innerH * 0.26, sw * 0.42, innerH * 0.16, 0, 0, Math.PI * 2);
      const gr = ctx.createRadialGradient(cx, cy + innerH * 0.26, 4, cx, cy + innerH * 0.26, sw * 0.44);
      gr.addColorStop(0, 'rgba(200,140,255,0.45)'); gr.addColorStop(1, 'rgba(190,120,255,0)');
      ctx.fillStyle = gr; ctx.fill();
      ctx.restore();
      if (!p || (this.drag && this.drag.k === k)) continue;
      const fits = this.tier ? this.fitsAny(p) : true;
      const fitsNow = this.tier ? !!this.tier.anyFit(p.cells) : true;
      let s = this.trayScale;
      if (p.born && now - p.born < 300) s *= Math.max(0.02, Math.min(1, (now - p.born) / 300)) ** 0.6;
      const cen = pieceCentroid(p, ax, s);
      const size = pieceScreenSize(p, ax, H, s);
      const ox = cx - (size.minX + size.w / 2), oy = cy - (size.minY + size.h / 2);
      ctx.save();
      if (!fits) ctx.filter = 'grayscale(0.85) brightness(0.65)';
      drawPiece(ctx, p, ox, oy, ax, H, this.assets.img, fits ? 1 : 0.5, s, { glow: fits });
      ctx.restore();
      if (fits && !fitsNow) {
        // hint: only fits after turning
        const img = this.assets.img.icon_rotate;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 200);
        ctx.drawImage(img, cx + sw * 0.28, cy - innerH * 0.42, 26, 27);
        ctx.globalAlpha = 1;
      }
    }
    this._trayAnimating = this._scaleEasing || this.tray.some((p) => p && p.born && now - p.born < 320) || this.tray.some((p) => p && this.tier && this.fitsAny(p) && !this.tier.anyFit(p.cells));
  }

  // ------------------------------------------------------------ main loop
  _frame(t) {
    requestAnimationFrame((tt) => this._frame(tt));
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (!this.world) return;
    const menu = this.state === 'title' || this.state === 'menu' || this.state === 'loading';
    if (this.state === 'intro') { this.introT -= dt; if (this.introT <= 0) this.state = 'play'; }
    if (this.state === 'play') {
      this.timeLeft -= dt;
      const sec = Math.ceil(this.timeLeft);
      if (this.timeLeft < 10 && sec !== this.lastTick && sec >= 0) { this.lastTick = sec; this.audio.tick(this.timeLeft < 5); }
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.loseLife(); }
      if (this.tutorial) this._tutorialStep(dt);
    } else if (this.tutorial) this.ui.hideHand();
    if (this.tier && !menu) {
      const p = 1 - Math.max(0, this.timeLeft) / this.timeMax;
      if (this.state === 'play' || this.state === 'intro') {
        this.world.setDaylight(p);
        this.ui.setTime(this.timeLeft / this.timeMax, this.timeLeft < 10 && this.state === 'play');
        document.getElementById('skyTint').style.opacity = (p * 0.75).toFixed(3);
      }
      // rolling score
      if (this.shownScore !== this.score) {
        this.shownScore += Math.max(1, Math.ceil((this.score - this.shownScore) * Math.min(1, dt * 8)));
        if (this.shownScore > this.score) this.shownScore = this.score;
        this.ui.setScore(this.shownScore);
      }
      if (this._trayAnimating) this._drawTray();
      if (this.drag) this._updateDrag();
    }
    if (!menu) {
      this.world.update(dt);
      // adaptive quality: drop resolution/shadow size once if the device struggles
      if (this.state === 'play' && this.world.quality !== 0) {
        this.perf = this.perf || { n: 0, sum: 0 };
        this.perf.n++; if (this.perf.n > 40) this.perf.sum += dt;
        if (this.perf.n === 160 && this.perf.sum / 120 > 1 / 38) this.world.setQuality(0);
      }
    }
  }

  _tutorialStep(dt) {
    const tu = this.tutorial;
    tu.t += dt;
    if (tu.phase === 'drag') {
      if (this.drag) return;
      const sw = (this.vw - 24) / 3;
      const k = this.tray.findIndex((p) => p && this.fitsAny(p) && this.tier.anyFit(p.cells));
      if (k < 0) return;
      const sx = 12 + sw * (k + 0.5), sy = this.vh - this.trayH + 14 + (this.trayH - 30) * 0.52;
      const target = this.world.worldToScreen(new THREE.Vector3(0, this.world.tierBaseY(this.tierIndex) + H, 0));
      const cyc = (tu.t % 2.2) / 2.2;
      const m = Math.min(1, Math.max(0, (cyc - 0.15) / 0.6));
      const e = m < 0.5 ? 2 * m * m : 1 - Math.pow(-2 * m + 2, 2) / 2;
      this.ui.handAt(sx + (target.x - sx) * e, sy + (target.y + 60 - sy) * e);
    } else if (tu.phase === 'rotate') {
      if (tu.t > 6) { this._endTutorial(); return; }
      const sw = (this.vw - 24) / 3;
      const k = this.tray.findIndex((p) => p && p.cells.length > 1);
      if (k < 0) return;
      const sx = 12 + sw * (k + 0.5), sy = this.vh - this.trayH + 14 + (this.trayH - 30) * 0.5;
      const bob = Math.abs(Math.sin(tu.t * 4)) * 14;
      this.ui.handAt(sx + 8, sy + 10 + bob, true);
    }
  }
}

const game = new Game();
window.__game = game;
game.boot();
