import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { World } from './world.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { LEVELS, tierSizes } from './levels.js';
import { PLOTS } from './plots.js';
import { Economy, DEFS, MAX_LEVEL, upgradeCost, staffFor, cycleOf, BLOCK_PAY, TIER_PAY } from './economy.js';

const SAVE_KEY = 'purple-sun-works-v1';
const BUILDINGS = ['house', 'farm', 'bakery', 'quarry', 'mason', 'mine', 'smithy'];

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
  const texFiles = { ...Object.fromEntries(texNames.map((n) => [n, `assets/tex/${n}.jpg`])), cloud: 'assets/tex/cloud.webp', dust: 'assets/tex/dust.webp', glyph: 'assets/tex/glyph.webp', sparkle: 'assets/ui/sparkle.webp' };
  const models = ['worker', 'pharaoh', 'priestess', 'sphinx', 'obelisk', 'palm', 'camel', 'sledge', 'temple', 'anubis', 'boat', 'brazier',
    'anim_worker_walk', 'anim_worker_cheer', 'anim_worker_idle', 'anim_pharaoh_cheer', 'anim_pharaoh_stomp', 'anim_priestess_cast', 'anim_priestess_dance', ...BUILDINGS];
  const uiImgs = ['btn_play', 'btn_pause', 'btn_restart', 'btn_next', 'btn_home', 'btn_sound_on', 'btn_sound_off', 'btn_shuffle', 'btn_up', 'btn_close', 'icon_scarab', 'icon_sun',
    'icon_eye', 'icon_eye_empty', 'icon_lock', 'icon_pyramid', 'hand', 'panel', 'banner_win', 'banner_lose', 'medallion', 'plaque', 'plot', 'bubble',
    'r_deben', 'r_worker', 'r_grain', 'r_bread', 'r_stone', 'r_block', 'r_tools', 'r_ore', ...BUILDINGS.map((b) => 'b_' + b),
    'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd_plus', 'd_x'];
  const total = Object.keys(texFiles).length + models.length + uiImgs.length;
  let done = 0;
  const tick = () => { done++; onProgress(done / total); };
  const tl = new THREE.TextureLoader();
  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
  const assets = { tex: {}, models: {}, img: {} };
  const jobs = [];
  for (const [k, f] of Object.entries(texFiles)) jobs.push(tl.loadAsync(f).then((t) => { t.colorSpace = THREE.SRGBColorSpace; assets.tex[k] = t; tick(); }));
  // hosts that cannot serve .glb get base64 text copies (window.__B64_MODELS is set by that page)
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
  return assets;
}

const statusKey = (b) => {
  if (!b.built) return null;
  if (b.state === 'missing') return 'r_' + b.missing;
  if (b.state === 'noTools') return 'r_tools';
  if (b.state === 'flooded') return 'btn_shuffle';
  if (b.state === 'hungry') return 'r_bread';
  return null;
};

// ------------------------------------------------------------------ game
class Game {
  constructor() {
    this.app = document.getElementById('app');
    this.save = loadSave();
    this.audio = new Audio();
    this.audio.muted = !!this.save.muted;
    this.state = 'loading';
    this.speed = 1;
    this.pointers = new Map();
  }

