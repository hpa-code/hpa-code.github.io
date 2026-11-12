// Everything you can see that is not the climber: the mountain, the camps and what lives on them.
import * as THREE from 'three';
import * as T from './terrain.js';

export const COL = {
  white: 0xfbf6ea, maroon: 0x7a1f26, gold: 0xf5a800, ember: 0xd9401b, ink: 0x23232a, tree: 0x2f6b4f, tree2: 0x3f8a5f,
  wood: 0x8a5a3a, woodDark: 0x5f3d28, skin: 0xc98d5e, rope: 0xcdb892, stone: 0x8b8178
};
export const FLAGS = [0x2d6fc4, 0xfbf6ea, 0xc9302c, 0x2f8a57, 0xf5c518];

function seeded(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const mats = new Map();
export function mat(c) { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c, flatShading: true })); return mats.get(c); }
export function box(w, h, d, c, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}
// Several shapes in one mesh, each with its own colour: fewer draw calls
export function merged(parts) {
  let n = 0; const gs = parts.map(p => { const g = p.g.index ? p.g.toNonIndexed() : p.g; n += g.attributes.position.count; return g; });
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color(); let o = 0;
  gs.forEach((g, i) => { pos.set(g.attributes.position.array, o * 3); c.setHex(parts[i].c); for (let k = 0; k < g.attributes.position.count; k++) col.set([c.r, c.g, c.b], (o + k) * 3); o += g.attributes.position.count; });
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.computeVertexNormals(); return out;
}
const vmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
// Trees that stand between the camera and the climber are drawn as a screen-door, so you never lose sight of yourself
export const seeU = { uSee: { value: new THREE.Vector3(0, 0, 2) }, uRes: { value: new THREE.Vector2(1, 1) } };
const seeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
seeMat.onBeforeCompile = sh => {
  sh.uniforms.uSee = seeU.uSee; sh.uniforms.uRes = seeU.uRes;
  sh.fragmentShader = sh.fragmentShader.replace('void main() {', `uniform vec3 uSee; uniform vec2 uRes;
void main() {
  vec2 q = (gl_FragCoord.xy / uRes * 2.0 - 1.0 - uSee.xy) * vec2(uRes.x / uRes.y, 1.0);
  float d = length(q);
  if (gl_FragCoord.z < uSee.z && d < 0.34 && (d < 0.2 || mod(floor(gl_FragCoord.x * 0.5) + floor(gl_FragCoord.y * 0.5), 2.0) < 1.0)) discard;`);
};
const G = {
  box: (w, h, d, x = 0, y = 0, z = 0, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; },
  cone: (r, h, seg, x = 0, y = 0, z = 0) => { const g = new THREE.ConeGeometry(r, h, seg); g.translate(x, y, z); return g; },
  cyl: (r1, r2, h, seg, x = 0, y = 0, z = 0) => { const g = new THREE.CylinderGeometry(r1, r2, h, seg); g.translate(x, y, z); return g; },
  ball: (r, x = 0, y = 0, z = 0, d = 0) => { const g = new THREE.IcosahedronGeometry(r, d); g.translate(x, y, z); return g; }
};

