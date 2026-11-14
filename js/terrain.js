// The shape of the mountain: pure maths, shared by the renderer, the climber, the vehicles, the physics and the map.
// Everything is generated. This is not a model of any real peak.

export const SIZE = 560, N = 400, CELL = SIZE / N, HALF = SIZE / 2;   // 1.4 m grid
export const BOUND = 214;                             // how far out on the meadow you can go
export const A0 = 1.35;                               // where base camp sits around the mountain
export const PEAK = 114, RAD = 142, EXP = 1.42;                    // height and foot radius of the mountain
export const SUMMIT_Y = 106;
export const GORGE = A0 - 0.52;                       // a stream cuts down this side into the lake
export const CHUTE = A0 + Math.PI + 0.25;             // a smooth snow gully on the far side: the downhill run

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
export const wrap = d => Math.atan2(Math.sin(d), Math.cos(d));
function hash(i, j) { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return mix(mix(hash(xi, zi), hash(xi + 1, zi), u), mix(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
}
export function fbm(x, z, oct = 4) { let a = 0.5, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + i * 17.3, z * f + i * 9.1); n += a; a *= 0.5; f *= 2.03; } return s / n; }
function ridged(x, z, oct = 4) { let a = 0.5, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(vnoise(x * f + i * 5.7, z * f + i * 3.3) * 2 - 1); s += a * v * v; n += a; a *= 0.5; f *= 2.1; } return s / n; }

export const wobble = a => 1 + 0.08 * Math.sin(3 * a + 0.5) + 0.045 * Math.sin(5 * a + 2.1) + 0.02 * Math.sin(9 * a + 4.0);
export const footR = a => RAD * wobble(a);
export function polar(a, r) { return { x: Math.cos(a) * r, z: Math.sin(a) * r }; }
export const tOf = (x, z) => Math.hypot(x, z) / footR(Math.atan2(z, x));    // 0 at the summit, 1 at the foot
const cone = t => PEAK * Math.pow(Math.max(0, 1 - t), EXP);

/* ---------- The lake and the stream that feeds it ---------- */
const GR = footR(GORGE);
export const LAKE = { ...polar(GORGE, 186), r: 31, level: -1.5 };
const G_TOP = 0.24;                                    // the spring, as a fraction of the way down
export function streamBed(r) {
  const t = r / GR;
  if (t <= 1) { const b = cone(Math.max(t, G_TOP)); return Math.floor(b / 7) * 7 * 0.62 + b * 0.38 - 3.2; }   // falls and pools
  return mix(-3.2, LAKE.level - 0.5, smooth(GR, 160, r));
}
export const STREAM = { r0: GR * G_TOP, r1: 160 };
export const KICKERS = [0.44, 0.63, 0.82];              // how far down the run each jump sits
const chuteW = (a, r, t) => (1 - smooth(8, 19, Math.abs(wrap(a - CHUTE)) * r)) * smooth(0.1, 0.2, t) * (1 - smooth(1.02, 1.2, t));

