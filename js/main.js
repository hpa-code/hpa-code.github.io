// Hari Acharya's site: a mountain you climb yourself. This file wires the pieces together and runs the loop.
import * as THREE from 'three';
import * as T from './terrain.js';
import { buildScene, seeU } from './scene.js';
import { createPlayer, stepPlayer, placePlayer, P } from './player.js';
import { createClimber } from './climber.js';
import { createAudio } from './audio.js';
import { createUI, createInput, readContent, CHALK_TOTAL } from './ui.js';

const root = document.documentElement, canvas = document.getElementById('world');
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const angDamp = (a, b, rate, dt) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * (1 - Math.exp(-rate * dt));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = d => Math.atan2(Math.sin(d), Math.cos(d));

function plainOnly() { root.className = 'plain nogl'; }

async function boot() {
  if (!root.classList.contains('climb')) { plainOnly(); return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) { plainOnly(); return; }
  if (document.fonts) await Promise.race([Promise.all([document.fonts.load('800 64px Archivo'), document.fonts.load('500 30px Archivo')]), new Promise(r => setTimeout(r, 1500))]).catch(() => {});

  const phone = matchMedia('(hover: none), (max-width: 760px)').matches;
  let pr = Math.min(devicePixelRatio || 1, phone ? 1.5 : 1.75); renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const W = buildScene(renderer, readContent()), scene = W.scene;
  if (phone) W.sun.shadow.mapSize.set(1024, 1024);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1500);

  const base = T.camp('base'), spawn = { x: base.x + base.out.x * 3, z: base.z + base.out.z * 3 };
  const p = createPlayer(spawn.x, spawn.z); p.yawWant = Math.atan2(-base.out.x, -base.out.z);
  const climber = createClimber(scene); climber.yaw = p.yawWant;
  const audio = createAudio();
  let phys = null, zip = null, started = false, introK = 1, time = 0, here = null, track = null, lastPumped = -9, boundTold = false, still = 0, allDone = false;

  /* ---------- Interface ---------- */
  const ui = createUI({
    start, travel, action, rescue,
    plain: v => { if (!v) { size(); canvas.focus({ preventScroll: true }); } },
    mute: () => { const v = !audio.isOn(); audio.setOn(v); ui.setSound(v); try { localStorage.setItem('hpa-climb-sound', v ? '1' : '0'); } catch (e) {} },
    sound: name => audio[name] && audio[name](),
    resetLog: () => { W.pickups.forEach(k => { k.got = false; k.g.visible = true; }); p.max = P.stamina; allDone = false; }
  });
  try { if (localStorage.getItem('hpa-climb-sound') === '0') { audio.setOn(false); ui.setSound(false); } } catch (e) {}
  const input = createInput(canvas, {
    blocked: () => ui.isPlain(), any: () => { if (!started && !ui.isPlain()) start(); audio.start(); }, action,
    mute: () => { const v = !audio.isOn(); audio.setOn(v); ui.setSound(v); },
    escape: () => { if (ui.openId) ui.hide(); else ui.closeLog(); },
    rescue
  });
  // Chalk found on an earlier visit stays found
  for (const k of W.pickups) if (ui.log.chalk.includes(k.i)) { k.got = true; k.g.visible = false; p.max += 0.75; } p.stamina = p.max;

  function start() { if (started) return; started = true; ui.setStarted(); audio.start(); canvas.focus({ preventScroll: true }); }
  function travel(id) {
    if (ui.isPlain()) return; const c = T.camp(id); start(); ui.closeLog();
    ui.fade(() => {
      zip = null; const u = id === 'contact' ? 0 : 1.6; placePlayer(p, c.x + c.out.x * u, c.z + c.out.z * u); p.yawWant = Math.atan2(-c.out.x, -c.out.z); introK = 0; cam.snap = true; input.clear();
      if (id === 'base') { ui.hide(); canvas.focus({ preventScroll: true }); } else ui.show(id);
    });
  }
  // If you ever get wedged somewhere, this puts you back on the nearest bit of trail
  function rescue() { if (!started || zip || ui.openId) return; const t = T.nearestTrail(p.x, p.z); placePlayer(p, t.x, t.z); ui.closeLog(); canvas.focus({ preventScroll: true }); }
  let near = null;
  function action() {
    if (!started || ui.openId || zip || !near) return;
    if (near.zip) { zip = { t: 0.01, v: 5 }; ui.prompt(null); audio.jump(); return; }
    ui.show(near.open, near.item);
  }

  /* ---------- Camera: stays outside the mountain looking in, so the rock is always behind the climber ---------- */
  const cam = { a: T.A0, base: T.A0, off: 0, pitch: 0.46, dist: 19, pos: new THREE.Vector3(), look: new THREE.Vector3(), climb: 0, snap: true, open: 0 };
  const wantP = new THREE.Vector3(), wantL = new THREE.Vector3(), introP = new THREE.Vector3(), introL = new THREE.Vector3(0, 27, 0), v3 = new THREE.Vector3();
  let viewW = 1, viewH = 1; const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size() {
    viewW = innerWidth; viewH = innerHeight; renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH; camera.fov = viewW < viewH ? 56 : 40; camera.updateProjectionMatrix();
  }
  addEventListener('resize', size); size();

  /* ---------- Dust ---------- */
  const dustG = new THREE.IcosahedronGeometry(0.3, 0), dust = [];
  for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(dustG, new THREE.MeshLambertMaterial({ color: 0xe9dcc4, transparent: true, opacity: 0, flatShading: true, depthWrite: false })); m.visible = false; scene.add(m); dust.push({ m, life: 0, vx: 0, vy: 0, vz: 0 }); }
  let dustI = 0;
  function puff(x, y, z, n, spread, snowy) {
    for (let i = 0; i < n; i++) { const d = dust[dustI++ % dust.length], a = Math.random() * 6.28; d.m.position.set(x, y + 0.2, z); d.vx = Math.cos(a) * spread * (0.4 + Math.random()); d.vz = Math.sin(a) * spread * (0.4 + Math.random()); d.vy = 0.8 + Math.random() * 1.4; d.life = 0.7 + Math.random() * 0.4; d.max = d.life; d.m.visible = true; d.m.material.color.setHex(snowy ? 0xffffff : 0xe1d0b0); d.m.scale.setScalar(0.5 + Math.random() * 0.7); }
  }

  const LOW_B = new THREE.Color(0xf3dcae), HIGH_B = new THREE.Color(0xd3e6f3), LOW_T = new THREE.Color(0x9cc3e2), HIGH_T = new THREE.Color(0x4f8ed2), fogC = new THREE.Color();
  const move = { x: 0, z: 0, jump: false }, state = { zip: false, wave: false }; let wallK = 0;

  function step(dt) {
    time += dt;
    const inp = input.read(), frozen = !started || ui.openId || ui.isPlain();
    if (started) introK = Math.max(0, introK - dt / 2.2);

    // Looking around
    cam.off = clamp(cam.off - inp.lookX * 0.006, -2.7, 2.7); cam.pitch = clamp(cam.pitch + inp.lookY * 0.004, 0.1, 1.15); cam.dist = clamp(cam.dist * (1 + inp.zoom * 0.12), 9, 46);
    const pr0 = Math.hypot(p.x, p.z); if (pr0 > 5) cam.base = Math.atan2(p.z, p.x);
    // On the rock the camera swings round to show the climber side-on
    const camWant = cam.base + cam.off + cam.climb * 0.6;
    cam.a = cam.snap ? camWant : angDamp(cam.a, camWant, 3.2, dt);

    // Walking: "up" on the keys is into the screen, toward the mountain. Climbing: "up" is up the rock.
    const fx = -Math.cos(cam.a), fz = -Math.sin(cam.a);
    let mx = fx * inp.y - fz * inp.x, mz = fz * inp.y + fx * inp.x;
    const gr = T.gradient(p.x, p.z), gl = Math.hypot(gr.gx, gr.gz);
    wallK = damp(wallK, p.mode === 'climb' && gl > P.steep ? 1 : 0, 10, dt);
    if (wallK > 0.01) {
      const ux = gr.gx / gl, uz = gr.gz / gl; let rx = -uz, rz = ux; if (rx * -fz + rz * fx < 0) { rx = -rx; rz = -rz; }
      mx += (ux * inp.y + rx * inp.x - mx) * wallK; mz += (uz * inp.y + rz * inp.x - mz) * wallK;
    }
    move.x = frozen ? 0 : mx; move.z = frozen ? 0 : mz; move.jump = !frozen && inp.jump;
    if (zip) {
      zip.v = Math.min(21, zip.v + 10 * dt); zip.t += zip.v * dt / W.zip.len; v3.copy(W.zip.A).lerp(W.zip.B, Math.min(1, zip.t));
      p.speed = zip.v; p.x = v3.x; p.y = v3.y; p.z = v3.z; p.yawWant = Math.atan2(W.zip.B.x - W.zip.A.x, W.zip.B.z - W.zip.A.z); p.mode = 'air';
      if (zip.t >= 1) { const d = v3.copy(W.zip.B).sub(W.zip.A).normalize(); p.y -= 2.35; p.vx = d.x * 5; p.vz = d.z * 5; p.vy = 0; p.fall = p.y; zip = null; if (ui.mark('zip')) ui.toast('Zip line ridden', 'Summit to base camp in a few seconds.'); }
    } else stepPlayer(p, move, dt, W.obstacles);
    state.zip = !!zip;
    for (const e of p.events) {
      if (e.type === 'jump') audio.jump(); else if (e.type === 'lunge') audio.lunge();
      else if (e.type === 'land') { audio.land(e.hard); if (e.drop > 1.5) puff(p.x, p.y, p.z, e.hard ? 9 : 4, e.hard ? 3 : 1.6, p.y > 48); }
      else if (e.type === 'pumped' && time - lastPumped > 6) { lastPumped = time; audio.pumped(); ui.toast('Out of strength', 'Rest on flat ground and it comes back.'); }
      else if (e.type === 'bound' && !boundTold) { boundTold = true; ui.toast('The meadow ends here', 'The mountain is the other way.'); }
    }
    if (p.mode === 'slide' && Math.random() < dt * 14) puff(p.x, p.y, p.z, 1, 1.2, p.y > 48);
    still = p.speed < 0.3 && p.mode === 'walk' ? still + dt : 0; state.wave = here === 'contact' && still > 0.5;
    const cue = climber.update(p, dt, state);
    if (cue === 'step') audio.step(p.y > 48); else if (cue === 'grip') audio.grip();
    if (phys) { phys.step(dt, p, !!zip); ui.kicked(phys.kicked); }

    /* ---------- Where am I, and what is near? ---------- */
    let now = null; for (const c of T.CAMPS) if (Math.hypot(p.x - c.x, p.z - c.z) < T.CAMP_R[c.id] + 1.5 && Math.abs(p.y - c.y) < 3) now = c.id;
    if (now !== here) {
      here = now;
      if (here && here !== 'base' && started && ui.mark('camps', here)) {
        if (here === 'contact') { audio.fanfare(); ui.toast('The summit', 'You climbed it. Open the box, or take the zip line down.', 6000); }
        else { audio.bowl(); ui.toast(ui.campName(here), 'Walk up to the notice board to read.'); }
      }
    }
    ui.route(here, p.y, T.CAMPS); ui.altitude(p.y);
    near = null; let best = 1e9;
    if (!frozen && !zip) for (const it of W.interact) { const d = Math.hypot(p.x - it.x, p.z - it.z); if (d < it.r && d < best && Math.abs(p.y - it.y) < 4) { best = d; near = it; } }
    ui.prompt(near ? near.text : null);

    if (p.mode === 'climb' && p.route) { if (!track || track.R !== p.route) track = { R: p.route, y0: p.y }; track.t = time; }
    if (track && p.mode === 'walk') {
      if (p.y > track.y0 + 8 && Math.hypot(p.x - track.R.top.x, p.z - track.R.top.z) < 6) { if (ui.mark('routes', track.R.name)) { audio.pickup(); ui.toast('Route climbed: ' + track.R.name, 'Graded ' + track.R.grade + '. Holds are easier on the arms than bare rock.'); } track = null; }
      else if (time - track.t > 3) track = null;
    }
    for (const k of W.pickups) {
      if (k.got) continue; k.g.rotation.y = time * 1.6 + k.i; k.g.position.y = k.y + Math.sin(time * 2.2 + k.i) * 0.16;
      if (started && Math.hypot(p.x - k.x, p.y + 1 - k.y, p.z - k.z) < 1.7) { k.got = true; k.g.visible = false; p.max += 0.75; p.stamina = p.max; ui.mark('chalk', k.i); audio.pickup(); ui.toast('Chalk bag ' + ui.log.chalk.length + ' of ' + CHALK_TOTAL, 'Your arms last a little longer.'); }
    }
    const mg = W.migoi, md = Math.hypot(p.x - mg.x, p.z - mg.z);
    mg.wave = damp(mg.wave, md < 9 && Math.abs(p.y - mg.y) < 5 ? 1 : 0, 4, dt); mg.arm.rotation.z = mg.wave * (2.5 + Math.sin(time * 7) * 0.3); mg.g.rotation.y = angDamp(mg.g.rotation.y, md < 14 ? Math.atan2(p.x - mg.x, p.z - mg.z) : mg.g.rotation.y, 3, dt);
    if (md < 7 && Math.abs(p.y - mg.y) < 4 && started && ui.mark('migoi')) { audio.bell(); ui.toast('You met the migoi', 'It would rather you kept this between yourselves.', 6000); }
    if (!allDone && ui.log.camps.length >= 5 && ui.log.chalk.length >= CHALK_TOTAL && ui.log.zip && ui.log.migoi && ui.log.routes.length >= T.ROUTES.length) { allDone = true; if (started && time > 3) { audio.fanfare(); ui.toast('The log is full', 'Every camp, route, chalk bag and secret. Thank you for exploring.', 8000); } }

    /* ---------- The world moves ---------- */
    for (const f of W.flutter) { f.m.rotation.y = f.r + Math.sin(time * 3.4 + f.p) * 0.55; f.m.rotation.x = Math.sin(time * 2.3 + f.p) * 0.2; }
    for (const s of W.spinners) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < s.r && Math.abs(p.y - s.y) < 3) { if (s.v < 1.5 && started) audio.bell(); s.v = Math.max(s.v, 7); } s.v *= Math.exp(-0.45 * dt); s.m.rotation.y -= s.v * dt; }
    for (const fn of W.tick) fn(dt, time);
    for (const k of W.takin) {
      const d = Math.hypot(p.x - k.x, p.z - k.z); k.t -= dt;
      if (d < 7 && started) { k.tx = k.x + (k.x - p.x) / d * 9; k.tz = k.z + (k.z - p.z) / d * 9; k.v = 5.2; k.t = 2; }
      else if (k.t < 0) { k.tx = k.hx + (Math.random() - 0.5) * 16; k.tz = k.hz + (Math.random() - 0.5) * 16; k.v = 0.9; k.t = 4 + Math.random() * 7; }
      if (T.nominal(k.tx, k.tz) < 88 || Math.hypot(k.tx, k.tz) > T.BOUND + 14) { k.tx = k.hx; k.tz = k.hz; }
      const dx = k.tx - k.x, dz = k.tz - k.z, l = Math.hypot(dx, dz), go = l > 0.6;
      if (go) { k.x += dx / l * k.v * dt; k.z += dz / l * k.v * dt; k.yaw = angDamp(k.yaw, Math.atan2(dx, dz), 5, dt); }
      k.m.position.set(k.x, T.sample(k.x, k.z) + (go ? Math.abs(Math.sin(time * (k.v > 2 ? 14 : 6) + k.hx)) * (k.v > 2 ? 0.22 : 0.05) : 0), k.z); k.m.rotation.y = k.yaw;
    }
    for (const d of dust) { if (d.life <= 0) continue; d.life -= dt; d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt; d.vy -= 1.5 * dt; d.m.material.opacity = Math.max(0, d.life / d.max) * 0.7; d.m.scale.multiplyScalar(1 + dt * 1.6); if (d.life <= 0) d.m.visible = false; }

    /* ---------- Camera ---------- */
    cam.climb = damp(cam.climb, p.mode === 'climb' || p.mode === 'slide' ? 1 : 0, 2.5, dt);
    const pitch = cam.pitch * (1 - cam.climb * 0.45), dist = cam.dist - cam.climb * 3 + (zip ? 6 : 0);
    wantL.set(p.x, p.y + 1.5 + cam.climb * 1.2 - (zip ? 2.3 : 0), p.z);
    wantP.set(wantL.x + Math.cos(cam.a) * dist * Math.cos(pitch), wantL.y + dist * Math.sin(pitch), wantL.z + Math.sin(cam.a) * dist * Math.cos(pitch));
    wantP.y = Math.max(wantP.y, T.sample(wantP.x, wantP.z) + 1.4);
    if (cam.snap) { cam.pos.copy(wantP); cam.look.copy(wantL); cam.snap = false; }
    else { cam.pos.lerp(wantP, 1 - Math.exp(-(zip ? 9 : 4.5) * dt)); cam.look.lerp(wantL, 1 - Math.exp(-(zip ? 14 : 9) * dt)); }
    const tall = viewW < viewH, ir = tall ? 250 : 226, ia = T.A0 + 0.55 + (calm ? 0 : time * 0.045); introP.set(Math.cos(ia) * ir, tall ? 84 : 74, Math.sin(ia) * ir); introL.y = tall ? 78 : 27;
    const k = introK * introK * (3 - 2 * introK);
    camera.position.copy(cam.pos).lerp(introP, k); v3.copy(cam.look).lerp(introL, k);
    cam.open = damp(cam.open, ui.openId ? 1 : 0, 5, dt);
    const wide = viewW > 760 && matchMedia('(hover: hover)').matches;
    camera.lookAt(v3.x, v3.y - (wide ? 0 : cam.open * 5), v3.z);
    const heroShift = wide && !started ? -Math.min(440, viewW * 0.3) * 0.5 : 0;
    if (wide) camera.setViewOffset(viewW, viewH, cam.open * Math.min(560, viewW) * 0.5 + heroShift * k, 0, viewW, viewH); else camera.clearViewOffset();

    W.sun.position.set(p.x + 55, p.y + 95, p.z + 38); W.sun.target.position.set(p.x, p.y, p.z);
    const h = clamp((camera.position.y - 6) / 70, 0, 1);
    W.skyU.bottom.value.copy(LOW_B).lerp(HIGH_B, h); W.skyU.top.value.copy(LOW_T).lerp(HIGH_T, h); fogC.copy(W.skyU.bottom.value); scene.fog.color.copy(fogC); W.sky.position.copy(camera.position);
    for (const c of W.clouds) {
      c.a += c.v * dt; c.g.position.set(Math.cos(c.a) * c.r, c.y, Math.sin(c.a) * c.r);
      const dc = Math.min(c.g.position.distanceTo(camera.position), c.g.position.distanceTo(wantL) + 8), fade = clamp((dc - 18) / 22, 0, 1); c.m.opacity = 0.82 * fade; c.g.visible = fade > 0.01;
    }
    for (const s of W.signs) {
      const sx = s.camp ? s.camp.x : s.x, sz = s.camp ? s.camp.z : s.z, d = Math.hypot(camera.position.x - sx, camera.position.z - sz);
      const show = s.camp ? (k > 0.5 || (d < 80 && here !== s.camp.id)) : d < (s.near || 30) + 12 && k < 0.5; s.sp.material.opacity = damp(s.sp.material.opacity, show ? 1 : 0, 5, dt); s.sp.visible = s.sp.material.opacity > 0.02;
      const hh = s.camp ? clamp(d * 0.034, 0.8, 5.5) : clamp(d * 0.02, 0.3, 0.5); s.sp.scale.set(hh * s.sp.userData.aspect, hh, 1);
    }
    const sn = W.snow; sn.m.opacity = clamp((p.y - 38) / 14, 0, 0.9) * (1 - k);
    if (sn.m.opacity > 0.01) { const arr = sn.g.attributes.position.array; for (let i = 0; i < sn.n; i++) { const iy = i * 3 + 1; arr[iy] -= dt * (2 + (i % 5) * 0.4); if (arr[iy] < -35) arr[iy] += 70; arr[i * 3] += Math.sin(time + i) * dt * 0.6; } sn.g.attributes.position.needsUpdate = true; sn.pts.position.copy(camera.position); }

    v3.set(p.x, p.y + 1.2, p.z).project(camera); seeU.uSee.value.set(v3.x, v3.y, k > 0.01 ? -1 : v3.z * 0.5 + 0.5 - 0.0004); renderer.getDrawingBufferSize(seeU.uRes.value);
    // Stamina ring floats beside the climber while it matters
    const showSt = started && !ui.openId && (p.stamina < p.max - 0.02 || p.mode === 'climb');
    if (showSt) { v3.set(p.x, p.y + 1.9, p.z).project(camera); ui.stamina(p.stamina / p.max, (v3.x * 0.5 + 0.5) * viewW + 44, (-v3.y * 0.5 + 0.5) * viewH, true); } else ui.stamina(0, 0, 0, false);

    const sdist = T.nominal(p.x, p.z) > 40 ? Math.abs(wrap(Math.atan2(p.z, p.x) - T.GORGE)) * Math.hypot(p.x, p.z) : 99;
    audio.ambient(clamp(p.y / 70, 0, 1), p.speed, clamp(1 - sdist / 24, 0, 1), !!zip);
  }

  /* ---------- Loop: if a device struggles, trade sharpness for smoothness ---------- */
  let last = performance.now(), frames = 0, slowMs = 0, tiers = 0, first = true;
  function loop() {
    const t = performance.now(), dt = Math.min((t - last) / 1000, 0.05); last = t;
    if (!ui.isPlain() && !document.hidden) {
      step(dt); renderer.render(scene, camera);
      if (first) { first = false; root.classList.remove('loading'); loadPhysics(); deepLink(); }
      frames++; slowMs += dt * 1000;
      if (frames === 50) {
        if (slowMs / 50 > 27 && tiers < 5) {
          tiers++;
          if (pr > 1) { pr = Math.max(1, pr - 0.25); renderer.setPixelRatio(pr); size(); }
          else if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; W.sun.castShadow = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
        }
        frames = 0; slowMs = 0;
      }
    }
    requestAnimationFrame(loop);
  }
  function loadPhysics() {
    import('./props.js').then(m => m.createPhysics(W, (it, vol) => audio.thud(vol))).then(ph => { phys = ph; }).catch(e => console.warn('Physics did not load; the mountain still works.', e));
  }
  function deepLink() { const id = location.hash.slice(1); if (id && id !== 'base' && T.camp(id)) travel(id); }
  window.__climb = { p, ui, cam, W, T, get phys() { return phys; }, get started() { return started; }, start, travel, place: (x, z) => { placePlayer(p, x, z); introK = 0; cam.snap = true; } };   // handy in the console
  loop();
}
boot().catch(e => { console.error(e); plainOnly(); });
