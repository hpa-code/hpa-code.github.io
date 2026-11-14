// Everything that is ordinary web page: the camp scenes, menus, the log, the gauges, and reading the keyboard, mouse, touch and gamepad.
import { ROUTES, CAMPS } from './terrain.js';

const $ = id => document.getElementById(id), root = document.documentElement;
const KEY = 'hpa-climb-log-v2';
const NAMES = { base: 'Base camp', teaching: 'Camp 1: Teaching', experience: 'Camp 2: Experience', projects: 'Camp 3: Projects', research: 'Camp 4: Research', contact: 'The summit' };
const TITLES = { teaching: ['Camp 1', 'Teaching'], experience: ['Camp 2', 'Experience'], projects: ['Camp 3', 'Projects'], research: ['Camp 4', 'Research'], contact: ['The summit', 'You made it'] };
export const CHALK_TOTAL = 8, RING_TOTAL = 8;
export const altText = y => (Math.round((2400 + y * 25) / 10) * 10).toLocaleString('en-US') + ' m';

export function readContent() {
  const out = {};
  for (const s of document.querySelectorAll('.sheet')) out[s.id] = { title: s.querySelector('h2').textContent.trim(), blurb: s.querySelector('.blurb').textContent.trim(), items: [...s.querySelectorAll('.proj')].map(a => ({ title: a.querySelector('h3').textContent.trim(), chips: [...a.querySelectorAll('.chips span')].map(c => c.textContent).join(' · ') })) };
  return out;
}

const HINTS = {
  walk: [['W A S D', 'move'], ['Shift', 'run'], ['Space', 'jump'], ['Space in the air', 'paraglider'], ['E', 'use']],
  climb: [['W S', 'up and down'], ['A D', 'across'], ['Space', 'leap'], ['S + Space', 'let go']],
  glide: [['A D', 'steer'], ['W', 'dive'], ['S', 'brake'], ['Space', 'fold the wing'], ['', 'the pale columns of air lift you']],
  bike: [['W', 'pedal'], ['S', 'brake'], ['A D', 'steer'], ['Space', 'hop'], ['E', 'get off']],
  sled: [['W', 'throttle'], ['S', 'brake'], ['A D', 'steer'], ['Space', 'hop'], ['E', 'get off']]
};