function natural(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x), t = r / footR(a);
  let h = cone(Math.min(t, 1));
  const mid = smooth(0.03, 0.3, t) * (1 - smooth(0.82, 1.1, t)), cw = chuteW(a, r, t), rough = 1 - cw * 0.92;
  if (mid > 0) {
    const warp = (vnoise(x / 60 + 3, z / 60 + 7) - 0.5) * 1.7;
    const but = 1 - Math.abs(Math.sin(a * 3.5 + warp + t * 2.3));                 // buttresses and gullies
    h += (Math.pow(but, 1.5) - 0.42) * 14 * mid * rough;
    h += (ridged(x / 48 + 11, z / 48 + 5) - 0.42) * 17 * mid * rough;
    h += (fbm(x / 13, z / 13, 3) - 0.5) * 3.4 * mid * rough;
    h += (ridged(x / 8.5 + 3, z / 8.5 + 1, 2) - 0.45) * 2.4 * mid * rough * smooth(0.3, 0.6, vnoise(x / 25 + 7, z / 25));
    // Natural cliff bands: the slope steps in places
    const band = smooth(0.52, 0.7, vnoise(x / 34 + 20, z / 34 + 2)) * mid * rough, step = 11;
    const q = h / step, fr = q - Math.floor(q); h = mix(h, (Math.floor(q) + smooth(0.25, 0.75, fr)) * step, band * 0.75);
    h -= cw * 2.6 * mid;
  }
  if (cw > 0) for (const k of KICKERS) { const d = r - k * footR(a); if (d > -11 && d < 1.6) h += cw * (d < 0 ? 2.5 * Math.pow(1 + d / 11, 1.6) : 2.5 * (1 - d / 1.6)); }
  h += (vnoise(x / 5.2, z / 5.2) - 0.5) * 0.55 * (1 - cw * 0.8);
  if (t > 1) {
    const far = smooth(1.0, 1.22, t);
    h += far * (1.5 * Math.sin(x * 0.031 + 1.2) * Math.sin(z * 0.036) + 0.8 * Math.sin(x * 0.07) * Math.cos(z * 0.063) + 2.4);
    const ring = Math.pow(smooth(228, 430, r), 1.25);
    if (ring > 0) h += ring * (58 + 26 * Math.sin(a * 5 + 1) + 12 * Math.sin(a * 11)) * (0.65 + 0.7 * ridged(x / 130 + 2, z / 130 + 9, 3));
  }
  // Gorge and meadow stream
  const s = Math.abs(wrap(a - GORGE)) * r;
  if (s < 9 && r > GR * G_TOP - 6 && r < 164) {
    const w = (1 - smooth(1.8, t > 1 ? 4.5 : 7.5, s)) * smooth(GR * G_TOP - 6, GR * G_TOP + 2, r) * (1 - smooth(150, 163, r));
    const bed = streamBed(r) + (vnoise(x / 3, z / 3) - 0.5) * 0.4; if (h > bed) h = mix(h, bed, w);
  }
  // Lake basin
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r + 14) { const w = 1 - smooth(LAKE.r * 0.35, LAKE.r + 12, dl), floor = LAKE.level - 4.2 * (1 - smooth(0, LAKE.r, dl)) - 0.2; h = mix(h, Math.min(h, floor), w * w * (3 - 2 * w)); if (dl < LAKE.r) h = Math.min(h, mix(LAKE.level - 3.6, LAKE.level + 0.25, Math.pow(dl / LAKE.r, 2.4))); }
  return h;
}

// The giants on the horizon: only ever seen, never walked on
export function farHeight(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x), g = Math.pow(smooth(520, 2100, r), 1.3);
  return natural(x, z) + g * (240 + 420 * ridged(x / 620 + 4, z / 620 + 1, 4) + 150 * Math.sin(a * 3 + 2)) * (0.5 + 0.9 * ridged(x / 240 + 9, z / 240 + 3, 3));
}

