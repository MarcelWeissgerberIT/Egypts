// 2.5D renderer for the pyramid platformer: carved block geometry with world-space textures,
// a painted parallax background per world, pillars and light shafts in between, torches,
// the Meshy explorer with her animations, enemies, traps and particles.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { T, H } from './levels.js';
import { P } from './sim.js';

const D = 0.9;                // half depth of the blocks (z)
const FOV = 38;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

class Actor {
  constructor(root, clips) {
    this.root = root; this.mixer = new THREE.AnimationMixer(root); this.actions = {}; this.current = null;
    for (const [n, c] of Object.entries(clips)) if (c) this.actions[n] = this.mixer.clipAction(c);
  }
  play(name, { fade = 0.15, once = false, speed = 1 } = {}) {
    const a = this.actions[name];
    if (!a) return;
    if (this.current === a) { a.setEffectiveTimeScale(speed); return; }
    a.reset(); a.setEffectiveTimeScale(speed); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once; a.enabled = true; a.setEffectiveWeight(1);
    if (this.current) a.crossFadeFrom(this.current, fade, false); else a.fadeIn(fade);
    a.play(); this.current = a;
  }
}

// remove the hips' drift so clips stay on the spot (the game moves the explorer). fixY pins the
// height too (jump/climb clips lift the body on their own, which would add to the physics)
function inplace(clip, keepY = true, fixY = null) {
  if (!clip) return clip;
  clip = clip.clone();
  for (const tr of clip.tracks) {
    if (!/Hips\.position$/.test(tr.name)) continue;
    const v = tr.values, n = v.length / 3;
    const x0 = v[0], z0 = v[2], y0 = fixY ?? v[1];
    for (let i = 0; i < n; i++) { v[i * 3] = x0; v[i * 3 + 2] = z0; if (!keepY) v[i * 3 + 1] = y0; }
  }
  return clip;
}
// a time window of a clip (seconds)
function cut(clip, name, t0, t1) {
  if (!clip) return clip;
  const fps = 30;
  return THREE.AnimationUtils.subclip(clip, name, Math.round(t0 * fps), Math.round(t1 * fps), fps);
}