  async boot() {
    this.ui = new UI(this.app);
    this.ui.setSound(!this.save.muted);
    this.assets = await loadAssets((p) => this.ui.setLoad(p));
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
    ui.on('speed', () => { click(); this.speed = this.speed >= 3 ? 1 : this.speed + 1; ui.setSpeed(this.speed); });
    ui.on('closeSheet', () => { click(); this._closeSheet(); });
    ui.on('buildType', (type) => this.build(type));
    ui.on('upgrade', () => this.upgrade());

    const c = document.getElementById('gl');
    c.addEventListener('pointerdown', (e) => this._pdown(e));
    c.addEventListener('pointermove', (e) => this._pmove(e));
    c.addEventListener('pointerup', (e) => this._pup(e));
    c.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
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

  _layout() {
    const w = window.innerWidth, h = window.innerHeight;
    this.vw = w; this.vh = h;
    const hudBottom = this.ui.hud.offsetTop + this.ui.hud.offsetHeight;
    this.freeTop = (hudBottom || 140) + 4;
    this.freeBottom = h - 70;
    this.world.setLayout(w, h, this.freeTop, this.freeBottom);
  }

  later(ms, fn) { const s = this.session; setTimeout(() => { if (s === this.session) fn(); }, ms); }

  // ------------------------------------------------------------ level flow
  startLevel(i) {
    this.session = (this.session || 0) + 1;
    this.levelIndex = i;
    const L = LEVELS[i];
    this.L = L;
    this.sizes = tierSizes(L.base);
    this.world.setupLevel(this.sizes);
    this.eco = new Economy(L, PLOTS, this.sizes.map((n) => n * n));
    for (const [t, p] of L.prebuilt) this.eco.build(t, p, { free: true, instant: true });
    this._handleEvents(this.eco.drain());
    this.world.priestessIdle();
    this.world.setDaylight(0);
    this.speed = 1;
    this.selected = null;
    this.warned = {};
    this.ui.show(null);
    this.ui.setInGame(true);
    this.ui.setLevel(i);
    this.ui.setSpeed(1);
    this.ui.setEvent(null);
    this.ui.setStorm(false);
    this.ui.hideHand();
    this.resVisible = ['worker', 'bread', 'grain', 'stone', 'block', ...(L.tools ? ['ore', 'tools'] : [])];
    this.advisor = (i === 0 && !this.save.tut) ? { built: 0 } : null;
    this.advice = null;
    this._refreshMarkers();
    this._hudT = 0; this._bubT = 0;
    this._updateHud(true);
    requestAnimationFrame(() => this._layout());
    this.state = 'play';
  }

  _refreshMarkers() {
    const terrains = [...new Set(this.L.allowed.map((t) => DEFS[t].terrain))];
    this.world.setPlotMarkers(terrains, (id) => this.eco.plotFree(id), this.advice?.plot || null);
  }

  // ------------------------------------------------------------ economy events -> visuals
  _nearest(pos, filter) {
    let best = null, bd = Infinity;
    for (const b of this.eco.buildings) {
      if (!b.built || !filter(b)) continue;
      const p = this.world.buildingPos(b); if (!p) continue;
      const d = p.distanceTo(pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  _handleEvents(evts) {
    for (const e of evts) {
      switch (e.type) {
        case 'built':
          this.world.addBuilding(e.b, e.instant);
          if (!e.instant) this.audio.place(false);
          break;
        case 'ready': this.world.buildingReady(e.b); this.audio.button(); break;
        case 'upgraded': this.world.upgradeBuilding(e.b); this.audio.ankh(); break;
        case 'take': {
          const to = this.world.buildingPos(e.b); if (!to) break;
          const from = this._nearest(to, (b) => DEFS[b.type].out && DEFS[b.type].out[0] === e.good);
          if (from) this.world.sendCarrier(from, to, 'r_' + e.good);
          break;
        }
        case 'eat': {
          const to = this.world.buildingPos(e.b); if (!to) break;
          const from = this._nearest(to, (b) => b.type === 'bakery');
          if (from) this.world.sendCarrier(from, to, 'r_bread');
          break;
        }
        case 'made': this.world.popIcon(e.b, 'r_' + e.good); break;
        case 'haul': {
          const from = this._nearest(new THREE.Vector3(), (b) => b.type === 'mason');
          if (from) this.world.sendHauler(from, this.world.siteEdge(from));
          break;
        }
        case 'placed': {
          const p = this.world.placeBlock(e.index);
          this.audio.block();
          if (p && this.state === 'play') {
            const s = this.world.worldToScreen(p);
            this.ui.popup(s.x, s.y - 20, BLOCK_PAY, { icon: 'r_deben', size: 16 });
          }
          break;
        }
        case 'tier':
          this.world.tierComplete(e.tier);
          this.world.crowdCheer();
          this.world.pharaohCheer();
          this.audio.tier();
          this.ui.flash();
          this.ui.popIcon(this.vw / 2, (this.freeTop + this.freeBottom) / 2 - 40, 'icon_pyramid', 100);
          this.ui.popup(this.vw / 2, (this.freeTop + this.freeBottom) / 2 + 40, TIER_PAY, { icon: 'r_deben', size: 30, big: true });
          break;
        case 'floodWarn': this.ui.setEvent('flood', false); this.world.floodWarn = true; this.audio.shuffle(); break;
        case 'floodOn': this.world.setFlood(true); this.ui.setEvent('flood', true); this.world.priestessCast(); this.audio.shuffle(); break;
        case 'floodOff': this.world.setFlood(false); this.ui.setEvent(null); break;
        case 'stormOn': this.world.setStorm(true); this.ui.setStorm(true); this.ui.setEvent('storm', true); break;
        case 'stormOff': this.world.setStorm(false); this.ui.setStorm(false); this.ui.setEvent(null); break;
        case 'hungry':
          if (!this._hungrySfx) { this._hungrySfx = true; this.audio.tick(true); setTimeout(() => { this._hungrySfx = false; }, 4000); }
          break;
        default: break;
      }
    }
  }

  // ------------------------------------------------------------ building + upgrading
  _plotOf(id) { return PLOTS.find((p) => p.id === id); }

  _openPlot(plotId) {
    const b = this.eco.buildings.find((x) => x.plot === plotId);
    if (b) { this.selected = { building: b.id }; this._sheetKey = null; this._showBuilding(b); this.audio.button(); return; }
    const plot = this._plotOf(plotId);
    const types = this.L.allowed.filter((t) => DEFS[t].terrain === plot.terrain);
    if (!types.length) { this._closeSheet(); return; }
    this.selected = { plot: plotId };
    this._sheetKey = null;
    this._showBuildMenu();
    this.audio.button();
  }

  _showBuildMenu() {
    const plot = this._plotOf(this.selected.plot);
    const types = this.L.allowed.filter((t) => DEFS[t].terrain === plot.terrain);
    const cards = types.map((type) => {
      const d = DEFS[type];
      const money = this.eco.deben >= d.cost, hands = this.eco.workersFree() >= d.staff;
      return { type, cost: d.cost, staff: d.staff, inputs: (d.in || []).map(([g]) => g), output: d.out ? d.out[0] : null, money, hands, ok: money && hands };
    });
    const key = JSON.stringify(cards);
    if (key !== this._sheetKey) { this._sheetKey = key; this.ui.openBuildSheet(cards); }
  }

  _buildingInfo(b) {
    const d = DEFS[b.type];
    const extra = staffFor(b.type, b.level + 1) - staffFor(b.type, b.level);
    const upCost = b.level < MAX_LEVEL ? upgradeCost(b.type, b.level) : 0;
    return {
      type: b.type, level: b.level, maxLevel: MAX_LEVEL,
      inputs: (d.in || []).map(([g]) => g), output: d.out ? d.out[0] : null, outN: d.out ? d.out[1] : 0,
      cycle: d.cycle ? Math.round(cycleOf(b.type, b.level)) : 0,
      workers: b.type === 'house' ? DEFS.house.workers[b.level - 1] : 0,
      eat: b.type === 'house' ? Math.round(d.eat / (1 + 0.4 * (b.level - 1))) : 0,
      status: statusKey(b),
      upCost, upStaff: Math.max(0, extra),
      money: this.eco.deben >= upCost, hands: this.eco.workersFree() >= extra,
      canUpgrade: this.eco.canUpgrade(b),
    };
  }

  _showBuilding(b) {
    const info = this._buildingInfo(b);
    const key = JSON.stringify(info);
    if (key !== this._sheetKey) { this._sheetKey = key; this.ui.openBuildingSheet(info); }
  }

  _closeSheet() { this.selected = null; this._sheetKey = null; this.ui.closeSheet(); }

  build(type) {
    if (!this.selected || !this.selected.plot || this.state !== 'play') return;
    const b = this.eco.build(type, this.selected.plot);
    if (!b) { this.audio.invalid(); this.ui.shakeCard(type); return; }
    this._handleEvents(this.eco.drain());
    this._closeSheet();
    if (this.advisor) this.advisor.built++;
    this.advice = null;
    this._refreshMarkers();
    this._updateHud(true);
  }

  upgrade() {
    if (!this.selected || !this.selected.building || this.state !== 'play') return;
    const b = this.eco.buildings.find((x) => x.id === this.selected.building);
    if (!b || !this.eco.upgrade(b)) { this.audio.invalid(); this.ui.shakeCard(); return; }
    this._handleEvents(this.eco.drain());
    this._sheetKey = null;
    this._showBuilding(b);
    this._updateHud(true);
  }

  // ------------------------------------------------------------ camera input: drag to pan, pinch to zoom, tap to select
  _pdown(e) {
    if (this.state !== 'play') return;
    this.audio.unlock();
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false });
    if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); a.moved = b.moved = true; }
  }

