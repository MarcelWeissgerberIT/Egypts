// Sound for the platformer: a music track per world group (crossfaded, looped with overlap), ambience
// (wind, drips, torch crackle), recorded effects (Higgsfield), procedural effects and footsteps,
// all through a stone-hall reverb whose size follows the world. Built for iOS Safari: the audio
// context is unlocked on the first touch and the session is set to "playback" so the silent switch
// does not mute the game.
import { Audio } from '../../src/audio.js';

const WORLD_MUSIC = { 0: 'halls', 1: 'halls', 2: 'halls', 3: 'water', 4: 'dark', 5: 'dark', 6: 'desert', 7: 'dark', 8: 'halls', 9: 'stars', 10: 'stars' };
const WORLD_AMB = { 1: ['wind'], 2: ['wind'], 3: ['drips'], 4: ['wind', 'drips'], 5: ['drips', 'wind'], 6: ['wind'], 7: ['wind'], 8: ['wind'], 9: ['wind'], 10: ['wind', 'drips'] };
const WORLD_VERB = { 1: 0.18, 2: 0.25, 3: 0.4, 4: 0.3, 5: 0.45, 6: 0.22, 7: 0.35, 8: 0.25, 9: 0.5, 10: 0.4 };
const SAMPLES = ['s_coin', 's_secret', 's_door', 's_crack', 's_splash', 's_jump', 's_boulder', 's_land', 's_stomp', 'a_wind', 'a_drips', 'a_torch', 'fanfare',
  's_power', 's_powerup', 's_lever', 's_gate', 's_jar', 's_push', 's_solved', 's_wrong', 's_throw', 's_mummy',
  's_roar', 's_bosshit', 's_bossdie', 's_fireball', 's_ignite'];

export class Sfx extends Audio {
  ensure() {
    const fresh = !this.ctx;
    const ctx = super.ensure();
    if (!ctx || !fresh) return ctx;
    // a send to a convolution reverb made from decaying noise (no impulse file needed)
    const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.25;
    this.verbIn.connect(this.verb); this.verb.connect(this.master);
    this.sfx.connect(this.verbIn);
    this.ambGain = ctx.createGain(); this.ambGain.gain.value = 0.0; this.ambGain.connect(this.master);
    this.musicGain.gain.value = 0.42;
    return ctx;
  }

