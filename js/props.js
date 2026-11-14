// Loose objects with real physics. The engine is big, so it loads after the mountain is already on screen.
import * as THREE from 'three';
import { mat } from './kit.js';
import * as T from './terrain.js';

export async function createPhysics(W, onHit) {
  const RAPIER = (await import('rapier')).default; await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -22, z: 0 }), scene = W.scene;

  // The ground: the same triangles you see, cropped to where things can actually roll
  const N = T.N, lo = 72, hi = N - 72, n = hi - lo, verts = new Float32Array((n + 1) * (n + 1) * 3), idx = new Uint32Array(n * n * 6);
  for (let ix = 0; ix <= n; ix++) for (let iz = 0; iz <= n; iz++) { const k = (ix * (n + 1) + iz) * 3; verts[k] = -T.SIZE / 2 + (ix + lo) * T.CELL; verts[k + 1] = T.H[(ix + lo) * (N + 1) + iz + lo]; verts[k + 2] = -T.SIZE / 2 + (iz + lo) * T.CELL; }
  let o = 0; for (let ix = 0; ix < n; ix++) for (let iz = 0; iz < n; iz++) { const a = ix * (n + 1) + iz, b = a + 1, c = a + n + 1, d = c + 1; idx.set([a, b, c, c, b, d], o); o += 6; }
  world.createCollider(RAPIER.ColliderDesc.trimesh(verts, idx).setFriction(0.9).setRestitution(0.15));
  for (const b of T.BRIDGES) world.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, 0.2, b.half + 1.2).setTranslation(b.x, b.y - 0.2, b.z).setRotation({ x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) }));
  for (const s of W.obstacles) if (s.r > 0.6) world.createCollider(RAPIER.ColliderDesc.cylinder(2, s.r * 0.9).setTranslation(s.x, T.sample(s.x, s.z) + 2, s.z));

  // You, as far as the loose objects are concerned
  const me = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
  const meCol = world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.5).setFriction(0.2), me); let meR = 0.5;

  const items = W.props.map(s => {
    let geo, col;
    if (s.kind === 'box' || s.kind === 'brick') { geo = new THREE.BoxGeometry(...s.size); col = RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2); }
    else if (s.kind === 'barrel') { geo = new THREE.CylinderGeometry(s.size[0], s.size[0], s.size[1], 10); col = RAPIER.ColliderDesc.cylinder(s.size[1] / 2, s.size[0]); }
    else { geo = new THREE.IcosahedronGeometry(s.size[0], s.kind === 'rock' ? 0 : 1); col = RAPIER.ColliderDesc.ball(s.size[0] * (s.kind === 'rock' ? 0.9 : 1)); }
    const mesh = new THREE.Mesh(geo, mat(s.color)); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
    if (s.kind === 'brick') for (const sx of [-0.3, 0.3]) { const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 8), mat(s.color)); stud.position.set(sx, s.size[1] / 2 + 0.07, 0); mesh.add(stud); }
    if (s.kind === 'barrel') for (const sy of [-0.38, 0.38]) { const hoop = new THREE.Mesh(new THREE.CylinderGeometry(s.size[0] + 0.03, s.size[0] + 0.03, 0.09, 10), mat(0x23232a)); hoop.position.y = sy; mesh.add(hoop); }
    const yaw = s.yaw || 0, q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(s.x, s.y, s.z).setRotation(q).setLinearDamping(0.12).setAngularDamping(s.kind === 'ball' || s.kind === 'rock' ? 0.25 : 0.5).setCcdEnabled(s.kind === 'rock'));
    world.createCollider(col.setDensity(s.kind === 'rock' ? 2.2 : s.kind === 'ball' ? 0.35 : 0.7).setFriction(0.75).setRestitution(s.kind === 'ball' ? 0.55 : 0.2), body);
    mesh.position.set(s.x, s.y, s.z); mesh.quaternion.set(q.x, q.y, q.z, q.w);
    return { s, mesh, body, q, asleep: true, lost: 0, moved: false };
  });
  // Let the piles settle before anyone sees them, then put everything to sleep
  for (let i = 0; i < 90; i++) { world.timestep = 1 / 60; world.step(); }
  for (const it of items) { const p = it.body.translation(), r = it.body.rotation(); it.home = { x: p.x, y: p.y, z: p.z }; it.homeQ = { x: r.x, y: r.y, z: r.z, w: r.w }; it.body.sleep(); it.mesh.position.set(p.x, p.y, p.z); it.mesh.quaternion.set(r.x, r.y, r.z, r.w); }

  let acc = 0, kicked = 0;
  return {
    get kicked() { return kicked; },
    step(dt, p, zip, rad = 0.5) {
      if (rad !== meR) { meR = rad; meCol.setRadius(rad); }
      me.setNextKinematicTranslation({ x: p.x, y: zip ? -50 : p.y + 1.05, z: p.z });
      acc = Math.min(acc + dt, 0.05); while (acc >= 1 / 120) { world.timestep = Math.min(acc, 1 / 60); world.step(); acc -= world.timestep; }
      for (const it of items) {
        const sleeping = it.body.isSleeping();
        if (it.asleep && !sleeping) { const d = Math.hypot(p.x - it.home.x, p.z - it.home.z); if (!it.moved) { it.moved = true; kicked++; } if (d < 30) onHit(it, Math.max(0.2, 1 - d / 30)); }
        it.asleep = sleeping; if (sleeping) continue;
        const t = it.body.translation(), r = it.body.rotation(); it.mesh.position.set(t.x, t.y, t.z); it.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        // Anything that leaves the mountain comes home after a moment
        if (t.y < -15 || Math.hypot(t.x, t.z) > 176) { it.lost += dt; if (it.lost > 2.5) { it.body.setTranslation(it.home, true); it.body.setRotation(it.homeQ, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true); it.body.setAngvel({ x: 0, y: 0, z: 0 }, true); it.lost = 0; } }
      }
    }
  };
}
