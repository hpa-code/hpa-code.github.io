// The shape of the mountain: pure maths, shared by the renderer, the climber, the physics and the map.
// Everything is generated. This is not a model of any real peak.

export const SIZE = 400, N = 200, CELL = SIZE / N;   // 2 m grid
export const BOUND = 126;                             // how far out on the meadow you can walk
export const A0 = 1.35;                               // where base camp sits around the mountain

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function hash(i, j) { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return mix(mix(hash(xi, zi), hash(xi + 1, zi), u), mix(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
}

/* ---------- Profile: five rock bands with benches between them ---------- */
// [outer radius, inner radius, height at outer, height at inner]
const RINGS = [
  [80, 74, 0, 13], [74, 64, 13, 13.6], [64, 58, 13.6, 27], [58, 49, 27, 27.6], [49, 43, 27.6, 41],
  [43, 35, 41, 41.6], [35, 29, 41.6, 55], [29, 20, 55, 55.5], [20, 8, 55.5, 70], [8, 0, 70, 70.4]
];
export const BANDS = [[80, 74], [64, 58], [49, 43], [35, 29], [20, 8]];   // the climbable faces, outer to inner
export function profile(rr) {
  if (rr >= 80) return 0;
  for (const [o, i, ho, hi] of RINGS) if (rr >= i) { const t = (o - rr) / (o - i); return mix(ho, hi, t * 0.55 + smooth(0, 1, t) * 0.45); }
  return 70.4;
}
export const wobble = a => 1 + 0.07 * Math.sin(3 * a + 0.5) + 0.04 * Math.sin(5 * a + 2.1) + 0.02 * Math.sin(9 * a + 4.0);
export function polar(a, rr) { const r = rr * wobble(a); return { x: Math.cos(a) * r, z: Math.sin(a) * r }; }
export const nominal = (x, z) => Math.hypot(x, z) / wobble(Math.atan2(z, x));

/* ---------- The gorge: a stream cuts down through the lower bands ---------- */
export const GORGE = A0 + 2.56;
const wrap = d => Math.atan2(Math.sin(d), Math.cos(d));
const BED = [[40, 41], [44, 38.5], [50, 21.5], [58, 20], [65, 7.5], [74, 6], [82, -1.3], [130, -0.6], [400, -0.6]];
export function streamBed(rr) {
  // Waterfalls down each band, pools cut into each bench
  if (rr <= BED[0][0]) return BED[0][1];
  for (let i = 1; i < BED.length; i++) if (rr <= BED[i][0]) return mix(BED[i - 1][1], BED[i][1], (rr - BED[i - 1][0]) / (BED[i][0] - BED[i - 1][0]));
  return -0.6;
}

function natural(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x), rr = r / wobble(a);
  const rough = (vnoise(x / 7 + 40, z / 7 + 40) - 0.5) * 3.4 + (vnoise(x / 2.9 + 9, z / 2.9 + 3) - 0.5) * 1.3;
  let h = profile(rr + rough * (rr < 86 ? 1 : 0)) + (vnoise(x / 5, z / 5) - 0.5) * 0.7;
  if (rr > 80) {
    const far = smooth(82, 104, rr);
    h += far * (0.9 * Math.sin(x * 0.045 + 1.2) * Math.sin(z * 0.052) + 0.5 * Math.sin(x * 0.11) * Math.cos(z * 0.09) + 0.4);
    h += Math.pow(smooth(134, 196, r), 1.3) * (26 + 9 * Math.sin(a * 6 + 1) + 5 * Math.sin(a * 13));
  }
  // Gorge
  const s = Math.abs(wrap(a - GORGE)) * r, w = (1 - smooth(2.0, 6.5, s)) * smooth(40, 45, rr) * (1 - smooth(128, 140, rr));
  if (w > 0) { const bed = streamBed(rr) + (vnoise(x / 3, z / 3) - 0.5) * 0.5; if (h > bed) h = mix(h, bed, w); }
  return h;
}

/* ---------- The trail: ramps cut across each band, flat along each bench ---------- */
export const LEVEL = [0, 13.3, 27.3, 41.3, 55.25, 70.3];
const NODES = [
  { a: 0.00, rr: 99,   l: 0, camp: 'base' },
  { a: 0.11, rr: 81.5, l: 0 },
  { a: 0.61, rr: 72.5, l: 1 },
  { a: 0.95, rr: 69,   l: 1, camp: 'teaching' },
  { a: 1.30, rr: 65.5, l: 1 },
  { a: 1.97, rr: 56.5, l: 2 },
  { a: 2.25, rr: 53.5, l: 2, camp: 'experience' },
  { a: 2.84, rr: 50.5, l: 2 },
  { a: 3.73, rr: 41.5, l: 3 },
  { a: 4.21, rr: 39,   l: 3, camp: 'projects' },
  { a: 4.71, rr: 36.5, l: 3 },
  { a: 5.98, rr: 27.5, l: 4 },
  { a: 6.58, rr: 24.5, l: 4, camp: 'research' },
  { a: 7.08, rr: 21.5, l: 4 },
  { a: 9.20, rr: 6.5,  l: 5 },
  { a: 9.40, rr: 2.5,  l: 5, camp: 'contact' }
];
export const TRAIL = [];   // { x, z, y, s } every metre or so; s is distance from base camp
export const CAMPS = [];   // { id, x, z, y, a, s, out: {x, z} }
{
  let s = 0, prev = null;
  for (let i = 0; i < NODES.length - 1; i++) {
    const A = NODES[i], B = NODES[i + 1], pa = polar(A0 + A.a, A.rr), pb = polar(A0 + B.a, B.rr);
    const steps = Math.max(2, Math.ceil(Math.hypot(pb.x - pa.x, pb.z - pa.z) * 1.15));
    for (let j = 0; j < steps + (i === NODES.length - 2 ? 1 : 0); j++) {
      const t = j / steps, p = polar(A0 + mix(A.a, B.a, t), mix(A.rr, B.rr, t)), y = mix(LEVEL[A.l], LEVEL[B.l], t);
      if (prev) s += Math.hypot(p.x - prev.x, p.z - prev.z);
      TRAIL.push({ x: p.x, z: p.z, y, s }); prev = p;
      if (j === 0 && A.camp) CAMPS.push({ id: A.camp, a: A0 + A.a, rr: A.rr, level: A.l });
    }
  }
  const last = NODES[NODES.length - 1]; CAMPS.push({ id: last.camp, a: A0 + last.a, rr: last.rr, level: last.l });
  for (const c of CAMPS) {
    const p = polar(c.a, c.rr), l = Math.hypot(p.x, p.z) || 1;
    c.x = p.x; c.z = p.z; c.y = LEVEL[c.level]; c.out = { x: p.x / l, z: p.z / l };
    let best = 1e9; for (const t of TRAIL) { const d = Math.hypot(t.x - c.x, t.z - c.z); if (d < best) { best = d; c.s = t.s; } }
  }
  CAMPS[5].out = { x: Math.cos(A0 + 9.4), z: Math.sin(A0 + 9.4) };
}
export const TRAIL_LEN = TRAIL[TRAIL.length - 1].s;
export const camp = id => CAMPS.find(c => c.id === id);
export const CAMP_R = { base: 15, teaching: 6.5, experience: 6.5, projects: 6.5, research: 6, contact: 5 };

/* ---------- Marked climbing routes: a line of holds up each band ---------- */
// Holds make these lines quicker and easier on the arms than bare rock.
export const ROUTES = [
  { band: 0, a: A0 + 0.95 + 0.13, name: 'Pumping Lemma', grade: '5.7' },
  { band: 1, a: A0 + 2.25 - 0.17, name: 'Forty Percent More', grade: '5.8' },
  { band: 2, a: A0 + 4.21 + 0.19, name: '22 Checks', grade: '5.9' },
  { band: 3, a: A0 + 6.58 - 0.24, name: '2.49M Panoramas', grade: '5.10' },
  { band: 4, a: A0 + 6.72, name: 'May 2027', grade: '5.11' }
].map(r => {
  const [o, i] = BANDS[r.band], foot = polar(r.a, o + 2.2), top = polar(r.a, i - 1.6);
  return { ...r, foot, top, half: 2.6, o, i };
});
export function onRoute(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x), rr = r / wobble(a);
  for (const R of ROUTES) if (rr < R.o + 3 && rr > R.i - 2 && Math.abs(wrap(a - R.a)) * r < R.half) return R;
  return null;
}