export function label(text, opts = {}) {
  const size = 64, c = document.createElement('canvas'), g = c.getContext('2d'), font = '800 ' + size + 'px Archivo, "Helvetica Neue", Arial, sans-serif';
  g.font = font; const w = Math.ceil(g.measureText(text).width) + size; c.width = w; c.height = Math.ceil(size * 1.5);
  g.font = font; g.fillStyle = opts.bg || '#7a1f26'; g.fillRect(0, 0, w, c.height); g.fillStyle = opts.fg || '#fbf6ea'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, c.height / 2 + 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, fog: false })); sp.userData.aspect = w / c.height; sp.renderOrder = 5;
  const h = opts.h || 1; sp.scale.set(h * sp.userData.aspect, h, 1); return sp;
}
function wrapText(g, text, maxW) { const words = text.split(' '), lines = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line); return lines; }
// A painted wooden board: a title and a line or two
function boardTexture(title, body, opts = {}) {
  const W = 512, Hh = opts.tall ? 384 : 320, c = document.createElement('canvas'), g = c.getContext('2d'); c.width = W; c.height = Hh;
  g.fillStyle = opts.bg || '#fbf6ea'; g.fillRect(0, 0, W, Hh); g.fillStyle = opts.band || '#7a1f26'; g.fillRect(0, 0, W, 18); g.fillStyle = '#f5a800'; g.fillRect(0, 18, W, 7);
  g.fillStyle = opts.fg || '#1c1e24'; g.textBaseline = 'top'; let y = 46;
  g.font = '800 ' + (opts.titleSize || 54) + 'px Archivo, Arial, sans-serif';
  for (const l of wrapText(g, title, W - 56)) { g.fillText(l, 28, y); y += (opts.titleSize || 54) * 1.05; }
  y += 10; g.font = '500 30px Archivo, Arial, sans-serif'; g.fillStyle = opts.sub || '#565a63';
  for (const l of wrapText(g, body || '', W - 56).slice(0, 5)) { g.fillText(l, 28, y); y += 38; }
  if (opts.draw) opts.draw(g, W, Hh);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function buildScene(renderer, content) {
  const scene = new THREE.Scene(), rnd = seeded(7570);
  const W = { scene, obstacles: [], interact: [], flutter: [], spinners: [], pickups: [], props: [], tick: [], signs: [], water: [] };
  const Y = (x, z) => T.sample(x, z);
  const solid = (x, z, r, top) => W.obstacles.push({ x, z, r, top });

  /* ---------- Light and sky ---------- */
  scene.fog = new THREE.Fog(0xf0d9a8, 150, 460);
  const hemi = new THREE.HemisphereLight(0xfff6e4, 0xa58f77, 2.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 320; sun.shadow.bias = -0.0012; sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target); W.sun = sun; W.hemi = hemi;
  const skyU = { top: { value: new THREE.Color(0x8fbbe0) }, bottom: { value: new THREE.Color(0xf3dcae) } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 12), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ float t = smoothstep(-0.05, 0.55, h); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }'
  })); sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky); W.sky = sky; W.skyU = skyU;

  /* ---------- The mountain ---------- */
  {
    const N = T.N, pos = new Float32Array(N * N * 18), col = new Float32Array(N * N * 18), c = new THREE.Color();
    const trailMask = new Uint8Array(N * N);
    for (const t of T.TRAIL) {
      const cx = Math.floor((t.x + T.SIZE / 2) / T.CELL), cz = Math.floor((t.z + T.SIZE / 2) / T.CELL);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const ix = cx + a, iz = cz + b; if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
        if (Math.hypot(-T.SIZE / 2 + (ix + 0.5) * T.CELL - t.x, -T.SIZE / 2 + (iz + 0.5) * T.CELL - t.z) < 1.75) trailMask[ix * N + iz] = 1;
      }
    }
    const C = hex => new THREE.Color(hex);
    const MEADOW = [C(0x7fa35c), C(0x6f9a55), C(0x8fb065)], B1 = [C(0x86a460), C(0x789a58)], B2 = [C(0x9aa56a), C(0xa9a873)], B3 = [C(0xa39a78), C(0x94906f)];
    const SNOW = C(0xf6f8fa), SNOW2 = C(0xe6edf3), WARM = [C(0x8a7b6c), C(0x7a6c60), C(0x97887a), C(0x6d6157)], COOL = [C(0x7d7f88), C(0x6c6e78), C(0x8b8d95), C(0x5e6069)];
    const DIRT = C(0xb08a5e), PACKED = C(0xd6cbb8), WET = C(0x5b6468);
    let o = 0; const hAt = (ix, iz) => T.H[ix * (N + 1) + iz];
    const tri = (x0, y0, z0, x1, y1, z1, x2, y2, z2, onTrail) => {
      const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0, vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, up = ny / Math.hypot(nx, ny, nz);
      const y = (y0 + y1 + y2) / 3, cx = (x0 + x1 + x2) / 3, cz = (z0 + z1 + z2) / 3, j = rnd();
      if (T.inGorge(cx, cz, -3.2) && y < T.streamBed(T.nominal(cx, cz)) + 1.6) c.copy(WET).offsetHSL(0, 0, (j - 0.5) * 0.06);
      else if (up < 0.74) {
        const set = y < 30 ? WARM : COOL; c.copy(set[Math.abs(Math.floor(y * 0.42 + T.vnoise(cx / 9, cz / 9) * 3)) % 4]).offsetHSL(0, 0, (j - 0.5) * 0.05);
        // Snow clings to the rock in streaks, more of it the higher you go
        if (y > 43 && T.vnoise(cx / 3.2 + 7, y / 2.1) + up * 0.5 > 1.12 - (y - 43) * 0.012) c.copy(j > 0.8 ? SNOW2 : SNOW);
      } else if (onTrail) c.copy(y > 50 ? PACKED : DIRT).offsetHSL(0, 0, (j - 0.5) * 0.04);
      else if (y < 6) c.copy(MEADOW[Math.floor(j * 3)]);
      else if (y < 20) c.copy(B1[j > 0.5 ? 1 : 0]);
      else if (y < 34) c.copy(B2[j > 0.5 ? 1 : 0]);
      else if (y < 48) c.copy(T.vnoise(cx / 5 + 3, cz / 5) > 0.62 ? (j > 0.5 ? SNOW : SNOW2) : B3[j > 0.5 ? 1 : 0]);
      else c.copy(T.vnoise(cx / 4, cz / 4 + 9) > 0.8 ? COOL[2] : j > 0.6 ? SNOW2 : SNOW);
      pos.set([x0, y0, z0, x1, y1, z1, x2, y2, z2], o); for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], o + k * 3); o += 9;
    };
    for (let ix = 0; ix < N; ix++) for (let iz = 0; iz < N; iz++) {
      const x0 = -T.SIZE / 2 + ix * T.CELL, z0 = -T.SIZE / 2 + iz * T.CELL, x1 = x0 + T.CELL, z1 = z0 + T.CELL, tr = trailMask[ix * N + iz];
      const h00 = hAt(ix, iz), h10 = hAt(ix + 1, iz), h01 = hAt(ix, iz + 1), h11 = hAt(ix + 1, iz + 1);
      tri(x0, h00, z0, x0, h01, z1, x1, h10, z0, tr); tri(x1, h10, z0, x0, h01, z1, x1, h11, z1, tr);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const land = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); land.receiveShadow = true; land.castShadow = true; scene.add(land); W.land = land;
    // A skirt of ground past the grid so the horizon never shows an edge
    const skirt = new THREE.Mesh(new THREE.RingGeometry(180, 620, 40, 1), mat(0x7f9c66)); skirt.rotation.x = -Math.PI / 2; skirt.position.y = 6; scene.add(skirt);
  }
  // Far range on the horizon
  for (let p = 0; p < 36; p++) {
    const pa = p / 36 * Math.PI * 2 + rnd() * 0.1, pd = 300 + rnd() * 90, ph = 80 + rnd() * 100, pw = 40 + rnd() * 40, seg = 5 + Math.floor(rnd() * 3), px = Math.cos(pa) * pd, pz = Math.sin(pa) * pd;
    const m = new THREE.Mesh(merged([{ g: G.cone(pw, ph, seg, 0, ph / 2, 0), c: 0x8c8b92 }, { g: G.cone(pw * 0.43, ph * 0.43, seg, 0, ph * 0.79, 0), c: 0xfbfbf8 }]), vmat);
    m.position.set(px, 0, pz); m.rotation.y = rnd() * 6; scene.add(m);
  }

  /* ---------- Water in the gorge ---------- */
  {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#6fb3d9'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 46; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.25 + rnd() * 0.5) + ')'; g.fillRect(rnd() * 64, rnd() * 256, 2 + rnd() * 5, 14 + rnd() * 50); }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    const pts = []; for (let rr = 41.5; rr <= 150; rr += 1) pts.push(rr);
    const pos = [], uv = [], idx = [];
    pts.forEach((rr, i) => {
      const p = T.polar(T.GORGE, rr), tx = -Math.sin(T.GORGE), tz = Math.cos(T.GORGE), half = rr < 45 ? 1.2 : 1.9, y = T.streamBed(rr) + 0.38;
      pos.push(p.x - tx * half, y, p.z - tz * half, p.x + tx * half, y, p.z + tz * half); uv.push(0, i / 9, 1, i / 9);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const water = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.86, side: THREE.DoubleSide })); scene.add(water);
    W.tick.push((dt, t) => { tex.offset.y = t * 0.7; });
    const src = T.polar(T.GORGE, 41.5); W.stream = { x: T.polar(T.GORGE, 62).x, z: T.polar(T.GORGE, 62).z, tx: Math.cos(T.GORGE), tz: Math.sin(T.GORGE) };
    const pond = new THREE.Mesh(new THREE.CircleGeometry(2.6, 9), new THREE.MeshBasicMaterial({ color: 0x7fbfe0, transparent: true, opacity: 0.9 })); pond.rotation.x = -Math.PI / 2; pond.position.set(src.x, T.streamBed(41.5) + 0.42, src.z); scene.add(pond);
  }

  /* ---------- Bridges ---------- */
  function flagLine(ax, ay, az, bx, by, bz, n = 9, sag = 0.5) {
    for (let i = 1; i < n; i++) {
      const t = i / n, fl = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.8), new THREE.MeshLambertMaterial({ color: FLAGS[i % 5], side: THREE.DoubleSide }));
      fl.position.set(ax + (bx - ax) * t, ay + (by - ay) * t - 0.45 - Math.sin(t * Math.PI) * sag, az + (bz - az) * t);
      fl.rotation.y = Math.atan2(-(bz - az), bx - ax); scene.add(fl); W.flutter.push({ m: fl, p: i * 0.8 + ax, r: fl.rotation.y });
    }
    const len = Math.hypot(bx - ax, by - ay, bz - az), line = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 4), mat(COL.ink));
    line.position.set((ax + bx) / 2, (ay + by) / 2 - sag * 0.4, (az + bz) / 2); line.lookAt(bx, by - sag * 0.4, bz); line.rotateX(Math.PI / 2); scene.add(line);
  }
  function post(x, z, h, c = COL.ink, r = 0.09) { const y = Y(x, z); box(r * 2, h, r * 2, c, x, y + h / 2, z, scene); return y + h; }
  for (const b of T.BRIDGES) {
    const g = new THREE.Group(); g.position.set(b.x, b.y, b.z); g.rotation.y = b.yaw; scene.add(g);
    if (b.kind === 'rope') {
      const parts = [];
      for (let s = -b.half; s <= b.half; s += 0.62) parts.push({ g: G.box(b.w, 0.12, 0.46, 0, -0.06, s, 0), c: rnd() > 0.5 ? COL.wood : COL.woodDark });
      for (const sx of [-1, 1]) {
        parts.push({ g: G.box(0.07, 0.07, b.half * 2 + 1.2, sx * b.w / 2, 1.0, 0), c: COL.rope }, { g: G.box(0.07, 0.07, b.half * 2 + 1.2, sx * b.w / 2, 0.02, 0), c: COL.rope });
        for (let s = -b.half; s <= b.half; s += 1.24) parts.push({ g: G.box(0.04, 1.0, 0.04, sx * b.w / 2, 0.5, s), c: COL.rope });
        for (const e of [-1, 1]) parts.push({ g: G.box(0.26, 2.3, 0.26, sx * (b.w / 2 + 0.1), 0.75, e * (b.half + 0.5)), c: COL.woodDark });
      }
      const m = new THREE.Mesh(merged(parts), vmat); m.castShadow = true; m.receiveShadow = true; g.add(m);
      const a = new THREE.Vector3(b.w / 2 + 0.1, 1.9, -b.half - 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw), e = new THREE.Vector3(b.w / 2 + 0.1, 1.9, b.half + 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw);
      flagLine(b.x + a.x, b.y + a.y, b.z + a.z, b.x + e.x, b.y + e.y, b.z + e.z, 16, 0.7);
    } else {
      const log = new THREE.Mesh(merged([{ g: (() => { const c = new THREE.CylinderGeometry(0.78, 0.9, b.half * 2 + 3, 7); c.rotateX(Math.PI / 2); c.translate(0, -0.78, 0); return c; })(), c: COL.woodDark }, { g: G.cyl(0.14, 0.2, 1.3, 5, 0.5, 0.2, 2.5), c: COL.wood }, { g: G.cyl(0.12, 0.18, 1.0, 5, -0.5, 0.1, -3), c: COL.wood }]), vmat);
      log.castShadow = true; log.receiveShadow = true; g.add(log);
    }
  }

  /* ---------- Building blocks for camps ---------- */
  function tent(x, z, c, rot) {
    const y = Y(x, z), m = new THREE.Mesh(merged([{ g: G.cone(1.7, 2, 4, 0, 1, 0), c }, { g: G.box(0.7, 1.0, 0.06, 0, 0.5, 1.0, 0), c: COL.ink }]), vmat);
    m.position.set(x, y, z); m.rotation.y = rot; m.scale.z = 1.45; m.castShadow = true; scene.add(m); solid(x, z, 1.5, y + 2);
  }
  function chorten(x, z) {
    const y = Y(x, z), m = new THREE.Mesh(merged([{ g: G.box(2, 0.7, 2, 0, 0.35, 0), c: COL.white }, { g: G.box(1.4, 0.5, 1.4, 0, 0.95, 0), c: COL.white }, { g: G.box(1.45, 0.14, 1.45, 0, 1.24, 0), c: COL.maroon },
      { g: new THREE.SphereGeometry(0.75, 8, 6).translate(0, 1.75, 0), c: COL.white }, { g: G.cone(0.3, 1.2, 5, 0, 2.95, 0), c: COL.gold }]), vmat);
    m.position.set(x, y, z); m.castShadow = true; scene.add(m); solid(x, z, 1.35, y + 3);
  }
  function fire(x, z) {
    const y = Y(x, z), g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    const ring = new THREE.Mesh(merged([0, 1, 2, 3, 4, 5].map(i => ({ g: G.ball(0.22, Math.cos(i) * 0.55, 0.1, Math.sin(i) * 0.55), c: COL.stone }))), vmat); g.add(ring);
    const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 5), new THREE.MeshBasicMaterial({ color: 0xff8a1f })), f2 = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 5), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
    f1.position.y = 0.45; f2.position.y = 0.4; g.add(f1, f2);
    W.tick.push((dt, t) => { const s = 1 + Math.sin(t * 11 + x) * 0.13 + Math.sin(t * 17) * 0.07; f1.scale.set(s, 1 + Math.sin(t * 9 + z) * 0.22, s); f2.scale.y = 1 + Math.sin(t * 13) * 0.25; f1.rotation.y = t * 2; });
  }
  // A notice board you can walk up to and read
  function board(x, z, facing, tex, opts = {}) {
    const w = opts.w || 2.4, h = opts.h || 1.5, y = Y(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = facing; scene.add(g);
    const frame = new THREE.Mesh(merged([{ g: G.box(0.16, h + 1.3, 0.16, -w / 2, (h + 1.3) / 2, 0), c: COL.woodDark }, { g: G.box(0.16, h + 1.3, 0.16, w / 2, (h + 1.3) / 2, 0), c: COL.woodDark },
      { g: G.box(w + 0.5, 0.14, 0.5, 0, h + 1.36, 0), c: COL.maroon }, { g: G.box(w + 0.16, h + 0.1, 0.08, 0, 0.75 + h / 2, -0.03), c: COL.wood }]), vmat); frame.castShadow = true; g.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex })); face.position.set(0, 0.75 + h / 2, 0.02); g.add(face);
    solid(x, z, 0.7, y + 3); return g;
  }
  function campFrame(c) { const side = { x: -c.out.z, z: c.out.x }; return { at: (u, v) => ({ x: c.x + c.out.x * u + side.x * v, z: c.z + c.out.z * u + side.z * v }), side, face: Math.atan2(c.out.x, c.out.z) }; }

  /* ---------- Camps ---------- */
  const names = { base: 'BASE CAMP', teaching: 'CAMP 1 · TEACHING', experience: 'CAMP 2 · EXPERIENCE', projects: 'CAMP 3 · PROJECTS', research: 'CAMP 4 · RESEARCH', contact: 'SUMMIT · CONTACT' };
  T.CAMPS.forEach((c, i) => {
    const F = campFrame(c), info = content[c.id];
    const sign = label(names[c.id]); sign.position.set(c.x, c.y + 6.4, c.z); scene.add(sign); W.signs.push({ sp: sign, camp: c });
    if (i === 0 || i === 5) return;
    const t1 = F.at(-3.7, 4.4), t2 = F.at(-4.0, -4.2); tent(t1.x, t1.z, i % 2 ? COL.ember : COL.gold, F.face + 0.5); tent(t2.x, t2.z, i % 2 ? COL.gold : COL.ember, F.face - 0.4);
    const fa = F.at(-5.2, -6.2), fb = F.at(-5.2, 6.2); flagLine(fa.x, post(fa.x, fa.z, 3.8), fa.z, fb.x, post(fb.x, fb.z, 3.8), fb.z, 13, 0.6);
    const fp = F.at(1.2, -3.2); fire(fp.x, fp.z);
    if (c.id !== 'projects') {
      const bp = F.at(-2.6, 0.3); board(bp.x, bp.z, F.face, boardTexture(info.title, info.blurb), { w: 2.9, h: 1.8 });
      W.interact.push({ x: bp.x + c.out.x * 1.4, z: bp.z + c.out.z * 1.4, y: c.y, r: 3.4, text: 'Read ' + info.title, open: c.id, key: 'board-' + c.id });
    }
  });

  // Base camp: a small dzong, a prayer wheel and somewhere to start
  {
    const c = T.camp('base'), F = campFrame(c);
    const dz = F.at(-1, 25), dy = Y(dz.x, dz.z) - 0.7, parts = [
      { g: G.box(15, 7, 10, 0, 3.5, 0), c: COL.white }, { g: G.box(15.1, 1.1, 10.1, 0, 6.1, 0), c: COL.maroon }, { g: G.box(17, 0.6, 12, 0, 7.2, 0), c: COL.gold },
      { g: G.box(6.5, 4, 6, 0, 9.3, 0), c: COL.white }, { g: G.box(6.6, 0.8, 6.1, 0, 10.9, 0), c: COL.maroon }, { g: G.box(8, 0.5, 7.4, 0, 11.6, 0), c: COL.gold }, { g: G.cone(0.5, 1.6, 5, 0, 12.6, 0), c: COL.gold },
      { g: G.box(3, 3.6, 0.3, 0, 2.3, 5.1), c: COL.maroon }, { g: G.box(1.2, 1.4, 0.2, -5, 4, 5.05), c: COL.ink }, { g: G.box(1.2, 1.4, 0.2, 5, 4, 5.05), c: COL.ink }, { g: G.box(1.2, 1.4, 0.2, -2.6, 4.4, 5.05), c: COL.ink }, { g: G.box(1.2, 1.4, 0.2, 2.6, 4.4, 5.05), c: COL.ink }
    ];
    const dzong = new THREE.Mesh(merged(parts), vmat); dzong.position.set(dz.x, dy, dz.z); dzong.rotation.y = Math.atan2(c.x - dz.x, c.z - dz.z); dzong.castShadow = true; dzong.receiveShadow = true; scene.add(dzong);
    for (let k = -1; k <= 1; k++) { const o = new THREE.Vector3(k * 5, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), dzong.rotation.y); solid(dz.x + o.x, dz.z + o.z, 5.4, dy + 12); }
    const t1 = F.at(-6, -8); tent(t1.x, t1.z, COL.ember, 1); const t2 = F.at(-9, -3.5); tent(t2.x, t2.z, COL.gold, 0.2);
    const fa = F.at(-3, -11), fb = F.at(-11, 1); flagLine(fa.x, post(fa.x, fa.z, 4), fa.z, fb.x, post(fb.x, fb.z, 4), fb.z, 14, 0.7);
    const fp = F.at(-5, -3); fire(fp.x, fp.z);
    const ch = F.at(4, -11); chorten(ch.x, ch.z);
    // Prayer wheel: turns when you walk past
    const pw = F.at(2, 9), py = Y(pw.x, pw.z), house = new THREE.Mesh(merged([{ g: G.box(0.22, 2.6, 0.22, -1, 1.3, -1), c: COL.maroon }, { g: G.box(0.22, 2.6, 0.22, 1, 1.3, -1), c: COL.maroon }, { g: G.box(0.22, 2.6, 0.22, -1, 1.3, 1), c: COL.maroon }, { g: G.box(0.22, 2.6, 0.22, 1, 1.3, 1), c: COL.maroon },
      { g: G.box(2.9, 0.22, 2.9, 0, 2.7, 0), c: COL.gold }, { g: G.cone(2.1, 0.9, 4, 0, 3.25, 0).rotateY(Math.PI / 4), c: COL.maroon }, { g: G.box(2.4, 0.3, 2.4, 0, 0.15, 0), c: COL.white }]), vmat);
    house.position.set(pw.x, py, pw.z); house.castShadow = true; scene.add(house);
    const wheel = new THREE.Mesh(merged([{ g: G.cyl(0.62, 0.62, 1.5, 10, 0, 0, 0), c: COL.ember }, { g: G.cyl(0.66, 0.66, 0.16, 10, 0, 0.62, 0), c: COL.gold }, { g: G.cyl(0.66, 0.66, 0.16, 10, 0, -0.62, 0), c: COL.gold }, { g: G.cyl(0.66, 0.66, 0.1, 10, 0, 0, 0), c: COL.gold }]), vmat);
    wheel.position.set(pw.x, py + 1.4, pw.z); wheel.castShadow = true; scene.add(wheel); solid(pw.x, pw.z, 1.0, py + 3);
    W.spinners.push({ m: wheel, x: pw.x, z: pw.z, y: py, v: 0, r: 3.6 });
  }

  // Camp 1, teaching: a chalkboard with a small automaton on it
  {
    const c = T.camp('teaching'), F = campFrame(c), p = F.at(-2.4, -6.5);
    board(p.x, p.z, F.face + 0.5, boardTexture('', '', { bg: '#27443a', band: '#5f3d28', draw: (g, w, h) => {
      g.strokeStyle = '#f2f0e6'; g.fillStyle = '#f2f0e6'; g.lineWidth = 5; g.font = '700 34px Archivo, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const st = [[110, 190, 'q0'], [256, 110, 'q1'], [402, 190, 'q2']];
      st.forEach(([x, y, n], i) => { g.beginPath(); g.arc(x, y, 40, 0, 6.3); g.stroke(); if (i === 2) { g.beginPath(); g.arc(x, y, 31, 0, 6.3); g.stroke(); } g.fillText(n, x, y + 2); });
      const arrow = (x0, y0, x1, y1, t) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); const a = Math.atan2(y1 - y0, x1 - x0); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - 16 * Math.cos(a - 0.5), y1 - 16 * Math.sin(a - 0.5)); g.lineTo(x1 - 16 * Math.cos(a + 0.5), y1 - 16 * Math.sin(a + 0.5)); g.fill(); g.fillText(t, (x0 + x1) / 2, (y0 + y1) / 2 - 22); };
      arrow(146, 168, 218, 128, '0'); arrow(294, 128, 366, 168, '1'); arrow(30, 190, 68, 190, '');
      g.beginPath(); g.arc(256, 56, 22, 2.3, 7.1); g.stroke(); g.fillText('0', 256, 22);
      g.font = '500 28px Archivo, Arial'; g.fillText('CSC 280: does it halt?', 256, 280);
    } }), { w: 2.6, h: 1.6 });
  }
  // Camp 2, experience: solar panels for the summer at Buffalo Solar
  {
    const c = T.camp('experience'), F = campFrame(c);
    for (let k = 0; k < 3; k++) {
      const p = F.at(3.6, 1.6 + k * 1.9), y = Y(p.x, p.z), m = new THREE.Mesh(merged([{ g: G.box(1.6, 0.08, 1.1, 0, 0, 0), c: 0x24507e }, { g: G.box(1.7, 0.05, 1.2, 0, -0.05, 0), c: 0xdfe3e8 }, { g: G.box(0.1, 0.9, 0.1, 0, -0.45, 0.2), c: COL.ink }]), vmat);
      m.position.set(p.x, y + 0.95, p.z); m.rotation.set(-0.5, F.face, 0, 'YXZ'); m.castShadow = true; scene.add(m);
    }
  }
  // Camp 3, projects: one board per project
  {
    const c = T.camp('projects'), F = campFrame(c), list = content.projects.items;
    list.forEach((it, k) => {
      const v = (k - 1.5) * 3.3, p = F.at(-2.9 - Math.abs(k - 1.5) * 0.25, v);
      board(p.x, p.z, F.face + (1.5 - k) * 0.12, boardTexture(it.title, it.chips, { titleSize: 46, band: ['#7a1f26', '#285a80', '#2f6048', '#805300'][k] }), { w: 2.5, h: 1.6 });
      W.interact.push({ x: p.x + c.out.x * 1.4, z: p.z + c.out.z * 1.4, y: c.y, r: 2.1, text: 'Read ' + it.title, open: 'projects', item: k, key: 'proj-' + k });
    });
  }
  // Camp 4, research: a camera on a tripod, looking out
  {
    const c = T.camp('research'), F = campFrame(c), p = F.at(3.4, 2.6), y = Y(p.x, p.z);
    const m = new THREE.Mesh(merged([{ g: G.cyl(0.04, 0.04, 1.5, 4, 0.3, 0.7, 0.2), c: COL.ink }, { g: G.cyl(0.04, 0.04, 1.5, 4, -0.3, 0.7, 0.2), c: COL.ink }, { g: G.cyl(0.04, 0.04, 1.5, 4, 0, 0.7, -0.3), c: COL.ink },
      { g: G.box(0.5, 0.36, 0.34, 0, 1.6, 0), c: COL.ink }, { g: G.cyl(0.13, 0.16, 0.3, 8, 0, 1.6, 0.3).rotateX(0), c: 0x4a4d57 }, { g: G.box(0.14, 0.1, 0.14, 0.12, 1.84, 0), c: COL.gold }]), vmat);
    m.position.set(p.x, y, p.z); m.rotation.y = F.face; m.castShadow = true; scene.add(m); solid(p.x, p.z, 0.5, y + 2);
  }
  // Summit: prayer flags from a mast, and a box with a logbook in it
  {
    const c = T.camp('contact'), top = 6.5, mx = c.x - c.out.x * 1.6, mz = c.z - c.out.z * 1.6, my = Y(mx, mz);
    box(0.2, top, 0.2, COL.ink, mx, my + top / 2, mz, scene); solid(mx, mz, 0.3, my + top);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.5, ex = mx + Math.cos(a) * 7.5, ez = mz + Math.sin(a) * 7.5; flagLine(mx, my + top, mz, ex, Y(ex, ez) + 0.6, ez, 12, 0.5); }
    const F = campFrame(c), bp = F.at(2.2, -1.2), by = Y(bp.x, bp.z);
    const bx = new THREE.Mesh(merged([{ g: G.box(0.14, 1.1, 0.14, 0, 0.55, 0), c: COL.woodDark }, { g: G.box(0.8, 0.55, 0.5, 0, 1.3, 0), c: COL.maroon }, { g: G.box(0.86, 0.1, 0.56, 0, 1.6, 0), c: COL.gold }, { g: G.box(0.3, 0.2, 0.04, 0, 1.3, 0.27), c: COL.white }]), vmat);
    bx.position.set(bp.x, by, bp.z); bx.rotation.y = F.face; bx.castShadow = true; scene.add(bx); solid(bp.x, bp.z, 0.5, by + 2);
    W.interact.push({ x: bp.x, z: bp.z, y: c.y, r: 3.2, text: 'Open the summit box', open: 'contact', key: 'board-contact' });
  }

  /* ---------- Marked routes: holds, a fixed rope, a name at the foot ---------- */
  {
    const holdG = new THREE.DodecahedronGeometry(0.2, 0), holds = new THREE.InstancedMesh(holdG, new THREE.MeshLambertMaterial({ flatShading: true }), 240), M = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), cc = new THREE.Color();
    let n = 0;
    T.ROUTES.forEach((R, ri) => {
      const tx = -Math.sin(R.a), tz = Math.cos(R.a), rope = [];
      for (let rr = R.o + 1.2; rr >= R.i - 1.2; rr -= 0.5) {
        const p = T.polar(R.a, rr); rope.push(new THREE.Vector3(p.x, Y(p.x, p.z) + 0.28, p.z));
        for (let k = 0; k < 2 && n < 240; k++) {
          const off = (rnd() - 0.5) * 3.6, x = p.x + tx * off, z = p.z + tz * off, g = T.gradient(x, z, 0.8);
          if (Math.hypot(g.gx, g.gz) < 0.6) continue;
          q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)); const s = 0.8 + rnd() * 0.9; sv.set(s, s * 0.7, s); pv.set(x, Y(x, z) + 0.1, z);
          M.compose(pv, q, sv); holds.setMatrixAt(n, M); holds.setColorAt(n, cc.setHex([0xf5c518, 0xc9302c, 0x2d6fc4, 0x2f8a57, 0xfbf6ea][(ri + (rnd() > 0.75 ? 1 : 0)) % 5])); n++;
        }
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rope), rope.length * 2, 0.055, 5), mat(0xe8e2d0)); tube.castShadow = true; scene.add(tube);
      const anchor = rope[rope.length - 1]; box(0.24, 0.7, 0.24, COL.ink, anchor.x, anchor.y + 0.1, anchor.z, scene);
      const sp = label(R.name + '  ' + R.grade, { h: 0.62, bg: '#1c1e24' }); sp.position.set(R.foot.x, Y(R.foot.x, R.foot.z) + 2.9, R.foot.z); scene.add(sp); W.signs.push({ sp, route: R, x: R.foot.x, z: R.foot.z });
      const fx = R.foot.x + tx * 3, fz = R.foot.z + tz * 3; post(fx, fz, 1.5, COL.woodDark, 0.07);
    });
    holds.count = n; holds.instanceMatrix.needsUpdate = true; if (holds.instanceColor) holds.instanceColor.needsUpdate = true; holds.castShadow = true; scene.add(holds);
  }

  /* ---------- Chalk bags to find: each one adds to your stamina ---------- */
  {
    const spots = T.ROUTES.map(R => ({ x: R.top.x, z: R.top.z }));
    const b = T.camp('base'), F = campFrame(b); spots.push(F.at(-3, 36.5));                // behind the dzong
    spots.push(T.polar(T.GORGE, 69.5));                                                  // down in the gorge, under the log
    spots.push(T.polar(T.A0 + 1.25 + Math.PI, 39));                                      // the quiet side of the third bench
    spots.forEach((s, i) => {
      const y = Y(s.x, s.z), g = new THREE.Group();
      const bag = new THREE.Mesh(merged([{ g: G.cyl(0.3, 0.24, 0.5, 7, 0, 0, 0), c: [0xc9302c, 0x2d6fc4, 0x2f8a57, 0xf5c518][i % 4] }, { g: G.cyl(0.25, 0.3, 0.12, 7, 0, 0.3, 0), c: 0xfbf6ea }, { g: G.cyl(0.33, 0.33, 0.06, 7, 0, 0.2, 0), c: COL.ink }]), vmat);
      bag.castShadow = true; g.add(bag);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 20), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, side: THREE.DoubleSide })); halo.rotation.x = -Math.PI / 2; halo.position.y = -0.85; g.add(halo);
      g.position.set(s.x, y + 1.2, s.z); scene.add(g); W.pickups.push({ g, x: s.x, y: y + 1.2, z: s.z, got: false, i });
    });
  }

  /* ---------- Zip line from the summit back to base camp ---------- */
  {
    const a = T.A0 - 0.3, top = T.polar(a, 5.5), end = T.polar(a, 108);
    const ty = Y(top.x, top.z) + 5.2, ey = Y(end.x, end.z) + 3.4;
    const A = new THREE.Vector3(top.x, ty, top.z), B = new THREE.Vector3(end.x, ey, end.z), len = A.distanceTo(B);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 5), mat(COL.ink)); cable.position.copy(A).lerp(B, 0.5); cable.lookAt(B); cable.rotateX(Math.PI / 2); scene.add(cable);
    for (const [p, h] of [[top, 5.2], [end, 3.4]]) { const y = Y(p.x, p.z); const m = new THREE.Mesh(merged([{ g: G.box(0.18, h, 0.18, -0.75, h / 2, 0), c: COL.woodDark }, { g: G.box(0.18, h, 0.18, 0.75, h / 2, 0), c: COL.woodDark }, { g: G.box(1.9, 0.18, 0.22, 0, h, 0), c: COL.woodDark }]), vmat); m.position.set(p.x, y, p.z); m.rotation.y = Math.atan2(top.x, top.z) + Math.PI / 2; m.castShadow = true; scene.add(m); }
    W.zip = { A, B, len };
    W.interact.push({ x: top.x, z: top.z, y: ty - 5.2, r: 2.4, text: 'Ride the zip line down', zip: true, key: 'zip' });
    const sp = label('ZIP LINE TO BASE CAMP', { h: 0.5, bg: '#1c1e24' }); sp.position.set(top.x, ty + 0.7, top.z); scene.add(sp); W.signs.push({ sp, x: top.x, z: top.z, near: 14 });
  }

  /* ---------- Trees, shrubs, rocks, grass ---------- */
  {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const pine = merged([{ g: G.cyl(0.16, 0.22, 1.0, 5, 0, 0.5, 0), c: 0x5f3d28 }, { g: G.cone(1.15, 2.2, 6, 0, 1.9, 0), c: COL.tree }, { g: G.cone(0.85, 1.9, 6, 0, 3.2, 0), c: COL.tree2 }]);
    const trees = new THREE.InstancedMesh(pine, seeMat, 520); let n = 0, tries = 0;
    while (n < 520 && tries++ < 6000) {
      const a = rnd() * Math.PI * 2, lower = rnd() < 0.7, rr = lower ? 84 + Math.pow(rnd(), 0.7) * 100 : (rnd() < 0.6 ? 64.5 + rnd() * 9 : 49.5 + rnd() * 8), pt = T.polar(a, rr);
      if (!T.clear(pt.x, pt.z, 1) || Math.hypot(pt.x, pt.z) > 185) continue;
      const g = T.gradient(pt.x, pt.z); if (Math.hypot(g.gx, g.gz) > 0.45) continue;
      const sc2 = (lower ? 0.9 : 0.7) + rnd() * (lower ? 1.3 : 0.6); q.setFromAxisAngle(up, rnd() * 6); s.set(sc2, sc2 * (1.05 + rnd() * 0.4), sc2); p.set(pt.x, Y(pt.x, pt.z) - 0.1, pt.z);
      M.compose(p, q, s); trees.setMatrixAt(n++, M); if (Math.hypot(pt.x, pt.z) < T.BOUND + 2) solid(pt.x, pt.z, 0.32 * sc2, p.y + 4 * sc2);
    }
    trees.count = n; trees.castShadow = true; trees.receiveShadow = true; scene.add(trees);

    // Rhododendron on the lower benches and meadow
    const bush = merged([{ g: G.ball(0.7, 0, 0.45, 0), c: 0x3d7a52 }, { g: G.ball(0.3, 0.3, 0.95, 0.1), c: 0xd8456b }, { g: G.ball(0.26, -0.3, 0.85, -0.2), c: 0xe2607f }, { g: G.ball(0.22, 0, 0.9, 0.42), c: 0xd8456b }]);
    const bushes = new THREE.InstancedMesh(bush, vmat, 150); n = 0; tries = 0;
    while (n < 150 && tries++ < 3000) {
      const a = rnd() * Math.PI * 2, rr = rnd() < 0.5 ? 82 + rnd() * 40 : (rnd() < 0.5 ? 65 + rnd() * 8 : 50 + rnd() * 7), pt = T.polar(a, rr);
      if (!T.clear(pt.x, pt.z, 0.6)) continue; const g = T.gradient(pt.x, pt.z); if (Math.hypot(g.gx, g.gz) > 0.5) continue;
      const sc2 = 0.7 + rnd() * 0.8; q.setFromAxisAngle(up, rnd() * 6); s.setScalar(sc2); p.set(pt.x, Y(pt.x, pt.z) - 0.1, pt.z); M.compose(p, q, s); bushes.setMatrixAt(n++, M);
    }
    bushes.count = n; bushes.castShadow = true; scene.add(bushes);

    // Boulders everywhere, snow-dusted up high
    const rockG = new THREE.IcosahedronGeometry(1, 0), rocks = new THREE.InstancedMesh(rockG, new THREE.MeshLambertMaterial({ flatShading: true }), 300), cc = new THREE.Color(); n = 0; tries = 0;
    while (n < 300 && tries++ < 5000) {
      const a = rnd() * Math.PI * 2, rr = Math.pow(rnd(), 0.8) * 120 + 6, pt = T.polar(a, rr);
      if (!T.clear(pt.x, pt.z, 0.8)) continue; const g = T.gradient(pt.x, pt.z); if (Math.hypot(g.gx, g.gz) > 0.7) continue;
      const big = rnd() < 0.2, sc2 = big ? 1 + rnd() * 1.3 : 0.25 + rnd() * 0.55, y = Y(pt.x, pt.z);
      q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)); s.set(sc2, sc2 * (0.6 + rnd() * 0.4), sc2 * (0.8 + rnd() * 0.5)); p.set(pt.x, y + sc2 * 0.2, pt.z); M.compose(p, q, s);
      rocks.setMatrixAt(n, M); rocks.setColorAt(n, cc.setHex(y > 48 ? (rnd() > 0.5 ? 0xe9eef2 : 0x8b8d95) : [0x8b8178, 0x7a6c60, 0x97887a][Math.floor(rnd() * 3)])); n++;
      if (big) solid(pt.x, pt.z, sc2 * 0.82, y + sc2 * 0.9);
    }
    rocks.count = n; rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);

    // Grass and flowers on the meadow
    const tuft = new THREE.ConeGeometry(0.1, 0.5, 3); tuft.translate(0, 0.25, 0);
    const grass = new THREE.InstancedMesh(tuft, new THREE.MeshLambertMaterial({ flatShading: true }), 1300); n = 0; tries = 0;
    while (n < 1300 && tries++ < 6000) {
      const a = rnd() * Math.PI * 2, rr = rnd() < 0.75 ? 81 + rnd() * 48 : 64.5 + rnd() * 9, pt = T.polar(a, rr);
      if (T.trailDist(pt.x, pt.z) < 2.4 || T.inGorge(pt.x, pt.z)) continue;
      const f = rnd() < 0.16; q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5)); const sc2 = 0.8 + rnd() * 1.4; s.set(sc2, sc2 * (f ? 0.7 : 1), sc2); p.set(pt.x, Y(pt.x, pt.z) - 0.03, pt.z); M.compose(p, q, s);
      grass.setMatrixAt(n, M); grass.setColorAt(n, cc.setHex(f ? [0xf5c518, 0xfbf6ea, 0xd8456b, 0x7a6fd0][Math.floor(rnd() * 4)] : [0x5f8f4c, 0x6f9a55, 0x4f8048][Math.floor(rnd() * 3)])); n++;
    }
    grass.count = n; scene.add(grass);
  }

  /* ---------- Clouds and snow ---------- */
  {
    const puffG = new THREE.IcosahedronGeometry(1, 1), clouds = [];
    for (let cl = 0; cl < 16; cl++) {
      const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, flatShading: true, depthWrite: false });
      for (let pf = 0; pf < 5; pf++) { const pm = new THREE.Mesh(puffG, m); pm.position.set((pf - 2) * 2.4, rnd() * 0.9, rnd() * 2.4); const sz = 1.6 + rnd() * 2; pm.scale.set(sz, sz * 0.68, sz); g.add(pm); }
      clouds.push({ m, g, a: rnd() * 6.28, r: 70 + rnd() * 75, y: 22 + rnd() * 46, v: 0.008 + rnd() * 0.016 }); scene.add(g);
    }
    W.clouds = clouds;
    const SN = 600, sp = new Float32Array(SN * 3); for (let i = 0; i < SN * 3; i++) sp[i] = (rnd() - 0.5) * 70;
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const sm = new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, transparent: true, opacity: 0, depthWrite: false }), snow = new THREE.Points(sg, sm); snow.frustumCulled = false; scene.add(snow);
    W.snow = { pts: snow, m: sm, g: sg, n: SN };
  }

  /* ---------- Takin on the meadow: they keep their distance ---------- */
  {
    const b = T.camp('base');
    const geo = merged([{ g: G.box(1.0, 0.85, 1.7, 0, 1.05, 0), c: 0xb98a4a }, { g: G.box(0.9, 0.5, 0.7, 0, 1.55, 0.35), c: 0xa87a3e }, { g: G.box(0.52, 0.6, 0.62, 0, 1.25, 1.1), c: 0x6b4a2a }, { g: G.box(0.4, 0.34, 0.3, 0, 1.05, 1.5), c: 0x3a2a1c },
      { g: G.cone(0.08, 0.34, 4, -0.2, 1.7, 1.0), c: 0x2a2018 }, { g: G.cone(0.08, 0.34, 4, 0.2, 1.7, 1.0), c: 0x2a2018 },
      { g: G.box(0.24, 0.7, 0.24, -0.32, 0.35, 0.6), c: 0x6b4a2a }, { g: G.box(0.24, 0.7, 0.24, 0.32, 0.35, 0.6), c: 0x6b4a2a }, { g: G.box(0.24, 0.7, 0.24, -0.32, 0.35, -0.6), c: 0x6b4a2a }, { g: G.box(0.24, 0.7, 0.24, 0.32, 0.35, -0.6), c: 0x6b4a2a }]);
    W.takin = [[0.5, 104], [0.62, 112], [0.4, 116], [-0.5, 108]].map(([da, rr], i) => {
      const p = T.polar(T.A0 + da, rr), m = new THREE.Mesh(geo, vmat); m.castShadow = true; m.scale.setScalar(0.85 + (i % 2) * 0.2); scene.add(m);
      return { m, x: p.x, z: p.z, hx: p.x, hz: p.z, yaw: rnd() * 6, t: rnd() * 5, tx: p.x, tz: p.z, v: 0 };
    });
  }

  /* ---------- A migoi, if you look in the right place ---------- */
  {
    const p = T.polar(T.A0 + 1.25 + Math.PI + 0.42, 38.6), y = Y(p.x, p.z), g = new THREE.Group(); g.position.set(p.x, y, p.z); g.rotation.y = Math.atan2(p.x, p.z); scene.add(g);
    const body = new THREE.Mesh(merged([{ g: G.box(1.5, 1.7, 1.0, 0, 1.75, 0), c: 0xeef1f4 }, { g: G.box(0.95, 0.85, 0.85, 0, 3.0, 0.05), c: 0xe3e8ee }, { g: G.box(0.6, 0.34, 0.1, 0, 3.02, 0.48), c: 0x8a93a3 }, { g: G.box(0.1, 0.1, 0.06, -0.15, 3.08, 0.54), c: COL.ink }, { g: G.box(0.1, 0.1, 0.06, 0.15, 3.08, 0.54), c: COL.ink },
      { g: G.box(0.5, 0.95, 0.55, -0.4, 0.47, 0), c: 0xe3e8ee }, { g: G.box(0.5, 0.95, 0.55, 0.4, 0.47, 0), c: 0xe3e8ee }, { g: G.box(0.42, 1.5, 0.45, -0.98, 1.8, 0), c: 0xe3e8ee }]), vmat); body.castShadow = true; g.add(body);
    const arm = new THREE.Group(); arm.position.set(0.98, 2.5, 0); const am = new THREE.Mesh(merged([{ g: G.box(0.42, 1.5, 0.45, 0, -0.7, 0), c: 0xe3e8ee }]), vmat); am.castShadow = true; arm.add(am); g.add(arm);
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), mat(0x7d7f88)); const rp = T.polar(T.A0 + 1.25 + Math.PI + 0.33, 37.4); rock.position.set(rp.x, Y(rp.x, rp.z) + 0.9, rp.z); rock.scale.y = 0.9; rock.castShadow = true; scene.add(rock); solid(rp.x, rp.z, 1.9, Y(rp.x, rp.z) + 2.8);
    solid(p.x, p.z, 0.9, y + 3.5); W.migoi = { g, arm, x: p.x, z: p.z, y, seen: false, wave: 0 };
  }

  /* ---------- Things to knock about (given bodies once the physics engine has loaded) ---------- */
  {
    const add = (kind, x, z, dy, size, color, extra = {}) => W.props.push({ kind, x, z, y: Y(x, z) + dy, size, color, ...extra });
    const b = campFrame(T.camp('base')), crate = 0.9;
    [[0, 0], [1, 0], [2, 0], [0.5, 1], [1.5, 1], [1, 2]].forEach(([i, j]) => { const p = b.at(-1 + 0, 5.5 + i * (crate + 0.04)); add('box', p.x, p.z, crate / 2 + j * crate, [crate, crate, crate], j === 2 ? COL.gold : j ? COL.ember : COL.wood); });
    for (let k = 0; k < 3; k++) { const p = b.at(4.5 + k * 1.1, -4.5); add('barrel', p.x, p.z, 0.6, [0.42, 1.2], [0x2d6fc4, COL.ember, 0x2f8a57][k]); }
    { const p = b.at(-2, 0.5); add('ball', p.x, p.z, 0.42, [0.42], 0xfbf6ea); }
    // Teaching: a pile of textbooks
    const t = campFrame(T.camp('teaching')); for (let k = 0; k < 7; k++) { const p = t.at(3.2, 3.0); add('box', p.x, p.z, 0.16 + k * 0.32, [1.1 - (k % 3) * 0.12, 0.3, 0.8], [0x285a80, 0x7a1f26, 0x2f6048, 0xf5a800, 0x63503f][k % 5], { yaw: k * 0.5 }); }
    { const p = t.at(3.4, -0.5); add('ball', p.x, p.z, 0.3, [0.3], 0xd9401b); }
    // Experience: supply crates and a barrel
    const e = campFrame(T.camp('experience')); [[0, 0], [1, 0], [0.5, 1]].forEach(([i, j]) => { const p = e.at(3.4, -2.5 + i * 0.95); add('box', p.x, p.z, 0.45 + j * 0.9, [0.9, 0.9, 0.9], j ? COL.gold : COL.wood); });
    { const p = e.at(1.5, -5.4); add('barrel', p.x, p.z, 0.6, [0.42, 1.2], COL.maroon); }
    // Projects: toy bricks, for the brick-film project
    const pr = campFrame(T.camp('projects')), bc = [0xc9302c, 0x2d6fc4, 0xf5c518, 0x2f8a57, 0xfbf6ea];
    for (let row = 0; row < 4; row++) for (let k = 0; k < 3 - (row > 1 ? 1 : 0); k++) { const p = pr.at(3.6, -1.6 + k * 1.24 + (row % 2) * 0.62 + (row > 1 ? 0.3 : 0)); add('brick', p.x, p.z, 0.3 + row * 0.6, [1.2, 0.6, 0.6], bc[(row + k * 2) % 5], { yaw: pr.face + Math.PI / 2 }); }
    // Research: a snowman and spare snowballs
    const r = campFrame(T.camp('research')), sp = r.at(2.6, -2.6); add('ball', sp.x, sp.z, 0.6, [0.6], 0xf6f8fa); add('ball', sp.x, sp.z, 1.6, [0.44], 0xf6f8fa); add('ball', sp.x, sp.z, 2.36, [0.32], 0xf6f8fa);
    for (let k = 0; k < 3; k++) { const p = r.at(3.4 - k * 0.3, 0.2 + k * 0.9); add('ball', p.x, p.z, 0.36, [0.36], 0xf6f8fa); }
    // Summit: one big snowball, in case you wonder how far it rolls
    { const c = T.camp('contact'), s = campFrame(c).at(-1.5, 2.6); add('ball', s.x, s.z, 0.8, [0.8], 0xf6f8fa); }
    // Loose boulders near the edge of each bench
    [[0.78, 72.4], [1.6, 57.4], [2.1, 56.9], [3.95, 42.2], [4.5, 42.0], [6.3, 28.0], [5.2, 72.6], [0.2, 57]].forEach(([a, rr], i) => { const p = T.polar(T.A0 + a, rr); add('rock', p.x, p.z, 0.7, [0.55 + (i % 3) * 0.12], [0x8b8178, 0x7a6c60, 0x97887a][i % 3]); });
  }

  return W;
}
