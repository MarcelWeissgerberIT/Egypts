// Text-free user interface: every label is an image generated with Higgsfield.
import { extent } from './pieces.js';

const U = (n) => `assets/ui/${n}.webp`;
const DIGIT_AR = { 0: 134, 1: 126, 2: 126, 3: 129, 4: 136, 5: 128, 6: 126, 7: 133, 8: 127, 9: 125, plus: 160, x: 157 };

export function digitsHTML(n, h, prefix = null) {
  const s = String(Math.max(0, Math.floor(n)));
  let out = '';
  if (prefix) out += `<img src="${U('d_' + prefix)}" style="height:${h * 0.8}px;width:${(h * 0.8 * DIGIT_AR[prefix]) / 160}px">`;
  for (const ch of s) out += `<img src="${U('d' + ch)}" style="height:${h}px;width:${(h * DIGIT_AR[ch]) / 160}px">`;
  return out;
}

function el(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.innerHTML = html;
  return e;
}

function button(id, img, cls = '') {
  const b = el('div', { id, class: 'btn ' + cls, role: 'button' }, `<img src="${U(img)}">`);
  return b;
}

export class UI {
  constructor(app, assets) {
    this.app = app;
    this.assets = assets;
    this.handlers = {};
    this._build();
  }

  on(name, fn) { this.handlers[name] = fn; }
  emit(name, ...a) { if (this.handlers[name]) this.handlers[name](...a); }

  _bindTap(elm, name, ...args) {
    elm.addEventListener('pointerdown', (e) => { e.stopPropagation(); elm._down = true; });
    elm.addEventListener('pointerup', (e) => { e.stopPropagation(); if (elm._down) { elm._down = false; this.emit(name, ...args); } });
    elm.addEventListener('pointerleave', () => { elm._down = false; });
  }