/* ---------- Height grid: the single source of truth ---------- */
export const H = new Float32Array((N + 1) * (N + 1));
const idx = (ix, iz) => ix * (N + 1) + iz;
for (let ix = 0; ix <= N; ix++) for (let iz = 0; iz <= N; iz++) H[idx(ix, iz)] = natural(-SIZE / 2 + ix * CELL, -SIZE / 2 + iz * CELL);
function stamp(x, z, y, flat, soft) {
  const x0 = Math.max(0, Math.floor((x - soft + SIZE / 2) / CELL)), x1 = Math.min(N, Math.ceil((x + soft + SIZE / 2) / CELL));
  const z0 = Math.max(0, Math.floor((z - soft + SIZE / 2) / CELL)), z1 = Math.min(N, Math.ceil((z + soft + SIZE / 2) / CELL));
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
    const d = Math.hypot(-SIZE / 2 + ix * CELL - x, -SIZE / 2 + iz * CELL - z), w = 1 - smooth(flat, soft, d);
    if (w > 0) { const k = idx(ix, iz); H[k] = mix(H[k], y, Math.max(w, 0)); }
  }
}
// Stamp order matters: repeated blending toward the same height converges on it
for (const c of CAMPS) stamp(c.x, c.z, c.y, CAMP_R[c.id], CAMP_R[c.id] + (c.id === 'base' ? 12 : 3.5));
for (let pass = 0; pass < 2; pass++) for (const t of TRAIL) {
  // Leave the gorge open where the trail crosses it: a bridge goes there instead
  const a = Math.atan2(t.z, t.x), sdist = Math.abs(wrap(a - GORGE)) * Math.hypot(t.x, t.z);
  if (sdist < 7.5 && nominal(t.x, t.z) > 44) continue;
  stamp(t.x, t.z, t.y, 2.3, 4.6);
}

