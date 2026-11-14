// How you move: on foot, on the rock, under a paraglider, on a bike and on a snowmobile.
// Pure logic over the terrain, with no rendering, so it can be tested on its own.
import { floorAt, gradient, onRoute, snowAt, trailDist, BOUND, CAMPS, CAMP_R } from './terrain.js';

export const P = {
  walk: 5.6, sprint: 9.6, climb: 2.7, routeBoost: 1.4, jump: 9.2, gUp: 24, gDown: 33, radius: 0.45,
  walkMax: 0.97,        // steeper than about 44 degrees and you cannot walk up it: you climb
  slideMin: 1.22,       // steeper than about 51 degrees and you cannot stand on it either
  climbExit: 0.74, stamina: 9,
  glide: { v: 12.5, fast: 18, slow: 7.2, sink: 1.45, sinkFast: 3.8, sinkSlow: 0.8, turn: 1.6, lift: 9.5, ridge: 4.2 },
  bike: { max: 18.5, top: 28, accel: 11.5, brake: 20, rev: 3, grav: 0.75, hill: 1.1, roll: 0.9, coast: 2.2, turn: 2.9, under: 0.06, hop: 6.6, g: 26 },
  sled: { max: 22, top: 34, accel: 13, brake: 22, rev: 4, grav: 1.0, hill: 1.5, roll: 1.2, coast: 3.0, turn: 2.5, under: 0.045, hop: 5.2, g: 26 }
};
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const F = { h: 0, deck: false, water: false }, F1 = { h: 0, deck: false, water: false }, GR = { gx: 0, gz: 0 }, GR1 = { gx: 0, gz: 0 };

export function createPlayer(x, z) {
  return { x, y: floorAt(x, z, 1e9).h, z, vx: 0, vy: 0, vz: 0, yawWant: 0, mode: 'walk', stamina: P.stamina, max: P.stamina, rest: 0, air: 0, fall: 0, landed: 0, leap: 0, coyote: 0, jumpBuf: 0, jumped: false,
    route: null, speed: 0, slope: 0, up: 0, water: false, sprinting: false, head: 0, v: 0, steer: 0, rideAir: false, airTime: 0, lift: 0, gv: 0, bank: 0, surface: 'grass', events: [] };
}
export function surfaceAt(x, z, y, deck) {
  if (deck) return 'wood'; if (snowAt(x, z, y) > 0.5) return 'snow'; if (trailDist(x, z) < 3.2) return 'dirt';
  for (const c of CAMPS) if (Math.hypot(x - c.x, z - c.z) < CAMP_R[c.id] * 0.8) return 'dirt'; return 'grass';
}

// input: { mx, mz } wanted direction in world space (length 0..1); { ix, iy } the raw stick (right, forward);
// { rx, rz } the camera's right; jump (true on the frame it is pressed), jumpHeld, sprint
// world: { obstacles: [{ x, z, r, top }], thermals: [{ x, z, r, top }] }
export function stepPlayer(p, inp, dt, world) {
  p.events.length = 0; p.landed = Math.max(0, p.landed - dt); p.leap = Math.max(0, p.leap - dt); p.coyote = Math.max(0, p.coyote - dt);
  p.jumpBuf = inp.jump ? 0.14 : Math.max(0, p.jumpBuf - dt);
  const x0 = p.x, y0 = p.y, z0 = p.z;
  if (p.mode === 'bike' || p.mode === 'sled') stepRide(p, inp, dt, world);
  else if (p.mode === 'glide') stepGlide(p, inp, dt, world);
  else stepFoot(p, inp, dt, world);
  const r = Math.hypot(p.x, p.z);
  if (r > BOUND) { p.x *= BOUND / r; p.z *= BOUND / r; if (p.mode !== 'air' && p.mode !== 'glide' && !p.rideAir) p.y = floorAt(p.x, p.z, p.y + 0.4).h; if (p.mode === 'bike' || p.mode === 'sled') p.v *= 0.9; p.events.push({ type: 'bound' }); }
  const idt = 1 / Math.max(dt, 1e-4); p.speed = Math.hypot(p.x - x0, p.z - z0) * idt; p.up = (p.y - y0) * idt;
  return p;
}