  _build() {
    const app = this.app;
    // HUD
    const hud = el('div', { id: 'hud', class: 'hidden' });
    const row = el('div', { class: 'row' });
    const left = el('div', { class: 'row' });
    this.btnPause = button('btnPause', 'btn_pause');
    this.lvlBadge = el('div', { id: 'lvlBadge' }, `<img src="${U('medallion')}"><div class="digits"></div>`);
    left.append(this.btnPause, this.lvlBadge);
    this.scoreBox = el('div', { id: 'scoreBox' }, `<img src="${U('plaque')}"><div class="digits"></div>`);
    this.lives = el('div', { id: 'lives' }, [0, 1, 2].map(() => `<img src="${U('icon_scarab')}">`).join(''));
    row.append(left, this.scoreBox, this.lives);
    this.timebar = el('div', { id: 'timebar' }, `<div id="timefill"></div><img id="timesun" src="${U('icon_sun')}">`);
    this.tiersEl = el('div', { id: 'tiers' });
    hud.append(row, this.timebar, this.tiersEl);
    app.append(hud);
    this.hud = hud;
    this.timefill = this.timebar.querySelector('#timefill');
    this.timesun = this.timebar.querySelector('#timesun');
    this._bindTap(this.btnPause, 'pause');

    // tray
    const tray = el('div', { id: 'tray', class: 'hidden' }, `<div id="trayBg"></div><canvas id="trayCanvas"></canvas>`);
    this.btnShuffle = button('btnShuffle', 'btn_shuffle');
    this.shuffleCost = el('div', { id: 'shuffleCost' });
    tray.append(this.btnShuffle, this.shuffleCost);
    app.append(tray);
    this.tray = tray;
    this.trayCanvas = tray.querySelector('#trayCanvas');
    this._bindTap(this.btnShuffle, 'shuffle');

    this.dragCanvas = el('canvas', { id: 'drag' });
    this.fx = el('div', { id: 'fx' });
    this.flashEl = el('div', { id: 'flash' });
    this.vignette = el('div', { id: 'vignette' });
    this.hand = el('div', { id: 'hand' }, `<img src="${U('hand')}"><img class="rot" src="${U('icon_rotate')}">`);
    app.append(this.dragCanvas, this.fx, this.flashEl, this.vignette, this.hand);

    // screens
    this.screens = {};
    const loading = el('div', { id: 'scrLoading', class: 'screen on' }, `<div class="bgArt"></div><img id="logo" src="${U('logo')}"><img id="loadScarab" src="${U('icon_scarab')}"><div id="loadBar"><div id="loadFill"></div></div>`);
    const title = el('div', { id: 'scrTitle', class: 'screen' }, `<div class="bgArt"></div><img id="logo" src="${U('logo')}">`);
    this.btnStart = button('btnStart', 'btn_play');
    this.btnSoundT = button('btnSoundT', 'btn_sound_on', 'corner');
    title.append(this.btnStart, this.btnSoundT);
    const levels = el('div', { id: 'scrLevels', class: 'screen' }, `<div class="bgArt"></div><div class="dim"></div>`);
    const lp = el('div', { class: 'panel' });
    this.levelGrid = el('div', { id: 'levelGrid' });
    lp.append(this.levelGrid);
    const lb = el('div', { class: 'btnRow panelBtns' });
    this.btnLvlHome = button('btnLvlHome', 'btn_home');
    lb.append(this.btnLvlHome);
    levels.append(lp, lb);

    const pause = el('div', { id: 'scrPause', class: 'screen' }, `<div class="dim"></div>`);
    const pp = el('div', { class: 'panel', id: 'pausePanel' });
    this.btnResume = button('btnResume', 'btn_play', 'hero');
    this.btnRestartP = button('btnRestartP', 'btn_restart');
    this.btnHomeP = button('btnHomeP', 'btn_home');
    this.btnSoundP = button('btnSoundP', 'btn_sound_on');
    const pr = el('div', { class: 'btnRow' });
    pr.append(this.btnRestartP, this.btnHomeP, this.btnSoundP);
    pp.append(this.btnResume, pr);
    pause.append(pp);

    const win = el('div', { id: 'scrWin', class: 'screen' }, `<div class="dim" style="background:radial-gradient(ellipse at 50% 40%, rgba(80,30,140,.35), rgba(15,3,30,.75))"></div>`);
    const wc = el('div', { style: 'position:relative;display:flex;flex-direction:column;align-items:center' },
      `<img id="winBanner" src="${U('banner_win')}"><div id="winEyes"></div><div id="winScore"><img src="${U('plaque')}"><div class="digits"></div></div>`);
    const wr = el('div', { class: 'btnRow' });
    this.btnHomeW = button('btnHomeW', 'btn_home');
    this.btnRestartW = button('btnRestartW', 'btn_restart');
    this.btnNextW = button('btnNextW', 'btn_next', 'big');
    wr.append(this.btnHomeW, this.btnRestartW, this.btnNextW);
    wc.append(wr);
    win.append(wc);

    const lose = el('div', { id: 'scrLose', class: 'screen' }, `<div class="dim"></div>`);
    const lc = el('div', { style: 'position:relative;display:flex;flex-direction:column;align-items:center' }, `<img id="loseBanner" src="${U('banner_lose')}">`);
    const lr = el('div', { class: 'btnRow' });
    this.btnHomeL = button('btnHomeL', 'btn_home');
    this.btnRestartL = button('btnRestartL', 'btn_restart', 'big');
    lr.append(this.btnHomeL, this.btnRestartL);
    lc.append(lr);
    lose.append(lc);

    for (const s of [loading, title, levels, pause, win, lose]) { app.append(s); this.screens[s.id] = s; }

    this._bindTap(this.btnStart, 'start');
    for (const b of [this.btnSoundT, this.btnSoundP]) this._bindTap(b, 'sound');
    this._bindTap(this.btnLvlHome, 'home');
    this._bindTap(this.btnResume, 'resume');
    for (const b of [this.btnRestartP, this.btnRestartW, this.btnRestartL]) this._bindTap(b, 'restart');
    for (const b of [this.btnHomeP, this.btnHomeW, this.btnHomeL]) this._bindTap(b, 'levels');
    this._bindTap(this.btnNextW, 'next');
  }

  show(id) {
    for (const [k, s] of Object.entries(this.screens)) s.classList.toggle('on', k === id);
  }

  setLoad(p) { const f = document.getElementById('loadFill'); if (f) f.style.width = Math.round(p * 100) + '%'; }

  setSound(on) {
    for (const b of [this.btnSoundT, this.btnSoundP]) b.querySelector('img').src = U(on ? 'btn_sound_on' : 'btn_sound_off');
  }

  setInGame(on) {
    this.hud.classList.toggle('hidden', !on);
    this.tray.classList.toggle('hidden', !on);
  }