  // must run inside a touch: resume, iOS playback session, then fetch the effects
  unlock() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
    if (!this.loadingStarted) {
      this.loadingStarted = true;
      for (const n of SAMPLES) this.load(n, `assets/audio/${n}.mp3`).then(() => { if (n.startsWith('a_')) this._ambience(); });
      this._music(this.wantTrack || 'halls');
    }
  }

  // ---------------- music: one track per world group, crossfaded, looped with an overlap
  setWorld(w) {
    this.world = w;
    this.wantTrack = WORLD_MUSIC[w] || 'halls';
    this.inBoss = false;
    if (this.ctx) {
      this._music(this.wantTrack);
      this.verbIn.gain.setTargetAtTime(WORLD_VERB[w] || 0.25, this.ctx.currentTime, 0.5);
      this._ambience();
    }
  }
  playMusic() { this.wantMusic = true; if (this.ctx) this._music(this.wantTrack || 'halls'); }

  async _music(key) {
    if (!this.ctx) return;
    if (this.track && this.track.key === key) return;
    this.trackKey = key;
    const name = 'm_' + key;
    if (!this.buffers[name]) { await this.load(name, `assets/audio/${name}.mp3`); if (this.trackKey !== key) return; }
    const buf = this.buffers[name];
    if (!buf) return;
    const old = this.track;
    this.track = { key, buf, parts: [] };
    this._startPart(this.track, this.ctx.currentTime + 0.05, 2.5);
    if (old) for (const p of old.parts) { p.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6); p.s.stop(this.ctx.currentTime + 4); }
    if (old && old.timer) clearTimeout(old.timer);
  }
  _startPart(track, t, fadeIn) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = track.buf; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + fadeIn);
    s.connect(g); g.connect(this.musicGain); s.start(t);
    const part = { s, g }; track.parts.push(part);
    const dur = track.buf.duration, X = 4;
    // the next pass starts a few seconds before this one ends, the two overlap and crossfade
    g.gain.setValueAtTime(1, t + dur - X); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.stop(t + dur + 0.1);
    track.timer = setTimeout(() => { if (this.track === track) { track.parts = track.parts.filter((p) => p !== part); this._startPart(track, t + dur - X, X); } }, Math.max(0, (t + dur - X - ctx.currentTime - 1) * 1000));
  }

  // ---------------- ambience
  _ambience() {
    if (!this.ctx) return;
    const want = new Set(WORLD_AMB[this.world] || []);
    this.amb = this.amb || {};
    for (const n of ['wind', 'drips', 'torch']) {
      const buf = this.buffers['a_' + n];
      if (!buf) continue;
      if (!this.amb[n]) {
        const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
        s.buffer = buf; s.loop = true; g.gain.value = 0;
        s.connect(g); g.connect(this.ambGain); s.start();
        if (n === 'drips') { g.connect(this.verbIn); }
        this.amb[n] = { s, g };
      }
      if (n !== 'torch') this.amb[n].g.gain.setTargetAtTime(want.has(n) ? (n === 'wind' ? 0.5 : 0.75) : 0, this.ctx.currentTime, 1.2);
    }
  }
  setAmbience(on, torchNear = 0) {
    if (!this.ctx) return;
    this.ambGain.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.8);
    if (this.amb && this.amb.torch) this.amb.torch.g.gain.setTargetAtTime(Math.min(0.9, torchNear), this.ctx.currentTime, 0.3);
  }

  // ---------------- samples
  play(name, { vol = 1, rate = 1, wet = 1 } = {}) {
    if (!this.ok() || !this.buffers[name]) return false;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = this.buffers[name]; s.playbackRate.value = rate; g.gain.value = vol;
    s.connect(g); g.connect(this.master);
    if (wet) { const w = this.ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.verbIn); }
    s.start();
    return true;
  }

  footstep(sand = false) {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    this._noise(t, 0.06, sand ? 0.1 : 0.07, 'lowpass', sand ? 900 : 1500 + Math.random() * 400);
    const o = this._tone(90 + Math.random() * 30, 'sine', t, 0.002, 0.06, 0.05); o.frequency.exponentialRampToValueAtTime(50, t + 0.05);
  }
  jump() { if (!this.play('s_jump', { vol: 0.55, rate: 0.95 + Math.random() * 0.1, wet: 0.3 })) { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this._tone(330, 'triangle', t, 0.004, 0.16, 0.16); o.frequency.exponentialRampToValueAtTime(720, t + 0.12); } }
  djump() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this._tone(520, 'sine', t, 0.004, 0.16, 0.2); o.frequency.exponentialRampToValueAtTime(1180, t + 0.15); this.play('s_jump', { vol: 0.4, rate: 1.25 }); }
  land() { this.play('s_land', { vol: 0.7, rate: 0.9 + Math.random() * 0.2, wet: 0.5 }) || this.footstep(); }
  coin() { if (!this.play('s_coin', { vol: 0.5, rate: 0.96 + Math.random() * 0.08, wet: 0.4 })) { if (!this.ok()) return; const t = this.ctx.currentTime; this._tone(1568, 'sine', t, 0.002, 0.12, 0.12); this._tone(2349, 'sine', t + 0.05, 0.002, 0.1, 0.18); } }
  stomp() { this.play('s_stomp', { vol: 0.9, wet: 0.4 }); if (!this.ok()) return; const t = this.ctx.currentTime; const o = this._tone(180, 'square', t, 0.003, 0.08, 0.12); o.frequency.exponentialRampToValueAtTime(70, t + 0.12); }
  hurt() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this._tone(420, 'sawtooth', t, 0.003, 0.14, 0.3); o.frequency.exponentialRampToValueAtTime(140, t + 0.28); }
  splash() { this.play('s_splash', { vol: 0.8, rate: 0.9 + Math.random() * 0.2 }) || (() => { if (!this.ok()) return; const t = this.ctx.currentTime; this._noise(t, 0.5, 0.3, 'bandpass', 1400, 0.8); })(); }
  crack() { this.play('s_crack', { vol: 0.9 }) || (() => { if (!this.ok()) return; const t = this.ctx.currentTime; this._noise(t, 0.35, 0.45, 'lowpass', 1200); })(); }
  rumble() { if (!this.ok()) return; const t = this.ctx.currentTime; this._noise(t, 0.6, 0.25, 'lowpass', 300); }
  dart() { if (!this.ok()) return; const t = this.ctx.currentTime; const f = this._noise(t, 0.18, 0.18, 'bandpass', 3000, 2); f.frequency.exponentialRampToValueAtTime(900, t + 0.16); }
  slam() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this._tone(70, 'sine', t, 0.003, 0.6, 0.4); o.frequency.exponentialRampToValueAtTime(35, t + 0.3); this._noise(t, 0.2, 0.4, 'lowpass', 400); }
  hiss() { if (!this.ok()) return; const t = this.ctx.currentTime; this._noise(t, 0.4, 0.2, 'highpass', 4500); }
  boulder() { this.play('s_boulder', { vol: 1, wet: 0.6 }) || this.rumble(); }
  door() { this.play('s_door', { vol: 0.9, wet: 0.7 }) || this.tier(); }
  secret() { this.play('s_secret', { vol: 0.8, wet: 0.8 }) || this.ankh(); }
  fanfare() { if (!this.ctx || !this.buffers.fanfare) return; this.play('fanfare', { vol: 0.85, wet: 0.2 }); this.duckMusic(0.2, 0.2); setTimeout(() => this.duckMusic(1, 1.5), (this.buffers.fanfare.duration - 1) * 1000); }
  // power-ups and puzzles
  reveal() { this.play('s_power', { vol: 0.8, wet: 0.5 }) || this.ankh(); }
  powerup() { if (!this.play('s_powerup', { vol: 0.85, wet: 0.4 })) { if (!this.ok()) return; const t = this.ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 'triangle', t + i * 0.06, 0.004, 0.14, 0.16)); } }
  powerEnd() { if (!this.ok()) return; const t = this.ctx.currentTime; [784, 587, 440].forEach((f, i) => this._tone(f, 'sine', t + i * 0.08, 0.004, 0.1, 0.12)); }
  shieldBreak() { if (!this.ok()) return; const t = this.ctx.currentTime; this._noise(t, 0.35, 0.3, 'highpass', 3000); const o = this._tone(1400, 'triangle', t, 0.002, 0.3, 0.18); o.frequency.exponentialRampToValueAtTime(500, t + 0.3); }
  throwStick() { this.play('s_throw', { vol: 0.7, rate: 1.1, wet: 0.2 }) || this.dart(); }
  lever() { this.play('s_lever', { vol: 0.9, wet: 0.5 }) || this.click(); }
  gate() { this.play('s_gate', { vol: 1, wet: 0.7 }) || this.rumble(); }
  jar() { this.play('s_jar', { vol: 0.85, rate: 0.95 + Math.random() * 0.1, wet: 0.4 }) || this.crack(); }
  push() { this.play('s_push', { vol: 0.6, rate: 1.1 + Math.random() * 0.15, wet: 0.3 }) || this.rumble(); }
  plate() { if (!this.ok()) return; const t = this.ctx.currentTime; this._tone(220, 'sine', t, 0.003, 0.25, 0.25); this._tone(330, 'sine', t + 0.08, 0.003, 0.25, 0.2); }
  click() { if (!this.ok()) return; const t = this.ctx.currentTime; this._noise(t, 0.05, 0.25, 'bandpass', 2200, 3); }
  symbol(step) { if (!this.ok()) return; const t = this.ctx.currentTime, f = [523, 659, 784, 988][Math.min(3, step - 1)] || 523; this._tone(f, 'triangle', t, 0.004, 0.5, 0.22); this._tone(f * 2, 'sine', t, 0.004, 0.4, 0.08); }
  wrong() { this.play('s_wrong', { vol: 0.8, wet: 0.4 }) || this.invalid(); }
  solved() { this.play('s_solved', { vol: 0.9, wet: 0.6 }) || this.secret(); }
  groan(dist = 4) { this.play('s_mummy', { vol: Math.max(0.15, 0.7 - dist * 0.07), rate: 0.9 + Math.random() * 0.2, wet: 0.6 }); }
  hop() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this._tone(260, 'sine', t, 0.003, 0.08, 0.08); o.frequency.exponentialRampToValueAtTime(520, t + 0.08); }
  // guardians, jackals, bats, cobras and torches
  bossMusic(on) { this.inBoss = on; if (this.ctx) this._music(on ? 'boss' : (this.wantTrack || 'halls')); }
  roar(vol = 1) { this.play('s_roar', { vol: 0.9 * vol, rate: 0.95 + Math.random() * 0.1, wet: 0.7 }) || this.slam(); }
  bossHit() { this.play('s_bosshit', { vol: 1, wet: 0.5 }) || this.stomp(); }
  bossDie() { this.play('s_bossdie', { vol: 1, wet: 0.8 }) || this.boulder(); }
  bossShot(kind) { if (kind === 'venom' || kind === 'water') this.spit(); else if (kind === 'spear') this.throwStick(); else if (kind !== 'egg') this.play('s_fireball', { vol: 0.75, rate: kind === 'curse' ? 0.8 : 1, wet: 0.5 }); }
  ignite() { this.play('s_ignite', { vol: 0.8, rate: 0.95 + Math.random() * 0.1, wet: 0.4 }) || this.hiss(); }
  spit() { if (!this.ok()) return; const t = this.ctx.currentTime; this._noise(t, 0.18, 0.25, 'bandpass', 1800, 2); }
  clink() { if (!this.ok()) return; const t = this.ctx.currentTime; this._tone(1900, 'triangle', t, 0.002, 0.15, 0.1); this._tone(2850, 'sine', t, 0.002, 0.12, 0.06); }
  bark() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this._tone(520, 'sawtooth', t, 0.005, 0.12, 0.12); o.frequency.exponentialRampToValueAtTime(260, t + 0.12); this._noise(t, 0.1, 0.12, 'bandpass', 900, 2); }
  screech() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this._tone(2400, 'sine', t, 0.005, 0.18, 0.06); o.frequency.exponentialRampToValueAtTime(3600, t + 0.15); }
  duckMusic(level, time = 0.4) { if (this.musicGain) this.musicGain.gain.setTargetAtTime(0.42 * level, this.ctx.currentTime, time); }
}