function stepFoot(p, inp, dt, world) {
  const il = Math.hypot(inp.mx, inp.mz), m = Math.min(1, il), dx = il > 0.01 ? inp.mx / il : 0, dz = il > 0.01 ? inp.mz / il : 0, y0 = p.y;
  if (p.mode === 'air') {
    p.vy -= (p.vy > 0 ? (inp.jumpHeld || !p.jumped ? P.gUp : P.gUp * 1.8) : P.gDown) * dt; if (p.vy < -42) p.vy = -42; p.air += dt;
    const hs = Math.hypot(p.vx, p.vz), tgt = Math.max(P.walk, Math.min(hs, 14)), k = 1 - Math.exp(-3.2 * dt);
    if (m > 0.05) { p.vx += (dx * tgt * m - p.vx) * k; p.vz += (dz * tgt * m - p.vz) * k; p.yawWant = Math.atan2(dx, dz); } else { p.vx *= Math.exp(-0.4 * dt); p.vz *= Math.exp(-0.4 * dt); }
    p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; collide(p, world.obstacles);
    const f = floorAt(p.x, p.z, y0, F);
    if (p.jumpBuf > 0) {
      if (p.coyote > 0) { p.vy = P.jump; p.coyote = 0; p.jumpBuf = 0; p.jumped = true; p.fall = p.y; p.events.push({ type: 'jump' }); }
      else if (p.air > 0.14 && p.y - f.h > 0.85) { p.jumpBuf = 0; p.mode = 'glide'; p.head = Math.hypot(p.vx, p.vz) > 1.5 ? Math.atan2(p.vx, p.vz) : p.yawWant; p.gv = Math.max(Math.hypot(p.vx, p.vz), 6); p.vy = Math.max(p.vy, -6); p.bank = 0; p.events.push({ type: 'glideOpen' }); return; }
    }
    if (p.y <= f.h && p.vy <= 0) {
      const drop = p.fall - f.h; p.y = f.h; p.mode = 'walk'; p.air = 0; p.jumped = false;
      p.events.push({ type: f.water ? 'splash' : 'land', hard: drop > 6, drop, vy: p.vy }); if (drop > 6) { p.landed = 0.22; p.vx *= 0.4; p.vz *= 0.4; } p.vy = 0;
    }
    return;
  }
  const f0 = floorAt(p.x, p.z, p.y, F), g = gradient(p.x, p.z, 1.1, GR), sl = f0.deck || f0.water ? 0 : Math.hypot(g.gx, g.gz), upx = sl > 1e-4 ? g.gx / sl : 0, upz = sl > 1e-4 ? g.gz / sl : 0;
  p.slope = sl; p.water = f0.water; p.surface = f0.water ? 'water' : surfaceAt(p.x, p.z, p.y, f0.deck);
  const s = g.gx * dx + g.gz * dz;                      // rise per metre in the direction you are pushing
  let mode = p.mode;
  if (mode === 'climb') { if (sl < P.climbExit) mode = 'walk'; else if (p.stamina <= 0) mode = sl >= P.walkMax ? 'slide' : 'walk'; }
  else if (mode === 'slide') { if (sl < P.walkMax * 0.86) mode = 'walk'; else if (p.stamina > 1.2 && m > 0.3 && s > 0.2) mode = 'climb'; }
  else if (sl >= P.walkMax) { if (m > 0.2 && s > 0.25 && p.stamina > 0.4) mode = 'climb'; else if (sl >= P.slideMin) mode = 'slide'; }
  p.route = mode === 'climb' ? onRoute(p.x, p.z) : null; p.sprinting = false;

  if (mode === 'climb') {
    // On the rock the stick means up, down and sideways across the face, whichever way the camera looks
    let cx = -upz, cz = upx; if (cx * inp.rx + cz * inp.rz < 0) { cx = -cx; cz = -cz; }
    let wx = upx * inp.iy + cx * inp.ix, wz = upz * inp.iy + cz * inp.ix; const wl = Math.hypot(wx, wz), wm = Math.min(1, wl); if (wl > 0.01) { wx /= wl; wz /= wl; }
    const sa = g.gx * wx + g.gz * wz, boost = (p.route ? P.routeBoost : 1) * (p.leap > 0 ? 3.1 : 1), sp = P.climb * boost * wm / Math.sqrt(1 + sa * sa), k = 1 - Math.exp(-16 * dt);
    p.vx += (wx * sp - p.vx) * k; p.vz += (wz * sp - p.vz) * k; p.rest = 0;
    p.stamina -= dt * (wm > 0.05 ? (p.route ? 0.6 : 1) * (0.5 + 0.5 * Math.max(0, sa / sl)) : 0.12);
    if (p.stamina <= 0) { p.stamina = 0; p.events.push({ type: 'pumped' }); }
    p.yawWant = Math.atan2(upx, upz);
    if (p.jumpBuf > 0) {
      p.jumpBuf = 0;
      if (inp.iy < -0.3) { p.mode = 'air'; p.vy = 5.5; p.vx = -upx * 5.5; p.vz = -upz * 5.5; p.fall = p.y; p.air = 0; p.jumped = true; p.coyote = 0; p.events.push({ type: 'jump' }); return; }
      if (p.stamina > 0.8 && p.leap <= 0) { p.leap = 0.3; p.stamina -= 1.1; p.events.push({ type: 'leap' }); }
    }
  } else if (mode === 'slide') {
    const k = 1 - Math.exp(-3 * dt); p.vx += (-upx * 10 - p.vx) * k; p.vz += (-upz * 10 - p.vz) * k; p.rest = 0;
    if (Math.hypot(p.vx, p.vz) > 1) p.yawWant = Math.atan2(p.vx, p.vz);
  } else {
    let wx = dx, wz = dz, wm = m;
    if (sl >= P.walkMax && s > 0) { const d = wx * upx + wz * upz; wx -= upx * d; wz -= upz * d; wm *= Math.hypot(wx, wz); }      // too steep to walk up: you can only traverse
    const sprint = inp.sprint && !p.water && m > 0.5; p.sprinting = sprint;
    let sp = (sprint ? P.sprint : P.walk) * wm * (p.water ? 0.5 : 1) * (s > 0 ? 1 / (1 + s * 0.7) : 1 + Math.min(0.18, -s * 0.2)); if (p.landed > 0) sp *= 0.3;
    const k = 1 - Math.exp(-(m > 0.05 ? 10.5 : 13) * dt), wl = Math.hypot(wx, wz) || 1;
    p.vx += (wx / wl * sp - p.vx) * k; p.vz += (wz / wl * sp - p.vz) * k;
    p.rest += dt; if (p.rest > 0.4) p.stamina = Math.min(p.max, p.stamina + dt * 3.4);
    if (m > 0.05) p.yawWant = Math.atan2(dx, dz);
    if (p.jumpBuf > 0 && p.landed <= 0) { p.jumpBuf = 0; p.mode = 'air'; p.vy = p.water ? 6.2 : P.jump; p.fall = p.y; p.air = 0; p.jumped = true; p.coyote = 0; p.events.push({ type: 'jump' }); return; }
  }
  const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt, f1 = floorAt(nx, nz, p.y, F1), hs = Math.hypot(p.vx, p.vz);
  if (mode === 'walk') {
    // Running over a brink sends you into the air; creeping onto steep ground does not
    const g1 = gradient(nx, nz, 1.1, GR1), s1 = hs > 0.1 ? (g1.gx * p.vx + g1.gz * p.vz) / hs : 0;
    if ((p.y - f1.h > 0.85 && !f1.water) || (s1 < -1.35 && hs > 4.5)) { p.mode = 'air'; p.vy = Math.min(0, s1 * hs * 0.25); p.fall = p.y; p.air = 0; p.jumped = false; p.coyote = 0.13; p.x = nx; p.z = nz; return; }
  }
  p.x = nx; p.z = nz; collide(p, world.obstacles); p.y = floorAt(p.x, p.z, p.y + 0.45, F1).h; p.mode = mode;
}

