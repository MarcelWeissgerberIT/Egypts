// Image-only interface for the platformer: HUD, touch controls, title, pyramid map, world rooms,
// pause, win and the revealed secrets. Every label and number is a picture.
const U = (n) => `assets/ui/${n}`;
const DIGIT_AR = { 0: 134, 1: 126, 2: 126, 3: 129, 4: 136, 5: 128, 6: 126, 7: 133, 8: 127, 9: 125, plus: 160, x: 157 };
export function digitsHTML(n, h, prefix = null) {
  const s = String(Math.max(0, Math.floor(n)));
  let out = '';
  if (prefix) out += `<img src="${U('d_' + prefix + '.webp')}" style="height:${h * 0.8}px;width:${(h * 0.8 * DIGIT_AR[prefix]) / 160}px">`;
  for (const ch of s) out += `<img src="${U('d' + ch + '.webp')}" style="height:${h}px;width:${(h * DIGIT_AR[ch]) / 160}px">`;
  return out;
}
function el(tag, attrs = {}, html = '') { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.innerHTML = html; return e; }
const img = (n, cls = '') => `<img class="${cls}" src="${U(n)}">`;
// floor centres on the pyramid map (fraction of the picture height, bottom floor first)
const FLOORS = [0.92, 0.825, 0.738, 0.653, 0.575, 0.487, 0.394, 0.306, 0.231, 0.153];
const FLOOR_W = [0.84, 0.8, 0.76, 0.72, 0.66, 0.6, 0.54, 0.48, 0.4, 0.32];

