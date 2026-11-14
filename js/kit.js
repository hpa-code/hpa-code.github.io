// Small modelling kit: shapes, colours and materials shared by the scenery, the climber and the vehicles.
import * as THREE from 'three';

export const COL = {
  white: 0xf6f1e4, maroon: 0x8a1f2b, gold: 0xf2a900, ember: 0xe2491d, ink: 0x1f2026, wood: 0x9a6a44, woodDark: 0x5b3a26, skin: 0xc68e62, rope: 0xcdb892, stone: 0x8d857c,
  steel: 0x8e959d, rubber: 0x17181b, teal: 0x1f8a8a, sky: 0x3a86d8, snow: 0xf4f7fb
};
export const FLAGS = [0x2f72cf, 0xf7f3e8, 0xd2332d, 0x2f9a5c, 0xf5c518];

export function seeded(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
// Several shapes in one mesh, each with its own colour (or a bottom-to-top gradient): fewer draw calls. Keeps each shape's own normals.
export function merged(parts) {
  let n = 0; const gs = parts.map(p => { let g = p.g.index ? p.g.toNonIndexed() : p.g; if (!g.attributes.normal) g.computeVertexNormals(); n += g.attributes.position.count; return g; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  gs.forEach((g, i) => {
    const c = parts[i].c, P = g.attributes.position, cnt = P.count; pos.set(P.array.subarray(0, cnt * 3), o * 3); nor.set(g.attributes.normal.array.subarray(0, cnt * 3), o * 3);
    if (Array.isArray(c)) {
      let lo = 1e9, hi = -1e9; for (let k = 0; k < cnt; k++) { const y = P.getY(k); if (y < lo) lo = y; if (y > hi) hi = y; }
      tmpC.setHex(c[0]); tmpC2.setHex(c[1]);
      for (let k = 0; k < cnt; k++) { const t = (P.getY(k) - lo) / Math.max(1e-5, hi - lo); col[(o + k) * 3] = tmpC.r + (tmpC2.r - tmpC.r) * t; col[(o + k) * 3 + 1] = tmpC.g + (tmpC2.g - tmpC.g) * t; col[(o + k) * 3 + 2] = tmpC.b + (tmpC2.b - tmpC.b) * t; }
    } else { tmpC.setHex(c); for (let k = 0; k < cnt; k++) { col[(o + k) * 3] = tmpC.r; col[(o + k) * 3 + 1] = tmpC.g; col[(o + k) * 3 + 2] = tmpC.b; } }
    o += cnt;
  });
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); return out;
}
const place = (g, x, y, z, rx, ry, rz) => { if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(x || 0, y || 0, z || 0); return g; };
export const G = {
  box: (w, h, d, x, y, z, ry, rx, rz) => place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz),
  cone: (r, h, seg, x, y, z, rx, rz) => place(new THREE.ConeGeometry(r, h, seg), x, y, z, rx, 0, rz),
  cyl: (r1, r2, h, seg, x, y, z, rx, rz, ry) => place(new THREE.CylinderGeometry(r1, r2, h, seg), x, y, z, rx, ry, rz),
  ball: (r, x, y, z, sx = 1, sy = 1, sz = 1, seg = 14) => { const g = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))); g.scale(sx, sy, sz); return place(g, x, y, z); },
  cap: (r, len, x, y, z, rx, rz, ry) => place(new THREE.CapsuleGeometry(r, len, 5, 12), x, y, z, rx, ry, rz),
  torus: (R, r, x, y, z, rx, rz, seg = 20, arc = Math.PI * 2) => place(new THREE.TorusGeometry(R, r, 8, seg, arc), x, y, z, rx, 0, rz),
  // A bar between two points
  bar: (ax, ay, az, bx, by, bz, r = 0.04, seg = 6) => { const l = Math.hypot(bx - ax, by - ay, bz - az), g = new THREE.CylinderGeometry(r, r, l, seg), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, by - ay, bz - az).normalize()); g.applyQuaternion(q); g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); return g; },
  lathe: (pts, seg = 16, x, y, z) => place(new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg), x, y, z),
  // A lumpy ball: rocks, foliage, snow
  blob: (r, x, y, z, rnd, rough = 0.25, detail = 1, sy = 1) => {
    const g = new THREE.IcosahedronGeometry(r, detail), P = g.attributes.position, seen = new Map();
    for (let i = 0; i < P.count; i++) { const k = Math.round(P.getX(i) * 50) + ',' + Math.round(P.getY(i) * 50) + ',' + Math.round(P.getZ(i) * 50); if (!seen.has(k)) seen.set(k, 1 + (rnd() - 0.5) * 2 * rough); const s = seen.get(k); P.setXYZ(i, P.getX(i) * s, P.getY(i) * s * sy, P.getZ(i) * s); }
    // Smooth normals across the shared corners
    const acc = new Map(); g.computeVertexNormals(); const Nn = g.attributes.normal;
    for (let i = 0; i < P.count; i++) { const k = Math.round(P.getX(i) * 40) + ',' + Math.round(P.getY(i) * 40) + ',' + Math.round(P.getZ(i) * 40); const a = acc.get(k) || [0, 0, 0]; a[0] += Nn.getX(i); a[1] += Nn.getY(i); a[2] += Nn.getZ(i); acc.set(k, a); }
    for (let i = 0; i < P.count; i++) { const k = Math.round(P.getX(i) * 40) + ',' + Math.round(P.getY(i) * 40) + ',' + Math.round(P.getZ(i) * 40); const a = acc.get(k), l = Math.hypot(a[0], a[1], a[2]) || 1; Nn.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
    return place(g, x, y, z);
  }
};