  _pmove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (this.pointers.size >= 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch && d > 10) this.world.zoom(this.pinch / d);
      this.pinch = d;
      return;
    }
    if (!p.moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) p.moved = true;
    if (p.moved) {
      const a = this.world.screenToPlane(p.x, p.y, 0), b = this.world.screenToPlane(e.clientX, e.clientY, 0);
      if (a && b) this.world.pan(a.x - b.x, a.z - b.z);
    }
    p.x = e.clientX; p.y = e.clientY;
  }

  _pup(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!p || p.moved || this.state !== 'play') return;
    if (performance.now() - p.t0 > 600) return;
    const id = this.world.pickPlot(e.clientX, e.clientY);
    if (id) this._openPlot(id);
    else if (this.selected) this._closeSheet();
  }

  // ------------------------------------------------------------ win / lose
  async levelComplete() {
    this.state = 'finale';
    this._closeSheet();
    this.ui.hideHand();
    this.ui.controls.classList.add('hidden');
    this.audio.capstone();
    const session = this.session;
    await this.world.placeCapstone(this.sizes.length);
    if (session !== this.session) return;
    this.ui.flash();
    this.audio.fanfare();
    this.world.setOrbit(true);
    this.world.priestessDance();
    this.world.crowdCheer(8);
    this.world.pharaohCheer();
    const ratio = this.eco.time / this.L.deadline;
    const eyes = ratio <= 0.75 ? 3 : ratio <= 0.9 ? 2 : 1;
    const score = Math.round(this.eco.total * 10 + Math.max(0, this.L.deadline - this.eco.time) * 3 + this.eco.deben);
    const i = this.levelIndex;
    this.save.eyes[i] = Math.max(this.save.eyes[i] || 0, eyes);
    this.save.best[i] = Math.max(this.save.best[i] || 0, score);
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(LEVELS.length - 1, i + 1));
    writeSave(this.save);
    this.later(1600, () => {
      this.state = 'won';
      this.ui.hud.classList.add('hidden');
      this.ui.showWin(eyes, score);
      this.ui.btnNextW.style.display = i + 1 < LEVELS.length ? '' : 'none';
    });
  }

  lose() {
    this.state = 'lost';
    this._closeSheet();
    this.ui.hideHand();
    this.audio.loseLife();
    this.world.pharaohStomp();
    this.world.shake = 0.5;
    this.ui.shakeHud();
    this.later(1400, () => { this.ui.setInGame(false); this.ui.show('scrLose'); });
  }

  pause() { this.state = 'pause'; this.ui.show('scrPause'); }
  resume() { this.ui.show(null); this.state = 'play'; this.last = performance.now(); }

  // ------------------------------------------------------------ HUD + hints
  _updateHud() {
    const E = this.eco;
    this.ui.setDeben(E.deben);
    this.ui.setProgress(E.placed, E.total);
    const r = { ...E.stock, worker: E.workersFree() };
    this.ui.setResources(r, this.resVisible);
    this.ui.flagRes('bread', E.hungryShare() > 0);
    this.ui.flagRes('worker', E.workersFree() <= 0);
    const left = Math.max(0, this.L.deadline - E.time);
    const frac = left / this.L.deadline;
    this.ui.setTime(frac, frac < 0.2);
    this.world.setDaylight(1 - frac);
    document.getElementById('skyTint').style.opacity = ((1 - frac) * 0.7).toFixed(3);
    for (const th of [0.25, 0.1]) if (frac < th && !this.warned[th]) { this.warned[th] = true; this.world.pharaohStomp(); this.audio.tick(true); }
    if (this.selected?.plot) this._showBuildMenu();
    else if (this.selected?.building) { const b = E.buildings.find((x) => x.id === this.selected.building); if (b) this._showBuilding(b); }
  }

  _advisorStep() {
    const A = this.advisor;
    const E = this.eco;
    const has = (t) => E.buildings.some((b) => b.type === t);
    const freePlot = (terrain) => PLOTS.find((p) => p.terrain === terrain && E.plotFree(p.id));
    let adv = null;
    if (!has('farm')) adv = { type: 'farm', plot: freePlot('fertile')?.id };
    else if (E.buildings.filter((b) => b.type === 'house').length < 2) adv = { type: 'house', plot: freePlot('desert')?.id };
    else if (!has('bakery')) adv = { type: 'bakery', plot: freePlot('desert')?.id };
    if (!adv || !adv.plot || A.built >= 3) {
      this.advisor = null; this.advice = null; this.save.tut = true; writeSave(this.save);
      this.ui.hideHand(); this._refreshMarkers(); return;
    }
    if (!this.advice || this.advice.plot !== adv.plot) { this.advice = adv; this._refreshMarkers(); }
    if (this.selected) { this.ui.hideHand(); return; }
    const pv = this.world.plotViews[adv.plot];
    const s = this.world.worldToScreen(pv.pos.clone().setY(0.4));
    const bob = Math.abs(Math.sin(performance.now() / 260)) * 12;
    this.ui.handAt(s.x, s.y + 8 + bob, 'b_' + adv.type);
  }

  // ------------------------------------------------------------ main loop
  _frame(t) {
    requestAnimationFrame((tt) => this._frame(tt));
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (!this.world) return;
    const menu = this.state === 'title' || this.state === 'menu' || this.state === 'loading';
    let gdt = 0;
    if (this.state === 'play') {
      gdt = dt * this.speed;
      let rest = gdt;
      while (rest > 1e-6) { const s = Math.min(0.1, rest); this.eco.step(s); rest -= s; }
      this._handleEvents(this.eco.drain());
      this._hudT -= dt; this._bubT -= dt;
      if (this._hudT <= 0) { this._hudT = 0.12; this._updateHud(); }
      if (this._bubT <= 0) { this._bubT = 0.25; for (const b of this.eco.buildings) this.world.setBubble(b, statusKey(b)); }
      if (this.advisor) this._advisorStep();
      if (this.eco.done()) this.levelComplete();
      else if (this.eco.time >= this.L.deadline) this.lose();
    }
    if (!menu) {
      this.world.update(dt, this.state === 'play' ? gdt : (this.state === 'pause' ? 0 : dt));
      if (this.state === 'play' && this.world.quality !== 0) {
        this.perf = this.perf || { n: 0, sum: 0 };
        this.perf.n++; if (this.perf.n > 40) this.perf.sum += dt;
        if (this.perf.n === 160 && this.perf.sum / 120 > 1 / 38) this.world.setQuality(0);
      }
    }
  }
}

const game = new Game();
window.__game = game;
game.boot();