export class UI {
  constructor(app) {
    this.app = app;
    this.h = {};
    this._v = {};
    this._build();
  }
  on(n, f) { this.h[n] = f; }
  emit(n, ...a) { if (this.h[n]) this.h[n](...a); }
  tap(e, n, ...a) {
    e.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); e._d = true; e.classList.add('down'); });
    e.addEventListener('pointerup', (ev) => { ev.stopPropagation(); e.classList.remove('down'); if (e._d) { e._d = false; this.emit(n, ...a); } });
    e.addEventListener('pointerleave', () => { e._d = false; e.classList.remove('down'); });
  }
  btn(id, image, cls = '') { const b = el('div', { id, class: 'btn ' + cls }, img(image)); return b; }

  _build() {
    const A = this.app;
    // HUD
    this.hud = el('div', { id: 'hud', class: 'hidden' });
    this.bPause = this.btn('bPause', 'btn_pause.webp');
    this.hearts = el('div', { id: 'hearts' }, [0, 1, 2].map(() => img('icon_ankh.webp')).join(''));
    this.coinChip = el('div', { class: 'chip', id: 'coinChip' }, `${img('icon_scarab.webp')}<div class="digits"></div>`);
    this.papyri = el('div', { id: 'papyri' }, [0, 1, 2].map(() => img('papyrus.webp', 'off')).join(''));
    this.lvl = el('div', { id: 'lvl' }, `${img('medallion.webp')}<div class="digits"></div>`);
    const left = el('div', { class: 'grp' }); left.append(this.bPause, this.hearts);
    const right = el('div', { class: 'grp' }); right.append(this.papyri, this.coinChip, this.lvl);
    this.hud.append(left, right);
    A.append(this.hud);
    this.tap(this.bPause, 'pause');
    // touch controls
    this.ctrl = el('div', { id: 'ctrl', class: 'hidden' });
    // Game Boy layout: cross pad left, A (jump) and B (action) right
    this.dpad = el('div', { id: 'dpad' }, `${img('dpad.webp')}<i class="arm up"></i><i class="arm dn"></i><i class="arm lt"></i><i class="arm rt"></i>`);
    this.jumpBtn = el('div', { id: 'jumpBtn' }, img('btn_jump.webp'));
    this.actBtn = el('div', { id: 'actBtn' }, img('btn_act.webp'));
    this.ctrl.append(this.dpad, this.jumpBtn, this.actBtn);
    A.append(this.ctrl);
    // effects
    this.fx = el('div', { id: 'fx' }); this.flashEl = el('div', { id: 'flash' }); this.fade = el('div', { id: 'fade' });
    A.append(this.fx, this.flashEl, this.fade);
    this.rot = el('div', { id: 'rot' }, img('icon_rotate.webp'));
    this.hand = el('div', { id: 'hand' }, img('hand.webp'));
    A.append(this.rot, this.hand);
    // screens
    this.scr = {};
    const add = (id, html = '') => { const s = el('div', { id, class: 'screen' }, html); A.append(s); this.scr[id] = s; return s; };
    const load = add('sLoad', `<div class="bg title"></div>${img('logo.webp', 'logo')}<div id="loadBar"><div id="loadFill"></div></div>`);
    load.classList.add('on');
    const title = add('sTitle', `<div class="bg title"></div>${img('logo.webp', 'logo')}`);
    this.bPlay = this.btn('bPlay', 'btn_play.webp', 'hero'); this.bSoundT = this.btn('bSoundT', 'btn_sound_on.webp', 'corner');
    title.append(this.bPlay, this.bSoundT);
    this.tap(this.bPlay, 'start'); this.tap(this.bSoundT, 'sound');
    // map: the pyramid cut open, one hotspot per floor
    const map = add('sMap', `<div class="mapWrap"><img class="mapImg" src="${U('map.jpg')}"><div class="floors"></div></div>`);
    this.mapFloors = map.querySelector('.floors');
    this.bMapHome = this.btn('bMapHome', 'btn_home.webp', 'corner left');
    this.bContinue = this.btn('bContinue', 'btn_play.webp');
    map.append(this.bMapHome, this.bContinue); this.tap(this.bMapHome, 'title'); this.tap(this.bContinue, 'continue');
    // a world: its painting, ten level medallions and the secret tablet
    const world = add('sWorld', `<div class="bg wbg"></div><div class="wdim"></div><div class="wtitle"></div><div class="lvls"></div>`);
    this.wbg = world.querySelector('.wbg'); this.wtitle = world.querySelector('.wtitle'); this.lvls = world.querySelector('.lvls');
    this.tabBtn = el('div', { class: 'btn tabBtn' }, `<img class="tab" src=""><img class="lock" src="${U('icon_lock.webp')}">`);
    this.bWorldBack = this.btn('bWorldBack', 'btn_home.webp', 'corner left');
    world.append(this.tabBtn, this.bWorldBack);
    this.tap(this.bWorldBack, 'map'); this.tap(this.tabBtn, 'tablet');
    // pause
    const pause = add('sPause', '<div class="dim"></div>');
    const pp = el('div', { class: 'panel' });
    this.bResume = this.btn('bResume', 'btn_play.webp', 'hero'); const row = el('div', { class: 'row' });
    this.bRestart = this.btn('bRestart', 'btn_restart.webp'); this.bToMap = this.btn('bToMap', 'btn_home.webp'); this.bSoundP = this.btn('bSoundP', 'btn_sound_on.webp');
    row.append(this.bRestart, this.bToMap, this.bSoundP); pp.append(this.bResume, row); pause.append(pp);
    this.tap(this.bResume, 'resume'); this.tap(this.bRestart, 'restart'); this.tap(this.bToMap, 'world'); this.tap(this.bSoundP, 'sound');
    // win
    const win = add('sWin', `<div class="dim win"></div><div class="col">${img('banner_win.webp', 'banner')}<div class="eyes"></div><div class="wincoins">${img('icon_scarab.webp')}<div class="digits"></div></div></div>`);
    const wr = el('div', { class: 'row' });
    this.bWinMap = this.btn('bWinMap', 'btn_home.webp'); this.bWinRe = this.btn('bWinRe', 'btn_restart.webp'); this.bNext = this.btn('bNext', 'btn_next.webp', 'big');
    wr.append(this.bWinMap, this.bWinRe, this.bNext); win.querySelector('.col').append(wr);
    this.tap(this.bWinMap, 'world'); this.tap(this.bWinRe, 'restart'); this.tap(this.bNext, 'next');
    // a revealed secret
    const story = add('sStory', `<div class="dim story"></div><div class="col"><div class="tablet"><img src=""></div></div>`);
    this.bStoryOk = this.btn('bStoryOk', 'btn_next.webp', 'big'); story.querySelector('.col').append(this.bStoryOk);
    this.tap(this.bStoryOk, 'storyDone');
    // new power
    const power = add('sPower', `<div class="dim"></div><div class="col"><div class="power"></div></div>`);
    this.powerBox = power.querySelector('.power');
    this.bPowerOk = this.btn('bPowerOk', 'btn_play.webp', 'big'); power.querySelector('.col').append(this.bPowerOk);
    this.tap(this.bPowerOk, 'powerDone');
  }

  show(id) { for (const [k, s] of Object.entries(this.scr)) s.classList.toggle('on', k === id); }
  setLoad(p) { const f = document.getElementById('loadFill'); if (f) f.style.width = Math.round(p * 100) + '%'; }
  setSound(on) { for (const b of [this.bSoundT, this.bSoundP]) b.querySelector('img').src = U(on ? 'btn_sound_on.webp' : 'btn_sound_off.webp'); }
  inGame(on) { this.hud.classList.toggle('hidden', !on); this.ctrl.classList.toggle('hidden', !on); this.rot.classList.toggle('on', on && window.innerHeight > window.innerWidth * 1.1); }

  // ---------------- HUD
  _set(k, v) { if (this._v[k] === v) return false; this._v[k] = v; return true; }
  setHearts(n, max) { if (!this._set('h', n + '/' + max)) return; [...this.hearts.children].forEach((e, i) => { e.classList.toggle('lost', i >= n); e.style.display = i < max ? '' : 'none'; }); }
  setCoins(n) { const h = digitsHTML(n, 22); if (this._set('c', h)) this.coinChip.querySelector('.digits').innerHTML = h; }
  setPapyri(found) { const k = found.map((f) => (f ? 1 : 0)).join(''); if (!this._set('p', k)) return; [...this.papyri.children].forEach((e, i) => e.classList.toggle('off', !found[i])); }
  setLevel(n) { this.lvl.querySelector('.digits').innerHTML = digitsHTML(n, n > 99 ? 15 : 19); }
  bumpPapyrus(i) { const e = this.papyri.children[i]; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
  bumpCoins() { this.coinChip.classList.remove('pop'); void this.coinChip.offsetWidth; this.coinChip.classList.add('pop'); }

  // ---------------- controls
  setPad(x, y) {
    const k = x + ',' + y;
    if (this._pad === k) return;
    this._pad = k;
    const d = this.dpad;
    d.classList.toggle('up', y > 0); d.classList.toggle('dn', y < 0); d.classList.toggle('lt', x < 0); d.classList.toggle('rt', x > 0);
    d.style.transform = `perspective(400px) rotateX(${-y * 9}deg) rotateY(${x * 9}deg)`;
  }
  padCenter() { const r = this.dpad.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; }
  pressJump(on) { this.jumpBtn.classList.toggle('down', on); }
  pressB(on) { this.actBtn.classList.toggle('down', on); }
  buttonRect(which) { const r = (which === 'a' ? this.jumpBtn : this.actBtn).getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 } : null; }
  glowAction(on) { this.actBtn.classList.toggle('glow', on); }

  // ---------------- map + worlds
  buildMap(save, worldsUnlocked) {
    this.mapFloors.innerHTML = '';
    FLOORS.forEach((y, i) => {
      const w = i + 1, locked = w > worldsUnlocked;
      const eyes = save.eyes.slice(i * 10, i * 10 + 10).reduce((a, b) => a + (b || 0), 0);
      const f = el('div', { class: 'floor btn' + (locked ? ' locked' : '') }, `<div class="med">${img('medallion.webp')}<div class="digits">${digitsHTML(w, 20)}</div></div>${locked ? img('icon_lock.webp', 'lk') : `<div class="fe">${img('icon_eye.webp')}<div class="digits">${digitsHTML(eyes, 14)}</div></div>`}${save.tablets[i] ? img('papyrus.webp', 'fp') : ''}`);
      f.style.top = (y * 100) + '%'; f.style.width = (FLOOR_W[i] * 100) + '%';
      if (!locked) this.tap(f, 'openWorld', w);
      this.mapFloors.append(f);
    });
  }

  buildWorld(w, save, unlocked) {
    this.wbg.style.backgroundImage = `url(assets/bg/w${w}.jpg)`;
    this.wtitle.innerHTML = `${img('medallion.webp')}<div class="digits">${digitsHTML(w, 30)}</div>`;
    this.lvls.innerHTML = '';
    for (let k = 1; k <= 10; k++) {
      const n = (w - 1) * 10 + k, locked = n > unlocked, eyes = save.eyes[n - 1] || 0;
      const d = el('div', { class: 'lv btn' + (locked ? ' locked' : '') + (n === unlocked ? ' next' : '') }, `<div class="med">${img('medallion.webp')}<div class="digits">${digitsHTML(n, n > 99 ? 16 : 20)}</div></div>${locked ? img('icon_lock.webp', 'lk') : ''}<div class="eyes">${[0, 1, 2].map((i) => img(i < eyes ? 'icon_eye.webp' : 'icon_eye_empty.webp')).join('')}</div>`);
      if (!locked) this.tap(d, 'play', n);
      this.lvls.append(d);
    }
    const t = save.tablets[w - 1];
    this.tabBtn.querySelector('.tab').src = `assets/tab/s${w}.jpg`;
    this.tabBtn.classList.toggle('locked', !t);
  }

  showWin(eyes, coins, hasNext) {
    const e = this.scr.sWin.querySelector('.eyes');
    e.innerHTML = [0, 1, 2].map((k) => img(k < eyes ? 'icon_eye.webp' : 'icon_eye_empty.webp')).join('');
    this.scr.sWin.querySelector('.wincoins .digits').innerHTML = digitsHTML(coins, 30);
    this.bNext.style.display = hasNext ? '' : 'none';
    this.show('sWin');
    [...e.children].forEach((im, i) => setTimeout(() => im.classList.add('in'), 400 + i * 350));
  }
  showStory(w) { this.scr.sStory.querySelector('.tablet img').src = `assets/tab/s${w}.jpg`; this.show('sStory'); }
  showPower(kind) {
    this.powerBox.innerHTML = kind === 'double'
      ? `${img('btn_jump.webp')}${img('btn_jump.webp')}<div class="digits">${digitsHTML(2, 40, 'x')}</div>`
      : `${img('btn_jump.webp')}<div class="wall"></div>${img('btn_jump.webp', 'flip')}`;
    this.show('sPower');
  }

  // ---------------- first-level hints: a hand shows the stick, the jump button and the action button
  hint(kind) {
    this.hand.className = kind ? 'on ' + kind : '';
  }

  // a world/level card at the start of each level
  intro(w, i, n) {
    if (!this.introEl) { this.introEl = el('div', { id: 'intro' }); this.app.append(this.introEl); }
    this.introEl.innerHTML = `<div class="med">${img('medallion.webp')}<div class="digits">${digitsHTML(w, 30)}</div></div>${img('icon_ankh.webp', 'sep')}<div class="digits big">${digitsHTML(n, 40)}</div>`;
    this.introEl.classList.remove('on'); void this.introEl.offsetWidth; this.introEl.classList.add('on');
  }

  // ---------------- effects
  popup(x, y, html, cls = '') { const d = el('div', { class: 'pop ' + cls }, html); d.style.left = x + 'px'; d.style.top = y + 'px'; this.fx.append(d); setTimeout(() => d.remove(), 1300); }
  flash() { this.flashEl.classList.remove('go'); void this.flashEl.offsetWidth; this.flashEl.classList.add('go'); }
  fadeOut(on) { this.fade.classList.toggle('on', on); }
}