// One material for nearly everything built: colour comes from the vertices
export const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
export const vmatShiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.55 });
export const vmatDouble = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
const mats = new Map();
export function mat(c, o = {}) { const k = c + JSON.stringify(o); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0, ...o })); return mats.get(k); }
export function mesh(parts, material = vmat, shadow = true) { const m = new THREE.Mesh(merged(parts), material); m.castShadow = shadow; m.receiveShadow = true; return m; }

/* ---------- Text drawn onto things in the world ---------- */
export const FONT = { sans: 'Archivo, "Helvetica Neue", Arial, sans-serif', serif: '"Instrument Serif", Georgia, serif', hand: 'Caveat, "Segoe Print", cursive', chalk: '"Fredericka the Great", Caveat, cursive', mono: '"JetBrains Mono", ui-monospace, Menlo, monospace' };
export function wrapText(g, text, maxW) { const words = String(text).split(' '), lines = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line); return lines; }
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// A floating name tag
export function label(text, opts = {}) {
  const size = 56, pad = 34, font = '700 ' + size + 'px ' + FONT.sans, probe = document.createElement('canvas').getContext('2d'); probe.font = font;
  const sub = opts.sub || '', tw = Math.ceil(probe.measureText(text).width), w = tw + pad * 2 + (sub ? Math.ceil(probe.measureText(sub).width * 0.62) + 26 : 0), h = 104;
  const tex = canvasTexture(w, h, g => {
    g.fillStyle = opts.bg || 'rgba(18,20,26,0.82)'; g.beginPath(); g.roundRect(0, 0, w, h, h / 2); g.fill();
    g.font = font; g.fillStyle = opts.fg || '#fff'; g.textBaseline = 'middle'; g.fillText(text, pad, h / 2 + 3);
    if (sub) { g.font = '600 ' + Math.round(size * 0.62) + 'px ' + FONT.sans; g.fillStyle = opts.accent || '#ffc629'; g.fillText(sub, pad + tw + 22, h / 2 + 4); }
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false, depthTest: opts.depthTest !== false })); sp.userData.aspect = w / h; sp.renderOrder = 6;
  const hh = opts.h || 1; sp.scale.set(hh * sp.userData.aspect, hh, 1); return sp;
}
