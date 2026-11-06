// Game Boy style touch controls: a fixed cross pad on the left (thumb can slide between the eight
// directions), A (jump) and B (action) on the right, B lower-left of A. Touches anywhere on a half
// count for the nearest control, so a thumb never misses. Keyboard for desktop.
export class Input {
  constructor(root, ui) {
    this.ui = ui;
    this.state = { x: 0, y: 0, jump: false, jumpPressed: false, actionPressed: false };
    this.pad = null;            // pointer id on the cross pad
    this.btn = new Map();       // pointer id -> 'a' | 'b'
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

  reset() {
    this.pad = null; this.btn.clear();
    Object.assign(this.state, { x: 0, y: 0, jump: false });
    this.ui.setPad(0, 0); this.ui.pressJump(false); this.ui.pressB(false);
  }

  _down(e) {
    if (!this.enabled) return;
    if (e.target.closest && (e.target.closest('.btn') || e.target.closest('.screen.on'))) return;
    e.preventDefault();
    if (e.clientX < window.innerWidth * 0.45) {
      if (this.pad === null) { this.pad = e.pointerId; this._padAt(e.clientX, e.clientY); }
    } else {
      const which = this._nearest(e.clientX, e.clientY);
      this.btn.set(e.pointerId, which);
      this._press(which, true);
    }
  }

  _move(e) {
    if (e.pointerId === this.pad) { e.preventDefault(); this._padAt(e.clientX, e.clientY); return; }
    const was = this.btn.get(e.pointerId);
    if (!was) return;
    // sliding the thumb from B onto A (or back) presses the other button
    const now = this._nearest(e.clientX, e.clientY, was);
    if (now !== was) { this._press(was, false); this.btn.set(e.pointerId, now); this._press(now, true); }
  }

  _up(e) {
    if (e.pointerId === this.pad) { this.pad = null; this.state.x = 0; this.state.y = 0; this.ui.setPad(0, 0); }
    const b = this.btn.get(e.pointerId);
    if (b) { this.btn.delete(e.pointerId); this._press(b, false); }
  }

  // eight directions from the thumb's position relative to the pad centre
  _padAt(x, y) {
    const c = this.ui.padCenter();
    const dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy);
    let ix = 0, iy = 0;
    if (d > c.r * 0.16) {
      const a = Math.atan2(-dy, dx), oct = Math.round(a / (Math.PI / 4));
      ix = Math.round(Math.cos(oct * Math.PI / 4)); iy = Math.round(Math.sin(oct * Math.PI / 4));
    }
    this.state.x = ix; this.state.y = iy;
    this.ui.setPad(ix, iy);
  }

  _nearest(x, y, keep = null) {
    const A = this.ui.buttonRect('a'), B = this.ui.buttonRect('b');
    if (!A || !B) return 'a';
    const da = Math.hypot(x - A.x, y - A.y) / A.r, db = Math.hypot(x - B.x, y - B.y) / B.r;
    if (keep && Math.abs(da - db) < 0.25) return keep;
    return db < da ? 'b' : 'a';
  }

  _press(which, down) {
    if (which === 'a') {
      if (down) { this.state.jump = true; this.state.jumpPressed = true; } else if (![...this.btn.values()].includes('a')) this.state.jump = false;
      this.ui.pressJump(down || [...this.btn.values()].includes('a'));
    } else {
      if (down) this.state.actionPressed = true;
      this.ui.pressB(down);
    }
  }

  _key(e, down) {
    const k = e.key.toLowerCase();
    if (down && this.keys.has(k)) return;
    if (down) this.keys.add(k); else this.keys.delete(k);
    const has = (...ks) => ks.some((q) => this.keys.has(q));
    if (this.pad === null) {
      this.state.x = (has('arrowright', 'd') ? 1 : 0) - (has('arrowleft', 'a') ? 1 : 0);
      this.state.y = (has('arrowup', 'w') ? 1 : 0) - (has('arrowdown', 's') ? 1 : 0);
      this.ui.setPad(this.state.x, this.state.y);
    }
    if ([' ', 'k', 'z'].includes(k)) { if (down && this.enabled) { this.state.jump = true; this.state.jumpPressed = true; } if (!down) this.state.jump = false; this.ui.pressJump(down); }
    if (['e', 'x', 'j'].includes(k)) { if (down && this.enabled) this.state.actionPressed = true; this.ui.pressB(down); }
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  }

  // read the input for one simulation step (press edges are consumed)
  take() {
    const s = { ...this.state };
    this.state.jumpPressed = false; this.state.actionPressed = false;
    return s;
  }
}