/* ---------- The trail: one long ramp that winds up and round to the summit ---------- */
export const TRAIL = [];   // { x, z, y, s } roughly every metre; s is distance from base camp
export const CAMPS = [];   // { id, x, z, y, s, out: {x, z}, side: {x, z} }
{
  const pts = [];
  // Across the meadow from base camp to the foot of the mountain
  const b0 = polar(A0, 166), a1 = A0 + 0.34, f0 = polar(a1, footR(a1) * 0.985);
  for (let i = 0; i <= 40; i++) { const u = i / 40, e = u * u * (3 - 2 * u); pts.push({ x: mix(b0.x, f0.x, u) + Math.sin(u * Math.PI) * 5, z: mix(b0.z, f0.z, u), y: mix(0.6, cone(0.985), e) }); }
  // Up the mountain: the gradient stiffens as the air thins
  let a = a1, y = cone(0.985); const yEnd = SUMMIT_Y - 4.5;
  while (y < yEnd) {
    const v = y / PEAK, t = 1 - Math.pow(v, 1 / EXP), r = Math.max(9, t * footR(a)), g = 0.135 + 0.2 * v * v, da = 0.9 / r;
    a += da; y += g * r * da; const p = polar(a, t * footR(a)); pts.push({ x: p.x, z: p.z, y });
  }
  // The last pull onto the summit
  const last = pts[pts.length - 1], aEnd = a, rEnd = Math.hypot(last.x, last.z);
  for (let i = 1; i <= 34; i++) { const u = i / 34, p = polar(aEnd + u * 1.7, mix(rEnd, 4.5, u * u * (3 - 2 * u))); pts.push({ x: p.x, z: p.z, y: mix(last.y, SUMMIT_Y, Math.min(1, u * 1.5)) }); }
  let s = 0; pts.forEach((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); TRAIL.push({ x: p.x, z: p.z, y: p.y, s }); });
}
export const inGorge = (x, z, margin = 0) => { const r = Math.hypot(x, z); return r > GR * G_TOP - 4 && r < 162 && Math.abs(wrap(Math.atan2(z, x) - GORGE)) * r < 7 + margin; };
/* ---------- Bridges over the gorge, wherever the trail crosses it. The trail runs dead straight across each one ---------- */
export const BRIDGES = [];
{
  let run = null;
  for (let i = 0; i < TRAIL.length; i++) {
    const t = TRAIL[i], inside = inGorge(t.x, t.z, 1.5);
    if (inside && !run) run = { i0: i }; else if (!inside && run) {
      const ia = Math.max(0, run.i0 - 2), ib = Math.min(TRAIL.length - 1, i + 1), A = { ...TRAIL[ia] }, B = { ...TRAIL[ib] }, l = Math.hypot(B.x - A.x, B.z - A.z);
      for (let k = ia + 1; k < ib; k++) { const u = (k - ia) / (ib - ia); TRAIL[k].x = mix(A.x, B.x, u); TRAIL[k].z = mix(A.z, B.z, u); TRAIL[k].y = mix(A.y, B.y, u); }
      BRIDGES.push({ x: (A.x + B.x) / 2, z: (A.z + B.z) / 2, ux: (B.x - A.x) / l, uz: (B.z - A.z) / l, y: (A.y + B.y) / 2 + 0.1, y0: A.y, y1: B.y, half: l / 2, w: 3.6, kind: 'rope', yaw: Math.atan2(B.x - A.x, B.z - A.z) });
      run = null;
    }
  }
  let s = 0; TRAIL.forEach((p, i) => { if (i) s += Math.hypot(p.x - TRAIL[i - 1].x, p.z - TRAIL[i - 1].z); p.s = s; });
}
export const TRAIL_LEN = TRAIL[TRAIL.length - 1].s;
export function trailAt(s) {
  let lo = 0, hi = TRAIL.length - 1; s = Math.min(TRAIL_LEN, Math.max(0, s));
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TRAIL[m].s > s) hi = m; else lo = m; }
  const A = TRAIL[lo], B = TRAIL[hi], u = (s - A.s) / Math.max(1e-6, B.s - A.s), l = Math.hypot(B.x - A.x, B.z - A.z) || 1;
  return { x: mix(A.x, B.x, u), z: mix(A.z, B.z, u), y: mix(A.y, B.y, u), dx: (B.x - A.x) / l, dz: (B.z - A.z) / l };
}
export const CAMP_R = { base: 17, teaching: 9, experience: 9, projects: 9.5, research: 9, contact: 7.5 };
{
  const first = TRAIL[40].s, span = TRAIL_LEN - first;
  const at = [['base', 0], ['teaching', first + span * 0.2], ['experience', first + span * 0.41], ['projects', first + span * 0.61], ['research', first + span * 0.762], ['contact', TRAIL_LEN]];
  for (const [id, s] of at) {
    const p = trailAt(s), l = Math.hypot(p.x, p.z) || 1; let out = { x: p.x / l, z: p.z / l };
    if (id === 'base') out = { x: Math.cos(A0), z: Math.sin(A0) };
    if (id === 'contact') out = { x: Math.cos(A0 + 0.4), z: Math.sin(A0 + 0.4) };
    const off = id === 'base' || id === 'contact' ? 0 : CAMP_R[id] - 2.6;     // camps sit on a shoulder just below the trail
    CAMPS.push({ id, x: p.x + out.x * off, z: p.z + out.z * off, y: id === 'contact' ? SUMMIT_Y : p.y, s, out, side: { x: -out.z, z: out.x } });
  }
}
export const camp = id => CAMPS.find(c => c.id === id);

