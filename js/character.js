// The climber you control: a jointed figure in a down jacket with a pack, posed every frame by two-bone IK.
// Hands and feet are given targets for whatever you are doing, and the limbs solve themselves to reach them.
import * as THREE from 'three';
import { COL, G, mesh, vmat } from './kit.js';
import { gradient, sample, floorAt } from './terrain.js';

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const angDamp = (a, b, rate, dt) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * (1 - Math.exp(-rate * dt));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const HIP = 0.9, THIGH = 0.43, SHIN = 0.43, UARM = 0.28, FARM = 0.27, SHO_Y = 0.5, SHO_X = 0.21;
const JACKET = [0xb8320f, 0xf05a22], PANTS = [0x20242c, 0x343a46], PACK = [0xc98a00, 0xf7b824];

export function createClimber(scene) {
  const root = new THREE.Group(), tilt = new THREE.Group(), hips = new THREE.Group(), chest = new THREE.Group(), head = new THREE.Group();
  scene.add(root); root.add(tilt); tilt.add(hips); hips.add(chest); chest.add(head); hips.position.y = HIP; chest.position.y = 0.06; head.position.y = SHO_Y + 0.2;

  /* ---------- The body ---------- */
  hips.add(mesh([{ g: G.ball(0.165, 0, 0.0, 0, 1.02, 0.78, 0.8), c: PANTS }, { g: G.torus(0.16, 0.022, 0, 0.07, 0, Math.PI / 2, 0, 18), c: 0x15171b }]));
  const baffles = [0.07, 0.19, 0.31, 0.43].map(y => ({ g: G.torus(0.172 - Math.abs(y - 0.25) * 0.09, 0.012, 0, y, 0, Math.PI / 2, 0, 20).scale(1.08, 1, 0.8), c: 0x9c2a0c }));
  chest.add(mesh([{ g: G.lathe([[0, -0.03], [0.15, -0.02], [0.172, 0.1], [0.185, 0.3], [0.2, 0.44], [0.17, 0.54], [0.09, 0.6], [0, 0.61]], 20).scale(1.08, 1, 0.78), c: JACKET }, ...baffles,
    { g: G.torus(0.085, 0.036, 0, 0.6, 0.0, Math.PI / 2, 0, 16), c: 0x9c2a0c }, { g: G.box(0.012, 0.5, 0.01, 0, 0.3, 0.151), c: 0x2a2c33 },
    // the pack, with a bedroll on top and a coil of rope
    { g: G.cap(0.13, 0.26, 0, 0.3, -0.24, 0, 0, 0).scale(1.25, 1, 0.85), c: PACK }, { g: G.box(0.3, 0.1, 0.2, 0, 0.5, -0.24), c: 0xa87300 }, { g: G.cyl(0.07, 0.07, 0.4, 12, 0, 0.6, -0.24, 0, Math.PI / 2), c: [0x6e1822, 0xa32434] },
    { g: G.box(0.05, 0.36, 0.03, -0.11, 0.33, 0.13), c: 0x2a2c33 }, { g: G.box(0.05, 0.36, 0.03, 0.11, 0.33, 0.13), c: 0x2a2c33 }, { g: G.torus(0.075, 0.018, 0.19, 0.24, -0.26, 0, Math.PI / 2, 14).rotateY(0), c: 0x3fa7d6 }, { g: G.box(0.1, 0.14, 0.05, 0, 0.2, -0.36), c: 0xa87300 }]));
  head.add(mesh([{ g: G.ball(0.118, 0, 0, 0, 0.94, 1.04, 0.98, 18), c: [0xa9744d, COL.skin] }, { g: G.cyl(0.05, 0.055, 0.1, 10, 0, -0.13, -0.005), c: 0xa9744d },
    { g: new THREE.SphereGeometry(0.126, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52).translate(0, 0.012, -0.004), c: [0x6e1822, 0xa32434] }, { g: G.torus(0.122, 0.022, 0, 0.012, -0.004, Math.PI / 2, 0, 20), c: 0xf2a900 }, { g: G.ball(0.04, 0, 0.145, -0.01, 1, 1, 1, 8), c: 0xf6f1e4 },
    { g: G.ball(0.016, -0.043, 0.004, 0.106, 1, 1.25, 0.6, 8), c: 0x1a1a1e }, { g: G.ball(0.016, 0.043, 0.004, 0.106, 1, 1.25, 0.6, 8), c: 0x1a1a1e }, { g: G.ball(0.018, 0, -0.022, 0.118, 1, 1, 1, 6), c: 0x9c6844 },
    { g: G.box(0.036, 0.007, 0.01, -0.043, 0.034, 0.108, 0, 0, 0.12), c: 0x2a1c14 }, { g: G.box(0.036, 0.007, 0.01, 0.043, 0.034, 0.108, 0, 0, -0.12), c: 0x2a1c14 }, { g: G.torus(0.03, 0.006, 0, -0.044, 0.104, 0, Math.PI, 10, Math.PI), c: 0x5a2a20 },
    // goggles pushed up on the hat
    { g: G.torus(0.124, 0.014, 0, 0.065, -0.004, Math.PI / 2 - 0.25, 0, 20), c: 0x15171b }, { g: G.ball(0.034, -0.042, 0.092, 0.1, 1.15, 0.85, 0.5, 8), c: 0x2a3f5a }, { g: G.ball(0.034, 0.042, 0.092, 0.1, 1.15, 0.85, 0.5, 8), c: 0x2a3f5a }]));
  function limb(parent, x, y, L1, L2, r1, r2, c1, c2, end) {
    const up = new THREE.Group(), lo = new THREE.Group(), tip = new THREE.Group(); up.position.set(x, y, 0); lo.position.y = -L1; tip.position.y = -L2; parent.add(up); up.add(lo); lo.add(tip);
    up.add(mesh([{ g: G.cap(r1, L1 - r1 * 0.8, 0, -L1 / 2, 0), c: c1 }])); lo.add(mesh([{ g: G.cap(r2, L2 - r2 * 0.9, 0, -L2 / 2, 0), c: c2 }, { g: G.ball(r2 * 1.12, 0, 0, 0, 1, 1, 1, 10), c: c1 }])); tip.add(end);
    return { up, lo, tip, L1, L2, base: V(x, y, 0), at: V(0, 0, 0), want: V(0, 0, 0) };
  }
  const boot = () => mesh([{ g: G.cap(0.058, 0.13, 0, -0.012, 0.05, Math.PI / 2).scale(1.05, 0.85, 1), c: [0x3a2416, 0x7a4a26] }, { g: G.box(0.125, 0.035, 0.27, 0, -0.07, 0.05), c: 0x15171b }, { g: G.cyl(0.066, 0.07, 0.1, 10, 0, 0.05, -0.02), c: 0x5a3820 }, { g: G.torus(0.066, 0.012, 0, 0.1, -0.02, Math.PI / 2, 0, 12), c: 0xf2a900 }]);
  const glove = () => mesh([{ g: G.ball(0.052, 0, -0.03, 0, 0.95, 1.2, 0.8, 10), c: [0x15171b, 0x2e3440] }, { g: G.cyl(0.05, 0.047, 0.04, 10, 0, 0.012, 0), c: 0xf2a900 }]);
  const legL = limb(hips, -0.095, -0.02, THIGH, SHIN, 0.082, 0.064, PANTS, PANTS, boot()), legR = limb(hips, 0.095, -0.02, THIGH, SHIN, 0.082, 0.064, PANTS, PANTS, boot());
  const armL = limb(chest, -SHO_X, SHO_Y, UARM, FARM, 0.066, 0.055, JACKET, JACKET, glove()), armR = limb(chest, SHO_X, SHO_Y, UARM, FARM, 0.066, 0.055, JACKET, JACKET, glove());
  chest.add(mesh([{ g: G.ball(0.078, -SHO_X, SHO_Y, 0, 1, 1, 1, 10), c: JACKET[1] }, { g: G.ball(0.078, SHO_X, SHO_Y, 0, 1, 1, 1, 10), c: JACKET[1] }]));

  /* ---------- Two-bone IK ---------- */
  const d = V(), ax = V(), w = V(), ud = V(), yA = V(), zA = V(), mtx = new THREE.Matrix4(), tl = V(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function solve(L, target, pole) {
    d.copy(target).sub(L.up.position); const reach = L.L1 + L.L2 - 0.004, dist = clamp(d.length(), 0.06, reach); d.normalize();
    ax.crossVectors(d, pole); if (ax.lengthSq() < 1e-6) ax.set(1, 0, 0); ax.normalize(); w.crossVectors(ax, d);
    const a = Math.acos(clamp((L.L1 * L.L1 + dist * dist - L.L2 * L.L2) / (2 * L.L1 * dist), -1, 1)), bend = Math.PI - Math.acos(clamp((L.L1 * L.L1 + L.L2 * L.L2 - dist * dist) / (2 * L.L1 * L.L2), -1, 1));
    ud.copy(d).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)); yA.copy(ud).negate(); zA.crossVectors(ax, yA);
    mtx.makeBasis(ax, yA, zA); L.up.quaternion.setFromRotationMatrix(mtx); L.lo.rotation.x = -bend;
  }
  // Limb targets are given in the climber's own space (feet at the origin, facing +z) and converted to the space of the bone's parent
  function reach(L, parent, pole, dt, rate) {
    L.at.x = damp(L.at.x, L.want.x, rate, dt); L.at.y = damp(L.at.y, L.want.y, rate, dt); L.at.z = damp(L.at.z, L.want.z, rate, dt);
    tl.copy(L.at); root.localToWorld(tl); parent.worldToLocal(tl); solve(L, tl, pole);
  }
  const POLE_KNEE = V(0, 0.15, 1), POLE_EL = V(-0.6, -0.5, -1), POLE_ER = V(0.6, -0.5, -1), POLE_UP_L = V(-1, -0.3, -0.5), POLE_UP_R = V(1, -0.3, -0.5);

  const C = { root, yaw: 0, phase: 0, t: 0, lean: 0, roll: 0, squash: 0, wave: 0, hipY: HIP, hipZ: 0, torso: 0, twist: 0, headYaw: 0, headPitch: 0, y: null, mode: 'walk', handL: V(), handR: V(), stepL: 0, stepR: 0, idle: 0 };
  const gr = { gx: 0, gz: 0 }, FL = V(), FR = V(), HL = V(), HR = V();

  // p: the player; seat: null, or { obj, pose } when riding or flying; st: { wave }
  // Returns 'step' or 'grip' on the frames a foot or a hand lands, for sound
  C.update = (p, dt, st, seat) => {
    C.t += dt; let cue = null; const mode = seat ? seat.pose : p.mode, speed = p.speed, grounded = mode === 'walk';
    let rate = 16, hipY = HIP, hipZ = 0, torso = 0, twist = 0, lean = 0, roll = 0, headPitch = 0, poleL = POLE_EL, poleR = POLE_ER;
    const yawWant = p.yawWant ?? C.yaw;

    if (mode === 'walk') {
      const run = clamp((speed - 5.2) / 4, 0, 1), mv = clamp(speed / 1.2, 0, 1), swim = p.water ? 1 : 0;
      const stride = clamp(speed * 0.33, 0.25, 1.15), freq = speed / (2 * stride) * Math.PI * 2;
      const before = Math.sin(C.phase); C.phase += dt * (mv > 0.02 ? freq : 0); const after = Math.sin(C.phase); if (mv > 0.3 && before * after < 0) cue = 'step';
      if (mv < 0.02) C.phase = damp(C.phase, Math.round(C.phase / Math.PI) * Math.PI, 8, dt);
      const lift = (0.1 + run * 0.16) * mv, half = stride * 0.5 * mv;
      const foot = (ph, out, side) => { const s = Math.sin(ph), c = Math.cos(ph); out.set(side * (0.1 + swim * 0.05), Math.max(0, -c) * lift + (c < 0 ? run * 0.06 * mv : 0), s * half - run * 0.05); if (c < 0 && run > 0) out.z -= Math.max(0, -c) * 0.12 * run; };
      foot(C.phase, FL, -1); foot(C.phase + Math.PI, FR, 1);
      const sw = Math.sin(C.phase) * mv, bend = 0.18 + run * 0.34;
      HL.set(-0.27 - run * 0.02, HIP - 0.06 + bend * 0.5 + Math.max(0, sw) * run * 0.12, sw * (0.2 + run * 0.16) + bend * 0.3);
      HR.set(0.27 + run * 0.02, HIP - 0.06 + bend * 0.5 + Math.max(0, -sw) * run * 0.12, -sw * (0.2 + run * 0.16) + bend * 0.3);
      hipY = HIP - 0.035 * mv - run * 0.03 + Math.abs(Math.cos(C.phase)) * (0.035 + run * 0.045) * mv + Math.sin(C.t * 1.9) * 0.006; twist = Math.sin(C.phase) * (0.1 + run * 0.12) * mv;
      torso = 0.05 * mv + run * 0.2; lean = 0;
      if (swim) { hipY = HIP + Math.sin(C.t * 2.4) * 0.03; HL.set(-0.45 + Math.sin(C.t * 3) * 0.1, 1.12, 0.25 + Math.cos(C.t * 3) * 0.16); HR.set(0.45 - Math.sin(C.t * 3) * 0.1, 1.12, 0.25 - Math.cos(C.t * 3) * 0.16); FL.y += 0.1 + Math.sin(C.t * 5) * 0.1; FR.y += 0.1 - Math.sin(C.t * 5) * 0.1; torso = 0.25; }
      // Plant each foot on the ground actually under it, so slopes and steps look right
      if (!p.water) {
        const sy = Math.sin(C.yaw), cy = Math.cos(C.yaw), base = C.y ?? p.y, off = f => { const wx = p.x + f.x * cy + f.z * sy, wz = p.z - f.x * sy + f.z * cy; return clamp(floorAt(wx, wz, p.y + 0.5).h - base, -0.34, 0.34); };
        const oL = off(FL), oR = off(FR); C.stepL = damp(C.stepL, oL, 22, dt); C.stepR = damp(C.stepR, oR, 22, dt); FL.y += C.stepL; FR.y += C.stepR; hipY += Math.min(C.stepL, C.stepR, 0) * 0.9 + Math.max(Math.min(C.stepL, C.stepR), 0) * 0.5;
      }
      if (st.wave && mv < 0.05) { HR.set(0.36 + Math.sin(C.t * 9) * 0.1, 1.72, 0.1); poleR = POLE_UP_R; }
      C.idle = mv < 0.05 ? C.idle + dt : 0;
    } else if (mode === 'air') {
      const up = clamp(p.vy / 8, -1, 1);
      FL.set(-0.11, 0.22 + up * 0.08, 0.16); FR.set(0.12, 0.1 - up * 0.06, -0.18); HL.set(-0.46, 1.22 + up * 0.22, 0.12); HR.set(0.46, 1.26 + up * 0.22, 0.02); poleL = POLE_UP_L; poleR = POLE_UP_R; torso = 0.1 - up * 0.12; hipY = HIP + 0.02;
    } else if (mode === 'climb' || mode === 'slide') {
      // Hug the rock: lean with the face, reach hand over hand
      const g = gradient(p.x, p.z, 1.1, gr), l = Math.hypot(g.gx, g.gz) || 1, wall = Math.min(0.75, Math.atan(1 / l));
      if (mode === 'climb') {
        const mvc = clamp((Math.abs(p.up) + speed) / 1.6, 0, 1), before = Math.sin(C.phase); C.phase += dt * (5.2 + (p.route ? 1.6 : 0) + (p.leap > 0 ? 6 : 0)) * mvc; const s = Math.sin(C.phase); if (before * s < 0 && mvc > 0.2) cue = 'grip';
        HL.set(-0.25, 1.52 + s * 0.2, 0.36); HR.set(0.25, 1.52 - s * 0.2, 0.36); FL.set(-0.17, 0.24 - s * 0.17, 0.3); FR.set(0.17, 0.24 + s * 0.17, 0.3); poleL = POLE_UP_L; poleR = POLE_UP_R;
        lean = wall; hipY = HIP - 0.08 + Math.abs(s) * 0.04; hipZ = 0.12; torso = -0.08; headPitch = -0.35; rate = 20;
      } else { HL.set(-0.5, 0.95, -0.2); HR.set(0.5, 0.95, -0.2); FL.set(-0.14, 0.02, 0.4); FR.set(0.14, 0.02, 0.48); lean = -0.55; hipY = HIP - 0.3; torso = 0.2; }
    } else if (mode === 'glide') {
      const b = p.bank || 0, sw = Math.sin(C.t * 1.3) * 0.03;
      FL.set(-0.13, 0.42 + sw, 0.5); FR.set(0.13, 0.4 - sw, 0.52); HL.set(-0.4, 1.74 - Math.max(0, -b) * 0.42 - (p.gv < 9 ? 0.2 : 0), 0.06); HR.set(0.4, 1.74 - Math.max(0, b) * 0.42 - (p.gv < 9 ? 0.2 : 0), 0.06); poleL = POLE_UP_L; poleR = POLE_UP_R;
      hipY = HIP + 0.05; hipZ = -0.06; torso = -0.22; roll = -b * 0.38; lean = clamp(-p.vy * 0.02, -0.12, 0.18) + (p.gv - 12) * 0.012; headPitch = 0.1;
    } else if (mode === 'bike') {
      const a = seat.crank, stand = p.rideAir ? 1 : 0;
      FL.set(-0.115, 0.36 + Math.cos(a) * 0.165, 0.02 + Math.sin(a) * 0.165); FR.set(0.115, 0.36 - Math.cos(a) * 0.165, 0.02 - Math.sin(a) * 0.165);
      HL.set(-0.29, 1.04, 0.56); HR.set(0.29, 1.04, 0.56); hipY = 0.99 + stand * 0.12; hipZ = -0.3 + stand * 0.14; torso = 0.62 - stand * 0.1; headPitch = -0.4; rate = 40;
    } else if (mode === 'sled') {
      const stand = p.rideAir ? 1 : 0;
      FL.set(-0.3, 0.33, 0.22); FR.set(0.3, 0.33, 0.22); HL.set(-0.3, 1.02, 0.5); HR.set(0.3, 1.02, 0.5); hipY = 0.74 + stand * 0.2; hipZ = -0.32; torso = 0.42 - stand * 0.15; headPitch = -0.25; roll = -p.steer * 0.16; rate = 40;
    } else if (mode === 'sit') {
      const w = Math.sin(C.t * 1.7) * 0.03;
      FL.set(-0.15, 0.03, 0.6); FR.set(0.15, 0.03, 0.66); HL.set(-0.2, 0.6 + w, 0.52); HR.set(0.2, 0.62 - w, 0.54); hipY = 0.3; hipZ = -0.12; torso = 0.3; headPitch = -0.12; rate = 9;
    } else if (mode === 'zip') {
      HL.set(-0.14, 1.95, 0.02); HR.set(0.14, 1.95, 0.02); FL.set(-0.1, 0.12 + Math.sin(C.t * 3) * 0.04, 0.2); FR.set(0.12, 0.06, 0.05 - Math.sin(C.t * 3) * 0.06); poleL = POLE_UP_L; poleR = POLE_UP_R; hipY = HIP + 0.02; torso = -0.05; lean = 0.12;
    }

    /* ---------- Place the figure, then let the limbs reach ---------- */
    if (seat && seat.obj) { root.position.copy(seat.obj.position); root.quaternion.copy(seat.obj.quaternion); C.yaw = p.head; C.y = p.y; }
    else {
      let face = yawWant, ox = 0, oz = 0;
      if (mode === 'climb' || mode === 'slide') { const g = gradient(p.x, p.z, 1.1, gr), l = Math.hypot(g.gx, g.gz) || 1; face = Math.atan2(g.gx, g.gz) + (mode === 'slide' ? Math.PI : 0); ox = -g.gx / l * 0.3; oz = -g.gz / l * 0.3; }
      C.yaw = angDamp(C.yaw, face, mode === 'glide' ? 30 : mode === 'climb' ? 10 : 13, dt);
      // Height follows the ground through a soft spring, so small bumps do not jolt the body
      C.y = C.y === null || !grounded || Math.abs(p.y - C.y) > 1.2 ? p.y : damp(C.y, p.y, 26, dt);
      const hug = mode === 'climb' ? 1 : 0;
      root.position.set(p.x + ox * hug, C.y + (mode === 'zip' ? -2.25 : 0), p.z + oz * hug); root.rotation.set(0, C.yaw, 0);
    }
    const turn = Math.atan2(Math.sin(yawWant - C.yaw), Math.cos(yawWant - C.yaw));
    if (grounded) { roll += clamp(-turn * 0.5, -0.3, 0.3) * clamp(speed / 6, 0, 1); lean += clamp(speed / 9.6, 0, 1) * 0.07; }
    C.lean = damp(C.lean, lean, 10, dt); C.roll = damp(C.roll, roll, 8, dt); C.torso = damp(C.torso, torso, 10, dt); C.twist = damp(C.twist, twist, 14, dt);
    C.hipY = damp(C.hipY, hipY, rate, dt); C.hipZ = damp(C.hipZ, hipZ, 12, dt); C.squash = damp(C.squash, p.landed > 0 ? 1 : 0, 20, dt);
    tilt.rotation.set(C.lean, 0, C.roll); hips.position.set(0, C.hipY - C.squash * 0.2, C.hipZ); hips.rotation.set(0, C.twist, 0);
    chest.rotation.set(C.torso + Math.sin(C.t * 1.9) * 0.012, -C.twist * 1.7, 0); chest.scale.set(1 + Math.sin(C.t * 1.9) * 0.012, 1, 1 + Math.sin(C.t * 1.9) * 0.02);
    const look = grounded && C.idle > 3 ? Math.sin(C.t * 0.5) * 0.5 : clamp(turn * 0.8, -0.6, 0.6);
    C.headYaw = damp(C.headYaw, look + C.twist * 0.7, 6, dt); C.headPitch = damp(C.headPitch, headPitch - C.torso * 0.75, 8, dt); head.rotation.set(C.headPitch, C.headYaw, 0);
    legL.want.copy(FL); legR.want.copy(FR); legL.want.y += 0.088; legR.want.y += 0.088; armL.want.copy(HL); armR.want.copy(HR);
    root.updateMatrixWorld(true);
    reach(legL, hips, POLE_KNEE, dt, rate + 14); reach(legR, hips, POLE_KNEE, dt, rate + 14); reach(armL, chest, poleL, dt, rate); reach(armR, chest, poleR, dt, rate);
    // Boots stay level with the body rather than following the shin
    root.updateMatrixWorld(true);
    for (const L of [legL, legR]) { L.lo.getWorldQuaternion(qa).invert(); root.getWorldQuaternion(qb); L.tip.quaternion.copy(qa).multiply(qb); const liftF = clamp(L.at.y * 2.2, 0, 0.5); if (mode === 'walk') L.tip.rotateX(liftF); else if (mode === 'climb') L.tip.rotateX(-0.5); }
    armL.tip.getWorldPosition(C.handL); armR.tip.getWorldPosition(C.handR);
    C.mode = mode; return cue;
  };
  C.setVisible = v => { root.visible = v; };
  return C;
}
