// Things to ride: a mountain bike, a snowmobile, and the paraglider in your pack.
import * as THREE from 'three';
import * as T from './terrain.js';
import { COL, G, mesh, merged, vmat, vmatShiny, vmatDouble } from './kit.js';

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const gr = { gx: 0, gz: 0 }, eul = new THREE.Euler(0, 0, 0, 'YXZ');

function wheel(R) {
  const parts = [{ g: G.torus(R - 0.035, 0.036, 0, 0, 0, 0, 0, 26).rotateY(Math.PI / 2), c: COL.rubber }, { g: G.torus(R - 0.075, 0.012, 0, 0, 0, 0, 0, 26).rotateY(Math.PI / 2), c: 0xc9ced4 }, { g: G.cyl(0.03, 0.03, 0.09, 8, 0, 0, 0, 0, Math.PI / 2), c: 0x8e959d }];
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; parts.push({ g: G.bar(0, 0, 0, (k % 2 ? 0.02 : -0.02), Math.cos(a) * (R - 0.08), Math.sin(a) * (R - 0.08), 0.005, 4), c: 0xb8bec6 }); }
  return mesh(parts, vmatShiny);
}

export function makeBike(color = 0x1f8a8a) {
  const g = new THREE.Group(), R = 0.34, bb = [0, 0.32, 0.02], head = [0, 0.88, 0.4], seat = [0, 0.84, -0.22], rear = [0, R, -0.52], dark = 0x15171b;
  g.add(mesh([{ g: G.bar(...bb, ...seat, 0.024), c: color }, { g: G.bar(...seat, ...head, 0.024), c: color }, { g: G.bar(...bb, 0, 0.74, 0.42, 0.028), c: color }, { g: G.bar(...bb, ...rear, 0.016), c: color }, { g: G.bar(...seat, ...rear, 0.014), c: color },
    { g: G.bar(0, 0.84, -0.22, 0, 0.93, -0.25, 0.016), c: dark }, { g: G.ball(0.07, 0, 0.95, -0.27, 0.9, 0.42, 1.9, 10), c: dark }, { g: G.cyl(0.045, 0.045, 0.08, 10, 0, 0.32, 0.02, 0, Math.PI / 2), c: 0x8e959d }, { g: G.cyl(0.09, 0.09, 0.012, 16, 0.05, 0.32, 0.02, 0, Math.PI / 2), c: dark }], vmatShiny));
  const steerG = new THREE.Group(); steerG.position.set(0, 0.8, 0.41); steerG.rotation.x = 0.33; g.add(steerG);
  const fork = new THREE.Group(); steerG.add(fork);
  fork.add(mesh([{ g: G.bar(0, 0.12, 0, 0, -0.1, 0, 0.026), c: color }, { g: G.bar(-0.05, -0.08, 0, -0.05, -0.5, 0, 0.018), c: 0xc9ced4 }, { g: G.bar(0.05, -0.08, 0, 0.05, -0.5, 0, 0.018), c: 0xc9ced4 }, { g: G.bar(-0.05, -0.08, 0, 0.05, -0.08, 0, 0.018), c: color },
    { g: G.bar(0, 0.12, 0, 0, 0.24, 0.07, 0.018), c: dark }, { g: G.bar(-0.31, 0.26, 0.06, 0.31, 0.26, 0.06, 0.014), c: dark }, { g: G.bar(-0.33, 0.26, 0.06, -0.24, 0.26, 0.06, 0.02), c: 0xe2491d }, { g: G.bar(0.24, 0.26, 0.06, 0.33, 0.26, 0.06, 0.02), c: 0xe2491d }], vmatShiny));
  const wf = wheel(R), wr = wheel(R); wf.position.set(0, -0.5, 0); fork.add(wf); wr.position.set(...rear); g.add(wr);
  const crank = new THREE.Group(); crank.position.set(...bb); g.add(crank);
  crank.add(mesh([{ g: G.bar(-0.07, 0, 0, -0.07, 0.165, 0, 0.012), c: 0x8e959d }, { g: G.bar(0.07, 0, 0, 0.07, -0.165, 0, 0.012), c: 0x8e959d }, { g: G.box(0.09, 0.02, 0.07, -0.115, 0.165, 0), c: dark }, { g: G.box(0.09, 0.02, 0.07, 0.115, -0.165, 0), c: dark }], vmatShiny));
  return { kind: 'bike', g, fork, wf, wr, crank, R, crankA: 0, pitch: 0, roll: 0, spin: 0 };
}