function stepGlide(p, inp, dt, world) {
  const C = P.glide, y0 = p.y;
  if (p.jumpBuf > 0) { p.jumpBuf = 0; p.mode = 'air'; p.air = 0.2; p.fall = p.y; p.jumped = false; p.events.push({ type: 'glideClose' }); return; }
  p.bank = damp(p.bank, inp.ix, 4.5, dt); p.head -= p.bank * C.turn * dt;
  const fast = inp.iy > 0.25, slow = inp.iy < -0.25;
  p.gv = damp(p.gv, fast ? C.fast : slow ? C.slow : C.v, 1.4, dt);
  let lift = 0;
  for (const t of world.thermals) { const d = Math.hypot(p.x - t.x, p.z - t.z); if (d < t.r && p.y < t.top) lift = Math.max(lift, C.lift * (1 - Math.pow(d / t.r, 3)) * Math.min(1, (t.top - p.y) / 12)); }
  // Ridge lift: wind climbing a steep face carries you with it, as long as you stay close to the rock
  { const g = gradient(p.x, p.z, 3, GR), sl = Math.hypot(g.gx, g.gz), agl = p.y - floorAt(p.x, p.z, p.y, F1).h; if (sl > 0.4 && agl < 32) lift = Math.max(lift, C.ridge * clamp((sl - 0.4) / 0.6, 0, 1) * clamp(1.25 - agl / 26, 0, 1) * clamp(agl / 2.5, 0.2, 1)); }
  p.lift = lift;
  p.vy = damp(p.vy, lift - (fast ? C.sinkFast : slow ? C.sinkSlow : C.sink) - Math.abs(p.bank) * 0.5, lift > 0 ? 1.6 : 2.6, dt);
  p.vx = Math.sin(p.head) * p.gv; p.vz = Math.cos(p.head) * p.gv;
  p.x += p.vx * dt; p.z += p.vz * dt; p.y = Math.min(p.y + p.vy * dt, 215); collide(p, world.obstacles, 1.2);
  p.yawWant = p.head; p.air += dt;
  const f = floorAt(p.x, p.z, y0, F);
  if (p.y <= f.h + 0.02) { p.y = f.h; p.mode = 'walk'; p.air = 0; p.jumped = false; p.vx *= 0.55; p.vz *= 0.55; p.events.push({ type: f.water ? 'splash' : 'land', hard: false, drop: 1, vy: p.vy, glide: true }); p.vy = 0; }
}