export function createUI(on) {
  const sheets = [...document.querySelectorAll('.sheet')], routeBtns = [...document.querySelectorAll('.route [data-go]')];
  const U = { openId: null, started: false };

  /* ---------- Dress the camp scenes: stagger what writes, stamps and develops; put real altitudes on them ---------- */
  for (const s of sheets) {
    for (const sel of ['.w, .chalktext', '.draw', '.stamp', '.type', '.paper', '.det']) s.querySelectorAll(sel).forEach((el, i) => el.style.setProperty('--i', i));
    const c = CAMPS.find(c => c.id === s.id), k = s.querySelector('.kicker'); if (c && k) k.textContent = TITLES[s.id][0] + ' · ' + altText(c.y);
  }
  const hgt = document.querySelector('.height'); if (hgt) hgt.textContent = altText(CAMPS[CAMPS.length - 1].y) + ' · an imaginary mountain';
  const pm = $('pmdate'); if (pm) { const d = new Date(); pm.textContent = 'SUMMIT\n' + d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).toUpperCase() + '\n' + d.getFullYear(); }
  // Numbers that count up when their page opens
  function countUp(sheet) {
    sheet.querySelectorAll('.num').forEach((el, i) => {
      const to = +el.dataset.count, dec = +(el.dataset.dec || 0), pre = el.dataset.prefix || '', suf = el.dataset.suffix || '', sep = el.dataset.sep, t0 = performance.now() + 500 + i * 160, dur = 1100;
      const fmt = v => pre + (sep ? Math.round(v).toLocaleString('en-US') : v.toFixed(dec)) + suf; el.textContent = fmt(0);
      const tick = t => { const k = Math.min(1, Math.max(0, (t - t0) / dur)), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(to * e); if (k < 1 && U.openId === sheet.id) requestAnimationFrame(tick); else el.textContent = fmt(to); };
      requestAnimationFrame(tick);
    });
  }
  let recT = 0, recI = 0; const rec = $('rectime');
  // Project list in the terminal
  const projBtns = [...document.querySelectorAll('[data-proj]')], tmain = document.querySelector('.tmain'), projs = [...document.querySelectorAll('.proj')];
  function goProj(i, flash) { const a = projs[i]; if (!a) return; projBtns.forEach((b, k) => b.classList.toggle('on', k === i)); const top = a.offsetTop - tmain.offsetTop - 6; tmain.scrollTop = top; if (matchMedia('(max-width: 900px)').matches) a.scrollIntoView({ block: 'start' }); if (flash) { a.classList.remove('flash'); void a.offsetWidth; a.classList.add('flash'); } }
  projBtns.forEach((b, i) => b.addEventListener('click', () => goProj(i, true)));
  if (tmain) tmain.addEventListener('scroll', () => { let cur = 0; projs.forEach((a, k) => { if (a.offsetTop - tmain.offsetTop - 80 <= tmain.scrollTop) cur = k; }); projBtns.forEach((b, k) => b.classList.toggle('on', k === cur)); }, { passive: true });

  /* ---------- Opening and closing a camp's scene ---------- */
  U.show = (id, item) => {
    if (!$(id)) return; U.openId = id; sheets.forEach(s => s.classList.toggle('open', s.id === id)); root.classList.add('panel');
    const sheet = $(id), box = sheet.firstElementChild; box.scrollTop = 0; if (tmain) tmain.scrollTop = 0;
    // restart the entrance animations
    sheet.classList.remove('open'); void sheet.offsetWidth; sheet.classList.add('open');
    countUp(sheet);
    if (id === 'projects') setTimeout(() => goProj(item || 0, item !== undefined), item ? 350 : 0);
    if (id === 'research') { clearInterval(recI); recT = 0; recI = setInterval(() => { recT++; const p = n => String(n).padStart(2, '0'); rec.textContent = p(Math.floor(recT / 3600)) + ':' + p(Math.floor(recT / 60) % 60) + ':' + p(recT % 60); }, 1000); }
    sheet.querySelector('.x').focus({ preventScroll: true }); on.sound(id === 'teaching' ? 'chalk' : id === 'experience' ? 'stamp' : id === 'projects' ? 'keys' : id === 'research' ? 'shutter' : 'open');
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  };
  U.hide = () => { if (!U.openId) return; U.openId = null; clearInterval(recI); sheets.forEach(s => s.classList.remove('open')); root.classList.remove('panel'); $('world').focus({ preventScroll: true }); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} };
  sheets.forEach(s => { s.querySelector('.x').addEventListener('click', U.hide); s.addEventListener('click', e => { if (e.target === s) U.hide(); }); });
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => on.travel(b.dataset.go)));

  /* ---------- Plain version ---------- */
  const plainBtn = $('plainbtn');
  U.isPlain = () => root.classList.contains('plain');
  U.setPlain = v => { root.classList.toggle('plain', v); root.classList.toggle('climb', !v); plainBtn.textContent = v ? 'Explore the mountain' : 'Plain version'; if (v) { U.hide(); scrollTo(0, 0); } on.plain(v); };
  plainBtn.addEventListener('click', () => U.setPlain(!U.isPlain()));
  $('readplain').addEventListener('click', () => U.setPlain(true));
  $('start').addEventListener('click', () => on.start());
  U.setStarted = () => { U.started = true; root.classList.add('started'); };
  U.loading = (frac, msg) => { $('veilbar').style.width = Math.round(frac * 100) + '%'; if (msg) $('veilmsg').textContent = msg; };

  const copy = $('copy');
  if (copy) copy.addEventListener('click', () => { const ok = () => { copy.textContent = 'Copied'; }, no = () => { copy.textContent = 'Select the address to copy it'; }; if (navigator.clipboard) navigator.clipboard.writeText('hacharya@u.rochester.edu').then(ok, no); else no(); });

  /* ---------- Prompt, hints, toasts, gauges ---------- */
  const prompt = $('prompt'), promptTxt = $('prompttxt'), actBtn = $('actbtn'); let promptText = null;
  U.prompt = text => { if (text === promptText) return; promptText = text; if (text) promptTxt.textContent = text; prompt.classList.toggle('on', !!text); prompt.tabIndex = text ? 0 : -1; actBtn.hidden = !text; };
  prompt.addEventListener('click', () => on.action()); actBtn.addEventListener('pointerdown', e => { e.preventDefault(); on.action(); });
  const hint = $('modehint'); let hintT = 0, hintMode = null; const seen = {};
  U.modeHint = mode => {
    if (mode === hintMode) return; hintMode = mode; const h = HINTS[mode]; if (!h) { hint.classList.remove('on'); return; }
    seen[mode] = (seen[mode] || 0) + 1; if (seen[mode] > 3 && mode === 'walk') { hint.classList.remove('on'); return; }
    hint.textContent = ''; for (const [k, t] of h) { const s = document.createElement('span'); if (k) { const b = document.createElement('b'); b.textContent = k; s.append(b); } s.append(t); hint.append(s); }
    hint.classList.add('on'); clearTimeout(hintT); hintT = setTimeout(() => hint.classList.remove('on'), 7000);
  };
  U.toast = (title, sub, ms = 3600, gold) => {
    const t = document.createElement('div'); t.className = 'toast' + (gold ? ' gold' : ''); t.textContent = title; if (sub) { const s = document.createElement('small'); s.textContent = sub; t.append(s); }
    const box = $('toasts'); box.append(t); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, ms);
  };
  const tc = $('titlecard');
  U.titleCard = (id, y) => { const T2 = TITLES[id]; if (!T2) return; $('tck').textContent = T2[0] + ' · ' + altText(y); $('tct').textContent = T2[1]; $('tcs').textContent = id === 'contact' ? 'Open the brass box. Then pick a way down.' : (document.querySelector('#' + id + ' .blurb') || {}).textContent || ''; tc.classList.remove('on'); void tc.offsetWidth; tc.classList.add('on'); };
  const stam = $('stam'), fg = $('stamfg'); let stamShown = false, lastFrac = -1;
  U.stamina = (frac, sx, sy, show) => {
    if (show !== stamShown) { stamShown = show; stam.classList.toggle('on', show); } if (!show) return;
    stam.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)';
    if (Math.abs(frac - lastFrac) > 0.004) { lastFrac = frac; fg.style.strokeDashoffset = (106.8 * (1 - frac)).toFixed(1); stam.classList.toggle('low', frac < 0.25); }
  };
  const alt = $('alt'), where = $('where'); let lastAlt = '', lastWhere = '';
  U.altitude = y => { const s = altText(y); if (s !== lastAlt) { lastAlt = s; alt.textContent = s; } };
  U.where = text => { if (text !== lastWhere) { lastWhere = text; where.textContent = text; } };
  let lastKey;
  U.route = (here, y, camps) => {
    const key = here + '|' + camps.filter(c => y > c.y - 1).length; if (key === lastKey) return; lastKey = key;
    routeBtns.forEach(b => { const c = camps.find(c => c.id === b.dataset.go); b.classList.toggle('at', here === c.id); b.classList.toggle('past', y > c.y - 1); });
  };
  const gauge = $('gauge'), gnum = $('gaugenum'), gunit = $('gaugeunit'), gbar = gauge.querySelector('u'); let gShown = false, gText = '';
  // kind: null, 'speed' (value in m/s), or 'vario' (value in m/s up)
  U.gauge = (kind, value, frac) => {
    const show = !!kind; if (show !== gShown) { gShown = show; gauge.classList.toggle('on', show); } if (!show) return;
    const txt = kind === 'speed' ? String(Math.round(Math.abs(value) * 3.6)) : (value >= 0 ? '+' : '−') + Math.abs(value).toFixed(1);
    if (txt !== gText) { gText = txt; gnum.textContent = txt; }
    gunit.textContent = kind === 'speed' ? 'km/h' : 'm/s'; gauge.classList.toggle('lift', kind === 'vario' && value > 0.2); gauge.classList.toggle('sink', kind === 'vario' && value <= 0.2); gbar.style.width = Math.round(Math.min(1, Math.max(0, frac)) * 100) + '%';
  };
  const timer = $('timer'), tnum = $('timernum'); let tShown = false;
  U.timer = (show, t) => { if (show !== tShown) { tShown = show; timer.classList.toggle('on', show); } if (show) tnum.textContent = fmtTime(t); };
  U.setTime = name => { $('timetxt').textContent = name; };
  $('timebtn').addEventListener('click', () => on.time()); $('photobtn').addEventListener('click', () => on.photo());
  const snap = $('snap');
  U.flash = () => { const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); };
  U.photo = (url, caption) => { $('snapimg').src = url; $('snapsave').href = url; $('snapcap').textContent = caption; snap.hidden = false; snap.style.animation = 'none'; void snap.offsetWidth; snap.style.animation = ''; };
  $('snapclose').addEventListener('click', () => { snap.hidden = true; });
  U.setPhoto = v => root.classList.toggle('photo', v);

  /* ---------- Climber's log, remembered between visits ---------- */
  let log = { camps: [], routes: [], chalk: [], rings: [], rides: [], zip: false, migoi: false, kicked: 0, best: 0 };
  try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved && Array.isArray(saved.camps)) log = Object.assign(log, saved); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(log)); } catch (e) {} };
  U.log = log;
  U.mark = (kind, id) => {
    if (Array.isArray(log[kind])) { if (log[kind].includes(id)) return false; log[kind].push(id); } else { if (log[kind]) return false; log[kind] = true; }
    save(); renderLog(); return true;
  };
  U.best = t => { if (log.best && t >= log.best) return false; log.best = +t.toFixed(2); save(); renderLog(); return true; };
  U.kicked = n => { if (n > log.kicked) { log.kicked = n; save(); if (!$('log').hidden) renderLog(); } };
  function rows() {
    return [
      ['Camps reached', log.camps.length + ' of 5', log.camps.length >= 5],
      ['Ways of getting about', log.rides.length + ' of 4', log.rides.length >= 4],
      ['Rings flown through', log.rings.length + ' of ' + RING_TOTAL, log.rings.length >= RING_TOTAL],
      ['Routes climbed', log.routes.length + ' of ' + ROUTES.length, log.routes.length >= ROUTES.length],
      ['Chalk bags found', log.chalk.length + ' of ' + CHALK_TOTAL, log.chalk.length >= CHALK_TOTAL],
      ['Downhill run', log.best ? fmtTime(log.best) : 'Not yet', !!log.best],
      ['Zip line ridden', log.zip ? 'Yes' : 'Not yet', log.zip],
      [log.migoi ? 'Met the migoi' : 'Something lives up here', log.migoi ? 'Yes' : '?', log.migoi],
      ['Things knocked over', String(log.kicked), log.kicked > 0]
    ];
  }
  function renderLog() {
    $('chalk').textContent = log.chalk.length + '/' + CHALK_TOTAL;
    const ul = $('loglist'), r = rows(); ul.textContent = '';
    for (const [a, b, done] of r) { const li = document.createElement('li'); if (done) li.className = 'done'; li.append(a); const v = document.createElement('b'); v.textContent = b; li.append(v); ul.append(li); }
    const all = r.slice(0, 8).every(x => x[2]); $('lognote').textContent = all ? 'That is everything. Thank you for exploring.' : 'Chalk bags make your arms last longer on the rock.';
    return all;
  }
  U.complete = () => rows().slice(0, 8).every(x => x[2]);
  const logEl = $('log'), logBtn = $('logbtn');
  const setLog = v => { logEl.hidden = !v; logBtn.setAttribute('aria-expanded', String(v)); if (v) renderLog(); };
  logBtn.addEventListener('click', () => setLog(logEl.hidden)); $('logclose').addEventListener('click', () => setLog(false));
  $('logreset').addEventListener('click', () => { Object.assign(log, { camps: [], routes: [], chalk: [], rings: [], rides: [], zip: false, migoi: false, kicked: 0, best: 0 }); save(); renderLog(); on.resetLog(); });
  $('rescue').addEventListener('click', () => on.rescue());
  U.closeLog = () => setLog(false);
  renderLog();

  const soundBtn = $('sound');
  U.setSound = v => { soundBtn.setAttribute('aria-pressed', String(v)); $('soundtxt').textContent = v ? 'Sound on' : 'Sound off'; };
  soundBtn.addEventListener('click', () => on.mute());
  U.fade = fn => { root.classList.add('fade'); setTimeout(() => { fn(); setTimeout(() => root.classList.remove('fade'), 140); }, 240); };
  U.campName = id => NAMES[id];
  return U;
}
export function fmtTime(t) { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }

/* ---------- Input: keyboard, mouse, touch, gamepad ---------- */
export function createInput(canvas, on) {
  const I = { jump: false, lookX: 0, lookY: 0, zoom: 0, used: false };
  const keys = new Set(), MOVE = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const typing = e => e.target && e.target.closest && e.target.closest('.sheet, .log, .hero, .route, .hud, .snap');
  let space = false, shift = false;
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Escape') { on.escape(); return; }
    if (on.blocked()) return;
    if (MOVE[e.code]) { if (typing(e) && e.code.startsWith('Arrow')) return; e.preventDefault(); keys.add(e.code); I.used = true; on.any(); }
    else if (e.code === 'Space') { if (typing(e)) return; e.preventDefault(); space = true; if (!e.repeat) { I.jump = true; on.any(); } }
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') shift = true;
    else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'KeyF') { if (typing(e)) return; e.preventDefault(); if (!e.repeat) on.action(); }
    else if (e.code === 'KeyM') on.mute();
    else if (e.code === 'KeyT' && !e.repeat) on.time();
    else if (e.code === 'KeyP' && !e.repeat) on.photo();
    else if (e.code === 'KeyR' && !typing(e)) on.rescue();
  });
  addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Space') space = false; if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') shift = false; });
  addEventListener('blur', () => { keys.clear(); space = shift = false; });

  // Mouse: drag to look, wheel to zoom
  let drag = null;
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); on.any(); });
  canvas.addEventListener('pointermove', e => { if (!drag || e.pointerType === 'touch') return; I.lookX += e.clientX - drag.x; I.lookY += e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; });
  const end = e => { if (e.pointerType !== 'touch') drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => { I.zoom += Math.max(-1, Math.min(1, e.deltaY / 100)); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Touch: a finger on the left half is a joystick wherever it lands; a finger on the right half looks around
  const stick = document.getElementById('stick'), knob = stick.firstElementChild; let move = null, look = null, tx = 0, ty = 0, touchJump = false;
  canvas.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (!move && t.clientX < innerWidth * 0.5) { move = { id: t.identifier, x: t.clientX, y: t.clientY }; stick.style.left = t.clientX + 'px'; stick.style.top = t.clientY + 'px'; knob.style.transform = ''; stick.classList.add('on'); on.any(); }
      else if (!look) look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (move && t.identifier === move.id) { let dx = t.clientX - move.x, dy = t.clientY - move.y; const l = Math.hypot(dx, dy), m = 50; if (l > m) { dx *= m / l; dy *= m / l; } tx = dx / m; ty = -dy / m; knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; I.used = true; }
      else if (look && t.identifier === look.id) { I.lookX += (t.clientX - look.x) * 1.6; I.lookY += (t.clientY - look.y) * 1.4; look.x = t.clientX; look.y = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  const tend = e => { for (const t of e.changedTouches) { if (move && t.identifier === move.id) { move = null; tx = ty = 0; stick.classList.remove('on'); } else if (look && t.identifier === look.id) look = null; } };
  canvas.addEventListener('touchend', tend); canvas.addEventListener('touchcancel', tend);
  const jb = document.getElementById('jumpbtn');
  jb.addEventListener('pointerdown', e => { e.preventDefault(); I.jump = true; touchJump = true; on.any(); }); const jup = () => { touchJump = false; }; jb.addEventListener('pointerup', jup); jb.addEventListener('pointercancel', jup); jb.addEventListener('pointerleave', jup);
  I.jumpLabel = t => { if (jb.textContent !== t) jb.textContent = t; };

  let padJump = false, padAct = false, padHeld = false, padRun = false;
  I.read = () => {
    let x = tx, y = ty, sprint = shift || Math.hypot(tx, ty) > 0.93; padHeld = false; padRun = false;
    for (const k of keys) { x += MOVE[k][0]; y += MOVE[k][1]; }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of pads) {
      if (!g) continue; const ax = g.axes[0] || 0, ay = g.axes[1] || 0; if (Math.hypot(ax, ay) > 0.18) { x += ax; y -= ay; I.used = true; on.any(); }
      if (Math.abs(g.axes[2] || 0) > 0.18) I.lookX += g.axes[2] * 11; if (Math.abs(g.axes[3] || 0) > 0.18) I.lookY += g.axes[3] * 7;
      const j = g.buttons[0] && g.buttons[0].pressed, a = (g.buttons[2] && g.buttons[2].pressed) || (g.buttons[3] && g.buttons[3].pressed);
      if (j && !padJump) { I.jump = true; on.any(); } padJump = j; padHeld = j; if (a && !padAct) on.action(); padAct = a;
      padRun = (g.buttons[1] && g.buttons[1].pressed) || (g.buttons[7] && g.buttons[7].value > 0.3) || (g.buttons[10] && g.buttons[10].pressed); break;
    }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    const out = { x, y, jump: I.jump, jumpHeld: space || touchJump || padHeld, sprint: sprint || padRun, lookX: I.lookX, lookY: I.lookY, zoom: I.zoom };
    I.jump = false; I.lookX = I.lookY = I.zoom = 0; return out;
  };
  I.clear = () => { keys.clear(); tx = ty = 0; space = shift = false; };
  return I;
}
