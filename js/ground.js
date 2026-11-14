// The ground itself: the mountain's mesh and its painted surface, the far range, water, and the grass.
import * as THREE from 'three';
import * as T from './terrain.js';

const col = hex => new THREE.Color(hex);
const BUMP = `
vec3 tBump(vec3 n, vec3 vp, float h, float fd) {
  vec3 dpx = dFdx(vp), dpy = dFdy(vp); float hx = dFdx(h), hy = dFdy(h);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1);
  vec3 g = sign(det) * (hx * r1 + hy * r2);
  return normalize(abs(det) * n - g * fd);
}`;

export function createGround(scene, env, quality) {
  const G = { tick: [] };
  const NV = T.N + 1, hAt = (ix, iz) => T.H[ix * NV + iz];

  /* ---------- Textures baked from the height grid ---------- */
  {
    // Height, so the grass and the water know where the ground is. Stored row = z, column = x.
    const data = new Uint16Array(NV * NV);
    for (let iz = 0; iz < NV; iz++) for (let ix = 0; ix < NV; ix++) data[iz * NV + ix] = THREE.DataUtils.toHalfFloat(hAt(ix, iz));
    const t = new THREE.DataTexture(data, NV, NV, THREE.RedFormat, THREE.HalfFloatType); t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; G.heightTex = t;
    G.hmap = new THREE.Vector2(1 / (T.CELL * NV), 0.5 / NV + T.HALF / (T.CELL * NV));
  }
  {
    // What grows where: R trail dirt, G trodden camp ground, B snow, A grass
    const S = 512, data = new Uint8Array(S * S * 4), g = { gx: 0, gz: 0 };
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = -T.HALF + (i + 0.5) / S * T.SIZE, z = -T.HALF + (j + 0.5) / S * T.SIZE, h = T.sample(x, z), k = (j * S + i) * 4;
      const n = T.vnoise(x / 2.1 + 5, z / 2.1), n2 = T.vnoise(x / 9 + 1, z / 9 + 8);
      const dirt = 1 - T.smooth(1.5, 3.3, T.trailDistS(x, z) + (n - 0.5) * 1.3);
      let bare = 0; for (const c of T.CAMPS) { const R = T.CAMP_R[c.id] * (c.id === 'base' ? 0.62 : 0.86); bare = Math.max(bare, 1 - T.smooth(R - 3.5, R + 0.5, Math.hypot(x - c.x, z - c.z) + (n2 - 0.5) * 3)); }
      const snow = T.snowAt(x, z, h); T.gradient(x, z, 1.4, g); const sl = Math.hypot(g.gx, g.gz);
      const wet = T.inGorge(x, z, -1) && h < T.streamBed(Math.hypot(x, z)) + 1.2 ? 1 : 0, lake = h < T.LAKE.level + 0.35 ? 1 : 0;
      let grass = (1 - dirt) * (1 - bare) * (1 - Math.min(1, snow * 2.2)) * (1 - T.smooth(0.5, 0.82, sl)) * (1 - wet) * (1 - lake) * (1 - T.smooth(54, 66, h)) * (0.45 + 0.55 * T.smooth(0.25, 0.6, n2));
      if (Math.hypot(x, z) > T.BOUND + 30) grass *= 0.6;
      data[k] = dirt * 255; data[k + 1] = bare * 255; data[k + 2] = snow * 255; data[k + 3] = grass * 255;
    }
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; G.maskTex = t;
  }
  const U = G.uniforms = {
    uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uPlayer: { value: new THREE.Vector3(0, -99, 0) }, uNoise: { value: env.noise }, uMask: { value: G.maskTex }, uH: { value: G.heightTex }, uHmap: { value: G.hmap },
    uSunDir: env.uniforms.uSunDir, uSunCol: env.uniforms.uSunCol, uZen: env.uniforms.uZen, uHor: env.uniforms.uHor, uSunVis: env.uniforms.uSunVis, uLit: { value: new THREE.Color(1, 1, 1) }, uWind: { value: new THREE.Vector2(0.8, 0.6) }
  };

  /* ---------- The mountain ---------- */
  const landMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const pal = {
    uGrassA: col(0x3f6d24), uGrassB: col(0x6b9632), uGrassDry: col(0x9c9a48), uAlpine: col(0x8a8448), uDirtA: col(0x7d5e40), uDirtB: col(0xae906a),
    uRockLoA: col(0x86705c), uRockLoB: col(0xb59a7c), uRockHiA: col(0x787a86), uRockHiB: col(0xa6a8b2), uSnow: col(0xf4f7fb), uWet: col(0x4a5650)
  };
  landMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uNoise: U.uNoise, uMask: U.uMask }); for (const k in pal) sh.uniforms[k] = { value: pal[k] };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float ao; varying vec3 vWP; varying vec3 vWN; varying float vAO;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = position; vWN = normal; vAO = ao;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP; varying vec3 vWN; varying float vAO; uniform sampler2D uNoise, uMask;
