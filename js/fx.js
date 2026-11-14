// Post-processing and particles: bloom, grading, dust, spray, snowfall, thermals, fireflies, confetti.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const Grade = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 }, uSat: { value: 1.14 }, uSpeed: { value: 0 }, uTime: { value: 0 }, uWarm: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uSat, uSpeed, uTime, uWarm; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 q = vUv - 0.5; float r2 = dot(q, q);
  // a little radial smear at speed
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  if (uSpeed > 0.01) { vec2 d = q * uSpeed * 0.035 * smoothstep(0.05, 0.4, r2); c = (c + texture2D(tDiffuse, vUv - d).rgb + texture2D(tDiffuse, vUv - d * 2.0).rgb) / 3.0; }
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, uSat);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
  c *= mix(vec3(1.0), vec3(1.04, 1.0, 0.94), uWarm);
  c *= 1.0 - uVig * smoothstep(0.12, 0.62, r2);
  c += (h(vUv * 800.0 + uTime) - 0.5) * 0.012;
  gl_FragColor = vec4(c, 1.0);
}`
};

export function createFX(renderer, scene, camera, env, quality) {
  const FX = { bloomOn: quality.bloom, composer: null };
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  let bloom = null, grade = null;
  try {
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality.msaa });
    const composer = new EffectComposer(renderer, rt); composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.6, 1.45); composer.addPass(bloom);
    composer.addPass(new OutputPass()); grade = new ShaderPass(Grade); composer.addPass(grade); FX.composer = composer; FX.grade = grade.uniforms; bloom.enabled = quality.bloom;
  } catch (e) { console.warn('Post-processing is unavailable; drawing directly.', e); FX.composer = null; }
  FX.setBloom = v => { FX.bloomOn = v; if (bloom) bloom.enabled = v; };
  FX.resize = (w, h, pr) => { if (FX.composer) { FX.composer.setPixelRatio(pr); FX.composer.setSize(w, h); } };
  FX.render = (dt, time, speed) => {
    if (FX.composer) { grade.uniforms.uTime.value = time % 10; grade.uniforms.uSpeed.value += (Math.min(1, Math.max(0, (speed - 14) / 14)) - grade.uniforms.uSpeed.value) * Math.min(1, dt * 4); if (bloom) bloom.strength = 0.34 + env.night * 0.5; FX.composer.render(dt); }
    else renderer.render(scene, camera);
  };

  /* ---------- A pool of soft particles, moved on the CPU ---------- */
  const N = quality.particles, pos = new Float32Array(N * 3), col = new Float32Array(N * 4), siz = new Float32Array(N), P = [];
  for (let i = 0; i < N; i++) { P.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, size: 1, grow: 0, a: 1, r: 1, gg: 1, b: 1, spin: 0 }); pos[i * 3 + 1] = -999; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('aCol', new THREE.BufferAttribute(col, 4)); pg.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  const pm = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false,
    vertexShader: 'attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vC; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(0.5, -mv.z); }',
    fragmentShader: `varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.25, d) * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
  });
  const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; pts.renderOrder = 4; scene.add(pts);
  let pi = 0; const c = new THREE.Color();
  // o: { n, spread, vel:[x,y,z], rand, up, life, size, grow, color, alpha, g, drag }
  FX.emit = (x, y, z, o) => {
    const n = o.n || 1;
    for (let k = 0; k < n; k++) {
      const i = pi++ % N, p = P[i], a = Math.random() * 6.283, r = Math.random() * (o.spread || 0), rv = o.rand || 0;
      pos[i * 3] = x + Math.cos(a) * r; pos[i * 3 + 1] = y + (Math.random() - 0.3) * (o.spreadY || 0); pos[i * 3 + 2] = z + Math.sin(a) * r;
      const v = o.vel || [0, 0, 0]; p.vx = v[0] + (Math.random() - 0.5) * rv * 2; p.vy = v[1] + Math.random() * (o.up || 0) + (Math.random() - 0.5) * rv; p.vz = v[2] + (Math.random() - 0.5) * rv * 2;
      p.max = p.life = (o.life || 0.8) * (0.7 + Math.random() * 0.6); p.g = o.g ?? 3; p.drag = o.drag ?? 1.5; p.size = (o.size || 0.3) * (0.6 + Math.random() * 0.8); p.grow = o.grow ?? 1.2; p.a = o.alpha ?? 0.7;
      c.set(Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color ?? 0xffffff); if (o.bright) c.multiplyScalar(o.bright); p.r = c.r; p.gg = c.g; p.b = c.b;
    }
  };
  /* ---------- Snowfall round the camera, up high ---------- */
  const SN = quality.snow, sp = new Float32Array(SN * 3); for (let i = 0; i < SN * 3; i++) sp[i] = (Math.random() - 0.5) * 60;
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sm = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 600 } }, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime, uScale; uniform vec3 uCam; varying float vA; void main(){ vec3 p = position; p.y -= uTime * (2.2 + fract(p.x * 7.3) * 1.6); p.x += sin(uTime * 0.8 + p.z) * 0.9 + uTime * 1.3; p = mod(p - uCam + 30.0, 60.0) - 30.0; vA = 1.0 - smoothstep(18.0, 30.0, length(p)); vec4 mv = viewMatrix * vec4(p + uCam, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (0.07 + fract(position.z * 3.1) * 0.08) * uScale / max(0.5, -mv.z); }`,
    fragmentShader: `uniform float uAmt; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.2, d) * vA * uAmt; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.0), a * 0.9);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}` });
  const snow = new THREE.Points(sg, sm); snow.frustumCulled = false; snow.renderOrder = 5; scene.add(snow);

  /* ---------- Thermals and fireflies: animated entirely in the shader ---------- */
  FX.addThermals = list => {
    const per = 70, n = list.length * per, a = new Float32Array(n * 3), b = new Float32Array(n * 4);
    list.forEach((t, k) => { for (let i = 0; i < per; i++) { const j = k * per + i; a[j * 3] = t.x; a[j * 3 + 1] = t.y0; a[j * 3 + 2] = t.z; b[j * 4] = Math.random() * 6.283; b[j * 4 + 1] = Math.random(); b[j * 4 + 2] = t.r * (0.25 + Math.random() * 0.7); b[j * 4 + 3] = t.top - t.y0; } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setAttribute('aP', new THREE.BufferAttribute(b, 4));
    const m = new THREE.ShaderMaterial({ uniforms: { uTime: sm.uniforms.uTime, uScale: sm.uniforms.uScale, uShow: { value: 1 } }, transparent: true, depthWrite: false,
      vertexShader: `attribute vec4 aP; uniform float uTime, uScale; varying float vA; void main(){ float h = fract(aP.y + uTime * 0.045) ; float ang = aP.x + h * 9.0 + uTime * 0.5; vec3 p = position + vec3(cos(ang) * aP.z * (0.7 + h * 0.5), h * aP.w, sin(ang) * aP.z * (0.7 + h * 0.5)); vec4 mv = viewMatrix * vec4(p, 1.0); vA = smoothstep(0.0, 0.06, h) * smoothstep(1.0, 0.75, h) * smoothstep(3.0, 12.0, -mv.z); gl_Position = projectionMatrix * mv; gl_PointSize = min(0.5 * uScale / max(0.5, -mv.z), 26.0); }`,
      fragmentShader: `uniform float uShow; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d) * vA * 0.75 * uShow; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.0, 0.98, 0.9), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}` });
    const pt = new THREE.Points(g, m); pt.frustumCulled = false; pt.renderOrder = 3; scene.add(pt); FX.thermalShow = m.uniforms.uShow;
    const SEG = 90, rp = [], ra = [], ri = []; let base = 0;
    for (const t of list) for (let k = 0; k < 3; k++) {
      for (let i = 0; i <= SEG; i++) { const h = i / SEG; for (const e of [0, 1]) { rp.push(t.x, t.y0 + h * (t.top - t.y0) + (e ? 1.5 : 0), t.z); ra.push(k * 2.094 + h * 15.0, t.r * (0.5 + 0.2 * Math.sin(h * 9.0 + k)) * (0.75 + h * 0.45), h, e); } }
      for (let i = 0; i < SEG; i++) { const a = base + i * 2; ri.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); } base += (SEG + 1) * 2;
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('aR', new THREE.Float32BufferAttribute(ra, 4)); rg.setIndex(ri);
    const rm = new THREE.ShaderMaterial({ uniforms: { uTime: sm.uniforms.uTime, uShow: m.uniforms.uShow }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'attribute vec4 aR; uniform float uTime; varying vec2 vR; void main(){ float a = aR.x - uTime * 0.55; vec3 p = position + vec3(cos(a) * aR.y, 0.0, sin(a) * aR.y); vR = aR.zw; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }',
      fragmentShader: `uniform float uTime, uShow; varying vec2 vR; void main(){ float a = sin(vR.y * 3.14159) * smoothstep(0.0, 0.05, vR.x) * smoothstep(1.0, 0.8, vR.x) * (0.45 + 0.55 * sin(vR.x * 60.0 - uTime * 4.0)) * 0.2 * uShow; if (a < 0.004) discard; gl_FragColor = vec4(vec3(1.0, 0.98, 0.92), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}` });
    const rib = new THREE.Mesh(rg, rm); rib.frustumCulled = false; rib.renderOrder = 3; scene.add(rib);
  };
  FX.addFireflies = spots => {
    const n = spots.length, a = new Float32Array(n * 3), b = new Float32Array(n); spots.forEach((s, i) => { a[i * 3] = s[0]; a[i * 3 + 1] = s[1]; a[i * 3 + 2] = s[2]; b[i] = Math.random() * 100; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setAttribute('aS', new THREE.BufferAttribute(b, 1));
    const m = new THREE.ShaderMaterial({ uniforms: { uTime: sm.uniforms.uTime, uScale: sm.uniforms.uScale, uNight: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aS; uniform float uTime, uScale; varying float vA; void main(){ vec3 p = position + vec3(sin(uTime * 0.6 + aS) * 1.6, sin(uTime * 0.9 + aS * 1.7) * 0.7, cos(uTime * 0.5 + aS * 1.3) * 1.6); vA = 0.5 + 0.5 * sin(uTime * 2.2 + aS * 5.0); vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 0.22 * uScale / max(0.5, -mv.z); }`,
      fragmentShader: `uniform float uNight; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d) * vA * uNight; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.6, 2.2, 0.5) * a, a); }` });
    const pt = new THREE.Points(g, m); pt.frustumCulled = false; pt.renderOrder = 3; scene.add(pt); FX.fireflyNight = m.uniforms.uNight;
  };

  FX.update = (dt, time, cam, snowAmt, viewH) => {
    const scale = viewH * 0.9; pm.uniforms.uScale.value = scale; sm.uniforms.uScale.value = scale; sm.uniforms.uTime.value = time; sm.uniforms.uAmt.value = snowAmt; sm.uniforms.uCam.value.copy(cam.position); snow.visible = snowAmt > 0.01;
    if (FX.fireflyNight) FX.fireflyNight.value = env.night;
    for (let i = 0; i < N; i++) {
      const p = P[i]; if (p.life <= 0) continue; p.life -= dt; const k = i * 3;
      if (p.life <= 0) { pos[k + 1] = -999; col[i * 4 + 3] = 0; siz[i] = 0; continue; }
      const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.g * dt; pos[k] += p.vx * dt; pos[k + 1] += p.vy * dt; pos[k + 2] += p.vz * dt;
      const t = p.life / p.max; col[i * 4] = p.r; col[i * 4 + 1] = p.gg; col[i * 4 + 2] = p.b; col[i * 4 + 3] = p.a * Math.min(1, t * 2.2) * Math.min(1, (1 - t) * 8); siz[i] = p.size * (1 + (1 - t) * p.grow);
    }
    pg.attributes.position.needsUpdate = true; pg.attributes.aCol.needsUpdate = true; pg.attributes.aSize.needsUpdate = true;
  };
  return FX;
}
