// Everything you can see that is not the ground, the climber or a vehicle: forest, camps, creatures, and the things to find.
import * as THREE from 'three';
import * as T from './terrain.js';
import { COL, FLAGS, G, merged, mesh, mat, vmat, vmatShiny, vmatDouble, seeded, label, canvasTexture, wrapText, FONT } from './kit.js';

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const angDamp = (a, b, rate, dt) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * (1 - Math.exp(-rate * dt));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const seeU = { uSee: { value: new THREE.Vector3(0, 0, 2) }, uRes: { value: new THREE.Vector2(1, 1) } };

export function buildScene(scene, env, ground, content, quality) {
  const rnd = seeded(7570), UT = ground.uniforms.uTime;
  const W = { scene, obstacles: [], interact: [], spinners: [], pickups: [], props: [], tick: [], signs: [], fires: [], thermals: [], rings: [], spawns: [], lamps: [] };
  const Y = (x, z) => T.sample(x, z);
  const solid = (x, z, r, top) => W.obstacles.push({ x, z, r, top });
  const put = (m, x, z, yaw = 0, dy = 0) => { m.position.set(x, Y(x, z) + dy, z); m.rotation.y = yaw; scene.add(m); return m; };

  /* ---------- Materials that move: foliage sways, flags fly, and trees in front of you turn see-through ---------- */
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  treeMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = UT; sh.uniforms.uSee = seeU.uSee; sh.uniforms.uRes = seeU.uRes; sh.uniforms.uNoise = ground.uniforms.uNoise;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vTP;').replace('#include <begin_vertex>', `#include <begin_vertex>
  vTP = transformed;
  #ifdef USE_INSTANCING
  { float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23; float k = transformed.y * transformed.y * 0.012;
    transformed.x += (sin(uTime * 1.3 + ph) + sin(uTime * 2.9 + ph * 1.7) * 0.4) * k; transformed.z += cos(uTime * 1.1 + ph * 1.3) * k * 0.7; vTP += instanceMatrix[3].xyz * 0.37; }
  #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSee; uniform vec2 uRes; uniform sampler2D uNoise; varying vec3 vTP;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 lf = texture2D(uNoise, vTP.xy * 0.55 + vTP.z * 0.31).gab; float lf2 = texture2D(uNoise, vTP.zy * 1.9 + vTP.x * 0.7).g;
  diffuseColor.rgb *= 0.62 + 0.55 * lf.x + 0.35 * (lf2 - 0.5);`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize(normal + (viewMatrix * vec4(lf - 0.5, 0.0)).xyz * 1.1);')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  { vec2 q = (gl_FragCoord.xy / uRes * 2.0 - 1.0 - uSee.xy) * vec2(uRes.x / uRes.y, 1.0); float d = length(q);
    if (gl_FragCoord.z < uSee.z && d < 0.36 && (d < 0.2 || mod(floor(gl_FragCoord.x * 0.5) + floor(gl_FragCoord.y * 0.5), 2.0) < 1.0)) discard; }`);
  };
  const flagMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  flagMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = UT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
  { float ph = position.x * 1.7 + position.z * 1.3 + position.y * 0.6; float k = uv.y;
    transformed += normal * (sin(uTime * 6.0 + ph) * 0.16 + sin(uTime * 9.5 + ph * 1.8) * 0.06) * k; transformed.y += sin(uTime * 4.0 + ph) * 0.05 * k; }`);
  };
  const glow = (hex, k = 1) => { const m = new THREE.MeshBasicMaterial({ color: hex }); m.color.multiplyScalar(k); return m; };

  /* ---------- Prayer flags: every line in the world is one mesh ---------- */
  const flagParts = { pos: [], nor: [], col: [], uv: [] }, ropeParts = [];
  function flagLine(ax, ay, az, bx, by, bz, n = 10, sag = 0.6) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, tx = dx / l, tz = dz / l, nx = -tz, nz = tx, c = new THREE.Color(), pts = [];
    for (let i = 0; i <= n * 2; i++) { const t = i / (n * 2); pts.push([ax + dx * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * sag, az + dz * t]); }
    for (let i = 0; i < pts.length - 1; i++) ropeParts.push({ g: G.bar(...pts[i], ...pts[i + 1], 0.018, 4), c: COL.ink });
    for (let i = 1; i < n; i++) {
      const t = i / n, x = ax + dx * t, y = ay + (by - ay) * t - Math.sin(t * Math.PI) * sag, z = az + dz * t, hw = Math.min(0.34, l / n * 0.42), hh = 0.62; c.setHex(FLAGS[i % 5]);
      const q = [[-hw, 0, 0], [hw, 0, 0], [-hw, -hh, 1], [hw, 0, 0], [hw, -hh, 1], [-hw, -hh, 1]];
      for (const [s, v, w] of q) { flagParts.pos.push(x + tx * s, y + v, z + tz * s); flagParts.nor.push(nx, 0, nz); flagParts.col.push(c.r, c.g, c.b); flagParts.uv.push(s, w); }
    }
  }
  function post(x, z, h, c = COL.woodDark, r = 0.075) { const y = Y(x, z); ropeParts.push({ g: G.cyl(r * 0.8, r, h, 6, x, y + h / 2 - 0.2, z), c }); return y + h - 0.25; }

  /* ---------- Building blocks ---------- */
  function tent(x, z, c, yaw) {
    const dome = new THREE.SphereGeometry(1.55, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.92, 1.3);
    const fly = new THREE.SphereGeometry(1.62, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2.6); fly.scale(1, 0.94, 1.3);
    const door = new THREE.SphereGeometry(0.72, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); door.scale(1, 1.35, 0.5); door.translate(0, 0, 1.78);
    const m = mesh([{ g: dome, c: [c, c] }, { g: fly, c: COL.white }, { g: door, c: 0x26272e }, { g: G.torus(1.58, 0.03, 0, 0, 0, 0, 0, 16, Math.PI), c: COL.ink }, { g: G.torus(2.0, 0.03, 0, 0, 0, 0, 0, 16, Math.PI).rotateY(Math.PI / 2).scale(1, 0.74, 1), c: COL.ink }]);
    put(m, x, z, yaw, -0.03); solid(x, z, 1.5, Y(x, z) + 1.6);
  }
  function fire(x, z) {
    const y = Y(x, z), g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    const parts = []; for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283; parts.push({ g: G.blob(0.2, Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62, rnd, 0.3, 0, 0.75), c: [0x5f5850, 0x8d857c] }); }
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; parts.push({ g: G.cyl(0.07, 0.085, 0.9, 6, 0, 0, 0, 1.15, 0, a).translate(Math.sin(a) * 0.12, 0.2, Math.cos(a) * 0.12), c: 0x3a2618 }); }
    g.add(mesh(parts));
    const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.85, 7), glow(0xff7a1a, 2.6)), f2 = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 6), glow(0xffd257, 3.4)); f1.position.y = 0.52; f2.position.y = 0.45; g.add(f1, f2);
    W.tick.push((dt, t) => { const s = 1 + Math.sin(t * 11 + x) * 0.14 + Math.sin(t * 17) * 0.08; f1.scale.set(s, 1 + Math.sin(t * 9 + z) * 0.24, s); f2.scale.y = 1 + Math.sin(t * 13) * 0.28; f1.rotation.y = t * 2; });
    W.fires.push({ x, y: y + 0.7, z }); solid(x, z, 0.6, y + 0.5); W.interact.push({ x, z, y, r: 2.3, text: 'Sit by the fire', sit: true });
    for (let i = 0; i < 2; i++) { const a = i * 2.6 + 1.2 + rnd(), lx = x + Math.cos(a) * 1.7, lz = z + Math.sin(a) * 1.7; put(mesh([{ g: G.cyl(0.24, 0.26, 1.3, 9, 0, 0.22, 0, Math.PI / 2), c: [0x4a3020, 0x7a5236] }]), lx, lz, a + Math.PI / 2 + Math.PI / 2); solid(lx, lz, 0.45, Y(lx, lz) + 0.5); }
  }
  function lantern(x, z) {
    const y = Y(x, z); ropeParts.push({ g: G.cyl(0.05, 0.065, 1.9, 6, x, y + 0.85, z), c: COL.woodDark }, { g: G.box(0.34, 0.05, 0.34, x, y + 1.82, z), c: COL.maroon }, { g: G.cone(0.26, 0.2, 4, x, y + 2.26, z).rotateY(0), c: COL.maroon });
    W.lamps.push([x, y + 2.0, z]);
  }
  function chorten(x, z, s = 1) {
    const m = mesh([{ g: G.box(2.3, 0.5, 2.3, 0, 0.25, 0), c: COL.white }, { g: G.box(1.8, 0.45, 1.8, 0, 0.72, 0), c: COL.white }, { g: G.box(1.86, 0.14, 1.86, 0, 1.0, 0), c: COL.maroon }, { g: G.box(1.4, 0.4, 1.4, 0, 1.27, 0), c: COL.white },
      { g: G.lathe([[0, 0], [0.62, 0], [0.86, 0.4], [0.84, 0.82], [0.55, 1.2], [0.3, 1.32], [0, 1.34]], 18, 0, 1.46, 0), c: [0xe9e2d0, 0xfbf7ee] }, { g: G.box(0.5, 0.26, 0.5, 0, 2.9, 0), c: COL.gold },
      { g: G.lathe([[0.24, 0], [0.21, 0.12], [0.19, 0.12], [0.16, 0.26], [0.14, 0.26], [0.11, 0.42], [0.09, 0.42], [0.05, 0.62], [0, 0.66]], 10, 0, 3.02, 0), c: COL.gold }, { g: G.ball(0.1, 0, 3.78, 0), c: COL.gold }], vmat);
    m.scale.setScalar(s); put(m, x, z, rnd() * 0.3); solid(x, z, 1.5 * s, Y(x, z) + 3.4 * s);
  }
  // A timber frame with something to read on it
  function board(x, z, yaw, tex, o = {}) {
    const w = o.w || 2.6, h = o.h || 1.7, lift = o.lift || 0.85, g = new THREE.Group();
    g.add(mesh([{ g: G.cyl(0.07, 0.085, h + lift + 0.5, 7, -w / 2 - 0.02, (h + lift + 0.5) / 2 - 0.2, 0), c: COL.woodDark }, { g: G.cyl(0.07, 0.085, h + lift + 0.5, 7, w / 2 + 0.02, (h + lift + 0.5) / 2 - 0.2, 0), c: COL.woodDark },
      { g: G.box(w + 0.7, 0.1, 0.5, 0, h + lift + 0.22, 0, 0, 0.0), c: o.roof || COL.maroon }, { g: G.box(w + 0.5, 0.06, 0.34, 0, h + lift + 0.3, 0), c: COL.gold }, { g: G.box(w + 0.12, h + 0.12, 0.07, 0, lift + h / 2, -0.03), c: COL.wood }]));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissiveMap: o.glow ? tex : null, emissive: o.glow ? 0xffffff : 0, emissiveIntensity: o.glow || 0 })); face.position.set(0, lift + h / 2, 0.012); g.add(face);
    put(g, x, z, yaw); solid(x, z, 0.8, Y(x, z) + 3); return g;
  }
  const frame = c => ({ at: (u, v) => ({ x: c.x + c.out.x * u + c.side.x * v, z: c.z + c.out.z * u + c.side.z * v }), face: Math.atan2(c.out.x, c.out.z), inward: Math.atan2(-c.out.x, -c.out.z) });
  const crate = (w, c = COL.wood) => [{ g: G.box(w, w, w, 0, w / 2, 0), c }, { g: G.box(w + 0.04, 0.07, w + 0.04, 0, w * 0.2, 0), c: COL.woodDark }, { g: G.box(w + 0.04, 0.07, w + 0.04, 0, w * 0.8, 0), c: COL.woodDark }];

  /* ---------- Camps ---------- */
  const NAMES = { base: ['Base camp', '2,400 m'], teaching: ['Camp 1 · Teaching', ''], experience: ['Camp 2 · Experience', ''], projects: ['Camp 3 · Projects', ''], research: ['Camp 4 · Research', ''], contact: ['Summit · Contact', ''] };
  const alt = y => (Math.round((2400 + y * 25) / 10) * 10).toLocaleString('en-US') + ' m';
  T.CAMPS.forEach((c, i) => {
    const F = frame(c), sign = label(NAMES[c.id][0], { sub: alt(c.y) }); sign.position.set(c.x, c.y + 7.2, c.z); scene.add(sign); W.signs.push({ sp: sign, camp: c });
    if (i === 0 || i === 5) return;
    const R = T.CAMP_R[c.id];
    const t1 = F.at(3.6, 6.3), t2 = F.at(4.4, -6.2); tent(t1.x, t1.z, i % 2 ? COL.ember : COL.gold, F.inward - 0.5); tent(t2.x, t2.z, i % 2 ? COL.teal : COL.ember, F.inward + 0.45);
    const fa = F.at(R - 1, -R + 0.5), fb = F.at(R - 1, R - 0.5); flagLine(fa.x, post(fa.x, fa.z, 4.4), fa.z, fb.x, post(fb.x, fb.z, 4.4), fb.z, 17, 0.9);
    const fp = F.at(-1.8, 3.4); fire(fp.x, fp.z);
    for (const v of [-R + 1.5, R - 1.5]) { const l = F.at(-R + 5.4, v); lantern(l.x, l.z); }
    // Somewhere to leave a bike, or pick up a snowmobile
    const pk = F.at(-R + 6.6, -R + 2.6); W.spawns.push({ kind: c.id === 'research' ? 'sled' : 'bike', x: pk.x, z: pk.z, yaw: F.face + 1.2 });
    if (c.id === 'projects') { const p2 = F.at(-R + 6.6, R - 2.6); W.spawns.push({ kind: 'sled', x: p2.x, z: p2.z, yaw: F.face - 1.2 }); }
    // A column of rising air just off the edge
    const th = F.at(R + 13, 0); W.thermals.push({ x: th.x, z: th.z, r: 13, y0: Y(th.x, th.z), top: T.SUMMIT_Y + 34 });
  });
  // Lanterns along the trail
  for (let s = 40; s < T.TRAIL_LEN - 20; s += 34) { const p = T.trailAt(s), side = (Math.round(s / 34) % 2 ? 1 : -1) * 3.3, x = p.x - p.dz * side, z = p.z + p.dx * side; if (!T.inGorge(x, z, 3) && T.CAMPS.every(c => Math.hypot(x - c.x, z - c.z) > T.CAMP_R[c.id] + 2)) lantern(x, z); }

  // Base camp: a small dzong, prayer wheels, a chorten, the trailhead gate
  {
    const c = T.camp('base'), F = frame(c);
    const dz = F.at(-2, 29), dy = Y(dz.x, dz.z) - 0.6, wall = (w, h, d, y, taper = 0.9) => { const g = new THREE.CylinderGeometry(Math.SQRT1_2 * taper, Math.SQRT1_2, 1, 4, 1); g.rotateY(Math.PI / 4); g.scale(w, h, d); g.translate(0, y + h / 2, 0); return g; };
    const roof = (w, d, y, h = 0.9, c1 = COL.maroon) => [{ g: wall(w + 2.6, 0.22, d + 2.6, y, 1), c: COL.gold }, { g: wall(w + 2.2, h, d + 2.2, y + 0.22, 0.42), c: [c1, 0xb5343f] }];
    const parts = [{ g: wall(17, 8, 11, 0, 0.9), c: [0xe6dfd0, 0xfaf6ec] }, { g: wall(15.5, 1.3, 10.1, 6.5, 0.985), c: COL.maroon }, ...roof(15.2, 9.8, 8.0),
      { g: wall(7.2, 5, 6.2, 8.9, 0.92), c: [0xe6dfd0, 0xfaf6ec] }, { g: wall(6.7, 0.9, 5.8, 12.6, 0.985), c: COL.maroon }, ...roof(6.6, 5.6, 13.9, 0.8), { g: wall(3.2, 1.6, 2.8, 14.9, 0.9), c: COL.white }, ...roof(2.9, 2.5, 16.5, 0.7, COL.gold),
      { g: G.lathe([[0.28, 0], [0.34, 0.25], [0.16, 0.5], [0.22, 0.75], [0.06, 1.15], [0, 1.2]], 10, 0, 17.4, 0), c: COL.gold },
      { g: G.box(3.4, 4.2, 0.5, 0, 2.1, 5.35), c: COL.maroon }, { g: G.box(2.4, 3.4, 0.5, 0, 1.7, 5.45), c: 0x3a1a16 }, { g: G.box(4.2, 0.4, 1.2, 0, 4.4, 5.5), c: COL.gold }];
    for (const [wx, wy] of [[-6, 4.6], [-3.6, 4.6], [3.6, 4.6], [6, 4.6], [-6, 2.2], [6, 2.2], [-2.1, 10.6], [0, 10.6], [2.1, 10.6]]) { const zf = wy > 9 ? 2.95 : 5.2 - (wy - 2) * 0.07; parts.push({ g: G.box(1.15, 1.5, 0.3, wx * (wy > 9 ? 1 : 0.97), wy, zf), c: 0x241c1c }, { g: G.box(1.45, 0.16, 0.4, wx * (wy > 9 ? 1 : 0.97), wy + 0.86, zf), c: COL.gold }, { g: G.box(1.45, 0.12, 0.4, wx * (wy > 9 ? 1 : 0.97), wy - 0.8, zf), c: COL.maroon }); }
    for (let s = 0; s < 4; s++) parts.push({ g: G.box(6 + s * 0.9, 0.22, 1.1, 0, 0.55 - s * 0.2, 6.2 + s * 0.6), c: 0xd8d0c0 });
    const dzong = mesh(parts); dzong.position.set(dz.x, dy, dz.z); dzong.rotation.y = Math.atan2(c.x - dz.x, c.z - dz.z); scene.add(dzong);
    for (let k = -1; k <= 1; k++) { const o = new THREE.Vector3(k * 5.6, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), dzong.rotation.y); solid(dz.x + o.x, dz.z + o.z, 6.2, dy + 14); }
    const t1 = F.at(-7, -9); tent(t1.x, t1.z, COL.ember, F.face + 2.2); const t2 = F.at(-11, -3.5); tent(t2.x, t2.z, COL.gold, F.face + 1.7); const t3 = F.at(-11.5, 4.5); tent(t3.x, t3.z, COL.teal, F.face + 1.3);
    const fa = F.at(-3, -13), fb = F.at(-14, 0); flagLine(fa.x, post(fa.x, fa.z, 4.6), fa.z, fb.x, post(fb.x, fb.z, 4.6), fb.z, 18, 1.0);
    const fc = F.at(8, 13); flagLine(fb.x, Y(fb.x, fb.z) + 4.35, fb.z, fc.x, post(fc.x, fc.z, 4.6), fc.z, 22, 1.2);
    const fp = F.at(-6.5, -3); fire(fp.x, fp.z);
    const ch = F.at(5, -12.5); chorten(ch.x, ch.z, 1.15);
    // A wall of prayer wheels: they turn as you pass
    const yawW = F.face + Math.PI / 2 + 0.2;
    for (let k = 0; k < 5; k++) {
      const p = F.at(9.5, 2 + k * 1.9), py = Y(p.x, p.z);
      put(mesh([{ g: G.box(1.7, 0.3, 1.5, 0, 0.15, 0), c: COL.white }, { g: G.box(0.14, 2.3, 0.14, -0.72, 1.3, 0), c: COL.maroon }, { g: G.box(0.14, 2.3, 0.14, 0.72, 1.3, 0), c: COL.maroon }, { g: G.box(2.0, 0.16, 1.9, 0, 2.5, 0), c: COL.gold }, { g: G.cone(1.5, 0.6, 4, 0, 2.88, 0).rotateY(Math.PI / 4), c: [COL.maroon, 0xb5343f] }, { g: G.cyl(0.03, 0.03, 2.2, 5, 0, 1.4, 0), c: COL.ink }]), p.x, p.z, yawW);
      const wheel = new THREE.Mesh(merged([{ g: G.cyl(0.46, 0.46, 1.25, 16, 0, 0, 0), c: [0xb5361c, COL.ember] }, { g: G.cyl(0.5, 0.5, 0.12, 16, 0, 0.56, 0), c: COL.gold }, { g: G.cyl(0.5, 0.5, 0.12, 16, 0, -0.56, 0), c: COL.gold }, { g: G.cyl(0.49, 0.49, 0.08, 16, 0, 0, 0), c: COL.gold }]), vmatShiny);
      wheel.position.set(p.x, py + 1.35, p.z); wheel.castShadow = true; scene.add(wheel); solid(p.x, p.z, 0.85, py + 3); W.spinners.push({ m: wheel, x: p.x, z: p.z, y: py, v: 0, r: 2.6 });
    }
    // Trailhead gate
    const gp = T.trailAt(21), gyaw = Math.atan2(gp.dx, gp.dz), tex = canvasTexture(1024, 160, (g, w, h) => { g.fillStyle = '#7a1f26'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2a900'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.fillStyle = '#fbf6ea'; g.font = '800 78px ' + FONT.sans; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HARI ACHARYA  ·  THE CLIMB', w / 2, h / 2 + 4); });
    const gate = new THREE.Group(); gate.add(mesh([{ g: G.cyl(0.2, 0.26, 5.4, 8, -3.4, 2.5, 0), c: [0x4a2f20, 0x7a5236] }, { g: G.cyl(0.2, 0.26, 5.4, 8, 3.4, 2.5, 0), c: [0x4a2f20, 0x7a5236] }, { g: G.box(8.6, 0.3, 0.6, 0, 5.2, 0), c: COL.gold }, { g: G.box(8.0, 0.22, 0.9, 0, 5.45, 0), c: COL.maroon }, { g: G.box(7.2, 1.1, 0.16, 0, 4.4, 0), c: COL.woodDark }]));
    for (const s of [1, -1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(6.9, 0.95), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); b.position.set(0, 4.4, 0.09 * s); b.rotation.y = s > 0 ? 0 : Math.PI; gate.add(b); }
    put(gate, gp.x, gp.z, gyaw); for (const s of [-3.4, 3.4]) solid(gp.x + gp.dz * s, gp.z - gp.dx * s, 0.4, gp.y + 5);
    // Bikes by the gate, and the first thermal out on the meadow with a windsock beside it
    for (let k = 0; k < 2; k++) { const p = F.at(1.5 + k * 1.3, -6.5); W.spawns.push({ kind: 'bike', x: p.x, z: p.z, yaw: F.inward + 0.5 }); }
    const sp = F.at(4.5, 7.5); W.spawns.push({ kind: 'sled', x: sp.x, z: sp.z, yaw: F.inward });
    const th = F.at(22, -17); W.thermals.push({ x: th.x, z: th.z, r: 15, y0: Y(th.x, th.z), top: T.SUMMIT_Y + 36 });
    const board0 = F.at(-1.5, 12.5);
    board(board0.x, board0.z, F.face + 2.4, canvasTexture(768, 512, (g, w, h) => {
      g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#7a1f26'; g.fillRect(0, 0, w, 74); g.fillStyle = '#fbf6ea'; g.font = '800 44px ' + FONT.sans; g.textBaseline = 'middle'; g.fillText('WAYS UP, WAYS DOWN', 30, 40);
      g.fillStyle = '#1c1e24'; g.font = '700 34px ' + FONT.sans; const rows = [['On foot', 'Walk the trail, or climb any rock'], ['Bike', 'Racks at the lower camps'], ['Paraglider', 'Jump, then Space. Ride the thermals up'], ['Snowmobile', 'Parked up high for the run down'], ['Zip line', 'Summit to here in ten seconds']];
      rows.forEach(([a, b], i) => { const y = 122 + i * 78; g.fillStyle = '#7a1f26'; g.font = '800 34px ' + FONT.sans; g.fillText(a, 30, y); g.fillStyle = '#4a4d57'; g.font = '500 27px ' + FONT.sans; g.fillText(b, 30, y + 36); });
    }), { w: 3.0, h: 2.0 });
  }

  // Camp 1, teaching: an outdoor classroom
  {
    const c = T.camp('teaching'), F = frame(c), p = F.at(3.4, 0);
    board(p.x, p.z, F.inward, canvasTexture(1024, 640, (g, w, h) => {
      g.fillStyle = '#21402f'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 60; i++) g.fillRect(rnd() * w, rnd() * h, 80 + rnd() * 260, 3 + rnd() * 10);
      g.strokeStyle = '#f4f1e4'; g.fillStyle = '#f4f1e4'; g.lineWidth = 7; g.lineCap = 'round'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '400 86px ' + FONT.chalk; g.fillText('Teaching', w / 2, 96);
      g.font = '600 46px ' + FONT.hand; const st = [[250, 370, 'q0'], [512, 250, 'q1'], [774, 370, 'q2']];
      st.forEach(([x, y, n], i) => { g.beginPath(); g.arc(x, y, 62, 0, 6.3); g.stroke(); if (i === 2) { g.beginPath(); g.arc(x, y, 50, 0, 6.3); g.stroke(); } g.fillText(n, x, y + 2); });
      const arrow = (x0, y0, x1, y1, t) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); const a = Math.atan2(y1 - y0, x1 - x0); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - 24 * Math.cos(a - 0.5), y1 - 24 * Math.sin(a - 0.5)); g.lineTo(x1 - 24 * Math.cos(a + 0.5), y1 - 24 * Math.sin(a + 0.5)); g.fill(); g.fillText(t, (x0 + x1) / 2, (y0 + y1) / 2 - 32); };
      arrow(306, 344, 452, 278, '0'); arrow(572, 278, 716, 344, '1'); arrow(120, 370, 184, 370, '');
      g.fillStyle = '#ffd86b'; g.font = '600 52px ' + FONT.hand; g.fillText('CSC 280  ·  does it halt?', w / 2, 540);
    }), { w: 3.4, h: 2.1, roof: COL.woodDark, lift: 0.7 });
    W.interact.push({ x: p.x - c.out.x * 1.7, z: p.z - c.out.z * 1.7, y: c.y, r: 3.6, text: 'Read the chalkboard', open: 'teaching' });
    for (let k = 0; k < 5; k++) { const q = F.at(0.4 - Math.abs(k - 2) * 0.35, (k - 2) * 1.5); put(mesh([{ g: G.cyl(0.3, 0.33, 0.48, 10, 0, 0.24, 0), c: [0x5b3a26, 0xb98a5c] }]), q.x, q.z, rnd() * 3); solid(q.x, q.z, 0.3, c.y + 0.5); }
  }
  // Camp 2, experience: the expedition's depot. A journal on a lectern, a signpost of places worked, solar panels for the summer at Buffalo Solar
  {
    const c = T.camp('experience'), F = frame(c), p = F.at(3.2, 0.4), tex = canvasTexture(512, 360, (g, w, h) => {
      g.fillStyle = '#f3e7cc'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(90,60,30,0.35)'; g.lineWidth = 2; for (let y = 96; y < h - 20; y += 38) { g.beginPath(); g.moveTo(26, y); g.lineTo(w / 2 - 14, y); g.moveTo(w / 2 + 14, y); g.lineTo(w - 26, y); g.stroke(); }
      g.fillStyle = 'rgba(60,40,20,0.25)'; g.fillRect(w / 2 - 3, 0, 6, h); g.fillStyle = '#3a2a1c'; g.font = '700 40px ' + FONT.hand; g.fillText('Expedition log', 30, 56);
      g.save(); g.translate(380, 190); g.rotate(-0.2); g.strokeStyle = '#a3261e'; g.lineWidth = 6; g.strokeRect(-92, -50, 184, 100); g.fillStyle = '#a3261e'; g.font = '800 36px ' + FONT.sans; g.textAlign = 'center'; g.fillText('6 POSTS', 0, 14); g.restore();
    });
    const lect = new THREE.Group(); lect.add(mesh([{ g: G.cyl(0.09, 0.13, 1.05, 8, 0, 0.5, 0), c: [0x4a2f20, 0x7a5236] }, { g: G.box(0.7, 0.08, 0.6, 0, 0.04, 0), c: COL.woodDark }, { g: G.box(1.24, 0.07, 0.86, 0, 1.12, 0, 0, 0.45), c: COL.wood }, { g: G.box(1.12, 0.08, 0.74, 0, 1.17, 0.02, 0, 0.45), c: 0x5a2a1a }]));
    const page = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.68), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })); page.rotation.x = -Math.PI / 2 + 0.45; page.position.set(0, 1.225, 0.04); lect.add(page);
    put(lect, p.x, p.z, F.inward); solid(p.x, p.z, 0.6, c.y + 1.4);
    W.interact.push({ x: p.x - c.out.x * 1.3, z: p.z - c.out.z * 1.3, y: c.y, r: 3.4, text: 'Open the expedition log', open: 'experience' });
    const sp = F.at(2.6, -3.4), places = [['Rochester, NY', 0x285a80, 0.3], ['Buffalo, NY', 0xb5651d, -0.5], ['Thimphu, Bhutan', 0x8a1f2b, 1.9], ['Wales, UK', 0x2f6048, 1.2]], sg = new THREE.Group();
    sg.add(mesh([{ g: G.cyl(0.07, 0.09, 3.5, 7, 0, 1.6, 0), c: [0x4a2f20, 0x7a5236] }]));
    places.forEach(([name, col, a], k) => { const t = canvasTexture(512, 110, (g, w, h) => { g.fillStyle = '#' + col.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '700 58px ' + FONT.sans; g.textBaseline = 'middle'; g.fillText(name, 22, h / 2 + 3); }); const a2 = new THREE.Group(); for (const s of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.36), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 })); m.position.set(0.9 * s, 0, 0.03 * s); if (s < 0) { m.rotation.y = Math.PI; m.position.x = 0.9; } a2.add(m); } const bk = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.4, 0.045), mat(COL.woodDark)); bk.position.x = 0.9; a2.add(bk); a2.position.y = 3.1 - k * 0.5; a2.rotation.y = a; sg.add(a2); });
    put(sg, sp.x, sp.z, F.inward); solid(sp.x, sp.z, 0.3, c.y + 3);
    for (let k = 0; k < 3; k++) { const q = F.at(5.6, 1.4 + k * 1.75); const m = mesh([{ g: G.box(1.6, 0.07, 1.05, 0, 0.9, 0, 0, -0.55), c: 0x1f3f78 }, { g: G.box(1.7, 0.05, 1.15, 0, 0.87, 0, 0, -0.55), c: 0xd9dde2 }, { g: G.box(0.07, 0.9, 0.07, -0.6, 0.45, -0.25), c: COL.steel }, { g: G.box(0.07, 0.9, 0.07, 0.6, 0.45, -0.25), c: COL.steel }], vmatShiny); put(m, q.x, q.z, F.face + Math.PI - 0.5); }
  }
  // Camp 3, projects: a workshop shelter with one glowing screen per project
  {
    const c = T.camp('projects'), F = frame(c), list = content.projects.items, hub = F.at(4.2, 0), accent = ['#ff5a5f', '#4cc9f0', '#8ce99a', '#ffd43b'];
    const sh = new THREE.Group(); sh.add(mesh([...[[-4.4, -0.9], [4.4, -0.9], [-4.4, 1.1], [4.4, 1.1]].map(([x, z]) => ({ g: G.cyl(0.09, 0.11, z > 0 ? 3.5 : 2.9, 7, x, (z > 0 ? 3.5 : 2.9) / 2 - 0.2, z), c: [0x4a2f20, 0x7a5236] })),
      { g: G.box(9.6, 0.12, 3.2, 0, 3.05, 0.1, 0, -0.29), c: [0x2a4a3a, 0x3f6a52] }, { g: G.box(9.2, 0.1, 1.0, 0, 0.98, 0.25), c: COL.wood }, { g: G.box(0.1, 0.98, 0.9, -4.3, 0.49, 0.25), c: COL.woodDark }, { g: G.box(0.1, 0.98, 0.9, 4.3, 0.49, 0.25), c: COL.woodDark }, { g: G.box(0.1, 0.98, 0.9, 0, 0.49, 0.25), c: COL.woodDark }]));
    list.forEach((it, k) => {
      const tex = canvasTexture(640, 420, (g, w, h) => {
        g.fillStyle = '#0c1014'; g.fillRect(0, 0, w, h); g.fillStyle = accent[k]; g.fillRect(0, 0, w, 44); g.fillStyle = '#0c1014'; g.font = '700 26px ' + FONT.mono; g.textBaseline = 'middle'; g.fillText('~/projects/' + (k + 1), 18, 23);
        g.fillStyle = '#e8f1f2'; g.font = '700 54px ' + FONT.mono; let y = 112; for (const l of wrapText(g, it.title, w - 50).slice(0, 3)) { g.fillText(l, 26, y); y += 62; }
        g.fillStyle = accent[k]; g.font = '400 28px ' + FONT.mono; y += 8; for (const l of wrapText(g, it.chips, w - 50).slice(0, 2)) { g.fillText(l, 26, y); y += 38; }
        g.fillStyle = '#7d8a94'; g.fillText('$ press E to open_', 26, h - 34);
      });
      const x = (k - 1.5) * 2.2, mon = new THREE.Group(); mon.add(mesh([{ g: G.box(1.9, 1.28, 0.1, 0, 0, 0), c: 0x202329 }, { g: G.box(0.14, 0.5, 0.1, 0, -0.84, -0.06), c: 0x202329 }, { g: G.box(0.8, 0.05, 0.5, 0, -1.07, 0), c: 0x202329 }]));
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.76, 1.15), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.4 })); scr.position.z = 0.055; mon.add(scr);
      mon.position.set(x, 2.12, 0.3); mon.rotation.x = -0.08; sh.add(mon);
      const wp = F.at(4.2 - 1.9, x); W.interact.push({ x: wp.x, z: wp.z, y: c.y, r: 1.5, text: 'Open ' + it.title, open: 'projects', item: k });
    });
    put(sh, hub.x, hub.z, F.inward); for (let k = -2; k <= 2; k++) { const q = F.at(4.4, k * 2.1); solid(q.x, q.z, 1.15, c.y + 3.2); }
  }
  // Camp 4, research: a field observatory. A camera on a tripod looking out, a weather mast, a light table of papers
  {
    const c = T.camp('research'), F = frame(c), p = F.at(3.0, 0.2);
    const tex = canvasTexture(512, 360, (g, w, h) => { g.fillStyle = '#eef3f7'; g.fillRect(0, 0, w, h); for (let k = 0; k < 4; k++) { g.save(); g.translate(96 + k * 104, 180 + (k % 2) * 22); g.rotate((k - 1.5) * 0.09); g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 10; g.fillRect(-58, -84, 116, 168); g.shadowBlur = 0; g.fillStyle = '#1c1e24'; g.fillRect(-44, -66, 70, 9); g.fillRect(-44, -50, 54, 9); g.fillStyle = '#9aa3ad'; for (let l = 0; l < 9; l++) g.fillRect(-44, -26 + l * 11, 88 - (l % 3) * 14, 4); g.restore(); } });
    const tb = new THREE.Group(); tb.add(mesh([{ g: G.box(2.3, 0.1, 1.3, 0, 1.0, 0), c: 0xdfe5ea }, ...[[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]].map(([x, z]) => ({ g: G.cyl(0.04, 0.04, 1.0, 6, x, 0.5, z), c: COL.steel }))], vmatShiny));
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.14), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 })); top.rotation.x = -Math.PI / 2; top.position.y = 1.056; tb.add(top);
    put(tb, p.x, p.z, F.inward); solid(p.x, p.z, 1.15, c.y + 1.2);
    W.interact.push({ x: p.x - c.out.x * 1.5, z: p.z - c.out.z * 1.5, y: c.y, r: 3.4, text: 'Look at the papers', open: 'research' });
    const q = F.at(5.6, -3.4), cam = mesh([{ g: G.bar(0, 1.5, 0, 0.5, 0, 0.35, 0.03), c: COL.ink }, { g: G.bar(0, 1.5, 0, -0.5, 0, 0.35, 0.03), c: COL.ink }, { g: G.bar(0, 1.5, 0, 0, 0, -0.6, 0.03), c: COL.ink }, { g: G.box(0.46, 0.34, 0.3, 0, 1.68, 0), c: 0x24262c }, { g: G.cyl(0.13, 0.15, 0.34, 14, 0, 1.68, 0.3, Math.PI / 2), c: 0x3a3d46 }, { g: G.cyl(0.11, 0.11, 0.02, 14, 0, 1.68, 0.475, Math.PI / 2), c: 0x1c5a8a }, { g: G.box(0.14, 0.08, 0.14, 0.1, 1.9, 0), c: COL.gold }], vmatShiny);
    put(cam, q.x, q.z, F.face); solid(q.x, q.z, 0.5, c.y + 2);
    const ms = F.at(5.4, 4.2), mast = new THREE.Group(); mast.add(mesh([{ g: G.cyl(0.04, 0.06, 4.6, 7, 0, 2.2, 0), c: COL.steel }, { g: G.box(0.5, 0.4, 0.3, 0, 1.4, 0.16), c: 0xe8ecf0 }, { g: G.bar(0, 3.8, 0, 0.9, 3.8, 0, 0.02), c: COL.steel }, { g: G.cone(0.3, 0.26, 12, 0.9, 3.95, 0, Math.PI), c: 0xe8ecf0 }], vmatShiny));
    const spin = mesh([0, 1, 2].flatMap(k => { const a = k * 2.094; return [{ g: G.bar(0, 0, 0, Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42, 0.012), c: COL.steel }, { g: G.ball(0.09, Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46, 1, 1, 1, 8), c: COL.ink }]; }), vmatShiny); spin.position.y = 4.56; mast.add(spin);
    put(mast, ms.x, ms.z); solid(ms.x, ms.z, 0.3, c.y + 4); W.tick.push(dt => { spin.rotation.y += dt * 7; });
  }
  // Summit: a cairn and a mast of prayer flags, and a brass box with the register in it
  {
    const c = T.camp('contact'), F = frame(c), mp = F.at(-1.4, 0.8), my = Y(mp.x, mp.z), top = 7.4, parts = [];
    let cy = 0; for (let k = 0; k < 6; k++) { const r = 0.95 - k * 0.13; parts.push({ g: G.blob(r, (rnd() - 0.5) * 0.1, cy + r * 0.45, (rnd() - 0.5) * 0.1, rnd, 0.22, 1, 0.62), c: [0x5d5f69, 0x9a9ca6] }); cy += r * 0.74; }
    parts.push({ g: G.cyl(0.05, 0.07, top, 7, 0, top / 2, 0), c: COL.ink }, { g: G.ball(0.16, 0, top + 0.1, 0), c: COL.gold });
    const cairn = mesh(parts); cairn.position.set(mp.x, my, mp.z); scene.add(cairn); solid(mp.x, mp.z, 1.05, my + top);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3, ex = mp.x + Math.cos(a) * 9, ez = mp.z + Math.sin(a) * 9; flagLine(mp.x, my + top - 0.2, mp.z, ex, Y(ex, ez) + 0.5, ez, 15, 0.7); }
    const bp = F.at(2.6, -1.6), bx = mesh([{ g: G.cyl(0.07, 0.09, 1.0, 7, 0, 0.5, 0), c: [0x4a2f20, 0x7a5236] }, { g: G.box(0.9, 0.5, 0.6, 0, 1.25, 0), c: 0xb8862a }, { g: G.box(0.96, 0.1, 0.66, 0, 1.55, 0), c: 0xd9a531 }, { g: G.box(0.2, 0.16, 0.05, 0, 1.3, 0.31), c: 0x6b4a12 }, { g: G.box(0.98, 0.06, 0.68, 0, 1.12, 0), c: 0x6b4a12 }], vmatShiny);
    put(bx, bp.x, bp.z, Math.atan2(c.x - bp.x, c.z - bp.z)); solid(bp.x, bp.z, 0.55, c.y + 2);
    W.interact.push({ x: bp.x, z: bp.z, y: c.y, r: 3.3, text: 'Open the summit box', open: 'contact' });
    const sp = F.at(-3.2, -3.6); W.spawns.push({ kind: 'sled', x: sp.x, z: sp.z, yaw: Math.atan2(Math.cos(T.CHUTE), Math.sin(T.CHUTE)) });
  }

  /* ---------- Bridges ---------- */
  for (const b of T.BRIDGES) {
    const g = new THREE.Group(); g.position.set(b.x, b.y, b.z); g.rotation.y = b.yaw; scene.add(g);
    const parts = [], sl = (b.y1 - b.y0) / (2 * b.half), sagAt = s => -Math.cos(s / b.half * Math.PI / 2) * 0.0;
    for (let s = -b.half - 0.3; s <= b.half + 0.3; s += 0.56) parts.push({ g: G.box(b.w, 0.1, 0.44, 0, s * sl - 0.05 + sagAt(s), s, 0, -Math.atan(sl)), c: rnd() > 0.5 ? COL.wood : 0x7d5236 });
    for (const sx of [-1, 1]) {
      const x = sx * b.w / 2;
      for (const yy of [1.05, 0.02]) parts.push({ g: G.bar(x, -b.half * sl + yy, -b.half - 0.6, x, b.half * sl + yy, b.half + 0.6, 0.035), c: COL.rope });
      for (let s = -b.half; s <= b.half; s += 1.12) parts.push({ g: G.bar(x, s * sl, s, x, s * sl + 1.05, s, 0.018, 4), c: COL.rope });
      for (const e of [-1, 1]) parts.push({ g: G.cyl(0.14, 0.17, 2.6, 8, sx * (b.w / 2 + 0.1), e * b.half * sl + 0.9, e * (b.half + 0.7)), c: [0x4a2f20, 0x7a5236] });
    }
    g.add(mesh(parts));
    const rot = (x, y, z) => new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw).add(g.position), a = rot(b.w / 2 + 0.1, -b.half * sl + 2.1, -b.half - 0.7), e = rot(b.w / 2 + 0.1, b.half * sl + 2.1, b.half + 0.7);
    flagLine(a.x, a.y, a.z, e.x, e.y, e.z, 22, 0.9);
  }

  /* ---------- Marked routes: holds, a fixed rope, a name at the foot ---------- */
  {
    const holdG = new THREE.DodecahedronGeometry(0.17, 0), holds = new THREE.InstancedMesh(holdG, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 260), M = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), cc = new THREE.Color(); let n = 0;
    T.ROUTES.forEach((R, ri) => {
      const tx = -R.dir.z, tz = R.dir.x, rope = [];
      for (let s = -0.5; s <= 8.6; s += 0.4) {
        const px = R.foot.x + R.dir.x * s, pz = R.foot.z + R.dir.z * s; rope.push(new THREE.Vector3(px, Y(px, pz) + 0.25, pz));
        for (let k = 0; k < 3 && n < 260; k++) { const off = (rnd() - 0.5) * 5, x = px + tx * off, z = pz + tz * off, gr = T.gradient(x, z, 0.8); if (Math.hypot(gr.gx, gr.gz) < 0.7) continue; q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)); const s2 = 0.8 + rnd() * 0.9; sv.set(s2, s2 * 0.7, s2); pv.set(x, Y(x, z) + 0.06, z); M.compose(pv, q, sv); holds.setMatrixAt(n, M); holds.setColorAt(n, cc.setHex([0xf5c518, 0xd2332d, 0x2f72cf, 0x2f9a5c, 0xf7f3e8][(ri + (rnd() > 0.75 ? 1 : 0)) % 5])); n++; }
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rope), rope.length * 2, 0.04, 5), mat(0xe8e2d0)); tube.castShadow = true; scene.add(tube);
      const sp = label(R.name, { sub: R.grade, h: 0.6 }); sp.position.set(R.foot.x - R.dir.x * 1.2, Y(R.foot.x, R.foot.z) + 2.6, R.foot.z - R.dir.z * 1.2); scene.add(sp); W.signs.push({ sp, x: R.foot.x, z: R.foot.z, near: 16 });
    });
    holds.count = n; holds.instanceMatrix.needsUpdate = true; if (holds.instanceColor) holds.instanceColor.needsUpdate = true; holds.castShadow = true; scene.add(holds);
  }

  /* ---------- Chalk bags to find: each one adds to your stamina ---------- */
  {
    const spots = T.ROUTES.map(R => ({ x: R.top.x, z: R.top.z })), b = frame(T.camp('base'));
    spots.push(b.at(-4, 40), T.polar(T.GORGE, T.footR(T.GORGE) * 0.62), { x: T.LAKE.x + 6, z: T.LAKE.z - 3, dy: 1.1 }, T.polar(T.CHUTE + 0.5, 74));
    spots.forEach((s, i) => {
      const y = Math.max(Y(s.x, s.z), T.waterAt(s.x, s.z)) + 1.25, g = new THREE.Group(), bag = mesh([{ g: G.cyl(0.3, 0.24, 0.5, 12, 0, 0, 0), c: [0xd2332d, 0x2f72cf, 0x2f9a5c, 0xf5c518][i % 4] }, { g: G.cyl(0.25, 0.3, 0.12, 12, 0, 0.3, 0), c: 0xfbf6ea }, { g: G.torus(0.31, 0.03, 0, 0.2, 0, Math.PI / 2, 0, 14), c: COL.ink }]); g.add(bag);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe08a).multiplyScalar(2), transparent: true, opacity: 0.9, side: THREE.DoubleSide })); halo.rotation.x = -Math.PI / 2; halo.position.y = -0.9; g.add(halo);
      g.position.set(s.x, y, s.z); scene.add(g); W.pickups.push({ g, x: s.x, y, z: s.z, got: false, i });
    });
  }

  /* ---------- Rings in the sky, for the paraglider ---------- */
  {
    const geo = new THREE.TorusGeometry(3.1, 0.2, 8, 30), m = glow(0xffc629, 2.3), N = 8;
    for (let i = 0; i < N; i++) {
      const a = T.A0 + 0.5 + i * 0.78, r = 26 + i * 19, p = T.polar(a, r), y = Math.max(T.SUMMIT_Y + 2 - i * 12.5, Y(p.x, p.z) + 10), ring = new THREE.Mesh(geo, m);
      ring.position.set(p.x, y, p.z); ring.rotation.y = -a; scene.add(ring); W.rings.push({ m: ring, x: p.x, y, z: p.z, got: false, i });
    }
  }

  /* ---------- Zip line from the summit back to base camp: the clearest line down is chosen ---------- */
  {
    let best = null;
    for (let da = -0.9; da <= 0.9; da += 0.06) {
      const a = T.A0 + da, top = T.polar(a, 6.2), end = T.polar(a, 151), ty = Y(top.x, top.z) + 5.4, ey = Y(end.x, end.z) + 3.6; let min = 1e9;
      for (let u = 0.06; u < 0.97; u += 0.02) min = Math.min(min, ty + (ey - ty) * u - Y(top.x + (end.x - top.x) * u, top.z + (end.z - top.z) * u));
      if (!best || min > best.min) best = { a, top, end, ty, ey, min };
    }
    const { top, end, ty, ey, a } = best, A = new THREE.Vector3(top.x, ty, top.z), B = new THREE.Vector3(end.x, ey, end.z), parts = [{ g: G.bar(A.x, A.y, A.z, B.x, B.y, B.z, 0.03, 5), c: COL.ink }];
    for (const [p, h] of [[top, 5.4], [end, 3.6]]) { const y = Y(p.x, p.z), g = mesh([{ g: G.cyl(0.1, 0.13, h + 0.3, 7, -0.8, h / 2, 0), c: [0x4a2f20, 0x7a5236] }, { g: G.cyl(0.1, 0.13, h + 0.3, 7, 0.8, h / 2, 0), c: [0x4a2f20, 0x7a5236] }, { g: G.box(2.1, 0.2, 0.24, 0, h, 0), c: COL.woodDark }]); g.position.set(p.x, y, p.z); g.rotation.y = Math.atan2(end.x - top.x, end.z - top.z); scene.add(g); }
    scene.add(mesh(parts, vmat, false)); W.zip = { A, B, len: A.distanceTo(B) };
    W.interact.push({ x: top.x, z: top.z, y: ty - 5.4, r: 2.6, text: 'Ride the zip line down', zip: true });
    const sp = label('Zip line to base camp', { h: 0.5 }); sp.position.set(top.x, ty + 0.8, top.z); scene.add(sp); W.signs.push({ sp, x: top.x, z: top.z, near: 14 });
  }

  /* ---------- The glacier run: flagged all the way down, with an arch at each end ---------- */
  {
    const a = T.CHUTE, ux = Math.cos(a), uz = Math.sin(a), sx = -uz, sz = ux, R0 = T.footR(a), rs = R0 * 0.25, rf = R0 * 1.07;
    const pennant = (x, y, z, hex) => { const c = new THREE.Color(hex); for (const [s, v, w] of [[0, 0, 0], [1.0, -0.26, 1], [0, -0.52, 0]]) { flagParts.pos.push(x + ux * s, y + v, z + uz * s); flagParts.nor.push(sx, 0, sz); flagParts.col.push(c.r, c.g, c.b); flagParts.uv.push(s, w); } };
    const arch = (r, text, col) => {
      const p = T.polar(a, r), y = Math.min(Y(p.x + sx * 7, p.z + sz * 7), Y(p.x - sx * 7, p.z - sz * 7)), tex = canvasTexture(1024, 150, (g, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '800 86px ' + FONT.sans; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 5); });
      const g = new THREE.Group(); g.add(mesh([{ g: G.cyl(0.14, 0.2, 7.4, 8, -7, 3.2, 0), c: COL.ink }, { g: G.cyl(0.14, 0.2, 7.4, 8, 7, 3.2, 0), c: COL.ink }, { g: G.box(14.4, 1.5, 0.16, 0, 6.2, 0), c: COL.ink }]));
      for (const s of [1, -1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); b.position.set(0, 6.2, 0.09 * s); if (s < 0) b.rotation.y = Math.PI; g.add(b); }
      g.position.set(p.x, y, p.z); g.rotation.y = Math.atan2(ux, uz); scene.add(g); for (const s of [-7, 7]) solid(p.x + sx * s, p.z + sz * s, 0.4, y + 7);
    };
    arch(rs, 'GLACIER RUN', '#d2332d'); arch(rf, 'FINISH', '#16181e');
    for (let r = rs + 12, i = 0; r < rf - 8; r += 13, i++) for (const side of [-1, 1]) { const p = T.polar(a, r), x = p.x + sx * side * 9.5, z = p.z + sz * side * 9.5, y = Y(x, z); ropeParts.push({ g: G.cyl(0.04, 0.05, 2.6, 5, x, y + 1.1, z), c: COL.ink }); pennant(x, y + 2.3, z, side > 0 ? 0xd2332d : 0x2f72cf); }
    W.run = { a, rs, rf };
  }

  /* ---------- Forest, shrubs, rocks ---------- */
  {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), cc = new THREE.Color();
    // A conifer: tiers of drooping, ragged skirts round a trunk
    function pine(dark, tip, snowy) {
      const parts = [{ g: G.cyl(0.1, 0.22, 2.6, 6, 0, 1.3, 0), c: [0x3a281c, 0x5a3e2a] }], K = 9, tiers = 6;
      for (let t = 0; t < tiers; t++) {
        const f = t / tiers, y0 = 1.0 + t * 0.92, r = 1.95 * (1 - f * 0.78), h = 1.75 - f * 0.4, pos = [], colr = [], ind = [], c0 = new THREE.Color(dark), c1 = new THREE.Color(snowy ? 0xeef3f8 : tip);
        pos.push(0, y0 + h, 0); colr.push(c0.r * 0.9, c0.g * 0.9, c0.b * 0.9);
        for (let k = 0; k < K; k++) { const a = k / K * 6.283 + t * 0.7; pos.push(Math.cos(a) * r * 0.5, y0 + h * 0.42, Math.sin(a) * r * 0.5); const m = snowy ? 0.55 : 0.3; colr.push(c0.r + (c1.r - c0.r) * m, c0.g + (c1.g - c0.g) * m, c0.b + (c1.b - c0.b) * m); }
        for (let k = 0; k < K; k++) { const a = k / K * 6.283 + t * 0.7, out = k % 2 ? 1.08 : 0.76; pos.push(Math.cos(a) * r * out, y0 - (k % 2 ? 0.22 : 0) + rnd() * 0.1, Math.sin(a) * r * out); const m = snowy ? (k % 2 ? 0.25 : 0.1) : 1; colr.push(c0.r + (c1.r - c0.r) * m, c0.g + (c1.g - c0.g) * m, c0.b + (c1.b - c0.b) * m); }
        for (let k = 0; k < K; k++) { const n = (k + 1) % K; ind.push(0, 1 + n, 1 + k, 1 + k, 1 + n, 1 + K + k, 1 + K + k, 1 + n, 1 + K + n); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(ind); g.computeVertexNormals(); parts.push({ g, own: true });
      }
      // Merge by hand so each skirt keeps its own colours
      const geos = parts.map(pt => { if (pt.own) return pt.g.toNonIndexed(); return merged([pt]); });
      let n = 0; geos.forEach(g => n += g.attributes.position.count); const P = new Float32Array(n * 3), Nn = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
      geos.forEach(g => { if (!g.attributes.normal) g.computeVertexNormals(); P.set(g.attributes.position.array, o * 3); Nn.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; });
      const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); out.setAttribute('color', new THREE.BufferAttribute(C, 3)); return out;
    }
    const broadleaf = (leafA, leafB, bloom) => {
      const parts = [{ g: G.cyl(0.11, 0.2, 2.2, 6, 0, 1.1, 0), c: [0x3d2a1e, 0x6a4a34] }, { g: G.bar(0, 1.5, 0, 0.7, 2.4, 0.2, 0.07, 5), c: 0x5a3e2a }, { g: G.bar(0, 1.7, 0, -0.6, 2.5, -0.3, 0.06, 5), c: 0x5a3e2a }];
      parts.push({ g: G.blob(1.18, 0, 3.15, 0, rnd, 0.08, 1, 0.9), c: [new THREE.Color(leafA).multiplyScalar(0.6).getHex(), leafA] });
      for (let k = 0; k < 11; k++) { const u = (k + 0.5) / 11, th = k * 2.39996, v = u * 2 - 1, rr = Math.sqrt(1 - v * v * 0.8), r = 0.6 + rnd() * 0.28; parts.push({ g: G.blob(r, Math.cos(th) * rr * 1.12, 3.2 + v * 0.95, Math.sin(th) * rr * 1.12, rnd, 0.12, 1, 0.88), c: [new THREE.Color(leafA).multiplyScalar(0.72).getHex(), leafB] }); }
      if (bloom) for (let k = 0; k < 16; k++) { const a = rnd() * 6.283, e = rnd() * 1.2 + 0.2, r = 1.42; parts.push({ g: G.ball(0.11 + rnd() * 0.07, Math.cos(a) * Math.cos(e) * r * 1.05, 3.15 + Math.sin(e) * r * 0.85, Math.sin(a) * Math.cos(e) * r * 1.05, 1, 1, 1, 6), c: bloom[k % bloom.length] }); }
      return merged(parts);
    };
    const kinds = [
      { geo: pine(0x1c4a30, 0x3f8452), max: quality.trees, where: 'low' }, { geo: pine(0x1f4436, 0x4f8f6a), max: Math.round(quality.trees * 0.45), where: 'low' }, { geo: pine(0x20463a, 0x5a8a6c, true), max: Math.round(quality.trees * 0.28), where: 'high' },
      { geo: broadleaf(0x2f6a3a, 0x5aa04c, [0xe2456e, 0xf07a9a, 0xd8325a]), max: Math.round(quality.trees * 0.2), where: 'meadow' }, { geo: broadleaf(0xc7781c, 0xf2c13a), max: Math.round(quality.trees * 0.16), where: 'meadow' }, { geo: broadleaf(0xa83a1e, 0xe2702a), max: Math.round(quality.trees * 0.1), where: 'meadow' }
    ];
    const gr = { gx: 0, gz: 0 };
    for (const kd of kinds) {
      const im = new THREE.InstancedMesh(kd.geo, treeMat, kd.max); let n = 0, tries = 0;
      while (n < kd.max && tries++ < kd.max * 30) {
        let x, z; if (kd.where === 'meadow') { const a = rnd() * 6.283, r = 150 + Math.pow(rnd(), 1.2) * 125; x = Math.cos(a) * r; z = Math.sin(a) * r; } else if (rnd() < (kd.where === 'high' ? 0.02 : 0.5)) { const a = rnd() * 6.283, r = 150 + Math.pow(rnd(), 0.8) * 150; x = Math.cos(a) * r; z = Math.sin(a) * r; } else { const a = rnd() * 6.283, r = 20 + Math.sqrt(rnd()) * 135; x = Math.cos(a) * r; z = Math.sin(a) * r; }
        if (Math.abs(x) > T.HALF - 3 || Math.abs(z) > T.HALF - 3 || !T.clear(x, z, 1.2)) continue;
        const y = Y(x, z), sn = T.snowAt(x, z, y); T.gradient(x, z, 1.4, gr); if (Math.hypot(gr.gx, gr.gz) > 0.62) continue;
        if (kd.where === 'high' ? (sn < 0.3 || y > 82) : sn > 0.3) continue; if (kd.where !== 'high' && y > 60) continue;
        if (T.vnoise(x / 26 + 3, z / 26) < (kd.where === 'meadow' ? 0.38 : 0.34)) continue;                       // gather into stands, leave clearings
        const far = Math.hypot(x, z) > T.BOUND, sc = (kd.where === 'meadow' ? 0.85 : 0.9) + rnd() * (far ? 1.5 : 1.0);
        q.setFromAxisAngle(up, rnd() * 6.283); s.set(sc, sc * (0.95 + rnd() * 0.35), sc); p.set(x, y - 0.12, z); M.compose(p, q, s); im.setMatrixAt(n, M);
        const v = 0.8 + rnd() * 0.4; im.setColorAt(n, cc.setRGB(v * (0.92 + rnd() * 0.16), v, v * (0.9 + rnd() * 0.2))); n++;
        if (!far) solid(x, z, 0.3 * sc, y + 5 * sc);
      }
      im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; scene.add(im);
    }
    // Shrubs: rhododendron low down, juniper higher
    const bush = merged([{ g: G.blob(0.72, 0, 0.42, 0, rnd, 0.22, 1, 0.75), c: [0x24522e, 0x4c8a44] }, { g: G.blob(0.5, 0.55, 0.36, 0.2, rnd, 0.22, 1, 0.75), c: [0x24522e, 0x4c8a44] }, ...[0, 1, 2, 3, 4, 5, 6].map(k => ({ g: G.ball(0.13, Math.cos(k * 1.3) * 0.5 + 0.15, 0.72 + (k % 3) * 0.1, Math.sin(k * 1.3) * 0.5, 1, 1, 1, 6), c: k % 2 ? 0xe2456e : 0xf48aa6 }))]);
    const bushes = new THREE.InstancedMesh(bush, treeMat, quality.trees * 0.5 | 0); let n = 0, tries = 0;
    while (n < bushes.instanceMatrix.count && tries++ < 6000) {
      const a = rnd() * 6.283, r = 30 + Math.sqrt(rnd()) * 190, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!T.clear(x, z, 0.4)) continue;
      const y = Y(x, z); T.gradient(x, z, 1.4, gr); if (Math.hypot(gr.gx, gr.gz) > 0.7 || T.snowAt(x, z, y) > 0.2) continue;
      const sc = 0.7 + rnd() * 0.9; q.setFromAxisAngle(up, rnd() * 6.283); s.setScalar(sc); p.set(x, y - 0.08, z); M.compose(p, q, s); bushes.setMatrixAt(n, M); const v = 0.85 + rnd() * 0.3; bushes.setColorAt(n, cc.setRGB(v, v, v)); n++;
    }
    bushes.count = n; bushes.castShadow = true; bushes.receiveShadow = true; scene.add(bushes);

    // Boulders, snow-dusted up high
    const rockG = merged([{ g: G.blob(1, 0, 0, 0, rnd, 0.3, 1, 0.8), c: [0x6b6259, 0xa39a8e] }]), rocks = new THREE.InstancedMesh(rockG, vmat, quality.rocks); n = 0; tries = 0;
    while (n < quality.rocks && tries++ < 8000) {
      const a = rnd() * 6.283, r = Math.pow(rnd(), 0.75) * 215 + 5, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!T.clear(x, z, 0.9)) continue;
      T.gradient(x, z, 1.4, gr); const sl = Math.hypot(gr.gx, gr.gz); if (sl > 0.95) continue;
      const big = rnd() < 0.16, sc = big ? 1.1 + rnd() * 1.6 : 0.22 + rnd() * 0.6, y = Y(x, z), sn = T.snowAt(x, z, y);
      q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)); s.set(sc, sc * (0.6 + rnd() * 0.4), sc * (0.8 + rnd() * 0.5)); p.set(x, y + sc * 0.15, z); M.compose(p, q, s); rocks.setMatrixAt(n, M);
      const v = 0.75 + rnd() * 0.4; rocks.setColorAt(n, sn > 0.5 ? cc.setRGB(v * 1.25, v * 1.28, v * 1.36) : cc.setRGB(v * 1.05, v, v * 0.94)); n++;
      if (big && r < T.BOUND) solid(x, z, sc * 0.8, y + sc * 0.8);
    }
    rocks.count = n; rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);
  }

  /* ---------- Clouds: soft banks that drift round the mountain ---------- */
  {
    const tex = canvasTexture(256, 256, (g, w) => { for (let i = 0; i < 26; i++) { const x = w * (0.22 + rnd() * 0.56), y = w * (0.34 + rnd() * 0.32), r = w * (0.1 + rnd() * 0.2), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); } });
    W.clouds = [];
    for (let cl = 0; cl < quality.clouds; cl++) {
      const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9, fog: false }), g = new THREE.Group(), big = cl % 3 === 0;
      for (let k = 0; k < 4; k++) { const sp = new THREE.Sprite(m); const sz = (big ? 46 : 24) + rnd() * 26; sp.scale.set(sz * 1.5, sz, 1); sp.position.set((k - 1.5) * sz * 0.4, rnd() * 5, rnd() * 10); g.add(sp); }
      W.clouds.push({ m, g, a: rnd() * 6.283, r: big ? 330 + rnd() * 300 : 150 + rnd() * 130, y: big ? 24 + rnd() * 50 : 70 + rnd() * 80, v: (0.004 + rnd() * 0.008) * (big ? 0.4 : 1) }); scene.add(g);
    }
  }

  /* ---------- Takin on the meadow: they keep their distance ---------- */
  {
    const fur = [0x7a5a30, 0xc9a25a], dark = 0x3a2a1c;
    const geo = merged([{ g: G.ball(0.62, 0, 1.12, -0.1, 0.9, 0.82, 1.5), c: fur }, { g: G.ball(0.52, 0, 1.36, 0.55, 0.85, 0.8, 0.9), c: fur }, { g: G.ball(0.3, 0, 1.22, 1.22, 0.9, 1, 1.25), c: [0x4a3420, 0x7a5a30] }, { g: G.ball(0.2, 0, 1.06, 1.56, 0.95, 0.85, 0.9), c: dark },
      { g: G.cone(0.07, 0.36, 6, -0.2, 1.56, 1.1, -0.5, 0.3), c: 0x2a2018 }, { g: G.cone(0.07, 0.36, 6, 0.2, 1.56, 1.1, -0.5, -0.3), c: 0x2a2018 },
      ...[[-0.3, 0.62], [0.3, 0.62], [-0.3, -0.68], [0.3, -0.68]].map(([x, z]) => ({ g: G.cap(0.12, 0.5, x, 0.38, z), c: [dark, 0x7a5a30] }))]);
    const b = T.camp('base');
    W.takin = [[0.55, 196], [0.66, 204], [0.46, 207], [-0.75, 188], [-0.84, 197]].map(([da, rr], i) => {
      const p = T.polar(T.A0 + da, rr), m = new THREE.Mesh(geo, vmat); m.castShadow = true; m.scale.setScalar(0.85 + (i % 2) * 0.22); scene.add(m);
      return { m, x: p.x, z: p.z, hx: p.x, hz: p.z, yaw: rnd() * 6, t: rnd() * 5, tx: p.x, tz: p.z, v: 0 };
    });
  }
  /* ---------- Birds that circle the summit ---------- */
  {
    const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.16, 0, 0, -0.16, 1.1, 0, -0.05, 1.1, 0, -0.05, 0, 0, 0.16, 0.6, 0, 0.2], 3)); wing.computeVertexNormals();
    const bm = new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.8, side: THREE.DoubleSide });
    W.birds = []; for (let i = 0; i < quality.birds; i++) { const g = new THREE.Group(), body = new THREE.Mesh(G.ball(0.14, 0, 0, 0, 1, 1, 3.2, 8), bm), L = new THREE.Mesh(wing, bm), R = new THREE.Mesh(wing, bm); R.scale.x = -1; g.add(body, L, R); scene.add(g); W.birds.push({ g, L, R, a: rnd() * 6.283, r: 46 + rnd() * 70, y: T.SUMMIT_Y - 20 + rnd() * 40, v: 0.1 + rnd() * 0.08, ph: rnd() * 6 }); }
  }

  /* ---------- A migoi, if you look in the right place ---------- */
  {
    let p = T.polar(T.CHUTE - 0.75, 66), bestS = 9; for (let da = -1.2; da <= -0.4; da += 0.05) for (let r = 50; r < 92; r += 3) { const q = T.polar(T.CHUTE + da, r), g = T.gradient(q.x, q.z, 2), s = Math.hypot(g.gx, g.gz), y = Y(q.x, q.z); if (s < bestS && y > 62 && T.clear(q.x, q.z, 3)) { bestS = s; p = q; } }
    const y = Y(p.x, p.z), g = new THREE.Group(); g.position.set(p.x, y, p.z); g.rotation.y = Math.atan2(p.x, p.z); scene.add(g);
    const fur = [0xcfd6de, 0xf6f8fb];
    g.add(mesh([{ g: G.cap(0.72, 0.9, 0, 1.85, 0), c: fur }, { g: G.ball(0.5, 0, 3.0, 0.06, 1, 1.05, 1), c: fur }, { g: G.ball(0.3, 0, 2.95, 0.34, 1, 0.8, 0.7), c: [0x7d8796, 0x9aa3b2] }, { g: G.ball(0.055, -0.13, 3.04, 0.56, 1, 1, 1, 6), c: COL.ink }, { g: G.ball(0.055, 0.13, 3.04, 0.56, 1, 1, 1, 6), c: COL.ink },
      { g: G.cap(0.3, 0.6, -0.36, 0.55, 0), c: fur }, { g: G.cap(0.3, 0.6, 0.36, 0.55, 0), c: fur }, { g: G.cap(0.24, 1.0, -0.98, 1.9, 0, 0, -0.2), c: fur }]));
    const arm = new THREE.Group(); arm.position.set(0.92, 2.6, 0); arm.add(mesh([{ g: G.cap(0.24, 1.0, 0, -0.7, 0), c: fur }])); g.add(arm);
    solid(p.x, p.z, 0.9, y + 3.5); W.migoi = { g, arm, x: p.x, z: p.z, y, wave: 0 };
  }

  /* ---------- Things to knock about (given bodies once the physics engine has loaded) ---------- */
  {
    const add = (kind, x, z, dy, size, color, extra = {}) => W.props.push({ kind, x, z, y: Y(x, z) + dy, size, color, ...extra });
    const b = frame(T.camp('base')), cr = 0.9;
    [[0, 0], [1, 0], [2, 0], [0.5, 1], [1.5, 1], [1, 2]].forEach(([i, j]) => { const p = b.at(-3.5, 6.5 + i * (cr + 0.04)); add('box', p.x, p.z, cr / 2 + j * cr, [cr, cr, cr], j === 2 ? COL.gold : j ? COL.ember : COL.wood); });
    for (let k = 0; k < 3; k++) { const p = b.at(6.5 + k * 1.1, -4.5); add('barrel', p.x, p.z, 0.6, [0.42, 1.2], [0x2f72cf, COL.ember, 0x2f9a5c][k]); }
    { const p = b.at(1, 2.5); add('ball', p.x, p.z, 0.42, [0.42], 0xfbf6ea); }
    const t = frame(T.camp('teaching')); for (let k = 0; k < 7; k++) { const p = t.at(-1.5, -5.2); add('box', p.x, p.z, 0.16 + k * 0.32, [1.1 - (k % 3) * 0.12, 0.3, 0.8], [0x285a80, 0x7a1f26, 0x2f6048, 0xf5a800, 0x63503f][k % 5], { yaw: k * 0.5 }); }
    { const p = t.at(-3, 0.5); add('ball', p.x, p.z, 0.3, [0.3], 0xd9401b); }
    const e = frame(T.camp('experience')); [[0, 0], [1, 0], [0.5, 1]].forEach(([i, j]) => { const p = e.at(1.5, 4.5 + i * 0.95); add('box', p.x, p.z, 0.45 + j * 0.9, [0.9, 0.9, 0.9], j ? COL.gold : COL.wood); });
    { const p = e.at(0.5, -6.4); add('barrel', p.x, p.z, 0.6, [0.42, 1.2], COL.maroon); }
    const pr = frame(T.camp('projects')), bc = [0xd2332d, 0x2f72cf, 0xf5c518, 0x2f9a5c, 0xfbf6ea];
    for (let row = 0; row < 4; row++) for (let k = 0; k < 3 - (row > 1 ? 1 : 0); k++) { const p = pr.at(-2.5, -1.6 + k * 1.24 + (row % 2) * 0.62 + (row > 1 ? 0.3 : 0)); add('brick', p.x, p.z, 0.3 + row * 0.6, [1.2, 0.6, 0.6], bc[(row + k * 2) % 5], { yaw: pr.face + Math.PI / 2 }); }
    const r = frame(T.camp('research')), sp = r.at(-1.5, -5.5); add('ball', sp.x, sp.z, 0.6, [0.6], 0xf6f8fa); add('ball', sp.x, sp.z, 1.6, [0.44], 0xf6f8fa); add('ball', sp.x, sp.z, 2.36, [0.32], 0xf6f8fa);
    for (let k = 0; k < 3; k++) { const p = r.at(-2.4 - k * 0.3, 0.2 + k * 0.9); add('ball', p.x, p.z, 0.36, [0.36], 0xf6f8fa); }
    { const c = T.camp('contact'), s = frame(c).at(1.5, 3.4); add('ball', s.x, s.z, 0.8, [0.8], 0xf6f8fa); }
  }

  /* ---------- Finish the merged pieces ---------- */
  {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(flagParts.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(flagParts.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(flagParts.col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(flagParts.uv, 2));
    const flags = new THREE.Mesh(g, flagMat); flags.castShadow = true; flags.frustumCulled = false; scene.add(flags);
    const ropes = mesh(ropeParts); ropes.frustumCulled = false; scene.add(ropes);
    const lampG = new THREE.SphereGeometry(0.15, 8, 6); lampG.scale(1, 1.35, 1);
    W.lampMat = new THREE.MeshBasicMaterial({ color: 0xffb04a }); const lamps = new THREE.InstancedMesh(lampG, W.lampMat, W.lamps.length), M = new THREE.Matrix4();
    W.lamps.forEach((l, i) => { M.makeTranslation(l[0], l[1], l[2]); lamps.setMatrixAt(i, M); }); lamps.frustumCulled = false; scene.add(lamps);
    // One warm light that belongs to whichever fire or lamp is nearest
    W.glow = new THREE.PointLight(0xff9a4a, 0, 26, 1.6); scene.add(W.glow);
  }

  /* ---------- The world moves ---------- */
  const lampC = new THREE.Color();
  W.update = (dt, time, p, camera, st) => {
    for (const fn of W.tick) fn(dt, time);
    for (const s of W.spinners) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < s.r && Math.abs(p.y - s.y) < 3) { if (s.v < 1.5 && st.started) st.bell(); s.v = Math.max(s.v, 7 + p.speed * 0.5); } s.v *= Math.exp(-0.45 * dt); s.m.rotation.y -= s.v * dt; }
    for (const k of W.pickups) if (!k.got) { k.g.rotation.y = time * 1.6 + k.i; k.g.position.y = k.y + Math.sin(time * 2.2 + k.i) * 0.16; }
    for (const r of W.rings) if (!r.got) { r.m.rotation.z = time * 0.6 + r.i; const s = 1 + Math.sin(time * 2.4 + r.i) * 0.05; r.m.scale.setScalar(s); }
    for (const k of W.takin) {
      const d = Math.hypot(p.x - k.x, p.z - k.z); k.t -= dt;
      if (d < 9 && st.started) { k.tx = k.x + (k.x - p.x) / d * 11; k.tz = k.z + (k.z - p.z) / d * 11; k.v = 6; k.t = 2; }
      else if (k.t < 0) { k.tx = k.hx + (Math.random() - 0.5) * 18; k.tz = k.hz + (Math.random() - 0.5) * 18; k.v = 0.9; k.t = 4 + Math.random() * 7; }
      if (T.tOf(k.tx, k.tz) < 1.06 || Math.hypot(k.tx, k.tz) > T.BOUND + 20 || Math.hypot(k.tx - T.LAKE.x, k.tz - T.LAKE.z) < T.LAKE.r + 3) { k.tx = k.hx; k.tz = k.hz; }
      const dx = k.tx - k.x, dz = k.tz - k.z, l = Math.hypot(dx, dz), go = l > 0.6;
      if (go) { k.x += dx / l * k.v * dt; k.z += dz / l * k.v * dt; k.yaw = angDamp(k.yaw, Math.atan2(dx, dz), 5, dt); }
      k.m.position.set(k.x, T.sample(k.x, k.z) + (go ? Math.abs(Math.sin(time * (k.v > 2 ? 14 : 6) + k.hx)) * (k.v > 2 ? 0.2 : 0.04) : 0), k.z); k.m.rotation.y = k.yaw;
    }
    for (const b of W.birds) { b.a += b.v * dt; const x = Math.cos(b.a) * b.r, z = Math.sin(b.a) * b.r; b.g.position.set(x, b.y + Math.sin(time * 0.4 + b.ph) * 4, z); b.g.rotation.y = -b.a; const f = Math.sin(time * 6 + b.ph) * 0.6 * (0.5 + 0.5 * Math.sin(time * 0.5 + b.ph)); b.L.rotation.z = f; b.R.rotation.z = -f; b.g.rotation.z = 0.25; }
    const mg = W.migoi, md = Math.hypot(p.x - mg.x, p.z - mg.z);
    mg.wave = damp(mg.wave, md < 11 && Math.abs(p.y - mg.y) < 6 ? 1 : 0, 4, dt); mg.arm.rotation.z = mg.wave * (2.5 + Math.sin(time * 7) * 0.3); if (md < 16) mg.g.rotation.y = angDamp(mg.g.rotation.y, Math.atan2(p.x - mg.x, p.z - mg.z), 3, dt);
    for (const c of W.clouds) {
      c.a += c.v * dt; c.g.position.set(Math.cos(c.a) * c.r, c.y, Math.sin(c.a) * c.r);
      const dc = c.g.position.distanceTo(camera.position), fade = clamp((dc - 30) / 40, 0, 1); c.m.opacity = 0.62 * fade * (1 - env.night * 0.55); c.m.color.copy(env.uniforms.uCloud.value).lerp(env.sunColor, 0.15); c.g.visible = fade > 0.01;
    }
    for (const s of W.signs) {
      const sx = s.camp ? s.camp.x : s.x, sz = s.camp ? s.camp.z : s.z, d = Math.hypot(camera.position.x - sx, camera.position.z - sz);
      const show = !st.photo && (s.camp ? (st.intro > 0.5 || (d < 120 && d > 16 && st.here !== s.camp.id)) : d < (s.near || 30) && st.intro < 0.5);
      s.sp.material.opacity = damp(s.sp.material.opacity, show ? 1 : 0, 5, dt); s.sp.visible = s.sp.material.opacity > 0.02;
      const hh = s.camp ? clamp(d * 0.03, 0.7, st.intro > 0.5 ? 7.5 : 3.6) : clamp(d * 0.022, 0.32, 0.6); s.sp.scale.set(hh * s.sp.userData.aspect, hh, 1);
    }
    // Lamps come on at dusk; the nearest flame lights the ground around it
    const n = env.night; W.lampMat.color.copy(lampC.setHex(0xffb04a)).multiplyScalar(0.5 + n * 3.2);
    let best = 1e9, at = null; for (const f of W.fires) { const d = (f.x - p.x) ** 2 + (f.z - p.z) ** 2 + (f.y - p.y) ** 2; if (d < best) { best = d; at = f; } }
    if (n > 0.3) for (const l of W.lamps) { const d = (l[0] - p.x) ** 2 + (l[2] - p.z) ** 2 + (l[1] - p.y) ** 2; if (d < best * 0.6) { best = d / 0.6; at = { x: l[0], y: l[1], z: l[2] }; } }
    if (at && best < 900) { W.glow.position.set(at.x, at.y + 0.3, at.z); W.glow.intensity = (22 + n * 38) * (0.85 + 0.15 * Math.sin(time * 13) * Math.sin(time * 7.3)); } else W.glow.intensity = 0;
  };
  return W;
}
