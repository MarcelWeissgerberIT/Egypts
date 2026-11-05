// Text-free user interface: every label, number and button is an image generated with Higgsfield.
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
function button(id, img, cls = '') { return el('div', { id, class: 'btn ' + cls, role: 'button' }, `<img src="${U(img)}">`); }
const ico = (k, h, cls = '') => `<img class="${cls}" src="${U(k)}" style="height:${h}px">`;
const arrow = '<div class="arrow"></div>';

export const RES_KEYS = ['worker', 'bread', 'grain', 'stone', 'block', 'ore', 'tools'];

export class UI {
  constructor(app) {
    this.app = app;
    this.handlers = {};
    this._vals = {};
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
    // ---------------- HUD
    const hud = el('div', { id: 'hud', class: 'hidden' });
    const row = el('div', { class: 'row' });
    const left = el('div', { class: 'row' });
    this.btnPause = button('btnPause', 'btn_pause');
    this.lvlBadge = el('div', { id: 'lvlBadge' }, `<img src="${U('medallion')}"><div class="digits"></div>`);
    left.append(this.btnPause, this.lvlBadge);
    this.debenChip = el('div', { class: 'bigchip', id: 'debenChip' }, `${ico('r_deben', 34)}<div class="digits"></div>`);
    this.progChip = el('div', { class: 'bigchip', id: 'progChip' }, `${ico('icon_pyramid', 32)}<div class="pbar"><div class="pfill"></div></div>`);
    row.append(left, this.debenChip, this.progChip);
    this.timebar = el('div', { id: 'timebar' }, `<div id="timefill"></div><img id="timesun" src="${U('icon_sun')}">`);
    this.resRow = el('div', { id: 'resRow' });
    this.chips = {};
    for (const k of RES_KEYS) {
      const c = el('div', { class: 'chip', 'data-k': k }, `${ico('r_' + k, 26)}<div class="digits"></div>`);
      this.chips[k] = c; this.resRow.append(c);
    }
    hud.append(row, this.timebar, this.resRow);
    app.append(hud);
    this.hud = hud;
    this.timefill = this.timebar.querySelector('#timefill');
    this.timesun = this.timebar.querySelector('#timesun');
    this._bindTap(this.btnPause, 'pause');

    // ---------------- bottom controls
    this.controls = el('div', { id: 'controls', class: 'hidden' });
    this.btnSpeed = el('div', { id: 'btnSpeed', class: 'btn', role: 'button' }, `<img src="${U('btn_next')}"><div class="spd digits"></div>`);
    this.eventIcon = el('div', { id: 'eventIcon' });
    this.controls.append(this.eventIcon, this.btnSpeed);
    app.append(this.controls);
    this._bindTap(this.btnSpeed, 'speed');

    // ---------------- sheet (build menu / building info)
    this.sheet = el('div', { id: 'sheet', class: 'hidden' }, `<div class="sheetBody"></div>`);
    this.sheetClose = button('sheetClose', 'btn_close');
    this.sheet.append(this.sheetClose);
    this.sheetBody = this.sheet.querySelector('.sheetBody');
    app.append(this.sheet);
    this._bindTap(this.sheetClose, 'closeSheet');

    this.fx = el('div', { id: 'fx' });
    this.flashEl = el('div', { id: 'flash' });
    this.vignette = el('div', { id: 'vignette' });
    this.stormEl = el('div', { id: 'storm' });
    this.hand = el('div', { id: 'hand' }, `<img src="${U('hand')}"><img class="advice" src="">`);
    app.append(this.stormEl, this.fx, this.flashEl, this.vignette, this.hand);

    // ---------------- screens
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

  show(id) { for (const [k, s] of Object.entries(this.screens)) s.classList.toggle('on', k === id); }
  setLoad(p) { const f = document.getElementById('loadFill'); if (f) f.style.width = Math.round(p * 100) + '%'; }
  setSound(on) { for (const b of [this.btnSoundT, this.btnSoundP]) b.querySelector('img').src = U(on ? 'btn_sound_on' : 'btn_sound_off'); }
  setInGame(on) {
    this.hud.classList.toggle('hidden', !on);
    this.controls.classList.toggle('hidden', !on);
    if (!on) this.closeSheet();
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

  // ---------------- HUD values
  _set(key, html) { if (this._vals[key] === html) return false; this._vals[key] = html; return true; }
  setLevel(i) { this.lvlBadge.querySelector('.digits').innerHTML = digitsHTML(i + 1, 22); }
  setDeben(n) { const h = digitsHTML(n, 24); if (this._set('deben', h)) this.debenChip.querySelector('.digits').innerHTML = h; }
  setProgress(placed, total) {
    this.progChip.querySelector('.pfill').style.width = `${Math.min(100, (placed / total) * 100)}%`;
  }
  setResources(r, visible) {
    for (const k of RES_KEYS) {
      const c = this.chips[k];
      c.style.display = visible.includes(k) ? '' : 'none';
      const h = digitsHTML(r[k] ?? 0, 18);
      if (this._set('r_' + k, h)) c.querySelector('.digits').innerHTML = h;
    }
  }
  flagRes(k, bad) { this.chips[k].classList.toggle('bad', bad); }
  pulseRes(k) { const c = this.chips[k]; c.classList.remove('gain'); void c.offsetWidth; c.classList.add('gain'); }
  setTime(frac, low) {
    const f = Math.max(0, Math.min(1, frac));
    this.timefill.style.width = `calc(${f * 100}% - 4px)`;
    this.timesun.style.left = `${f * 100}%`;
    this.timebar.classList.toggle('low', low);
    this.vignette.classList.toggle('on', low);
  }
  setSpeed(s) { this.btnSpeed.querySelector('.spd').innerHTML = digitsHTML(s, 20, 'x'); this.btnSpeed.classList.toggle('fast', s > 1); }
  setEvent(kind, active) {
    const src = kind === 'flood' ? U('btn_shuffle') : kind === 'storm' ? 'assets/tex/dust.webp' : null;
    this.eventIcon.innerHTML = src ? `<img src="${src}">` : '';
    this.eventIcon.className = kind ? (active ? 'on' : 'warn') : '';
  }
  setStorm(on) { this.stormEl.classList.toggle('on', on); }

  // ---------------- sheets
  openBuildSheet(cards) {
    let h = '<div class="cards">';
    for (const c of cards) {
      h += `<div class="card btn${c.ok ? '' : ' off'}" data-type="${c.type}">
        <img class="bimg" src="${U('b_' + c.type)}">
        <div class="recipe">${c.inputs.map((g) => ico('r_' + g, 20)).join('')}${c.inputs.length ? arrow : ''}${c.output ? ico('r_' + c.output, 22) : ico('r_worker', 22)}</div>
        <div class="cost${c.money ? '' : ' short'}">${ico('r_deben', 20)}<div class="digits">${digitsHTML(c.cost, 16)}</div></div>
        ${c.staff ? `<div class="cost${c.hands ? '' : ' short'}">${ico('r_worker', 20)}<div class="digits">${digitsHTML(c.staff, 16)}</div></div>` : ''}
      </div>`;
    }
    h += '</div>';
    this.sheetBody.innerHTML = h;
    this.sheetBody.querySelectorAll('.card').forEach((cardEl) => {
      const type = cardEl.getAttribute('data-type');
      this._bindTap(cardEl, 'buildType', type);
    });
    this.sheet.classList.remove('hidden');
    this.controls.classList.add('under');
    this.sheetOpen = 'build';
  }

  openBuildingSheet(info) {
    const pips = [0, 1, 2].map((i) => `<div class="pip ${i < info.level ? 'done' : ''}"></div>`).join('');
    let recipe = '';
    if (info.type === 'house') recipe = `${ico('r_worker', 30)}<div class="digits">${digitsHTML(info.workers, 22)}</div><div class="sep"></div>${ico('r_bread', 28)}${ico('icon_sun', 24)}<div class="digits">${digitsHTML(info.eat, 18)}</div>`;
    else recipe = `${info.inputs.map((g) => ico('r_' + g, 30)).join('')}${info.inputs.length ? arrow : ''}${ico('r_' + info.output, 34)}${info.outN > 1 ? `<div class="digits">${digitsHTML(info.outN, 18, 'x')}</div>` : ''}<div class="sep"></div>${ico('icon_sun', 24)}<div class="digits">${digitsHTML(info.cycle, 18)}</div>`;
    const status = info.status ? `<div class="status">${ico('bubble', 54, 'bub')}${ico(info.status, 30, 'sicon')}</div>` : '';
    let up = '';
    if (info.level < info.maxLevel) {
      up = `<div class="upgrade btn${info.canUpgrade ? '' : ' off'}" id="btnUpgrade">${ico('btn_up', 64)}
        <div class="cost${info.money ? '' : ' short'}">${ico('r_deben', 20)}<div class="digits">${digitsHTML(info.upCost, 16)}</div></div>
        ${info.upStaff ? `<div class="cost${info.hands ? '' : ' short'}">${ico('r_worker', 20)}<div class="digits">${digitsHTML(info.upStaff, 16, 'plus')}</div></div>` : ''}</div>`;
    } else up = `<div class="maxed">${ico('icon_eye', 46)}</div>`;
    this.sheetBody.innerHTML = `<div class="binfo"><div class="bleft"><img class="bimg big" src="${U('b_' + info.type)}">${status}</div>
      <div class="bright"><div class="pips">${pips}</div><div class="recipe big">${recipe}</div>${up}</div></div>`;
    const ub = this.sheetBody.querySelector('#btnUpgrade');
    if (ub) this._bindTap(ub, 'upgrade');
    this.sheet.classList.remove('hidden');
    this.controls.classList.add('under');
    this.sheetOpen = 'building';
  }

  closeSheet() { this.sheet.classList.add('hidden'); this.controls.classList.remove('under'); this.sheetOpen = null; }
  shakeCard(type) {
    const c = this.sheetBody.querySelector(`[data-type="${type}"]`) || this.sheetBody.querySelector('#btnUpgrade');
    if (!c) return; c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
  }

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

  handAt(x, y, advice = null) {
    this.hand.style.display = 'block';
    this.hand.style.left = (x - 20) + 'px';
    this.hand.style.top = (y - 6) + 'px';
    const a = this.hand.querySelector('.advice');
    a.style.display = advice ? 'block' : 'none';
    if (advice && a.getAttribute('src') !== U(advice)) a.src = U(advice);
  }
  hideHand() { this.hand.style.display = 'none'; }
}
