// WebAudio: generated music loop + fanfare (Higgsfield / ElevenLabs Music) and procedural SFX.
const HIJAZ = [0, 1, 4, 5, 7, 8, 10, 12, 13, 16, 17, 19];

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.buffers = {};
    this.music = null;
    this.wantMusic = false;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicGain.connect(this.master);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);
    const len = this.ctx.sampleRate * 1.0;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  // Must be called from a user gesture (iOS).
  unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    // iOS needs a sound started inside the gesture
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
    if (!this.loadingStarted) {
      this.loadingStarted = true;
      this.load('music', 'assets/audio/music.mp3').then(() => { if (this.wantMusic) this.playMusic(); });
      this.load('fanfare', 'assets/audio/fanfare.mp3');
    }
  }

  async load(name, url) {
    try {
      const r = await fetch(url);
      const ab = await r.arrayBuffer();
      const buf = await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej));
      this.buffers[name] = buf;
    } catch (e) { /* audio is optional */ }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  playMusic() {
    this.wantMusic = true;
    if (!this.ctx || !this.buffers.music || this.music) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffers.music;
    s.loop = true;
    s.loopStart = 0.2; s.loopEnd = this.buffers.music.duration - 0.25;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(1, this.ctx.currentTime, 1.2);
    s.connect(g); g.connect(this.musicGain);
    s.start();
    this.music = { s, g };
  }

  duckMusic(level, time = 0.4) {
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(0.55 * level, this.ctx.currentTime, time);
  }

  fanfare() {
    if (!this.ctx || !this.buffers.fanfare) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffers.fanfare;
    const g = this.ctx.createGain(); g.gain.value = 0.9;
    s.connect(g); g.connect(this.master);
    s.start();
    this.duckMusic(0.15, 0.2);
    setTimeout(() => this.duckMusic(1, 1.5), (this.buffers.fanfare.duration - 1) * 1000);
  }

  // ---------- procedural sound effects ----------
  _env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _tone(freq, type, t, a, peak, d, dest = this.sfx, detune = 0) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    this._env(g, t, a, peak, d);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }

  _noise(t, dur, peak, filterType, freq, q = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    this._env(g, t, 0.005, peak, dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    return f;
  }

  _pluck(freq, t, peak = 0.25, d = 0.6) {
    // oud-like pluck: two detuned triangles + quick bright attack
    this._tone(freq, 'triangle', t, 0.004, peak, d);
    this._tone(freq * 2, 'sine', t, 0.002, peak * 0.35, d * 0.5, this.sfx, 4);
    this._noise(t, 0.03, peak * 0.4, 'bandpass', freq * 4, 2);
  }

  ok() { return this.ctx && this.ctx.state === 'running' && !this.muted; }

  pick() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    this._noise(t, 0.08, 0.25, 'bandpass', 1800, 1.5);
    this._tone(520, 'sine', t, 0.005, 0.08, 0.08);
  }

  rotate() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    this._tone(740, 'triangle', t, 0.003, 0.18, 0.07);
    this._noise(t, 0.04, 0.15, 'highpass', 3000);
  }

  place(gold) {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    const o = this._tone(110, 'sine', t, 0.004, 0.7, 0.28);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    this._noise(t, 0.18, 0.5, 'lowpass', 700);
    this._noise(t + 0.02, 0.35, 0.12, 'bandpass', 2400, 0.8); // sand trickle
    if (gold) { this._tone(1568, 'sine', t + 0.03, 0.003, 0.12, 0.5); this._tone(2093, 'sine', t + 0.07, 0.003, 0.08, 0.5); }
  }

  invalid() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    const o = this._tone(160, 'sawtooth', t, 0.005, 0.12, 0.18);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.18);
  }

  line(count) {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    const root = 293.66; // D
    const n = 4 + count * 2;
    for (let i = 0; i < n; i++) this._pluck(root * Math.pow(2, HIJAZ[i % HIJAZ.length] / 12), t + i * 0.055, 0.22, 0.5);
  }

  ankh() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    [1174.7, 1568, 1760, 2349.3].forEach((f, i) => this._tone(f, 'sine', t + i * 0.07, 0.004, 0.14, 0.9));
    for (let i = 0; i < 6; i++) this._noise(t + i * 0.045, 0.06, 0.12, 'highpass', 6000); // sistrum
  }

  tier() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    // gong
    [70, 70 * 2.76, 70 * 5.4].forEach((f, i) => this._tone(f, 'sine', t, 0.01, 0.35 / (i + 1), 2.6 - i * 0.6));
    const root = 293.66;
    [0, 4, 5, 7, 12, 13, 16, 19].forEach((s, i) => this._pluck(root * Math.pow(2, s / 12), t + 0.15 + i * 0.07, 0.2, 0.7));
  }

  tick(urgent) {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    const o = this._tone(urgent ? 95 : 80, 'sine', t, 0.003, urgent ? 0.5 : 0.3, 0.14);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
  }

  loseLife() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    [7, 5, 4, 1, 0].forEach((s, i) => this._pluck(220 * Math.pow(2, s / 12), t + i * 0.12, 0.25, 0.6));
    this._tone(55, 'sine', t, 0.01, 0.4, 1.2);
  }

  button() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    this._tone(880, 'triangle', t, 0.003, 0.15, 0.09);
    this._tone(1320, 'sine', t + 0.03, 0.003, 0.08, 0.09);
  }

  shuffle() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    const f = this._noise(t, 0.6, 0.35, 'bandpass', 500, 0.7);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
  }

  capstone() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    for (let i = 0; i < 12; i++) this._tone(587.33 * Math.pow(2, HIJAZ[i] / 12), 'sine', t + i * 0.06, 0.004, 0.1, 1.2);
  }
}
