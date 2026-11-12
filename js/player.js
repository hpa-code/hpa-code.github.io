// How the climber moves. Pure logic over the terrain: no rendering, so it can be tested on its own.
import { floorAt, gradient, onRoute, BOUND } from './terrain.js';

export const P = {
  run: 7.6, climb: 3.3, routeBoost: 1.45, air: 6.2, jump: 9.4, gravity: 27,
  steep: Math.tan(41 * Math.PI / 180),   // steeper than this and you are climbing, not walking
  stamina: 6.5, radius: 0.5
};

export function createPlayer(x, z) {
  const f = floorAt(x, z, 1e9);
  return { x, y: f.h, z, vx: 0, vy: 0, vz: 0, yaw: 0, mode: 'walk', stamina: P.stamina, max: P.stamina, rest: 0,
    air: 0, fall: 0, landed: 0, lunge: 0, route: null, speed: 0, slope: 0, up: 0, events: [] };
}

// input: { x, z } desired direction in world space (length 0..1), jump (true on the frame it is pressed)
// obstacles: [{ x, z, r, top }] solid things on the ground
export function stepPlayer(p, input, dt, obstacles) {
  const m = Math.min(1, Math.hypot(input.x, input.z)), dx = m ? input.x / Math.hypot(input.x, input.z) : 0, dz = m ? input.z / Math.hypot(input.x, input.z) : 0;
  p.events.length = 0; p.landed = Math.max(0, p.landed - dt); p.lunge = Math.max(0, p.lunge - dt);
  const x0 = p.x, y0 = p.y, z0 = p.z;

  if (p.mode === 'air') {
    p.vy -= P.gravity * dt; p.air += dt;
    const k = 1 - Math.exp(-2.6 * dt);
    if (m) { p.vx += (dx * P.air * m - p.vx) * k; p.vz += (dz * P.air * m - p.vz) * k; }
    p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
    collide(p, obstacles);
    const f = floorAt(p.x, p.z, y0);
    if (p.y <= f.h && p.vy <= 0) {
      p.y = f.h; const drop = p.fall - p.y;
      p.events.push({ type: 'land', hard: drop > 4, drop }); if (drop > 4) p.landed = 0.28;
      p.mode = 'walk'; p.vy = 0; p.air = 0;
    }
  }
  if (p.mode !== 'air') {
    const f0 = floorAt(p.x, p.z, p.y), g = gradient(p.x, p.z), steepness = f0.deck ? 0 : Math.hypot(g.gx, g.gz);
    const isSteep = steepness > P.steep;
    p.slope = steepness; p.route = isSteep ? onRoute(p.x, p.z) : null;
    const s = f0.deck ? 0 : g.gx * dx + g.gz * dz;      // rise per metre in the direction of travel
    let speed = 0, mode = 'walk';

    if (!isSteep) {
      speed = p.landed > 0 ? 0 : P.run * m / (1 + Math.max(0, s) * 0.55);
      p.rest += dt; if (p.rest > 0.35) p.stamina = Math.min(p.max, p.stamina + dt * 2.6);
    } else if (p.stamina > 0) {
      mode = 'climb'; p.rest = 0;
      const boost = (p.route ? P.routeBoost : 1) * (p.lunge > 0 ? 3.2 : 1);
      speed = P.climb * boost * m / Math.sqrt(1 + s * s);
      if (m) p.stamina -= dt * (p.route ? 0.55 : 1) * (0.55 + 0.45 * Math.max(0, Math.min(1, s / steepness)));
      if (p.stamina <= 0) { p.stamina = 0; p.events.push({ type: 'pumped' }); }
    } else {
      mode = 'slide'; p.rest = 0;
    }

    if (mode === 'slide') {
      const l = steepness || 1, k = 1 - Math.exp(-3 * dt);
      p.vx += (-g.gx / l * 11 - p.vx) * k; p.vz += (-g.gz / l * 11 - p.vz) * k;
    } else {
      const k = 1 - Math.exp(-(mode === 'climb' ? 18 : 12) * dt);
      p.vx += (dx * speed - p.vx) * k; p.vz += (dz * speed - p.vz) * k;
    }
    let nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    const f1 = floorAt(nx, nz, p.y);
    const hstep = Math.hypot(nx - p.x, nz - p.z), drop = p.y - f1.h;

    if (input.jump && p.landed <= 0) {
      if (mode === 'walk') { p.mode = 'air'; p.vy = P.jump; p.fall = p.y; p.air = 0; p.events.push({ type: 'jump' }); }
      else if (mode === 'climb') {
        // Pushing away from the wall lets go; anything else is a lunge upward
        if (m && s < -0.3) { p.mode = 'air'; p.vy = 4; p.vx = dx * 6; p.vz = dz * 6; p.fall = p.y; p.air = 0; p.events.push({ type: 'jump' }); }
        else if (p.stamina > 0.6 && p.lunge <= 0) { p.lunge = 0.3; p.stamina -= 1.0; p.events.push({ type: 'lunge' }); }
      }
    }
    if (p.mode !== 'air') {
      // Running over an edge sends you into the air; creeping onto steep ground does not
      const g1 = gradient(nx, nz), st1 = f1.deck ? 0 : Math.hypot(g1.gx, g1.gz), s1 = g1.gx * dx + g1.gz * dz;
      const overEdge = mode === 'walk' && hstep > 0.02 && ((st1 > P.steep && s1 < -P.steep * 0.8 && Math.hypot(p.vx, p.vz) > 3.5) || drop > 0.9);
      if (overEdge) { p.mode = 'air'; p.vy = 0; p.fall = p.y; p.air = 0; p.x = nx; p.z = nz; p.events.push({ type: 'edge' }); }
      else { p.x = nx; p.z = nz; collide(p, obstacles); p.y = floorAt(p.x, p.z, p.y + 0.3).h; p.mode = mode; }
    }
    p.up = (p.y - y0) / Math.max(dt, 1e-4);
  }

  // The meadow has an edge
  const r = Math.hypot(p.x, p.z);
  if (r > BOUND) { p.x *= BOUND / r; p.z *= BOUND / r; if (p.mode !== 'air') p.y = floorAt(p.x, p.z, p.y + 0.3).h; p.events.push({ type: 'bound' }); }

  const mvx = (p.x - x0) / Math.max(dt, 1e-4), mvz = (p.z - z0) / Math.max(dt, 1e-4);
  p.speed = Math.hypot(mvx, mvz);
  if (m > 0.05 && p.mode !== 'slide') p.yawWant = Math.atan2(dx, dz); else if (p.mode === 'slide' && p.speed > 1) p.yawWant = Math.atan2(mvx, mvz);
  return p;
}

function collide(p, obstacles) {
  if (!obstacles) return;
  for (const o of obstacles) {
    if (o.top !== undefined && p.y > o.top) continue;
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), min = o.r + P.radius;
    if (d < min && d > 1e-5) { p.x = o.x + dx / d * min; p.z = o.z + dz / d * min; }
  }
}

export function placePlayer(p, x, z) {
  p.x = x; p.z = z; p.y = floorAt(x, z, 1e9).h; p.vx = p.vy = p.vz = 0; p.mode = 'walk'; p.stamina = p.max; p.landed = 0; p.air = 0;
}
