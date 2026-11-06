import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { World, uv } from './world.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { LEVELS, tierSizes } from './levels.js';
import { PLOTS } from './map.js';
import { Economy, DEFS, MAX_LEVEL, upgradeCost, staffFor, cycleOf, PAY, TIER_PAY, SITE_PLACE, SITE_UP, OUT_CAP, HEAVY, goodOf, PATH, TRACK, rampBricks } from './economy.js';

const SAVE_KEY = 'purple-sun-works-v2';
const TOOL_TYPE = { path: PATH, track: TRACK };
const BUILDINGS = ['house', 'farm', 'bakery', 'quarry', 'mason', 'mine', 'smithy', 'granite', 'quay', 'brickworks'];
const LP_CLIPS = ['walk', 'carry', 'hammer', 'chop', 'reap', 'pick', 'place', 'push', 'lever', 'water', 'cheer', 'talk', 'shrug'];

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
  const texNames = ['sand', 'limestone', 'gold', 'strata', 'water', 'bedrock', 'mudbrick'];
  const texFiles = { ...Object.fromEntries(texNames.map((n) => [n, `assets/tex/${n}.jpg`])), cloud: 'assets/tex/cloud.webp', dust: 'assets/tex/dust.webp', glyph: 'assets/tex/glyph.webp', sparkle: 'assets/ui/sparkle.webp' };
  const models = ['worker', 'worker_lp', 'pharaoh', 'priestess', 'sphinx', 'obelisk', 'palm', 'camel', 'sledge', 'temple', 'anubis', 'boat', 'brazier', 'oxcart',
    'anim_worker_walk', 'anim_worker_cheer', 'anim_worker_idle', 'anim_pharaoh_cheer', 'anim_pharaoh_stomp', 'anim_priestess_cast', 'anim_priestess_dance',
    ...LP_CLIPS.map((c) => 'anim_lp_' + c), ...BUILDINGS];
  const uiImgs = ['btn_play', 'btn_pause', 'btn_restart', 'btn_next', 'btn_home', 'btn_sound_on', 'btn_sound_off', 'btn_shuffle', 'btn_up', 'btn_close', 'btn_add', 'btn_road', 'btn_erase', 'btn_undo', 't_path', 't_track',
    'icon_scarab', 'icon_sun', 'icon_eye', 'icon_eye_empty', 'icon_lock', 'icon_pyramid', 'icon_speed', 'icon_full', 'icon_target', 'hand', 'panel', 'banner_win', 'banner_lose',
    'medallion', 'plaque', 'plot', 'bubble', 't_porter', 't_sledge', 't_ox', 't_boat',
    'r_deben', 'r_worker', 'r_grain', 'r_bread', 'r_stone', 'r_block', 'r_tools', 'r_ore', 'r_granite', 'r_brick', ...BUILDINGS.map((b) => 'b_' + b),
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
  for (const m of models) jobs.push(loadModel(m).then((g) => { assets.models[m] = g; }).catch(() => {}).then(tick));
  for (const u of uiImgs) jobs.push(new Promise((res) => { const i = new Image(); i.onload = i.onerror = () => { tick(); res(); }; i.src = `assets/ui/${u}.webp`; assets.img[u] = i; }));
  await Promise.all(jobs);
  return assets;
}

