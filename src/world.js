// The isometric 3D diorama for the pyramid works: floating desert island, Nile, deposits, Meshy
// buildings on their plots, roads painted tile by tile, carriers walking them, the growing pyramid.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PLOTS, DECOR, PALMS, DAIS, ALTAR, siteLayout, N, SIZE, RIVER } from './map.js';

export const H = 0.62;        // pyramid block / tier height
export const FOUND = 0.16;    // foundation plate height
const ISLAND = 18;            // island half size
const EL = THREE.MathUtils.degToRad(44);
const AZ = Math.PI / 4;
const BUILD_SIZE = 2.4;       // building footprint (world units) inside its 3x3 tile plot
const WORKER_H = 1.18;        // labourer height
const HEAVY_GOODS = new Set(['stone', 'block', 'granite']);
// labourers working at each building: offset in world tiles from the plot centre, clip, hand tool.
// The free corners of the 3x3 plot: front (+x,+z), left (-x,+z), right (+x,-z)
const JOBS = {
  quarry: [{ o: [1.05, 1.05], anim: 'Hammer', prop: 'mallet' }, { o: [-1.1, 1.0], anim: 'Pick' }],
  mason: [{ o: [1.05, 1.05], anim: 'Chop', prop: 'chisel' }],
  farm: [{ o: [1.0, 1.1], anim: 'Reap', prop: 'sickle' }, { o: [-1.1, 0.9], anim: 'Pick' }],
  bakery: [{ o: [1.05, 1.05], anim: 'Place' }],
  smithy: [{ o: [1.05, 1.05], anim: 'Hammer', prop: 'mallet' }],
  mine: [{ o: [1.05, 1.05], anim: 'Pick' }, { o: [-1.1, 1.0], anim: 'Hammer', prop: 'mallet' }],
  granite: [{ o: [1.05, 1.05], anim: 'Hammer', prop: 'mallet' }, { o: [-1.1, 1.0], anim: 'Chop', prop: 'chisel' }],
  quay: [{ o: [1.05, 1.05], anim: 'Pick' }],
  house: [{ o: [1.05, 1.05], anim: 'Talk' }],
};
const PILE = [1.15, -1.0];    // where a building stacks its finished goods (right corner)
// how fast the labourer's walk cycle covers ground at time scale 1 (world units per second)
const WALK_NATURAL = 0.62, PUSH_NATURAL = 0.45, CARRY_NATURAL = 0.55;

const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// screen-aligned island coordinates -> world. u: right on screen, v: back (up on screen)
export function uv(u, v) { return new THREE.Vector3((u - v) / Math.SQRT2, 0, (-u - v) / Math.SQRT2); }
export function toUV(p) { return { u: (p.x - p.z) / Math.SQRT2, v: -(p.x + p.z) / Math.SQRT2 }; }
function faceDir(dx, dz) { return Math.atan2(dx, dz); }
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Actor {
  constructor(root, clips) {
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const [name, clip] of Object.entries(clips)) this.actions[name] = this.mixer.clipAction(clip);
    this.current = null;
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.onceAction && this.after) { const a = this.after; this.after = null; this.play(a); }
    });
  }
  play(name, { fade = 0.3, once = false, after = null, speed = 1 } = {}) {
    const a = this.actions[name];
    if (!a) return;
    if (this.current === a && !once) return;
    a.reset();
    a.setEffectiveTimeScale(speed);
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    else a.fadeIn(fade);
    a.play();
    this.current = a;
    if (once) { this.onceAction = a; this.after = after; }
  }
  stopAll() { this.mixer.stopAllAction(); this.current = null; this.onceAction = null; this.after = null; }
  setSpeed(k) { if (this.current) this.current.setEffectiveTimeScale(k); }
  update(dt) { this.mixer.update(dt); }
}

export class World {
  constructor(canvas, assets) {
    this.assets = assets;
    this.canvas = canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;

    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
    this.cam = { az: AZ, el: EL, W: 17, target: new THREE.Vector3(0, 0.5, 0) };
    this.camGoal = { az: AZ, W: 17 };
    this.orbit = false;
    this.shake = 0;

    this.time = 0;
    this.actors = [];
    this.anims = [];
    this.updaters = [];
    this.iconTex = {};
    this.bviews = new Map();
    this.carrierViews = new Map();
    this.cheerT = 0;

    this._lights();
    this._island();
    this._nile();
    this._plots();
    this._decor();
    this._characters();
    this._particles();
    this._roadSetup();
    this._pyramidSetup();
    this._siteSetup();
    this.resize();
  }

