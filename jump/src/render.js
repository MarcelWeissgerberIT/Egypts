// 2.5D renderer for the pyramid platformer: carved block geometry with world-space textures,
// a painted parallax background per world, pillars and light shafts in between, torches,
// the Meshy explorer with her animations, enemies, traps and particles.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { T } from './levels.js';
import { P } from './sim.js';

const D = 0.9;                // half depth of the blocks (z)
const BEETLE_YAW = Math.PI / 2;   // the SAM models face +z; this turns the head toward +x
import { BOSS_DEF, bossHeight } from './boss.js';
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
    for (const k of ['sandstone', 'granite', 'hiero', 'glyph']) {
      const t = assets.tex[k]; if (!t) continue; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; this.texs[k] = t;
    }
    this.focus = null; this.lookY = 0; this.look = 0;
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
    // the torch the explorer carries in the dark world
    this.handLight = new THREE.PointLight(0xff9a48, 0, 13, 1.25); this.scene.add(this.handLight);
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
    this.ringTex = canvasTex(128, 128, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, w * 0.3, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,240,180,0)'); g.addColorStop(0.55, 'rgba(255,220,120,0.15)'); g.addColorStop(0.8, 'rgba(255,230,150,0.9)'); g.addColorStop(0.9, 'rgba(255,200,90,0.4)'); g.addColorStop(1, 'rgba(255,180,60,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    this.wingTex = canvasTex(64, 64, (c, w) => {
      const g = c.createLinearGradient(0, 0, w, w); g.addColorStop(0, 'rgba(120,255,230,0.85)'); g.addColorStop(0.6, 'rgba(190,120,255,0.7)'); g.addColorStop(1, 'rgba(255,220,120,0.4)');
      c.fillStyle = g; c.beginPath(); c.ellipse(w / 2, w / 2, w * 0.48, w * 0.24, 0.35, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(40,20,60,0.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(6, w / 2 + 6); c.lineTo(w - 8, w / 2 - 8); c.stroke();
    });
    this.jarTex = canvasTex(64, 128, (c, w, h) => {
      c.fillStyle = '#b8643a'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(80,30,10,${0.05 + Math.random() * 0.06})`; c.fillRect(0, y, w, 1); }
      c.fillStyle = '#5a2a80'; c.fillRect(0, h * 0.42, w, h * 0.09);
      c.fillStyle = '#e8b040'; c.fillRect(0, h * 0.4, w, h * 0.02); c.fillRect(0, h * 0.51, w, h * 0.02);
      c.fillStyle = '#2a8a8a'; for (let x = 4; x < w; x += 16) c.fillRect(x, h * 0.6, 6, h * 0.05);
    });
    this.plankTex = canvasTex(128, 32, (c, w, h) => {
      c.fillStyle = '#9a6234'; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) {
        const g = c.createLinearGradient(x, 0, x, h); g.addColorStop(0, '#c08048'); g.addColorStop(0.5, '#a86a38'); g.addColorStop(1, '#7a4a24'); c.fillStyle = g; c.fillRect(x + 1, 1, 30, h - 2);
        c.strokeStyle = 'rgba(60,30,10,0.35)'; c.lineWidth = 1; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x + 2, 6 + k * 6 + (x % 3)); c.bezierCurveTo(x + 10, 4 + k * 6, x + 20, 9 + k * 6, x + 30, 6 + k * 6); c.stroke(); }
        c.fillStyle = '#3a2410'; c.fillRect(x, 0, 1.5, h);
        c.fillStyle = '#e8c070'; c.beginPath(); c.arc(x + 5, 6, 1.6, 0, 7); c.arc(x + 5, h - 6, 1.6, 0, 7); c.fill();
      }
    });
    this.gemCols = [0x3ff0d8, 0xc070ff, 0xffc030, 0xff6aa0];
    this.symCols = { ankh: 0x40f0d0, lotus: 0xff70c0, djed: 0xffb030, falcon: 0x5a8cff };
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
    this.hand = null;
    root.traverse((o) => { if (!this.hand && /right.?hand$|hand_?r$/i.test(o.name)) this.hand = o; });
    const tg = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.55, 6), new THREE.MeshStandardMaterial({ color: 0x5a3818, roughness: 0.9 })); stick.position.y = -0.1; tg.add(stick);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); fl.position.y = 0.3; fl.scale.set(0.42, 0.7, 1); tg.add(fl);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff9a40, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); halo.position.y = 0.3; halo.scale.set(2.2, 2.2, 1); tg.add(halo);
    tg.visible = false; this.scene.add(tg); this.handTorch = { g: tg, fl, halo };
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
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();      // each clone has its own bone texture
      if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (m.userData && m.userData.shared) continue;
        if (m.userData && m.userData.keepMaps) { m.dispose(); continue; }
        for (const k of ['map', 'alphaMap']) if (m[k] && !shared.has(m[k]) && ![this.flameTex, this.rayTex, this.crackTex, this.linenTex, this.ptex.glow, this.ringTex, this.wingTex, this.jarTex, this.blob.material.map, this.plankTex].includes(m[k])) m[k].dispose();
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
    this.focus = null; this.stickView = null; this.beamView = null;
    this.crackViews = new Map();
    const W = L.theme;
    const tex = this.texs[W.tex].clone(); tex.needsUpdate = true; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this.blockMat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.88, color: W.tex === 'granite' ? new THREE.Color(W.tint).lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(1.6) : new THREE.Color(W.tint).multiplyScalar(0.86) });
    const sand = this.A.tex.sand.clone(); sand.needsUpdate = true; sand.wrapS = sand.wrapT = THREE.RepeatWrapping; sand.colorSpace = THREE.SRGBColorSpace;
    this.topMat = new THREE.MeshStandardMaterial({ map: W.tex === 'granite' ? tex : sand, vertexColors: true, roughness: 0.95, color: W.tex === 'granite' ? new THREE.Color(W.tint).lerp(new THREE.Color(0xffffff), 0.5).multiplyScalar(1.7) : new THREE.Color(0xffe6c0) });
    const torchlit = !!W.torchlit;
    this.torchlit = torchlit;
    this.scene.fog = new THREE.Fog(W.fog, torchlit ? 8 : 26, torchlit ? 32 : 80);
    this.hemi.intensity = torchlit ? 0.14 : 0.55 + W.amb * 0.55;
    this.key.intensity = torchlit ? 0.1 : W.dark ? 0.5 : 1.4 + W.amb * 0.6;
    this.rim.color.set(W.sky); this.rim.intensity = torchlit ? 0.25 : 0.9;
    this.lantern.intensity = W.dark && !torchlit ? 26 : 0;
    this.handTorch.g.visible = torchlit; this.handTorch.fl.material.map = this.flameTex; this.handTorch.halo.material.map = this.ptex.glow;
    this.handLight.intensity = torchlit ? 34 : 0;
    document.getElementById('app')?.classList.toggle('dark', torchlit);
    // floating particles that set the mood of each world
    const MOOD = { entrance: [0xffe2a8, 0.09, 0, 0.15], hieroglyphs: [0xffd8f0, 0.08, 0.05, 0.1], cistern: [0x9ff4ff, 0.11, 0, 0.45], scarabs: [0xd090ff, 0.1, 0.1, 0.2],
      crypt: [0x9cff9c, 0.12, 0.05, 0.08], sandfalls: [0xffc070, 0.13, 1.6, -0.2], traps: [0xff8040, 0.1, 0.1, 0.6], treasury: [0xffe060, 0.1, 0, 0.12], stars: [0xc8d8ff, 0.12, 0, 0.05], king: [0xff90e0, 0.11, 0.05, 0.3] };
    const [mc, ms, wind, rise] = MOOD[W.key] || MOOD.entrance;
    this.motes.material.color.set(mc); this.motes.material.size = ms; this.mood = { wind, rise, twinkle: W.key === 'stars' || W.key === 'treasury' };
    for (let i = 0; i < this.moteV.length; i += 3) { this.moteV[i] = wind * (0.6 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.2; this.moteV[i + 1] = rise * (0.5 + Math.random()) + (Math.random() - 0.5) * 0.1; this.moteV[i + 2] = 0; }
    this._blocks(L);
    this._backdrop(L);
    this._entities(L);
    this._powerFx();
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
    // one-way ledges are wooden planks, so it is clear they can be jumped through from below
    const slabMat = new THREE.MeshStandardMaterial({ map: this.plankTex, color: 0xffffff, roughness: 0.85 });
    inst(new THREE.BoxGeometry(1.0, 0.22, 1.5), slabMat, ledges, ([x, y]) => tmpM.compose(tmpV.set(x, y, 0.1), tmpQ.identity(), tmpS.set(1, 1, 1)));
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
    this.far = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: bgTex, fog: false, depthWrite: false, color: W.torchlit ? 0x2a2038 : 0xffffff }));
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
    for (let x = 6; x < L.w + 10; x += 11) pillar(x, -4.5, 0.75, L.h + 2);
    for (let x = 0; x < L.w + 20; x += 17) pillar(x + 7, -11, 1.4, L.h + 12, -4);
    // low wall right behind the path, stepping with the ground
    const floorAt = (x) => { let k = 0; while (k < L.h && L.tiles[k * L.w + x] === T.SOLID) k++; return k; };
    const wallMat = new THREE.MeshStandardMaterial({ map: this.texs.hiero, color: new THREE.Color(W.tint).multiplyScalar(0.55), roughness: 1 });
    for (let x0 = 0; x0 < L.w; x0 += 6) {
      let fy = 99; for (let x = x0; x < Math.min(L.w, x0 + 6); x++) fy = Math.min(fy, floorAt(x));
      const w = Math.min(6, L.w - x0), y0 = fy - 2.5, h = 6.5;
      const geo = new THREE.PlaneGeometry(w, h); const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * w) / 4, (y0 + uv.getY(i) * h) / 4);
      const wall = new THREE.Mesh(geo, wallMat); wall.position.set(x0 + w / 2, y0 + h / 2, -1.6); wall.receiveShadow = true; this.level.add(wall);
    }
    // god rays
    this.rays = [];
    for (let x = 4; x < L.w; x += 9 + (x % 7)) {
      if (W.torchlit) break;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, L.h + 8), new THREE.MeshBasicMaterial({ map: this.rayTex, color: W.sky, transparent: true, opacity: W.dark ? 0.08 : 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.position.set(x, L.h / 2 + 1, -3 - (x % 3)); m.rotation.z = -0.32; m.renderOrder = -1; this.level.add(m); this.rays.push(m);
    }
    // the tall chambers get a carved inner wall
    const chamberMat = new THREE.MeshStandardMaterial({ map: this.texs.hiero, color: new THREE.Color(W.tint).multiplyScalar(0.42), roughness: 1 });
    for (const e of L.ents) {
      if (e.type !== 'chamber') continue;
      const geo = new THREE.PlaneGeometry(e.w + 1, e.h); const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (e.w + 1) / 3, uv.getY(i) * e.h / 3);
      const m = new THREE.Mesh(geo, chamberMat); m.position.set(e.x + e.w / 2 - 0.5, e.y + e.h / 2, -1.3); m.receiveShadow = true; this.level.add(m);
      for (const yy of [e.y + e.h - 0.2]) { const t = new THREE.Mesh(new THREE.BoxGeometry(e.w + 1, 0.12, 0.1), this.gold); t.position.set(e.x + e.w / 2 - 0.5, yy, -1.25); this.level.add(t); }
    }
  }

  _entities(L) {
    const S = this.sim;
    const icon = (key) => { const t = this.A.img[key + 'Tex']; return t; };
    this.torches = [];
    // per-level materials of the puzzle pieces
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.texs.hiero, color: new THREE.Color(L.theme.tint).multiplyScalar(0.95), roughness: 0.85 });
    this.glyphMats = { front: new THREE.MeshStandardMaterial({ map: this.texs.glyph || this.texs.sandstone, roughness: 0.55, metalness: 0.15, emissive: 0x2a1240, emissiveIntensity: 0.5 }),
      side: new THREE.MeshStandardMaterial({ map: this.texs.sandstone, color: 0xe8b860, roughness: 0.6, metalness: 0.3 }),
      used: new THREE.MeshStandardMaterial({ map: this.texs.sandstone, color: 0x8a7458, roughness: 0.95 }) };
    const gemMat = (i, k = 1) => new THREE.MeshStandardMaterial({ color: this.gemCols[i % 4], emissive: this.gemCols[i % 4], emissiveIntensity: 0.6 * k, metalness: 0.3, roughness: 0.2 });
    const unit = new THREE.BoxGeometry(1, 1, 1);
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
          fl.visible = halo.visible = e.lit !== false; v.userData.ent = e;
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
        case 'flyer': v = this._flyer(); v.position.set(e.x, e.y, 0.3); break;
        case 'jackal': v = this._jackal(); v.position.set(e.x, e.y, 0); break;
        case 'boss': v = this._boss(e); break;
        case 'hopper': v = this._scarab(true); v.position.set(e.x, e.y, 0); break;
        case 'itemblock': {
          const g = this.glyphMats;
          v = new THREE.Mesh(unit, [g.side, g.side, g.side, g.side, g.front, g.side]);
          v.scale.set(1, 1, 1.5); v.castShadow = v.receiveShadow = true; v.position.set(e.x + 0.5, e.y + 0.5, 0); v.userData.used = false; break;
        }
        case 'block': {
          v = new THREE.Group();
          const b = new THREE.Mesh(unit, stoneMat); b.scale.set(0.98, 0.98, 1.5); b.castShadow = b.receiveShadow = true; v.add(b);
          for (const [sx, sy, w, h] of [[0, 0.47, 0.98, 0.06], [0, -0.47, 0.98, 0.06], [0.47, 0, 0.06, 0.98], [-0.47, 0, 0.06, 0.98]]) { const t = new THREE.Mesh(unit, this.gold); t.scale.set(w, h, 0.04); t.position.set(sx, sy, 0.76); v.add(t); }
          const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: icon('icon_eye') || null, transparent: true, depthWrite: false, opacity: 0.85 })); eye.scale.set(0.5, 0.5, 1); eye.position.set(0, 0, 0.8); v.add(eye);
          v.position.set(e.x + 0.5, e.y + 0.5, 0); break;
        }
        case 'gate': {
          v = new THREE.Group();
          const slab = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ map: this.texs.hiero, color: new THREE.Color(L.theme.tint).multiplyScalar(0.7), roughness: 0.8 }));
          slab.scale.set(0.9, e.h, 1.3); slab.position.y = e.h / 2; slab.castShadow = true; v.add(slab);
          for (const bx of [-0.3, 0, 0.3]) { const bar = new THREE.Mesh(unit, this.bronze); bar.scale.set(0.07, e.h - 0.2, 0.06); bar.position.set(bx, e.h / 2, 0.67); v.add(bar); }
          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), gemMat(e.gem, 1.5)); gem.position.set(0, e.h - 0.45, 0.72); v.add(gem);
          v.userData.gem = gem; v.userData.lift = e.open ? e.h : 0;
          v.position.set(e.x + 0.5, e.y, 0); break;
        }
        case 'lever': {
          v = new THREE.Group();
          const base = new THREE.Mesh(unit, stoneMat); base.scale.set(0.6, 0.3, 0.5); base.position.y = 0.15; v.add(base);
          const piv = new THREE.Group(); piv.position.y = 0.3; v.add(piv);
          const h = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.95, 8), this.bronze); h.position.y = 0.47; piv.add(h);
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), gemMat(e.gem, 1.3)); knob.position.y = 0.97; piv.add(knob);
          piv.rotation.z = 0.65; v.userData.piv = piv;
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ptex.glow, color: this.gemCols[e.gem % 4], transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); halo.position.y = 1.0; halo.scale.set(1.3, 1.3, 1); v.add(halo); v.userData.halo = halo;
          v.traverse((m) => { if (m.isMesh) m.castShadow = true; });
          v.position.set(e.x, e.y, 0.2); break;
        }
        case 'plate': {
          v = new THREE.Group();
          const pl = new THREE.Mesh(unit, this.bronze); pl.scale.set(0.9, 0.12, 1.3); pl.position.y = 0.06; pl.receiveShadow = true; v.add(pl);
          const inl = new THREE.Mesh(unit, gemMat(e.gem, 0.6)); inl.scale.set(0.55, 0.03, 0.8); inl.position.y = 0.125; v.add(inl);
          v.userData.inlay = inl; v.position.set(e.x + 0.5, e.y, 0); break;
        }
        case 'pedestal': {
          v = new THREE.Group();
          const col = new THREE.Mesh(unit, stoneMat); col.scale.set(0.55, 1.0, 0.55); col.position.y = 0.5; col.castShadow = true; v.add(col);
          const cap = new THREE.Mesh(unit, this.gold); cap.scale.set(0.72, 0.1, 0.72); cap.position.y = 1.05; v.add(cap);
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ptex.glow, color: this.symCols[e.sym], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); glow.position.set(0, 1.55, 0.25); glow.scale.set(2, 2, 1); v.add(glow);
          const plq = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: icon('sym_' + e.sym) || null, transparent: true, color: 0xb8a890, depthWrite: false }));
          plq.position.set(0, 1.55, 0.3); v.add(plq);
          v.userData.glow = glow; v.userData.plq = plq; v.position.set(e.x, e.y, 0); break;
        }
        case 'tablet': v = this._tablet(e); break;
        case 'jar': {
          v = new THREE.Group();
          const prof = [[0.001, 0], [0.16, 0.02], [0.27, 0.14], [0.31, 0.32], [0.27, 0.5], [0.15, 0.64], [0.11, 0.72], [0.15, 0.8], [0.13, 0.84], [0.001, 0.84]].map(([a, b]) => new THREE.Vector2(a, b));
          const m = new THREE.Mesh(new THREE.LatheGeometry(prof, 14), new THREE.MeshStandardMaterial({ map: this.jarTex, roughness: 0.8 }));
          m.castShadow = true; v.add(m); v.position.set(e.x, e.y, 0.1); break;
        }
        case 'power': {
          v = new THREE.Group();
          const glowCol = { shield: 0x60ffe0, stick: 0xffc060, feather: 0xe0d0ff, sun: 0xffd040 }[e.kind] || 0xffffff;
          const g2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ptex.glow, color: glowCol, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })); g2.scale.set(2, 2, 1); v.add(g2);
          const ic = new THREE.Sprite(new THREE.SpriteMaterial({ map: icon('pw_' + e.kind) || null, transparent: true, depthWrite: false })); ic.scale.set(0.95, 0.95, 1); v.add(ic);
          v.userData.glow = g2; v.visible = false; v.position.set(e.x, e.y, 0.35); break;
        }
        default: break;
      }
      if (v) { this.level.add(v); this.entViews.set(e.id, v); }
    }
    this.dartViews = [];
    this.boulderView = null;
    this.knownEnts = S.ents.length;
    this.shotViews = new Map();
    this.beamView = null;
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

  // the beetle model (Meta SAM 3D); falls back to a few spheres when it could not be loaded
  _beetleMesh(tint = null) {
    const src = this.A.models.beetle;
    const g = new THREE.Group();
    if (src) {
      const o = src.scene.clone(true);
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.castShadow = true; m.userData.sharedGeo = true;
        if (!m.material.userData.tuned) { m.material.metalness = 0.25; m.material.roughness = 0.35; m.material.userData.tuned = true; }
        if (tint) { m.material = m.material.clone(); m.material.color = new THREE.Color(tint); m.material.emissive = new THREE.Color(tint).multiplyScalar(0.08); }
        else { m.material.userData.shared = true; m.material.emissive = new THREE.Color(0x0a2018); }
      });
      const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3());
      const sc = 1.0 / Math.max(size.x, size.z);
      o.scale.setScalar(sc); o.position.set(-(box.min.x + size.x / 2) * sc, -box.min.y * sc, -(box.min.z + size.z / 2) * sc);
      const piv = new THREE.Group(); piv.add(o); piv.rotation.y = BEETLE_YAW; g.add(piv);
      g.userData.body = piv;
      return g;
    }
    const shell = new THREE.MeshStandardMaterial({ color: tint || 0x2a9a6a, metalness: 0.75, roughness: 0.25, emissive: 0x0a3020, emissiveIntensity: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 10), shell); body.scale.set(1.25, 0.6, 0.9); body.position.y = 0.26; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0x1a3a2a, metalness: 0.5, roughness: 0.4 })); head.position.set(0.42, 0.22, 0); g.add(head);
    g.userData.body = body;
    return g;
  }
  _scarab(hopper = false) {
    const g = new THREE.Group();
    const b = this._beetleMesh(hopper ? 0xffb8f0 : null);
    if (hopper) b.scale.setScalar(0.85);
    g.add(b); g.userData.beetle = b;
    return g;
  }
  _flyer() {
    const g = new THREE.Group();
    const b = this._beetleMesh(0xc8ffe8); b.scale.setScalar(0.8); b.position.y = -0.25; g.add(b);
    const wm = new THREE.MeshBasicMaterial({ map: this.wingTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const wings = [];
    for (const s2 of [-1, 1]) { const piv = new THREE.Group(); piv.position.set(-0.05, 0.12, 0); const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.45), wm); w.position.set(-0.1, 0, s2 * 0.38); w.rotation.x = -Math.PI / 2; piv.add(w); g.add(piv); wings.push({ piv, s: s2 }); }
    g.userData.wings = wings; g.userData.beetle = b;
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
    if (A.mummy) {
      const root = SkeletonUtils.clone(A.mummy.scene);
      root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; m.userData.sharedGeo = true; m.material.userData.shared = true; m.material.metalness = 0; m.material.roughness = 0.85; } });
      root.scale.multiplyScalar(1.5 / 1.6);
      const g = new THREE.Group(); g.add(root);
      const act = new Actor(root, { Walk: inplace(A.mummy.animations[0]) });
      act.play('Walk', { speed: 0.8 });
      act.mixer.update(Math.random() * 2);
      g.userData.actor = act;
      const eyes = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ptex.glow, color: 0x80ff60, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      eyes.scale.set(0.5, 0.3, 1); eyes.position.set(0, 1.38, 0.25); g.add(eyes);
      return g;
    }
    if (!A.worker_lp) return new THREE.Group();
    const root = SkeletonUtils.clone(A.worker_lp.scene);
    const mat = new THREE.MeshStandardMaterial({ map: this.linenTex, color: 0xe8dcc0, roughness: 0.95 });
    root.traverse((m) => { if (m.isMesh) { m.material = mat; m.castShadow = true; m.frustumCulled = false; m.userData.sharedGeo = true; } });
    root.scale.multiplyScalar(1.55 / 1.75);
    const g = new THREE.Group(); g.add(root);
    const act = new Actor(root, { Walk: inplace(A.anim_lp_walk?.animations?.[0]) });
    act.play('Walk', { speed: 0.55 });
    g.userData.actor = act;
    g.userData.arms = ['LeftArm', 'RightArm'].map((n) => root.getObjectByName(n));
    return g;
  }

  // the jackal temple guard (rigged, running)
  _jackal() {
    const src = this.A.models.jackal;
    if (!src) return this._mummy();
    const root = SkeletonUtils.clone(src.scene);
    root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; m.userData.sharedGeo = true; m.material.userData.shared = true; m.material.metalness = 0; m.material.roughness = 0.75; } });
    root.scale.multiplyScalar(1.5 / 1.6);
    const g = new THREE.Group(); g.add(root);
    const act = new Actor(root, { Run: inplace(src.animations[0]) });
    act.play('Run'); act.mixer.update(Math.random());
    g.userData.actor = act;
    return g;
  }

  // a guardian: its model (lifted to 3D from a Higgsfield picture), an aura and stars when dazed
  _boss(e) {
    const D = BOSS_DEF[e.kind], src = this.A.models['boss_' + e.kind];
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const mats = [];
    let act = null;
    if (src) {
      const rigged = src.animations && src.animations.length > 0;
      const root = rigged ? SkeletonUtils.clone(src.scene) : src.scene.clone(true);
      root.traverse((m) => {
        if (!m.isMesh) return;
        m.castShadow = true; m.frustumCulled = false; m.userData.sharedGeo = true;
        m.material = m.material.clone(); m.material.metalness = 0.15; m.material.roughness = 0.55; m.material.userData.keepMaps = true;
        m.material.emissive = new THREE.Color(0); mats.push(m.material);
      });
      if (rigged) { root.scale.multiplyScalar(D.size / 1.8); act = new Actor(root, { Move: inplace(src.animations[0]) }); act.play('Move'); }
      else {
        const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
        const sc = D.size / size.y; root.scale.multiplyScalar(sc);
        root.position.set(-(box.min.x + size.x / 2) * sc, -box.min.y * sc, -(box.min.z + size.z / 2) * sc);
      }
      body.add(root);
    } else {
      const m = new THREE.MeshStandardMaterial({ color: 0xc0a060, roughness: 0.5, metalness: 0.4 }); mats.push(m);
      const b = new THREE.Mesh(new THREE.SphereGeometry(D.w / 2, 18, 12), m); b.scale.y = D.h / D.w; b.position.y = D.h / 2; body.add(b);
    }
    const auraCol = { pharaoh: 0xb050ff, mummylord: 0x9a60ff, anubis: 0xffb040, sphinx: 0xffd060, apep: 0x80ff60, sobek: 0x60d0ff, queen: 0xff80e0, colossus: 0x40f0d0, scarabking: 0xffc040, ammit: 0xff6040 }[e.kind] || 0xffffff;
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ptex.glow, color: auraCol, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.position.set(0, D.size * 0.5, -0.4); aura.scale.set(D.size * 1.8, D.size * 1.8, 1); g.add(aura);
    const stars = new THREE.Group();
    for (let k = 0; k < 4; k++) { const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ptex.sparkle || this.ptex.glow, color: 0xfff0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); st.scale.set(0.45, 0.45, 1); stars.add(st); }
    stars.visible = false; g.add(stars);
    g.userData = { body, mats, act, aura, stars, yaw: Math.PI / 2, auraCol };
    g.position.set(e.x, e.y, 0.1);
    return g;
  }

  _bossUpdate(e, v, dt, gdt) {
    const u = v.userData, D = BOSS_DEF[e.kind], t = this.time;
    if (e.phase === 'dead') { v.visible = false; return; }
    v.visible = !e.hidden;
    const sink = D.mode === 'hidden' ? (e.rise || 0) * D.size * 0.9 : 0;
    const sh = e.shake > 0 ? 0.07 : 0;
    v.position.set(e.x + (Math.random() - 0.5) * sh * 2, e.y - sink + (Math.random() - 0.5) * sh, 0.1);
    // flying guardians face the camera, figures turn three-quarters, creatures show their side
    const turn = { pharaoh: 1.17, queen: 1.17, colossus: 0.7, mummylord: 0.7, anubis: 0.7 }[e.kind] ?? 0.45;
    const want = (e.dir || -1) * (Math.PI / 2 - turn);
    let dy = want - u.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    u.yaw += dy * Math.min(1, dt * 6); u.body.rotation.y = u.yaw;
    u.body.position.y = D.mode === 'float' ? Math.sin(t * 2.2) * 0.15 : 0;
    const breathe = 1 + Math.sin(t * 3) * 0.02;
    u.body.scale.set(1, e.vul ? 0.78 : breathe, 1);
    v.rotation.z = e.state === 'charge' ? -e.dir * 0.12 : e.vul ? Math.sin(t * 3) * 0.06 : 0;
    // dazed: stars circle the head
    u.stars.visible = e.vul;
    if (e.vul) u.stars.children.forEach((st, k) => { const a = t * 3 + k * Math.PI / 2; st.position.set(Math.cos(a) * 0.7, bossHeight(e) + 0.35 + Math.sin(a * 2) * 0.08, Math.sin(a) * 0.5); });
    // flashes: white when hit, glowing before a move, fading when it teleports
    const flash = e.inv > 0 && Math.floor(t * 20) % 2 === 0;
    const tele = e.state === 'tele' || e.state === 'aim' || e.state === 'rise';
    for (const m of u.mats) {
      if (flash) m.emissive.setRGB(0.7, 0.7, 0.7);
      else if (tele) m.emissive.set(u.auraCol).multiplyScalar(0.18 + Math.sin(t * 14) * 0.08);
      else m.emissive.setRGB(0, 0, 0);
      const op = 1 - (e.fade || 0);
      if (m.opacity !== op) { m.transparent = op < 1; m.opacity = op; }
    }
    u.aura.material.opacity = (tele ? 0.6 : 0.3) + Math.sin(t * 4) * 0.08;
    if (u.act) { u.act.mixer.timeScale = e.state === 'charge' ? 1.6 : e.state === 'idle' ? 0.6 : 0.15; u.act.mixer.update(gdt); }
    if (e.phase === 'dying') {
      const k = Math.min(1, e.st / 2.2);
      v.position.y -= k * 0.6; v.rotation.z = Math.sin(t * 30) * 0.05 * (1 - k);
      u.body.scale.setScalar(1 - k * k * 0.9);
      if (Math.random() < dt * 14) this.burst(e.x + (Math.random() - 0.5) * D.w, e.y + Math.random() * D.size, 6, u.auraCol, 3);
    }
    if (e.kind === 'pharaoh' && Math.random() < dt * 10) this.spawn('glow', e.x + (Math.random() - 0.5) * 0.8, e.y + 0.3, 0.2, { vy: -0.6, vx: (Math.random() - 0.5), life: 0.9, size: 0.5, grow: 1.5, color: 0xa040ff });
  }

  // fireballs, venom, waves, falling rocks, eggs, spears and the beam
  _shotView(kind) {
    const glow = (col, sx, sy = sx) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ptex.glow, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.set(sx, sy, 1); return sp; };
    const g = new THREE.Group();
    if (kind === 'fire') { const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); f.scale.set(0.7, 0.9, 1); g.add(f, glow(0xff8030, 1.4)); }
    else if (kind === 'curse') g.add(glow(0xb040ff, 1.3), glow(0xffffff, 0.35));
    else if (kind === 'venom') g.add(glow(0x70ff40, 0.9), glow(0xe0ffc0, 0.25));
    else if (kind === 'water') g.add(glow(0x50c8ff, 1.0), glow(0xffffff, 0.3));
    else if (kind === 'egg') { const m = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffb0e0, emissive: 0x602050, roughness: 0.4 })); m.scale.y = 1.25; g.add(m, glow(0xff80d0, 0.8)); }
    else if (kind === 'spear') {
      const sp = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), this.darkWood); shaft.rotation.z = Math.PI / 2; sp.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 6), this.gold); tip.rotation.z = -Math.PI / 2; tip.position.x = 0.9; sp.add(tip);
      g.add(sp, glow(0xffc060, 0.6)); g.userData.spear = sp;
    } else if (kind === 'rock') {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ map: this.texs.sandstone, color: 0xc8a070, roughness: 0.9, flatShading: true })); r.castShadow = true; g.add(r); g.userData.rock = r;
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.blob.material.map, color: 0xff3050, transparent: true, depthWrite: false }));
      this.level.add(mark); g.userData.mark = mark;
    } else if (kind === 'wave') g.add(glow(0xffe0a0, 1.4, 0.8), glow(0xffffff, 0.6, 0.4));
    else g.add(glow(0xffffff, 0.6));
    return g;
  }
  _shots(S, dt) {
    const seen = new Set();
    for (const s2 of S.shots) {
      let v = this.shotViews.get(s2);
      if (!v) { v = this._shotView(s2.kind); this.level.add(v); this.shotViews.set(s2, v); }
      seen.add(s2);
      const waiting = s2.wait > 0;
      v.visible = !waiting;
      v.position.set(s2.x, s2.y, 0.45);
      const u = v.userData;
      if (u.mark) { u.mark.visible = true; u.mark.position.set(s2.x, (s2.floor ?? 0) + 0.04, 0.3); u.mark.material.opacity = waiting ? 0.4 + Math.sin(this.time * 16) * 0.3 : 0.5; }
      if (u.rock) { u.rock.rotation.x += dt * 4; u.rock.rotation.z += dt * 3; }
      if (u.spear) u.spear.rotation.y = s2.vx < 0 ? Math.PI : 0;
      if (!waiting && s2.kind === 'wave' && Math.random() < dt * 30) this.dust(s2.x, s2.y - 0.3, 1);
      if (!waiting && (s2.kind === 'fire' || s2.kind === 'curse') && Math.random() < dt * 25) this.spawn('glow', s2.x, s2.y, 0.4, { life: 0.35, size: 0.4, color: s2.kind === 'fire' ? 0xff8030 : 0xb040ff });
    }
    for (const [s2, v] of this.shotViews) if (!seen.has(s2)) { if (v.userData.mark) this.level.remove(v.userData.mark); this.level.remove(v); this.shotViews.delete(s2); }
    // the beam of the sphinx and the pharaoh: a thin warning line, then a sweeping band
    const B = S.boss;
    if (B && (B.beam || B.beamWarn) && B.phase === 'fight') {
      if (!this.beamView) { this.beamView = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.ptex.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); this.level.add(this.beamView); }
      const bv = this.beamView, w = B.ax1 - B.ax0;
      bv.visible = true; bv.position.set((B.ax0 + B.ax1) / 2, B.fy + 0.5, 0.5);
      if (B.beam) { bv.scale.set(w * 1.6, 1.6, 1); bv.material.color.set(B.kind === 'pharaoh' ? 0xc050ff : 0xffc040); bv.material.opacity = 0.9; if (Math.random() < dt * 30) this.spawn('sparkle', B.ax0 + Math.random() * w, B.fy + Math.random(), 0.5, { vy: 1, life: 0.4, size: 0.3, color: 0xffe0a0 }); }
      else { bv.scale.set(w * 1.6, 0.25, 1); bv.material.color.set(0xff3050); bv.material.opacity = 0.35 + Math.sin(this.time * 20) * 0.25; }
    } else if (this.beamView) this.beamView.visible = false;
  }

  // the stone tablet that shows the order of the symbols
  _tablet(e) {
    const n = e.seq.length, cw = 220 * n + 60, ch = 300;
    const tex = canvasTex(cw, ch, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d8b880'); g.addColorStop(1, '#a8804c'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#ffd25a'; c.lineWidth = 14; c.strokeRect(7, 7, w - 14, h - 14);
      c.strokeStyle = 'rgba(80,40,20,0.5)'; c.lineWidth = 3; c.strokeRect(22, 22, w - 44, h - 44);
      e.seq.forEach((sym, i) => {
        const im = this.A.img['sym_' + sym + 'Tex']?.image, x = 40 + i * 220;
        if (im) c.drawImage(im, x, 50, 200, 200);
        if (i < n - 1) { c.fillStyle = '#7a3ab0'; c.beginPath(); c.moveTo(x + 204, 128); c.lineTo(x + 222, 150); c.lineTo(x + 204, 172); c.closePath(); c.fill(); }
      });
    });
    const w = 0.85 * n + 0.3;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * ch / cw), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0x201008, emissiveIntensity: 0.3 }));
    m.position.set(e.x + w / 2 - 0.4, e.y + 0.4, -1.2);
    const g = new THREE.Group(); g.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ptex.glow, color: 0xffe0a0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })); glow.position.set(e.x + w / 2 - 0.4, e.y + 0.4, -1.1); glow.scale.set(w * 1.6, 2.2, 1); g.add(glow);
    return g;
  }

  // effects of the explorer's power-ups: amulet ring, sun glow, feather
  _powerFx() {
    const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ringTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
    ring.scale.set(2.1, 2.1, 1); ring.visible = false; this.level.add(ring);
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ptex.glow, color: 0xffc840, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 }));
    sun.scale.set(3.4, 3.4, 1); sun.visible = false; this.level.add(sun);
    const feather = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.A.img.pw_featherTex || null, transparent: true, depthWrite: false }));
    feather.scale.set(0.7, 0.7, 1); feather.visible = false; this.level.add(feather);
    this.fx = { ring, sun, feather };
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
      case 'blockCoin': {
        const v = this.entViews.get(e.id); if (v && this.sim.ents[e.id].used) v.material = [1, 2, 3, 4, 5, 6].map(() => this.glyphMats.used);
        this.spawn('coin', e.x, e.y + 0.5, 0.5, { vy: 7, gravity: 16, life: 0.55, size: 0.75, map: this.A.img.icon_scarabTex, additive: false });
        this.burst(e.x, e.y + 0.3, 6, 0xffd860, 2); break;
      }
      case 'blockPower': { const v = this.entViews.get(e.id); if (v) v.material = [1, 2, 3, 4, 5, 6].map(() => this.glyphMats.used); this.burst(e.x, e.y + 0.4, 16, 0xffe0a0, 3); break; }
      case 'jar': {
        const v = this.entViews.get(e.id); if (v) v.visible = false;
        for (let k = 0; k < 10; k++) this.spawn('dust', e.x + (Math.random() - 0.5) * 0.5, e.y + 0.4 + Math.random() * 0.4, 0.5, { vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 3, life: 0.7, size: 0.22, gravity: 12, color: 0xc06a3a, additive: false });
        if (e.coins) for (let k = 0; k < 3; k++) this.spawn('coin', e.x, e.y + 0.6, 0.5, { vx: (k - 1) * 1.6, vy: 6 + k, gravity: 16, life: 0.6, size: 0.6, map: this.A.img.icon_scarabTex, additive: false });
        this.dust(e.x, e.y, 5, 0xd8a070); break;
      }
      case 'powerGet': { const v = this.entViews.get(e.id); if (v) v.visible = false; this.burst(e.x, e.y, 26, 0xfff0a0, 5); this.spawn('glow', e.x, e.y, 0.5, { life: 0.6, size: 1.5, grow: 3, color: 0xffe080 }); break; }
      case 'shieldBreak': this.shake = 0.2; this.burst(e.x, e.y, 18, 0x60ffe0, 4.5); break;
      case 'gate': {
        const v = this.entViews.get(e.id); if (v) v.userData.opening = true;
        this.shake = 0.18; this.dust(e.x, e.y, 10, 0xd8b890);
        this.focus = { x: e.x, y: e.y + 1.4, t: 1.7 }; break;
      }
      case 'lever': { const v = this.entViews.get(e.id); if (v) v.userData.on = true; this.burst(e.x, e.y + 1, 10, this.gemCols[(this.sim.ents[e.id].gem || 0) % 4], 2.5); break; }
      case 'plate': this.burst(e.x, e.y + 0.2, 14, 0xffe0a0, 2.5); break;
      case 'symRight': { this.burst(e.x, e.y + 1.5, 12, this.symCols[this.sim.ents[e.id].sym] || 0xffffff, 2.5); break; }
      case 'symWrong': this.shake = 0.15; for (const q of this.sim.ents) if (q.type === 'pedestal' && q.gid === e.gid) this.burst(q.x, q.y + 1.5, 6, 0xff4060, 1.8); break;
      case 'solved': { for (const q of this.sim.ents) if (q.type === 'tablet' && q.gid === e.gid) this.burst(q.x + 1.5, q.y + 0.5, 24, 0xffe080, 4); break; }
      case 'push': case 'pull': this.dust(e.x, e.y, 3, 0xd8b890); break;
      case 'blockLand': this.dust(e.x, e.y, 6, 0xd8b890); this.shake = 0.08; break;
      case 'blockReset': this.burst(e.x + 0.5, e.y + 0.5, 14, 0xc090ff, 2.5); break;
      case 'hop': this.dust(e.x, e.y, 2); break;
      case 'powerLand': this.dust(e.x, e.y, 4, 0xffe0a0); this.burst(e.x, e.y + 0.5, 6, 0xfff0a0, 1.5); break;
      case 'ignite': this.burst(e.x, e.y + 0.5, 12, 0xffa040, 2.2); break;
      case 'gateClose': this.shake = 0.15; this.dust(e.x, e.y, 8, 0xd8b890); break;
      case 'spawn': this.burst(e.x, e.y + 0.4, 10, 0xb070ff, 2.2); this.dust(e.x, e.y, 4); break;
      case 'spit': this.burst(e.x, e.y, 5, 0x80ff60, 1.5); break;
      case 'clink': this.burst(e.x, e.y, 6, 0xffffff, 2.5); break;
      case 'shotHit': this.burst(e.x, e.y, 6, { fire: 0xff8030, curse: 0xb040ff, venom: 0x70ff40, water: 0x60d0ff, egg: 0xffb0e0, rock: 0xd8b890, spear: 0xffc060 }[e.kind] || 0xffffff, 2); if (e.kind === 'rock') { this.dust(e.x, e.y, 6); this.shake = Math.max(this.shake, 0.08); } break;
      case 'bossStart': this.focus = { x: e.x, y: e.y + 2, t: 1.7 }; this.shake = 0.3; break;
      case 'bossRoar': this.shake = 0.2; break;
      case 'bossJump': this.dust(e.x, e.y, 8); break;
      case 'bossSlam': this.shake = 0.4; this.dust(e.x, e.y, 16); break;
      case 'bossBump': this.shake = 0.35; this.dust(e.x, e.y + 0.5, 12); this.burst(e.x, e.y + 1, 10, 0xfff0a0, 3); break;
      case 'bossShoot': this.burst(e.x, e.y, 8, { fire: 0xff8030, curse: 0xb040ff, venom: 0x70ff40, water: 0x60d0ff, egg: 0xffb0e0, spear: 0xffc060 }[e.kind] || 0xffffff, 2.5); break;
      case 'bossRain': for (let k = 0; k < 10; k++) this.spawn('dust', e.x + (Math.random() - 0.5) * 16, e.y - 0.3, 0.5, { vy: -2, life: 0.9, size: 0.4, grow: 1, opacity: 0.6, color: 0xd8b890, additive: false }); this.shake = 0.15; break;
      case 'bossSummon': case 'bossVanish': case 'bossAppear': this.burst(e.x, e.y + 1.2, 18, 0xb050ff, 3.5); break;
      case 'bossRise': for (let k = 0; k < 16; k++) this.spawn(e.kind === 'sobek' ? 'glow' : 'dust', e.x + (Math.random() - 0.5) * 2, e.y + 0.1, 0.5, { vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, gravity: 9, life: 0.8, size: 0.4, color: e.kind === 'sobek' ? 0x80e0ff : 0xe0b070, additive: e.kind === 'sobek' }); break;
      case 'bossHit': this.shake = 0.3; this.burst(e.x, e.y, 22, 0xfff0a0, 4.5); break;
      case 'bossBlock': this.burst(e.x, e.y, 6, 0xffffff, 2); break;
      case 'bossDie': this.shake = 0.7; this.burst(e.x, e.y + 1.5, 40, 0xffe080, 6); this.focus = { x: e.x, y: e.y + 2, t: 2.4 }; break;
      case 'bossDead': this.burst(e.x, e.y + 1, 50, 0xd090ff, 7); this.shake = 0.5; break;
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
    const anim = { idle: 'Idle', run: 'Run', push: 'Run', jump: 'Jump', fall: 'Fall', climb: 'Climb', mantle: 'Climb', swim: 'Swim', hurt: 'Hit', win: 'Cheer' }[p.state] || 'Idle';
    if (this.landT > 0) this.landT -= gdt;
    if (p.dead > 0) this.pl.play('Hit', { once: true, fade: 0.1 });
    else if (p.state === 'push') this.pl.play('Run', { speed: 0.42, fade: 0.2 });
    else if (p.state === 'mantle') this.pl.play('Climb', { speed: 2.2, fade: 0.06 });
    else if (anim === 'Run') this.pl.play('Run', { speed: 0.75 + 0.35 * Math.min(1, Math.abs(p.vx) / P.RUN), fade: this.landT > 0 ? 0.12 : 0.18 });
    else if (anim === 'Climb') this.pl.play('Climb', { speed: Math.abs(p.vy) > 0.2 || Math.abs(p.vx) > 0.2 ? 1.1 : 0.0001 });
    else if (anim === 'Jump') this.pl.play('Jump', { once: true, speed: 1.0, fade: 0.08 });
    else if (anim === 'Fall') this.pl.play('Fall', { once: true, speed: 0.9, fade: 0.2 });
    else if (anim === 'Idle' && this.landT > 0) this.pl.play('Land', { once: true, speed: 1.4, fade: 0.06 });
    else this.pl.play(anim, { fade: 0.2 });
    g.visible = p.dead > 0 ? Math.floor(this.time * 20) % 2 === 0 && p.dead > 0.6 : !(p.inv > 0 && Math.floor(this.time * 16) % 2 === 0);
    // swimming is done lying in the water; running leans a little into the speed
    g.position.y += p.state === 'swim' ? 0.42 : 0;
    this.pl.root.rotation.x = p.state === 'run' ? Math.min(0.12, Math.abs(p.vx) * 0.014) : p.state === 'push' ? 0.3 : 0;
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
        case 'scarab': {
          v.position.set(e.x, e.y + Math.abs(Math.sin(this.time * 12 + e.id)) * 0.04, 0);
          v.rotation.y = e.dir > 0 ? -0.35 : Math.PI + 0.35;
          const b = v.userData.beetle; if (b) b.rotation.z = Math.sin(this.time * 12 + e.id) * 0.06;
          break;
        }
        case 'hopper': {
          v.position.set(e.x, e.y, 0); v.rotation.y = e.dir > 0 ? -0.35 : Math.PI + 0.35;
          const b = v.userData.beetle;
          if (b) { const sq = e.air ? 1 + Math.min(0.25, Math.abs(e.vy) * 0.03) : 1 - Math.max(0, 0.25 - (e.hop || 0)) * 0.6; b.scale.set(0.85 / Math.sqrt(sq), 0.85 * sq, 0.85 / Math.sqrt(sq)); b.rotation.z = e.air ? -e.vy * 0.03 : 0; }
          break;
        }
        case 'flyer': {
          v.position.set(e.x, e.y, 0.3); v.rotation.y = e.dir > 0 ? -0.3 : Math.PI + 0.3;
          v.userData.wings.forEach(({ piv, s: sg }) => { piv.rotation.x = sg * (0.5 + Math.sin(this.time * 26 + e.id) * 0.6); });
          break;
        }
        case 'bat': v.position.set(e.x, e.y, 0.2); v.rotation.y = e.dir > 0 ? 0 : Math.PI; v.userData.wings.forEach(({ piv, s }) => { piv.rotation.x = s * Math.sin(this.time * 16) * 0.8; }); break;
        case 'mummy': {
          v.position.set(e.x, e.y, 0); v.rotation.y = e.dir > 0 ? Math.PI / 2 - 0.35 : -Math.PI / 2 + 0.35;
          const a = v.userData.actor; if (a && Math.abs(e.x - this.cam.x) < 22) { a.mixer.update(gdt); if (v.userData.arms) for (const arm of v.userData.arms) if (arm) arm.rotation.x -= 1.2; }
          break;
        }
        case 'itemblock': v.position.y = e.y + 0.5 + (e.bounce > 0 ? Math.sin((0.25 - e.bounce) / 0.25 * Math.PI) * 0.3 : 0); break;
        case 'block': v.position.set(e.rx + 0.5, e.ry + 0.5, 0); break;
        case 'gate': {
          const u = v.userData, want = e.open ? e.h : 0;
          if (u.lift !== want) {
            u.lift = want > u.lift ? Math.min(want, u.lift + dt * 2.6) : Math.max(want, u.lift - dt * 9);
            v.position.x = e.x + 0.5 + (u.lift !== want ? (Math.random() - 0.5) * 0.03 : 0);
            if (Math.random() < dt * 20) this.dust(e.x + 0.5 + (Math.random() - 0.5), e.y, 1, 0xd8b890);
          }
          v.position.y = e.y + u.lift;
          u.gem.rotation.y += dt * 2; break;
        }
        case 'jackal': {
          v.position.set(e.x, e.y, 0); v.rotation.y = e.dir > 0 ? Math.PI / 2 - 0.35 : -Math.PI / 2 + 0.35;
          const a = v.userData.actor;
          if (a && Math.abs(e.x - this.cam.x) < 22) { a.mixer.timeScale = e.mode === 'charge' ? 1.5 : e.mode === 'walk' ? 0.55 : 0.08; a.mixer.update(gdt); }
          v.position.x += e.mode === 'alert' ? (Math.random() - 0.5) * 0.06 : 0;
          if (e.mode === 'charge' && Math.random() < dt * 20) this.dust(e.x - e.dir * 0.3, e.y, 1);
          break;
        }
        case 'boss': this._bossUpdate(e, v, dt, gdt); break;
        case 'lever': { const u = v.userData; const want = u.on ? -0.65 : 0.65; u.piv.rotation.z += (want - u.piv.rotation.z) * Math.min(1, dt * 10); u.halo.material.opacity = u.on ? 0.15 : 0.35 + Math.sin(this.time * 4) * 0.2; break; }
        case 'plate': { const inl = v.userData.inlay; v.position.y = e.y - (e.held ? 0.07 : e.step ? 0.04 : 0); inl.material.emissiveIntensity = e.held ? 2.2 : 0.5 + Math.sin(this.time * 3) * 0.2; break; }
        case 'pedestal': { const u = v.userData; u.glow.material.opacity = e.lit ? 0.75 + Math.sin(this.time * 5) * 0.15 : 0; u.plq.material.color.set(e.lit ? 0xffffff : 0xb8a890); u.plq.position.y = 1.55 + (e.lit ? Math.sin(this.time * 3) * 0.05 : 0); break; }
        case 'power': {
          v.visible = e.alive && !e.hidden;
          if (v.visible) { v.position.x = e.x; v.position.y = e.y - (e.rise || 0) * 1.6 + (e.moving ? 0 : Math.sin(this.time * 3 + e.id) * 0.08); v.userData.glow.material.opacity = 0.5 + Math.sin(this.time * 5) * 0.2; v.userData.glow.material.rotation = this.time; }
          break;
        }
        case 'jar': break;
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
        case 'torch': { const fl = v.userData.flame; fl.visible = v.userData.halo.visible = e.lit !== false; const s = 0.5 + Math.sin(this.time * 17 + e.x) * 0.05; fl.scale.set(s, s * 1.6, 1); v.userData.halo.material.opacity = (this.torchlit ? 0.55 : 0.35) + Math.sin(this.time * 11 + e.x * 3) * 0.08; break; }
        default: break;
      }
    }
    // enemies called in by a guardian get their view when they appear
    for (let i = this.knownEnts; i < S.ents.length; i++) {
      const e = S.ents[i];
      const v = e.type === 'mummy' ? this._mummy() : e.type === 'hopper' ? this._scarab(true) : e.type === 'jackal' ? this._jackal() : this._scarab();
      v.position.set(e.x, e.y, 0); this.level.add(v); this.entViews.set(e.id, v);
    }
    this.knownEnts = S.ents.length;
    this._shots(S, dt);
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
    // the throwing stick
    if (S.stick && !this.stickView) { this.stickView = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.A.img.pw_stickTex || null, transparent: true, depthWrite: false })); this.stickView.scale.set(0.85, 0.85, 1); this.level.add(this.stickView); }
    if (this.stickView) {
      this.stickView.visible = !!S.stick;
      if (S.stick) { this.stickView.position.set(S.stick.x, S.stick.y, 0.5); this.stickView.material.rotation = -S.stick.rot * Math.sign(S.stick.vx || 1); if (Math.random() < dt * 30) this.spawn('glow', S.stick.x, S.stick.y, 0.4, { life: 0.25, size: 0.35, color: 0xffd080 }); }
    }
    // power-up effects around the explorer
    if (this.fx) {
      const w = S.pw, f = this.fx, cy = p.y + 0.75;
      f.ring.visible = w.shield && p.dead <= 0; if (f.ring.visible) { f.ring.position.set(p.x, cy, 0.6); f.ring.material.rotation = this.time * 0.8; f.ring.material.opacity = 0.55 + Math.sin(this.time * 4) * 0.2; }
      f.sun.visible = w.sun > 0 && p.dead <= 0 && (w.sun > 2 || Math.floor(this.time * 8) % 2 === 0);
      if (w.sun > 0) { f.sun.position.set(p.x, cy, 0.4); f.sun.material.rotation = this.time * 2; if (Math.random() < dt * 25) this.spawn('sparkle', p.x + (Math.random() - 0.5) * 0.8, p.y + Math.random() * 1.4, 0.6, { vy: 1, life: 0.6, size: 0.3, color: 0xffd060 }); }
      f.feather.visible = w.feather > 0 && p.dead <= 0 && (w.feather > 3 || Math.floor(this.time * 8) % 2 === 0);
      if (f.feather.visible) { f.feather.position.set(p.x - p.face * 0.35, p.y + 1.75 + Math.sin(this.time * 3) * 0.06, 0.5); f.feather.material.rotation = 0.5 * p.face + (p.glide ? Math.sin(this.time * 9) * 0.2 : 0); }
      if (p.glide && Math.random() < dt * 20) this.spawn('sparkle', p.x + (Math.random() - 0.5) * 0.6, p.y + 0.4, 0.5, { vy: -0.6, life: 0.5, size: 0.25, color: 0xe8e0ff });
    }
    // animated materials
    if (this.waterTex) { this.waterTex.offset.x += dt * 0.04; this.waterTex.offset.y = Math.sin(this.time * 0.6) * 0.03; }
    if (this.sandTex) this.sandTex.offset.y -= dt * 0.03;
    for (const r of this.rays) r.material.opacity = (this.L.theme.dark ? 0.06 : 0.13) + Math.sin(this.time * 0.7 + r.position.x) * 0.04;

    // camera: look ahead, smooth, clamp to the level
    const c = this.cam;
    // holding up or down on the pad while standing looks around; climbing looks ahead
    this.look += ((this.lookY || 0) * 3.2 - this.look) * Math.min(1, dt * 2.5);
    let tx = p.x + p.face * 1.6 + p.vx * 0.18, ty = p.y + 1.8 + this.look + (p.climb ? p.vy * 0.35 : 0) + (p.vy < -8 ? -1.5 : 0);
    if (this.focus) { this.focus.t -= dt; if (this.focus.t <= 0) this.focus = null; else { tx = this.focus.x; ty = this.focus.y; } }
    c.x += (tx - c.x) * Math.min(1, dt * 3.2);
    c.y += (ty - c.y) * Math.min(1, dt * (ty < c.y ? 4.5 : 2.4));
    const halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * c.dist, halfW = halfH * this.camera.aspect;
    c.x = Math.max(halfW - 0.5, Math.min(L.w - halfW + 0.5, c.x));
    c.y = Math.max(halfH - 1.2, Math.min(L.h - halfH + 2, c.y));
    const BB = S.boss;
    if (BB && (BB.phase === 'intro' || BB.phase === 'fight' || BB.phase === 'dying') && !this.focus) {
      const a0 = BB.ax0 - 1 + halfW, a1 = BB.ax1 + 1 - halfW;
      c.x = a0 < a1 ? Math.max(a0, Math.min(a1, c.x)) : (BB.ax0 + BB.ax1) / 2;
      c.y = Math.max(BB.fy + halfH - 2, Math.min(BB.top - halfH + 1.5, c.y));
    }
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
    const ts = this.torches.filter((t) => t.userData.ent.lit !== false).map((t) => ({ t, d: Math.abs(t.position.x - c.x) + Math.abs(t.position.y - c.y) * 0.5 })).sort((a, b) => a.d - b.d);
    this.torchLights.forEach((l, i) => { const q = ts[i]; if (q && q.d < 16) { l.position.copy(q.t.position).add(tmpV.set(0, 0.6, 0.6)); l.distance = this.torchlit ? 12 : 9; l.intensity = (this.torchlit ? 22 : this.L.theme.dark ? 14 : 7) * (0.9 + Math.sin(this.time * 13 + i) * 0.1); } else l.intensity = 0; });
    // the explorer's own torch in the dark world
    if (this.torchlit) {
      const ht = this.handTorch;
      if (this.hand) { this.hand.getWorldPosition(tmpV); ht.g.position.set(tmpV.x, tmpV.y + 0.15, tmpV.z + 0.15); } else ht.g.position.set(p.x + p.face * 0.35, p.y + 1.1, 0.4);
      ht.g.visible = p.dead <= 0 || Math.floor(this.time * 20) % 2 === 0;
      const fk = 0.92 + Math.sin(this.time * 19) * 0.05 + Math.sin(this.time * 7.3) * 0.04;
      ht.fl.scale.set(0.42 * fk, 0.7 * fk, 1);
      this.handLight.position.set(ht.g.position.x, ht.g.position.y + 0.4, 1.2); this.handLight.intensity = 34 * fk;
      if (Math.random() < dt * 6) this.spawn('glow', ht.g.position.x, ht.g.position.y + 0.5, ht.g.position.z, { vy: 1.2, life: 0.6, size: 0.12, color: 0xffa050 });
    }
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