uniform vec3 uGrassA, uGrassB, uGrassDry, uAlpine, uDirtA, uDirtB, uRockLoA, uRockLoB, uRockHiA, uRockHiB, uSnow, uWet;
float gRock, gSnow; vec3 gPert;`)
      .replace('#include <color_fragment>', `
  vec3 wn = normalize(vWN); float slope = 1.0 - wn.y, y = vWP.y;
  vec4 m = texture2D(uMask, vWP.xz / ${T.SIZE.toFixed(1)} + 0.5);
  float n1 = texture2D(uNoise, vWP.xz * 0.011).r, n2 = texture2D(uNoise, vWP.xz * 0.06).g, n3 = texture2D(uNoise, vWP.xz * 0.37).g, n4 = texture2D(uNoise, vWP.xz * 1.3).a;
  vec3 grass = mix(uGrassA, uGrassB, smoothstep(0.2, 0.8, n1)); grass = mix(grass, uGrassDry, smoothstep(0.55, 0.9, n2) * 0.35);
  grass = mix(grass, uAlpine, smoothstep(26.0, 54.0, y + (n1 - 0.5) * 14.0)) * (0.78 + 0.44 * n3);
  vec3 bl = pow(abs(wn), vec3(5.0)); bl /= bl.x + bl.y + bl.z;
  float rk = texture2D(uNoise, vWP.zy * 0.085).b * bl.x + texture2D(uNoise, vWP.xz * 0.085).b * bl.y + texture2D(uNoise, vWP.xy * 0.085).b * bl.z;
  float rk2 = texture2D(uNoise, vWP.zy * 0.4).g * bl.x + texture2D(uNoise, vWP.xz * 0.4).g * bl.y + texture2D(uNoise, vWP.xy * 0.4).g * bl.z;
  float strata = texture2D(uNoise, vec2(n1 * 0.25 + rk * 0.04, y * 0.036)).a;
  float hi = smoothstep(34.0, 62.0, y + (n1 - 0.5) * 10.0);
  float tone = clamp(strata * 0.7 + n1 * 0.4 - 0.05, 0.0, 1.0);
  vec3 rock = mix(mix(uRockLoA, uRockLoB, tone), mix(uRockHiA, uRockHiB, tone), hi);
  float rk3 = texture2D(uNoise, vWP.zy * 1.9).b * bl.x + texture2D(uNoise, vWP.xz * 1.9).b * bl.y + texture2D(uNoise, vWP.xy * 1.9).b * bl.z;
  float rk4 = texture2D(uNoise, vWP.zy * 0.71).a * bl.x + texture2D(uNoise, vWP.xz * 0.71).a * bl.y + texture2D(uNoise, vWP.xy * 0.71).a * bl.z;
  float crack = smoothstep(0.62, 0.95, rk) * 0.3 + smoothstep(0.6, 0.9, rk2) * 0.22 + smoothstep(0.55, 0.85, rk3) * 0.34;
  float sph = y * 1.15 + n1 * 9.0 + rk * 2.5 + (vWP.x + vWP.z) * 0.035; float sline = smoothstep(0.55, 1.0, sin(sph)) ;
  rock *= (0.84 + 0.32 * rk4) * (1.0 - crack * 0.5) * (1.0 - sline * 0.24) * (0.92 + 0.16 * sin(sph * 0.37 + 1.0));
  rock = mix(rock, rock * vec3(1.12, 1.04, 0.9), smoothstep(0.5, 0.8, rk2) * 0.5);
  float peb = texture2D(uNoise, vWP.xz * 2.3).b, grit = texture2D(uNoise, vWP.xz * 5.1).g;
  vec3 dirt = mix(uDirtA, uDirtB, n3) * (0.8 + 0.3 * n4) * (0.84 + 0.42 * smoothstep(0.3, 0.75, peb)) * (0.9 + 0.2 * grit);
  gRock = smoothstep(0.2, 0.4, slope + (n2 - 0.5) * 0.16);
  float trail = max(m.r, m.g * 0.9);
  vec3 c = mix(grass, dirt, smoothstep(0.25, 0.75, trail + (n3 - 0.5) * 0.35));
  c = mix(c, rock, gRock);
  c = mix(c, uWet * (0.7 + 0.5 * rk), smoothstep(${(T.LAKE.level + 0.6).toFixed(2)}, ${(T.LAKE.level - 0.3).toFixed(2)}, y) * step(length(vWP.xz - vec2(${T.LAKE.x.toFixed(2)}, ${T.LAKE.z.toFixed(2)})), ${(T.LAKE.r + 8).toFixed(1)}));
  gSnow = clamp(m.b * 1.25 + (n2 - 0.5) * 0.5 * step(0.02, m.b), 0.0, 1.0) * (1.0 - smoothstep(0.42, 0.72, slope + (n3 - 0.5) * 0.25));
  gSnow = smoothstep(0.35, 0.65, gSnow) * (1.0 - trail * 0.55);
  c = mix(c, uSnow * (0.93 + 0.07 * n3) * mix(vec3(0.9, 0.95, 1.06), vec3(1.0), smoothstep(0.3, 0.7, n1)), gSnow);
  vec3 pa = texture2D(uNoise, vWP.zy * 0.13).rga * bl.x + texture2D(uNoise, vWP.xz * 0.13).rga * bl.y + texture2D(uNoise, vWP.xy * 0.13).rga * bl.z;
  vec3 pb = texture2D(uNoise, vWP.zy * 0.47).gab * bl.x + texture2D(uNoise, vWP.xz * 0.47).gab * bl.y + texture2D(uNoise, vWP.xy * 0.47).gab * bl.z;
  gPert = ((pa - 0.5) * 1.3 + (pb - 0.5) * 0.9 + vec3(rk3 - 0.4, rk4 - 0.5, 0.4 - rk3) * 1.1 + vec3(0.0, cos(sph) * 0.5, 0.0)) * mix(0.16, 1.0, gRock) * (1.0 - gSnow * 0.8);
  gPert += vec3(peb - 0.45, 0.0, grit - 0.5) * 0.8 * smoothstep(0.3, 0.7, trail) * (1.0 - gRock);
  float sas = texture2D(uNoise, vec2(vWP.x * 0.045 + vWP.z * 0.02, vWP.z * 0.26 - vWP.x * 0.05)).b;
  gPert += vec3(sas - 0.4, 0.0, (sas - 0.4) * 0.5) * 0.55 * gSnow;
  c += gSnow * smoothstep(0.8, 0.92, texture2D(uNoise, vWP.xz * 11.0).g) * 0.2;
  diffuseColor.rgb = c * mix(0.58, 1.0, vAO);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(mix(0.96, 0.82, gRock), 0.42, gSnow);')
      .replace('#include <normal_fragment_maps>', `
  { vec3 fn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition))); normal = normalize(mix(normal, fn, gRock * 0.6 * (1.0 - gSnow)));
    float fd = clamp(1.0 - length(vViewPosition) / 320.0, 0.0, 1.0); normal = normalize(normal + (viewMatrix * vec4(gPert, 0.0)).xyz * fd); }`);
  };
  {
    const CH = 50, ao = new Float32Array(NV * NV);
    const hc = (ix, iz) => hAt(Math.min(T.N, Math.max(0, ix)), Math.min(T.N, Math.max(0, iz)));
    for (let ix = 0; ix < NV; ix++) for (let iz = 0; iz < NV; iz++) {
      const h = hAt(ix, iz); let near = 0, far = 0;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, cx = Math.cos(a), cz = Math.sin(a); near += hc(Math.round(ix + cx * 3), Math.round(iz + cz * 3)); far += hc(Math.round(ix + cx * 8), Math.round(iz + cz * 8)); }
      const d = (near / 8 - h) * 0.6 + (far / 8 - h) * 0.4;
      ao[ix * NV + iz] = Math.min(1, Math.max(0.12, 0.86 - d * 0.17));
    }
    const land = new THREE.Group(); G.land = land;
    for (let cx = 0; cx < T.N; cx += CH) for (let cz = 0; cz < T.N; cz += CH) {
      const w = CH + 1, pos = new Float32Array(w * w * 3), nor = new Float32Array(w * w * 3), aoA = new Float32Array(w * w), ind = new Uint32Array(CH * CH * 6);
      for (let i = 0; i < w; i++) for (let j = 0; j < w; j++) {
        const ix = cx + i, iz = cz + j, k = (i * w + j) * 3;
        pos[k] = -T.HALF + ix * T.CELL; pos[k + 1] = hAt(ix, iz); pos[k + 2] = -T.HALF + iz * T.CELL;
        const gx = (hc(ix + 1, iz) - hc(ix - 1, iz)) / (2 * T.CELL), gz = (hc(ix, iz + 1) - hc(ix, iz - 1)) / (2 * T.CELL), l = Math.hypot(gx, 1, gz);
        nor[k] = -gx / l; nor[k + 1] = 1 / l; nor[k + 2] = -gz / l; aoA[i * w + j] = ao[ix * NV + iz];
      }
      let o = 0; for (let i = 0; i < CH; i++) for (let j = 0; j < CH; j++) { const a = i * w + j, b = a + 1, c = a + w, d = c + 1; ind[o++] = a; ind[o++] = b; ind[o++] = c; ind[o++] = c; ind[o++] = b; ind[o++] = d; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('ao', new THREE.BufferAttribute(aoA, 1)); geo.setIndex(new THREE.BufferAttribute(ind, 1)); geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, landMat); mesh.receiveShadow = true; mesh.castShadow = true; mesh.matrixAutoUpdate = false; land.add(mesh);
    }
    scene.add(land);
  }

  /* ---------- The far range ---------- */
  {
    const AS = 200, RS = 58, pos = [], colr = [], ind = [], c = new THREE.Color(), rockC = col(0x6f6a72), grassC = col(0x5d7a3a), snowC = col(0xf2f5fa), forest = col(0x2f4a2c);
    const rad = i => 262 + Math.pow(i / (RS - 1), 1.9) * 2500;
    const hgt = (x, z, r) => T.farHeight(x, z) - 2.5 * (1 - T.smooth(300, 360, r));
    for (let i = 0; i < RS; i++) for (let j = 0; j <= AS; j++) {
      const r = rad(i), a = j / AS * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r, h = hgt(x, z, r); pos.push(x, h, z);
      const e = 6 + r * 0.02, sl = Math.hypot(hgt(x + e, z, r) - hgt(x - e, z, r), hgt(x, z + e, r) - hgt(x, z - e, r)) / (2 * e), n = T.vnoise(x / 70, z / 70);
      c.copy(grassC).lerp(forest, T.smooth(0.3, 0.7, n) * (1 - T.smooth(40, 110, h))); c.lerp(rockC, Math.max(T.smooth(0.5, 1.0, sl), T.smooth(110, 190, h))); c.lerp(snowC, T.smooth(170, 260, h + n * 60) * (1 - T.smooth(1.1, 1.9, sl) * 0.5));
      colr.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < RS - 1; i++) for (let j = 0; j < AS; j++) { const a = i * (AS + 1) + j, b = a + 1, d = a + AS + 1, e = d + 1; ind.push(a, b, d, b, e, d); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); geo.setIndex(ind); geo.computeVertexNormals();
    const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    farMat.onBeforeCompile = sh => {
      sh.uniforms.uNoise = U.uNoise;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = position; vWN = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform sampler2D uNoise; vec3 fPert;')
        .replace('#include <color_fragment>', `#include <color_fragment>
  { vec3 wn = normalize(vWN); float sl = 1.0 - wn.y;
    float n1 = texture2D(uNoise, vWP.xz * 0.0011).r, n2 = texture2D(uNoise, vWP.xz * 0.0052 + vWP.y * 0.0021).b, n3 = texture2D(uNoise, vWP.xz * 0.019).g;
    vec3 rock = mix(vec3(0.3, 0.29, 0.33), vec3(0.52, 0.5, 0.52), n2) * (0.8 + 0.4 * n3);
    float rk = smoothstep(0.22, 0.5, sl + (n3 - 0.5) * 0.2) * smoothstep(40.0, 120.0, vWP.y + n1 * 60.0);
    diffuseColor.rgb = mix(diffuseColor.rgb * (0.82 + 0.36 * n3), rock, rk);
    float snow = smoothstep(150.0, 235.0, vWP.y + (n1 - 0.5) * 150.0) * (1.0 - smoothstep(0.34, 0.62, sl + (n2 - 0.5) * 0.45));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.96, 1.0), snow);
    fPert = (texture2D(uNoise, vWP.xz * 0.0043).rga - 0.5) * 1.5 * (1.0 - snow * 0.7) + (texture2D(uNoise, vWP.xz * 0.021).gab - 0.5) * 0.7 * rk; }`)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize(normal + (viewMatrix * vec4(fPert, 0.0)).xyz);');
    };
    const far = new THREE.Mesh(geo, farMat); far.matrixAutoUpdate = false; scene.add(far); G.far = far;
  }

  /* ---------- Water: the lake, and the stream that runs down the gorge into it ---------- */
  const fogU = () => ({ fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.001 }, fogNear: { value: 1 }, fogFar: { value: 1000 } });
  const W_VS = `varying vec3 vW; attribute float aFall; varying float vFall; varying vec2 vUv;
#include <fog_pars_vertex>
void main(){ vFall = aFall; vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
  const W_COMMON = `uniform sampler2D uH, uNoise; uniform vec3 uSunDir, uSunCol, uZen, uHor, uLit; uniform float uTime, uSunVis; uniform vec2 uHmap; varying vec3 vW; varying float vFall; varying vec2 vUv;