/* ---------- Marked climbing routes: a crag behind each camp, with a ledge on top ---------- */
export const ROUTES = [
  { camp: 'teaching', name: 'Pumping Lemma', grade: '5.7' },
  { camp: 'experience', name: 'Forty Percent More', grade: '5.8' },
  { camp: 'projects', name: '22 Checks', grade: '5.9' },
  { camp: 'research', name: '2.49M Panoramas', grade: '5.10' }
].map(r => {
  const c = camp(r.camp), R = CAMP_R[r.camp], v = -3.5;
  const at = u => ({ x: c.x + c.out.x * u + c.side.x * v, z: c.z + c.out.z * u + c.side.z * v });
  return { ...r, foot: { ...at(-R - 3.2), y: c.y }, top: { ...at(-R - 10.5), y: c.y + 13 }, half: 3.2, dir: { x: -c.out.x, z: -c.out.z } };
});
export function onRoute(x, z) {
  for (const R of ROUTES) {
    const dx = x - R.foot.x, dz = z - R.foot.z, along = dx * R.dir.x + dz * R.dir.z, across = -dx * R.dir.z + dz * R.dir.x;
    if (along > -1.5 && along < 9 && Math.abs(across) < R.half) return R;
  }
  return null;
}

/* ---------- Height grid: the single source of truth ---------- */
export const H = new Float32Array((N + 1) * (N + 1));
const idx = (ix, iz) => ix * (N + 1) + iz;
for (let ix = 0; ix <= N; ix++) for (let iz = 0; iz <= N; iz++) H[idx(ix, iz)] = natural(-HALF + ix * CELL, -HALF + iz * CELL);
function stamp(x, z, y, flat, soft, only) {
  const x0 = Math.max(0, Math.floor((x - soft + HALF) / CELL)), x1 = Math.min(N, Math.ceil((x + soft + HALF) / CELL));
  const z0 = Math.max(0, Math.floor((z - soft + HALF) / CELL)), z1 = Math.min(N, Math.ceil((z + soft + HALF) / CELL));
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
    const d = Math.hypot(-HALF + ix * CELL - x, -HALF + iz * CELL - z), w = 1 - smooth(flat, soft, d);
    if (w > 0) { const k = idx(ix, iz); if (only === 'raise' && H[k] > y) continue; H[k] = mix(H[k], y, w); }
  }
}
// Stamp order matters: repeated blending toward the same height converges on it
for (const c of CAMPS) stamp(c.x, c.z, c.y, CAMP_R[c.id], CAMP_R[c.id] + (c.id === 'base' ? 16 : 8));
for (const R of ROUTES) { stamp(R.top.x, R.top.z, R.top.y, 3.4, 9, 'raise'); stamp(R.top.x - R.dir.x * 3.5, R.top.z - R.dir.z * 3.5, R.top.y - 0.6, 2.2, 3.4); }
// The trail bed: every cell near the trail takes the height of the nearest point on it, eased out over a few metres
const TD = new Float32Array((N + 1) * (N + 1)).fill(99), TY = new Float32Array((N + 1) * (N + 1));
for (const t of TRAIL) {
  const cx = Math.round((t.x + HALF) / CELL), cz = Math.round((t.z + HALF) / CELL), R = 8;
  for (let ix = Math.max(0, cx - R); ix <= Math.min(N, cx + R); ix++) for (let iz = Math.max(0, cz - R); iz <= Math.min(N, cz + R); iz++) { const d = Math.hypot(-HALF + ix * CELL - t.x, -HALF + iz * CELL - t.z), k = idx(ix, iz); if (d < TD[k]) { TD[k] = d; TY[k] = t.y; } }
}
for (let ix = 0; ix <= N; ix++) for (let iz = 0; iz <= N; iz++) {
  const k = idx(ix, iz); if (TD[k] > 8) continue; const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
  const bed = mix(H[k], TY[k], 1 - smooth(2.6, 7.8, TD[k]));
  if (inGorge(x, z, 1.5)) { if (bed < H[k]) H[k] = bed; continue; }      // the gorge stays open under the bridge: cut the banks back, but never fill it
  H[k] = bed;
}
for (const c of CAMPS) stamp(c.x, c.z, c.y, CAMP_R[c.id] - 1, CAMP_R[c.id] + 2);
for (const R of ROUTES) stamp(R.top.x, R.top.z, R.top.y, 2.6, 4.2);