  // ------------------------------------------------------------------ setup
  _lights() {
    this.hemi = new THREE.HemisphereLight(0x9d82ff, 0xe0a46a, 0.95);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffe6c0, 2.55);
    sun.position.set(-11, 17, -3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 70;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun); this.scene.add(sun.target);
    this.sun = sun;
    const rim = new THREE.DirectionalLight(0xb48cff, 0.75);
    rim.position.set(9, 6, 11);
    this.scene.add(rim);
  }

  _tex(name, repeat = 1) {
    const t = this.assets.tex[name].clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  _island() {
    const g = new THREE.Group();
    const top = new THREE.MeshStandardMaterial({ map: this._tex('sand', 14), roughness: 0.95, color: 0xf6dcc2 });
    const side = this._tex('strata', 1); side.repeat.set(6, 1);
    const sideM = new THREE.MeshStandardMaterial({ map: side, roughness: 1 });
    const bottom = new THREE.MeshStandardMaterial({ color: 0x3a2350, roughness: 1 });
    const thick = 3.2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(ISLAND * 2, thick, ISLAND * 2), [sideM, sideM, top, bottom, sideM, sideM]);
    box.position.y = -thick / 2;
    box.receiveShadow = true;
    g.add(box);
    const rootM = new THREE.MeshStandardMaterial({ map: (() => { const t = this._tex('strata', 1); t.repeat.set(4, 2); return t; })(), roughness: 1, flatShading: true });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(ISLAND * 1.32, 16, 4, 3), rootM);
    cone.rotation.y = Math.PI / 4; cone.rotation.x = Math.PI;
    cone.position.y = -thick - 8;
    g.add(cone);
    for (let i = 0; i < 7; i++) {
      const s = 2 + Math.random() * 3;
      const c = new THREE.Mesh(new THREE.ConeGeometry(s, s * 2.5, 5, 1), rootM);
      const a = Math.random() * Math.PI * 2, r = ISLAND * (0.5 + Math.random() * 0.6);
      c.position.set(Math.cos(a) * r, -thick - s * 1.2, Math.sin(a) * r);
      c.rotation.x = Math.PI; c.rotation.y = Math.random() * 3;
      g.add(c);
    }
    // a few weathered boulders out on the island edges (outside the play area)
    const rockM = new THREE.MeshStandardMaterial({ map: this._tex('bedrock', 1), color: 0xe8c9a8, roughness: 0.9, flatShading: true });
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 40; i++) {
      const x = -17 + rnd() * 34, z = -17 + rnd() * 34;
      if (Math.abs(x - z) < 17 || -(x + z) / Math.SQRT2 > RIVER.near - 1) continue;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + rnd() * 0.8, 0), rockM);
      r.position.set(x, 0.1, z);
      r.scale.y = 0.55 + rnd() * 0.4; r.rotation.set(rnd(), rnd() * 3, rnd());
      r.castShadow = r.receiveShadow = true;
      g.add(r);
    }
    // soft dunes
    const duneM = new THREE.MeshStandardMaterial({ map: this._tex('sand', 3), roughness: 1 });
    for (const [x, z, r] of [[14, -13, 3], [-13, 14, 3], [16, -6, 2.2], [-6, 16, 2.2]]) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), duneM);
      d.scale.set(1.6, 0.32, 1); d.rotation.y = Math.random() * Math.PI;
      d.position.set(x, -0.05, z); d.receiveShadow = true;
      g.add(d);
    }
    this.scene.add(g);
  }

  _nile() {
    const len = 60, wid = 3.4, v = 16.2;
    const water = this._tex('water', 1); water.repeat.set(len / 5, 1);
    const alphaTex = (soft) => {
      const t = canvasTex(4, 64, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#000'); gr.addColorStop(soft, '#fff'); gr.addColorStop(1 - soft, '#fff'); gr.addColorStop(1, '#000');
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
      });
      t.colorSpace = THREE.NoColorSpace;
      return t;
    };
    const mat = new THREE.MeshStandardMaterial({ map: water, alphaMap: alphaTex(0.18), transparent: true, roughness: 0.15, metalness: 0.1, emissive: 0x2a1060, emissiveIntensity: 0.35, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(len, wid), mat);
    plane.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(plane);
    holder.rotation.y = Math.PI / 4;
    holder.position.copy(uv(0, v)); holder.position.y = 0.03;
    this.scene.add(holder);
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(len, wid + 1.4), new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }));
    bank.rotation.x = -Math.PI / 2; bank.position.y = -0.01;
    holder.add(bank);
    // flood: the Nile rises over the fertile bank
    const floodWater = this._tex('water', 1); floodWater.repeat.set(len / 5, 2);
    this.floodMat = new THREE.MeshStandardMaterial({ map: floodWater, alphaMap: alphaTex(0.3), transparent: true, opacity: 0, roughness: 0.15, emissive: 0x3a1680, emissiveIntensity: 0.4, depthWrite: false });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(len, 9), this.floodMat);
    fl.rotation.x = -Math.PI / 2;
    const fh = new THREE.Group(); fh.add(fl);
    fh.rotation.y = Math.PI / 4; fh.position.copy(uv(0, 13.2)); fh.position.y = 0.32;
    fl.renderOrder = 3;
    this.scene.add(fh);
    this.floodLevel = 0; this.floodGoal = 0;
    this.updaters.push((dt) => {
      water.offset.x -= dt * 0.05; floodWater.offset.x -= dt * 0.08;
      this.floodLevel += (this.floodGoal - this.floodLevel) * Math.min(1, dt * 1.5);
      const pulse = this.floodWarn ? 0.15 + Math.sin(this.time * 6) * 0.1 : 0;
      this.floodMat.opacity = Math.max(pulse, this.floodLevel * 0.85);
      fh.position.y = 0.05 + this.floodLevel * 0.35;
    });
    // waterfalls at the island edges
    const fallTex = this._tex('water', 1); fallTex.repeat.set(1, 3);
    const fallM = new THREE.MeshStandardMaterial({ map: fallTex, transparent: true, opacity: 0.9, emissive: 0x5a2aa0, emissiveIntensity: 0.4, side: THREE.DoubleSide, depthWrite: false });
    for (const s of [-1, 1]) {
      let e = null;
      for (let u = 0; Math.abs(u) < 40; u += s * 0.05) { const p = uv(u, v); if (Math.abs(p.x) > ISLAND || Math.abs(p.z) > ISLAND) { e = uv(u - s * 0.05, v); break; } }
      if (!e) continue;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(wid * 0.9, 9), fallM);
      f.position.set(e.x, -4.5, e.z); f.lookAt(e.x * 2, -4.5, e.z * 2);
      this.scene.add(f);
      const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.assets.tex.cloud, transparent: true, opacity: 0.7, depthWrite: false }));
      mist.scale.set(5, 2.6, 1); mist.position.set(e.x * 1.02, -8.5, e.z * 1.02);
      this.scene.add(mist);
    }
    this.updaters.push((dt) => { fallTex.offset.y += dt * 0.9; });
    this.nile = { v };
  }

  icon(key) {
    if (!this.iconTex[key]) { const t = new THREE.Texture(this.assets.img[key]); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; this.iconTex[key] = t; }
    return this.iconTex[key];
  }

  // bubble (thought bubble + icon) texture for building status
  _bubbleTex(key) {
    this._bubbles = this._bubbles || {};
    if (this._bubbles[key]) return this._bubbles[key];
    const b = this.assets.img.bubble, ic = this.assets.img[key];
    const t = canvasTex(160, 176, (c, w, h) => {
      c.drawImage(b, 0, 0, w, h);
      const s = 92, r = Math.min(s / ic.width, s / ic.height);
      c.drawImage(ic, (w - ic.width * r) / 2, 70 - ic.height * r / 2, ic.width * r, ic.height * r);
    });
    this._bubbles[key] = t;
    return t;
  }

  _plots() {
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const COL = { fertile: [62, 44, 26, 0.95], limestone: [250, 238, 214, 0.9], copper: [118, 100, 92, 0.9], granite: [196, 112, 112, 0.92], bank: [160, 120, 80, 0.7], desert: [255, 236, 200, 0.45] };
    const patch = (kind) => canvasTex(128, 128, (c, w) => {
      const [r, g, b, a] = COL[kind];
      const gr = c.createRadialGradient(w / 2, w / 2, 6, w / 2, w / 2, w * 0.7);
      gr.addColorStop(0, `rgba(${r},${g},${b},${a})`); gr.addColorStop(0.62, `rgba(${r},${g},${b},${a * 0.85})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      c.fillStyle = gr; c.fillRect(0, 0, w, w);
      if (kind === 'fertile') { c.strokeStyle = 'rgba(30,20,10,0.45)'; c.lineWidth = 3; for (let y = 18; y < w - 12; y += 12) { c.beginPath(); c.moveTo(16, y); c.lineTo(w - 16, y); c.stroke(); } }
      const dots = { fertile: 'rgba(90,170,50,0.8)', limestone: 'rgba(255,255,250,0.9)', copper: 'rgba(60,200,140,0.75)', granite: 'rgba(80,30,40,0.55)', bank: 'rgba(60,40,20,0.4)', desert: 'rgba(200,160,110,0.25)' }[kind];
      for (let i = 0; i < 70; i++) { c.fillStyle = dots; const an = rnd() * 6.28, rr = rnd() * w * 0.4; c.fillRect(w / 2 + Math.cos(an) * rr, w / 2 + Math.sin(an) * rr, 3, 3); }
    });
    const ring = canvasTex(256, 256, (c, w) => {
      c.strokeStyle = 'rgba(255,214,110,0.95)'; c.lineWidth = 7; c.setLineDash([22, 14]);
      c.shadowColor = 'rgba(255,200,90,0.9)'; c.shadowBlur = 10;
      c.beginPath(); c.arc(w / 2, w / 2, w * 0.42, 0, Math.PI * 2); c.stroke();
    });
    const pt = {};
    for (const k of Object.keys(COL)) pt[k] = patch(k);
    // deposit materials
    const lime = new THREE.MeshStandardMaterial({ map: this._tex('limestone', 1), color: 0xf6ead2, roughness: 0.85, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ map: this._tex('bedrock', 1), color: 0x8a7a72, roughness: 0.9, flatShading: true });
    const malachite = new THREE.MeshStandardMaterial({ color: 0x35d08a, emissive: 0x0f6a40, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2, flatShading: true });
    const rose = new THREE.MeshStandardMaterial({ map: this._tex('bedrock', 1), color: 0xe0868a, roughness: 0.55, flatShading: true });
    const sprout = new THREE.MeshStandardMaterial({ color: 0x7ccf3c, roughness: 0.8, flatShading: true });
    const reed = new THREE.MeshStandardMaterial({ color: 0x9aa64a, roughness: 0.9 });
    const rock = (mat, s, x, z, flat = false) => {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
      m.position.set(x, s * (flat ? 0.35 : 0.55), z); m.scale.y = flat ? 0.55 : 0.7 + rnd() * 0.4; m.rotation.set(rnd(), rnd() * 6, rnd() * 0.5);
      m.castShadow = m.receiveShadow = true; return m;
    };
    const deposit = (kind) => {
      const g = new THREE.Group();
      const spots = [[-0.7, -0.6], [0.6, -0.7], [0, 0], [-0.8, 0.6], [0.75, 0.55], [0.1, -1.0], [-0.2, 0.9]];
      if (kind === 'limestone') {
        spots.forEach(([x, z], i) => g.add(rock(lime, 0.32 + rnd() * 0.32, x, z, i % 3 === 0)));
        const cut = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.35, 0.45, 2, 0.04), lime); cut.position.set(0.15, 0.18, 0.4); cut.rotation.y = 0.4; cut.castShadow = true; g.add(cut);
      } else if (kind === 'copper') {
        spots.slice(0, 5).forEach(([x, z]) => g.add(rock(dark, 0.3 + rnd() * 0.3, x, z)));
        for (let i = 0; i < 9; i++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.06 + rnd() * 0.05, 0.3 + rnd() * 0.25, 5), malachite);
          const an = rnd() * 6.28, r = 0.2 + rnd() * 0.9;
          c.position.set(Math.cos(an) * r, 0.14, Math.sin(an) * r); c.rotation.set((rnd() - 0.5) * 0.9, 0, (rnd() - 0.5) * 0.9); g.add(c);
        }
      } else if (kind === 'granite') {
        spots.slice(0, 6).forEach(([x, z]) => g.add(rock(rose, 0.34 + rnd() * 0.34, x, z)));
      } else if (kind === 'fertile') {
        for (let r = -1; r <= 1; r++) for (let k = -2; k <= 2; k++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26 + rnd() * 0.12, 4), sprout);
          c.position.set(k * 0.42 + (rnd() - 0.5) * 0.1, 0.13, r * 0.62); g.add(c);
        }
      } else if (kind === 'bank') {
        for (let i = 0; i < 14; i++) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.55 + rnd() * 0.4, 4), reed);
          const an = rnd() * 6.28, r = 0.4 + rnd() * 0.9; c.position.set(Math.cos(an) * r, 0.3, Math.sin(an) * r); c.rotation.z = (rnd() - 0.5) * 0.4; g.add(c);
        }
      }
      return g;
    };
    this.plotViews = {};
    for (const p of PLOTS) {
      const pos = new THREE.Vector3(p.x, 0, p.z);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshStandardMaterial({ map: pt[p.terrain], transparent: true, depthWrite: false, roughness: 1 }));
      ground.rotation.x = -Math.PI / 2; ground.position.set(pos.x, 0.015, pos.z); ground.receiveShadow = true;
      const r = new THREE.Mesh(new THREE.CircleGeometry(1.45, 32), new THREE.MeshBasicMaterial({ map: ring, transparent: true, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.set(pos.x, 0.04, pos.z); r.renderOrder = 2;
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.icon('plot'), transparent: true, depthWrite: false }));
      marker.scale.set(1.25, 1.25, 1); marker.position.set(pos.x, 0.9, pos.z); marker.renderOrder = 12;
      const dep = deposit(p.terrain); dep.position.copy(pos);
      this.scene.add(ground, r, marker, dep);
      this.plotViews[p.id] = { plot: p, pos, ground, ring: r, marker, deposit: dep, seed: rnd() * 6 };
    }
  }

  setPlotMarkers(allowedTerrains, isFree, highlight = null) {
    for (const v of Object.values(this.plotViews)) {
      const free = isFree(v.plot.id);
      const on = allowedTerrains.includes(v.plot.terrain) && free;
      v.marker.visible = on; v.ring.visible = on;
      v.deposit.visible = free;
      v.highlight = highlight === v.plot.id;
    }
  }

  _model(name, height, opts = {}) {
    const src = this.assets.models[name];
    const o = src.scene.clone(true);
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const s = opts.footprint ? opts.footprint / Math.max(size.x, size.z) : height / size.y;
    const wrap = new THREE.Group();
    o.scale.multiplyScalar(s);
    o.position.set(-(box.min.x + size.x / 2) * s, -box.min.y * s, -(box.min.z + size.z / 2) * s);
    wrap.add(o);
    o.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = opts.cast !== false;
        m.receiveShadow = !!opts.receive;
        if (m.material) { m.material.metalness = 0; m.material.roughness = 0.78; }
      }
    });
    if (opts.add !== false) this.scene.add(wrap);
    wrap.userData.height = size.y * s;
    return wrap;
  }

  _decor() {
    const place = (name, height, x, z, rot = 0, opts) => {
      const m = this._model(name, height, opts);
      m.position.set(x, 0, z);
      m.rotation.y = AZ + rot;
      return m;
    };
    this.fires = [];
    const camels = [];
    for (const d of DECOR) {
      const m = place(d.name, d.h, d.x, d.z, d.rot || 0, d.name === 'temple' ? { receive: true } : undefined);
      if (d.name === 'brazier') this.fires.push(m.position.clone().setY(0.92));
      if (d.name === 'camel') camels.push(m);
    }
    PALMS.forEach(([x, z], i) => {
      const p = place('palm', 2.5 + (i % 3) * 0.45, x, z, i * 1.3);
      const sway = i * 0.7;
      this.updaters.push(() => { p.rotation.z = Math.sin(this.time * 0.9 + sway) * 0.025; });
    });
    this.updaters.push(() => { camels.forEach((c, i) => { c.scale.y = 1 + Math.sin(this.time * (1.5 + i * 0.2) + i) * 0.012; }); });
    const boat = this._model('boat', 1.9);
    this.updaters.push(() => {
      const u = Math.sin(this.time * 0.05) * 9;
      const dir = Math.cos(this.time * 0.05) >= 0 ? 1 : -1;
      boat.position.copy(uv(u, this.nile.v + 0.9)); boat.position.y = Math.sin(this.time * 1.6) * 0.03 + this.floodLevel * 0.3;
      boat.rotation.y = Math.PI / 4 + (dir > 0 ? 0 : Math.PI);
      boat.rotation.z = Math.sin(this.time * 1.3) * 0.03;
    });
    // pharaoh's dais with canopy and the priestess' altar
    const goldM = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 0.9, roughness: 0.25 });
    const purpleM = new THREE.MeshStandardMaterial({ color: 0x6a2bb0, roughness: 0.55, side: THREE.DoubleSide });
    const lime = new THREE.MeshStandardMaterial({ map: this._tex('limestone', 1), roughness: 0.8 });
    const dais = new THREE.Group();
    const s1 = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.24, 2.2, 2, 0.05), lime); s1.position.y = 0.12;
    const s2 = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.24, 1.6, 2, 0.05), lime); s2.position.y = 0.36;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.05, 1.64), goldM); trim.position.y = 0.49;
    dais.add(s1, s2, trim);
    for (const [x, z] of [[-0.85, -0.7], [0.85, -0.7], [-0.85, 0.7], [0.85, 0.7]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 8), goldM);
      pole.position.set(x, 1.4, z); dais.add(pole);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.08, 1.65), purpleM); canopy.position.y = 2.36;
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 1.7), new THREE.MeshStandardMaterial({ color: 0xe8b23a, metalness: 0.6, roughness: 0.4 }));
    fringe.position.y = 2.24;
    dais.add(canopy, fringe);
    dais.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    dais.position.set(DAIS.x, 0, DAIS.z); dais.rotation.y = AZ;
    this.scene.add(dais);
    this.daisPos = dais.position.clone();
    const altar = new THREE.Group();
    const a1 = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.2, 1.7, 2, 0.05), lime); a1.position.y = 0.1;
    const rug = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 1.3), purpleM); rug.position.y = 0.21;
    altar.add(a1, rug);
    altar.traverse((m) => { if (m.isMesh) { m.receiveShadow = true; m.castShadow = true; } });
    altar.position.set(ALTAR.x, 0, ALTAR.z); altar.rotation.y = AZ;
    this.scene.add(altar);
    this.altarPos = altar.position.clone();
  }

  _characters() {
    const A = this.assets.models;
    const clip = (name) => A[name]?.animations?.[0];
    const mk = (name, height, clips) => {
      const root = SkeletonUtils.clone(A[name].scene);
      root.traverse((m) => {
        if (m.isMesh) {
          m.castShadow = true; m.frustumCulled = false;
          if (m.material) { m.material = m.material.clone(); m.material.metalness = 0; m.material.roughness = 0.72; }
        }
      });
      const g = new THREE.Group();
      root.scale.multiplyScalar(height / 1.75);
      g.add(root);
      this.scene.add(g);
      const actor = new Actor(root, clips);
      actor.group = g;
      this.actors.push(actor);
      return actor;
    };
    this.pharaoh = mk('pharaoh', 1.32, { Idle: A.pharaoh.animations[0], Cheer: clip('anim_pharaoh_cheer'), Stomp: clip('anim_pharaoh_stomp') });
    this.pharaoh.group.position.copy(this.daisPos).setY(0.52);
    this.pharaoh.group.rotation.y = AZ + 0.15;
    this.pharaoh.play('Idle');
    this.priestess = mk('priestess', 1.25, { Idle: A.priestess.animations[0], Cast: clip('anim_priestess_cast'), Dance: clip('anim_priestess_dance') });
    this.priestess.group.position.copy(this.altarPos).setY(0.22);
    this.priestess.group.rotation.y = AZ - 0.15;
    this.priestess.play('Idle');

    // the light-weight rigged labourer (Meshy) with all work clips; falls back to the hero worker
    const lp = !!A.worker_lp;
    // Meshy clips wander: remove the hips' drift so each loop starts and ends on the same spot and
    // every clip shares the idle pose's root position (no sliding, no popping on cross-fades)
    const rest = (() => { const t = A.worker_lp?.animations[0]?.tracks.find((q) => /Hips\.position$/.test(q.name)); return t ? [t.values[0], t.values[2]] : null; })();
    const inplace = (c, freeze = false) => {
      if (!c) return c;
      c = c.clone();
      for (const tr of c.tracks) {
        if (!/Hips\.position$/.test(tr.name)) continue;
        const v = tr.values, n = v.length / 3, tt = tr.times, T = tt[tt.length - 1] || 1;
        const x0 = v[0], z0 = v[2], dx = v[(n - 1) * 3] - x0, dz = v[(n - 1) * 3 + 2] - z0;
        const rx = rest ? rest[0] : x0, rz = rest ? rest[1] : z0;
        for (let i = 0; i < n; i++) {
          const f = tt[i] / T;
          if (freeze) { v[i * 3] = rx; v[i * 3 + 2] = rz; } else { v[i * 3] = v[i * 3] - x0 - dx * f + rx; v[i * 3 + 2] = v[i * 3 + 2] - z0 - dz * f + rz; }
        }
      }
      return c;
    };
    const L = (n) => clip('anim_lp_' + n);
    this.workerClips = lp ? {
      Idle: A.worker_lp.animations[0], Walk: inplace(L('walk')), Carry: inplace(L('carry')), Hammer: inplace(L('hammer')), Chop: inplace(L('chop')), Reap: inplace(L('reap')),
      Pick: inplace(L('pick')), Place: inplace(L('place')), Push: inplace(L('push')), Lever: inplace(L('lever')), Water: inplace(L('water'), true), Cheer: inplace(L('cheer')), Talk: inplace(L('talk')), Shrug: inplace(L('shrug')),
    } : { Idle: clip('anim_worker_idle'), Walk: clip('anim_worker_walk'), Carry: A.worker.animations[0], Cheer: clip('anim_worker_cheer') };
    for (const k of Object.keys(this.workerClips)) if (!this.workerClips[k]) this.workerClips[k] = this.workerClips.Idle;
    this._mkWorker = () => {
      const w = mk(lp ? 'worker_lp' : 'worker', WORKER_H, this.workerClips);
      w.rh = w.root.getObjectByName('RightHand'); w.rf = w.root.getObjectByName('RightForeArm');
      return w;
    };
    this.workerPool = [];
    this._props();
  }

  _getWorker() {
    const w = this.workerPool.pop() || this._mkWorker();
    w.stopAll();
    w.group.visible = true; w.active = true; w.prop = null;
    w.group.rotation.set(0, 0, 0); w.group.position.set(0, 0, 0);
    w.play('Idle', { fade: 0 });
    return w;
  }
  _freeWorker(w) {
    if (!w) return;
    w.group.visible = false; w.active = false;
    this._giveProp(w, null);
    w.stopAll();
    if (w.group.parent !== this.scene) this.scene.add(w.group);
    this.workerPool.push(w);
  }

  // hand tools, oriented every frame along the forearm -> hand direction
  _props() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xd88a4a, metalness: 0.8, roughness: 0.35 });
    const make = (kind) => {
      const g = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.42, 6), wood);
      handle.position.y = 0.16; g.add(handle);
      if (kind === 'mallet') { const h = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.11, 0.11), wood); h.position.y = 0.38; g.add(h); }
      if (kind === 'chisel') { const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), wood); h.position.y = 0.36; g.add(h); const c = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), copper); c.position.y = -0.08; c.rotation.x = Math.PI; g.add(c); }
      if (kind === 'sickle') { const b = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 4, 12, Math.PI * 1.1), copper); b.position.set(0.1, 0.4, 0); g.add(b); }
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      g.visible = false;
      this.scene.add(g);
      return g;
    };
    this._propPool = { mallet: [], chisel: [], sickle: [] };
    this._makeProp = make;
  }
  _giveProp(w, kind) {
    if (!kind) { if (w.propMesh) { w.propMesh.visible = false; this._propPool[w.propKind].push(w.propMesh); w.propMesh = null; } return; }
    if (w.propKind === kind && w.propMesh) return;
    if (w.propMesh) { w.propMesh.visible = false; this._propPool[w.propKind].push(w.propMesh); }
    w.propMesh = this._propPool[kind].pop() || this._makeProp(kind);
    w.propMesh.visible = true; w.propKind = kind;
  }
  _updateProps() {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
    for (const w of this.actors) {
      if (!w.propMesh || !w.group.visible || !w.rh || !w.rf) continue;
      w.rh.getWorldPosition(b); w.rf.getWorldPosition(a);
      d.copy(b).sub(a).normalize();
      w.propMesh.position.copy(b);
      w.propMesh.quaternion.setFromUnitVectors(UP, d);
    }
  }

  // ------------------------------------------------------------------ roads
  _roadSetup() {
    const mk = (draw) => { const t = canvasTex(128, 128, draw); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
    let seed = 3;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const pathTex = mk((c, w) => {
      c.fillStyle = '#c9965c'; c.fillRect(0, 0, w, w);
      for (let i = 0; i < 260; i++) { const g = 130 + rnd() * 70; c.fillStyle = `rgba(${g + 40},${g},${g - 50},${0.25 + rnd() * 0.35})`; c.fillRect(rnd() * w, rnd() * w, 2 + rnd() * 3, 2 + rnd() * 3); }
      for (let i = 0; i < 18; i++) { c.fillStyle = 'rgba(150,120,90,0.55)'; c.beginPath(); c.ellipse(rnd() * w, rnd() * w, 3 + rnd() * 3, 2 + rnd() * 2, rnd() * 3, 0, 6.3); c.fill(); }
      for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(120,90,60,0.25)'; const x = rnd() * w, y = rnd() * w; c.beginPath(); c.ellipse(x, y, 4, 7, 0.3, 0, 6.3); c.fill(); c.beginPath(); c.ellipse(x + 9, y + 12, 4, 7, 0.3, 0, 6.3); c.fill(); }
    });
    const clayTex = mk((c, w) => {
      c.fillStyle = '#8a5634'; c.fillRect(0, 0, w, w);
      for (let i = 0; i < 300; i++) { const g = 90 + rnd() * 60; c.fillStyle = `rgba(${g + 40},${g},${g - 30},${0.2 + rnd() * 0.3})`; c.fillRect(rnd() * w, rnd() * w, 2 + rnd() * 4, 1 + rnd() * 3); }
      for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(170,190,230,0.35)'; c.beginPath(); c.ellipse(rnd() * w, rnd() * w, 6 + rnd() * 10, 3 + rnd() * 4, rnd() * 3, 0, 6.3); c.fill(); }
    });
    this.roadMats = {
      pathEdge: new THREE.MeshStandardMaterial({ color: 0x8a5f36, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      path: new THREE.MeshStandardMaterial({ map: pathTex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      trackEdge: new THREE.MeshStandardMaterial({ color: 0x5a3420, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      track: new THREE.MeshStandardMaterial({ map: clayTex, roughness: 0.45, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    };
    this.roadGroup = new THREE.Group();
    this.scene.add(this.roadGroup);
    this.sleeperGeo = new THREE.BoxGeometry(0.085, 0.04, 0.6);
    this.sleeperMat = new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.85 });
    this.sleepers = null;
    this.roadVersion = -1;
    // ghost tiles: suggested road (tutorial) and the road-mode grid
    const ghostTex = canvasTex(64, 64, (c, w) => {
      c.fillStyle = 'rgba(255,214,110,0.38)'; c.fillRect(4, 4, w - 8, w - 8);
      c.strokeStyle = 'rgba(255,240,180,1)'; c.lineWidth = 5; c.setLineDash([10, 7]); c.strokeRect(5, 5, w - 10, w - 10);
    });
    this.ghostMat = new THREE.MeshBasicMaterial({ map: ghostTex, transparent: true, depthWrite: false });
    this.ghost = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2), this.ghostMat, SIZE * 2);
    this.ghost.count = 0; this.ghost.renderOrder = 5; this.ghost.frustumCulled = false;
    this.scene.add(this.ghost);
    this.gridMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 });
    this.gridPlane = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2), this.gridMat);
    this.gridPlane.position.y = 0.02; this.gridPlane.renderOrder = 4; this.gridPlane.visible = false;
    this.scene.add(this.gridPlane);
    this.flashes = [];
  }

  // rebuild the road meshes from the economy's tile grid (only when it changed)
  syncRoads(eco) {
    const G = eco.grid;
    const key = G.version + ':' + eco.topo;
    if (key === this.roadVersion) return;
    this.roadVersion = key;
    this.roadGroup.clear();
    const at = (x, z) => (x < -N || x > N || z < -N || z > N ? 0 : G.road[(x + N) * SIZE + (z + N)]);
    // footprints of finished buildings and the plaza: roads reach into them with a short stub
    const into = new Map();
    const mark = (cx, cz) => { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) into.set((cx + dx) + ',' + (cz + dz), true); };
    for (const b of eco.buildings) if (b.built) mark(b.x, b.z);
    mark(eco.site.x, eco.site.z);
    const quads = { path: [], pathEdge: [], track: [], trackEdge: [] };
    const sleepers = [];
    const rect = (list, x0, z0, x1, z1, y) => list.push([x0, z0, x1, z1, y]);
    const W = { path: 0.62, pathEdge: 0.78, track: 0.7, trackEdge: 0.86 };
    for (let x = -N; x <= N; x++) for (let z = -N; z <= N; z++) {
      const t = at(x, z);
      if (!t) continue;
      const kind = t === 2 ? 'track' : 'path';
      for (const layer of [kind + 'Edge', kind]) {
        const w = W[layer] / 2, y = layer.endsWith('Edge') ? 0.026 : 0.032;
        rect(quads[layer], x - w, z - w, x + w, z + w, y);
        // arms towards +x / +z neighbours (each joint drawn once) and stubs into buildings
        for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const n = at(x + dx, z + dz);
          const stub = into.has((x + dx) + ',' + (z + dz));
          if (!(n && (dx > 0 || dz > 0)) && !stub) continue;
          const both = n ? Math.min(n, t) : t;
          const lay = both === 2 ? layer : layer.replace('track', 'path');
          const ww = W[lay] / 2, len = n ? 1 : 0.85;
          if (dx) rect(quads[lay], Math.min(x, x + dx * len), z - ww, Math.max(x, x + dx * len), z + ww, y);
          else rect(quads[lay], x - ww, Math.min(z, z + dz * len), x + ww, Math.max(z, z + dz * len), y);
          if (both === 2 && !layer.endsWith('Edge')) for (let k = 0.25; k < len - 0.05; k += 0.5) sleepers.push([x + dx * k, z + dz * k, dx ? 0 : Math.PI / 2]);
        }
        if (t === 2 && !layer.endsWith('Edge')) {
          // straight runs get sleepers through the tile centre too
          const ex = at(x + 1, z) === 2 || at(x - 1, z) === 2, ez = at(x, z + 1) === 2 || at(x, z - 1) === 2;
          if (ex !== ez || (!ex && !ez)) sleepers.push([x, z, ez ? Math.PI / 2 : 0]);
        }
      }
    }
    for (const [layer, list] of Object.entries(quads)) {
      if (!list.length) continue;
      const pos = [], uvs = [], nor = [];
      for (const [x0, z0, x1, z1, y] of list) {
        const P = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
        for (const k of [0, 3, 2, 0, 2, 1]) { pos.push(P[k][0], y, P[k][1]); uvs.push(P[k][0] * 0.5, P[k][1] * 0.5); nor.push(0, 1, 0); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      const m = new THREE.Mesh(g, this.roadMats[layer]);
      m.receiveShadow = true;
      this.roadGroup.add(m);
    }
    if (sleepers.length) {
      const im = new THREE.InstancedMesh(this.sleeperGeo, this.sleeperMat, sleepers.length);
      sleepers.forEach(([x, z, r], i) => { tmpM.compose(tmpV.set(x, 0.045, z), tmpQ.setFromAxisAngle(UP, r), tmpS.set(1, 1, 1)); im.setMatrixAt(i, tmpM); });
      im.receiveShadow = true; im.castShadow = false;
      this.roadGroup.add(im);
    }
  }

  // a puff of sand where a road tile was laid or removed; red flash on a blocked tile
  roadFx(x, z, kind) {
    const p = new THREE.Vector3(x, 0.1, z);
    if (kind === 'bad') { this.flashes.push({ x, z, t: 0.45 }); return; }
    for (let k = 0; k < 2; k++) this.spawn('dust', p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)), { vel: new THREE.Vector3((Math.random() - 0.5), 0.6, (Math.random() - 0.5)), life: 0.6, size: 0.45, grow: 1.2, opacity: kind === 'erase' ? 0.8 : 0.6, color: kind === 'track' ? 0xc89070 : 0xffffff });
  }

  // tiles of a suggested road, pulsing gold
  setGhost(tiles) {
    this.ghostTiles = tiles && tiles.length ? tiles : null;
    const n = this.ghostTiles ? Math.min(this.ghostTiles.length, this.ghost.instanceMatrix.count) : 0;
    for (let k = 0; k < n; k++) {
      const i = this.ghostTiles[k];
      tmpM.compose(tmpV.set(Math.floor(i / SIZE) - N, 0.05, (i % SIZE) - N), tmpQ.identity(), tmpS.set(1, 1, 1));
      this.ghost.setMatrixAt(k, tmpM);
    }
    this.ghost.count = n;
    this.ghost.instanceMatrix.needsUpdate = true;
  }

  // road mode: faint grid on every tile a road may use
  showGrid(on, eco) {
    this.gridPlane.visible = !!on;
    if (!on) return;
    const px = 32, Wd = SIZE * px;
    const tex = canvasTex(Wd, Wd, (c) => {
      for (let x = -N; x <= N; x++) for (let z = -N; z <= N; z++) {
        if (!eco.grid.free(x, z)) continue;
        const cx = (x + N) * px, cy = (z + N) * px;
        c.fillStyle = 'rgba(255,245,215,0.16)'; c.fillRect(cx + 1, cy + 1, px - 2, px - 2);
        c.strokeStyle = 'rgba(255,236,170,0.85)'; c.lineWidth = 2; c.strokeRect(cx + 2, cy + 2, px - 4, px - 4);
      }
    });
    tex.magFilter = THREE.LinearFilter;
    if (this.gridMat.map) this.gridMat.map.dispose();
    this.gridMat.map = tex; this.gridMat.opacity = 1; this.gridMat.needsUpdate = true;
  }

  _updateRoadFx(dt) {
    if (this.ghost.count) this.ghostMat.opacity = 0.55 + Math.sin(this.time * 5) * 0.3;
    if (!this.flashMesh) {
      this.flashMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3060, transparent: true, opacity: 0.6, depthWrite: false }), 24);
      this.flashMesh.count = 0; this.flashMesh.renderOrder = 6; this.flashMesh.frustumCulled = false;
      this.scene.add(this.flashMesh);
    }
    this.flashes = this.flashes.filter((f) => (f.t -= dt) > 0).slice(-24);
    this.flashes.forEach((f, k) => { tmpM.compose(tmpV.set(f.x, 0.06, f.z), tmpQ.identity(), tmpS.setScalar(0.6 + f.t)); this.flashMesh.setMatrixAt(k, tmpM); });
    this.flashMesh.count = this.flashes.length;
    this.flashMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ carriers
  _sledge() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x9a6a35, roughness: 0.9 });
    for (const s of [-0.22, 0.22]) {
      const run = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.07), wood); run.position.set(0, 0.04, s); g.add(run);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.07), wood); tip.position.set(0.54, 0.09, s); tip.rotation.z = 0.6; g.add(tip);
    }
    for (let k = -2; k <= 2; k++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.56), wood); sl.position.set(k * 0.2, 0.09, 0); g.add(sl); }
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), new THREE.MeshStandardMaterial({ color: 0xd8c08a, roughness: 1 }));
    rope.rotation.z = Math.PI / 2 - 0.25; rope.position.set(0.95, 0.3, 0); rope.visible = false; g.add(rope);
    g.userData.rope = rope;
    const cargo = new THREE.Group(); cargo.position.y = 0.11; g.add(cargo);
    g.userData.cargo = cargo;
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.scene.add(g);
    return g;
  }
  _cargoMesh(good) {
    if (!HEAVY_GOODS.has(good)) {
      if (!this._lightMats) {
        this._lightMats = {
          grain: new THREE.MeshStandardMaterial({ color: 0xe8cf8a, roughness: 0.9 }),
          bread: new THREE.MeshStandardMaterial({ color: 0xb8702e, roughness: 0.7 }),
          ore: new THREE.MeshStandardMaterial({ color: 0x4f8a72, roughness: 0.6, flatShading: true }),
          tools: new THREE.MeshStandardMaterial({ color: 0xd88a4a, metalness: 0.7, roughness: 0.35 }),
        };
        this._lightGeo = { grain: new THREE.CylinderGeometry(0.13, 0.16, 0.3, 7), bread: new THREE.SphereGeometry(0.15, 8, 6), ore: new THREE.DodecahedronGeometry(0.15, 0), tools: new THREE.BoxGeometry(0.34, 0.1, 0.16) };
      }
      const m = new THREE.Mesh(this._lightGeo[good] || this._lightGeo.grain, this._lightMats[good] || this._lightMats.grain);
      m.castShadow = true;
      return m;
    }
    const mat = good === 'granite' ? this.graniteMat : good === 'stone' ? this.rawStoneMat : this.blockMat;
    const m = new THREE.Mesh(good === 'stone' ? this.rawStoneGeo : this.cargoGeo, mat);
    m.castShadow = true;
    return m;
  }
  _setCargo(holder, good, n, light = false) {
    const key = good + n;
    if (holder.userData.key === key) return;
    holder.userData.key = key;
    holder.clear();
    if (!n) return;
    if (light) {
      // a basket on the porter's head with the good in it
      if (!this._basketGeo) { this._basketGeo = new THREE.CylinderGeometry(0.2, 0.14, 0.14, 10); this._basketMat = new THREE.MeshStandardMaterial({ color: 0xc9a060, roughness: 0.95 }); }
      const b = new THREE.Mesh(this._basketGeo, this._basketMat); b.castShadow = true; holder.add(b);
      const c = this._cargoMesh(good); c.position.y = 0.12; c.scale.setScalar(0.85); holder.add(c);
      return;
    }
    for (let i = 0; i < n; i++) { const c = this._cargoMesh(good); c.position.set((i % 2 - 0.5) * 0.36 * (n > 1 ? 1 : 0), 0.17 + Math.floor(i / 2) * 0.3, 0); holder.add(c); }
  }

  _carrierView(c) {
    let cv = this.carrierViews.get(c.id);
    if (cv && cv.kind !== c.kind) { this._dropCarrier(c.id); cv = null; }
    if (cv) return cv;
    cv = { kind: c.kind, pos: null, yaw: 0, seen: 0 };
    if (c.kind === 'porter') { cv.w = this._getWorker(); cv.load = new THREE.Group(); cv.w.group.add(cv.load); cv.load.position.y = WORKER_H + 0.02; }
    else if (c.kind === 'sledge') { cv.w = this._getWorker(); cv.w2 = this._getWorker(); cv.sl = this._sledge(); cv.sl.userData.rope.visible = true; }
    else if (c.kind === 'ox') { cv.m = this._model('oxcart', 1.0, { footprint: 1.6 }); cv.w = this._getWorker(); cv.cargo = new THREE.Group(); cv.cargo.position.y = 0.55; cv.m.add(cv.cargo); }
    else if (c.kind === 'boat') { cv.m = this._model('boat', 1.4); cv.cargo = new THREE.Group(); cv.cargo.position.y = 0.4; cv.m.add(cv.cargo); }
    this.carrierViews.set(c.id, cv);
    return cv;
  }

  _dropCarrier(id) {
    const cv = this.carrierViews.get(id);
    if (!cv) return;
    if (cv.load) { cv.load.clear(); cv.w.group.remove(cv.load); }
    for (const w of [cv.w, cv.w2]) if (w) this._freeWorker(w);
    if (cv.sl) this.scene.remove(cv.sl);
    if (cv.m) this.scene.remove(cv.m);
    this.carrierViews.delete(id);
  }

  _along(path, f) {
    let total = 0;
    const segs = [];
    for (let k = 1; k < path.length; k++) { const l = Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z); segs.push(l); total += l; }
    let d = THREE.MathUtils.clamp(f, 0, 1) * total;
    for (let k = 0; k < segs.length; k++) {
      if (d <= segs[k] || k === segs.length - 1) {
        const t = segs[k] ? Math.min(1, d / segs[k]) : 0, a = path[k], b = path[k + 1];
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / (segs[k] || 1), dz: (b.z - a.z) / (segs[k] || 1) };
      }
      d -= segs[k];
    }
    return { x: path[0].x, z: path[0].z, dx: 1, dz: 0 };
  }

  // carriers of every building follow the economy; the view eases position and heading
  syncCarriers(eco, dt) {
    const alive = new Set();
    for (const b of eco.buildings) {
      if (!b.built) continue;
      const bv = this.bviews.get(b.id);
      for (const c of b.carriers) {
        alive.add(c.id);
        const cv = this._carrierView(c);
        let goal, dir = null, moving = false;
        const loaded = c.load > 0;
        if (c.path && (c.phase === 'go' || c.phase === 'back' || c.phase === 'unload')) {
          const q = this._along(c.path, c.progress);
          goal = { x: q.x, z: q.z };
          if (c.phase !== 'unload') { moving = true; dir = c.phase === 'back' ? { x: -q.dx, z: -q.dz } : { x: q.dx, z: q.dz }; }
        } else if (c.path && c.phase === 'load') {
          goal = { ...c.path[0] };
          moving = true;
        } else {
          // waiting at the pile of finished goods
          const sx = c.kind === 'boat' ? 0 : PILE[0] + 0.55 + c.slot * 0.2, sz = c.kind === 'boat' ? 0 : PILE[1] - 0.25 - c.slot * 0.62;
          goal = c.kind === 'boat' ? this._boatDock(b, c.slot) : { x: b.x + sx, z: b.z + sz };
        }
        if (!cv.pos || Math.hypot(goal.x - cv.pos.x, goal.z - cv.pos.z) > 3.5) cv.pos = { ...goal };
        else {
          const dx = goal.x - cv.pos.x, dz = goal.z - cv.pos.z, d = Math.hypot(dx, dz);
          const max = dt * 3.2;
          if (d > max) { cv.pos.x += dx / d * max; cv.pos.z += dz / d * max; if (!dir) { dir = { x: dx / d, z: dz / d }; moving = true; } }
          else { cv.pos.x = goal.x; cv.pos.z = goal.z; }
        }
        if (!dir && !moving && bv) dir = { x: bv.pos.x - cv.pos.x, z: bv.pos.z - cv.pos.z };
        if (dir && (dir.x || dir.z)) {
          const yaw = Math.atan2(dir.x, dir.z);
          let dy = yaw - cv.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
          cv.yaw += dy * Math.min(1, dt * 10);
        }
        const fx = Math.sin(cv.yaw), fz = Math.cos(cv.yaw);
        const sp = (moving ? (c.phase === 'back' ? 1.15 : 1) : 0) * ({ porter: 1.9, sledge: 1.3, ox: 1.6, boat: 1.5 }[c.kind]) * (this.tempo || 1);
        if (c.kind === 'porter') {
          cv.w.group.position.set(cv.pos.x, 0.04, cv.pos.z);
          cv.w.group.rotation.y = cv.yaw;
          const anim = moving ? 'Walk' : (c.phase === 'unload' || c.phase === 'load') ? 'Place' : 'Idle';
          cv.w.play(anim);
          if (anim === 'Walk') cv.w.setSpeed(sp / WALK_NATURAL);
          this._setCargo(cv.load, c.good, loaded || (c.phase === 'idle' && b.out > 0 && false) ? 1 : 0, true);
          cv.load.visible = loaded;
        } else if (c.kind === 'sledge') {
          // two haulers: one hauls the rope in front, one pushes from behind
          cv.sl.position.set(cv.pos.x, 0.04, cv.pos.z);
          cv.sl.rotation.y = cv.yaw - Math.PI / 2;
          this._setCargo(cv.sl.userData.cargo, c.good, c.load);
          cv.sl.userData.rope.visible = moving;
          cv.w.group.position.set(cv.pos.x - fx * 0.78, 0.04, cv.pos.z - fz * 0.78);
          cv.w.group.rotation.y = cv.yaw;
          cv.w2.group.position.set(cv.pos.x + fx * 1.25, 0.04, cv.pos.z + fz * 1.25);
          cv.w2.group.rotation.y = cv.yaw;
          cv.w.play(moving ? (loaded ? 'Push' : 'Walk') : 'Idle');
          cv.w2.play(moving ? 'Walk' : (c.phase === 'unload' || c.phase === 'load') ? 'Lever' : 'Idle');
          if (moving) { cv.w.setSpeed(sp / (loaded ? PUSH_NATURAL : WALK_NATURAL)); cv.w2.setSpeed(sp / WALK_NATURAL); }
          if (moving && loaded && Math.random() < dt * 2.5) this.spawn('dust', new THREE.Vector3(cv.pos.x - fx * 0.5, 0.15, cv.pos.z - fz * 0.5), { vel: new THREE.Vector3(-fx * 0.3, 0.3, -fz * 0.3), life: 0.7, size: 0.35, grow: 1.2, opacity: 0.45 });
        } else if (c.kind === 'ox') {
          cv.m.position.set(cv.pos.x, moving ? Math.abs(Math.sin(this.time * 7)) * 0.025 : 0, cv.pos.z);
          cv.m.rotation.y = cv.yaw - Math.PI / 2 + Math.PI;
          this._setCargo(cv.cargo, c.good, Math.min(2, c.load));
          cv.w.group.position.set(cv.pos.x + fz * 0.55 + fx * 0.35, 0.04, cv.pos.z - fx * 0.55 + fz * 0.35);
          cv.w.group.rotation.y = cv.yaw;
          cv.w.play(moving ? 'Walk' : 'Idle');
          if (moving) cv.w.setSpeed(sp / WALK_NATURAL);
        } else if (c.kind === 'boat') {
          cv.m.position.set(cv.pos.x, 0.05 + Math.sin(this.time * 1.8 + c.slot) * 0.03 + this.floodLevel * 0.3, cv.pos.z);
          cv.m.rotation.y = cv.yaw - Math.PI / 2;
          this._setCargo(cv.cargo, c.good, Math.min(2, c.load));
        }
      }
    }
    for (const id of [...this.carrierViews.keys()]) if (!alive.has(id)) this._dropCarrier(id);
  }

  _boatDock(b, slot) {
    const from = toUV({ x: b.x, z: b.z });
    const w = uv(from.u + (slot - 1) * 1.4, RIVER.far + 0.35);
    return { x: w.x, z: w.z };
  }

  // pile of finished goods at a building's right corner
  _updatePile(v) {
    const b = v.b;
    const good = b.type === 'house' ? null : (b.carriers[0] ? b.carriers[0].good : null);
    if (!good || b.type === 'granite') return;
    if (!v.pile) { v.pile = new THREE.Group(); v.pile.position.set(b.x + PILE[0], 0.03, b.z + PILE[1]); this.scene.add(v.pile); }
    const n = Math.min(6, Math.floor(b.out));
    if (v.pileN === n) return;
    v.pileN = n;
    v.pile.clear();
    for (let i = 0; i < n; i++) {
      const m = this._cargoMesh(good);
      const heavy = HEAVY_GOODS.has(good);
      const lay = Math.floor(i / 3), col = i % 3;
      m.position.set((col - 1) * 0.36 * (heavy ? 1 : 0.8), (heavy ? 0.14 : 0.12) + lay * (heavy ? 0.28 : 0.22), (col % 2) * 0.1 - lay * 0.05);
      m.rotation.y = AZ + col * 0.2;
      v.pile.add(m);
    }
  }

  // ------------------------------------------------------------------ buildings
  addBuilding(b, instant) {
    const pv = this.plotViews[b.plot];
    const g = new THREE.Group();
    g.position.copy(pv.pos);
    const model = this._model(b.type, 2, { footprint: BUILD_SIZE, add: false, receive: true });
    model.rotation.y = AZ;
    g.add(model);
    // foundation slab covering the 3x3 plot
    const slab = new THREE.Mesh(new RoundedBoxGeometry(2.9, 0.1, 2.9, 2, 0.04), new THREE.MeshStandardMaterial({ map: this._tex('limestone', 2), color: 0xd8c2a2, roughness: 0.9 }));
    slab.position.y = 0.03; slab.receiveShadow = true;
    g.add(slab);
    pv.deposit.visible = false;
    // scaffold for the construction phase
    const scaffold = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 });
    const hgt = model.userData.height * 1.05;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, hgt, 6), wood);
      p.position.set(x * BUILD_SIZE * 0.5, hgt / 2, z * BUILD_SIZE * 0.5); scaffold.add(p);
    }
    for (let k = 1; k <= 3; k++) for (const [x1, z1, x2, z2] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(BUILD_SIZE * (x1 === x2 ? 0.06 : 1), 0.05, BUILD_SIZE * (z1 === z2 ? 0.06 : 1)), wood);
      bar.position.set((x1 + x2) / 4 * BUILD_SIZE, hgt * k / 3.2, (z1 + z2) / 4 * BUILD_SIZE); scaffold.add(bar);
    }
    scaffold.rotation.y = AZ;
    scaffold.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.add(scaffold);
    const pips = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._pipsTex(1), transparent: true, depthWrite: false }));
    pips.scale.set(1.0, 0.33, 1); pips.position.y = model.userData.height + 0.35; pips.renderOrder = 12;
    g.add(pips);
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    bubble.scale.set(1.15, 1.26, 1); bubble.position.y = model.userData.height + 1.1; bubble.visible = false; bubble.renderOrder = 13;
    g.add(bubble);
    this.scene.add(g);
    const view = { b, g, model, scaffold, pips, bubble, pos: pv.pos.clone(), bubbleKey: null, grow: instant ? 1 : 0, bump: 0, jobs: [] };
    for (const job of JOBS[b.type] || []) {
      const w = this._getWorker();
      const off = new THREE.Vector3(job.o[0], 0, job.o[1]);
      w.group.position.copy(pv.pos).add(off).setY(0.08);
      // face the building, turned a little towards the camera
      w.group.rotation.y = Math.atan2(-off.x, -off.z) + 0.25;
      view.jobs.push({ w, job, seed: Math.random() * 10 });
    }
    if (instant) { scaffold.visible = false; model.scale.set(1, 1, 1); }
    else { model.scale.set(1, 0.02, 1); for (let k = 0; k < 6; k++) this._dust(pv.pos, 1.3); }
    this.bviews.set(b.id, view);
    return view;
  }

  _pipsTex(level) {
    this._pips = this._pips || {};
    if (this._pips[level]) return this._pips[level];
    const t = canvasTex(192, 64, (c, w, h) => {
      for (let i = 0; i < 3; i++) {
        const x = w / 2 + (i - 1) * 54, y = h / 2;
        c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
        c.fillStyle = i < level ? '#ffd36b' : 'rgba(40,14,70,0.85)';
        c.strokeStyle = '#7a3c00'; c.lineWidth = 4;
        c.shadowColor = i < level ? 'rgba(255,200,80,0.9)' : 'transparent'; c.shadowBlur = 10;
        c.fillRect(-15, -15, 30, 30); c.strokeRect(-15, -15, 30, 30);
        c.restore();
      }
    });
    this._pips[level] = t;
    return t;
  }

  buildingReady(b) {
    const v = this.bviews.get(b.id);
    if (!v) return;
    v.scaffold.visible = false;
    v.grow = 1; v.model.scale.set(1, 1, 1);
    v.bump = 0.35;
    this._burst(v.pos.clone().setY(v.model.userData.height * 0.6), 18);
  }

  upgradeBuilding(b) {
    const v = this.bviews.get(b.id);
    if (!v) return;
    v.pips.material.map = this._pipsTex(b.level); v.pips.material.needsUpdate = true;
    v.bump = 0.45;
    this._burst(v.pos.clone().setY(v.model.userData.height * 0.7), 24, 0xd59cff);
  }

  setBubble(b, key) {
    const v = this.bviews.get(b.id);
    if (!v || v.bubbleKey === key) return;
    v.bubbleKey = key;
    v.bubble.visible = !!key;
    if (key) { v.bubble.material.map = this._bubbleTex(key); v.bubble.material.needsUpdate = true; }
  }

  buildingPos(b) { const v = this.bviews.get(b.id); return v ? v.pos : null; }

  // a produced good floats up out of the building
  popIcon(b, key) {
    const v = this.bviews.get(b.id);
    if (!v) return;
    this.spawn('icon', v.pos.clone().setY(v.model.userData.height * 0.8), { map: this.icon(key), vel: new THREE.Vector3(0, 1.1, 0), life: 1.2, size: 0.6, opacity: 1, blend: 'normal' });
  }

  _updateBuildings(dt) {
    for (const v of this.bviews.values()) {
      const b = v.b;
      if (!b.built) {
        const k = Math.max(0.02, 1 - b.buildT / 3);
        v.model.scale.set(1, k, 1);
        if (Math.random() < dt * 4) this._dust(v.pos, 1.2);
      }
      for (const j of v.jobs) {
        let anim = 'Idle', prop = null;
        const st = b.state;
        if (this.cheerT > 0) anim = 'Cheer';
        else if (!b.built) { anim = 'Hammer'; prop = 'mallet'; }
        else if (b.type === 'house') anim = st === 'hungry' ? 'Shrug' : 'Talk';
        else if (st === 'work' || st === 'noTools') { anim = j.job.anim; prop = j.job.prop; }
        else anim = Math.floor((this.time + j.seed) / 4) % 3 === 0 ? 'Shrug' : 'Idle';
        j.w.play(anim);
        this._giveProp(j.w, prop);
        // chips fly when the tool strikes
        const a = j.w.current;
        if (a && (anim === 'Hammer' || anim === 'Chop' || anim === 'Pick') && b.built) {
          const ph = (a.time / a.getClip().duration) % 1;
          if (j.lastPh !== undefined && j.lastPh < 0.5 && ph >= 0.5) {
            const p = j.w.group.position, f = new THREE.Vector3(Math.sin(j.w.group.rotation.y), 0, Math.cos(j.w.group.rotation.y));
            const hit = new THREE.Vector3(p.x + f.x * 0.45, 0.25, p.z + f.z * 0.45);
            const stone = b.type === 'quarry' || b.type === 'mason' || b.type === 'granite' || b.type === 'mine';
            for (let k = 0; k < 4; k++) this.spawn(stone ? 'dust' : 'sparkle', hit, { vel: new THREE.Vector3((Math.random() - 0.5) * 1.6, 1 + Math.random(), (Math.random() - 0.5) * 1.6), life: 0.5, size: stone ? 0.22 : 0.18, gravity: 4, opacity: 0.85, color: b.type === 'granite' ? 0xffb0b0 : b.type === 'smithy' ? 0xffc060 : b.type === 'farm' ? 0x9fdc6a : 0xfff2dc });
          }
          j.lastPh = ph;
        }
      }
      this._updatePile(v);
      if (v.bump > 0) {
        v.bump = Math.max(0, v.bump - dt);
        const s = 1 + Math.sin(v.bump * 18) * v.bump * 0.18;
        v.model.scale.set(s, s, s);
      }
      if (v.bubble.visible) v.bubble.position.y = v.model.userData.height + 1.05 + Math.sin(this.time * 3 + v.pos.x) * 0.08;
      // working smoke / sparks
      if (b.built && b.busy && (b.type === 'bakery' || b.type === 'smithy') && Math.random() < dt * 3) {
        this.spawn('dust', v.pos.clone().setY(v.model.userData.height), { vel: new THREE.Vector3(0.1, 0.8, 0.1), life: 1.6, size: 0.45, grow: 1.5, opacity: 0.5, color: 0xd9c8ff });
      }
      if (b.built && b.busy && (b.type === 'quarry' || b.type === 'mason') && Math.random() < dt * 2.5) this._dust(v.pos, 0.9);
    }
    for (const pv of Object.values(this.plotViews)) {
      if (!pv.marker.visible) continue;
      const hl = pv.highlight ? 1.25 + Math.sin(this.time * 6) * 0.15 : 1;
      pv.marker.position.y = 0.9 + Math.sin(this.time * 2.2 + pv.seed) * 0.12;
      pv.marker.scale.set(1.25 * hl, 1.25 * hl, 1);
      pv.ring.rotation.z += dt * 0.4;
    }
  }

  // ------------------------------------------------------------------ particles
  _particles() {
    const glow = canvasTex(64, 64, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,220,160,0.6)'); g.addColorStop(1, 'rgba(255,180,90,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    const flame = canvasTex(64, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h * 0.68, 2, w / 2, h * 0.6, h * 0.5);
      g.addColorStop(0, 'rgba(255,250,210,1)'); g.addColorStop(0.25, 'rgba(255,200,80,0.95)'); g.addColorStop(0.6, 'rgba(255,90,40,0.55)'); g.addColorStop(1, 'rgba(160,40,140,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(w / 2, h * 0.62, w * 0.42, h * 0.48, 0, 0, Math.PI * 2); c.fill();
    });
    this.ptex = { glow, flame, sparkle: this.assets.tex.sparkle, dust: this.assets.tex.dust };
    this.pool = [];
    for (let i = 0; i < 170; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.visible = false; s.renderOrder = 10;
      this.scene.add(s);
      this.pool.push({ s, life: 0 });
    }
    this.flames = [];
    for (const p of this.fires) {
      for (let k = 0; k < 2; k++) {
        const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
        f.position.copy(p).add(new THREE.Vector3(0, 0.25, 0)); f.renderOrder = 9;
        this.scene.add(f);
        this.flames.push({ f, k, base: p, seed: Math.random() * 10 });
      }
    }
    this.clouds = [];
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.assets.tex.cloud, transparent: true, depthWrite: false, opacity: 0.85 }));
      const s = 6 + Math.random() * 7;
      c.scale.set(s, s * 0.56, 1);
      const u = (Math.random() * 2 - 1) * 30, v = 14 + Math.random() * 18;
      c.position.copy(uv(u, v)); c.position.y = -4 - Math.random() * 8;
      c.userData.speed = 0.25 + Math.random() * 0.35; c.userData.u = u; c.userData.v = v;
      this.scene.add(c);
      this.clouds.push(c);
    }
  }

  spawn(type, pos, { vel = null, life = 1, size = 0.4, grow = 0, color = 0xffffff, gravity = 0, spin = 0, opacity = 1, delay = 0, map = null, blend = null } = {}) {
    const p = this.pool.find((q) => q.life <= 0);
    if (!p) return;
    const m = p.s.material;
    m.map = map || this.ptex[type];
    m.blending = (blend === 'normal' || type === 'dust') ? THREE.NormalBlending : THREE.AdditiveBlending;
    m.color.set(color);
    m.rotation = type === 'icon' ? 0 : Math.random() * Math.PI * 2;
    m.needsUpdate = true;
    p.s.renderOrder = type === 'icon' ? 14 : 10;
    p.s.position.copy(pos);
    p.vel = vel ? vel.clone() : new THREE.Vector3();
    p.life = p.max = life; p.size = size; p.grow = grow; p.gravity = gravity; p.spin = spin; p.op = opacity; p.delay = delay;
    p.s.scale.setScalar(size);
    p.s.visible = delay <= 0;
    m.opacity = 0;
  }

  _dust(pos, r = 1) {
    const a = Math.random() * Math.PI * 2;
    this.spawn('dust', new THREE.Vector3(pos.x + Math.cos(a) * r, 0.25, pos.z + Math.sin(a) * r), { vel: new THREE.Vector3(Math.cos(a) * 0.8, 0.5, Math.sin(a) * 0.8), life: 0.9, size: 0.7, grow: 1.4, opacity: 0.75 });
  }

  _burst(pos, n = 16, color = 0xffe08a) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.spawn('sparkle', pos, { vel: new THREE.Vector3(Math.cos(a) * 2, 1.5 + Math.random() * 1.5, Math.sin(a) * 2), life: 0.9, size: 0.35, color: k % 2 ? color : 0xd28cff, spin: 3 });
    }
    this.spawn('glow', pos, { life: 0.6, size: 1.4, grow: 2.5, color });
  }

  _updateParticles(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      if (p.delay > 0) { p.delay -= dt; if (p.delay <= 0) p.s.visible = true; continue; }
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const t = 1 - p.life / p.max;
      p.vel.y -= p.gravity * dt;
      p.s.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 1.2);
      p.s.scale.setScalar(p.size * (1 + p.grow * t));
      p.s.material.rotation += p.spin * dt;
      p.s.material.opacity = p.op * Math.min(1, t * 8) * (1 - t * t);
    }
    for (const fl of this.flames) {
      const t = this.time * 9 + fl.seed;
      const s = 0.55 + Math.sin(t) * 0.06 + Math.sin(t * 2.3) * 0.05;
      fl.f.scale.set(s * (fl.k ? 0.7 : 1), s * 1.6 * (fl.k ? 0.75 : 1), 1);
      fl.f.position.y = fl.base.y + 0.28 + Math.sin(t * 1.7) * 0.02;
      fl.f.material.opacity = 0.85 + Math.sin(t * 3.1) * 0.15;
    }
    for (const c of this.clouds) {
      c.userData.u += c.userData.speed * dt;
      if (c.userData.u > 34) c.userData.u = -34;
      const y = c.position.y;
      c.position.copy(uv(c.userData.u, c.userData.v)); c.position.y = y;
    }
    if (this.storm && Math.random() < dt * 25) {
      const c = this.cam.target;
      this.spawn('dust', new THREE.Vector3(c.x - 12 + Math.random() * 6, 0.5 + Math.random() * 3, c.z + (Math.random() - 0.5) * 24), { vel: new THREE.Vector3(6, 0.2, -2), life: 3, size: 2.2, grow: 1.5, opacity: 0.55 });
    }
  }

  // ------------------------------------------------------------------ pyramid
  _pyramidSetup() {
    this.blockGeo = new RoundedBoxGeometry(0.97, H * 0.98, 0.97, 2, 0.07);
    this.blockMat = new THREE.MeshStandardMaterial({ map: this._tex('limestone', 1), roughness: 0.8, metalness: 0, color: 0xe2cdb0 });
    this.pyr = new THREE.Group();
    this.scene.add(this.pyr);
    this.foundation = new THREE.Mesh(new RoundedBoxGeometry(1, FOUND, 1, 2, 0.04), new THREE.MeshStandardMaterial({ map: this._tex('limestone', 4), color: 0xd8c6b0, roughness: 0.9 }));
    this.foundation.position.y = FOUND / 2;
    this.foundation.receiveShadow = true;
    this.scene.add(this.foundation);
    // faint outline of the planned pyramid
    this.plan = new THREE.Group();
    this.scene.add(this.plan);
    const capG = new THREE.ConeGeometry(0.72, 0.9, 4, 1);
    this.capstone = new THREE.Mesh(capG, new THREE.MeshStandardMaterial({ color: 0xffd36b, metalness: 1, roughness: 0.18, emissive: 0xffa000, emissiveIntensity: 0.6 }));
    this.capstone.rotation.y = Math.PI / 4; this.capstone.castShadow = true; this.capstone.visible = false;
    this.scene.add(this.capstone);
    const beamT = canvasTex(8, 128, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,200,120,0)'); g.addColorStop(0.55, 'rgba(255,190,90,0.35)'); g.addColorStop(0.85, 'rgba(190,110,255,0.6)'); g.addColorStop(1, 'rgba(160,80,255,0.8)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 40, 24, 1, true), new THREE.MeshBasicMaterial({ map: beamT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.visible = false;
    this.scene.add(this.beam);
  }

  setupLevel(tierSizes) {
    this.tierSizes = tierSizes;
    this.pyr.clear();
    const total = tierSizes.reduce((a, n) => a + n * n, 0);
    this.blocks = new THREE.InstancedMesh(this.blockGeo, this.blockMat, total);
    this.blocks.count = 0; this.blocks.castShadow = true; this.blocks.receiveShadow = true; this.blocks.frustumCulled = false;
    this.blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pyr.add(this.blocks);
    // build order: tier by tier, back to front
    this.order = [];
    tierSizes.forEach((n, t) => {
      const cells = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) cells.push([i, j]);
      cells.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]);
      for (const [i, j] of cells) this.order.push([t, i, j]);
    });
    this.anims.length = 0;
    const base = tierSizes[0];
    this.pyrRadius = base * Math.SQRT2 / 2 + 0.6;
    this.foundation.scale.set(base + 1.1, 1, base + 1.1);
    // ghost outline of the finished pyramid
    this.plan.clear();
    const lineM = new THREE.LineBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.55 });
    tierSizes.forEach((n, t) => {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(n, H, n)), lineM);
      e.position.y = this.tierBaseY(t) + H / 2;
      this.plan.add(e);
    });
    this.capstone.visible = false; this.beam.visible = false;
    this.capToken = (this.capToken || 0) + 1;
    this.orbit = false;
    this.camGoal.az = AZ;
    for (const v of this.bviews.values()) { this.scene.remove(v.g); if (v.pile) this.scene.remove(v.pile); for (const j of v.jobs || []) this._freeWorker(j.w); }
    this.bviews.clear();
    for (const id of [...this.carrierViews.keys()]) this._dropCarrier(id);
    for (const pv of Object.values(this.plotViews)) pv.deposit.visible = true;
    this.roadGroup.clear(); this.roadVersion = -1;
    this.setGhost(null); this.showGrid(false);
    this.layout = siteLayout(base);
    this._siteLevel();
    this.rampGoal = this.tierBaseY(0);
    this.floodGoal = 0; this.floodWarn = false; this.storm = false;
    this.cam.az = AZ + 0.5;
    const c0 = uv(0, 2.2);
    this.cam.target.set(c0.x, 0.5, c0.z);
    this.camGoal.W = 18.5; this.cam.W = 23; this.camFocus = null;
    this.resize();
  }

  tierBaseY(t) { return FOUND + t * H; }
  cellWorld(t, i, j) {
    const n = this.tierSizes[t], off = (n - 1) / 2;
    return new THREE.Vector3(i - off, this.tierBaseY(t) + H / 2, j - off);
  }

  placeBlock(index, good = 'block') {
    const o = this.order[index];
    if (!o) return null;
    const [t, i, j] = o;
    const m = this.blocks;
    const idx = m.count++;
    const p = this.cellWorld(t, i, j);
    const v = 0.9 + Math.random() * 0.14;
    if (good === 'granite') m.setColorAt(idx, new THREE.Color(v * 1.05, v * 0.52, v * 0.55));
    else m.setColorAt(idx, new THREE.Color(v, v * (0.98 + Math.random() * 0.03), v * (0.95 + Math.random() * 0.05)));
    m.instanceColor.needsUpdate = true;
    tmpM.compose(p, tmpQ.identity(), tmpS.set(0.0001, 0.0001, 0.0001));
    m.setMatrixAt(idx, tmpM);
    m.instanceMatrix.needsUpdate = true;
    const from = this.rampInfo ? this.rampTop() : p.clone().setY(p.y + 2.2);
    this.anims.push({ idx, p, from, t: 0, dur: 0.55, drop: 0 });
    return p;
  }

  _updateBlocks(dt) {
    const m = this.blocks;
    if (!m) return;
    for (let a = this.anims.length - 1; a >= 0; a--) {
      const an = this.anims[a];
      an.t += dt;
      if (an.flash) {
        const k = Math.min(1, an.t / an.dur), f = Math.sin(k * Math.PI);
        m.setColorAt(an.idx, tmpCol.copy(an.col).lerp(FLASH, f * 0.85)); m.instanceColor.needsUpdate = true;
        if (k >= 1) { m.setColorAt(an.idx, an.col); this.anims.splice(a, 1); }
        continue;
      }
      if (an.t < 0) continue;
      const fall = Math.min(1, an.t / (an.dur * 0.7));
      let sy = 1, sx = 1;
      if (fall >= 1) { const q = (an.t - an.dur * 0.7) / (an.dur * 0.3); sy = 1 - Math.sin(Math.min(1, q) * Math.PI) * 0.16; sx = 1 + (1 - sy) * 0.5; }
      // slide/lift from the ramp top over the steps into the slot
      const e = easeInOut(fall);
      tmpV.copy(an.from).lerp(an.p, e);
      tmpV.y += Math.sin(e * Math.PI) * 0.6 - (1 - sy) * H * 0.5;
      tmpM.compose(tmpV, tmpQ.identity(), tmpS.set(sx, sy, sx));
      if (fall >= 1 && !an.landed) {
        an.landed = true;
        for (let d = 0; d < 3; d++) {
          const ang = Math.random() * Math.PI * 2;
          this.spawn('dust', new THREE.Vector3(an.p.x + Math.cos(ang) * 0.4, an.p.y - H * 0.35, an.p.z + Math.sin(ang) * 0.4), { vel: new THREE.Vector3(Math.cos(ang) * 1.2, 0.5, Math.sin(ang) * 1.2), life: 0.7, size: 0.55, grow: 1.4, opacity: 0.8 });
        }
      }
      m.setMatrixAt(an.idx, tmpM);
      m.instanceMatrix.needsUpdate = true;
      if (an.t >= an.dur) {
        tmpM.compose(an.p, tmpQ.identity(), tmpS.set(1, 1, 1));
        m.setMatrixAt(an.idx, tmpM);
        this.anims.splice(a, 1);
      }
    }
  }

  tierComplete(t) {
    let start = 0;
    for (let k = 0; k < t; k++) start += this.tierSizes[k] ** 2;
    const n = this.tierSizes[t] ** 2;
    for (let k = 0; k < n; k++) {
      const idx = start + k, col = new THREE.Color();
      this.blocks.getColorAt(idx, col);
      const [, i, j] = this.order[idx];
      this.anims.push({ flash: true, idx, col, t: -(i + j) * 0.03, dur: 0.6 });
    }
    const y = this.tierBaseY(t) + H, half = this.tierSizes[t] / 2;
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      this.spawn('sparkle', new THREE.Vector3(Math.cos(a) * half * 1.1, y, Math.sin(a) * half * 1.1), { vel: new THREE.Vector3(Math.cos(a) * 1.5, 2.5 + Math.random() * 2, Math.sin(a) * 1.5), life: 1.2, size: 0.5, color: k % 3 ? 0xffd970 : 0xc690ff, spin: 3, gravity: 2 });
    }
  }

  // ------------------------------------------------------------------ construction site
  _siteSetup() {
    this.rampMat = [
      new THREE.MeshStandardMaterial({ map: this._tex('mudbrick', 1), roughness: 0.95, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ map: (() => { const t = this._tex('mudbrick', 1); t.repeat.set(4, 0.6); return t; })(), roughness: 1, color: 0xd8b48a, side: THREE.DoubleSide }),
    ];
    this.ramp = new THREE.Group();
    this.scene.add(this.ramp);
    this.cargoGeo = new RoundedBoxGeometry(0.34, 0.28, 0.32, 2, 0.04);
    this.rawStoneGeo = new THREE.DodecahedronGeometry(0.2, 0);
    this.rawStoneMat = new THREE.MeshStandardMaterial({ map: this._tex('limestone', 1), color: 0xd9c9b4, roughness: 0.95, flatShading: true });
    this.graniteMat = new THREE.MeshStandardMaterial({ map: this._tex('bedrock', 1), color: 0xe8a0a0, roughness: 0.5 });
    this.stock = new THREE.InstancedMesh(this.blockGeo, this.blockMat, 12);
    this.stockG = new THREE.InstancedMesh(this.blockGeo, this.graniteMat, 12);
    for (const m of [this.stock, this.stockG]) { m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; this.scene.add(m); }
    this.crew = null;
  }

  _rampGeom(base, Y) {
    const h = base / 2, z0 = -(h + 0.3), z1 = -(h + 1.75);
    const x0 = -h - 1.5, x1 = h - 0.2;
    this.rampInfo = { x0, x1, zc: (z0 + z1) / 2, h };
    const g = new THREE.BufferGeometry();
    const yTop = Math.max(0.05, Y);
    // wedge: bottom rectangle + sloped top
    const P = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [x0, 0.04, z0], [x1, yTop, z0], [x1, yTop, z1], [x0, 0.04, z1]];
    const faces = [[4, 5, 6, 7, 0], [0, 1, 5, 4, 1], [3, 7, 6, 2, 1], [1, 2, 6, 5, 1]];
    const pos = [], uvs = [], groups = [];
    let idx = 0;
    for (const [a, b, c, d, mat] of faces) {
      const q = [P[a], P[b], P[c], P[d]];
      const len = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) || 1;
      const uvq = [[0, 0], [len / 1.5, 0], [len / 1.5, 1], [0, 1]];
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...q[k]); uvs.push(...uvq[k]); }
      groups.push({ start: idx, count: 6, mat }); idx += 6;
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    for (const gr of groups) g.addGroup(gr.start, gr.count, gr.mat);
    g.computeVertexNormals();
    return g;
  }

  _buildRamp(Y) {
    this.ramp.clear();
    const mesh = new THREE.Mesh(this._rampGeom(this.tierSizes[0], Y), this.rampMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    // wooden sleepers across the slope
    const { x0, x1, zc } = this.rampInfo;
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.9 });
    for (let x = x0 + 0.5; x < x1 - 0.2; x += 0.55) {
      const t = (x - x0) / (x1 - x0);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 1.35), wood);
      s.position.set(x, 0.04 + t * (Y - 0.04) + 0.02, zc);
      s.rotation.z = Math.atan2(Y, x1 - x0);
      this.ramp.add(s);
    }
    this.ramp.add(mesh);
    this.rampY = Y;
  }

  _rampPoint(f) {
    const { x0, x1, zc } = this.rampInfo;
    const x = x0 + (x1 - x0) * f;
    return new THREE.Vector3(x, 0.04 + f * (this.rampY - 0.04) + 0.03, zc);
  }

  _siteLevel() {
    const base = this.tierSizes[0];
    this._buildRamp(this.tierBaseY(0));
    for (const w of this.crew ? Object.values(this.crew) : []) this._freeWorker(w);
    if (this.crewSledge) this.scene.remove(this.crewSledge);
    this.crew = { pusher: this._getWorker(), water: this._getWorker(), setterA: this._getWorker(), setterB: this._getWorker(), boss: this._getWorker() };
    this.crewSledge = this._sledge();
    const P = this.layout.plaza;
    this.plazaPos = new THREE.Vector3(P.x, 0, P.z);
    this.dockPos = this.plazaPos.clone();
    if (!this.plazaMesh) {
      this.plazaMesh = new THREE.Mesh(new RoundedBoxGeometry(2.9, 0.08, 2.9, 2, 0.03), new THREE.MeshStandardMaterial({ map: this._tex('limestone', 2), color: 0xcdb48e, roughness: 0.9 }));
      this.plazaMesh.receiveShadow = true;
      this.scene.add(this.plazaMesh);
    }
    this.plazaMesh.position.set(P.x, 0.03, P.z);
    this.crew.boss.group.position.set(P.x + 1.15, 0.08, P.z + 1.15);
    this.crew.boss.group.rotation.y = AZ;
    this.crew.boss.play('Talk');
    this._giveProp(this.crew.setterA, null);
    this.siteT = 0;
    this._placeSetters(0);
  }

  _placeSetters(t) {
    if (!this.crew) return;
    const n = this.tierSizes[Math.min(t, this.tierSizes.length - 1)], hh = n / 2;
    const y = this.tierBaseY(Math.min(t, this.tierSizes.length - 1));
    const { x1 } = this.rampInfo;
    const xs = Math.min(x1 - 0.4, hh - 0.6);
    this.crew.setterA.group.position.set(xs, y, -hh + 0.5);
    this.crew.setterB.group.position.set(xs - 0.9, y, -hh + 0.55);
    this.crew.setterA.group.rotation.y = -Math.PI / 2 + 0.4;
    this.crew.setterB.group.rotation.y = Math.PI / 2 - 0.4;
  }

  setSiteTier(t) {
    const Y = this.tierBaseY(Math.min(t, this.tierSizes.length - 1));
    this.rampGoal = Y;
    this._placeSetters(t);
  }

  // site: { working, frac (0..1 of the current placing cycle), stock: {block, granite} }
  updateSite(s, dt) {
    if (!this.crew) return;
    if (this.rampGoal !== undefined && Math.abs(this.rampGoal - this.rampY) > 0.01) {
      this._buildRamp(this.rampY + Math.sign(this.rampGoal - this.rampY) * Math.min(Math.abs(this.rampGoal - this.rampY), dt * 0.8));
    }
    const c = this.crew;
    const f = s.working ? s.frac : 0.47;
    // 0..0.45 down empty, 0.45..0.5 load at the foot, 0.5..0.95 up loaded, 0.95..1 setting the stone
    let rp, loaded, phase;
    if (f < 0.45) { rp = 1 - f / 0.45; loaded = false; phase = 'down'; }
    else if (f < 0.5) { rp = 0; loaded = true; phase = 'load'; }
    else if (f < 0.95) { rp = (f - 0.5) / 0.45; loaded = true; phase = 'up'; }
    else { rp = 1; loaded = true; phase = 'set'; }
    if (!s.working) { rp = 0; loaded = false; phase = 'wait'; }
    const p = this._rampPoint(rp);
    const up = new THREE.Vector3(1, 0, 0);
    const dir = phase === 'down' ? up.clone().negate() : up;
    this.crewSledge.position.copy(p);
    this.crewSledge.rotation.y = 0;
    this.crewSledge.rotation.z = Math.atan2(this.rampY, this.rampInfo.x1 - this.rampInfo.x0);
    this._setCargo(this.crewSledge.userData.cargo, s.good || 'block', loaded ? 1 : 0);
    c.pusher.group.position.copy(p).addScaledVector(up, phase === 'down' ? 0.75 : -0.75);
    c.pusher.group.position.y = this._rampPoint(Math.max(0, rp - 0.07)).y;
    c.pusher.group.rotation.y = Math.atan2(dir.x, dir.z);
    c.pusher.play(phase === 'up' ? 'Push' : phase === 'down' ? 'Walk' : 'Idle');
    // water carrier wets the slope ahead of the sledge
    const wp = THREE.MathUtils.clamp(phase === 'up' ? rp + 0.18 : (Math.sin(this.time * 0.5) * 0.5 + 0.5), 0, 1);
    const wpos = this._rampPoint(wp); wpos.z += 0.45;
    c.water.group.position.copy(wpos);
    c.water.group.rotation.y = Math.PI / 2;
    c.water.play(s.working ? 'Water' : 'Idle');
    if (s.working && phase === 'up' && Math.random() < dt * 4) this.spawn('glow', wpos.clone().add(new THREE.Vector3(0.4, 0.05, -0.3)), { life: 0.6, size: 0.25, color: 0x7fd8ff, vel: new THREE.Vector3(0, 0.3, 0) });
    const setting = phase === 'set' || (phase === 'up' && rp > 0.85);
    c.setterA.play(setting ? 'Lever' : 'Idle');
    c.setterB.play(setting ? 'Pick' : 'Idle');
    this._giveProp(c.setterA, null);
    // stock pile at the foot of the ramp
    const P = this.plazaPos;
    const put = (mesh, n, granite) => {
      mesh.count = Math.min(12, n);
      for (let i = 0; i < mesh.count; i++) {
        const col = i % 3;
        const row = granite ? 0 : Math.floor(i / 3) % 2, lay = granite ? Math.floor(i / 3) : Math.floor(i / 6);
        const x = granite ? P.x - 0.95 : P.x + (row ? -0.05 : 0.95);
        tmpM.compose(tmpV.set(x, 0.07 + H / 2 + lay * H * 0.98, P.z + (col - 1) * 0.98), tmpQ.identity(), tmpS.set(0.94, 1, 0.94));
        mesh.setMatrixAt(i, tmpM);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    put(this.stock, s.stock.block || 0, false);
    put(this.stockG, s.stock.granite || 0, true);
  }

  rampTop() { return this._rampPoint(1).add(new THREE.Vector3(0, 0.3, 0)); }

  // ------------------------------------------------------------------ characters API
  pharaohCheer() { this.pharaoh.play('Cheer', { once: true, after: 'Idle' }); }
  pharaohStomp() { this.pharaoh.play('Stomp', { once: true, after: 'Idle' }); }
  priestessCast() { this.priestess.play('Cast', { once: true, after: 'Idle' }); }
  priestessDance() { this.priestess.play('Dance'); }
  priestessIdle() { this.priestess.play('Idle'); }
  crowdCheer(dur = 2.4) { this.cheerT = dur; }
  setFlood(on) { this.floodGoal = on ? 1 : 0; if (on) this.floodWarn = false; }
  setStorm(on) { this.storm = on; }

  placeCapstone(top) {
    const y = this.tierBaseY(top) + 0.45;
    this.capstone.visible = true;
    this.capstone.position.set(0, y + 9, 0);
    this.beam.visible = true; this.beam.position.set(0, y + 20, 0); this.beam.material.opacity = 0;
    this.plan.clear();
    const t0 = this.time, token = this.capToken;
    return new Promise((res) => {
      const f = () => {
        if (token !== this.capToken) { this.updaters.splice(this.updaters.indexOf(f), 1); res(); return; }
        const k = Math.min(1, (this.time - t0) / 2.2);
        this.beam.material.opacity = 0.55 * Math.min(1, k * 3);
        this.capstone.position.y = y + 9 * (1 - easeInOut(k));
        this.capstone.rotation.y = Math.PI / 4 + (1 - k) * 6;
        if (k >= 1) {
          this.updaters.splice(this.updaters.indexOf(f), 1);
          this.shake = 0.25;
          for (let s = 0; s < 40; s++) {
            const a = Math.random() * Math.PI * 2;
            this.spawn('sparkle', new THREE.Vector3(0, y + 0.3, 0), { vel: new THREE.Vector3(Math.cos(a) * 3, 2 + Math.random() * 4, Math.sin(a) * 3), life: 1.6, size: 0.55, color: s % 2 ? 0xffe08a : 0xd59cff, gravity: 3, spin: 4 });
          }
          this.spawn('glow', new THREE.Vector3(0, y + 0.3, 0), { life: 1.0, size: 2, grow: 4, color: 0xffd080 });
          const fade = (dt) => { this.beam.material.opacity -= dt * 0.5; if (this.beam.material.opacity <= 0) { this.beam.visible = false; this.updaters.splice(this.updaters.indexOf(fade), 1); } };
          this.updaters.push(fade);
          res();
        }
      };
      this.updaters.push(f);
    });
  }

  setOrbit(on) { this.orbit = on; if (!on) this.camGoal.az = AZ; }

  setDaylight(p) {
    const a = new THREE.Color(0xffe6c0), b = new THREE.Color(0xffa860), c = new THREE.Color(0xff5c8a);
    const col = p < 0.6 ? a.lerp(b, p / 0.6) : b.lerp(c, (p - 0.6) / 0.4);
    this.sun.color.copy(col);
    this.sun.intensity = 2.55 - p * 1.0;
    this.hemi.color.set(0x9d82ff).lerp(new THREE.Color(0x7444ff), p);
    this.hemi.intensity = 0.95 - p * 0.2;
  }

  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q ? 2 : 1.35));
    const ms = q ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== ms) {
      this.sun.shadow.mapSize.set(ms, ms);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.resize();
  }

  // ------------------------------------------------------------------ camera + projection
  setLayout(w, h, freeTop, freeBottom) {
    this.vw = w; this.vh = h;
    this.focusFrac = ((freeTop + freeBottom) / 2) / h;
    this.resize();
  }

  resize() {
    const w = this.vw || window.innerWidth, h = this.vh || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this._applyCamera();
  }

  // glide the camera so that a world point comes into view (tutorial targets)
  focusOn(p) { this.camFocus = new THREE.Vector3(p.x, this.cam.target.y, p.z); }

  pan(dx, dz, user = true) {
    if (user) this.camFocus = null;
    const t = this.cam.target;
    t.x += dx; t.z += dz;
    const q = toUV(t);
    const u = THREE.MathUtils.clamp(q.u, -10, 10), v = THREE.MathUtils.clamp(q.v, -17, 20);
    const p = uv(u, v); t.x = p.x; t.z = p.z;
  }
  zoom(f) { this.camGoal.W = THREE.MathUtils.clamp(this.camGoal.W * f, 9, 28); this.cam.W = THREE.MathUtils.clamp(this.cam.W * f, 9, 28); }

  _applyCamera() {
    const w = this.vw || window.innerWidth, h = this.vh || window.innerHeight;
    const c = this.cam;
    const W = c.W, Hh = W * (h / w), f = this.focusFrac ?? 0.5;
    const cam = this.camera;
    cam.left = -W / 2; cam.right = W / 2; cam.top = Hh * f; cam.bottom = -Hh * (1 - f);
    cam.updateProjectionMatrix();
    const d = 80;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.4 : 0;
    cam.position.set(c.target.x + d * Math.cos(c.el) * Math.sin(c.az) + sx, c.target.y + d * Math.sin(c.el), c.target.z + d * Math.cos(c.el) * Math.cos(c.az));
    cam.lookAt(c.target);
    cam.updateMatrixWorld();
    // keep the shadow camera on the visible area
    this.sun.target.position.set(c.target.x, 0, c.target.z);
    this.sun.position.set(c.target.x - 11, 17, c.target.z - 3);
  }

  worldToScreen(v) {
    tmpV.copy(v).project(this.camera);
    return { x: (tmpV.x + 1) / 2 * this.vw, y: (1 - tmpV.y) / 2 * this.vh };
  }

  screenToPlane(x, y, planeY = 0) {
    const ndc = new THREE.Vector2(x / this.vw * 2 - 1, -(y / this.vh) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const pt = new THREE.Vector3();
    return rc.ray.intersectPlane(new THREE.Plane(UP, -planeY), pt) ? pt : null;
  }

  // plot under a tap: first the ground spot under the finger, then the bodies of tall buildings
  pickPlot(x, y) {
    const g = this.screenToPlane(x, y, 0);
    let best = null, bd = 1.62;
    if (g) for (const v of Object.values(this.plotViews)) {
      const d = Math.max(Math.abs(v.pos.x - g.x), Math.abs(v.pos.z - g.z));
      if (d < bd) { bd = d; best = v.plot.id; }
    }
    if (best) { this._lastPickDist = 0; return best; }
    let bp = 46;
    for (const v of Object.values(this.plotViews)) {
      const bv = [...this.bviews.values()].find((q) => q.b.plot === v.plot.id);
      if (!bv) continue;
      for (const hy of [0.8, 1.6]) {
        const s = this.worldToScreen(v.pos.clone().setY(hy));
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bp) { bp = d; best = v.plot.id; }
      }
    }
    this._lastPickDist = bp;
    return best;
  }

  // the road tile under a screen point
  pickTile(x, y) {
    const g = this.screenToPlane(x, y, 0);
    return g ? { x: Math.round(g.x), z: Math.round(g.z) } : null;
  }

  // ------------------------------------------------------------------ loop
  update(dt, gdt = dt) {
    this.time += dt;
    for (const f of [...this.updaters]) f(dt);
    if (this.cheerT > 0) this.cheerT -= dt;
    for (const a of this.actors) if (a.group.visible) a.update(a === this.pharaoh || a === this.priestess ? dt : gdt);
    this._updateProps();
    this._updateRoadFx(dt);
    this._updateBuildings(dt);
    this._updateParticles(dt);
    this._updateBlocks(dt);
    if (this.capstone.visible) this.capstone.material.emissiveIntensity = 0.45 + Math.sin(this.time * 3) * 0.2;
    const c = this.cam, g = this.camGoal;
    if (this.camFocus) {
      const d = this.camFocus.clone().sub(c.target);
      if (d.length() < 0.05) this.camFocus = null;
      else { d.multiplyScalar(1 - Math.exp(-dt * 3)); this.pan(d.x, d.z, false); }
    }
    if (this.orbit) g.az += dt * 0.22;
    const k = 1 - Math.exp(-dt * 3);
    c.az += (g.az - c.az) * k;
    c.W += (g.W - c.W) * k;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    this._applyCamera();
    this.renderer.render(this.scene, this.camera);
  }
}

const FLASH = new THREE.Color(1.6, 1.35, 0.8);
const tmpCol = new THREE.Color();