export function makeSled(color = 0xd2332d) {
  const g = new THREE.Group(), dark = 0x17181b, body = new THREE.Group(); g.add(body);
  const hull = G.lathe([[0, -0.95], [0.26, -0.9], [0.4, -0.5], [0.44, 0], [0.4, 0.5], [0.24, 0.92], [0, 1.0]], 16); hull.rotateX(Math.PI / 2); hull.scale(1, 0.62, 1); hull.translate(0, 0.62, 0.45);
  body.add(mesh([{ g: hull, c: [new THREE.Color(color).multiplyScalar(0.7).getHex(), color] }, { g: G.box(0.62, 0.3, 1.5, 0, 0.5, -0.55), c: dark }, { g: G.ball(0.3, 0, 0.74, -0.42, 1, 0.42, 2.1, 12), c: 0x23252b }, { g: G.box(0.5, 0.24, 0.3, 0, 0.82, -1.15, 0, -0.25), c: 0x23252b },
    { g: G.box(0.7, 0.06, 0.5, 0, 0.3, 0.1), c: dark }, { g: G.box(0.22, 0.05, 1.0, -0.36, 0.28, -0.2), c: dark }, { g: G.box(0.22, 0.05, 1.0, 0.36, 0.28, -0.2), c: dark },
    { g: G.cap(0.2, 1.3, 0, 0.26, -0.72, Math.PI / 2).scale(1.5, 1, 1), c: 0x0e0f11 }, { g: G.box(0.52, 0.04, 0.28, 0, 0.5, -1.45, 0, 0.5), c: color }, { g: G.ball(0.1, -0.16, 0.74, 1.26, 1, 0.7, 0.5, 8), c: 0xfff3c4 }, { g: G.ball(0.1, 0.16, 0.74, 1.26, 1, 0.7, 0.5, 8), c: 0xfff3c4 }], vmatShiny));
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI, 0, Math.PI / 2).scale(1, 0.9, 0.6).rotateX(-0.5).rotateY(Math.PI).translate(0, 0.86, 0.72), new THREE.MeshStandardMaterial({ color: 0x1c3a52, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.6, side: THREE.DoubleSide })); body.add(glass);
  const bars = new THREE.Group(); bars.position.set(0, 0.86, 0.36); body.add(bars);
  bars.add(mesh([{ g: G.bar(0, 0, 0, 0, 0.22, 0.1, 0.022), c: dark }, { g: G.bar(-0.33, 0.22, 0.1, 0.33, 0.22, 0.1, 0.016), c: dark }, { g: G.bar(-0.35, 0.22, 0.1, -0.25, 0.22, 0.1, 0.024), c: 0xf2a900 }, { g: G.bar(0.25, 0.22, 0.1, 0.35, 0.22, 0.1, 0.024), c: 0xf2a900 }], vmatShiny));
  const skis = [-1, 1].map(s => {
    const sk = new THREE.Group(); sk.position.set(s * 0.46, 0.05, 1.05); g.add(sk);
    sk.add(mesh([{ g: G.box(0.14, 0.035, 1.1, 0, 0, 0), c: [0x202228, 0x3a3d46] }, { g: G.box(0.14, 0.035, 0.26, 0, 0.055, 0.64, 0, -0.5), c: 0x3a3d46 }, { g: G.bar(0, 0.02, 0, -s * 0.16, 0.5, -0.2, 0.022), c: 0x8e959d }, { g: G.bar(0, 0.02, 0.2, -s * 0.16, 0.46, -0.1, 0.014), c: 0xf2a900 }], vmatShiny)); return sk;
  });
  return { kind: 'sled', g, body, bars, skis, pitch: 0, roll: 0, spin: 0 };
}

// The wing: an arc of cells, lines down to the risers
export function makeGlider() {
  const g = new THREE.Group(), SP = 22, CH = 5, span = 9.6, R = 5.6, chord = 2.3, pos = [], col = [], ind = [], c = new THREE.Color(), cols = [0xf05a22, 0xf7b824, 0xf6f1e4, 0x1f8a8a, 0xf6f1e4, 0xf7b824, 0xf05a22];
  for (let i = 0; i <= SP; i++) {
    const u = i / SP * 2 - 1, th = u * (span / 2) / R, taper = Math.sqrt(1 - Math.pow(Math.abs(u), 2.6) * 0.72);
    for (let j = 0; j <= CH; j++) {
      const v = j / CH, belly = Math.sin(Math.min(1, v * 1.6) * Math.PI * 0.62) * 0.2 * taper, cell = Math.abs(Math.sin(i * Math.PI)) * 0;
      pos.push(Math.sin(th) * R, Math.cos(th) * R - R + belly + cell, (0.42 - v) * chord * taper + Math.abs(u) * -0.35);
      c.setHex(cols[Math.min(cols.length - 1, Math.floor((u * 0.5 + 0.5) * cols.length))]); const sh = 0.86 + 0.14 * Math.cos(i * Math.PI) * 1; col.push(c.r * sh, c.g * sh, c.b * sh);
    }
  }
  for (let i = 0; i < SP; i++) for (let j = 0; j < CH; j++) { const a = i * (CH + 1) + j, b = a + 1, d = a + CH + 1, e = d + 1; ind.push(a, d, b, b, d, e); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(ind); geo.computeVertexNormals();
  if (geo.attributes.normal.getY(Math.floor(SP / 2) * (CH + 1) + 2) < 0) { for (let i = 0; i < ind.length; i += 3) { const t = ind[i + 1]; ind[i + 1] = ind[i + 2]; ind[i + 2] = t; } geo.setIndex(ind); geo.computeVertexNormals(); }
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
  cloth.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.55;'); };
  const wing = new THREE.Mesh(geo, cloth); wing.castShadow = true; wing.position.y = 6.6; g.add(wing);
  const lp = []; for (const s of [-1, 1]) for (let i = 0; i <= 5; i++) { const u = s * (0.12 + i * 0.165), th = u * (span / 2) / R; for (const z of [0.5, -0.35]) lp.push(s * 0.2, 1.52, 0, Math.sin(th) * R, 6.6 + Math.cos(th) * R - R, z); }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)), new THREE.LineBasicMaterial({ color: 0x2a2c33, transparent: true, opacity: 0.65 })); g.add(lines);
  g.add(mesh([{ g: G.bar(-0.2, 1.52, 0, -0.2, 1.2, -0.05, 0.012), c: 0x2a2c33 }, { g: G.bar(0.2, 1.52, 0, 0.2, 1.2, -0.05, 0.012), c: 0x2a2c33 }]));
  g.visible = false; return { g, wing, open: 0, roll: 0, pitch: 0 };
}