  // ---------------- level select
  buildLevels(levels, save) {
    this.levelGrid.innerHTML = '';
    const size = Math.min(window.innerWidth * 0.92, window.innerHeight * 0.6);
    const dh = size * 0.12;
    levels.forEach((L, i) => {
      const locked = i > save.unlocked;
      const eyes = save.eyes[i] || 0;
      const d = el('div', { class: 'lvl btn' + (locked ? ' locked' : '') },
        `<div class="med"><img class="m" src="${U('medallion')}"><div class="digits">${digitsHTML(i + 1, dh)}</div></div>` +
        (locked ? `<img class="lock" src="${U('icon_lock')}">` : '') +
        `<div class="eyes">${[0, 1, 2].map((k) => `<img src="${U(k < eyes ? 'icon_eye' : 'icon_eye_empty')}">`).join('')}</div>`);
      if (!locked) this._bindTap(d, 'play', i);
      else d.addEventListener('pointerup', () => { d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); });
      this.levelGrid.append(d);
    });
  }

  // ---------------- HUD
  setScore(n) {
    if (n === this._score) return;
    this._score = n;
    this.scoreBox.querySelector('.digits').innerHTML = digitsHTML(n, 26);
  }
  setLevel(i) { this.lvlBadge.querySelector('.digits').innerHTML = digitsHTML(i + 1, 22); }
  setLives(n) {
    [...this.lives.children].forEach((img, i) => {
      const lost = i >= n;
      if (lost && !img.classList.contains('lost')) { img.classList.add('lost'); }
      if (!lost) img.classList.remove('lost');
    });
  }
  setTime(frac, low) {
    const f = Math.max(0, Math.min(1, frac));
    this.timefill.style.width = `calc(${f * 100}% - 4px)`;
    this.timesun.style.left = `${f * 100}%`;
    this.timebar.classList.toggle('low', low);
    this.vignette.classList.toggle('on', low);
  }
  setTiers(n, cur) {
    let h = `<img src="${U('icon_pyramid')}">`;
    for (let i = 0; i < n; i++) h += `<div class="pip ${i < cur ? 'done' : i === cur ? 'cur' : ''}"></div>`;
    this.tiersEl.innerHTML = h;
  }
  setShuffleCost(sec) {
    // "- N sun": a small golden bar acts as the minus sign
    this.shuffleCost.innerHTML = `<div style="width:10px;height:4px;border-radius:2px;background:linear-gradient(#fff2b0,#e6a11c);margin:0 2px;box-shadow:0 0 3px #000"></div>${digitsHTML(sec, 18)}<img src="${U('icon_sun')}" style="height:22px;width:22px">`;
  }
  shuffleHint(on) { this.btnShuffle.classList.toggle('hint', on); }

  flash() { this.flashEl.classList.remove('go'); void this.flashEl.offsetWidth; this.flashEl.classList.add('go'); }
  shakeHud() { this.hud.classList.remove('shake'); void this.hud.offsetWidth; this.hud.classList.add('shake'); }

  popup(x, y, value, { icon = null, size = 28, big = false, prefix = 'plus' } = {}) {
    const d = el('div', { class: 'pop' + (big ? ' bigpop' : '') });
    let h = '';
    if (value !== null && value !== undefined) h += digitsHTML(value, size, prefix);
    if (icon) h += `<img src="${U(icon)}" style="height:${size * 1.25}px;width:auto;margin-left:3px">`;
    d.innerHTML = h;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    this.fx.append(d);
    setTimeout(() => d.remove(), big ? 1700 : 1200);
  }

  popIcon(x, y, icon, size = 90) {
    const d = el('div', { class: 'pop bigpop' }, `<img src="${U(icon)}" style="height:${size}px">`);
    d.style.left = x + 'px'; d.style.top = y + 'px';
    this.fx.append(d);
    setTimeout(() => d.remove(), 1700);
  }

  showWin(eyes, score) {
    const we = document.getElementById('winEyes');
    we.innerHTML = [0, 1, 2].map((k) => `<img src="${U(k < eyes ? 'icon_eye' : 'icon_eye_empty')}">`).join('');
    document.querySelector('#winScore .digits').innerHTML = digitsHTML(score, Math.min(window.innerWidth * 0.64, window.innerHeight * 0.36) * 0.16);
    this.show('scrWin');
    [...we.children].forEach((img, i) => setTimeout(() => img.classList.add('in'), 500 + i * 380));
  }

  // ---------------- hand tutorial
  handAt(x, y, rot = false) {
    this.hand.style.display = 'block';
    this.hand.style.left = (x - 20) + 'px';
    this.hand.style.top = (y - 6) + 'px';
    this.hand.querySelector('.rot').style.display = rot ? 'block' : 'none';
  }
  hideHand() { this.hand.style.display = 'none'; }
}