export function sample(x, z) {
  const fx = (x + SIZE / 2) / CELL, fz = (z + SIZE / 2) / CELL;
  const ix = Math.min(N - 1, Math.max(0, Math.floor(fx))), iz = Math.min(N - 1, Math.max(0, Math.floor(fz)));
  const u = Math.min(1, Math.max(0, fx - ix)), v = Math.min(1, Math.max(0, fz - iz));
  const h00 = H[idx(ix, iz)], h10 = H[idx(ix + 1, iz)], h01 = H[idx(ix, iz + 1)], h11 = H[idx(ix + 1, iz + 1)];
  // Same diagonal as the rendered triangles, so feet sit exactly on the mesh
  return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}
export function gradient(x, z, e = 1.1) {
  return { gx: (sample(x + e, z) - sample(x - e, z)) / (2 * e), gz: (sample(x, z + e) - sample(x, z - e)) / (2 * e) };
}

/* ---------- Bridges over the gorge ---------- */
export const BRIDGES = [];
{
  // Where the trail crosses, on the second bench
  let hit = null;
  for (let i = 1; i < TRAIL.length; i++) {
    const a = TRAIL[i - 1], b = TRAIL[i], da = wrap(Math.atan2(a.z, a.x) - GORGE), db = wrap(Math.atan2(b.z, b.x) - GORGE);
    if (da * db <= 0 && Math.abs(da) < 0.5 && nominal(a.x, a.z) > 44) { hit = { a, b }; break; }
  }
  const add = (x, z, ux, uz, y, half, w, kind) => BRIDGES.push({ x, z, ux, uz, y, half, w, kind, yaw: Math.atan2(ux, uz) });
  if (hit) {
    const { a, b } = hit, l = Math.hypot(b.x - a.x, b.z - a.z);
    add((a.x + b.x) / 2, (a.z + b.z) / 2, (b.x - a.x) / l, (b.z - a.z) / l, LEVEL[2] + 0.12, 8.2, 2.6, 'rope');
  }
  // A fallen log on the first bench
  const p = polar(GORGE, 69), t = { x: -Math.sin(GORGE), z: Math.cos(GORGE) };
  add(p.x, p.z, t.x, t.z, LEVEL[1] + 0.25, 8.0, 1.5, 'log');
}

// Ground you can stand on at (x, z) given your current height: terrain, or a bridge deck if you are on or above it
export function floorAt(x, z, y) {
  let h = sample(x, z), deck = false;
  for (const b of BRIDGES) {
    const dx = x - b.x, dz = z - b.z, along = dx * b.ux + dz * b.uz, across = -dx * b.uz + dz * b.ux;
    if (Math.abs(along) <= b.half + 0.4 && Math.abs(across) <= b.w / 2 && y >= b.y - 0.9 && b.y > h) { h = b.y; deck = true; }
  }
  return { h, deck };
}

export function trailDist(x, z) { let best = 1e9; for (const t of TRAIL) { const d = Math.hypot(t.x - x, t.z - z); if (d < best) best = d; } return best; }
export function nearestTrail(x, z) { let best = 1e9, at = TRAIL[0]; for (const t of TRAIL) { const d = Math.hypot(t.x - x, t.z - z); if (d < best) { best = d; at = t; } } return at; }
export function inGorge(x, z, margin = 0) { const r = Math.hypot(x, z), rr = nominal(x, z); return rr > 40 && Math.abs(wrap(Math.atan2(z, x) - GORGE)) * r < 7 + margin; }

// True where nothing is built: for scattering trees, rocks and grass
export function clear(x, z, margin = 0) {
  if (trailDist(x, z) < 3.4 + margin) return false;
  if (inGorge(x, z, margin)) return false;
  for (const c of CAMPS) if (Math.hypot(x - c.x, z - c.z) < CAMP_R[c.id] + 1.5 + margin) return false;
  for (const R of ROUTES) if (Math.hypot(x - R.foot.x, z - R.foot.z) < 4 + margin || Math.hypot(x - R.top.x, z - R.top.z) < 3 + margin) return false;
  return true;
}