// Put a parked vehicle on the ground where it stands
export function parkVehicle(v, x, z, yaw, y) {
  v.x = x; v.z = z; v.yaw = yaw; v.y = y ?? T.sample(x, z); T.gradient(x, z, 1.2, gr);
  const hx = Math.sin(yaw), hz = Math.cos(yaw), s = gr.gx * hx + gr.gz * hz, side = gr.gx * hz - gr.gz * hx;
  eul.set(-Math.atan(s), yaw, Math.atan(side) + (v.kind === 'bike' ? 0.2 : 0)); v.g.quaternion.setFromEuler(eul); v.g.position.set(x, v.y + (v.kind === 'bike' ? 0.0 : 0.02), z); v.pitch = -Math.atan(s); v.roll = 0;
}
// While it is being ridden
export function rideVehicle(v, p, dt) {
  const hx = Math.sin(p.head), hz = Math.cos(p.head); T.gradient(p.x, p.z, 1.3, gr);
  const s = gr.gx * hx + gr.gz * hz, side = gr.gx * hz - gr.gz * hx, sp = Math.abs(p.v);
  const pitchW = p.rideAir ? clamp(-Math.atan2(p.vy, Math.max(6, sp)) * 0.7, -0.6, 0.6) : -Math.atan(p.water ? 0 : s);
  const lean = v.kind === 'bike' ? -p.steer * clamp(sp / 9, 0, 1) * 0.42 : -p.steer * clamp(sp / 12, 0, 1) * 0.2 + Math.atan(p.water ? 0 : side) * 0.85;
  v.pitch = damp(v.pitch, pitchW, p.rideAir ? 4 : 11, dt); v.roll = damp(v.roll, lean, 8, dt);
  eul.set(v.pitch, p.head, v.roll); v.g.quaternion.setFromEuler(eul); v.g.position.set(p.x, p.y + 0.01, p.z); v.x = p.x; v.y = p.y; v.z = p.z; v.yaw = p.head;
  if (v.kind === 'bike') {
    v.spin += p.v * dt / v.R; v.wf.rotation.x = v.spin; v.wr.rotation.x = v.spin; v.fork.rotation.y = -p.steer * 0.5;
    if (!p.rideAir && p.v > 0.3) v.crankA += Math.min(11, p.v * 0.75 + 2) * dt * (p.pedal ? 1 : 0.0); v.crank.rotation.x = v.crankA;
  } else { v.bars.rotation.y = -p.steer * 0.5; for (const sk of v.skis) sk.rotation.y = -p.steer * 0.45; v.body.position.y = Math.sin(performance.now() * 0.03) * 0.004 * Math.min(1, sp); }
}
export function updateGlider(gl, p, dt, climberRoot) {
  const on = p.mode === 'glide'; gl.open = damp(gl.open, on ? 1 : 0, on ? 9 : 14, dt); gl.g.visible = gl.open > 0.03; if (!gl.g.visible) return;
  gl.roll = damp(gl.roll, -(p.bank || 0) * 0.5, 4, dt); gl.pitch = damp(gl.pitch, clamp(-p.vy * 0.02, -0.12, 0.18) + ((p.gv || 12) - 12) * 0.012, 3, dt);
  eul.set(gl.pitch, p.head, gl.roll); gl.g.quaternion.setFromEuler(eul); gl.g.position.set(p.x, p.y, p.z);
  const o = gl.open; gl.wing.scale.set(0.25 + 0.75 * o, 0.3 + 0.7 * o, 0.4 + 0.6 * o); gl.wing.position.y = 2.2 + 4.4 * o + Math.sin(performance.now() * 0.002) * 0.05;
}