export function sample(x, z) {
  const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
  const ix = Math.min(N - 1, Math.max(0, Math.floor(fx))), iz = Math.min(N - 1, Math.max(0, Math.floor(fz)));
  const u = Math.min(1, Math.max(0, fx - ix)), v = Math.min(1, Math.max(0, fz - iz));
  const h00 = H[idx(ix, iz)], h10 = H[idx(ix + 1, iz)], h01 = H[idx(ix, iz + 1)], h11 = H[idx(ix + 1, iz + 1)];
  return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
}
const GRAD = { gx: 0, gz: 0 };
export function gradient(x, z, e = 1.2, out = GRAD) {
  out.gx = (sample(x + e, z) - sample(x - e, z)) / (2 * e); out.gz = (sample(x, z + e) - sample(x, z - e)) / (2 * e); return out;
}
export function normalAt(x, z, out) { const g = gradient(x, z, 1.4), l = Math.hypot(g.gx, 1, g.gz); out.x = -g.gx / l; out.y = 1 / l; out.z = -g.gz / l; return out; }

// Bring the ground up to meet each end of the deck
for (const b of BRIDGES) for (const e of [-1, 1]) stamp(b.x + b.ux * e * (b.half + 1.2), b.z + b.uz * e * (b.half + 1.2), e < 0 ? b.y0 : b.y1, 2.6, 5.5);
// The water surface, where there is any
export function waterAt(x, z) { return Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 1 ? LAKE.level : -1e9; }
// Ground you can stand on at (x, z) given your current height: terrain, or a bridge deck if you are on or above it
const FLOOR = { h: 0, deck: false, water: false };
export function floorAt(x, z, y, out = FLOOR) {
  let h = sample(x, z); out.deck = false; out.water = false;
  for (const b of BRIDGES) {
    const dx = x - b.x, dz = z - b.z, along = dx * b.ux + dz * b.uz, across = -dx * b.uz + dz * b.ux;
    if (Math.abs(along) <= b.half + 1.4 && Math.abs(across) <= b.w / 2) { const by = mix(b.y0, b.y1, (along + b.half) / (2 * b.half)) + 0.1; if (y >= by - 1.1 && by > h) { h = by; out.deck = true; } }
  }
  const w = waterAt(x, z); if (w - 1.05 > h) { h = w - 1.05; out.water = true; }       // deep water: you float
  out.h = h; return out;
}

export function nearestTrail(x, z) { let best = 1e9, at = TRAIL[0]; for (const t of TRAIL) { const d = (t.x - x) * (t.x - x) + (t.z - z) * (t.z - z); if (d < best) { best = d; at = t; } } return at; }
// Distance to the trail, read from the baked grid so that scattering thousands of plants stays quick
export function trailDist(x, z) { const ix = Math.round((x + HALF) / CELL), iz = Math.round((z + HALF) / CELL); return ix < 0 || iz < 0 || ix > N || iz > N ? 99 : TD[idx(ix, iz)]; }
export const inChute = (x, z) => { const r = Math.hypot(x, z), a = Math.atan2(z, x); return chuteW(a, r, r / footR(a)); };
// How snowy the ground is here, 0 to 1: the shader, the footsteps and the plants all agree on this
export function snowAt(x, z, y) {
  const n = fbm(x / 21 + 4, z / 21 + 8, 3);
  return Math.max(smooth(56, 70, y + (n - 0.5) * 18), smooth(0.12, 0.55, inChute(x, z) + (n - 0.5) * 0.3));   // the glacier's tongue reaches the valley floor
}

// True where nothing is built: for scattering trees, rocks and grass
export function clear(x, z, margin = 0) {
  if (trailDist(x, z) < 3.6 + margin) return false;
  if (inGorge(x, z, margin)) return false;
  if (inChute(x, z) > 0.04) return false;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 2 + margin) return false;
  for (const c of CAMPS) if (Math.hypot(x - c.x, z - c.z) < CAMP_R[c.id] + 1.5 + margin) return false;
  for (const R of ROUTES) if (Math.hypot(x - R.top.x, z - R.top.z) < 4 + margin) return false;
  return true;
}
export function trailDistS(x, z) {
  const fx = Math.min(N - 0.001, Math.max(0, (x + HALF) / CELL)), fz = Math.min(N - 0.001, Math.max(0, (z + HALF) / CELL)), ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
  return (TD[idx(ix, iz)] * (1 - u) + TD[idx(ix + 1, iz)] * u) * (1 - v) + (TD[idx(ix, iz + 1)] * (1 - u) + TD[idx(ix + 1, iz + 1)] * u) * v;
}
