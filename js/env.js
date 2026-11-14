// Sky, sun, fog and time of day. Everything that lights the world lives here.
import * as THREE from 'three';

const mix = (a, b, t) => a + (b - a) * t;

/* ---------- Fog that thins with height, so far summits stand clear of the haze ---------- */
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying float vFogY;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n vFogDepth = -mvPosition.z; vFogY = dot(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]), mvPosition.xyz - viewMatrix[3].xyz);\n#endif';
THREE.ShaderChunk.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor; varying float vFogDepth; varying float vFogY;\n #ifdef FOG_EXP2\n uniform float fogDensity;\n #else\n uniform float fogNear; uniform float fogFar;\n #endif\n#endif';
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
 #ifdef FOG_EXP2
  float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
 #else
  float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
 #endif
 fogFactor *= mix(0.3, 1.0, exp(-max(vFogY - 20.0, 0.0) * 0.0075));
 gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

/* ---------- A tileable noise texture, shared by the ground, the sky, the water and the grass ---------- */
export function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const h = (i, j, s) => { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const vn = (x, y, P, s) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), a = (xi % P + P) % P, b = (yi % P + P) % P, a1 = (a + 1) % P, b1 = (b + 1) % P; return mix(mix(h(a, b, s), h(a1, b, s), u), mix(h(a, b1, s), h(a1, b1, s), u), v); };
  const fb = (x, y, P, oct, s, rid) => { let amp = 0.5, sum = 0, n = 0; for (let o = 0; o < oct; o++) { let v = vn(x * P, y * P, P, s + o); if (rid) { v = 1 - Math.abs(v * 2 - 1); v *= v; } sum += amp * v; n += amp; amp *= 0.5; P *= 2; } return sum / n; };
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = i / size, y = j / size, k = (j * size + i) * 4;
    data[k] = fb(x, y, 4, 6, 1) * 255; data[k + 1] = fb(x, y, 16, 4, 9) * 255; data[k + 2] = fb(x, y, 8, 5, 21, true) * 255; data[k + 3] = fb(x, y, 6, 5, 33) * 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t;
}

/* ---------- Times of day ---------- */
const K = (hour, o) => ({ hour, ...o });
const KEYS = [
  K(0,    { zen: 0x050a1c, hor: 0x16233f, sun: 0x9fb6e8, sunI: 1.05, amb: 0x4a66a8, ambG: 0x1c2436, ambI: 1.1, fog: 0x1a2a4c, cloud: 0x34446a, cloudS: 0x101830, star: 1, expo: 1.22 }),
  K(5.2,  { zen: 0x0b1433, hor: 0x2a3358, sun: 0x9fb6e8, sunI: 1.0, amb: 0x4f6aa8, ambG: 0x1e2638, ambI: 1.1, fog: 0x24345a, cloud: 0x3e4c74, cloudS: 0x151c34, star: 0.9, expo: 1.2 }),
  K(6.4,  { zen: 0x35579a, hor: 0xf7a66b, sun: 0xff9a55, sunI: 2.2, amb: 0x8fa2cf, ambG: 0x4a3c34, ambI: 1.17, fog: 0xd9a488, cloud: 0xffc9a0, cloudS: 0x6b5a7a, star: 0, expo: 0.98 }),
  K(8.5,  { zen: 0x2f7bd6, hor: 0xbfe0f5, sun: 0xfff0d6, sunI: 3.3, amb: 0xb6d4f5, ambG: 0x5d5a46, ambI: 1.49, fog: 0xbcd9ee, cloud: 0xffffff, cloudS: 0x9fb2cc, star: 0, expo: 0.95 }),
  K(12.5, { zen: 0x1f6fd8, hor: 0xb4daf7, sun: 0xfff6e6, sunI: 3.6, amb: 0xbcd8f8, ambG: 0x625e48, ambI: 1.56, fog: 0xb6d6f0, cloud: 0xffffff, cloudS: 0xa3b6d0, star: 0, expo: 0.93 }),
  K(16.2, { zen: 0x2a72cf, hor: 0xcfe0ee, sun: 0xffe9c4, sunI: 3.4, amb: 0xb9d2f0, ambG: 0x625a46, ambI: 1.43, fog: 0xc4d8e8, cloud: 0xfffaf0, cloudS: 0xa5b0c8, star: 0, expo: 0.95 }),
  K(17.9, { zen: 0x2c5cae, hor: 0xffb46e, sun: 0xff9a4a, sunI: 3.0, amb: 0xa3b0dc, ambG: 0x5e4636, ambI: 1.23, fog: 0xf0b98c, cloud: 0xffc48e, cloudS: 0x7a5a78, star: 0, expo: 1.0 }),
  K(19.0, { zen: 0x1c2f66, hor: 0xe8764a, sun: 0xff6a3a, sunI: 1.4, amb: 0x6a76b0, ambG: 0x3a2c34, ambI: 1.04, fog: 0x8c6272, cloud: 0xe8846a, cloudS: 0x3a3058, star: 0.25, expo: 1.02 }),
  K(20.3, { zen: 0x08102a, hor: 0x1f2b4e, sun: 0x9fb6e8, sunI: 1.0, amb: 0x4a66a8, ambG: 0x1c2436, ambI: 1.08, fog: 0x1c2c50, cloud: 0x36466c, cloudS: 0x111a32, star: 1, expo: 1.2 }),
  K(24,   { zen: 0x050a1c, hor: 0x16233f, sun: 0x9fb6e8, sunI: 1.05, amb: 0x4a66a8, ambG: 0x1c2436, ambI: 1.1, fog: 0x1a2a4c, cloud: 0x34446a, cloudS: 0x101830, star: 1, expo: 1.22 })
];
const COLS = ['zen', 'hor', 'sun', 'amb', 'ambG', 'fog', 'cloud', 'cloudS'];
for (const k of KEYS) for (const c of COLS) k[c] = new THREE.Color(k[c]);
export const TIMES = [{ name: 'Morning', hour: 9.2 }, { name: 'Golden hour', hour: 17.75 }, { name: 'Night', hour: 22 }, { name: 'Sunrise', hour: 6.55 }, { name: 'Midday', hour: 12.5 }];

