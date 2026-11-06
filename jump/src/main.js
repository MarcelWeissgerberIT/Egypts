// Purpurpyramide: a touch platformer through 100 chambers of a giant pyramid.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { generateLevel, levelInfo, WORLDS } from './levels.js';
import { Sim } from './sim.js';
import { Stage } from './render.js';
import { UI, digitsHTML } from './ui.js';
import { Input } from './input.js';
import { Sfx } from './sfx.js';

const SAVE = 'purpurpyramide-v1';
const LEVELS = 100;
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s && Array.isArray(s.eyes)) return s; } catch (e) { /* storage unavailable */ }
  return { unlocked: 1, eyes: [], coins: [], tablets: [], powers: {}, muted: false };
}
function writeSave(s) { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch (e) { /* ignore */ } }

async function loadAssets(onProgress) {
  const tl = new THREE.TextureLoader();
  const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
  const assets = { tex: {}, models: {}, img: {}, bg: {} };
  const tex = { sandstone: 'tex/sandstone.jpg', granite: 'tex/granite.jpg', hiero: 'tex/hiero.jpg', water: 'tex/water.jpg', sand: 'tex/sand.jpg', dust: 'tex/dust.webp' };
  const models = ['explorer', 'anim_run', 'anim_jump', 'anim_fall', 'anim_climb', 'anim_swim', 'anim_hit', 'anim_cheer', 'obelisk', 'worker_lp', 'anim_lp_walk'];
  const tex3d = ['icon_scarab', 'papyrus', 'icon_ankh', 'sparkle'];
  const total = Object.keys(tex).length + models.length + tex3d.length + 10;
  let done = 0; const tick = () => onProgress(++done / total);
  const jobs = [];
  for (const [k, f] of Object.entries(tex)) jobs.push(tl.loadAsync('assets/' + f).then((t) => { t.colorSpace = THREE.SRGBColorSpace; assets.tex[k] = t; }).catch(() => { assets.tex[k] = new THREE.Texture(); }).then(tick));
  for (let w = 1; w <= 10; w++) jobs.push(tl.loadAsync(`assets/bg/w${w}.jpg`).then((t) => { t.colorSpace = THREE.SRGBColorSpace; assets.bg[w] = t; }).catch(() => {}).then(tick));
  const loadModel = async (m) => {
    if (!window.__B64_MODELS) return gl.loadAsync(`assets/models/${m}.glb`);
    const txt = await (await fetch(`assets/models/${m}.glb.txt`)).text();
    const raw = atob(txt.trim()); const bin = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
    return gl.parseAsync(bin.buffer, 'assets/models/');
  };
  for (const m of models) jobs.push(loadModel(m).then((g) => { assets.models[m] = g; }).catch(() => {}).then(tick));
  for (const n of tex3d) jobs.push(tl.loadAsync(`assets/ui/${n}.webp`).then((t) => { t.colorSpace = THREE.SRGBColorSpace; assets.img[n + 'Tex'] = t; if (n === 'sparkle') assets.img.sparkleTex = t; }).catch(() => {}).then(tick));
  await Promise.all(jobs);
  return assets;
}

class Game {
  constructor() {
    this.app = document.getElementById('app');
    this.save = loadSave();
    this.sfx = new Sfx(); this.sfx.muted = !!this.save.muted;
    this.state = 'loading';
  }