const statusKey = (b) => {
  if (!b.built) return null;
  if (b.carriers && b.carriers.length && !b.linked) return HEAVY.has(goodOf(b.type)) && !DEFS[b.type].boat ? 't_track' : 't_path';
  if (b.state === 'missing') return 'r_' + b.missing;
  if (b.state === 'full') return 'icon_full';
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
    ui.on('roadMode', () => { click(); if (this.roadMode) this._endRoadMode(); else this._startRoadMode(); });
    ui.on('roadTool', (t) => { click(); if (this.roadMode) { this.roadMode.tool = t; this.ui.showRoadBar(t); } });
    ui.on('roadDone', () => { click(); this._endRoadMode(); });
    ui.on('roadUndo', () => this._undoRoad());
    ui.on('addCarrier', () => this._addCarrier());

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
    this.ui.hideRoadBar();
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
    this.eco = new Economy(L, PLOTS, this.sizes);
    for (const [t, p] of L.prebuilt) this.eco.build(t, p, { free: true, instant: true });
    this._handleEvents(this.eco.drain());
    this.world.priestessIdle();
    this.world.setDaylight(0);
    this.speed = 1;
    this.selected = null;
    this.roadMode = null;
    this.warned = {};
    this.ui.show(null);
    this.ui.setInGame(true);
    this.ui.hideRoadBar();
    this.ui.setLevel(i);
    this.ui.setSpeed(1);
    this.ui.setEvent(null);
    this.ui.setStorm(false);
    this.ui.hideHand();
    this.resVisible = ['worker', 'bread', 'block', ...(L.bricks ? ['brick'] : []), ...(L.graniteTiers ? ['granite'] : [])];
    this.advisor = (i === 0 && !this.save.tut) ? { step: 0 } : null;
    this.advice = null;
    this._hint = null;
    this._refreshMarkers();
    this._hudT = 0; this._bubT = 0;
    this._updateHud();
    requestAnimationFrame(() => this._layout());
    this.state = 'play';
  }

  _refreshMarkers() {
    const terrains = [...new Set(this.L.allowed.map((t) => DEFS[t].terrain))];
    this.world.setPlotMarkers(this.roadMode ? [] : terrains, (id) => this.eco.plotFree(id), this.advice?.plot || null);
  }

  // ------------------------------------------------------------ economy events -> visuals
  _handleEvents(evts) {
    for (const e of evts) {
      switch (e.type) {
        case 'built':
          this.world.addBuilding(e.b, e.instant);
          if (!e.instant) this.audio.place(false);
          break;
        case 'ready': this.world.buildingReady(e.b); this.audio.button(); break;
        case 'upgraded':
          if (e.b.type === 'site') this.audio.tier(); else { this.world.upgradeBuilding(e.b); this.audio.ankh(); }
          break;
        case 'deliver':
          if (e.to.type === 'site' && this.state === 'play' && Math.random() < 0.5) this.audio.tick(false);
          break;
        case 'made': this.world.popIcon(e.b, 'r_' + e.good); this.world.runnerTrip(e.b, e.good); break;
        case 'rampBrick': if (this.state === 'play') this.audio.place(false); break;
        case 'rampUp': this.world.crowdCheer(1.6); this.audio.tier(); this.ui.popIcon(this.vw / 2, (this.freeTop + this.freeBottom) / 2, 'r_brick', 80); break;
        case 'placed': {
          const p = this.world.placeBlock(e.index, e.good);
          this.audio.block();
          if (p && this.state === 'play') {
            const s = this.world.worldToScreen(p);
            this.ui.popup(s.x, s.y - 20, PAY[e.good], { icon: 'r_deben', size: 16 });
          }
          break;
        }
        case 'tier':
          this.world.tierComplete(e.tier);
          this.world.setSiteTier(e.tier + 1);
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

  // ------------------------------------------------------------ selection
  _plotOf(id) { return PLOTS.find((p) => p.id === id); }

  // what is under a tap: a building/plot id, 'site' or null
  _pick(x, y) {
    const id = this.world.pickPlot(x, y);
    const site = this.world.worldToScreen(new THREE.Vector3(0, 0.8, 0));
    const dock = this.world.dockPos ? this.world.worldToScreen(this.world.dockPos.clone().setY(0.4)) : null;
    const pyrPx = (this.sizes[0] * Math.SQRT2 / 2) / this.world.cam.W * this.vw;
    const dSite = Math.min(Math.hypot(site.x - x, site.y - y) - pyrPx * 0.6, dock ? Math.hypot(dock.x - x, dock.y - y) - 30 : 1e9);
    if (id && (!this.world._lastPickDist || this.world._lastPickDist < Math.max(30, dSite))) return { plot: id };
    if (dSite < 0) return { site: true };
    return id ? { plot: id } : null;
  }

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

  _openSite() { this.selected = { site: true }; this._sheetKey = null; this._showSite(); this.audio.button(); }

  _showBuildMenu() {
    const plot = this._plotOf(this.selected.plot);
    const types = this.L.allowed.filter((t) => DEFS[t].terrain === plot.terrain);
    const cards = types.map((type) => {
      const d = DEFS[type];
      const staff = this.eco.staffNeeded(type);
      const money = this.eco.deben >= d.cost, hands = this.eco.workersFree() >= staff;
      return { type, cost: d.cost, staff, inputs: (d.in || []).map(([g]) => g), output: d.out ? d.out[0] : null, money, hands, ok: money && hands };
    });
    const key = JSON.stringify(cards);
    if (key !== this._sheetKey) { this._sheetKey = key; this.ui.openBuildSheet(cards); }
  }

  _buildingInfo(b) {
    const E = this.eco, d = DEFS[b.type];
    const extra = staffFor(b.type, b.level + 1) - staffFor(b.type, b.level);
    const upCost = b.level < MAX_LEVEL ? upgradeCost(b.type, b.level) : 0;
    const out = E.produces(b);
    const ins = [...(d.in || []).map(([g]) => g), ...(d.usesTools && this.L.tools ? ['tools'] : [])];
    return {
      type: b.type, level: b.level, maxLevel: MAX_LEVEL,
      inputs: (d.in || []).map(([g]) => g), output: out, outN: d.out ? d.out[1] : 0,
      cycle: d.cycle ? Math.max(1, Math.round(cycleOf(b.type, b.level))) : 0,
      workers: b.type === 'house' ? DEFS.house.workers[b.level - 1] : 0, pantry: E.pantry.bread,
      stockIn: ins.map((g) => [g, b.inv[g] || 0]), outStock: b.out, outFull: b.out >= OUT_CAP,
      status: statusKey(b),
      upCost, upStaff: Math.max(0, extra),
      money: E.deben >= upCost, hands: E.workersFree() >= extra, canUpgrade: E.canUpgrade(b),
      carrier: out ? E.carrierKind(b) : null, carriers: b.carriers.length,
      road: out && !d.boat ? (HEAVY.has(out) ? 'track' : 'path') : null, linked: !!b.linked,
      canAdd: E.canAddCarrier(b), addCost: out ? E.carrierCost(b) : 0, addMoney: out ? E.deben >= E.carrierCost(b) : false, addHands: E.workersFree() >= 1,
    };
  }

  _showBuilding(b) {
    const info = this._buildingInfo(b);
    const key = JSON.stringify(info);
    if (key !== this._sheetKey) { this._sheetKey = key; this.ui.openBuildingSheet(info); }
  }

  _siteInfo() {
    const S = this.eco.site, L = S.level;
    const up = SITE_UP[L - 1];
    return {
      level: L, need: this.eco.currentGood(), secs: Math.round(SITE_PLACE[L - 1] * 10) / 10 >= 2 ? Math.round(SITE_PLACE[L - 1]) : 2,
      block: S.inv.block, granite: this.L.graniteTiers ? S.inv.granite : null,
      brick: this.L.bricks ? S.inv.brick : null,
      ramp: this.L.bricks && S.ramp < this.sizes.length - 1 ? { laid: S.rampLaid, need: rampBricks(S.ramp + 1), active: S.ramp < Math.min(this.eco.currentTier(), this.sizes.length - 1) } : null,
      status: S.state === 'missing' && this.eco.placed < this.eco.total ? 'r_' + S.missing : null,
      upCost: up ? up.cost : 0, upStaff: up ? up.staff : 0,
      money: up ? this.eco.deben >= up.cost : false, hands: up ? this.eco.workersFree() >= up.staff : false, canUpgrade: this.eco.canUpgrade(S),
    };
  }
  _showSite() {
    const info = this._siteInfo();
    const key = JSON.stringify(info);
    if (key !== this._sheetKey) { this._sheetKey = key; this.ui.openSiteSheet(info); }
  }

  _closeSheet() { this.selected = null; this._sheetKey = null; this.ui.closeSheet(); }

  build(type) {
    if (!this.selected || !this.selected.plot || this.state !== 'play') return;
    const b = this.eco.build(type, this.selected.plot);
    if (!b) { this.audio.invalid(); this.ui.shakeCard(type); return; }
    this._handleEvents(this.eco.drain());
    this._closeSheet();
    this.advice = null;
    this._refreshMarkers();
    this._updateHud();
  }

  upgrade() {
    if (!this.selected || this.state !== 'play') return;
    if (this.selected.site) {
      if (!this.eco.upgrade(this.eco.site)) { this.audio.invalid(); this.ui.shakeCard(); return; }
      this._handleEvents(this.eco.drain()); this._sheetKey = null; this._showSite(); return;
    }
    const b = this.eco.buildings.find((x) => x.id === this.selected.building);
    if (!b || !this.eco.upgrade(b)) { this.audio.invalid(); this.ui.shakeCard(); return; }
    this._handleEvents(this.eco.drain());
    this._sheetKey = null;
    this._showBuilding(b);
    this._updateHud();
  }

  // ------------------------------------------------------------ roads
  _startRoadMode(tool = null) {
    if (this.state !== 'play') return;
    this._closeSheet();
    const t = tool || this.roadMode?.tool || this._lastTool || 'track';
    this.roadMode = { tool: t };
    this.ui.showRoadBar(t);
    this.ui.setUndo(this.eco.canUndo());
    this.world.showGrid(true, this.eco);
    this._refreshMarkers();
  }
  _endRoadMode() {
    if (!this.roadMode) return;
    this._lastTool = this.roadMode.tool;
    this.roadMode = null;
    this._cancelStroke();
    this.ui.hideRoadBar();
    this.world.showGrid(false);
    this._refreshMarkers();
  }

  // ---- road strokes: drag from a building (or tile) to another; the route is planned and previewed
  // with its price, releasing builds it. A tap paints one tile; the eraser removes tiles under the finger.
  _strokeStart(x, y) {
    const t = this.world.pickTile(x, y);
    if (!t) return;
    const E = this.eco, RM = this.roadMode;
    this.paint = { start: t, cur: t, plan: null, moved: false, erased: [], refund: 0, last: t };
    if (RM.tool === 'erase') { this._eraseTile(t.x, t.z); return; }
    // heavy goods leave quarries, masons, quays (and arrive at the site) only on sledge tracks
    const n = E.nodeAtTile(t.x, t.z);
    if (n && RM.tool === 'path' && (n.type === 'site' || HEAVY.has(goodOf(n.type) || '') || n.type === 'mason')) { RM.tool = 'track'; this.ui.showRoadBar('track'); }
  }

  _strokeMove(x, y) {
    const P = this.paint, RM = this.roadMode;
    const t = this.world.pickTile(x, y);
    if (!t) return;
    if (RM.tool === 'erase') {
      // walk tile by tile so a fast swipe does not skip tiles
      let cx = P.last.x, cz = P.last.z;
      while (cx !== t.x || cz !== t.z) {
        if (Math.abs(t.x - cx) >= Math.abs(t.z - cz)) cx += Math.sign(t.x - cx); else cz += Math.sign(t.z - cz);
        this._eraseTile(cx, cz);
      }
      P.last = t;
      return;
    }
    if (t.x === P.cur.x && t.z === P.cur.z && P.moved) { this.ui.showRoadCost(x, y, P.plan ? P.plan.price : 0, !P.plan || P.plan.price <= this.eco.deben); return; }
    P.cur = t; P.moved = true;
    P.plan = this.eco.planRoad(P.start, t, TOOL_TYPE[RM.tool]);
    const ok = !!P.plan && P.plan.price <= this.eco.deben;
    this.world.setPreview(P.plan ? P.plan.route : null, ok);
    if (P.plan) this.ui.showRoadCost(x, y, P.plan.price, ok); else this.ui.hideRoadCost();
  }

  _strokeEnd(x, y) {
    const P = this.paint, E = this.eco, RM = this.roadMode;
    this.paint = null;
    this.world.setPreview(null);
    this.ui.hideRoadCost();
    if (!P || !RM) return;
    if (RM.tool === 'erase') {
      if (P.erased.length) E.undoStack.push({ tiles: P.erased, spent: -P.refund });
    } else if (!P.moved) {
      const r = E.placeRoadStep(P.start.x, P.start.z, TOOL_TYPE[RM.tool]);
      if (r > 0) { this.world.roadFx(P.start.x, P.start.z, RM.tool); this._sfx('road'); }
      else if (r === -2) { this.world.roadFx(P.start.x, P.start.z, 'bad'); this._sfx('poor'); this.ui.flashRoadCost(RM.tool); this.ui.shakeHud(); }
      else if (r === -1) this.world.roadFx(P.start.x, P.start.z, 'bad');
    } else if (P.plan) {
      if (P.plan.price > E.deben) { for (const i of P.plan.todo) this.world.roadFx(Math.floor(i / 35) - 17, (i % 35) - 17, 'bad'); this._sfx('poor'); this.ui.flashRoadCost(RM.tool); this.ui.shakeHud(); }
      else {
        const spent = E.buildPlanned(P.plan, TOOL_TYPE[RM.tool]);
        // the new road is laid from start to end in a quick wave of dust
        P.plan.route.forEach((i, k) => this.later(k * 25, () => this.world.roadFx(Math.floor(i / 35) - 17, (i % 35) - 17, RM ? RM.tool : 'path')));
        if (spent > 0) { this.audio.place(true); this.ui.popup(x, y - 50, spent, { icon: 'r_deben', size: 18, prefix: 'x' }); }
        const linked = P.plan.from && P.plan.to;
        if (linked) this.later(Math.min(900, P.plan.route.length * 25), () => this.audio.ankh());
      }
    }
    this.ui.setUndo(E.canUndo());
    this._updateHud();
  }

  _cancelStroke() { if (this.paint) { this.paint = null; this.world.setPreview(null); this.ui.hideRoadCost(); } }

  _eraseTile(x, z) {
    const E = this.eco, before = E.grid.get(x, z);
    if (!before) return;
    const deben0 = E.deben;
    if (E.eraseRoad(x, z)) {
      this.paint.erased.push([x, z, before]); this.paint.refund += E.deben - deben0;
      this.world.roadFx(x, z, 'erase'); this._sfx('erase');
    }
  }

  _undoRoad() {
    if (!this.roadMode) return;
    const step = this.eco.undoRoad();
    if (!step) { this.audio.invalid(); return; }
    for (const [x, z] of step.tiles) this.world.roadFx(x, z, 'erase');
    this.audio.shuffle();
    this.ui.setUndo(this.eco.canUndo());
    this._updateHud();
  }

  _sfx(kind) {
    const now = performance.now();
    this._sfxT = this._sfxT || {};
    if (now - (this._sfxT[kind] || 0) < (kind === 'poor' ? 600 : 70)) return;
    this._sfxT[kind] = now;
    if (kind === 'road') this.audio.place(true);
    else if (kind === 'erase') this.audio.shuffle();
    else this.audio.invalid();
  }

  _addCarrier() {
    const b = this.selected?.building && this.eco.buildings.find((x) => x.id === this.selected.building);
    if (!b || !this.eco.addCarrier(b)) { this.audio.invalid(); this.ui.shakeCard('carrier'); return; }
    this._handleEvents(this.eco.drain());
    this.audio.button();
    this._sheetKey = null;
    this._showBuilding(b);
    this._updateHud();
  }

  // ------------------------------------------------------------ camera input: drag to pan, pinch to zoom, tap to select
  _pdown(e) {
    if (this.state !== 'play') return;
    this.audio.unlock();
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y); this.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      a.moved = b.moved = true;
      this._cancelStroke();
    } else if (this.roadMode && this.pointers.size === 1) {
      this._strokeStart(e.clientX, e.clientY);
    }
  }

  _pmove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (this.pointers.size >= 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.pinch && d > 10) this.world.zoom(this.pinch / d);
      if (this.mid) {
        const m0 = this.world.screenToPlane(this.mid.x, this.mid.y, 0), m1 = this.world.screenToPlane(mid.x, mid.y, 0);
        if (m0 && m1) this.world.pan(m0.x - m1.x, m0.z - m1.z);
      }
      this.pinch = d; this.mid = mid;
      return;
    }
    if (this.paint) { this._strokeMove(e.clientX, e.clientY); p.x = e.clientX; p.y = e.clientY; p.moved = true; return; }
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
    if (this.pointers.size < 2) { this.pinch = null; this.mid = null; }
    if (this.paint && this.pointers.size === 0) { this._strokeEnd(e.clientX, e.clientY); return; }
    if (!p || p.moved || this.state !== 'play' || this.roadMode) return;
    if (performance.now() - p.t0 > 600) return;
    const hit = this._pick(e.clientX, e.clientY);
    if (hit?.site) this._openSite();
    else if (hit?.plot) this._openPlot(hit.plot);
    else if (this.selected) this._closeSheet();
  }

  // ------------------------------------------------------------ win / lose
  async levelComplete() {
    this.state = 'finale';
    this._closeSheet();
    this._endRoadMode();
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
    this._endRoadMode();
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
    const r = { worker: E.workersFree(), bread: E.pantry.bread, block: E.site.inv.block, granite: E.site.inv.granite, brick: E.site.inv.brick };
    this.ui.setResources(r, this.resVisible);
    this.ui.flagRes('bread', E.hungryShare() > 0);
    this.ui.flagRes('worker', E.workersFree() <= 0);
    this.ui.flagRes('block', E.site.state === 'missing' && E.site.missing === 'block' && E.placed < E.total);
    this.ui.flagRes('granite', E.site.state === 'missing' && E.site.missing === 'granite' && E.placed < E.total);
    this.ui.flagRes('brick', E.site.state === 'missing' && E.site.missing === 'brick' && E.placed < E.total);
    const left = Math.max(0, this.L.deadline - E.time);
    const frac = left / this.L.deadline;
    this.ui.setTime(frac, frac < 0.2);
    this.world.setDaylight(1 - frac);
    document.getElementById('skyTint').style.opacity = ((1 - frac) * 0.7).toFixed(3);
    for (const th of [0.25, 0.1]) if (frac < th && !this.warned[th]) { this.warned[th] = true; this.world.pharaohStomp(); this.audio.tick(true); }
    if (this.selected?.plot) this._showBuildMenu();
    else if (this.selected?.site) this._showSite();
    else if (this.selected?.building) { const b = E.buildings.find((x) => x.id === this.selected.building); if (b) this._showBuilding(b); }
  }

  // light hints after the tutorial: the ramp needs mud bricks and nobody makes them yet
  _hints() {
    const E = this.eco, S = E.site;
    const need = this.L.bricks && S.state === 'missing' && S.missing === 'brick' && !E.buildings.some((b) => b.type === 'brickworks');
    if (!need || this.roadMode) { if (this._hint) { this._hint = null; this.advice = null; this.ui.hideHand(); this._refreshMarkers(); } return; }
    const plot = PLOTS.filter((p) => p.terrain === 'desert' && E.plotFree(p.id)).sort((a, b) => Math.hypot(a.x - S.x, a.z - S.z) - Math.hypot(b.x - S.x, b.z - S.z))[0];
    if (!plot) return;
    this._hint = 'brick';
    if (!this.advice || this.advice.plot !== plot.id) { this.advice = { plot: plot.id }; this._refreshMarkers(); }
    let at;
    if (this.selected?.plot === plot.id) { const el = document.querySelector('[data-type="brickworks"]'); if (el) { const r = el.getBoundingClientRect(); at = { x: r.left + r.width / 2, y: r.top + r.height * 0.6 }; } }
    else if (!this.ui.sheetOpen) at = this.world.worldToScreen(this.world.plotViews[plot.id].pos.clone().setY(0.4));
    if (!at) { this.ui.hideHand(); return; }
    this.ui.handAt(at.x, at.y + 8 + Math.abs(Math.sin(performance.now() / 260)) * 12, 'b_brickworks');
  }

  // first-level guide: points at the next step (deposit, building card, road tool, road to paint)
  _advisorStep() {
    const E = this.eco;
    const any = (t) => E.buildings.find((b) => b.type === t);
    const built = (t) => E.buildings.find((b) => b.type === t && b.built);
    const linked = (ft, tt) => { const f = built(ft); return !!f && E.reachable(f).some((x) => (tt === 'site' ? x.n.type === 'site' : x.n.type === tt)); };
    // free plot of a terrain closest to some anchor nodes (sum of distances)
    const plotFor = (terrain, ...ns) => {
      const d = (p) => ns.filter(Boolean).reduce((s, n) => s + Math.hypot(p.x - n.x, p.z - n.z), 0);
      return PLOTS.filter((p) => p.terrain === terrain && E.plotFree(p.id)).sort((a, c) => d(a) - d(c))[0]?.id;
    };
    let goal = null;
    if (!any('quarry')) goal = { build: 'quarry', plot: plotFor('limestone', E.site) };
    else if (!any('mason')) goal = { build: 'mason', plot: plotFor('desert', any('quarry'), E.site) };
    else if (!linked('quarry', 'mason')) goal = built('quarry') && built('mason') ? { road: ['quarry', 'mason', 'track'] } : { wait: true };
    else if (!linked('mason', 'site')) goal = { road: ['mason', 'site', 'track'] };
    else if (E.workersFree() < 2 && E.buildings.filter((b) => b.type === 'house').length < 2) goal = { build: 'house', plot: plotFor('desert', any('house') || E.site) };
    else if (!any('farm')) goal = { build: 'farm', plot: plotFor('fertile', E.site) };
    else if (!any('bakery')) goal = { build: 'bakery', plot: plotFor('desert', any('farm'), any('house')) };
    else if (!linked('farm', 'bakery')) goal = built('farm') && built('bakery') ? { road: ['farm', 'bakery', 'path'] } : { wait: true };
    else if (!linked('bakery', 'house')) goal = { road: ['bakery', 'house', 'path'] };
    else { this.advisor = null; this.advice = null; this.save.tut = true; writeSave(this.save); this.ui.hideHand(); this.world.setGhost(null); this._refreshMarkers(); return; }
    const domAt = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height * 0.6 } : null; };
    const tileAt = (i) => this.world.worldToScreen(new THREE.Vector3(Math.floor(i / 35) - 17, 0.05, (i % 35) - 17));
    let at = null, icon = null, world = false;
    if (!goal.road) { if (this.advisor.ghostKey) { this.advisor.ghostKey = null; this.world.setGhost(null); } }
    if (goal.wait) { this.ui.hideHand(); return; }
    if (goal.road) {
      const [ft, tt, tool] = goal.road;
      const from = built(ft), to = tt === 'site' ? E.site : built(tt);
      if (!from || !to) { this.ui.hideHand(); return; }
      const key = `${from.id}>${to.id}:${tool}:${E.topo}`;
      if (this.advisor.ghostKey !== key) {
        this.advisor.ghostKey = key;
        this.advisor.ghost = E.suggestRoad(from.id, to.id, TOOL_TYPE[tool]) || [];
        this.world.setGhost(this.advisor.ghost);
      }
      icon = 't_' + tool;
      const g = this.advisor.ghost;
      if (this.ui.sheetOpen) { this._closeSheet(); return; }
      if (!this.roadMode) at = domAt('#btnRoad');
      else if (this.roadMode.tool !== tool) at = domAt(`[data-tool="${tool}"]`);
      else if (g.length) {
        // the finger traces the suggested road, tile by tile
        const k = Math.floor(performance.now() / 260) % (g.length + 3);
        at = tileAt(g[Math.min(k, g.length - 1)]);
        icon = null; world = true;
        if (this.paint) { this.ui.hideHand(); return; }
      }
      if (this.advice) { this.advice = null; this._refreshMarkers(); }
    } else {
      icon = 'b_' + goal.build;
      if (!goal.plot) { this.ui.hideHand(); return; }
      if (this.roadMode) at = domAt('#roadDone');
      else if (this.selected?.plot === goal.plot) at = domAt(`[data-type="${goal.build}"]`);
      else { at = this.world.worldToScreen(this.world.plotViews[goal.plot].pos.clone().setY(0.4)); world = true; }
      if (!this.advice || this.advice.plot !== goal.plot) { this.advice = { plot: goal.plot }; this._refreshMarkers(); }
    }
    if (!at) { this.ui.hideHand(); return; }
    // a world target off screen: bring it into view first
    if (world && (at.x < 36 || at.x > this.vw - 36 || at.y < this.freeTop + 20 || at.y > this.freeBottom - 50)) {
      const tgt = goal.road ? (() => { const i = this.advisor.ghost[Math.floor(this.advisor.ghost.length / 2)]; return { x: Math.floor(i / 35) - 17, z: (i % 35) - 17 }; })() : this.world.plotViews[goal.plot].pos;
      this.world.focusOn(tgt);
    }
    // a target hidden behind an open panel: close the panel so the next step can be tapped
    const sheet = document.getElementById('sheet');
    if (world && this.ui.sheetOpen && at.y > sheet.getBoundingClientRect().top - 8) { this._closeSheet(); return; }
    const bob = icon ? Math.abs(Math.sin(performance.now() / 260)) * 12 : 0;
    this.ui.handAt(at.x, at.y + 8 + bob, icon);
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
      if (this._hudT <= 0) { this._hudT = 0.15; this._updateHud(); }
      if (this._bubT <= 0) {
        this._bubT = 0.25;
        for (const b of this.eco.buildings) this.world.setBubble(b, statusKey(b));
        const S = this.eco.site;
        this.world.setSiteBubble(S.state === 'missing' && this.eco.placed < this.eco.total && this.eco.time > 20 ? 'r_' + S.missing : null);
      }
      if (!this.advisor) this._hints();
      if (this.advisor) this._advisorStep();
      if (this.eco.done()) this.levelComplete();
      else if (this.eco.time >= this.L.deadline) this.lose();
    }
    if (!menu && this.eco) {
      this.world.tempo = Math.max(0.4, this.eco.productivity());
      this.world.syncRoads(this.eco);
      this.world.syncCarriers(this.eco, gdt);
      const S = this.eco.site, good = this.eco.currentGood();
      this.world.updateSite({ working: S.state === 'work' && this.eco.placed < this.eco.total, frac: S.placeT / SITE_PLACE[S.level - 1], stock: S.inv, good,
        tier: this.eco.currentTier(), ramp: this.eco.rampLevel(), state: S.state }, gdt);
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