#include <fog_pars_fragment>
vec3 skyAt(vec3 r){ return mix(uHor, uZen, pow(clamp(r.y, 0.0, 1.0), 0.45)); }`;
  {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...fogU(), ...U, uLevel: { value: T.LAKE.level }, uShallow: { value: col(0x35c9b8) }, uDeep: { value: col(0x0b4f78) } }, fog: true, transparent: true, depthWrite: false,
      vertexShader: W_VS, fragmentShader: `${W_COMMON} uniform float uLevel; uniform vec3 uShallow, uDeep;
void main(){
  float depth = uLevel - texture2D(uH, vW.xz * uHmap.x + uHmap.y).r; if (depth < -0.03) discard;
  vec2 p = vW.xz; vec2 a = texture2D(uNoise, p * 0.03 + uTime * vec2(0.011, 0.007)).rg - 0.5, b = texture2D(uNoise, p * 0.1 - uTime * vec2(0.017, 0.012)).ga - 0.5, c2 = texture2D(uNoise, p * 0.33 + uTime * vec2(-0.02, 0.026)).gb - 0.5;
  vec3 N = normalize(vec3(a.x * 0.55 + b.x * 0.4 + c2.x * 0.18, 1.0, a.y * 0.55 + b.y * 0.4 + c2.y * 0.18));
  vec3 V = normalize(cameraPosition - vW); float fres = 0.03 + 0.97 * pow(1.0 - max(dot(V, N), 0.0), 5.0); vec3 R = reflect(-V, N); R.y = abs(R.y);
  float sd = max(dot(R, uSunDir), 0.0); vec3 spec = uSunCol * (pow(sd, 700.0) * 26.0 + pow(sd, 50.0) * 0.3) * uSunVis;
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 3.0, depth)) * uLit;
  vec3 col = mix(body, skyAt(R), fres) + spec;
  float fo = depth + (texture2D(uNoise, p * 0.25 + uTime * 0.015).g - 0.5) * 0.35; float foam = smoothstep(0.34, 0.1, fo) * (0.6 + 0.4 * sin(uTime * 1.4 - depth * 16.0));
  col = mix(col, uLit * 1.9, clamp(foam, 0.0, 1.0) * 0.75);
  gl_FragColor = vec4(col, clamp(smoothstep(-0.03, 0.3, depth) * 0.9 + fres * 0.3 + foam * 0.5, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`
    });
    const lake = new THREE.Mesh(new THREE.CircleGeometry(T.LAKE.r + 6, 40), mat); lake.rotation.x = -Math.PI / 2; lake.position.set(T.LAKE.x, T.LAKE.level, T.LAKE.z); lake.renderOrder = 2; scene.add(lake); G.lake = lake;
  }
  {
    const pos = [], uv = [], fall = [], ind = [], tx = -Math.sin(T.GORGE), tz = Math.cos(T.GORGE); let i = 0, len = 0, prevY = null;
    for (let r = T.STREAM.r0 + 1.5; r <= T.STREAM.r1 + 3; r += 0.7, i++) {
      const p = T.polar(T.GORGE, r), y = Math.min(T.sample(p.x, p.z), T.sample(p.x + tx, p.z + tz), T.sample(p.x - tx, p.z - tz)) + 0.32, half = r > T.footR(T.GORGE) ? 2.1 : 1.7, f = prevY === null ? 0 : Math.min(1, Math.max(0, (prevY - y) / 0.7 - 0.25));
      len += prevY === null ? 0 : Math.hypot(0.7, prevY - y); prevY = y;
      pos.push(p.x - tx * half, y, p.z - tz * half, p.x + tx * half, y, p.z + tz * half); uv.push(0, len, 1, len); fall.push(f, f);
      if (i) { const a = (i - 1) * 2; ind.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('aFall', new THREE.Float32BufferAttribute(fall, 1)); geo.setIndex(ind);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...fogU(), ...U, uShallow: { value: col(0x4fd0c8) } }, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: W_VS, fragmentShader: `${W_COMMON} uniform vec3 uShallow;
void main(){
  vec2 f = vec2(vUv.x * 0.6, vUv.y * 0.09 - uTime * (0.35 + vFall * 0.6));
  float n = texture2D(uNoise, f).g * 0.6 + texture2D(uNoise, f * vec2(2.3, 1.7) + 0.4).a * 0.4;
  float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
  float foam = smoothstep(0.52 - vFall * 0.45, 0.72 - vFall * 0.4, n) + (1.0 - edge) * 0.5;
  vec3 col = mix(uShallow * uLit * 0.9 + skyAt(vec3(0.0, 0.6, 0.0)) * 0.25, uLit * 1.8, clamp(foam, 0.0, 1.0));
  gl_FragColor = vec4(col, edge * (0.82 + vFall * 0.18));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`
    });
    const stream = new THREE.Mesh(geo, mat); stream.renderOrder = 1; stream.frustumCulled = false; scene.add(stream);
  }

  /* ---------- Grass: one tile of blades that follows the camera and reads the ground from the height texture ---------- */
  {
    const COUNT = quality.grass, S = 72, base = new THREE.BufferGeometry();
    // A blade: three segments, tapering
    base.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -0.8, 0.36, 0, 0.8, 0.36, 0, -0.5, 0.72, 0, 0.5, 0.72, 0, 0, 1, 0], 3));
    base.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
    const geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.instanceCount = COUNT;
    const off = new Float32Array(COUNT * 2), rnd = new Float32Array(COUNT * 4); let s = 12345; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < COUNT; i++) { off[i * 2] = r() * S; off[i * 2 + 1] = r() * S; rnd[i * 4] = 0.55 + r() * 0.9; rnd[i * 4 + 1] = r(); rnd[i * 4 + 2] = r(); rnd[i * 4 + 3] = r(); }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 2)); geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 4));
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uTime: U.uTime, uCam: U.uCam, uPlayer: U.uPlayer, uNoise: U.uNoise, uMask: U.uMask, uH: U.uH, uHmap: U.uHmap, uWind: U.uWind, uGA: { value: col(0x1f4a12) }, uGB: { value: col(0x8fbf3a) }, uGDry: { value: col(0xc9c060) } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec2 aOff; attribute vec4 aRnd; uniform float uTime; uniform vec3 uCam, uPlayer, uGA, uGB, uGDry; uniform sampler2D uNoise, uMask, uH; uniform vec2 uHmap, uWind; varying vec3 vGCol;`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `
  vec2 cell = mod(aOff - uCam.xz, ${S.toFixed(1)}) - ${(S / 2).toFixed(1)}; vec2 wp = uCam.xz + cell; float dist = length(cell);
  float fade = 1.0 - smoothstep(${(S * 0.3).toFixed(1)}, ${(S * 0.49).toFixed(1)}, dist);
  float gy = texture2D(uH, wp * uHmap.x + uHmap.y).r; float dens = texture2D(uMask, wp / ${T.SIZE.toFixed(1)} + 0.5).a;
  float flower = step(0.965, aRnd.w);
  float grow = fade * step(aRnd.z * 0.92 + 0.04, dens) * aRnd.x;
  float hgt = (0.42 + 0.5 * texture2D(uNoise, wp * 0.02).a + flower * 0.25) * grow, wid = mix(0.055, 0.02, flower) * (grow > 0.0 ? 1.0 : 0.0);
  float ang = aRnd.y * 6.2832; vec2 dir = vec2(cos(ang), sin(ang)); float t = position.y;
  float px = position.x * wid; if (flower > 0.5 && t > 0.6) px = position.x * (t > 0.9 ? 0.0 : 0.11) + (t > 0.9 ? 0.0 : 0.0);
  vec3 transformed = vec3(wp.x + dir.x * px, gy + t * hgt, wp.y + dir.y * px);
  float gust = texture2D(uNoise, wp * 0.012 + uTime * 0.035 * uWind).r;
  float sway = (sin(uTime * 1.9 + wp.x * 0.33 + wp.y * 0.21 + aRnd.y * 4.0) * 0.35 + (gust - 0.35) * 1.7) * 0.34;
  transformed.xz += uWind * sway * t * t * hgt + dir.yx * vec2(1.0, -1.0) * (aRnd.z - 0.5) * 0.3 * t * hgt;
  vec2 dp = wp - uPlayer.xz; float pd = length(dp); float push = (1.0 - smoothstep(0.35, 1.7, pd)) * step(abs(gy - uPlayer.y), 2.2);
  transformed.xz += dp / max(pd, 0.05) * push * 0.55 * t; transformed.y -= push * 0.4 * t * hgt;
  float tone = texture2D(uNoise, wp * 0.011).r, dry = texture2D(uNoise, wp * 0.06).g;
  vec3 tip = mix(uGB * (0.7 + 0.6 * tone), uGDry, smoothstep(0.55, 0.85, dry) * 0.5 + aRnd.z * 0.12);
  vGCol = mix(uGA * (0.8 + 0.5 * tone), tip, t * t * 0.85 + 0.15 * t);
  if (flower > 0.5 && t > 0.6) { float hsel = fract(aRnd.y * 7.3); vGCol = hsel < 0.3 ? vec3(0.95, 0.9, 0.86) : hsel < 0.55 ? vec3(0.98, 0.72, 0.06) : hsel < 0.75 ? vec3(0.86, 0.12, 0.3) : hsel < 0.9 ? vec3(0.2, 0.36, 0.9) : vec3(0.55, 0.25, 0.8); }`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGCol;').replace('#include <color_fragment>', 'diffuseColor.rgb = vGCol;');
    };
    const grass = new THREE.Mesh(geo, mat); grass.frustumCulled = false; grass.receiveShadow = true; grass.matrixAutoUpdate = false; scene.add(grass); G.grass = grass;
  }

  const lit = new THREE.Color();
  G.update = (time, camera, focus) => {
    U.uTime.value = time; U.uCam.value.copy(focus); U.uPlayer.value.copy(focus);
    lit.copy(env.hemi.color).multiplyScalar(env.hemi.intensity * 0.3); U.uLit.value.copy(env.sunColor).multiplyScalar(env.sun.intensity * 0.2 * Math.max(0.15, env.lightDir.y)).add(lit);
  };
  return G;
}
