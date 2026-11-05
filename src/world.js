// The isometric 3D diorama for the pyramid works: floating desert island, Nile, Meshy props,
// production buildings on plots, carriers and sledge haulers, the growing pyramid and effects.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PLOTS } from './plots.js';

export const H = 0.62;        // pyramid block / tier height
export const FOUND = 0.16;    // foundation plate height
const ISLAND = 18;            // island half size
const EL = THREE.MathUtils.degToRad(44);
const AZ = Math.PI / 4;
const BUILD_SIZE = 2.5;       // building footprint (world units)

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

    this._lights();
    this._island();
    this._nile();
    this._plots();
    this._decor();
    this._characters();
    this._particles();
    this._pyramidSetup();
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
    // rocky ridge on the right side (quarries and mines)
    const rockM = new THREE.MeshStandardMaterial({ map: this._tex('bedrock', 1), color: 0xe8c9a8, roughness: 0.9, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + Math.random() * 0.9, 0), rockM);
      const u = 8.2 + Math.random() * 5, v = -10 + Math.random() * 20;
      if (PLOTS.some((p) => Math.hypot(p.u - u, p.v - v) < 1.9)) continue;
      r.position.copy(uv(u, v)); r.position.y = 0.1;
      r.scale.y = 0.55 + Math.random() * 0.4; r.rotation.set(Math.random(), Math.random() * 3, Math.random());
      r.castShadow = r.receiveShadow = true;
      g.add(r);
    }
    // soft dunes
    const duneM = new THREE.MeshStandardMaterial({ map: this._tex('sand', 3), roughness: 1 });
    for (const [x, z, r] of [[-13, -12, 3.5], [12, -13, 3], [3, -15, 2.4], [-15, -3, 2.4], [15.5, 14, 2.6], [-15, 15, 2.6]]) {
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
    const patch = (kind) => canvasTex(128, 128, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2);
      if (kind === 'fertile') { g.addColorStop(0, 'rgba(70,52,30,0.95)'); g.addColorStop(0.7, 'rgba(90,70,40,0.75)'); g.addColorStop(1, 'rgba(90,70,40,0)'); }
      else if (kind === 'rock') { g.addColorStop(0, 'rgba(150,120,105,0.9)'); g.addColorStop(0.7, 'rgba(160,130,110,0.6)'); g.addColorStop(1, 'rgba(160,130,110,0)'); }
      else { g.addColorStop(0, 'rgba(255,236,200,0.6)'); g.addColorStop(0.7, 'rgba(255,230,190,0.35)'); g.addColorStop(1, 'rgba(255,230,190,0)'); }
      c.fillStyle = g; c.fillRect(0, 0, w, w);
      if (kind !== 'desert') for (let i = 0; i < 90; i++) { c.fillStyle = kind === 'rock' ? 'rgba(90,70,70,0.35)' : 'rgba(40,60,20,0.35)'; const a = Math.random() * 6.28, r = Math.random() * w * 0.42; c.fillRect(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, 3, 3); }
    });
    const ring = canvasTex(256, 256, (c, w) => {
      c.strokeStyle = 'rgba(255,214,110,0.95)'; c.lineWidth = 7; c.setLineDash([22, 14]);
      c.shadowColor = 'rgba(255,200,90,0.9)'; c.shadowBlur = 10;
      c.beginPath(); c.arc(w / 2, w / 2, w * 0.42, 0, Math.PI * 2); c.stroke();
    });
    const pt = { fertile: patch('fertile'), rock: patch('rock'), desert: patch('desert') };
    this.plotViews = {};
    for (const p of PLOTS) {
      const pos = uv(p.u, p.v);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(1.7, 32), new THREE.MeshStandardMaterial({ map: pt[p.terrain], transparent: true, depthWrite: false, roughness: 1 }));
      ground.rotation.x = -Math.PI / 2; ground.position.set(pos.x, 0.02, pos.z); ground.receiveShadow = true;
      const r = new THREE.Mesh(new THREE.CircleGeometry(1.45, 32), new THREE.MeshBasicMaterial({ map: ring, transparent: true, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.set(pos.x, 0.04, pos.z); r.renderOrder = 2;
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.icon('plot'), transparent: true, depthWrite: false }));
      marker.scale.set(1.25, 1.25, 1); marker.position.set(pos.x, 0.9, pos.z); marker.renderOrder = 12;
      this.scene.add(ground, r, marker);
      this.plotViews[p.id] = { plot: p, pos, ground, ring: r, marker, seed: Math.random() * 6 };
    }
  }

  setPlotMarkers(allowedTerrains, isFree, highlight = null) {
    for (const v of Object.values(this.plotViews)) {
      const on = allowedTerrains.includes(v.plot.terrain) && isFree(v.plot.id);
      v.marker.visible = on; v.ring.visible = on;
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
    const nearPlot = (u, v, d = 2.6) => PLOTS.some((p) => Math.hypot(p.u - u, p.v - v) < d);
    const place = (name, height, u, v, rot = 0, opts) => {
      const m = this._model(name, height, opts);
      m.position.copy(uv(u, v));
      m.rotation.y = AZ + rot;
      return m;
    };
    place('temple', 4.4, 0, 20.4, 0, { receive: true });      // across the Nile
    place('obelisk', 4.2, -3.6, 9.0);
    place('obelisk', 4.2, 3.6, 9.0);
    place('anubis', 1.7, -1.7, 10.2, 0.15);
    place('anubis', 1.7, 1.7, 10.2, -0.15);
    place('sphinx', 2.3, 9.8, 9.4, -0.5);
    place('sphinx', 2.3, -9.8, 9.4, 0.5);
    const pave = this._tex('limestone', 1); pave.repeat.set(2, 3);
    const way = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.6), new THREE.MeshStandardMaterial({ map: pave, color: 0xe6d2b8, roughness: 0.9 }));
    way.rotation.x = -Math.PI / 2; way.rotation.z = AZ; way.position.copy(uv(0, 9.6)); way.position.y = 0.015; way.receiveShadow = true;
    this.scene.add(way);
    const camels = [[-9.8, 13.6, 1.2], [9.9, 13.4, -1.1]];
    const palms = [[-8.6, 14.6], [8.6, 14.6], [0, 15.0], [-10.6, 11.2], [10.8, 11.0], [-9.2, 3.2], [-9.4, -3.6], [-8.8, -8.8], [8.4, -12.4], [-5.2, 19.0], [5.2, 19.0], [-2.6, 18.6], [2.6, 18.6], [-8.6, 17.6], [8.6, 17.6], [0, -13.6]];
    palms.forEach(([u, v], i) => {
      if (nearPlot(u, v) || camels.some(([a, b]) => Math.hypot(a - u, b - v) < 1.6)) return;
      const p = place('palm', 2.6 + (i % 3) * 0.45, u, v, i * 1.3);
      const sway = Math.random() * 6;
      this.updaters.push(() => { p.rotation.z = Math.sin(this.time * 0.9 + sway) * 0.025; });
    });
    const cs = camels.map(([u, v, r]) => place('camel', 1.5, u, v, r));
    this.updaters.push(() => { cs.forEach((c, i) => { c.scale.y = 1 + Math.sin(this.time * (1.5 + i * 0.2) + i) * 0.012; }); });
    const boat = this._model('boat', 1.9);
    this.updaters.push(() => {
      const u = Math.sin(this.time * 0.05) * 9;
      const dir = Math.cos(this.time * 0.05) >= 0 ? 1 : -1;
      boat.position.copy(uv(u, this.nile.v)); boat.position.y = Math.sin(this.time * 1.6) * 0.03 + this.floodLevel * 0.3;
      boat.rotation.y = Math.PI / 4 + (dir > 0 ? 0 : Math.PI);
      boat.rotation.z = Math.sin(this.time * 1.3) * 0.03;
    });
    // braziers at the site corners
    this.fires = [];
    for (const [u, v] of [[-1.5, 7.9], [1.5, 7.9], [-8.6, 0], [-3.9, -12.9], [3.9, -12.9]]) {
      const b = place('brazier', 0.85, u, v);
      this.fires.push(b.position.clone().setY(0.92));
    }
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
    dais.position.copy(uv(-2.3, -12.9)); dais.rotation.y = AZ;
    this.scene.add(dais);
    this.daisPos = dais.position.clone();
    const altar = new THREE.Group();
    const a1 = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.2, 1.7, 2, 0.05), lime); a1.position.y = 0.1;
    const rug = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 1.3), purpleM); rug.position.y = 0.21;
    altar.add(a1, rug);
    altar.traverse((m) => { if (m.isMesh) { m.receiveShadow = true; m.castShadow = true; } });
    altar.position.copy(uv(2.3, -12.9)); altar.rotation.y = AZ;
    this.scene.add(altar);
    this.altarPos = altar.position.clone();
  }

  _characters() {
    const A = this.assets.models;
    const clip = (name) => A[name]?.animations?.[0];
    const mk = (name, height, clips, add = true) => {
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
      if (add) this.scene.add(g);
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

    // carriers (goods between buildings) and sledge haulers (blocks to the pyramid)
    const wClips = { Carry: A.worker.animations[0], Walk: clip('anim_worker_walk'), Cheer: clip('anim_worker_cheer'), Idle: clip('anim_worker_idle') };
    this.carriers = [];
    for (let i = 0; i < 8; i++) {
      const w = mk('worker', 1.05, wClips);
      w.group.visible = false;
      const ic = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      ic.scale.set(0.55, 0.55, 1); ic.position.y = 1.45; ic.renderOrder = 12;
      w.group.add(ic);
      w.iconSprite = ic; w.busy = false;
      this.carriers.push(w);
    }
    this.haulers = [];
    for (let i = 0; i < 4; i++) {
      const w = mk('worker', 1.05, wClips);
      w.group.visible = false;
      const sl = this._model('sledge', 0.62);
      sl.visible = false;
      w.sledge = sl; w.busy = false;
      this.haulers.push(w);
    }
    // idle builders who cheer at milestones
    this.crowd = [];
    for (const [u, v, r] of [[-1.3, -7.4, 0.5], [1.3, -7.4, -0.5]]) {
      const w = mk('worker', 1.05, wClips);
      w.group.position.copy(uv(u, v)); w.group.rotation.y = AZ + r;
      w.play('Idle');
      this.crowd.push(w);
    }
  }

  // route around the pyramid if the straight line would cross it
  _route(from, to) {
    const R = (this.pyrRadius || 5) + 0.9;
    const inside = (p) => { const q = toUV(p); return Math.abs(q.u) + Math.abs(q.v) < R; };
    let crosses = false;
    for (let k = 1; k < 10; k++) if (inside(from.clone().lerp(to, k / 10))) { crosses = true; break; }
    if (!crosses) return [from, to];
    const corners = [uv(R + 0.4, 0), uv(-R - 0.4, 0), uv(0, R + 0.4), uv(0, -R - 0.4)];
    let best = null, bl = Infinity;
    for (const c of corners) { const l = from.distanceTo(c) + c.distanceTo(to); if (l < bl) { bl = l; best = c; } }
    return [from, best, to];
  }

  sendCarrier(from, to, iconKey) {
    const w = this.carriers.find((c) => !c.busy);
    if (!w) return false;
    w.busy = true;
    w.path = this._route(from.clone().setY(0), to.clone().setY(0));
    w.seg = 0; w.segT = 0;
    w.speed = 1.9;
    w.iconSprite.material.map = this.icon(iconKey); w.iconSprite.material.needsUpdate = true;
    w.group.visible = true;
    w.group.position.copy(w.path[0]);
    w.play('Carry');
    return true;
  }

  sendHauler(from, to) {
    const w = this.haulers.find((c) => !c.busy);
    if (!w) return false;
    w.busy = true;
    w.path = this._route(from.clone().setY(0), to.clone().setY(0));
    w.seg = 0; w.segT = 0; w.speed = 1.6;
    w.group.visible = true; w.sledge.visible = true;
    w.play('Walk', { speed: 0.85 });
    return true;
  }

  _walk(w, dt) {
    const a = w.path[w.seg], b = w.path[w.seg + 1];
    const len = a.distanceTo(b) || 0.001;
    w.segT += (w.speed * dt) / len;
    if (w.segT >= 1) {
      w.seg++; w.segT = 0;
      if (w.seg >= w.path.length - 1) return true;
      return false;
    }
    w.group.position.copy(a).lerp(b, w.segT);
    const dir = b.clone().sub(a);
    const target = faceDir(dir.x, dir.z);
    w.group.rotation.y += Math.atan2(Math.sin(target - w.group.rotation.y), Math.cos(target - w.group.rotation.y)) * Math.min(1, dt * 10);
    w.dir = dir.normalize();
    return false;
  }

  _updateWorkers(dt) {
    for (const w of this.carriers) {
      if (!w.busy) continue;
      if (this._walk(w, dt)) { w.busy = false; w.group.visible = false; }
    }
    for (const w of this.haulers) {
      if (!w.busy) continue;
      if (this._walk(w, dt)) { w.busy = false; w.group.visible = false; w.sledge.visible = false; continue; }
      const d = w.dir || new THREE.Vector3(1, 0, 0);
      w.sledge.position.copy(w.group.position).addScaledVector(d, -1.1);
      w.sledge.rotation.y = Math.atan2(d.z, -d.x);
    }
    for (const w of this.crowd) {
      if (w.cheering > 0) { w.cheering -= dt; if (w.cheering <= 0) w.play('Idle'); }
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
    // foundation slab
    const slab = new THREE.Mesh(new RoundedBoxGeometry(BUILD_SIZE * 1.04, 0.1, BUILD_SIZE * 1.04, 2, 0.04), new THREE.MeshStandardMaterial({ map: this._tex('limestone', 2), color: 0xd8c2a2, roughness: 0.9 }));
    slab.rotation.y = AZ; slab.position.y = 0.03; slab.receiveShadow = true;
    g.add(slab);
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
    bubble.scale.set(1.0, 1.1, 1); bubble.position.y = model.userData.height + 1.05; bubble.visible = false; bubble.renderOrder = 13;
    g.add(bubble);
    this.scene.add(g);
    const view = { b, g, model, scaffold, pips, bubble, pos: pv.pos.clone(), bubbleKey: null, grow: instant ? 1 : 0, bump: 0 };
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
    for (const v of this.bviews.values()) this.scene.remove(v.g);
    this.bviews.clear();
    for (const w of [...this.carriers, ...this.haulers]) { w.busy = false; w.group.visible = false; if (w.sledge) w.sledge.visible = false; }
    this.floodGoal = 0; this.floodWarn = false; this.storm = false;
    this.cam.az = AZ + 0.5;
    const c0 = uv(0, 1.2);
    this.cam.target.set(c0.x, 0.5, c0.z);
    this.camGoal.W = 17; this.cam.W = 22;
    this.resize();
  }

  tierBaseY(t) { return FOUND + t * H; }
  cellWorld(t, i, j) {
    const n = this.tierSizes[t], off = (n - 1) / 2;
    return new THREE.Vector3(i - off, this.tierBaseY(t) + H / 2, j - off);
  }

  // the edge of the pyramid site that faces a building (sledge destination)
  siteEdge(from) {
    const q = toUV(from);
    const L = Math.abs(q.u) + Math.abs(q.v) || 1;
    const R = this.pyrRadius + 0.3;
    return uv(q.u / L * R, q.v / L * R);
  }

  placeBlock(index) {
    const o = this.order[index];
    if (!o) return null;
    const [t, i, j] = o;
    const m = this.blocks;
    const idx = m.count++;
    const p = this.cellWorld(t, i, j);
    const v = 0.9 + Math.random() * 0.14;
    m.setColorAt(idx, new THREE.Color(v, v * (0.98 + Math.random() * 0.03), v * (0.95 + Math.random() * 0.05)));
    m.instanceColor.needsUpdate = true;
    tmpM.compose(p, tmpQ.identity(), tmpS.set(0.0001, 0.0001, 0.0001));
    m.setMatrixAt(idx, tmpM);
    m.instanceMatrix.needsUpdate = true;
    this.anims.push({ idx, p, t: 0, dur: 0.32, drop: 2.2 });
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
      const y = an.p.y + an.drop * (1 - fall * fall);
      let sy = 1, sx = 1;
      if (fall >= 1) { const q = (an.t - an.dur * 0.7) / (an.dur * 0.3); sy = 1 - Math.sin(Math.min(1, q) * Math.PI) * 0.16; sx = 1 + (1 - sy) * 0.5; }
      tmpM.compose(tmpV.set(an.p.x, y - (1 - sy) * H * 0.5, an.p.z), tmpQ.identity(), tmpS.set(sx, sy, sx));
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

  // ------------------------------------------------------------------ characters API
  pharaohCheer() { this.pharaoh.play('Cheer', { once: true, after: 'Idle' }); }
  pharaohStomp() { this.pharaoh.play('Stomp', { once: true, after: 'Idle' }); }
  priestessCast() { this.priestess.play('Cast', { once: true, after: 'Idle' }); }
  priestessDance() { this.priestess.play('Dance'); }
  priestessIdle() { this.priestess.play('Idle'); }
  crowdCheer(dur = 2.4) { for (const w of this.crowd) { w.cheering = dur; w.play('Cheer'); } }
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

  pan(dx, dz) {
    const t = this.cam.target;
    t.x += dx; t.z += dz;
    const q = toUV(t);
    const u = THREE.MathUtils.clamp(q.u, -9, 9), v = THREE.MathUtils.clamp(q.v, -12, 16);
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

  // nearest plot to a tap (checks the ground spot and the middle of a building)
  pickPlot(x, y) {
    let best = null, bd = 56;
    for (const v of Object.values(this.plotViews)) {
      for (const hy of [0.2, 1.0, 1.8]) {
        const s = this.worldToScreen(v.pos.clone().setY(hy));
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bd) { bd = d; best = v.plot.id; }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ loop
  update(dt, gdt = dt) {
    this.time += dt;
    for (const f of [...this.updaters]) f(dt);
    for (const a of this.actors) a.update(a === this.pharaoh || a === this.priestess || this.crowd.includes(a) ? dt : gdt);
    this._updateWorkers(gdt);
    this._updateBuildings(dt);
    this._updateParticles(dt);
    this._updateBlocks(dt);
    if (this.capstone.visible) this.capstone.material.emissiveIntensity = 0.45 + Math.sin(this.time * 3) * 0.2;
    const c = this.cam, g = this.camGoal;
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