// ------------------------------------------------------------------ iso stone drawing
// Draws polyomino stones with the same projection as the 3D camera (axes in px per world unit).
export function drawPiece(ctx, piece, ox, oy, ax, H, imgs, alpha = 1, scale = 1) {
  const ex = { x: ax.ex.x * scale, y: ax.ex.y * scale };
  const ez = { x: ax.ez.x * scale, y: ax.ez.y * scale };
  const ey = { x: ax.ey.x * scale * H, y: ax.ey.y * scale * H };
  const img = piece.gold ? imgs.gold : imgs.lime;
  const cells = [...piece.cells].sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  const P = (x, z, up) => ({ x: ox + x * ex.x + z * ez.x + (up ? ey.x : 0), y: oy + x * ex.y + z * ez.y + (up ? ey.y : 0) });
  const quad = (a, b, c, d) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); };
  ctx.save();
  ctx.globalAlpha = alpha;
  const iw = img.width, ih = img.height;
  for (const [x, z] of cells) {
    // +X side face
    const a = P(x + 1, z, true), b = P(x + 1, z + 1, true), c = P(x + 1, z + 1, false), d = P(x + 1, z, false);
    ctx.save(); quad(a, b, c, d); ctx.clip();
    ctx.setTransform(ez.x / iw, ez.y / iw, -ey.x / ih, -ey.y / ih, a.x, a.y);
    ctx.drawImage(img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(60,20,90,0.30)'; ctx.fill();
    ctx.restore();
    // +Z side face
    const e = P(x, z + 1, true), f = P(x + 1, z + 1, true), g = P(x + 1, z + 1, false), h = P(x, z + 1, false);
    ctx.save(); quad(e, f, g, h); ctx.clip();
    ctx.setTransform(ex.x / iw, ex.y / iw, -ey.x / ih, -ey.y / ih, e.x, e.y);
    ctx.drawImage(img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(90,40,120,0.16)'; ctx.fill();
    ctx.restore();
    // top face
    const t0 = P(x, z, true), t1 = P(x + 1, z, true), t2 = P(x + 1, z + 1, true), t3 = P(x, z + 1, true);
    ctx.save(); quad(t0, t1, t2, t3); ctx.clip();
    ctx.setTransform(ex.x / iw, ex.y / iw, ez.x / ih, ez.y / ih, t0.x, t0.y);
    ctx.drawImage(img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(255,240,210,0.10)'; ctx.fill();
    ctx.restore();
    ctx.strokeStyle = piece.gold ? 'rgba(120,60,0,0.55)' : 'rgba(90,50,40,0.45)';
    ctx.lineWidth = 1;
    quad(t0, t1, t2, t3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(t1.x, t1.y); ctx.lineTo(d.x, d.y); ctx.lineTo(c.x, c.y); ctx.lineTo(h.x, h.y); ctx.lineTo(t3.x, t3.y); ctx.moveTo(t2.x, t2.y); ctx.lineTo(c.x, c.y); ctx.stroke();
  }
  ctx.restore();
}

// screen-space centroid offset (from piece origin) of the stone's footprint
export function pieceCentroid(piece, ax, scale = 1) {
  let cx = 0, cz = 0;
  for (const [x, z] of piece.cells) { cx += x + 0.5; cz += z + 0.5; }
  cx /= piece.cells.length; cz /= piece.cells.length;
  return { gx: cx, gz: cz, x: (cx * ax.ex.x + cz * ax.ez.x) * scale, y: (cx * ax.ex.y + cz * ax.ez.y) * scale };
}

export function pieceScreenSize(piece, ax, H, scale = 1) {
  const [w, h] = extent(piece.cells);
  const pts = [];
  for (const [x, z] of [[0, 0], [w, 0], [0, h], [w, h]]) for (const up of [0, 1]) pts.push([(x * ax.ex.x + z * ax.ez.x + up * ax.ey.x * H) * scale, (x * ax.ex.y + z * ax.ez.y + up * ax.ey.y * H) * scale]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), minX: Math.min(...xs), minY: Math.min(...ys) };
}
