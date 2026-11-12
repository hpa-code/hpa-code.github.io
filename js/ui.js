// Everything that is ordinary web page: panels, menus, the log, touch controls.
import { ROUTES } from './terrain.js';

const $ = id => document.getElementById(id), root = document.documentElement;
const KEY = 'hpa-climb-log-v1';
const NAMES = { teaching: 'Camp 1: Teaching', experience: 'Camp 2: Experience', projects: 'Camp 3: Projects', research: 'Camp 4: Research', contact: 'The summit' };
export const CHALK_TOTAL = 8;

export function readContent() {
  const out = {};
  for (const s of document.querySelectorAll('.sheet')) {
    out[s.id] = { title: s.querySelector('h2').textContent.trim(), blurb: s.querySelector('.blurb').textContent.trim(),
      items: [...s.querySelectorAll('.proj')].map(a => ({ title: a.querySelector('h3').textContent.trim(), chips: [...a.querySelectorAll('.chips span')].map(c => c.textContent).join(', ') })) };
  }
  out.contact.title = 'Contact';
  return out;
}

export function createUI(on) {
  const sheets = [...document.querySelectorAll('.sheet')], routeBtns = [...document.querySelectorAll('.route [data-go]')];
  const U = { openId: null, started: false };

  /* ---------- Panels ---------- */
  U.show = (id, item) => {
    U.openId = id; sheets.forEach(s => s.classList.toggle('open', s.id === id)); root.classList.add('panel');
    const sheet = $(id), body = sheet.querySelector('.body'); body.scrollTop = 0;
    if (item !== undefined) { const a = sheet.querySelectorAll('.proj')[item]; if (a) { body.scrollTop = a.offsetTop - 8; a.classList.remove('flash'); void a.offsetWidth; a.classList.add('flash'); } }
    sheet.querySelector('.x').focus({ preventScroll: true }); on.sound('open');
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  };
  U.hide = () => { if (!U.openId) return; U.openId = null; sheets.forEach(s => s.classList.remove('open')); root.classList.remove('panel'); $('world').focus({ preventScroll: true }); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} };
  sheets.forEach(s => s.querySelector('.x').addEventListener('click', U.hide));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => on.travel(b.dataset.go)));

  /* ---------- Plain version ---------- */
  const plainBtn = $('plainbtn');
  U.isPlain = () => root.classList.contains('plain');
  U.setPlain = v => {
    root.classList.toggle('plain', v); root.classList.toggle('climb', !v); plainBtn.textContent = v ? 'Climb the mountain' : 'Plain version';
    if (v) { U.hide(); scrollTo(0, 0); } on.plain(v);
  };
  plainBtn.addEventListener('click', () => U.setPlain(!U.isPlain()));
  $('readplain').addEventListener('click', () => U.setPlain(true));
  $('start').addEventListener('click', () => on.start());
  U.setStarted = () => { U.started = true; root.classList.add('started'); $('hint').classList.add('on'); setTimeout(() => $('hint').classList.remove('on'), 9000); };
  U.hideHint = () => $('hint').classList.remove('on');

  const copy = $('copy');
  if (copy) copy.addEventListener('click', () => {
    const ok = () => { copy.textContent = 'Copied'; }, no = () => { copy.textContent = 'Select the address above to copy it'; };
    if (navigator.clipboard) navigator.clipboard.writeText('hacharya@u.rochester.edu').then(ok, no); else no();
  });

  /* ---------- Prompt, toasts, gauges ---------- */
  const prompt = $('prompt'), promptTxt = $('prompttxt'); let promptText = null;
  U.prompt = text => { if (text === promptText) return; promptText = text; if (text) promptTxt.textContent = text; prompt.classList.toggle('on', !!text); prompt.tabIndex = text ? 0 : -1; };
  prompt.addEventListener('click', () => on.action());
  U.toast = (title, sub, ms = 3600) => {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = title; if (sub) { const s = document.createElement('small'); s.textContent = sub; t.append(s); }
    const box = $('toasts'); box.append(t); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, ms);
  };
  const stam = $('stam'), fg = $('stamfg'); let stamShown = false, lastFrac = -1;
  U.stamina = (frac, sx, sy, show) => {
    if (show !== stamShown) { stamShown = show; stam.classList.toggle('on', show); } if (!show) return;
    stam.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)';
    if (Math.abs(frac - lastFrac) > 0.004) { lastFrac = frac; fg.style.strokeDashoffset = (106.8 * (1 - frac)).toFixed(1); stam.classList.toggle('low', frac < 0.25); }
  };
  const alt = $('alt'); let lastAlt = '';
  U.altitude = y => { const s = (Math.round((2400 + y * 25) / 10) * 10).toLocaleString('en-US') + ' m'; if (s !== lastAlt) { lastAlt = s; alt.textContent = s; } };
  let lastKey;
  U.route = (here, y, camps) => {
    const key = here + '|' + camps.filter(c => y > c.y + 2).length; if (key === lastKey) return; lastKey = key;
    routeBtns.forEach(b => { const c = camps.find(c => c.id === b.dataset.go); b.classList.toggle('at', here === c.id); b.classList.toggle('past', y > c.y + 2); });
  };

  /* ---------- Climber's log, remembered between visits ---------- */
  let log = { camps: [], routes: [], chalk: [], zip: false, migoi: false, kicked: 0 };
  try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved && Array.isArray(saved.camps)) log = Object.assign(log, saved); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(log)); } catch (e) {} };
  U.log = log;
  U.mark = (kind, id) => {
    if (Array.isArray(log[kind])) { if (log[kind].includes(id)) return false; log[kind].push(id); } else { if (log[kind]) return false; log[kind] = true; }
    save(); renderLog(); return true;
  };
  U.kicked = n => { if (n > log.kicked) { log.kicked = n; save(); if (!$('log').hidden) renderLog(); } };
  function renderLog() {
    $('chalk').textContent = log.chalk.length + '/' + CHALK_TOTAL;
    const rows = [
      ['Camps reached', log.camps.length + ' of 5', log.camps.length >= 5],
      ['Routes climbed', log.routes.length + ' of ' + ROUTES.length, log.routes.length >= ROUTES.length],
      ['Chalk bags found', log.chalk.length + ' of ' + CHALK_TOTAL, log.chalk.length >= CHALK_TOTAL],
      ['Zip line ridden', log.zip ? 'Yes' : 'Not yet', log.zip],
      [log.migoi ? 'Met the migoi' : 'Something lives up here', log.migoi ? 'Yes' : '?', log.migoi],
      ['Things knocked over', String(log.kicked), log.kicked > 0]
    ];
    const ul = $('loglist'); ul.textContent = '';
    for (const [a, b, done] of rows) { const li = document.createElement('li'); if (done) li.className = 'done'; li.append(a); const v = document.createElement('b'); v.textContent = b; li.append(v); ul.append(li); }
    const all = rows.slice(0, 5).every(r => r[2]); $('lognote').textContent = all ? 'That is everything. Thank you for exploring.' : 'Chalk bags make your arms last longer on the rock.';
    return all;
  }
  U.complete = () => renderLog();
  const logEl = $('log'), logBtn = $('logbtn');
  const setLog = v => { logEl.hidden = !v; logBtn.setAttribute('aria-expanded', String(v)); if (v) renderLog(); };
  logBtn.addEventListener('click', () => setLog(logEl.hidden)); $('logclose').addEventListener('click', () => setLog(false));
  $('logreset').addEventListener('click', () => { log.camps = []; log.routes = []; log.chalk = []; log.zip = false; log.migoi = false; log.kicked = 0; save(); renderLog(); on.resetLog(); });
  $('rescue').addEventListener('click', () => on.rescue());
  U.closeLog = () => setLog(false);
  renderLog();

  const soundBtn = $('sound');
  U.setSound = v => { soundBtn.setAttribute('aria-pressed', String(v)); $('soundtxt').textContent = v ? 'Sound on' : 'Sound off'; };
  soundBtn.addEventListener('click', () => on.mute());

  U.fade = fn => { root.classList.add('fade'); setTimeout(() => { fn(); setTimeout(() => root.classList.remove('fade'), 120); }, 240); };
  U.campName = id => NAMES[id];
  return U;
}

