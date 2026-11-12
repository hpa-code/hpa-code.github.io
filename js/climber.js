// The climber you control: a small blocky figure, animated by hand.
import * as THREE from 'three';
import { box, COL } from './scene.js';
import { gradient } from './terrain.js';

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const angDamp = (a, b, rate, dt) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * (1 - Math.exp(-rate * dt));

export function createClimber(scene) {
  const man = new THREE.Group(), tilt = new THREE.Group(), body = new THREE.Group(); man.add(tilt); tilt.add(body); man.scale.setScalar(0.72); scene.add(man);
  box(0.95, 1.15, 0.6, COL.ember, 0, 1.75, 0, body);                                             // jacket
  box(0.8, 1.05, 0.5, COL.gold, 0, 1.85, -0.5, body); box(0.7, 0.3, 0.45, COL.maroon, 0, 2.5, -0.5, body);   // pack and bedroll
  box(0.62, 0.62, 0.62, COL.skin, 0, 2.68, 0.04, body);                                          // head
  box(0.7, 0.25, 0.7, COL.maroon, 0, 2.98, 0.04, body); box(0.72, 0.1, 0.1, COL.ink, 0, 2.72, 0.36, body);   // hat and goggles
  box(0.3, 0.34, 0.26, 0xfbf6ea, 0.36, 1.3, -0.36, body);                                        // chalk bag
  const limb = (w, h, c, x, y) => { const pv = new THREE.Group(); pv.position.set(x, y, 0); box(w, h, w, c, 0, -h / 2, 0, pv); body.add(pv); return pv; };
  const legL = limb(0.38, 1.15, COL.ink, -0.26, 1.2), legR = limb(0.38, 1.15, COL.ink, 0.26, 1.2), armL = limb(0.28, 1.05, COL.ember, -0.62, 2.28), armR = limb(0.28, 1.05, COL.ember, 0.62, 2.28);
  const C = { man, yaw: 0, phase: 0, lean: 0, squash: 0, wave: 0, t: 0, hug: 0 };

  // Returns 'step' or 'grip' on the frames a foot or a hand lands, for sound
  C.update = (p, dt, state) => {
    C.t += dt; let cue = null;
    const climbing = p.mode === 'climb', air = p.mode === 'air' || state.zip, slide = p.mode === 'slide';
    let want = p.yawWant ?? C.yaw;
    let ox = 0, oz = 0, wall = 0.02;
    if (climbing || slide) {
      // Face the rock, lie parallel to it, and hang just off its surface
      const g = gradient(p.x, p.z), l = Math.hypot(g.gx, g.gz) || 1; want = Math.atan2(g.gx, g.gz) + (slide ? Math.PI : 0);
      wall = Math.min(0.62, Math.atan2(1, l)); ox = -g.gx / l; oz = -g.gz / l;
    }
    C.hug = damp(C.hug, climbing ? 1 : 0, 10, dt);
    C.yaw = angDamp(C.yaw, want, climbing ? 9 : 12, dt); man.rotation.y = C.yaw;
    man.position.set(p.x + ox * 0.42 * C.hug, p.y + (state.zip ? -2.35 : 0) + 0.1 * C.hug, p.z + oz * 0.42 * C.hug);

    const moving = Math.min(1, p.speed / 5), rate = climbing ? 7 + (p.route ? 2.5 : 0) : 13;
    const before = Math.sin(C.phase); C.phase += dt * rate * (climbing ? Math.min(1, (Math.abs(p.up) + p.speed) / 2.2) : moving);
    const sw = Math.sin(C.phase); if (before * sw < 0 && (climbing || (p.mode === 'walk' && moving > 0.3))) cue = climbing ? 'grip' : 'step';
    C.lean = damp(C.lean, climbing ? wall : slide ? -0.5 : -0.02, 9, dt);
    C.squash = damp(C.squash, p.landed > 0 ? 1 : 0, 18, dt);
    C.wave = damp(C.wave, state.wave ? 1 : 0, 4, dt);
    tilt.rotation.x = C.lean + (p.mode === 'walk' ? 0.14 * moving : 0);
    body.scale.y = 1 - C.squash * 0.22; body.position.y = (p.mode === 'walk' ? Math.abs(Math.cos(C.phase)) * 0.09 * moving : 0) + Math.sin(C.t * 1.8) * 0.012;

    if (state.zip) { armL.rotation.x = armR.rotation.x = Math.PI; legL.rotation.x = 0.35 + Math.sin(C.t * 3) * 0.12; legR.rotation.x = 0.2 - Math.sin(C.t * 3) * 0.12; tilt.rotation.x = 0.1; }
    else if (climbing) { armL.rotation.x = -2.75 - sw * 0.38; armR.rotation.x = -2.75 + sw * 0.38; legL.rotation.x = -0.5 + sw * 0.45; legR.rotation.x = -0.5 - sw * 0.45; }
    else if (air) { armL.rotation.x = damp(armL.rotation.x, -2.6, 14, dt); armR.rotation.x = damp(armR.rotation.x, -2.6, 14, dt); legL.rotation.x = damp(legL.rotation.x, 0.5, 14, dt); legR.rotation.x = damp(legR.rotation.x, -0.4, 14, dt); }
    else if (slide) { armL.rotation.x = armR.rotation.x = -1.2; legL.rotation.x = legR.rotation.x = -1.1; }
    else {
      const s = sw * 0.72 * moving; legL.rotation.x = s; legR.rotation.x = -s;
      armL.rotation.x = -s * 0.85 * (1 - C.wave) - C.wave * (2.75 - Math.sin(C.t * 6) * 0.22); armR.rotation.x = s * 0.85 * (1 - C.wave) - C.wave * (2.75 + Math.sin(C.t * 6) * 0.22);
    }
    armL.rotation.z = climbing ? 0.32 : 0; armR.rotation.z = climbing ? -0.32 : 0;
    return cue;
  };
  return C;
}
