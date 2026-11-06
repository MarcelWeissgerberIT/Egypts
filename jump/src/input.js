// Touch controls built for thumbs: a floating stick anywhere on the left half, a big jump area on the
// right half with the action button above it. Multi-touch via pointer events; keyboard for desktop.
export class Input {
  constructor(root, ui) {
    this.ui = ui;
    this.state = { x: 0, y: 0, jump: false, jumpPressed: false, actionPressed: false };
    this.stick = null;          // { id, ox, oy }
    this.jumpId = null;
    this.keys = new Set();
    this.enabled = false;
    const opts = { passive: false };
    // listen on the window: a second finger can be reported on the document root
    window.addEventListener('pointerdown', (e) => this._down(e), opts);
    window.addEventListener('pointermove', (e) => this._move(e), opts);
    window.addEventListener('pointerup', (e) => this._up(e), opts);
    window.addEventListener('pointercancel', (e) => this._up(e), opts);
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => this.reset());
  }

  reset() { this.stick = null; this.jumpId = null; Object.assign(this.state, { x: 0, y: 0, jump: false }); this.ui.showStick(null); this.ui.pressJump(false); }

  _down(e) {
    if (!this.enabled) return;
    if (e.target.closest && (e.target.closest('.btn') || e.target.closest('.screen.on'))) return;
    e.preventDefault();
    const w = window.innerWidth;
    if (e.clientX < w * 0.45) {
      if (!this.stick) { this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY }; this.ui.showStick(this.stick, 0, 0); }
    } else {
      const a = this.ui.actionRect();
      if (a && Math.hypot(e.clientX - a.x, e.clientY - a.y) < a.r * 1.25) { this.state.actionPressed = true; this.ui.pressAction(); return; }
      if (this.jumpId === null) { this.jumpId = e.pointerId; this.state.jump = true; this.state.jumpPressed = true; this.ui.pressJump(true); }
    }
  }

  _move(e) {
    const s = this.stick;
    if (!s || e.pointerId !== s.id) return;
    e.preventDefault();
    const R = 56;
    let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
    const d = Math.hypot(dx, dy);
    // the stick follows a thumb that slides too far
    if (d > R * 1.6) { s.ox += dx * (1 - R * 1.6 / d); s.oy += dy * (1 - R * 1.6 / d); dx = e.clientX - s.ox; dy = e.clientY - s.oy; }
    const k = Math.min(1, Math.hypot(dx, dy) / R);
    const a = Math.atan2(dy, dx);
    this.state.x = Math.abs(Math.cos(a) * k) < 0.22 ? 0 : Math.cos(a) * k;
    this.state.y = -Math.sin(a) * k;
    this.ui.showStick(s, Math.cos(a) * k * R, Math.sin(a) * k * R);
  }

  _up(e) {
    if (this.stick && e.pointerId === this.stick.id) { this.stick = null; this.state.x = 0; this.state.y = 0; this.ui.showStick(null); }
    if (e.pointerId === this.jumpId) { this.jumpId = null; this.state.jump = false; this.ui.pressJump(false); }
  }

  _key(e, down) {
    const k = e.key.toLowerCase();
    if (down && this.keys.has(k)) return;
    if (down) this.keys.add(k); else this.keys.delete(k);
    const has = (...ks) => ks.some((q) => this.keys.has(q));
    if (!this.stick) {
      this.state.x = (has('arrowright', 'd') ? 1 : 0) - (has('arrowleft', 'a') ? 1 : 0);
      this.state.y = (has('arrowup', 'w') ? 1 : 0) - (has('arrowdown', 's') ? 1 : 0);
    }
    if ([' ', 'k', 'z'].includes(k) || (k === 'arrowup' && false)) { if (down && this.enabled) { this.state.jump = true; this.state.jumpPressed = true; } if (!down) this.state.jump = false; }
    if (['e', 'x', 'j'].includes(k) && down && this.enabled) this.state.actionPressed = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  }

  // read the input for one simulation step (press edges are consumed)
  take() {
    const s = { ...this.state };
    this.state.jumpPressed = false; this.state.actionPressed = false;
    return s;
  }
}