  async boot() {
    this.ui = new UI(this.app);
    this.ui.setSound(!this.save.muted);
    this.assets = await loadAssets((p) => this.ui.setLoad(p));
    this.stage = new Stage(document.getElementById('gl'), this.assets);
    this.input = new Input(this.app, this.ui);
    this._wire();
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 300));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(); });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    const unlock = () => { this.sfx.unlock(); if (this.state !== 'loading') this.sfx.playMusic(); };
    document.addEventListener('touchend', unlock, { passive: true });
    document.addEventListener('click', unlock);
    this._resize();
    this.last = performance.now();
    requestAnimationFrame((t) => this._frame(t));
    this.state = 'title'; this.ui.show('sTitle');
  }

  _wire() {
    const ui = this.ui, click = () => this.sfx.button();
    ui.on('start', () => { this.sfx.unlock(); this.sfx.playMusic(); click(); this.openMap(); });
    ui.on('sound', () => { this.sfx.unlock(); this.save.muted = !this.save.muted; writeSave(this.save); this.sfx.setMuted(this.save.muted); ui.setSound(!this.save.muted); click(); if (!this.save.muted) this.sfx.playMusic(); });
    ui.on('title', () => { click(); this.state = 'title'; ui.show('sTitle'); });
    ui.on('map', () => { click(); this.openMap(); });
    ui.on('openWorld', (w) => { click(); this.openWorld(w); });
    ui.on('continue', () => { click(); this.startLevel(Math.min(LEVELS, this.save.unlocked)); });
    ui.on('world', () => { click(); this.openWorld(this.world || 1); });
    ui.on('play', (n) => { click(); this.startLevel(n); });
    ui.on('pause', () => { if (this.state === 'play') { click(); this.pause(); } });
    ui.on('resume', () => { click(); this.resume(); });
    ui.on('restart', () => { click(); this.startLevel(this.n); });
    ui.on('next', () => { click(); this.afterWin(); });
    ui.on('tablet', () => { if (this.save.tablets[this.world - 1]) { click(); this.storyBack = 'world'; this.ui.showStory(this.world); this.sfx.secret(); } else this.sfx.invalid(); });
    ui.on('storyDone', () => { click(); if (this.storyBack === 'next') this._continue(); else this.openWorld(this.world); });
    ui.on('powerDone', () => { click(); this._beginPlay(); });
  }

  _resize() { const w = window.innerWidth, h = window.innerHeight; this.stage.resize(w, h); this.ui.inGame(this.state === 'play' || this.state === 'pause'); }

  openMap() {
    this.state = 'map'; this.ui.inGame(false);
    const worlds = Math.min(10, Math.floor((this.save.unlocked - 1) / 10) + 1);
    this.ui.buildMap(this.save, worlds);
    this.ui.show('sMap');
  }
  openWorld(w) {
    this.world = w; this.state = 'world'; this.ui.inGame(false);
    this.ui.buildWorld(w, this.save, this.save.unlocked);
    this.ui.show('sWorld');
  }

  startLevel(n) {
    this.n = n;
    const { world } = levelInfo(n);
    this.world = world;
    this.L = generateLevel(n);
    this.sim = new Sim(this.L);
    this.stage.load(this.L, this.sim);
    this.ui.setLevel(n);
    this.ui.setCoins(0); this.ui.setPapyri([false, false, false]); this.ui.setHearts(3, 3);
    this.ui.show(null);
    this.input.reset();
    this.acc = 0;
    this._jumped = false; this._hint = null; this.ui.hint(null);
    // new powers are presented once
    const power = world === 8 && !this.save.powers.double ? 'double' : world === 9 && !this.save.powers.wall ? 'wall' : null;
    if (power) { this.save.powers[power] = true; writeSave(this.save); this.state = 'power'; this.ui.showPower(power); this.sfx.secret(); return; }
    this._beginPlay();
  }
  _beginPlay() { this.state = 'play'; this.ui.show(null); this.ui.inGame(true); this.input.enabled = true; this.last = performance.now(); }

  pause() { this.state = 'pause'; this.input.enabled = false; this.input.reset(); this.ui.show('sPause'); }
  resume() { this.ui.show(null); this.state = 'play'; this.input.enabled = true; this.last = performance.now(); }

  _events(evts) {
    const S = this.sim, st = this.stage;
    for (const e of evts) {
      st.onEvent(e);
      switch (e.type) {
        case 'jump': this.sfx.jump(); this._jumped = true; break;
        case 'djump': case 'walljump': this.sfx.djump(); break;
        case 'land': if (e.v > 10) this.sfx.land(); break;
        case 'coin': this.sfx.coin(); this.ui.bumpCoins(); break;
        case 'papyrus': this.sfx.secret(); this.ui.bumpPapyrus(e.id); this.ui.flash(); break;
        case 'heal': this.sfx.ankh(); break;
        case 'stomp': case 'stompHit': this.sfx.stomp(); break;
        case 'hurt': this.sfx.hurt(); break;
        case 'die': this.sfx.loseLife(); break;
        case 'splash': case 'swim': this.sfx.splash(); break;
        case 'break': this.sfx.crack(); if (this.hintsDone) this.hintsDone['action' + this.n] = true; break;
        case 'crumble': this.sfx.rumble(); break;
        case 'dart': if (Math.abs(e.x - S.p.x) < 14) this.sfx.dart(); break;
        case 'slam': if (Math.abs(e.x - S.p.x) < 12) this.sfx.slam(); break;
        case 'hiss': this.sfx.hiss(); break;
        case 'boulder': this.sfx.rumble(); this.sfx.slam(); break;
        case 'checkpoint': this.sfx.ankh(); break;
        case 'win': this.sfx.door(); this.later(600, () => this.sfx.fanfare()); this._won(); break;
        default: break;
      }
    }
  }

  // the first levels teach the controls with a hand: move, jump, break cracked stones, climb ladders
  _hints(near) {
    const S = this.sim, p = S.p, H = this.hintsDone || (this.hintsDone = {});
    let kind = null;
    if (this.n <= 2) {
      if (!H.move && p.x - S.L.spawn.x > 3) H.move = true;
      if (!H.jump && this._jumped) H.jump = true;
      if (!H.move && S.time > 1.2) kind = 'move';
      else if (!H.jump && H.move && S.time > 2) kind = 'jump';
    }
    if (!kind && near && !H['action' + this.n]) kind = 'action';
    if (!kind && S.tile(p.x, p.y + 0.5) === 4 && !p.climb && !H.climb) kind = 'climb';
    if (p.climb) H.climb = true;
    if (this._hint !== kind) { this._hint = kind; this.ui.hint(kind); }
  }

  later(ms, fn) { const n = this.n, s = this.sim; setTimeout(() => { if (this.sim === s && this.n === n) fn(); }, ms); }

  _won() {
    const S = this.sim, n = this.n;
    const eyes = S.found.filter(Boolean).length;
    this.save.eyes[n - 1] = Math.max(this.save.eyes[n - 1] || 0, eyes);
    this.save.coins[n - 1] = Math.max(this.save.coins[n - 1] || 0, S.coins);
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(LEVELS, n + 1));
    const { world, index } = levelInfo(n);
    this.revealed = index === 10 && !this.save.tablets[world - 1];
    if (index === 10) this.save.tablets[world - 1] = true;
    writeSave(this.save);
    this.input.enabled = false; this.input.reset();
    this.state = 'won'; this.ui.hint(null);
    this.later(2200, () => { this.ui.inGame(false); this.ui.showWin(eyes, S.coins, n < LEVELS); });
  }

  afterWin() {
    if (this.revealed) { this.revealed = false; this.storyBack = 'next'; this.ui.showStory(this.world); this.sfx.secret(); return; }
    this._continue();
  }
  _continue() { if (this.n < LEVELS) this.startLevel(this.n + 1); else this.openMap(); }

  _frame(t) {
    requestAnimationFrame((tt) => this._frame(tt));
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (!this.stage) return;
    let gdt = 0;
    if ((this.state === 'play' || this.state === 'won') && this.sim) {
      // fixed 120 Hz physics steps for consistent jumps on every device
      this.acc += dt;
      const h = 1 / 120;
      while (this.acc >= h) { this.sim.step(h, this.input.take()); this.acc -= h; }
      gdt = dt;
      this._events(this.sim.drain());
      const S = this.sim;
      this.ui.setCoins(S.coins); this.ui.setPapyri(S.found); this.ui.setHearts(Math.max(0, S.hearts), S.maxHearts);
      // the action button glows next to a cracked stone
      const p = S.p; let near = false;
      for (let dx = -1; dx <= 1 && !near; dx++) for (let dy = -1; dy <= 1; dy++) if (S.tile(p.x + dx, p.y + 0.5 + dy) === 8) { near = true; break; }
      this.ui.glowAction(near);
      this._hints(near);
    }
    if (this.sim && this.state !== 'title' && this.state !== 'map' && this.state !== 'world' && this.state !== 'loading') this.stage.update(dt, this.state === 'pause' || this.state === 'power' ? 0 : gdt || dt * 0);
    else if (this.sim && (this.state === 'world' || this.state === 'map')) { /* keep the last frame */ }
  }
}

const game = new Game();
window.__game = game;
game.boot();
export { digitsHTML, WORLDS };