export class Stage {
  constructor(canvas, assets) {
    this.A = assets;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    this.mobile = matchMedia('(pointer: coarse)').matches;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);
    this.cam = { x: 0, y: 6, dist: 16 };
    this.time = 0;
    this.shake = 0;
    this.level = new THREE.Group(); this.scene.add(this.level);
    this.texs = {};
    for (const k of ['sandstone', 'granite', 'hiero']) {
      const t = assets.tex[k]; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; this.texs[k] = t;
    }
    this._lights();
    this._particles();
    this._player();
    this._shared();
    this.resize(window.innerWidth, window.innerHeight);
  }

  _lights() {
    this.hemi = new THREE.HemisphereLight(0xd8c0ff, 0x6a4020, 1.0); this.scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xffe2b8, 2.0);
    key.position.set(-6, 14, 12); key.castShadow = true;
    key.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    const sc = key.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 60;
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
    this.scene.add(key); this.scene.add(key.target); this.key = key;
    this.rim = new THREE.DirectionalLight(0xa070ff, 0.9); this.rim.position.set(8, 6, -6); this.scene.add(this.rim);
    this.torchLights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffa040, 0, 9, 1.6); this.scene.add(l); this.torchLights.push(l); }
    this.lantern = new THREE.PointLight(0xffd08a, 0, 11, 1.4); this.scene.add(this.lantern);
  }

  _shared() {
    this.flameTex = canvasTex(64, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h * 0.68, 2, w / 2, h * 0.6, h * 0.5);
      g.addColorStop(0, 'rgba(255,250,210,1)'); g.addColorStop(0.25, 'rgba(255,200,80,0.95)'); g.addColorStop(0.6, 'rgba(255,90,40,0.55)'); g.addColorStop(1, 'rgba(160,40,140,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(w / 2, h * 0.62, w * 0.42, h * 0.48, 0, 0, Math.PI * 2); c.fill();
    });
    this.rayTex = canvasTex(64, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(0.15, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const s = c.createLinearGradient(0, 0, w, 0); s.addColorStop(0, 'rgba(0,0,0,1)'); s.addColorStop(0.5, 'rgba(0,0,0,0)'); s.addColorStop(1, 'rgba(0,0,0,1)');
      c.globalCompositeOperation = 'destination-out'; c.fillStyle = s; c.fillRect(0, 0, w, h);
    });
    this.crackTex = canvasTex(128, 128, (c, w) => {
      c.strokeStyle = 'rgba(40,20,10,0.9)'; c.lineWidth = 3;
      let seed = 5; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let k = 0; k < 6; k++) { c.beginPath(); let x = w / 2, y = w / 2; c.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; c.lineTo(x, y); } c.stroke(); }
    });
    this.linenTex = canvasTex(64, 64, (c, w) => {
      c.fillStyle = '#d8ccb0'; c.fillRect(0, 0, w, w);
      for (let y = 0; y < w; y += 6) { c.fillStyle = y % 12 ? 'rgba(120,100,70,0.35)' : 'rgba(255,250,230,0.4)'; c.fillRect(0, y, w, 3); }
      c.strokeStyle = 'rgba(90,70,50,0.4)'; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(0, k * 11); c.lineTo(w, k * 11 + 9); c.stroke(); }
    });
    this.linenTex.wrapS = this.linenTex.wrapT = THREE.RepeatWrapping;
    this.gold = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 0.85, roughness: 0.3, emissive: 0x3a2000, emissiveIntensity: 0.4 });
    this.bronze = new THREE.MeshStandardMaterial({ color: 0xc8864a, metalness: 0.8, roughness: 0.35 });
    this.wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85 });
    this.darkWood = new THREE.MeshStandardMaterial({ color: 0x5a3818, roughness: 0.9 });
  }

  _particles() {
    const glow = canvasTex(64, 64, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,230,180,0.6)'); g.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
    this.ptex = { glow, sparkle: this.A.img.sparkleTex, dust: this.A.tex.dust };
    this.pool = [];
    for (let i = 0; i < 160; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); s.visible = false; s.renderOrder = 10; this.scene.add(s); this.pool.push({ s, life: 0 }); }
    // drifting motes in front of the camera
    const n = 120, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * 40 - 20; pos[i * 3 + 1] = Math.random() * 24 - 6; pos[i * 3 + 2] = Math.random() * 10 - 6; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, color: 0xffe2a8, transparent: true, opacity: 0.7, depthWrite: false, map: glow, blending: THREE.AdditiveBlending }));
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
    this.moteV = new Float32Array(n * 3);
  }

  spawn(type, x, y, z, { vx = 0, vy = 0, vz = 0, life = 1, size = 0.4, grow = 0, color = 0xffffff, gravity = 0, opacity = 1, map = null, additive = null } = {}) {
    const p = this.pool.find((q) => q.life <= 0);
    if (!p) return;
    const m = p.s.material;
    m.map = map || this.ptex[type] || this.ptex.glow;
    m.blending = additive === false || (additive === null && type === 'dust') ? THREE.NormalBlending : THREE.AdditiveBlending;
    m.color.set(color); m.rotation = Math.random() * 6; m.needsUpdate = true;
    p.s.position.set(x, y, z); p.v = new THREE.Vector3(vx, vy, vz);
    p.life = p.max = life; p.size = size; p.grow = grow; p.gravity = gravity; p.op = opacity;
    p.s.scale.setScalar(size); p.s.visible = true; m.opacity = 0;
  }
  burst(x, y, n = 12, color = 0xffe08a, speed = 3) {
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; this.spawn('sparkle', x, y, 0.3, { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed + 1, life: 0.7, size: 0.3, color, gravity: 4 }); }
    this.spawn('glow', x, y, 0.3, { life: 0.4, size: 1.2, grow: 1.5, color });
  }
  dust(x, y, n = 6, color = 0xf0d8b0) {
    for (let k = 0; k < n; k++) this.spawn('dust', x + (Math.random() - 0.5) * 0.8, y + 0.1, 0.4 + Math.random() * 0.3, { vx: (Math.random() - 0.5) * 2.5, vy: Math.random() * 1.2, life: 0.7, size: 0.5, grow: 1.2, opacity: 0.7, color, additive: false });
  }

  _player() {
    const A = this.A.models;
    const root = SkeletonUtils.clone(A.explorer.scene);
    root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; if (m.material) { m.material.metalness = 0; m.material.roughness = 0.7; } } });
    // the rig was made 1.6 m tall; the explorer stands 1.5 tiles
    root.scale.multiplyScalar(1.5 / 1.6);
    const g = new THREE.Group(); g.add(root); this.scene.add(g);
    const clip = (n) => A['anim_' + n]?.animations?.[0];
    // the Meshy jump is one long move (crouch, take-off, flight, landing): cut it into phases
    const idle = A.explorer.animations[0];
    const hipY = idle.tracks.find((t) => /Hips\.position$/.test(t.name))?.values[1] ?? 87;
    const jump = clip('jump');
    this.pl = new Actor(root, {
      Idle: idle, Run: inplace(clip('run')),
      Jump: inplace(cut(jump, 'JumpUp', 0.5, 0.82), false, hipY),
      Fall: inplace(cut(jump, 'JumpDown', 0.84, 1.08), false, hipY),
      Land: inplace(cut(jump, 'Land', 1.12, 1.62)),
      Climb: inplace(clip('climb'), false, hipY), Swim: inplace(clip('swim'), false), Hit: inplace(clip('hit')), Cheer: inplace(clip('cheer')),
    });
    this.pl.group = g;
    this.pl.play('Idle');
    this.plYaw = Math.PI / 2;
    // soft blob shadow helps reading the landing spot
    const blob = canvasTex(64, 64, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }));
    this.scene.add(this.blob);
  }

  // ------------------------------------------------------------ level build
  _dispose(root) {
    const shared = new Set(Object.values(this.texs).concat(Object.values(this.A.tex), Object.values(this.A.bg || {}), Object.values(this.A.img)));
    root.traverse((o) => {
      if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (m.userData && m.userData.shared) continue;
        for (const k of ['map', 'alphaMap']) if (m[k] && !shared.has(m[k]) && m[k] !== this.flameTex && m[k] !== this.rayTex && m[k] !== this.crackTex && m[k] !== this.linenTex && m[k] !== this.ptex.glow) m[k].dispose();
        if (![this.gold, this.bronze, this.wood, this.darkWood].includes(m)) m.dispose();
      }
    });
  }

  load(L, sim) {
    this.L = L; this.sim = sim;
    this._dispose(this.level);
    this.level.clear();
    this.entViews = new Map();
    this.crumbleViews = new Map();
    this.crackViews = new Map();
    const W = L.theme;
    const tex = this.texs[W.tex].clone(); tex.needsUpdate = true; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this.blockMat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.88, color: W.tex === 'granite' ? new THREE.Color(W.tint).lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(1.6) : new THREE.Color(W.tint).multiplyScalar(0.86) });
    const sand = this.A.tex.sand.clone(); sand.needsUpdate = true; sand.wrapS = sand.wrapT = THREE.RepeatWrapping; sand.colorSpace = THREE.SRGBColorSpace;
    this.topMat = new THREE.MeshStandardMaterial({ map: W.tex === 'granite' ? tex : sand, vertexColors: true, roughness: 0.95, color: W.tex === 'granite' ? new THREE.Color(W.tint).lerp(new THREE.Color(0xffffff), 0.5).multiplyScalar(1.7) : new THREE.Color(0xffe6c0) });
    this.scene.fog = new THREE.Fog(W.fog, 26, 80);
    this.hemi.intensity = 0.55 + W.amb * 0.55;
    this.key.intensity = W.dark ? 0.5 : 1.4 + W.amb * 0.6;
    this.rim.color.set(W.sky);
    this.lantern.intensity = W.dark ? 26 : 0;
    // floating particles that set the mood of each world
    const MOOD = { entrance: [0xffe2a8, 0.09, 0, 0.15], hieroglyphs: [0xffd8f0, 0.08, 0.05, 0.1], cistern: [0x9ff4ff, 0.11, 0, 0.45], scarabs: [0xd090ff, 0.1, 0.1, 0.2],
      crypt: [0x9cff9c, 0.12, 0.05, 0.08], sandfalls: [0xffc070, 0.13, 1.6, -0.2], traps: [0xff8040, 0.1, 0.1, 0.6], treasury: [0xffe060, 0.1, 0, 0.12], stars: [0xc8d8ff, 0.12, 0, 0.05], king: [0xff90e0, 0.11, 0.05, 0.3] };
    const [mc, ms, wind, rise] = MOOD[W.key] || MOOD.entrance;
    this.motes.material.color.set(mc); this.motes.material.size = ms; this.mood = { wind, rise, twinkle: W.key === 'stars' || W.key === 'treasury' };
    for (let i = 0; i < this.moteV.length; i += 3) { this.moteV[i] = wind * (0.6 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.2; this.moteV[i + 1] = rise * (0.5 + Math.random()) + (Math.random() - 0.5) * 0.1; this.moteV[i + 2] = 0; }
    this._blocks(L);
    this._backdrop(L);
    this._entities(L);
    this.cam.x = L.spawn.x + 4; this.cam.y = L.spawn.y + 3;
  }

  _blocks(L) {
    const solid = (x, y) => { if (x < 0 || x >= L.w) return true; if (y < 0) return true; if (y >= L.h) return false; const t = L.tiles[y * L.w + x]; return t === T.SOLID; };
    const front = [], top = [], fc = [], tc = [], fuv = [], tuv = [];
    const quad = (arr, uv, col, v, u, c) => { for (const k of [0, 1, 2, 0, 2, 3]) { arr.push(...v[k]); uv.push(...u[k]); col.push(c[k], c[k], c[k]); } };
    for (let x = 0; x < L.w; x++) for (let y = 0; y < L.h; y++) {
      if (L.tiles[y * L.w + x] !== T.SOLID) continue;
      const exposedTop = !solid(x, y + 1);
      // front face with a little ambient occlusion: darker deep inside the ground
      const depth = (() => { let k = 0; while (k < 4 && solid(x, y + k + 1)) k++; return k; })();
      const shade = exposedTop ? [0.86, 0.86, 1.0, 1.0] : [Math.max(0.45, 0.86 - depth * 0.1), Math.max(0.45, 0.86 - depth * 0.1), Math.max(0.5, 0.96 - depth * 0.1), Math.max(0.5, 0.96 - depth * 0.1)];
      quad(front, fuv, fc, [[x, y, D], [x + 1, y, D], [x + 1, y + 1, D], [x, y + 1, D]], [[x / 3, y / 3], [(x + 1) / 3, y / 3], [(x + 1) / 3, (y + 1) / 3], [x / 3, (y + 1) / 3]], shade);
      if (exposedTop) quad(top, tuv, tc, [[x, y + 1, D], [x + 1, y + 1, D], [x + 1, y + 1, -D], [x, y + 1, -D]], [[x / 3, 0], [(x + 1) / 3, 0], [(x + 1) / 3, 0.6], [x / 3, 0.6]], [1, 1, 0.8, 0.8]);
      if (!solid(x - 1, y)) quad(front, fuv, fc, [[x, y, -D], [x, y, D], [x, y + 1, D], [x, y + 1, -D]], [[0, y / 3], [0.6, y / 3], [0.6, (y + 1) / 3], [0, (y + 1) / 3]], [0.6, 0.7, 0.7, 0.6]);
      if (!solid(x + 1, y)) quad(front, fuv, fc, [[x + 1, y, D], [x + 1, y, -D], [x + 1, y + 1, -D], [x + 1, y + 1, D]], [[0, y / 3], [0.6, y / 3], [0.6, (y + 1) / 3], [0, (y + 1) / 3]], [0.7, 0.6, 0.6, 0.7]);
      if (y > 0 && !solid(x, y - 1)) quad(front, fuv, fc, [[x, y, -D], [x + 1, y, -D], [x + 1, y, D], [x, y, D]], [[x / 3, 0], [(x + 1) / 3, 0], [(x + 1) / 3, 0.6], [x / 3, 0.6]], [0.4, 0.4, 0.5, 0.5]);
    }
    const mk = (pos, uv, col, mat) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = true;
      this.level.add(m);
    };
    mk(front, fuv, fc, this.blockMat); mk(top, tuv, tc, this.topMat);
    // gold trim along exposed ledges
    const trims = [];
    for (let x = 0; x < L.w; x++) for (let y = 0; y < L.h; y++) if (L.tiles[y * L.w + x] === T.SOLID && !solid(x, y + 1)) trims.push([x + 0.5, y + 0.97]);
    const tm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.07, 0.06), this.gold, Math.max(1, trims.length));
    trims.forEach(([x, y], i) => { tmpM.compose(tmpV.set(x, y, D + 0.02), tmpQ.identity(), tmpS.set(1, 1, 1)); tm.setMatrixAt(i, tmpM); });
    tm.count = trims.length; this.level.add(tm);
    // one-way ledges (stone slabs on brackets), ladders, spikes
    const ledges = [], rungs = [], rails = [], spikes = [];
    for (let x = 0; x < L.w; x++) for (let y = 0; y < L.h; y++) {
      const t = L.tiles[y * L.w + x];
      if (t === T.ONEWAY) ledges.push([x + 0.5, y + 0.86]);
      if (t === T.LADDER) { rails.push([x + 0.14, y + 0.5], [x + 0.86, y + 0.5]); for (const k of [0.2, 0.55, 0.9]) rungs.push([x + 0.5, y + k]); }
      if (t === T.SPIKE) for (const k of [0.17, 0.5, 0.83]) for (const z of [-0.45, 0.1, 0.6]) spikes.push([x + k, y, z, 1]);
      if (t === T.SPIKE_DOWN) for (const k of [0.17, 0.5, 0.83]) spikes.push([x + k, y + 1, 0.3, -1]);
    }
    const inst = (geo, mat, list, set) => { if (!list.length) return null; const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((e, i) => { set(e); m.setMatrixAt(i, tmpM); }); m.castShadow = true; m.receiveShadow = true; this.level.add(m); return m; };
    const slabMat = new THREE.MeshStandardMaterial({ map: this.blockMat.map, color: new THREE.Color(this.L.theme.tint).multiplyScalar(0.92), roughness: 0.85 });
    inst(new THREE.BoxGeometry(1.02, 0.28, 1.5), slabMat, ledges, ([x, y]) => tmpM.compose(tmpV.set(x, y, 0.1), tmpQ.identity(), tmpS.set(1, 1, 1)));
    inst(new THREE.BoxGeometry(0.08, 1.0, 0.08), this.wood, rails, ([x, y]) => tmpM.compose(tmpV.set(x, y, 0.55), tmpQ.identity(), tmpS.set(1, 1, 1)));
    inst(new THREE.BoxGeometry(0.8, 0.07, 0.07), this.wood, rungs, ([x, y]) => tmpM.compose(tmpV.set(x, y, 0.55), tmpQ.identity(), tmpS.set(1, 1, 1)));
    inst(new THREE.ConeGeometry(0.13, 0.5, 6), this.bronze, spikes, ([x, y, z, s]) => tmpM.compose(tmpV.set(x, y + s * 0.25, z), tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), s > 0 ? 0 : Math.PI), tmpS.set(1, 1, 1)));
    // water and quicksand volumes
    this.waterMats = [];
    const runs = (code) => { const out = []; for (let y = 0; y < L.h; y++) { let s = -1; for (let x = 0; x <= L.w; x++) { const on = x < L.w && L.tiles[y * L.w + x] === code; if (on && s < 0) s = x; if (!on && s >= 0) { out.push([s, x, y]); s = -1; } } } return out; };
    const waterTex = this.A.tex.water.clone(); waterTex.needsUpdate = true; waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.colorSpace = THREE.SRGBColorSpace;
    this.waterTex = waterTex;
    const wm = new THREE.MeshStandardMaterial({ map: waterTex, color: 0x9ff0ff, transparent: true, opacity: 0.62, roughness: 0.1, metalness: 0.1, emissive: 0x0a4060, emissiveIntensity: 0.6, depthWrite: false });
    for (const [x0, x1, y] of runs(T.WATER)) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1, 2 * D), wm); m.position.set((x0 + x1) / 2, y + 0.5, 0); m.renderOrder = 8; this.level.add(m);
    }
    const sandTex = this.A.tex.sand.clone(); sandTex.needsUpdate = true; sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping; sandTex.colorSpace = THREE.SRGBColorSpace; sandTex.repeat.set(1, 1);
    this.sandTex = sandTex;
    const sm = new THREE.MeshStandardMaterial({ map: sandTex, color: 0xd8a868, roughness: 1 });
    for (const [x0, x1, y] of runs(T.SAND)) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.98, 2 * D), sm); m.position.set((x0 + x1) / 2, y + 0.49, 0); m.receiveShadow = true; this.level.add(m); }
    // crumbling and cracked blocks are separate meshes
    const box = new THREE.BoxGeometry(1, 1, 2 * D);
    const crumbleMat = new THREE.MeshStandardMaterial({ map: this.blockMat.map, color: new THREE.Color(this.L.theme.tint).multiplyScalar(0.8), roughness: 0.95 });
    const crackMat = [crumbleMat, crumbleMat, crumbleMat, crumbleMat, new THREE.MeshStandardMaterial({ map: this.crackTex, transparent: true }), crumbleMat];
    const crackMats = [this.blockMat, this.blockMat, this.topMat, this.blockMat, this.blockMat, this.blockMat].map((m) => { const c = m.clone(); c.vertexColors = false; return c; });
    for (let x = 0; x < L.w; x++) for (let y = 0; y < L.h; y++) {
      const t = L.tiles[y * L.w + x];
      if (t === T.CRUMBLE) { const m = new THREE.Mesh(box, crumbleMat); m.position.set(x + 0.5, y + 0.5, 0); m.scale.set(0.98, 0.94, 0.98); m.castShadow = m.receiveShadow = true; this.level.add(m); this.crumbleViews.set(y * L.w + x, { m, x, y }); }
      if (t === T.CRACKED) {
        const g = new THREE.Group();
        const m = new THREE.Mesh(box, crackMats); m.receiveShadow = true; g.add(m);
        const c = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, depthWrite: false })); c.position.z = D + 0.01; g.add(c);
        const ct = new THREE.Mesh(new THREE.PlaneGeometry(1, 2 * D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, depthWrite: false })); ct.position.y = 0.505; g.add(ct);
        g.position.set(x + 0.5, y + 0.5, 0); this.level.add(g); this.crackViews.set(y * L.w + x, g);
      }
    }
  }

  _backdrop(L) {
    const W = L.theme;
    // far painting, moved with the camera (parallax)
    const bgTex = this.A.bg[L.world]; bgTex.colorSpace = THREE.SRGBColorSpace;
    this.far = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: bgTex, fog: false, depthWrite: false }));
    this.far.renderOrder = -10; this.level.add(this.far);
    // rows of carved pillars between the painting and the level
    const hiero = this.texs.hiero.clone(); hiero.needsUpdate = true; hiero.wrapS = hiero.wrapT = THREE.RepeatWrapping; hiero.repeat.set(1, 3);
    const pillarMat = new THREE.MeshStandardMaterial({ map: hiero, color: new THREE.Color(W.tint).multiplyScalar(0.75), roughness: 0.9 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xc89a50, roughness: 0.6, metalness: 0.3 });
    const pillar = (x, z, r, h, y0 = -2) => {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 14), pillarMat); shaft.position.y = h / 2; g.add(shaft);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.45, r * 0.95, r * 1.1, 14), capMat); cap.position.y = h + r * 0.55; g.add(cap);
      const abacus = new THREE.Mesh(new THREE.BoxGeometry(r * 2.8, r * 0.4, r * 2.8), capMat); abacus.position.y = h + r * 1.25; g.add(abacus);
      g.position.set(x, y0, z); g.traverse((m) => { if (m.isMesh) m.receiveShadow = true; });
      this.level.add(g);
    };
    for (let x = 6; x < L.w + 10; x += 11) pillar(x, -4.5, 0.75, 20);
    for (let x = 0; x < L.w + 20; x += 17) pillar(x + 7, -11, 1.4, 30, -4);
    // low wall right behind the path
    const wallTex = this.texs.hiero.clone(); wallTex.needsUpdate = true; wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(L.w / 4, 1);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(L.w, 4), new THREE.MeshStandardMaterial({ map: wallTex, color: new THREE.Color(W.tint).multiplyScalar(0.55), roughness: 1 }));
    wall.position.set(L.w / 2, 1.2, -1.6); wall.receiveShadow = true; this.level.add(wall);
    // god rays
    this.rays = [];
    for (let x = 4; x < L.w; x += 9 + (x % 7)) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 18), new THREE.MeshBasicMaterial({ map: this.rayTex, color: W.sky, transparent: true, opacity: W.dark ? 0.08 : 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.position.set(x, 9, -3 - (x % 3)); m.rotation.z = -0.32; m.renderOrder = -1; this.level.add(m); this.rays.push(m);
    }
  }

  _entities(L) {
    const S = this.sim;
    const icon = (key) => { const t = this.A.img[key + 'Tex']; return t; };
    this.torches = [];
    for (const e of S.ents) {
      let v = null;
      switch (e.type) {
        case 'coin': v = new THREE.Sprite(new THREE.SpriteMaterial({ map: icon('icon_scarab'), transparent: true, depthWrite: false })); v.scale.set(0.78, 0.78, 1); v.position.set(e.x, e.y, 0.2); break;
        case 'papyrus': {
          v = new THREE.Group();
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: icon('papyrus'), transparent: true, depthWrite: false })); s.scale.set(0.95, 0.95, 1); v.add(s);
          const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ptex.glow, color: 0xc070ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); g.scale.set(2.2, 2.2, 1); v.add(g);
          v.position.set(e.x, e.y, 0.2); break;
        }
        case 'ankh': v = new THREE.Sprite(new THREE.SpriteMaterial({ map: icon('icon_ankh'), transparent: true, depthWrite: false })); v.scale.set(0.8, 0.8, 1); v.position.set(e.x, e.y, 0.2); break;
        case 'torch': {
          v = new THREE.Group();
          const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.08, 0.35, 8), this.bronze); v.add(holder);
          const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); fl.position.y = 0.42; fl.scale.set(0.5, 0.8, 1); v.add(fl);
          v.userData.flame = fl;
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ptex.glow, color: 0xffa040, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
          halo.position.y = 0.45; halo.scale.set(2.4, 2.4, 1); v.add(halo); v.userData.halo = halo;
          v.position.set(e.x, e.y, -1.5); this.torches.push(v); break;
        }
        case 'checkpoint': {
          const m = this._model('obelisk', 2.2); v = new THREE.Group(); v.add(m);
          const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ptex.glow, color: 0x60ffb0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); gl.position.y = 2.4; gl.scale.set(1.6, 1.6, 1); v.add(gl);
          v.userData.glow = gl; v.position.set(e.x, e.y, -0.6); break;
        }
        case 'exit': v = this._door(); v.position.set(e.x, e.y, -0.5); break;
        case 'scarab': v = this._scarab(); v.position.set(e.x, e.y, 0); break;
        case 'bat': v = this._bat(); v.position.set(e.x, e.y, 0.2); break;
        case 'mummy': v = this._mummy(); v.position.set(e.x, e.y, 0); break;
        case 'cobra': v = this._cobra(); v.position.set(e.x, e.y, 0); break;
        case 'mover': {
          v = new THREE.Mesh(new THREE.BoxGeometry(e.w, 0.42, 1.5), new THREE.MeshStandardMaterial({ map: this.blockMat.map, color: 0xd8b880, roughness: 0.8 }));
          const trim = new THREE.Mesh(new THREE.BoxGeometry(e.w, 0.06, 0.05), this.gold); trim.position.set(0, 0.2, 0.76); v.add(trim);
          v.castShadow = v.receiveShadow = true; v.position.set(e.x + e.w / 2, e.y - 0.21, 0); break;
        }
        case 'crusher': {
          v = new THREE.Group();
          const blk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 1.4), new THREE.MeshStandardMaterial({ map: this.texs.granite, color: 0xb09090, roughness: 0.7 })); blk.position.y = 0.5; blk.castShadow = true; v.add(blk);
          for (const k of [-0.5, 0, 0.5]) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 6), this.bronze); sp.rotation.x = Math.PI; sp.position.set(k, -0.12, 0.3); v.add(sp); }
          const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), this.bronze); chain.position.y = 1.5; v.add(chain); v.userData.chain = chain;
          v.position.set(e.x, e.y - 1, 0); break;
        }
        case 'fire': {
          v = new THREE.Group();
          const n = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.2, 10), this.bronze); n.position.y = 0.1; v.add(n);
          const fl = []; for (let k = 0; k < 3; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); s.position.y = 0.6 + k * 0.6; v.add(s); fl.push(s); }
          v.userData.fl = fl; v.position.set(e.x, e.y, 0.2); break;
        }
        case 'dart': {
          v = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.36, 0.5), new THREE.MeshStandardMaterial({ color: 0x302020 })); v.position.set(e.x + 0.4, e.y, 0.5);
          const face = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), new THREE.MeshBasicMaterial({ color: 0x000000 })); face.position.x = -0.11; face.rotation.y = -Math.PI / 2; v.add(face); break;
        }
        case 'sandfall': {
          const tex = this.A.tex.sand.clone(); tex.needsUpdate = true; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 4); tex.colorSpace = THREE.SRGBColorSpace;
          v = new THREE.Mesh(new THREE.PlaneGeometry(e.w || 1.4, 12), new THREE.MeshBasicMaterial({ map: tex, color: 0xffd090, transparent: true, opacity: 0.75, depthWrite: false }));
          v.userData.tex = tex; v.position.set(e.x, e.y + 6, 0.5); break;
        }
        default: break;
      }
      if (v) { this.level.add(v); this.entViews.set(e.id, v); }
    }
    this.dartViews = [];
    this.boulderView = null;
  }

  _model(name, height) {
    const src = this.A.models[name];
    const o = src.scene.clone(true);
    const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3());
    const s = height / size.y;
    o.scale.setScalar(s); o.position.set(-(box.min.x + size.x / 2) * s, -box.min.y * s, -(box.min.z + size.z / 2) * s);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const g = new THREE.Group(); g.add(o); return g;
  }

  _door() {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ map: this.texs.hiero, color: 0xe8c890, roughness: 0.8 });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.2, 0.8), stone); p.position.set(s * 1.25, 1.6, 0); p.castShadow = true; g.add(p); }
    const lin = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.6, 0.9), stone); lin.position.y = 3.45; g.add(lin);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), this.gold); disc.position.set(0, 3.45, 0.46); g.add(disc);
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 3.15), new THREE.MeshBasicMaterial({ map: this.ptex.glow, color: 0xb070ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    portal.position.set(0, 1.58, -0.05); g.add(portal); g.userData.portal = portal;
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xd4a040, metalness: 0.7, roughness: 0.35 });
    const L1 = new THREE.Mesh(new THREE.BoxGeometry(0.98, 3.1, 0.18), doorMat), R1 = L1.clone();
    L1.position.set(-0.5, 1.55, 0.1); R1.position.set(0.5, 1.55, 0.1); g.add(L1, R1); g.userData.doors = [L1, R1];
    return g;
  }

  _scarab() {
    const g = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({ color: 0x2a9a6a, metalness: 0.75, roughness: 0.25, emissive: 0x0a3020, emissiveIntensity: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 10), shell); body.scale.set(1.25, 0.6, 0.9); body.position.y = 0.26; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0x1a3a2a, metalness: 0.5, roughness: 0.4 })); head.position.set(0.42, 0.22, 0); g.add(head);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.02, 0.03), this.gold); line.position.set(-0.02, 0.48, 0); g.add(line);
    const legs = [];
    for (const sx of [-0.25, 0, 0.25]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.35, 4), this.darkWood); l.position.set(sx, 0.12, sz * 0.3); l.rotation.x = sz * 0.9; g.add(l); legs.push(l); }
    g.userData.legs = legs; g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }

  _bat() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshStandardMaterial({ color: 0x3a2050, roughness: 0.8 })); g.add(body);
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xffd040 });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), eyeM); e.position.set(0.12, 0.05, s * 0.08 + 0.12); g.add(e); }
    const wingTex = canvasTex(64, 64, (c, w) => { c.fillStyle = '#5a2a80'; c.beginPath(); c.moveTo(0, 8); c.lineTo(w, 0); c.lineTo(w * 0.8, w * 0.45); c.lineTo(w * 0.6, w * 0.3); c.lineTo(w * 0.4, w * 0.6); c.lineTo(w * 0.2, w * 0.35); c.lineTo(0, w * 0.55); c.closePath(); c.fill(); });
    const wm = new THREE.MeshStandardMaterial({ map: wingTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 });
    const wings = [];
    for (const s of [-1, 1]) { const piv = new THREE.Group(); const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), wm); w.position.set(0, 0, s * 0.42); w.rotation.y = Math.PI / 2; piv.add(w); g.add(piv); wings.push({ piv, s }); }
    g.userData.wings = wings;
    return g;
  }

  _mummy() {
    const A = this.A.models;
    if (!A.worker_lp) return new THREE.Group();
    const root = SkeletonUtils.clone(A.worker_lp.scene);
    const mat = new THREE.MeshStandardMaterial({ map: this.linenTex, color: 0xe8dcc0, roughness: 0.95 });
    root.traverse((m) => { if (m.isMesh) { m.material = mat; m.castShadow = true; m.frustumCulled = false; } });
    root.scale.multiplyScalar(1.55 / 1.75);
    const g = new THREE.Group(); g.add(root);
    const act = new Actor(root, { Walk: inplace(A.anim_lp_walk?.animations?.[0]) });
    act.play('Walk', { speed: 0.55 });
    g.userData.actor = act;
    g.userData.arms = ['LeftArm', 'RightArm'].map((n) => root.getObjectByName(n));
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x9cff60 });
    const head = root.getObjectByName('Head');
    if (head) for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(4, 6, 4), eyeM); e.position.set(sx * 5, 8, 12); head.add(e); }
    return g;
  }

  _cobra() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x8a6a20, roughness: 0.5, metalness: 0.2 });
    const band = new THREE.MeshStandardMaterial({ color: 0x2a6a8a, roughness: 0.5 });
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 18), skin); coil.rotation.x = Math.PI / 2; coil.position.y = 0.12; g.add(coil);
    const neck = new THREE.Group(); neck.position.y = 0.15; g.add(neck);
    const n1 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.8, 8), skin); n1.position.y = 0.4; neck.add(n1);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), band); hood.scale.set(0.35, 1, 1); hood.position.set(0, 0.85, 0); neck.add(hood);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin); head.scale.set(1.5, 0.8, 1); head.position.set(0.12, 1.02, 0); neck.add(head);
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xff3040 });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeM); e.position.set(0.22, 1.06, s * 0.07); neck.add(e); }
    g.userData.neck = neck;
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }

  // ------------------------------------------------------------ events
  onEvent(e) {
    switch (e.type) {
      case 'coin': { const v = this.entViews.get(e.id); if (v) v.visible = false; this.burst(e.x, e.y, 8, 0xffd860, 2.4); break; }
      case 'papyrus': { this.level.children.forEach(() => {}); this.burst(e.x, e.y, 22, 0xd08cff, 4); for (const [id, v] of this.entViews) { const en = this.sim.ents[id]; if (en.type === 'papyrus' && !en.alive) v.visible = false; } break; }
      case 'heal': { for (const [id, v] of this.entViews) { const en = this.sim.ents[id]; if (en.type === 'ankh' && !en.alive) v.visible = false; } this.burst(e.x, e.y, 12, 0x80ffb0); break; }
      case 'stomp': { const v = this.entViews.get(e.id); if (v) v.userData.dying = 0.35; this.dust(e.x, e.y, 8); this.burst(e.x, e.y, 10, 0xffe0a0); break; }
      case 'land': this.landT = 0.32; if (e.v > 8) this.dust(e.x, e.y, 5); break;
      case 'jump': this.dust(e.x, e.y, 3); break;
      case 'djump': this.burst(e.x, e.y + 0.2, 10, 0xffd860, 2.5); break;
      case 'walljump': this.dust(e.x, e.y, 4); break;
      case 'hurt': this.shake = 0.25; this.burst(e.x, e.y, 10, 0xff6090); break;
      case 'die': this.shake = 0.35; this.burst(e.x, e.y + 0.6, 18, 0xff70a0, 4); break;
      case 'splash': for (let k = 0; k < 12; k++) this.spawn('glow', e.x + (Math.random() - 0.5), e.y, 0.5, { vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, life: 0.6, size: 0.25, color: 0x80e8ff, gravity: 9 }); break;
      case 'checkpoint': { this.burst(e.x, e.y + 2.4, 20, 0x60ffb0, 3); break; }
      case 'break': { const g = this.crackViews.get(e.y * this.L.w + e.x); if (g) g.visible = false; this.dust(e.x + 0.5, e.y + 0.5, 10, 0xe0c090); for (let k = 0; k < 8; k++) this.spawn('dust', e.x + Math.random(), e.y + Math.random(), 0.5, { vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 2, life: 0.8, size: 0.25, gravity: 10, color: 0xc8a070, additive: false }); break; }
      case 'crumbleFall': this.dust(e.x + 0.5, e.y + 0.5, 6, 0xd8b890); break;
      case 'slam': this.shake = 0.12; this.dust(e.x, e.y, 6); break;
      case 'boulderCrash': this.shake = 0.4; this.dust(e.x, e.y + 0.5, 14); break;
      case 'win': { const v = [...this.entViews.values()].find((q) => q.userData.doors); if (v) v.userData.opening = 0.001; this.burst(e.x, e.y + 1.6, 30, 0xd090ff, 5); break; }
      default: break;
    }
  }

  // ------------------------------------------------------------ frame
  update(dt, gdt) {
    this.time += dt;
    const S = this.sim, L = this.L;
    if (!S) return;
    const p = S.p;
    // explorer
    const g = this.pl.group;
    g.position.set(p.x, p.y, 0);
    const want = (p.state === 'climb' ? 0 : p.state === 'win' ? 0.2 : p.face * (Math.PI / 2 - 0.42));
    let dy = want - this.plYaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    this.plYaw += dy * Math.min(1, dt * 14);
    g.rotation.y = p.state === 'climb' ? Math.PI : this.plYaw;
    const anim = { idle: 'Idle', run: 'Run', jump: 'Jump', fall: 'Fall', climb: 'Climb', swim: 'Swim', hurt: 'Hit', win: 'Cheer' }[p.state] || 'Idle';
    if (this.landT > 0) this.landT -= gdt;
    if (p.dead > 0) this.pl.play('Hit', { once: true, fade: 0.1 });
    else if (anim === 'Run') this.pl.play('Run', { speed: 0.75 + 0.35 * Math.min(1, Math.abs(p.vx) / P.RUN), fade: this.landT > 0 ? 0.12 : 0.18 });
    else if (anim === 'Climb') this.pl.play('Climb', { speed: Math.abs(p.vy) > 0.2 || Math.abs(p.vx) > 0.2 ? 1.1 : 0.0001 });
    else if (anim === 'Jump') this.pl.play('Jump', { once: true, speed: 1.0, fade: 0.08 });
    else if (anim === 'Fall') this.pl.play('Fall', { once: true, speed: 0.9, fade: 0.2 });
    else if (anim === 'Idle' && this.landT > 0) this.pl.play('Land', { once: true, speed: 1.4, fade: 0.06 });
    else this.pl.play(anim, { fade: 0.2 });
    g.visible = p.dead > 0 ? Math.floor(this.time * 20) % 2 === 0 && p.dead > 0.6 : !(p.inv > 0 && Math.floor(this.time * 16) % 2 === 0);
    // swimming is done lying in the water; running leans a little into the speed
    g.position.y += p.state === 'swim' ? 0.42 : 0;
    this.pl.root.rotation.x = p.state === 'run' ? Math.min(0.12, Math.abs(p.vx) * 0.014) : 0;
    this.pl.mixer.update(gdt);
    // blob shadow on the ground below
    const gy = S.groundTop(p.x, p.y + 0.5);
    this.blob.position.set(p.x, Math.max(gy, -1) + 0.02, 0.2);
    const hgt = p.y - gy;
    this.blob.material.opacity = Math.max(0, 0.9 - hgt * 0.15); this.blob.scale.setScalar(Math.max(0.4, 1 - hgt * 0.08));
    this.lantern.position.set(p.x + p.face * 0.4, p.y + 1.6, 1.4);

    // entities
    for (const e of S.ents) {
      const v = this.entViews.get(e.id);
      if (!v) continue;
      if (v.userData.dying !== undefined) { v.userData.dying -= dt; v.scale.y = Math.max(0.05, v.userData.dying * 2.5); if (v.userData.dying <= 0) v.visible = false; continue; }
      switch (e.type) {
        case 'coin': if (e.alive) { v.scale.x = 0.78 * Math.cos(this.time * 3 + e.x); v.position.y = e.y + Math.sin(this.time * 2 + e.x) * 0.06; } break;
        case 'papyrus': if (e.alive) { v.position.y = e.y + Math.sin(this.time * 2.2) * 0.12; v.children[1].material.opacity = 0.5 + Math.sin(this.time * 4) * 0.25; } break;
        case 'ankh': if (e.alive) v.position.y = e.y + Math.sin(this.time * 2.5) * 0.1; break;
        case 'scarab': v.position.set(e.x, e.y, 0); v.rotation.y = e.dir > 0 ? 0 : Math.PI; v.userData.legs.forEach((l, i) => { l.rotation.z = Math.sin(this.time * 18 + i) * 0.5; }); break;
        case 'bat': v.position.set(e.x, e.y, 0.2); v.rotation.y = e.dir > 0 ? 0 : Math.PI; v.userData.wings.forEach(({ piv, s }) => { piv.rotation.x = s * Math.sin(this.time * 16) * 0.8; }); break;
        case 'mummy': {
          v.position.set(e.x, e.y, 0); v.rotation.y = e.dir > 0 ? Math.PI / 2 - 0.3 : -Math.PI / 2 + 0.3;
          const a = v.userData.actor; if (a) { a.mixer.update(gdt); for (const arm of v.userData.arms) if (arm) arm.rotation.x -= 1.2; }
          break;
        }
        case 'cobra': { v.rotation.y = e.dir > 0 ? 0 : Math.PI; const n = v.userData.neck; n.rotation.z = (e.strike > 0 ? -0.9 : Math.sin(this.time * 2) * 0.12); n.position.x = e.strike > 0 ? 0.35 : 0; break; }
        case 'mover': v.position.set(e.x + e.w / 2, e.y - 0.21, 0); break;
        case 'crusher': { const b = e.y - 1 - (e.k || 0) * e.drop; v.position.y = b; v.userData.chain.scale.y = 1 + (e.k || 0) * e.drop; v.userData.chain.position.y = 1 + ((e.k || 0) * e.drop + 1) / 2; break; }
        case 'fire': v.userData.fl.forEach((s, k) => { const on = e.burning ? 1 : e.warn ? 0.25 : 0; s.visible = on > 0; s.scale.set((0.7 + Math.sin(this.time * 20 + k) * 0.15) * (k ? 0.8 : 1), 1.1 * on, 1); s.material.opacity = on; }); break;
        case 'checkpoint': v.userData.glow.material.opacity = e.on ? 0.6 + Math.sin(this.time * 4) * 0.25 : 0; break;
        case 'exit': {
          v.userData.portal.material.opacity = 0.6 + Math.sin(this.time * 3) * 0.2;
          if (v.userData.opening) { v.userData.opening = Math.min(1, v.userData.opening + dt * 0.8); const [Ld, Rd] = v.userData.doors; Ld.position.x = -0.5 - v.userData.opening * 0.95; Rd.position.x = 0.5 + v.userData.opening * 0.95; }
          break;
        }
        case 'sandfall': v.userData.tex.offset.y += dt * 1.6; if (Math.random() < dt * 8) this.spawn('dust', e.x + (Math.random() - 0.5) * 1.2, e.y + 0.1, 0.6, { vx: (Math.random() - 0.5) * 2, vy: 0.6, life: 0.8, size: 0.5, grow: 1, opacity: 0.6, color: 0xe8c088, additive: false }); break;
        case 'torch': { const fl = v.userData.flame; const s = 0.5 + Math.sin(this.time * 17 + e.x) * 0.05; fl.scale.set(s, s * 1.6, 1); v.userData.halo.material.opacity = 0.35 + Math.sin(this.time * 11 + e.x * 3) * 0.08; break; }
        default: break;
      }
    }
    // crumbling blocks shake, fall and come back
    for (const [i, c] of this.crumbleViews) {
      const st = S.crumbles.get(i);
      if (!st) { c.m.visible = true; c.m.position.set(c.x + 0.5, c.y + 0.5, 0); c.m.rotation.set(0, 0, 0); continue; }
      if (!st.gone) c.m.position.set(c.x + 0.5 + (Math.random() - 0.5) * 0.08, c.y + 0.5, 0);
      else { const t = st.t - 0.5; c.m.position.y = c.y + 0.5 - t * t * 9; c.m.rotation.z = t * 1.5; c.m.visible = t < 1.2; }
    }
    // darts
    while (this.dartViews.length < S.darts.length) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), this.darkWood); m.rotation.z = Math.PI / 2; const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 5), this.bronze); tip.position.y = 0.36; m.add(tip); this.level.add(m); this.dartViews.push(m); }
    this.dartViews.forEach((m, i) => { const d = S.darts[i]; m.visible = !!d; if (d) { m.position.set(d.x, d.y, 0.3); m.rotation.z = d.vx > 0 ? -Math.PI / 2 : Math.PI / 2; } });
    // boulder
    const B = S.boulder;
    if (B && !this.boulderView) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 2), new THREE.MeshStandardMaterial({ map: this.texs.sandstone, color: 0xc0a080, roughness: 0.9, flatShading: true }));
      m.castShadow = true; this.level.add(m); this.boulderView = m;
    }
    if (this.boulderView) {
      this.boulderView.visible = !!B && B.active;
      if (B) { this.boulderView.position.set(B.x, B.y + 1.15, 0); this.boulderView.rotation.z = B.rot; if (B.active && Math.random() < dt * 14) this.dust(B.x - 0.8, B.y, 2); }
      if (!B) this.boulderView.visible = false;
    }
    // animated materials
    if (this.waterTex) { this.waterTex.offset.x += dt * 0.04; this.waterTex.offset.y = Math.sin(this.time * 0.6) * 0.03; }
    if (this.sandTex) this.sandTex.offset.y -= dt * 0.03;
    for (const r of this.rays) r.material.opacity = (this.L.theme.dark ? 0.06 : 0.13) + Math.sin(this.time * 0.7 + r.position.x) * 0.04;

    // camera: look ahead, smooth, clamp to the level
    const c = this.cam;
    const tx = p.x + p.face * 1.6 + p.vx * 0.18, ty = p.y + 1.8;
    c.x += (tx - c.x) * Math.min(1, dt * 3.2);
    c.y += (ty - c.y) * Math.min(1, dt * (ty < c.y ? 4.5 : 2.4));
    const halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * c.dist, halfW = halfH * this.camera.aspect;
    c.x = Math.max(halfW - 0.5, Math.min(L.w - halfW + 0.5, c.x));
    c.y = Math.max(halfH - 1.2, Math.min(H - halfH + 2, c.y));
    let sx = 0, sy = 0;
    if (this.shake > 0) { this.shake -= dt; sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; }
    this.camera.position.set(c.x + sx, c.y + sy + 3.4, c.dist);
    this.camera.lookAt(c.x + sx, c.y + sy, 0);
    // far painting fills the view and drifts slowly (parallax)
    const fz = -45, fd = c.dist - fz, fh = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * fd * 1.15, fw = Math.max(fh * this.camera.aspect, fh * 16 / 9);
    this.far.scale.set(fw, fw * 9 / 16 < fh ? fh : fw * 9 / 16, 1);
    this.far.position.set(c.x * 0.86 + L.w * 0.07, c.y * 0.9 + 1, fz);
    // shadows and lights follow the camera
    this.key.position.set(c.x - 6, c.y + 12, 12); this.key.target.position.set(c.x, c.y - 3, 0);
    const ts = this.torches.map((t) => ({ t, d: Math.abs(t.position.x - c.x) + Math.abs(t.position.y - c.y) * 0.5 })).sort((a, b) => a.d - b.d);
    this.torchLights.forEach((l, i) => { const q = ts[i]; if (q && q.d < 16) { l.position.copy(q.t.position).add(tmpV.set(0, 0.6, 0.6)); l.intensity = (this.L.theme.dark ? 14 : 7) * (0.9 + Math.sin(this.time * 13 + i) * 0.1); } else l.intensity = 0; });
    // motes drift with the world's mood and wrap around the view
    const mp = this.motes.geometry.attributes.position.array, mv = this.moteV;
    for (let i = 0; i < mp.length; i += 3) {
      mp[i] += mv[i] * gdt + Math.sin(this.time * 0.7 + i) * 0.002; mp[i + 1] += mv[i + 1] * gdt;
      if (mp[i] < c.x - 20) mp[i] += 40; else if (mp[i] > c.x + 20) mp[i] -= 40;
      if (mp[i + 1] < c.y - 10) mp[i + 1] += 22; else if (mp[i + 1] > c.y + 12) mp[i + 1] -= 22;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
    this.motes.position.set(0, 0, 0);
    this.motes.material.opacity = this.mood && this.mood.twinkle ? 0.55 + Math.sin(this.time * 3) * 0.25 : 0.7;
    // particles
    for (const q of this.pool) {
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) { q.s.visible = false; continue; }
      const t = 1 - q.life / q.max;
      q.v.y -= q.gravity * dt; q.s.position.addScaledVector(q.v, dt); q.v.multiplyScalar(1 - dt * 1.5);
      q.s.scale.setScalar(q.size * (1 + q.grow * t));
      q.s.material.opacity = q.op * Math.min(1, t * 8) * (1 - t * t);
    }
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep ~11 tiles of height in landscape and at least ~10 tiles of width in portrait
    const hv = Math.max(8.2, 9.4 / this.camera.aspect);
    this.cam.dist = hv / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.camera.updateProjectionMatrix();
  }

  setQuality(q) {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, q >= 2 ? 2 : q === 1 ? 1.5 : 1.1));
    this.key.castShadow = q >= 1;
    this.torchLights.forEach((l, i) => { l.visible = q >= 1 || i < 2; });
    this.motes.visible = q >= 1;
    this.resize(this.renderer.domElement.clientWidth || window.innerWidth, this.renderer.domElement.clientHeight || window.innerHeight);
  }

}
