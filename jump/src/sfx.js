// Sound for the platformer: the shared Egyptian music and procedural effects.
import { Audio } from '../../src/audio.js';

export class Sfx extends Audio {
  jump() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this._tone(330, 'triangle', t, 0.004, 0.16, 0.16); o.frequency.exponentialRampToValueAtTime(720, t + 0.12); this._noise(t, 0.06, 0.05, 'highpass', 3000); }
  djump() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this._tone(520, 'sine', t, 0.004, 0.16, 0.2); o.frequency.exponentialRampToValueAtTime(1180, t + 0.15); }
  land() { if (!this.ok()) return; const t = this.ctx.currentTime; this._noise(t, 0.08, 0.18, 'lowpass', 500); }
  coin() { if (!this.ok()) return; const t = this.ctx.currentTime; this._tone(1568, 'sine', t, 0.002, 0.12, 0.12); this._tone(2349, 'sine', t + 0.05, 0.002, 0.1, 0.18); }
  stomp() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this._tone(180, 'square', t, 0.003, 0.14, 0.12); o.frequency.exponentialRampToValueAtTime(70, t + 0.12); this._noise(t, 0.1, 0.25, 'bandpass', 900); }
  hurt() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this._tone(420, 'sawtooth', t, 0.003, 0.14, 0.3); o.frequency.exponentialRampToValueAtTime(140, t + 0.28); }
  splash() { if (!this.ok()) return; const t = this.ctx.currentTime; const f = this._noise(t, 0.5, 0.3, 'bandpass', 1400, 0.8); f.frequency.exponentialRampToValueAtTime(300, t + 0.4); }
  crack() { if (!this.ok()) return; const t = this.ctx.currentTime; this._noise(t, 0.35, 0.45, 'lowpass', 1200); this._tone(90, 'sine', t, 0.003, 0.3, 0.3); }
  rumble() { if (!this.ok()) return; const t = this.ctx.currentTime; this._noise(t, 0.6, 0.25, 'lowpass', 300); }
  dart() { if (!this.ok()) return; const t = this.ctx.currentTime; const f = this._noise(t, 0.18, 0.18, 'bandpass', 3000, 2); f.frequency.exponentialRampToValueAtTime(900, t + 0.16); }
  slam() { if (!this.ok()) return; const t = this.ctx.currentTime; const o = this._tone(70, 'sine', t, 0.003, 0.6, 0.4); o.frequency.exponentialRampToValueAtTime(35, t + 0.3); this._noise(t, 0.2, 0.4, 'lowpass', 400); }
  hiss() { if (!this.ok()) return; const t = this.ctx.currentTime; this._noise(t, 0.4, 0.2, 'highpass', 4500); }
  door() { this.tier(); }
  secret() { this.ankh(); }
}