function stepRide(p, inp, dt, world) {
  const V = P[p.mode], sled = p.mode === 'sled';
  p.steer = damp(p.steer, inp.ix, 8, dt);
  const hx = Math.sin(p.head), hz = Math.cos(p.head), f = floorAt(p.x, p.z, p.y + 0.6, F), g = gradient(p.x, p.z, 1.3, GR), s = f.deck || f.water ? 0 : g.gx * hx + g.gz * hz;
  p.surface = f.water ? 'water' : surfaceAt(p.x, p.z, p.y, f.deck); p.water = f.water; p.slope = Math.hypot(g.gx, g.gz);
  const grip = f.water ? 0.3 : sled ? (p.surface === 'snow' ? 1 : 0.58) : (p.surface === 'snow' ? 0.5 : p.surface === 'grass' ? 0.8 : 1);
  if (!p.rideAir) {
    const th = inp.iy, vmax = V.max * grip * (inp.sprint ? 1.16 : 1) / (1 + Math.max(0, s) * V.hill);
    if (th > 0.05) { if (p.v < vmax) p.v = Math.min(vmax, p.v + V.accel * th * dt * (p.v < 0 ? 2 : 1)); }
    else if (th < -0.05) { if (p.v > 0.4) p.v = Math.max(0, p.v + V.brake * th * dt); else p.v = Math.max(-V.rev, p.v + V.accel * 0.6 * th * dt); }
    p.v -= 9.8 * s / Math.sqrt(1 + s * s) * V.grav * dt;                                     // the hill pulls you back, or lets you go
    const over = p.v > vmax ? (p.v - vmax) * (s < -0.05 ? 0.35 : 1.6) : 0, drag = V.roll + (Math.abs(th) < 0.05 ? V.coast * (1 - grip * 0.3) : 0) + over;
    p.v -= Math.sign(p.v) * Math.min(Math.abs(p.v), drag * dt);
    p.v = clamp(p.v, -V.rev, V.top);
    if (Math.abs(p.v) < 0.25 && Math.abs(th) < 0.05 && Math.abs(s) < 0.12) p.v = 0;
    const sp = Math.abs(p.v); p.head -= p.steer * V.turn * clamp(sp / 2.5, 0, 1) / (1 + sp * V.under) * dt * (p.v < -0.1 ? -1 : 1);
    if (p.jumpBuf > 0) { p.jumpBuf = 0; p.vy = Math.max(p.vy, 0) + V.hop; p.rideAir = true; p.airTime = 0; p.fall = p.y; p.events.push({ type: 'hop' }); }
  } else { p.head -= p.steer * 1.1 * dt; p.v *= Math.exp(-0.12 * dt); }
  let nx = p.x + Math.sin(p.head) * p.v * dt, nz = p.z + Math.cos(p.head) * p.v * dt;
  if (sled && !p.rideAir) { const lx = hz, lz = -hx, side = g.gx * lx + g.gz * lz, k = Math.min(1, Math.abs(p.v) / 6) * 2.2; nx -= lx * side * k * dt; nz -= lz * side * k * dt; }   // a sled drifts down the fall line
  const px = p.x, pz = p.z; p.x = nx; p.z = nz;
  if (collide(p, world.obstacles, 0.75) && Math.abs(p.v) > 3) { p.events.push({ type: 'bump', v: Math.abs(p.v) }); p.v *= 0.45; }
  const f1 = floorAt(p.x, p.z, p.y + 0.6, F1);
  if (p.rideAir) {
    p.vy -= V.g * dt; p.y += p.vy * dt; p.airTime += dt;
    if (p.y <= f1.h) { const hit = s * p.v - p.vy; p.y = f1.h; p.rideAir = false; if (p.airTime > 0.25) p.events.push({ type: f1.water ? 'splash' : 'land', hard: hit > 11, drop: p.fall - p.y, vy: p.vy, air: p.airTime, ride: true }); p.vy = s * p.v; if (hit > 11) p.v *= 0.8; }
  } else {
    const ball = p.y + p.vy * dt - 0.5 * V.g * dt * dt;
    if (ball > f1.h + 0.14 && Math.abs(p.v) > 5) { p.rideAir = true; p.airTime = 0; p.fall = p.y; p.y = ball; p.vy -= V.g * dt; }
    else { p.vy = clamp((f1.h - p.y) / Math.max(dt, 1e-4), -30, 30); p.y = f1.h; }
  }
  if (f1.water) p.v *= Math.exp(-(sled ? 0.8 : 2.6) * dt);
  p.vx = (p.x - px) / Math.max(dt, 1e-4); p.vz = (p.z - pz) / Math.max(dt, 1e-4); p.yawWant = p.head;
  p.rest += dt; p.stamina = Math.min(p.max, p.stamina + dt * 3.4);
}