const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = `
uniform vec3 uZen, uHor, uSunCol, uCloud, uCloudS, uSunDir, uMoonDir; uniform float uTime, uStar, uSunVis, uCover; uniform sampler2D uNoise; varying vec3 vDir;
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main(){
  vec3 d = normalize(vDir); float y = d.y;
  float t = pow(smoothstep(-0.02, 1.0, y), 0.42);
  vec3 col = mix(uHor, uZen, t);
  col = mix(col, uHor * 0.92, smoothstep(0.0, -0.25, y));
  float sd = max(dot(d, uSunDir), 0.0);
  // warm scatter round the sun, then the disc itself
  col += uSunCol * (pow(sd, 6.0) * 0.16 + pow(sd, 48.0) * 0.35) * uSunVis * (1.0 - t * 0.5);
  col += uSunCol * smoothstep(0.99955, 0.99985, sd) * 14.0 * uSunVis;
  // stars and a moon
  if (uStar > 0.01 && y > -0.05) {
    vec3 g = floor(d * 190.0); float s = hash13(g); vec3 f = fract(d * 190.0) - 0.5;
    float tw = 0.7 + 0.3 * sin(uTime * (1.0 + s * 3.0) + s * 40.0);
    col += vec3(0.9, 0.95, 1.0) * step(0.9972, s) * smoothstep(0.42, 0.05, length(f)) * uStar * tw * (1.5 + s * 2.0) * smoothstep(-0.02, 0.2, y);
    float md = dot(d, uMoonDir); col += vec3(0.95, 0.97, 1.0) * smoothstep(0.9993, 0.99955, md) * 2.6 * uStar;
    col += vec3(0.4, 0.5, 0.7) * pow(max(md, 0.0), 60.0) * 0.25 * uStar;
    // the milky way, faintly
    float band = exp(-pow(dot(d, normalize(vec3(0.5, 0.35, -0.8))) * 3.2, 2.0)); col += vec3(0.25, 0.3, 0.45) * band * texture2D(uNoise, d.xz * 1.7 + d.y).r * 0.22 * uStar;
  }
  // high cloud, lit from the sun's side
  if (y > 0.015) {
    vec2 uv = d.xz / (y + 0.16) * 0.11 + uTime * vec2(0.0019, 0.0008);
    float n = texture2D(uNoise, uv).r * 0.62 + texture2D(uNoise, uv * 2.7 + 0.3).a * 0.28 + texture2D(uNoise, uv * 7.1).g * 0.1;
    float dens = smoothstep(uCover, uCover + 0.2, n);
    vec2 lo = normalize(uSunDir.xz + 1e-4) * 0.012; float n2 = texture2D(uNoise, uv + lo).r * 0.62 + texture2D(uNoise, (uv + lo) * 2.7 + 0.3).a * 0.28;
    float lit = clamp(0.55 + (n - n2) * 7.0, 0.0, 1.0);
    vec3 cc = mix(uCloudS, uCloud, lit) + uSunCol * pow(sd, 10.0) * 0.25 * uSunVis;
    col = mix(col, cc, dens * smoothstep(0.015, 0.2, y) * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createEnv(scene, renderer) {
  const E = { hour: 9.2, goal: 9.2, night: 0, sunDir: new THREE.Vector3(), lightDir: new THREE.Vector3(), index: 0 };
  E.noise = makeNoiseTexture(256);
  scene.fog = new THREE.FogExp2(0xbcd9ee, 0.00135);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -62; sc.right = 62; sc.top = 62; sc.bottom = -62; sc.near = 1; sc.far = 420; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.09;
  scene.add(sun, sun.target); E.sun = sun; E.hemi = hemi;
  const U = E.uniforms = {
    uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uCloud: { value: new THREE.Color() }, uCloudS: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 }, uStar: { value: 0 }, uSunVis: { value: 1 }, uCover: { value: 0.5 }, uNoise: { value: E.noise }
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({ uniforms: U, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false }));
  sky.scale.setScalar(3000); sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky); E.sky = sky;
  E.fogColor = scene.fog.color; E.sunColor = new THREE.Color(); E.zen = U.uZen.value; E.hor = U.uHor.value; E.exposure = 1;

  const AZ = 2.55, tmp = new THREE.Color(), right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3(), tgt = new THREE.Vector3();
  function apply() {
    const h = ((E.hour % 24) + 24) % 24; let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].hour <= h) i++;
    const A = KEYS[i], B = KEYS[i + 1], t = (h - A.hour) / (B.hour - A.hour), L = c => tmp.copy(A[c]).lerp(B[c], t);
    U.uZen.value.copy(L('zen')); U.uHor.value.copy(L('hor')); U.uCloud.value.copy(L('cloud')); U.uCloudS.value.copy(L('cloudS'));
    E.sunColor.copy(L('sun')); U.uSunCol.value.copy(E.sunColor); sun.color.copy(E.sunColor); sun.intensity = mix(A.sunI, B.sunI, t);
    hemi.color.copy(L('amb')); hemi.groundColor.copy(L('ambG')); hemi.intensity = mix(A.ambI, B.ambI, t);
    scene.fog.color.copy(L('fog')); U.uStar.value = mix(A.star, B.star, t); E.exposure = mix(A.expo, B.expo, t); E.night = U.uStar.value;
    // The sun crosses the sky on a tilted arc; after dark the moon takes over as the light
    const th = (h - 6) / 12.6 * Math.PI, el = Math.sin(th), co = Math.cos(th);
    E.sunDir.set(Math.cos(AZ) * co * 0.9 + 0.25, el * 0.86 + 0.02, Math.sin(AZ) * co * 0.9 + 0.3).normalize();
    U.uSunDir.value.copy(E.sunDir); U.uMoonDir.value.set(-0.45, 0.62, 0.64).normalize();
    U.uSunVis.value = THREE.MathUtils.smoothstep(E.sunDir.y, -0.08, 0.02);
    E.lightDir.copy(E.sunDir.y > 0.035 ? E.sunDir : U.uMoonDir.value);
    if (E.lightDir.y < 0.16) { E.lightDir.y = 0.16; E.lightDir.normalize(); }
    // Stable shadows: the light's box moves in whole texels
    fwd.copy(E.lightDir).negate(); right.crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize(); up.crossVectors(fwd, right);
  }
  E.setHour = (h, now) => { E.goal = h; if (now) E.hour = h; apply(); };
  E.cycle = () => { E.index = (E.index + 1) % TIMES.length; E.goal = TIMES[E.index].hour; return TIMES[E.index].name; };
  E.update = (dt, time, focus) => {
    U.uTime.value = time;
    let d = E.goal - E.hour; d -= Math.round(d / 24) * 24;
    if (Math.abs(d) > 0.004) { E.hour += Math.sign(d) * Math.min(Math.abs(d), dt * Math.max(2.5, Math.abs(d) * 1.6)); apply(); }
    const texel = (sc.right - sc.left) / sun.shadow.mapSize.x, rx = Math.round(focus.dot(right) / texel) * texel, ry = Math.round(focus.dot(up) / texel) * texel, rz = focus.dot(fwd);
    tgt.set(0, 0, 0).addScaledVector(right, rx).addScaledVector(up, ry).addScaledVector(fwd, rz);
    sun.target.position.copy(tgt); sun.position.copy(tgt).addScaledVector(E.lightDir, 210);
  };
  E.follow = cam => sky.position.copy(cam.position);
  apply();
  return E;
}
