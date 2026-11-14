// Hari Acharya's site: a mountain you explore yourself. This file wires the pieces together and runs the loop.
import * as THREE from 'three';
import * as T from './terrain.js';
import { createEnv } from './env.js';
import { createGround } from './ground.js';
import { buildScene, seeU } from './scene.js';
import { createPlayer, stepPlayer, placePlayer, mount, dismount, P } from './player.js';
import { createClimber } from './character.js';
import { createFollowCamera } from './camera.js';
import { createFX } from './fx.js';
import { makeBike, makeSled, makeGlider, parkVehicle, rideVehicle, updateGlider } from './vehicles.js';
import { createAudio } from './audio.js';
import { createUI, createInput, readContent, CHALK_TOTAL, RING_TOTAL, altText, fmtTime } from './ui.js';
import { FLAGS } from './kit.js';

const root = document.documentElement, canvas = document.getElementById('world');
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const query = new URLSearchParams(location.search);
const DUST = { grass: [0xb9b28a, 0x9aa878], dirt: [0xc9aa82, 0xb08e66], snow: [0xffffff, 0xeaf2fb], wood: [0xc9aa82], water: [0xd8f2ff, 0xffffff] };
const RIDE_NAME = { bike: 'the bike', sled: 'the snowmobile' };

function plainOnly() { root.className = 'plain nogl'; }
const paint = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