function collide(p, obstacles, extra = 0) {
  let hit = false; if (!obstacles) return hit; const rad = P.radius + extra;
  for (const o of obstacles) {
    const dx = p.x - o.x; if (dx > 8 || dx < -8) continue; const dz = p.z - o.z; if (dz > 8 || dz < -8) continue;
    if (o.top !== undefined && p.y > o.top) continue;
    const d = Math.hypot(dx, dz), min = o.r + rad; if (d < min && d > 1e-5) { p.x = o.x + dx / d * min; p.z = o.z + dz / d * min; hit = true; }
  }
  return hit;
}

export function placePlayer(p, x, z) {
  p.x = x; p.z = z; p.y = floorAt(x, z, 1e9).h; p.vx = p.vy = p.vz = 0; p.mode = 'walk'; p.stamina = p.max; p.landed = 0; p.air = 0; p.v = 0; p.rideAir = false; p.jumped = false;
}
export function mount(p, kind, yaw) { p.mode = kind; p.head = yaw; p.v = 0; p.vy = 0; p.steer = 0; p.rideAir = false; p.vx = p.vz = 0; }
export function dismount(p) {
  const lx = Math.cos(p.head), lz = -Math.sin(p.head); p.mode = 'walk'; p.vx = Math.sin(p.head) * p.v * 0.4; p.vz = Math.cos(p.head) * p.v * 0.4; p.v = 0;
  if (p.rideAir) { p.mode = 'air'; p.air = 0.2; p.fall = p.y; p.jumped = false; p.rideAir = false; } else { p.x += lx * 1.0; p.z += lz * 1.0; p.y = floorAt(p.x, p.z, p.y + 0.6).h; }
}