/* ---------- Input: keyboard, mouse, touch, gamepad ---------- */
export function createInput(canvas, on) {
  const I = { x: 0, y: 0, jump: false, lookX: 0, lookY: 0, zoom: 0, used: false };
  const keys = new Set(), MOVE = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const typing = e => e.target && e.target.closest && e.target.closest('.sheet, .log, .hero, .route, .hud');
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Escape') { on.escape(); return; }
    if (on.blocked()) return;
    if (MOVE[e.code]) { if (typing(e) && e.code.startsWith('Arrow')) return; e.preventDefault(); keys.add(e.code); I.used = true; on.any(); }
    else if (e.code === 'Space') { if (typing(e)) return; e.preventDefault(); if (!e.repeat) { I.jump = true; on.any(); } }
    else if (e.code === 'Enter' || e.code === 'KeyE') { if (typing(e)) return; e.preventDefault(); if (!e.repeat) on.action(); }
    else if (e.code === 'KeyM') on.mute();
    else if (e.code === 'KeyR' && !typing(e)) on.rescue();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // Mouse: drag to look, wheel to zoom
  let drag = null;
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!drag || e.pointerType === 'touch') return; I.lookX += e.clientX - drag.x; I.lookY += e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; });
  const end = e => { if (e.pointerType !== 'touch') drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => { I.zoom += Math.max(-1, Math.min(1, e.deltaY / 100)); e.preventDefault(); }, { passive: false });

  // Touch: the first finger is a joystick wherever it lands; a second finger looks around
  const stick = document.getElementById('stick'), knob = stick.firstElementChild; let move = null, look = null, tx = 0, ty = 0;
  canvas.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (!move) { move = { id: t.identifier, x: t.clientX, y: t.clientY }; stick.style.left = t.clientX + 'px'; stick.style.top = t.clientY + 'px'; knob.style.transform = ''; stick.classList.add('on'); on.any(); }
      else if (!look) look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (move && t.identifier === move.id) { let dx = t.clientX - move.x, dy = t.clientY - move.y; const l = Math.hypot(dx, dy), m = 46; if (l > m) { dx *= m / l; dy *= m / l; } tx = dx / m; ty = -dy / m; knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; I.used = true; }
      else if (look && t.identifier === look.id) { I.lookX += t.clientX - look.x; I.lookY += t.clientY - look.y; look.x = t.clientX; look.y = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  const tend = e => { for (const t of e.changedTouches) { if (move && t.identifier === move.id) { move = null; tx = ty = 0; stick.classList.remove('on'); } else if (look && t.identifier === look.id) look = null; } };
  canvas.addEventListener('touchend', tend); canvas.addEventListener('touchcancel', tend);
  const jb = document.getElementById('jumpbtn'); jb.addEventListener('pointerdown', e => { e.preventDefault(); I.jump = true; on.any(); });

  let padJump = false, padAct = false;
  I.read = () => {
    let x = tx, y = ty;
    for (const k of keys) { x += MOVE[k][0]; y += MOVE[k][1]; }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of pads) {
      if (!g) continue; const ax = g.axes[0] || 0, ay = g.axes[1] || 0; if (Math.hypot(ax, ay) > 0.2) { x += ax; y -= ay; I.used = true; on.any(); }
      if (Math.abs(g.axes[2] || 0) > 0.2) I.lookX += g.axes[2] * 9; if (Math.abs(g.axes[3] || 0) > 0.2) I.lookY += g.axes[3] * 6;
      const j = g.buttons[0] && g.buttons[0].pressed, a = g.buttons[2] && g.buttons[2].pressed;
      if (j && !padJump) { I.jump = true; on.any(); } padJump = j; if (a && !padAct) on.action(); padAct = a; break;
    }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    I.x = x; I.y = y; const out = { x, y, jump: I.jump, lookX: I.lookX, lookY: I.lookY, zoom: I.zoom };
    I.jump = false; I.lookX = I.lookY = I.zoom = 0; return out;
  };
  I.clear = () => { keys.clear(); tx = ty = 0; };
  return I;
}
