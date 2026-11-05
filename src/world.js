// The isometric 3D diorama: floating desert island, Nile, Meshy props + characters,
// the pyramid itself (instanced blocks) and all visual effects.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { STONE, GOLD, GRANITE } from './logic.js';

export const H = 0.62;        // tier / block height
export const FOUND = 0.16;    // foundation plate height
const ISLAND = 18;            // island half size
const EL = THREE.MathUtils.degToRad(44);
const AZ = Math.PI / 4;

const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// diagonal (screen aligned) coordinates -> world. u: right on screen, v: back (up on screen)
function uv(u, v) { return new THREE.Vector3((u - v) / Math.SQRT2, 0, (-u - v) / Math.SQRT2); }
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
    this.cam = { az: AZ, el: EL, W: 16, target: new THREE.Vector3(0, 0.5, 0), focusFrac: 0.45 };
    this.camGoal = { az: AZ, W: 16, ty: 0.5 };
    this.orbit = false;
    this.shake = 0;

    this.time = 0;
    this.actors = [];
    this.anims = [];      // block drop / flash animations
    this.updaters = [];   // per-frame callbacks

    this._lights();
    this._island();
    this._nile();
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
    sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun); this.scene.add(sun.target);
    this.sun = sun;
    const rim = new THREE.DirectionalLight(0xb48cff, 0.75);
    rim.position.set(9, 6, 11);
    this.scene.add(rim);
    this.rim = rim;
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
    // inverted rocky root below the island
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
    // soft dunes
    const duneM = new THREE.MeshStandardMaterial({ map: this._tex('sand', 3), roughness: 1 });
    const duneSpots = [[-13, -12, 3.5], [12, -13, 3], [-14, 6, 2.6], [14, 9, 3.2], [3, -15, 2.4], [-6, 14, 2.2], [15, -2, 2], [-15, -3, 2.4]];
    for (const [x, z, r] of duneSpots) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), duneM);
      d.scale.set(1.6, 0.32, 1);
      d.rotation.y = Math.random() * Math.PI;
      d.position.set(x, -0.05, z);
      d.receiveShadow = true; d.castShadow = true;
      g.add(d);
    }
    // scattered rocks
    const rockM = new THREE.MeshStandardMaterial({ map: this._tex('bedrock', 1), roughness: 0.9, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.25, 0), rockM);
      let x, z;
      do { x = (Math.random() * 2 - 1) * (ISLAND - 1); z = (Math.random() * 2 - 1) * (ISLAND - 1); } while (Math.abs(x) < 7.5 && Math.abs(z) < 7.5);
      r.position.set(x, 0.05, z); r.scale.y = 0.6; r.rotation.set(Math.random(), Math.random(), Math.random());
      r.castShadow = true;
      g.add(r);
    }
    this.scene.add(g);
    this.island = g;
  }

  _nile() {
    // The Nile crosses the back of the island (screen-horizontal) and falls off both edges.
    const len = 60, wid = 3.4, v = 16.2;
    const water = this._tex('water', 1); water.repeat.set(len / 5, 1);
    const alpha = canvasTex(4, 64, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#000'); gr.addColorStop(0.18, '#fff'); gr.addColorStop(0.82, '#fff'); gr.addColorStop(1, '#000');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
    });
    alpha.colorSpace = THREE.NoColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: water, alphaMap: alpha, transparent: true, roughness: 0.15, metalness: 0.1, emissive: 0x2a1060, emissiveIntensity: 0.35, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(len, wid), mat);
    plane.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(plane);
    holder.rotation.y = Math.PI / 4;  // along screen-horizontal (world (1,0,-1))
    holder.position.copy(uv(0, v)); holder.position.y = 0.03;
    plane.receiveShadow = true;
    this.scene.add(holder);
    // muddy banks
    const bankM = new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false });
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(len, wid + 1.4), bankM);
    bank.rotation.x = -Math.PI / 2; bank.position.y = -0.01;
    holder.add(bank);
    this.updaters.push((dt) => { water.offset.x -= dt * 0.05; water.offset.y = Math.sin(this.time * 0.4) * 0.02; });

    // waterfalls where the river leaves the island
    const fallTex = this._tex('water', 1); fallTex.repeat.set(1, 3);
    const fallM = new THREE.MeshStandardMaterial({ map: fallTex, transparent: true, opacity: 0.9, emissive: 0x5a2aa0, emissiveIntensity: 0.4, side: THREE.DoubleSide, depthWrite: false });
    // edge crossing: island edge is x = -ISLAND (left) and z = -ISLAND (right) for the river line
    const ends = [];
    for (const s of [-1, 1]) {
      // param along u where the river leaves the square
      for (let u = 0; Math.abs(u) < 40; u += s * 0.05) {
        const p = uv(u, v);
        if (Math.abs(p.x) > ISLAND || Math.abs(p.z) > ISLAND) { ends.push(uv(u - s * 0.05, v)); break; }
      }
    }
    for (const e of ends) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(wid * 0.9, 9), fallM);
      f.position.set(e.x, -4.5, e.z);
      // face outward from island edge
      f.lookAt(e.x * 2, -4.5, e.z * 2);
      this.scene.add(f);
      const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.assets.tex.cloud, transparent: true, opacity: 0.7, depthWrite: false }));
      mist.scale.set(5, 2.6, 1);
      mist.position.set(e.x * 1.02, -8.5, e.z * 1.02);
      this.scene.add(mist);
    }
    this.updaters.push((dt) => { fallTex.offset.y += dt * 0.9; });
    this.nile = { v, holder };
  }

  _model(name, height, opts = {}) {
    const src = this.assets.models[name];
    const o = src.scene.clone(true);
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const s = height / size.y;
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
    this.scene.add(wrap);
    return wrap;
  }

  _decor() {
    const place = (name, height, u, v, rot = 0, opts) => {
      const m = this._model(name, height, opts);
      m.position.copy(uv(u, v));
      m.rotation.y = AZ + rot;   // AZ: face the camera
      return m;
    };
    // sacred avenue behind the pyramid
    place('temple', 4.2, 0, 12.6, 0, { receive: true });
    place('obelisk', 4.4, -3.4, 9.2);
    place('obelisk', 4.4, 3.4, 9.2);
    place('anubis', 1.8, -2.2, 10.3, 0.15);
    place('anubis', 1.8, 2.2, 10.3, -0.15);
    place('sphinx', 2.3, 7.8, 8.6, -0.5);
    place('sphinx', 2.3, -7.8, 8.6, 0.5);
    // paved processional way between the obelisks
    const pave = this._tex('limestone', 1); pave.repeat.set(2, 5);
    const way = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 7.2), new THREE.MeshStandardMaterial({ map: pave, color: 0xe6d2b8, roughness: 0.9 }));
    way.rotation.x = -Math.PI / 2; way.rotation.z = AZ; way.position.copy(uv(0, 8.4)); way.position.y = 0.015; way.receiveShadow = true;
    this.scene.add(way);
    // palms along the Nile
    const palms = [[-11, 13.8], [-6.5, 14.0], [-3.2, 14.6], [5.2, 14.1], [9.8, 13.6], [-9, 18.7], [-3, 18.8], [3.5, 18.6], [12.3, 11.5], [-12.8, 10.6], [10.2, 8.0], [-10.4, 7.6], [-9.6, -4.2], [9.4, -4.8], [-11.5, 1.5], [11.2, 0.6], [-6.5, -8.5], [7.0, -8.8]];
    palms.forEach(([u, v], i) => {
      const p = place('palm', 2.6 + (i % 3) * 0.45, u, v, i * 1.3);
      const sway = Math.random() * 6;
      this.updaters.push(() => { p.rotation.z = Math.sin(this.time * 0.9 + sway) * 0.025; });
    });
    // camels resting near the river
    const c1 = place('camel', 1.6, -9.6, 12.0, 1.2);
    const c2 = place('camel', 1.5, 10.8, 12.4, -1.1);
    this.updaters.push(() => { c1.scale.y = 1 + Math.sin(this.time * 1.7) * 0.012; c2.scale.y = 1 + Math.sin(this.time * 1.5 + 1) * 0.012; });
    // boat on the Nile
    const boat = this._model('boat', 1.9);
    this.updaters.push(() => {
      const u = Math.sin(this.time * 0.05) * 9;
      const dir = Math.cos(this.time * 0.05) >= 0 ? 1 : -1;
      boat.position.copy(uv(u, this.nile.v)); boat.position.y = 0.0 + Math.sin(this.time * 1.6) * 0.03;
      boat.rotation.y = Math.PI / 4 + (dir > 0 ? 0 : Math.PI);
      boat.rotation.z = Math.sin(this.time * 1.3) * 0.03;
    });
    // quarry: stacked raw limestone blocks
    const qm = new THREE.MeshStandardMaterial({ map: this._tex('limestone', 1), roughness: 0.85 });
    const qg = new RoundedBoxGeometry(0.9, 0.55, 0.9, 2, 0.06);
    const quarry = uv(9.4, 3.4);
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(qg, qm);
      const layer = i < 5 ? 0 : i < 8 ? 1 : 2;
      b.position.set(quarry.x + ((i % 3) - 1) * 0.95 + layer * 0.3, 0.28 + layer * 0.56, quarry.z + (Math.floor(i / 3) % 2) * 0.95 - layer * 0.2);
      b.rotation.y = (Math.random() - 0.5) * 0.2;
      b.castShadow = b.receiveShadow = true;
      this.scene.add(b);
    }
    this.quarry = quarry;

    // braziers with fire around the building site
    this.fires = [];
    const brazierSpots = [[-7.6, -1.0], [7.6, -1.0], [-2.3, 6.4], [2.3, 6.4]];
    for (const [u, v] of brazierSpots) {
      const b = place('brazier', 0.85, u, v);
      this.fires.push(b.position.clone().setY(0.92));
    }
    this.braziers = brazierSpots;

    // pharaoh's dais with canopy (left) and the priestess' altar (right)
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
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 1.7), new THREE.MeshStandardMaterial({ color: 0xe8b23a, metalness: 0.6, roughness: 0.4, transparent: true, opacity: 0.95 }));
    fringe.position.y = 2.24; fringe.scale.set(1, 1, 1);
    dais.add(canopy, fringe);
    dais.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    dais.position.copy(uv(-4.7, 5.9)); dais.rotation.y = AZ;
    this.scene.add(dais);
    this.daisPos = dais.position.clone();

    const altar = new THREE.Group();
    const a1 = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.2, 1.7, 2, 0.05), lime); a1.position.y = 0.1;
    const rug = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 1.3), purpleM); rug.position.y = 0.21;
    altar.add(a1, rug);
    altar.traverse((m) => { if (m.isMesh) { m.receiveShadow = true; m.castShadow = true; } });
    altar.position.copy(uv(4.7, 5.9)); altar.rotation.y = AZ;
    this.scene.add(altar);
    this.altarPos = altar.position.clone();
  }

  _characters() {
    const A = this.assets.models;
    const clipsOf = (base, extra) => {
      const c = {};
      for (const [k, v] of Object.entries(extra)) { const a = A[v]?.animations?.[0]; if (a) c[k] = a; }
      return c;
    };
    const mk = (name, height, clips) => {
      const src = A[name];
      const root = SkeletonUtils.clone(src.scene);
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

    // pharaoh on the dais
    this.pharaoh = mk('pharaoh', 1.32, { Idle: A.pharaoh.animations[0], ...clipsOf(null, { Cheer: 'anim_pharaoh_cheer', Stomp: 'anim_pharaoh_stomp' }) });
    this.pharaoh.group.position.copy(this.daisPos).setY(0.52);
    this.pharaoh.group.rotation.y = AZ + 0.35;
    this.pharaoh.play('Idle');

    this.priestess = mk('priestess', 1.25, { Idle: A.priestess.animations[0], ...clipsOf(null, { Cast: 'anim_priestess_cast', Dance: 'anim_priestess_dance' }) });
    this.priestess.group.position.copy(this.altarPos).setY(0.22);
    this.priestess.group.rotation.y = AZ - 0.35;
    this.priestess.play('Idle');

    // workers: carriers between quarry and pyramid, sledge haulers between Nile dock and pyramid
    const wClips = { Carry: A.worker.animations[0], ...clipsOf(null, { Walk: 'anim_worker_walk', Cheer: 'anim_worker_cheer', Idle: 'anim_worker_idle' }) };
    const blockM = new THREE.MeshStandardMaterial({ map: this._tex('limestone', 1), roughness: 0.85 });
    const blockG = new RoundedBoxGeometry(0.42, 0.3, 0.32, 2, 0.04);
    this.workers = [];
    const carryPath = [uv(8.6, 2.2), uv(8.0, 0.6), uv(7.0, -0.6)];
    const sledgePath = [uv(-7.2, 13.2), uv(-7.0, 9.4), uv(-7.4, 4.0), uv(-7.4, 1.2)];
    for (let i = 0; i < 3; i++) {
      const w = mk('worker', 1.12, wClips);
      const block = new THREE.Mesh(blockG, blockM); block.castShadow = true;
      this.scene.add(block);
      w.kind = 'carrier'; w.path = carryPath; w.s = i / 3; w.dir = i % 2 ? 1 : -1; w.speed = 0.9; w.block = block; w.wait = 0;
      w.lh = w.root.getObjectByName('LeftHand'); w.rh = w.root.getObjectByName('RightHand');
      this.workers.push(w);
    }
    for (let i = 0; i < 2; i++) {
      const w = mk('worker', 1.12, wClips);
      const sl = this._model('sledge', 0.62);
      w.kind = 'hauler'; w.path = sledgePath; w.s = i * 0.5; w.dir = 1; w.speed = 0.55; w.sledge = sl; w.wait = 0;
      this.workers.push(w);
    }
    for (const w of this.workers) {
      w.len = 0; w.seg = [];
      for (let k = 0; k < w.path.length - 1; k++) { const l = w.path[k].distanceTo(w.path[k + 1]); w.seg.push(l); w.len += l; }
      w.play(w.kind === 'carrier' ? (w.dir > 0 ? 'Carry' : 'Walk') : 'Walk', { speed: w.kind === 'hauler' ? 0.8 : 1 });
    }
  }

  _pathPoint(w, s) {
    let d = THREE.MathUtils.clamp(s, 0, 1) * w.len;
    for (let k = 0; k < w.seg.length; k++) {
      if (d <= w.seg[k] || k === w.seg.length - 1) {
        const t = w.seg[k] ? Math.min(1, d / w.seg[k]) : 0;
        return { p: w.path[k].clone().lerp(w.path[k + 1], t), dir: w.path[k + 1].clone().sub(w.path[k]).normalize() };
      }
      d -= w.seg[k];
    }
    return { p: w.path[0].clone(), dir: new THREE.Vector3(1, 0, 0) };
  }

  _updateWorkers(dt) {
    for (const w of this.workers) {
      if (w.cheering > 0) { w.cheering -= dt; if (w.cheering <= 0) w.play(w.kind === 'carrier' ? (w.dir > 0 ? 'Carry' : 'Walk') : 'Walk'); }
      else if (w.wait > 0) {
        w.wait -= dt;
        if (w.wait <= 0) { w.dir *= -1; w.play(w.kind === 'carrier' ? (w.dir > 0 ? 'Carry' : 'Walk') : 'Walk'); }
      } else {
        w.s += (w.dir * w.speed * dt) / w.len;
        if (w.kind === 'hauler') {
          if (w.s >= 1) w.s = 0;
        } else if (w.s >= 1 || w.s <= 0) {
          w.s = THREE.MathUtils.clamp(w.s, 0, 1);
          w.wait = 0.9; w.play('Idle');
        }
      }
      const { p, dir } = this._pathPoint(w, w.s);
      const fwd = w.kind === 'hauler' ? 1 : w.dir;
      w.group.position.copy(p);
      if (!(w.cheering > 0) && !(w.wait > 0)) {
        const target = faceDir(dir.x * fwd, dir.z * fwd);
        w.group.rotation.y += Math.atan2(Math.sin(target - w.group.rotation.y), Math.cos(target - w.group.rotation.y)) * Math.min(1, dt * 8);
      } else if (w.cheering > 0) {
        w.group.rotation.y += Math.atan2(Math.sin(AZ - w.group.rotation.y), Math.cos(AZ - w.group.rotation.y)) * Math.min(1, dt * 5);
      }
      if (w.block) {
        // block rides in the hands while hauling towards the pyramid
        const carrying = (w.dir > 0 && !(w.wait > 0)) || (w.wait > 0 && w.s <= 0.01);
        w.block.visible = carrying && !(w.cheering > 0);
        if (w.block.visible && w.lh && w.rh) {
          w.lh.getWorldPosition(tmpV); const r = w.rh.getWorldPosition(new THREE.Vector3());
          w.block.position.copy(tmpV).add(r).multiplyScalar(0.5);
          w.block.position.y += 0.04;
          w.block.rotation.y = w.group.rotation.y;
        }
      }
      if (w.sledge) {
        const back = this._pathPoint(w, w.s - 1.15 / w.len);
        w.sledge.position.copy(back.p);
        w.sledge.rotation.y = Math.atan2(back.dir.z, -back.dir.x); // model front is -X
      }
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
    for (let i = 0; i < 140; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.visible = false; s.renderOrder = 10;
      this.scene.add(s);
      this.pool.push({ s, life: 0 });
    }
    // brazier flames
    this.flames = [];
    for (const p of this.fires) {
      for (let k = 0; k < 2; k++) {
        const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
        f.position.copy(p).add(new THREE.Vector3(0, 0.25, 0));
        f.renderOrder = 9;
        this.scene.add(f);
        this.flames.push({ f, k, base: p, seed: Math.random() * 10 });
      }
    }
    // drifting clouds below and behind the island
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

  spawn(type, pos, { vel = null, life = 1, size = 0.4, grow = 0, color = 0xffffff, gravity = 0, spin = 0, opacity = 1, delay = 0 } = {}) {
    const p = this.pool.find((q) => q.life <= 0);
    if (!p) return;
    const m = p.s.material;
    m.map = this.ptex[type];
    m.blending = type === 'dust' ? THREE.NormalBlending : THREE.AdditiveBlending;
    m.color.set(color);
    m.rotation = Math.random() * Math.PI * 2;
    m.needsUpdate = true;
    p.s.position.copy(pos);
    p.vel = vel ? vel.clone() : new THREE.Vector3();
    p.life = p.max = life; p.size = size; p.grow = grow; p.gravity = gravity; p.spin = spin; p.op = opacity; p.delay = delay;
    p.s.scale.setScalar(size);
    p.s.visible = delay <= 0;
    m.opacity = 0;
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
      if (Math.random() < dt * 3) this.spawn('glow', fl.base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.4, (Math.random() - 0.5) * 0.3)), { vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.2 + Math.random(), (Math.random() - 0.5) * 0.3), life: 1.2, size: 0.12, color: 0xffa040 });
    }
    for (const c of this.clouds) {
      c.userData.u += c.userData.speed * dt;
      if (c.userData.u > 34) c.userData.u = -34;
      const y = c.position.y;
      c.position.copy(uv(c.userData.u, c.userData.v)); c.position.y = y;
    }
  }

  // ------------------------------------------------------------------ pyramid
  _pyramidSetup() {
    this.blockGeo = new RoundedBoxGeometry(0.97, H * 0.98, 0.97, 2, 0.07);
    const lime = this._tex('limestone', 1);
    const goldT = this._tex('gold', 1);
    const gran = this._tex('bedrock', 1);
    this.blockMats = {
      [STONE]: new THREE.MeshStandardMaterial({ map: lime, roughness: 0.8, metalness: 0, color: 0xe2cdb0 }),
      [GOLD]: new THREE.MeshStandardMaterial({ map: goldT, roughness: 0.28, metalness: 0.85, emissive: 0x6a3a00, emissiveIntensity: 0.25 }),
      [GRANITE]: new THREE.MeshStandardMaterial({ map: gran, roughness: 0.55, metalness: 0.05, color: 0xd9b8ff }),
    };
    this.pyr = new THREE.Group();
    this.scene.add(this.pyr);
    // landing preview: the real stone, hovering translucent exactly where it will land
    this.ghostMats = {
      ok: new THREE.MeshStandardMaterial({ map: lime, color: 0xd9c2a0, roughness: 0.75, transparent: true, opacity: 0.94, emissive: 0x9a4dff, emissiveIntensity: 0.2, depthWrite: false }),
      gold: new THREE.MeshStandardMaterial({ map: goldT, roughness: 0.3, metalness: 0.6, transparent: true, opacity: 0.85, emissive: 0xffb43a, emissiveIntensity: 0.45, depthWrite: false }),
      bad: new THREE.MeshBasicMaterial({ color: 0xff3d7a, transparent: true, opacity: 0.45, depthWrite: false }),
    };
    this.ghost = new THREE.InstancedMesh(this.blockGeo, this.ghostMats.ok, 6);
    this.ghost.count = 0; this.ghost.renderOrder = 5; this.ghost.frustumCulled = false;
    this.scene.add(this.ghost);
    // golden rim around the preview (slightly larger back faces)
    this.ghostRim = new THREE.InstancedMesh(this.blockGeo, new THREE.MeshBasicMaterial({ color: 0xb45cff, side: THREE.BackSide, transparent: true, opacity: 0.95, depthWrite: false }), 6);
    this.ghostRim.count = 0; this.ghostRim.renderOrder = 4; this.ghostRim.frustumCulled = false;
    this.scene.add(this.ghostRim);
    // footprint plates under the preview + glow on rows/columns the move would complete
    const plateG = new THREE.PlaneGeometry(0.94, 0.94); plateG.rotateX(-Math.PI / 2);
    this.foot = new THREE.InstancedMesh(plateG, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), 6);
    this.foot.count = 0; this.foot.renderOrder = 4; this.foot.frustumCulled = false;
    this.scene.add(this.foot);
    this.linePrev = new THREE.InstancedMesh(plateG, new THREE.MeshBasicMaterial({ color: 0xff9d1c, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), 200);
    this.linePrev.count = 0; this.linePrev.renderOrder = 6; this.linePrev.frustumCulled = false;
    this.scene.add(this.linePrev);
    // grid overlay and ankh markers for the current tier
    this.gridMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 1 }));
    this.gridMesh.rotation.x = -Math.PI / 2;
    this.gridMesh.renderOrder = 2;
    this.scene.add(this.gridMesh);
    this.gridTex = {};
    this.ankhMarks = [];
    this.glyphMat = new THREE.MeshBasicMaterial({ map: this.assets.tex.glyph, transparent: true, depthWrite: false });
    this.ankhIconMat = new THREE.SpriteMaterial({ map: this.assets.tex.ankhIcon, transparent: true, depthWrite: false });
    // foundation plate
    this.foundation = new THREE.Mesh(new RoundedBoxGeometry(1, FOUND, 1, 2, 0.04), new THREE.MeshStandardMaterial({ map: this._tex('limestone', 4), color: 0xd8c6b0, roughness: 0.9 }));
    this.foundation.position.y = FOUND / 2;
    this.foundation.receiveShadow = true;
    this.scene.add(this.foundation);
    // capstone + light beam
    const capG = new THREE.ConeGeometry(0.72, 0.9, 4, 1);
    this.capstone = new THREE.Mesh(capG, new THREE.MeshStandardMaterial({ color: 0xffd36b, metalness: 1, roughness: 0.18, emissive: 0xffa000, emissiveIntensity: 0.6 }));
    this.capstone.rotation.y = Math.PI / 4;
    this.capstone.castShadow = true;
    this.capstone.visible = false;
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

  _gridTexture(n) {
    if (this.gridTex[n]) return this.gridTex[n];
    const px = 64 * n;
    const t = canvasTex(px, px, (c, w) => {
      const cs = w / n;
      c.fillStyle = 'rgba(70,24,110,0.38)'; c.fillRect(0, 0, w, w);
      c.strokeStyle = 'rgba(255,214,120,0.75)'; c.lineWidth = 3;
      for (let i = 1; i < n; i++) {
        c.beginPath(); c.moveTo(i * cs, 4); c.lineTo(i * cs, w - 4); c.stroke();
        c.beginPath(); c.moveTo(4, i * cs); c.lineTo(w - 4, i * cs); c.stroke();
      }
      c.shadowColor = 'rgba(255,200,90,0.9)'; c.shadowBlur = 10;
      c.strokeStyle = 'rgba(255,224,140,0.95)'; c.lineWidth = 5;
      c.strokeRect(3, 3, w - 6, w - 6);
      c.shadowBlur = 0;
      c.fillStyle = 'rgba(255,230,160,0.9)';
      for (const [x, y] of [[0, 0], [w, 0], [0, w], [w, w]]) { c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill(); }
    });
    this.gridTex[n] = t;
    return t;
  }

  // Build a fresh pyramid site for a level.
  setupLevel(tierSizes) {
    this.tierSizes = tierSizes;
    this.pyr.clear();
    this.meshes = {};
    const total = tierSizes.reduce((a, n) => a + n * n, 0);
    for (const k of [STONE, GOLD, GRANITE]) {
      const m = new THREE.InstancedMesh(this.blockGeo, this.blockMats[k], total);
      m.count = 0; m.castShadow = true; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.pyr.add(m);
      this.meshes[k] = { mesh: m, map: new Map() };
    }
    this.anims.length = 0;
    const base = tierSizes[0];
    this.foundation.scale.set(base + 1.1, 1, base + 1.1);
    this.capstone.visible = false; this.beam.visible = false;
    this.capToken = (this.capToken || 0) + 1;
    this.orbit = false;
    this.camGoal.az = AZ;
    // framing: fit the bottom tier diamond
    const diag = base * Math.SQRT2;
    this.camGoal.W = Math.max(diag * 1.08 + 1.4, 9.5);
    this.cam.W = this.camGoal.W * 1.35;
    this.camGoal.ty = FOUND + 0.3;
    this.cam.target.y = this.camGoal.ty;
    this.cam.az = AZ + 0.5;
    this.resize();
  }

  tierBaseY(t) { return FOUND + t * H; }
  cellWorld(t, i, j) {
    const n = this.tierSizes[t], off = (n - 1) / 2;
    return new THREE.Vector3(i - off, this.tierBaseY(t) + H / 2, j - off);
  }

  showTier(t, tier) {
    const n = tier.size;
    this.currentTier = t;
    this.gridMesh.material.map = this._gridTexture(n);
    this.gridMesh.material.needsUpdate = true;
    this.gridMesh.scale.set(n, n, 1);
    this.gridMesh.position.set(0, this.tierBaseY(t) + 0.012, 0);
    this.gridMesh.visible = true;
    this.gridMesh.material.opacity = 0;
    this.gridFade = 0;
    // markers
    for (const m of this.ankhMarks) { this.scene.remove(m.decal); this.scene.remove(m.icon); }
    this.ankhMarks = [];
    for (const k of tier.ankhs) {
      const i = k % n, j = Math.floor(k / n);
      const p = this.cellWorld(t, i, j);
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), this.glyphMat);
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(p.x, this.tierBaseY(t) + 0.02, p.z);
      decal.renderOrder = 3;
      const icon = new THREE.Sprite(this.ankhIconMat);
      icon.scale.set(0.6, 0.76, 1);
      icon.position.set(p.x, this.tierBaseY(t) + 0.55, p.z);
      icon.renderOrder = 11;
      this.scene.add(decal, icon);
      this.ankhMarks.push({ k, i, j, decal, icon, seed: Math.random() * 6 });
    }
    // granite blocks pop up
    let d = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (tier.get(i, j) === GRANITE) { this.addBlock(t, i, j, GRANITE, { delay: 0.25 + d * 0.08, rise: true }); d++; }
    }
  }

  removeAnkh(i, j) {
    const idx = this.ankhMarks.findIndex((m) => m.i === i && m.j === j);
    if (idx < 0) return;
    const m = this.ankhMarks[idx];
    this.ankhMarks.splice(idx, 1);
    const p = m.icon.position.clone();
    this.scene.remove(m.decal); this.scene.remove(m.icon);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      this.spawn('sparkle', p, { vel: new THREE.Vector3(Math.cos(a) * 2.2, 1.5 + Math.random() * 1.5, Math.sin(a) * 2.2), life: 0.9, size: 0.35, color: k % 2 ? 0xd28cff : 0xffe08a, spin: 3 });
    }
    this.spawn('glow', p, { life: 0.6, size: 1.2, grow: 2.5, color: 0xb070ff });
  }

  addBlock(t, i, j, kind, { delay = 0, rise = false, drop = 2.6 } = {}) {
    const entry = this.meshes[kind];
    const m = entry.mesh;
    const idx = m.count++;
    const p = this.cellWorld(t, i, j);
    entry.map.set(`${t},${i},${j}`, idx);
    // natural color variation
    const v = kind === GOLD ? 1 : 0.9 + Math.random() * 0.14;
    const col = new THREE.Color(v, v * (0.98 + Math.random() * 0.03), v * (0.95 + Math.random() * 0.05));
    m.setColorAt(idx, col);
    m.instanceColor.needsUpdate = true;
    tmpM.compose(p.clone().setY(p.y + (rise ? -H : drop)), tmpQ.identity(), tmpS.set(1, 1, 1));
    if (delay > 0 || drop || rise) tmpS.set(0.0001, 0.0001, 0.0001), tmpM.compose(p, tmpQ, tmpS);
    m.setMatrixAt(idx, tmpM);
    m.instanceMatrix.needsUpdate = true;
    this.anims.push({ type: rise ? 'rise' : 'drop', m, idx, p, t: -delay, dur: rise ? 0.45 : 0.32, drop, col, kind });
  }

  _updateBlocks(dt) {
    for (let a = this.anims.length - 1; a >= 0; a--) {
      const an = this.anims[a];
      an.t += dt;
      if (an.t < 0) continue;
      const k = Math.min(1, an.t / an.dur);
      if (an.type === 'drop') {
        // fall with gravity, then squash
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
          if (an.kind === GOLD) for (let s = 0; s < 4; s++) this.spawn('sparkle', an.p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.4, (Math.random() - 0.5) * 0.8)), { vel: new THREE.Vector3(0, 1.2, 0), life: 0.8, size: 0.3, color: 0xffe08a });
        }
      } else if (an.type === 'rise') {
        const e = easeOutBack(k);
        tmpM.compose(tmpV.set(an.p.x, an.p.y - H * (1 - e), an.p.z), tmpQ.identity(), tmpS.set(1, Math.max(0.001, e), 1));
      } else if (an.type === 'flash') {
        const f = Math.sin(k * Math.PI);
        an.m.setColorAt(an.idx, tmpCol.copy(an.col).lerp(FLASH, f * 0.85));
        an.m.instanceColor.needsUpdate = true;
        if (k >= 1) { an.m.setColorAt(an.idx, an.col); this.anims.splice(a, 1); }
        continue;
      }
      an.m.setMatrixAt(an.idx, tmpM);
      an.m.instanceMatrix.needsUpdate = true;
      if (k >= 1) {
        tmpM.compose(an.p, tmpQ.identity(), tmpS.set(1, 1, 1));
        an.m.setMatrixAt(an.idx, tmpM);
        this.anims.splice(a, 1);
      }
    }
  }

  flashCells(t, cells, delayStep = 0.04, dur = 0.5) {
    cells.forEach(([i, j], n) => {
      for (const k of [STONE, GOLD, GRANITE]) {
        const e = this.meshes[k];
        const idx = e.map.get(`${t},${i},${j}`);
        if (idx === undefined) continue;
        const col = new THREE.Color(); e.mesh.getColorAt(idx, col);
        this.anims.push({ type: 'flash', m: e.mesh, idx, col, t: -n * delayStep, dur });
      }
      const p = this.cellWorld(t, i, j); p.y += H / 2 + 0.1;
      this.spawn('sparkle', p, { vel: new THREE.Vector3(0, 1.8, 0), life: 0.8, size: 0.4, color: 0xffe9a8, delay: n * delayStep, spin: 2 });
    });
  }

  tierComplete(t) {
    const n = this.tierSizes[t];
    const cells = [];
    for (let s = 0; s < n * 2; s++) for (let i = 0; i < n; i++) { const j = s - i; if (j >= 0 && j < n) cells.push([i, j]); }
    this.flashCells(t, cells, 0.012, 0.6);
    const y = this.tierBaseY(t) + H;
    const half = n / 2;
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      this.spawn('sparkle', new THREE.Vector3(Math.cos(a) * half * 1.1, y, Math.sin(a) * half * 1.1), { vel: new THREE.Vector3(Math.cos(a) * 1.5, 2.5 + Math.random() * 2, Math.sin(a) * 1.5), life: 1.2, size: 0.5, color: k % 3 ? 0xffd970 : 0xc690ff, spin: 3, gravity: 2 });
    }
    this.gridMesh.visible = false;
  }

  focusTier(t) {
    this.camGoal.ty = this.tierBaseY(t) + 0.25;
  }

  // ghost preview of where a stone would land
  setGhost(t, cells, ai, aj, valid, gold = false) {
    if (!cells) { this.ghost.count = 0; this.ghostRim.count = 0; this.foot.count = 0; this.linePrev.count = 0; return; }
    const n = this.tierSizes[t];
    let c = 0;
    for (const [x, y] of cells) {
      const i = ai + x, j = aj + y;
      if (i < -1 || j < -1 || i > n || j > n) continue;
      const p = this.cellWorld(t, i, j);
      p.y += valid ? 0.06 : 0.02;   // hovers a hair above its slot
      tmpM.compose(p, tmpQ.identity(), tmpS.set(1, 1, 1));
      this.ghost.setMatrixAt(c, tmpM);
      tmpM.compose(p, tmpQ, tmpS.set(1.16, 1.2, 1.16));
      this.ghostRim.setMatrixAt(c, tmpM);
      tmpS.set(1, 1, 1);
      tmpM.compose(tmpV.set(p.x, this.tierBaseY(t) + 0.02, p.z), tmpQ, tmpS);
      this.foot.setMatrixAt(c, tmpM);
      c++;
    }
    this.ghost.count = c; this.foot.count = valid ? c : 0; this.ghostRim.count = valid ? c : 0;
    this.ghost.instanceMatrix.needsUpdate = true; this.foot.instanceMatrix.needsUpdate = true; this.ghostRim.instanceMatrix.needsUpdate = true;
    this.ghost.material = valid ? (gold ? this.ghostMats.gold : this.ghostMats.ok) : this.ghostMats.bad;
    this.ghostValid = valid;
  }

  // glow on top of every cell of the rows/columns the previewed move would complete
  setLinePreview(t, cells) {
    let c = 0;
    if (cells) for (const [i, j] of cells) {
      if (c >= 200) break;
      const p = this.cellWorld(t, i, j);
      tmpM.compose(tmpV.set(p.x, this.tierBaseY(t) + H + 0.1, p.z), tmpQ.identity(), tmpS.set(1, 1, 1));
      this.linePrev.setMatrixAt(c++, tmpM);
    }
    this.linePrev.count = c;
    this.linePrev.instanceMatrix.needsUpdate = true;
  }


  // ------------------------------------------------------------------ characters API
  pharaohCheer() { this.pharaoh.play('Cheer', { once: true, after: 'Idle' }); }
  pharaohStomp() { this.pharaoh.play('Stomp', { once: true, after: 'Idle' }); }
  priestessCast() { this.priestess.play('Cast', { once: true, after: 'Idle' }); }
  priestessDance() { this.priestess.play('Dance'); }
  priestessIdle() { this.priestess.play('Idle'); }
  workersCheer(dur = 2.2) {
    for (const w of this.workers) { w.cheering = dur; w.play('Cheer'); }
  }

  // ------------------------------------------------------------------ finale
  placeCapstone(top) {
    const y = this.tierBaseY(top) + 0.45;
    this.capstone.visible = true;
    this.capstone.position.set(0, y + 9, 0);
    this.beam.visible = true;
    this.beam.position.set(0, y + 20, 0);
    this.beam.material.opacity = 0;
    const t0 = this.time;
    const token = this.capToken;
    return new Promise((res) => {
      const f = () => {
        if (token !== this.capToken) { this.updaters.splice(this.updaters.indexOf(f), 1); res(); return; }
        const k = Math.min(1, (this.time - t0) / 2.2);
        this.beam.material.opacity = 0.55 * Math.min(1, k * 3) * (k < 0.85 ? 1 : (1 - k) / 0.15 * 0.6 + 0.4);
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

  // time-of-day: p 0 = morning, 1 = sunset
  setDaylight(p) {
    const a = new THREE.Color(0xffe6c0), b = new THREE.Color(0xffa860), c = new THREE.Color(0xff5c8a);
    const col = p < 0.6 ? a.lerp(b, p / 0.6) : b.lerp(c, (p - 0.6) / 0.4);
    this.sun.color.copy(col);
    this.sun.intensity = 2.55 - p * 1.0;
    this.hemi.color.set(0x9d82ff).lerp(new THREE.Color(0x7444ff), p);
    this.hemi.intensity = 0.95 - p * 0.2;
    const ang = -0.2 + p * 0.9;
    this.sun.position.set(-11 * Math.cos(ang), 17 - p * 6, -3 + 10 * Math.sin(ang));
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
    this.freeH = Math.max(100, freeBottom - freeTop);
    this.resize();
  }

  resize() {
    const w = this.vw || window.innerWidth, h = this.vh || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this._applyCamera();
  }

  _applyCamera() {
    const w = this.vw || window.innerWidth, h = this.vh || window.innerHeight;
    const c = this.cam;
    // view width needs to fit both the screen width and the free vertical space
    let W = c.W;
    const freeFrac = (this.freeH || h * 0.6) / h;
    const diamondH = (this.tierSizes ? this.tierSizes[0] : 7) * Math.SQRT2 * Math.sin(c.el) + 2.2;
    const needH = diamondH / freeFrac;            // world units of total height
    W = Math.max(W, needH * (w / h));
    const Hh = W * (h / w);
    const f = this.focusFrac ?? 0.45;
    const cam = this.camera;
    cam.left = -W / 2; cam.right = W / 2; cam.top = Hh * f; cam.bottom = -Hh * (1 - f);
    cam.updateProjectionMatrix();
    const d = 80;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.4 : 0;
    cam.position.set(c.target.x + d * Math.cos(c.el) * Math.sin(c.az) + sx, c.target.y + d * Math.sin(c.el), c.target.z + d * Math.cos(c.el) * Math.cos(c.az));
    cam.lookAt(c.target);
    cam.updateMatrixWorld();
    this.viewW = W;
  }

  worldToScreen(v) {
    tmpV.copy(v).project(this.camera);
    return { x: (tmpV.x + 1) / 2 * this.vw, y: (1 - tmpV.y) / 2 * this.vh };
  }

  screenToPlane(x, y, planeY) {
    const ndc = new THREE.Vector2(x / this.vw * 2 - 1, -(y / this.vh) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const pt = new THREE.Vector3();
    return rc.ray.intersectPlane(new THREE.Plane(UP, -planeY), pt) ? pt : null;
  }

  // pixel vectors of world unit axes - used to draw the 2D stones in the same projection
  screenAxes() {
    const o = this.worldToScreen(new THREE.Vector3(0, 0, 0));
    const ex = this.worldToScreen(new THREE.Vector3(1, 0, 0));
    const ez = this.worldToScreen(new THREE.Vector3(0, 0, 1));
    const ey = this.worldToScreen(new THREE.Vector3(0, 1, 0));
    return { ex: { x: ex.x - o.x, y: ex.y - o.y }, ez: { x: ez.x - o.x, y: ez.y - o.y }, ey: { x: ey.x - o.x, y: ey.y - o.y } };
  }

  // ------------------------------------------------------------------ loop
  update(dt) {
    this.time += dt;
    for (const f of [...this.updaters]) f(dt);
    for (const a of this.actors) a.update(dt);
    this._updateWorkers(dt);
    this._updateParticles(dt);
    this._updateBlocks(dt);
    // grid fade + pulsing markers
    if (this.gridMesh.visible && this.gridMesh.material.opacity < 1) this.gridMesh.material.opacity = Math.min(1, this.gridMesh.material.opacity + dt * 2);
    for (const m of this.ankhMarks) {
      m.decal.rotation.z += dt * 0.6;
      m.icon.position.y = this.tierBaseY(this.currentTier) + 0.62 + Math.sin(this.time * 2.4 + m.seed) * 0.1;
    }
    this.glyphMat.opacity = 0.75 + Math.sin(this.time * 3) * 0.25;
    const pulse = Math.sin(this.time * 7);
    this.ghostMats.ok.emissiveIntensity = 0.18 + pulse * 0.1;
    this.ghostRim.material.opacity = 0.8 + pulse * 0.2;
    this.ghostMats.gold.emissiveIntensity = 0.4 + pulse * 0.15;
    this.ghostMats.bad.opacity = 0.38 + pulse * 0.1;
    this.linePrev.material.opacity = 0.4 + Math.sin(this.time * 10) * 0.18;
    if (this.capstone.visible) this.capstone.material.emissiveIntensity = 0.45 + Math.sin(this.time * 3) * 0.2;
    // camera easing
    const c = this.cam, g = this.camGoal;
    if (this.orbit) g.az += dt * 0.22;
    const k = 1 - Math.exp(-dt * 3);
    c.az += (g.az - c.az) * k;
    c.W += (g.W - c.W) * k;
    c.target.y += (g.ty - c.target.y) * k;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    this._applyCamera();
    this.renderer.render(this.scene, this.camera);
  }
}

const FLASH = new THREE.Color(1.6, 1.35, 0.8);
const tmpCol = new THREE.Color();