async function boot() {
  if (!root.classList.contains('climb')) { plainOnly(); return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); } catch (e) { plainOnly(); return; }
  if (!renderer.capabilities.isWebGL2) { plainOnly(); return; }
  if (document.fonts) await Promise.race([Promise.all(['700 56px Archivo', '400 60px "Fredericka the Great"', '700 40px Caveat', '700 40px "JetBrains Mono"'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 1800))]).catch(() => {});

  /* ---------- How much to draw: phones get a lighter mountain, and any device that struggles sheds detail as it goes ---------- */
  const phone = matchMedia('(hover: none), (max-width: 760px)').matches, fixed = query.get('q');
  const Q = phone || fixed === 'low'
    ? { grass: 20000, trees: 300, rocks: 180, clouds: 10, birds: 5, bloom: true, msaa: 0, particles: 320, snow: 500, shadow: 1024 }
    : { grass: 64000, trees: 540, rocks: 320, clouds: 18, birds: 8, bloom: true, msaa: fixed === 'test' ? 0 : 4, particles: 700, snow: 1000, shadow: 2048 };
  let pr = Math.min(devicePixelRatio || 1, phone ? 1.5 : 1.6); renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(46, 1, 0.25, 6000);
  const audio = createAudio();
  let ui, input, started = false;
  ui = createUI({
    start: () => start(), travel: id => travel(id), action: () => action(), rescue: () => rescue(),
    plain: v => { if (!v) { size(); canvas.focus({ preventScroll: true }); } },
    mute: () => toggleSound(), sound: name => audio[name] && audio[name](), time: () => nextTime(), photo: () => photo(),
    resetLog: () => resetLog()
  });
  ui.loading(0.15, 'Raising the mountain…'); await paint();
  const env = createEnv(scene, renderer); env.sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  const ground = createGround(scene, env, Q);
  ui.loading(0.5, 'Planting the forest…'); await paint();
  const W = buildScene(scene, env, ground, readContent(), Q);
  ui.loading(0.8, 'Pitching the camps…'); await paint();
  const fx = createFX(renderer, scene, camera, env, Q);
  fx.addThermals(W.thermals);
  { // Fireflies over the meadow and the lake shore, for after dark
    const spots = []; let s = 99; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 260; i++) { const a = r() * 6.283, d = 150 + r() * 70, x = Math.cos(a) * d, z = Math.sin(a) * d; spots.push([x, Math.max(T.sample(x, z), T.LAKE.level) + 0.6 + r() * 2.2, z]); }
    for (const c of T.CAMPS) for (let i = 0; i < 14; i++) { const a = r() * 6.283, d = 4 + r() * 12; spots.push([c.x + Math.cos(a) * d, c.y + 0.7 + r() * 2.4, c.z + Math.sin(a) * d]); }
    fx.addFireflies(spots);
  }

  /* ---------- You, and what you can ride ---------- */
  const base = T.camp('base'), spawnYaw = Math.atan2(-base.out.x, -base.out.z);
  const p = createPlayer(base.x, base.z); p.yawWant = spawnYaw; p.head = spawnYaw;
  const climber = createClimber(scene); climber.yaw = spawnYaw;
  const cam = createFollowCamera(); cam.yaw = spawnYaw;
  const BIKES = [0x1f8a8a, 0xf2a900, 0x8a1f2b, 0x2f72cf], SLEDS = [0xd2332d, 0x1f8a8a, 0xf2a900];
  const rides = W.spawns.map((s, i) => { const v = s.kind === 'bike' ? makeBike(BIKES[i % BIKES.length]) : makeSled(SLEDS[i % SLEDS.length]); scene.add(v.g); parkVehicle(v, s.x, s.z, s.yaw); v.home = s; return v; });
  const glider = makeGlider(); scene.add(glider.g);
  let sit = null, ride = null, zip = null, wingWanted = 0, near = null, here = null, track = null, run = null, time = 0, introK = 1, still = 0;
  let boundTold = false, pumpedAt = -9, allDone = false, liftTold = false, emberT = 0, sprayT = 0, wasMode = 'walk', lastHere = null, tip = 0;

  input = createInput(canvas, {
    blocked: () => ui.isPlain(), any: () => { if (!started && !ui.isPlain()) start(); audio.start(); }, action: () => action(),
    mute: () => toggleSound(), time: () => nextTime(), photo: () => photo(), rescue: () => rescue(),
    escape: () => { if (ui.openId) ui.hide(); else ui.closeLog(); }
  });
  // The kit bar: on foot, bike, snowmobile, wing. Keys 1 to 4 do the same.
  const kitBtns = [...document.querySelectorAll('[data-kit]')];
  kitBtns.forEach(b => b.addEventListener('click', () => { kit(b.dataset.kit); canvas.focus({ preventScroll: true }); }));
  addEventListener('keydown', e => { if (e.metaKey || e.ctrlKey || e.altKey || ui.isPlain() || ui.openId || !started) return; const k = { Digit1: 'walk', Digit2: 'bike', Digit3: 'sled', Digit4: 'wing', KeyG: 'wing', KeyB: 'bike', KeyN: 'sled' }[e.code]; if (k && !e.repeat) kit(k); });

  try { if (localStorage.getItem('hpa-climb-sound') === '0') { audio.setOn(false); ui.setSound(false); } } catch (e) {}
  // What you found on an earlier visit stays found
  for (const k of W.pickups) if (ui.log.chalk.includes(k.i)) { k.got = true; k.g.visible = false; p.max += 0.9; } p.stamina = p.max;
  for (const r of W.rings) if (ui.log.rings.includes(r.i)) { r.got = true; r.m.visible = false; }

  function toggleSound() { const v = !audio.isOn(); audio.setOn(v); ui.setSound(v); try { localStorage.setItem('hpa-climb-sound', v ? '1' : '0'); } catch (e) {} }
  function nextTime() { const name = env.cycle(); ui.setTime(name); if (started && !sit) ui.toast(name, name === 'Night' ? 'The lamps are lit. Look up.' : null, 2200); }
  function start() { if (started) return; started = true; ui.setStarted(); ui.mark('rides', 'walk'); audio.start(); canvas.focus({ preventScroll: true }); setTimeout(() => { if (!ui.openId) ui.modeHint('walk'); }, 2600); }
  function resetLog() { W.pickups.forEach(k => { k.got = false; k.g.visible = true; }); W.rings.forEach(r => { r.got = false; r.m.visible = true; }); p.max = P.stamina; allDone = false; }

  /* ---------- Getting on and off things ---------- */
  function getOn(v) {
    if (ride) getOff(); if (zip) return;
    ride = v; p.x = v.x; p.z = v.z; p.y = T.floorAt(v.x, v.z, v.y + 1).h; mount(p, v.kind, v.yaw); cam.manual = 9; audio.mount(v.kind);
    if (ui.mark('rides', v.kind)) ui.toast(v.kind === 'bike' ? 'Mountain bike' : 'Snowmobile', v.kind === 'bike' ? 'Quick on the trail. Space hops.' : 'Fastest on snow. The far side of the mountain is one long run down.', 4600);
  }
  function getOff() { if (!ride) return; const v = ride; ride = null; const y = p.rideAir ? T.sample(p.x, p.z) : p.y; dismount(p); parkVehicle(v, v.x, v.z, v.yaw, y); run = null; ui.timer(false, 0); }
  function kit(kind) {
    if (!started || ui.openId || zip) return;
    if (kind === 'walk') { if (ride) getOff(); else if (p.mode === 'glide') wingWanted = -1; return; }
    if (kind === 'wing') { if (ride) getOff(); wingWanted = p.mode === 'glide' ? -1 : 1; return; }
    if (ride && ride.kind === kind) { getOff(); return; }
    if (p.mode !== 'walk' && !ride) { ui.toast('Find your feet first', 'You can call for a ride from the ground.', 2400); return; }
    // Whistle: the nearest one of its kind is brought to where you stand
    let best = null, bd = 1e9; for (const v of rides) if (v.kind === kind && v !== ride) { const d = Math.hypot(v.x - p.x, v.z - p.z); if (d < bd) { bd = d; best = v; } }
    if (!best) return; if (ride) getOff();
    const yaw = climber.yaw; if (bd > 3) { fx.emit(best.x, best.y + 0.6, best.z, { n: 10, spread: 0.6, up: 1.5, rand: 1.2, life: 0.7, size: 0.5, color: 0xffffff, alpha: 0.5, g: -0.5 }); parkVehicle(best, p.x, p.z, yaw); fx.emit(p.x, p.y + 0.6, p.z, { n: 14, spread: 0.8, up: 1.6, rand: 1.4, life: 0.7, size: 0.5, color: 0xffffff, alpha: 0.5, g: -0.5 }); audio.whistle(); }
    getOn(best);
  }
  function travel(id) {
    if (ui.isPlain()) return; const c = T.camp(id); start(); ui.closeLog();
    ui.fade(() => {
      if (ride) getOff(); zip = null; run = null; ui.timer(false, 0);
      const u = id === 'contact' ? 0.5 : id === 'base' ? 0 : -1.5; placePlayer(p, c.x + c.out.x * u, c.z + c.out.z * u);
      const yaw = id === 'base' ? spawnYaw : Math.atan2(c.out.x, c.out.z); p.yawWant = yaw; climber.yaw = yaw; cam.yaw = yaw; cam.pitch = 0.3; cam.snap = true; introK = 0; input.clear(); here = id; lastHere = id; ui.mark('camps', id);
      if (id === 'base') { ui.hide(); canvas.focus({ preventScroll: true }); } else ui.show(id);
    });
  }
  // If you ever get wedged somewhere, this puts you back on the nearest bit of trail
  function rescue() { if (!started || zip || ui.openId) return; if (ride) getOff(); const t = T.nearestTrail(p.x, p.z); placePlayer(p, t.x, t.z); cam.snap = true; ui.closeLog(); canvas.focus({ preventScroll: true }); }
  function action() {
    if (!started || ui.openId || zip) return;
    if (ride) { getOff(); audio.mount('off'); return; }
    if (!near) return;
    if (near.ride) { getOn(near.ride); return; }
    if (near.sit) { const dx = p.x - near.x, dz = p.z - near.z, l = Math.hypot(dx, dz) || 1; p.x = near.x + dx / l * 1.45; p.z = near.z + dz / l * 1.45; p.y = T.floorAt(p.x, p.z, p.y + 0.5).h; p.vx = p.vz = 0; p.yawWant = Math.atan2(-dx, -dz); sit = { t: 0 }; ui.prompt(null); ui.toast('Resting by the fire', 'The light changes while you sit. Move to get up.', 3600); return; }
    if (near.zip) { zip = { t: 0.01, v: 6 }; p.mode = 'air'; ui.prompt(null); audio.jump(); return; }
    ui.show(near.open, near.item);
  }
  function photo() {
    if (!started || ui.isPlain()) return;
    ui.flash(); audio.shutter(); fx.render(0, time, 0);
    let url = null; try { url = renderer.domElement.toDataURL('image/jpeg', 0.92); } catch (e) {}
    if (url) ui.photo(url, (here ? ui.campName(here) : 'On the mountain') + ' · ' + altText(p.y));
  }

  /* ---------- Camera and view ---------- */
  const introP = new THREE.Vector3(), introL = new THREE.Vector3(), v3 = new THREE.Vector3(), focus = new THREE.Vector3(), lookV = new THREE.Vector3(), fwd = { x: 0, z: 1 };
  let viewW = 1, viewH = 1; const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size() { viewW = innerWidth; viewH = innerHeight; renderer.setPixelRatio(pr); renderer.setSize(viewW, viewH, false); fx.resize(viewW, viewH, pr); camera.aspect = viewW / viewH; camera.updateProjectionMatrix(); }
  addEventListener('resize', size); size();

  const inp = { mx: 0, mz: 0, ix: 0, iy: 0, rx: 1, rz: 0, jump: false, jumpHeld: false, sprint: false }, look = { lookX: 0, lookY: 0, zoom: 0 }, st = { started: false, intro: 1, here: null, photo: false, bell: () => audio.bell() }, cst = { wave: false };
  const puff = (n, surf, spread = 0.5, up = 1.4, size = 0.34, x = p.x, y = p.y, z = p.z) => fx.emit(x, y + 0.12, z, { n, spread, up, rand: 1.1, life: 0.7, size, grow: 1.6, color: DUST[surf] || DUST.grass, alpha: surf === 'snow' ? 0.8 : 0.5, g: surf === 'snow' ? 2.4 : 0.6, drag: 2.2 });

  function step(dt) {
    time += dt;
    const raw = input.read(), frozen = !started || !!ui.openId || ui.isPlain();
    if (started) introK = Math.max(0, introK - dt / 2.6);
    const mode = zip ? 'zip' : p.mode;

    /* ----- What the stick means: on foot it is relative to the camera, on a ride it is throttle and steering ----- */
    cam.forward(fwd); inp.rx = -fwd.z; inp.rz = fwd.x;
    inp.ix = frozen ? 0 : raw.x; inp.iy = frozen ? 0 : raw.y; inp.mx = fwd.x * inp.iy + inp.rx * inp.ix; inp.mz = fwd.z * inp.iy + inp.rz * inp.ix;
    inp.jump = !frozen && raw.jump; inp.jumpHeld = raw.jumpHeld || wingWanted > 0; inp.sprint = !frozen && raw.sprint;
    if (sit) { if (Math.hypot(raw.x, raw.y) > 0.3 || raw.jump || ride || zip || p.mode !== 'walk') sit = null; else { sit.t += dt; inp.ix = inp.iy = inp.mx = inp.mz = 0; inp.jump = false; if (!sit.done && sit.t > 1.8) { sit.done = true; nextTime(); } } }
    // The wing button: jump if you are standing, open as soon as there is air under you
    if (wingWanted > 0) { if (p.mode === 'walk') inp.jump = true; else if (p.mode === 'air' && p.air > 0.16) { inp.jump = true; if (p.air > 1.2) wingWanted = 0; } else if (p.mode === 'glide') wingWanted = 0; else if (p.mode !== 'air') wingWanted = 0; }
    else if (wingWanted < 0) { if (p.mode === 'glide') inp.jump = true; wingWanted = 0; }
    p.pedal = inp.iy > 0.05;

    if (zip) {
      zip.v = Math.min(24, zip.v + 11 * dt); zip.t += zip.v * dt / W.zip.len; v3.copy(W.zip.A).lerp(W.zip.B, Math.min(1, zip.t));
      const idt = 1 / Math.max(dt, 1e-3); p.vx = (v3.x - p.x) * idt; p.vz = (v3.z - p.z) * idt; p.speed = zip.v; p.x = v3.x; p.y = v3.y; p.z = v3.z; p.head = p.yawWant = Math.atan2(W.zip.B.x - W.zip.A.x, W.zip.B.z - W.zip.A.z); p.mode = 'air'; p.air = 0; p.events.length = 0;
      if (zip.t >= 1) { v3.copy(W.zip.B).sub(W.zip.A).normalize(); p.y -= 2.3; p.vx = v3.x * 6; p.vz = v3.z * 6; p.vy = 0; p.fall = p.y; p.jumped = false; zip = null; if (ui.mark('zip')) ui.toast('Zip line ridden', 'Summit to base camp in a few seconds.'); }
    } else stepPlayer(p, inp, dt, W);

    /* ----- What just happened: sound, dust, a jolt of the camera ----- */
    const surf = p.surface || 'grass';
    for (const e of p.events) {
      if (e.type === 'jump') audio.jump();
      else if (e.type === 'hop') { audio.jump(); puff(4, surf); }
      else if (e.type === 'leap') { audio.leap(); fx.emit(p.x, p.y + 1.3, p.z, { n: 6, spread: 0.3, up: 0.6, rand: 0.8, life: 0.6, size: 0.26, color: 0xffffff, alpha: 0.6, g: 0.5 }); }
      else if (e.type === 'land') { audio.land(e.hard, surf); if (e.drop > 1.2 || e.ride) puff(e.hard ? 16 : e.ride ? 9 : 5, surf, e.hard ? 1.0 : 0.6, e.hard ? 2.4 : 1.4, e.hard ? 0.5 : 0.36); if (e.hard || (e.ride && e.air > 0.7)) cam.shake = Math.min(1, 0.35 + (e.drop || 0) * 0.04); if (e.ride && e.air > 1.1) ui.toast('Air time ' + e.air.toFixed(1) + ' s', null, 1800); }
      else if (e.type === 'splash') { audio.splash(); fx.emit(p.x, T.LAKE.level + 0.1, p.z, { n: 18, spread: 0.7, up: 4.5, rand: 2.2, life: 0.8, size: 0.3, color: DUST.water, alpha: 0.8, g: 9, drag: 0.6 }); }
      else if (e.type === 'pumped' && time - pumpedAt > 6) { pumpedAt = time; audio.pumped(); ui.toast('Out of strength', 'Rest on flat ground and it comes back.'); }
      else if (e.type === 'glideOpen') { audio.wing(true); if (ui.mark('rides', 'wing')) ui.toast('Paraglider', 'A and D steer. The pale columns of rising air carry you up.', 5200); }
      else if (e.type === 'glideClose') audio.wing(false);
      else if (e.type === 'bump') { audio.thud(Math.min(1, e.v / 14)); cam.shake = Math.min(0.8, e.v / 22); }
      else if (e.type === 'bound' && !boundTold) { boundTold = true; ui.toast('The valley ends here', 'The mountain is the other way.'); }
    }
    if (p.mode === 'slide' && Math.random() < dt * 22) puff(1, surf, 0.3, 0.8);
    if (ride && !p.rideAir) {
      const sp = Math.abs(p.v); sprayT -= dt * sp;
      if (sprayT < 0 && sp > 3) {
        sprayT = ride.kind === 'sled' ? 0.9 : 2.2; const bx = p.x - Math.sin(p.head) * (ride.kind === 'sled' ? 1.3 : 0.55), bz = p.z - Math.cos(p.head) * (ride.kind === 'sled' ? 1.3 : 0.55), hard = Math.abs(p.steer) * sp > 9;
        if (surf === 'snow') fx.emit(bx, p.y + 0.15, bz, { n: ride.kind === 'sled' ? (hard ? 5 : 3) : 1, spread: 0.4, vel: [-Math.sin(p.head) * sp * 0.25, 0, -Math.cos(p.head) * sp * 0.25], up: 1.6 + sp * 0.08, rand: 1.6, life: 0.75, size: 0.42, grow: 1.8, color: DUST.snow, alpha: 0.85, g: 4, drag: 1.4 });
        else if (surf !== 'wood') puff(1, surf, 0.25, 0.9, 0.3, bx, p.y, bz);
      }
    }
    if (p.mode === 'glide' && p.gv > 14.5 && Math.random() < dt * 30) for (const s of [-1, 1]) fx.emit(p.x + Math.cos(p.head) * s * 4.4, p.y + 5.2, p.z - Math.sin(p.head) * s * 4.4, { n: 1, life: 0.5, size: 0.16, grow: 0.4, color: 0xffffff, alpha: 0.35, g: 0, drag: 0.5 });

    /* ----- The figure, the ride under it, the wing over it ----- */
    if (ride) rideVehicle(ride, p, dt);
    still = p.speed < 0.3 && p.mode === 'walk' ? still + dt : 0; cst.wave = here === 'contact' && still > 0.6 && !ui.openId;
    const seat = ride ? { obj: ride.g, pose: ride.kind, crank: ride.crankA } : zip ? { pose: 'zip' } : sit ? { pose: 'sit' } : null;
    const cue = climber.update(p, dt, cst, seat);
    if (cue === 'step') { audio.step(surf); if (p.sprinting && surf !== 'wood') puff(1, surf, 0.15, 0.7, 0.22); } else if (cue === 'grip') audio.grip();
    updateGlider(glider, p, dt);
    if (phys) { phys.step(dt, p, !!zip, ride ? 1.1 : 0.55); ui.kicked(phys.kicked); }

    /* ----- Where am I, and what is within reach? ----- */
    let now = null; for (const c of T.CAMPS) if (Math.hypot(p.x - c.x, p.z - c.z) < T.CAMP_R[c.id] + 1.5 && Math.abs(p.y - c.y) < 4) now = c.id;
    if (now !== here) {
      here = now;
      if (here && here !== lastHere && started && !frozen) {
        lastHere = here; const first = ui.mark('camps', here);
        if (here !== 'base') { ui.titleCard(here, T.camp(here).y); if (here === 'contact') { audio.fanfare(); if (first) confetti(); } else audio.bowl(); }
      }
      if (!here) lastHere = null;
    }
    ui.route(here, p.y, T.CAMPS); ui.altitude(p.y);
    ui.where(here ? ui.campName(here) : mode === 'glide' ? 'In the air' : run ? 'The glacier run' : p.surface === 'snow' ? 'The snowfields' : T.trailDist(p.x, p.z) < 4 ? 'On the trail' : p.water ? 'The lake' : T.tOf(p.x, p.z) > 1.02 ? 'The valley' : 'Off the trail');
    near = null; let best = 1e9;
    if (!frozen && !zip && !ride && !sit && (p.mode === 'walk')) {
      for (const it of W.interact) { const d = Math.hypot(p.x - it.x, p.z - it.z); if (d < it.r && d < best && Math.abs(p.y - it.y) < 4) { best = d; near = it; } }
      for (const v of rides) { const d = Math.hypot(p.x - v.x, p.z - v.z); if (d < 2.6 && d < best && Math.abs(p.y - v.y) < 3) { best = d; near = { ride: v, text: 'Ride ' + RIDE_NAME[v.kind] }; } }
    }
    ui.prompt(near ? near.text : null);
    input.jumpLabel(ride ? 'Hop' : mode === 'glide' ? 'Fold' : mode === 'air' ? 'Wing' : mode === 'climb' ? 'Leap' : 'Jump');
    if (mode !== wasMode) { wasMode = mode; if (started && !frozen) ui.modeHint(mode === 'air' || mode === 'slide' || mode === 'zip' ? null : mode); kitBtns.forEach(b => b.classList.toggle('on', b.dataset.kit === (mode === 'glide' ? 'wing' : ride ? ride.kind : 'walk'))); }

    // Marked routes
    if (p.mode === 'climb' && p.route) { if (!track || track.R !== p.route) track = { R: p.route, y0: p.y }; track.t = time; }
    if (track && p.mode === 'walk') {
      if (p.y > track.y0 + 6 && Math.hypot(p.x - track.R.top.x, p.z - track.R.top.z) < 6) { if (ui.mark('routes', track.R.name)) { audio.pickup(); ui.toast('Route climbed: ' + track.R.name, 'Graded ' + track.R.grade + '. Holds are easier on the arms than bare rock.', 4200, true); } track = null; }
      else if (time - track.t > 3) track = null;
    }
    // Chalk bags and sky rings
    if (started) for (const k of W.pickups) if (!k.got && Math.hypot(p.x - k.x, p.y + 1 - k.y, p.z - k.z) < 1.9) { k.got = true; k.g.visible = false; p.max += 0.9; p.stamina = p.max; ui.mark('chalk', k.i); audio.pickup(); fx.emit(k.x, k.y, k.z, { n: 14, spread: 0.3, up: 2, rand: 2.4, life: 0.8, size: 0.2, color: 0xffe08a, bright: 2, alpha: 0.9, g: 2 }); ui.toast('Chalk bag ' + ui.log.chalk.length + ' of ' + CHALK_TOTAL, 'Your arms last a little longer.', 3200, true); }
    if (started) for (const r of W.rings) if (!r.got && Math.hypot(p.x - r.x, p.y + 1.2 - r.y, p.z - r.z) < 3.5) { r.got = true; r.m.visible = false; ui.mark('rings', r.i); audio.ring(ui.log.rings.length); fx.emit(r.x, r.y, r.z, { n: 26, spread: 2.6, spreadY: 2.6, rand: 5, life: 0.9, size: 0.26, color: 0xffc629, bright: 2.4, alpha: 0.9, g: 1 }); ui.toast('Ring ' + ui.log.rings.length + ' of ' + RING_TOTAL, ui.log.rings.length >= RING_TOTAL ? 'Every ring. That was the whole line down.' : null, 2400, true); }
    // The glacier run, timed from the summit to the valley floor
    if (ride && ride.kind === 'sled') {
      const rr = Math.hypot(p.x, p.z), lat = Math.abs(T.wrap(Math.atan2(p.z, p.x) - W.run.a)) * rr;
      if (!run && lat < 7.5 && rr > W.run.rs && rr < W.run.rs + 7 && p.v > 2) { run = { t: 0 }; audio.bell(); ui.toast('The glacier run', 'Hold the throttle. The clock stops at the finish arch.', 3000); }
      if (run && rr < W.run.rs - 6) { run = null; ui.timer(false, 0); }
      if (run) { run.t += dt; ui.timer(true, run.t); if (rr > W.run.rf) { const rec = ui.best(run.t); audio.fanfare(); ui.toast('Run finished in ' + fmtTime(run.t), rec ? 'A new best.' : 'Best: ' + fmtTime(ui.log.best), 5000, true); const t = run.t; run = null; setTimeout(() => ui.timer(false, t), 2600); } }
    }
    // Thermals: say so the first time one takes hold
    if (p.mode === 'glide' && p.lift > 2 && !liftTold) { liftTold = true; ui.toast('That is a thermal', 'Circle inside it and it will carry you over the summit.', 4600); }
    const mg = W.migoi; if (started && Math.hypot(p.x - mg.x, p.z - mg.z) < 9 && Math.abs(p.y - mg.y) < 5 && ui.mark('migoi')) { audio.bell(); ui.toast('You met the migoi', 'It would rather you kept this between yourselves.', 6000, true); }
    if (!allDone && ui.complete()) { allDone = true; if (started && time > 3) { audio.fanfare(); confetti(); ui.toast('The log is full', 'Every camp, ride, ring, route and secret. Thank you for exploring.', 8000, true); } }
    // A nudge, once, if someone is still walking a long way up
    if (started && !tip && time > 75 && ui.log.rides.length === 0 && !frozen) { tip = 1; ui.toast('There are quicker ways up', 'Press 2 for a bike, or 4 to open the paraglider.', 6000); }

    /* ----- Camera ----- */
    look.lookX = raw.lookX; look.lookY = raw.lookY; look.zoom = raw.zoom; cam.update(dt, p, look, mode, frozen);
    const tall = viewW < viewH, ia = T.A0 + 0.42 + (calm ? 0 : time * 0.028), ir = tall ? 430 : 345; introP.set(Math.cos(ia) * ir, tall ? 120 : 84, Math.sin(ia) * ir); introL.set(0, tall ? 62 : 44, 0);
    const k = introK * introK * (3 - 2 * introK);
    camera.position.copy(cam.pos).lerp(introP, k); lookV.copy(cam.look).lerp(introL, k); camera.lookAt(lookV);
    const fov = (tall ? 58 : 46) + cam.fov * (1 - k); if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const wide = viewW > 900 && !tall;
    if (wide && k > 0.001) camera.setViewOffset(viewW, viewH, -viewW * 0.13 * k, viewH * 0.02 * k, viewW, viewH); else if (camera.view) camera.clearViewOffset();

    /* ----- The world ----- */
    focus.set(p.x, p.y, p.z); if (k > 0.5) focus.set(0, 40, 0);
    env.update(dt, time, focus); env.follow(camera); renderer.toneMappingExposure = env.exposure;
    v3.set(p.x, p.y, p.z); ground.update(time, camera, k > 0.5 ? camera.position : v3);
    st.started = started; st.intro = k; st.here = here; W.update(dt, time, p, camera, st);
    const snowAmt = clamp((camera.position.y - 52) / 22, 0, 1) * (1 - k) * 0.9; fx.update(dt, time, camera, snowAmt, viewH);
    if (fx.thermalShow) fx.thermalShow.value = damp(fx.thermalShow.value, (mode === 'glide' || mode === 'air' || k > 0.2 ? 1 : 0.3) * (1 - env.night * 0.65), 3, dt);
    // Embers from whichever fire is close
    emberT -= dt; if (emberT < 0) { emberT = 0.07; for (const f of W.fires) if (Math.abs(f.x - p.x) < 30 && Math.abs(f.z - p.z) < 30) fx.emit(f.x, f.y - 0.1, f.z, { n: 1, spread: 0.15, up: 1.6, rand: 0.5, life: 1.5, size: 0.07, grow: 0, color: [0xffb347, 0xff7a1a], bright: 3, alpha: 1, g: -1.1, drag: 0.4 }); }

    v3.set(p.x, p.y + 1.1, p.z).project(camera); seeU.uSee.value.set(v3.x, v3.y, k > 0.01 ? -1 : v3.z * 0.5 + 0.5 - 0.0003); renderer.getDrawingBufferSize(seeU.uRes.value);
    // Gauges
    const showSt = started && !frozen && !ride && mode !== 'glide' && (p.stamina < p.max - 0.02 || p.mode === 'climb');
    if (showSt) { v3.set(p.x, p.y + 1.75, p.z).project(camera); ui.stamina(p.stamina / p.max, (v3.x * 0.5 + 0.5) * viewW + 46, (-v3.y * 0.5 + 0.5) * viewH, true); } else ui.stamina(0, 0, 0, false);
    if (frozen) ui.gauge(null); else if (ride) ui.gauge('speed', p.v, Math.abs(p.v) / P[ride.kind].top); else if (mode === 'glide') ui.gauge('vario', p.vy, 0.5 + p.vy / 14); else ui.gauge(null);

    let fire = 0; for (const f of W.fires) fire = Math.max(fire, 1 - Math.hypot(f.x - p.x, f.z - p.z) / 9);
    const sdist = T.inGorge(p.x, p.z, 16) ? Math.abs(T.wrap(Math.atan2(p.z, p.x) - T.GORGE)) * Math.hypot(p.x, p.z) : 99, lake = 1 - (Math.hypot(p.x - T.LAKE.x, p.z - T.LAKE.z) - T.LAKE.r) / 30;
    audio.ambient({ height: clamp(p.y / T.SUMMIT_Y, 0, 1), speed: p.speed, water: clamp(Math.max(1 - sdist / 22, lake * 0.5), 0, 1), mode: zip ? 'zip' : ride ? ride.kind : mode, v: Math.abs(p.v || 0), throttle: Math.abs(inp.iy), air: !!p.rideAir, lift: p.lift || 0, night: env.night, fire: clamp(fire, 0, 1), quiet: frozen && started ? 0.5 : 1, dt });
  }
  function confetti() { for (let i = 0; i < 5; i++) setTimeout(() => fx.emit(p.x + (Math.random() - 0.5) * 5, p.y + 3 + Math.random() * 2, p.z + (Math.random() - 0.5) * 5, { n: 34, spread: 0.8, up: 6, rand: 6, life: 2.2, size: 0.2, grow: 0, color: FLAGS, bright: 1.4, alpha: 1, g: 5, drag: 1.3 }), i * 260); }

  /* ---------- Loop: if a device struggles, trade sharpness and detail for smoothness ---------- */
  let phys = null, last = performance.now(), frames = 0, slowMs = 0, tiers = 0, first = true, settle = 0;
  function shed() {
    tiers++;
    if (pr > 1.01) { pr = Math.max(1, pr - 0.3); size(); }
    else if (fx.bloomOn) fx.setBloom(false);
    else if (ground.grass.geometry.instanceCount > 12000) ground.grass.geometry.instanceCount = Math.round(ground.grass.geometry.instanceCount * 0.5);
    else if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; env.sun.castShadow = false; scene.traverse(o => { if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => { m.needsUpdate = true; }); else o.material.needsUpdate = true; } }); }
  }
  function loop() {
    const t = performance.now(), real = (t - last) / 1000, dt = Math.min(real, 0.05); last = t;
    if (!ui.isPlain() && !document.hidden) {
      step(dt); fx.render(dt, time, p.speed);
      if (first) { first = false; root.classList.remove('loading'); loadPhysics(); deepLink(); }
      if (!fixed && ++settle > 90) { frames++; slowMs += real * 1000; if (frames === 45) { if (slowMs / 45 > 26 && tiers < 7) shed(); frames = 0; slowMs = 0; } }
    }
    requestAnimationFrame(loop);
  }
  function loadPhysics() { import('./props.js').then(m => m.createPhysics(W, (it, vol) => audio.thud(vol))).then(ph => { phys = ph; }).catch(e => console.warn('Physics did not load; the mountain still works.', e)); }
  function deepLink() { const id = location.hash.slice(1); if (id && id !== 'base' && T.camp(id)) travel(id); }
  // Handy in the console, and for testing
  window.__climb = { p, ui, cam, W, T, env, fx, rides, camera, scene, renderer, photo, rescue, get phys() { return phys; }, get started() { return started; }, get ride() { return ride; }, start, travel, kit, getOn, action,
    skip: sec => { for (let i = 0; i < sec * 30; i++) step(1 / 30); }, place: (x, z, yaw) => { if (ride) getOff(); placePlayer(p, x, z); if (yaw !== undefined) { p.yawWant = yaw; climber.yaw = yaw; cam.yaw = yaw; } introK = 0; cam.snap = true; }, hour: h => env.setHour(h, true), time: () => nextTime() };
  ui.loading(1, 'Ready'); loop();
}
boot().catch(e => { console.error(e); plainOnly(); });
