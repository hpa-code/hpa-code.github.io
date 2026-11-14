// The camera: it stays behind you, swings round when you turn, never dips under the ground, and you can always take it over with the mouse.
import * as THREE from 'three';
import * as T from './terrain.js';

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const angDamp = (a, b, rate, dt) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * (1 - Math.exp(-rate * dt));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const DIST = { walk: 8.2, air: 8.6, climb: 9, slide: 9, glide: 15, bike: 8.6, sled: 10.5, zip: 13 };
const gr = { gx: 0, gz: 0 };

export function createFollowCamera() {
  const C = { yaw: 0, pitch: 0.3, zoom: 1, dist: 9, col: 9, pos: new THREE.Vector3(), look: new THREE.Vector3(), target: new THREE.Vector3(), manual: 9, shake: 0, fov: 0, snap: true, t: 0, lift: 0 };
  const want = new THREE.Vector3();
  // inp: { lookX, lookY, zoom } in pixels and wheel clicks. Returns nothing; read C.pos, C.look, C.fov afterwards.
  C.update = (dt, p, inp, mode, frozen) => {
    C.t += dt;
    if (inp.lookX || inp.lookY) { C.yaw -= inp.lookX * 0.0052; C.pitch = clamp(C.pitch + inp.lookY * 0.004, -0.3, 1.25); C.manual = 0; } else C.manual += dt;
    if (inp.zoom) C.zoom = clamp(C.zoom * (1 + inp.zoom * 0.12), 0.5, 3.2);
    const ride = mode === 'bike' || mode === 'sled', fly = mode === 'glide' || mode === 'zip';
    if (!frozen) {
      if (ride || fly) {
        // Vehicles and the wing: the camera rides behind your heading
        const k = C.manual < 0.6 ? 0 : C.manual < 1.6 ? 1.2 : ride ? 3.4 : 2.6; C.yaw = angDamp(C.yaw, p.head, k, dt);
        if (C.manual > 1.5) { const hx = Math.sin(p.head), hz = Math.cos(p.head); T.gradient(p.x, p.z, 2.5, gr); const s = ride && !p.rideAir ? gr.gx * hx + gr.gz * hz : 0; C.pitch = damp(C.pitch, fly ? 0.2 : clamp(0.24 - s * 0.42, 0.06, 0.62), 1.6, dt); }
      } else if (mode === 'climb') {
        if (C.manual > 0.8) { T.gradient(p.x, p.z, 1.5, gr); C.yaw = angDamp(C.yaw, Math.atan2(gr.gx, gr.gz), 1.8, dt); C.pitch = damp(C.pitch, 0.12, 1.2, dt); }
      } else if (C.manual > 1.3 && p.speed > 1.2) {
        // On foot the camera drifts round behind the way you are going, but never fights you for it
        const d = Math.atan2(Math.sin(p.yawWant - C.yaw), Math.cos(p.yawWant - C.yaw)); C.yaw += Math.sin(d) * (Math.abs(d) > 2.4 ? 0.15 : 0.62) * clamp(p.speed / 6, 0, 1.3) * dt;
        if (C.manual > 4) C.pitch = damp(C.pitch, 0.27, 0.5, dt);
      }
    }
    const dw = (DIST[mode] || 8.5) * C.zoom; C.dist = damp(C.dist, dw, 3, dt);
    const ty = p.y + (mode === 'glide' ? 2.2 : ride ? 1.25 : mode === 'zip' ? -0.9 : 1.45);
    if (C.snap) C.target.set(p.x, ty, p.z); else { C.target.x = damp(C.target.x, p.x, 16, dt); C.target.z = damp(C.target.z, p.z, 16, dt); C.target.y = damp(C.target.y, ty, mode === 'walk' ? 9 : 14, dt); }
    // Keep the lens out of the mountain: shorten the boom, and lift it, wherever the hill gets in the way
    const fx = Math.sin(C.yaw), fz = Math.cos(C.yaw);
    const cast = pitch => { const cp = Math.cos(pitch), sp = Math.sin(pitch); for (let i = 1; i <= 12; i++) { const d = C.dist * i / 12, x = C.target.x - fx * cp * d, z = C.target.z - fz * cp * d, y = C.target.y + sp * d; if (y < T.sample(x, z) + 0.7) return Math.max(1.6, C.dist * (i - 1) / 12); } return C.dist; };
    let need = 0, free = cast(C.pitch); const room = 1.3 - C.pitch;
    if (free < C.dist) for (let k = 1; k <= 8; k++) { const l = room * k / 8, f = cast(C.pitch + l); if (f > free + 0.01) { free = f; need = l; } if (f >= C.dist) break; }
    C.lift = C.snap ? need : need > C.lift ? damp(C.lift, need, 9, dt) : damp(C.lift, need, 1.4, dt);
    free = cast(C.pitch + C.lift); const cp = Math.cos(C.pitch + C.lift), sp = Math.sin(C.pitch + C.lift);
    C.col = C.snap ? free : free < C.col ? damp(C.col, free, 22, dt) : damp(C.col, free, 2.6, dt);
    want.set(C.target.x - fx * cp * C.col, C.target.y + sp * C.col, C.target.z - fz * cp * C.col);
    want.y = Math.max(want.y, T.sample(want.x, want.z) + 0.6, T.waterAt(want.x, want.z) + 0.4);
    if (C.snap) { C.pos.copy(want); C.snap = false; } else C.pos.lerp(want, 1 - Math.exp(-18 * dt));
    C.look.copy(C.target); C.look.y += 0.25;
    if (C.shake > 0.001) { const s = C.shake * 0.35; C.pos.x += Math.sin(C.t * 71) * s; C.pos.y += Math.sin(C.t * 93 + 1) * s; C.pos.z += Math.sin(C.t * 57 + 2) * s; C.shake *= Math.exp(-7 * dt); }
    C.fov = damp(C.fov, clamp((p.speed - 9) / 16, 0, 1) * 13 + (mode === 'glide' ? 4 : 0), 3, dt);
  };
  // The basis the stick is read against
  C.forward = out => { out.x = Math.sin(C.yaw); out.z = Math.cos(C.yaw); return out; };
  return C;
}
