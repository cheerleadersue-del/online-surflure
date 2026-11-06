// 3D 바다 월드: 소나무 숲길 → 모랫길 → 해변 → 갯바위 → 방파제 (Three.js)
import * as THREE from '../vendor/three/three.module.min.js';
import { Avatar } from './avatar3d.js';
import * as TX from './textures.js';
import { rng, smooth, lerp, clamp, skyAt, hashStr } from './scene.js';

export const M = 0.06; // 게임 좌표(px) → 미터
const PIER_X = 391, PIER_TOP = 2.6;

// ── 지형 함수 ──
function hash(i, j) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash(xi, zi), hash(xi + 1, zi), u), lerp(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
}
const fbm = (x, z) => vnoise(x, z) * 0.5 + vnoise(x * 2.1 + 5, z * 2.1) * 0.25 + vnoise(x * 4.3, z * 4.3 + 3) * 0.125;

export function shoreZ(X) {
  let z = lerp(-170, -13 + Math.sin(X * 0.035) * 2.5, smooth(95, 172, X));
  z = lerp(z, -9 + Math.sin(X * 0.11) * 1.5, smooth(312, 330, X));
  z = lerp(z, -5.6, smooth(384, 392, X));
  return z;
}
function hillH(X, Z) {
  return 42 * Math.exp(-(((X - 378) ** 2) / (2 * 38 * 38) + ((Z - 92) ** 2) / (2 * 32 * 32)));
}
function heightAt(X, Z) {
  const sz = shoreZ(X);
  const dz = Z - sz;
  const forest = 1 - smooth(100, 170, X);
  let h;
  if (dz < 0) h = dz > -25 ? dz * 0.07 : Math.max(-16, -1.75 + (dz + 25) * 0.15);
  else h = dz < 22 ? dz * 0.065 : 1.43 + Math.min(dz - 22, 80) * 0.018;
  if (dz > 0) {
    h += (fbm(X * 0.05, Z * 0.05) - 0.5) * 1.3 * forest;
    h += Math.max(0, fbm(X * 0.08, Z * 0.11) - 0.42) * 1.6 * (1 - forest) * smooth(14, 22, dz);
    if (Math.abs(Z) < 2.4) h -= 0.12 * forest * (1 - Math.abs(Z) / 2.4);
  }
  const rocky = smooth(312, 330, X) * (1 - smooth(386, 394, X));
  if (rocky > 0 && dz > -8 && dz < 10) h += rocky * fbm(X * 0.22, Z * 0.22) * 1.4 * (1 - Math.abs(dz - 1) / 11);
  h += hillH(X, Z);
  return h;
}
export function groundY(X) {
  return X > PIER_X ? PIER_TOP : heightAt(X, 0);
}

const C = (hex) => new THREE.Color(hex);
const LINE_STYLE = {
  east: {
    dry: C('#e8dcc0'), wet: C('#b5a07a'), under: C('#c9b98f'), deepFloor: C('#6f7a62'),
    rock: C('#b6a184'), mussel: C('#26231f'), detail: 'sand',
    shallow: C('#2fb5b0'), deep: C('#0f5f9e'), fog: 0.0016,
    zenith: C('#1d5fc4'), horizon: C('#9fcbef'),
  },
  west: {
    dry: C('#96705a'), wet: C('#654c3e'), under: C('#7f6d5a'), deepFloor: C('#55604f'),
    rock: C('#6e5d53'), mussel: C('#2b2622'), detail: 'pebble',
    shallow: C('#7aa8a2'), deep: C('#3d6f86'), fog: 0.0028,
    zenith: C('#2a66c0'), horizon: C('#b9d3e6'),
  },
};

export class World {
  constructor(canvas) {
    this.cv = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    this.mobile = Math.min(innerWidth, innerHeight) < 700;
    r.setPixelRatio(Math.min(devicePixelRatio || 1, this.mobile ? 1.5 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.85;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);
    this.raycaster = new THREE.Raycaster();
    this.flagGroups = new Map();
    this.flagsRef = null;
    this.footIdx = 0;
    this.camPos = new THREE.Vector3(0, 3, 8);
    this.camLook = new THREE.Vector3(0, 1, 0);
    this.camDir = 1;
    this.tmp = new THREE.Vector3();
    this.resize();
  }

  resize() {
    const w = this.cv.clientWidth || innerWidth, h = this.cv.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = h / w > 1.2;
    this.camera.fov = this.portrait ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  // ── 월드 생성 (라인이 바뀌면 다시 만든다) ──
  build(line) {
    if (this.scene) this.dispose();
    this.line = line;
    const S = (this.style = LINE_STYLE[line]);
    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.FogExp2('#cfe3f0', S.fog);

    // 하늘
    this.sky = makeSkyDome();
    scene.add(this.sky);

    // 조명
    this.hemi = new THREE.HemisphereLight('#cfe6ff', '#b59d78', 1.6);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight('#fff3df', 3));
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);

    this.buildTerrain();
    this.buildWater();
    this.buildTrees();
    this.buildRocks();
    this.buildCoastStructures();
    this.buildPier();
    this.buildDistant();
    this.buildAmbient();
    this.buildFishingGear();
    this.depthTex.needsUpdate = true;

    // 아바타 & 낚시꾼들
    this.player = null;
    this.playerKey = '';
    this.npcs = [];
    this.flagGroups.clear();
    this.flagsRef = null;
    this.lastHour = -1;
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    this.scene = null;
  }

  // 지형: 물가 쪽을 촘촘하게
  buildTerrain() {
    const S = this.style;
    const xs = [];
    for (let x = -80; x <= 560; x += 1.6) xs.push(x);
    const zs = [];
    for (let z = -440; z < -80; z += 8) zs.push(z);
    for (let z = -80; z < -40; z += 3) zs.push(z);
    for (let z = -40; z < 30; z += 1) zs.push(z);
    for (let z = 30; z <= 160; z += 3) zs.push(z);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const c = new THREE.Color();
    const forestC = C('#4c3f29'), mossC = C('#434a2b'), needleC = C('#6a5233'), pathC = C('#9a8462');
    const hillC = C('#2f4428'), hillC2 = C('#45592f'), cliffC = C('#8a7864'), grassC = C('#6c7240');
    let i = 0;
    for (let zi = 0; zi < nz; zi++) {
      for (let xi = 0; xi < nx; xi++, i++) {
        const X = xs[xi], Z = zs[zi];
        const h = heightAt(X, Z);
        pos[i * 3] = X; pos[i * 3 + 1] = h; pos[i * 3 + 2] = Z;
        uv[i * 2] = X / 5; uv[i * 2 + 1] = Z / 5;
        const sz = shoreZ(X), dz = Z - sz;
        const n = fbm(X * 0.15, Z * 0.15);
        // 모래/자갈 기본색
        if (dz < 0) c.copy(S.under).lerp(S.deepFloor, smooth(0, 9, -dz));
        else c.copy(S.wet).lerp(S.dry, smooth(1.5, 6, dz));
        c.multiplyScalar(0.92 + n * 0.16);
        // 숲 바닥
        const f = 1 - smooth(112, 168, X);
        if (f > 0 && dz > 0) {
          const fc = forestC.clone().lerp(mossC, smooth(0.45, 0.7, n)).lerp(needleC, smooth(0.55, 0.8, fbm(X * 0.4, Z * 0.4)) * 0.6);
          const p = 1 - smooth(1.2, 2.6, Math.abs(Z + Math.sin(X * 0.05) * 0.4));
          fc.lerp(pathC, p * 0.9);
          c.lerp(fc, f);
        }
        // 갯바위 지대
        const rocky = smooth(312, 330, X) * (1 - smooth(386, 394, X));
        if (rocky > 0 && dz > -6 && dz < 9) {
          const rc = S.rock.clone().multiplyScalar(0.8 + n * 0.3);
          if (h < 0.5 && h > -0.4) rc.lerp(S.mussel, 0.7 * smooth(0.4, 0.6, fbm(X * 0.9, Z * 0.9)));
          c.lerp(rc, rocky * smooth(0.2, 0.5, n + 0.2));
        }
        // 해변 뒤 풀밭
        if (dz > 24 && f < 1) c.lerp(grassC.clone().multiplyScalar(0.85 + n * 0.3), smooth(24, 34, dz) * (1 - f) * 0.9);
        // 언덕 숲과 절벽
        const hh = hillH(X, Z);
        if (hh > 2) {
          const steep = Z < 75 ? smooth(4, 14, hh) * (1 - smooth(18, 30, hh)) * smooth(40, 70, 75 - Z + 40) : 0;
          const gc = hillC.clone().lerp(hillC2, n);
          gc.lerp(cliffC, clamp(steep));
          c.lerp(gc, smooth(2, 6, hh));
        }
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
    }
    const idx = [];
    for (let zi = 0; zi < nz - 1; zi++) {
      for (let xi = 0; xi < nx - 1; xi++) {
        const a = zi * nx + xi, b = a + 1, d = a + nx, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const detail = TX.groundDetail(S.detail, 3);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrain = mesh;

    // 물 깊이 지도 (물 셰이더의 얕은 물빛·포말용)
    this.bounds = new THREE.Vector4(-80, -440, 640, 600);
    const W = 640, H = 600;
    const data = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const X = -80 + x, Z = -440 + y;
        data[y * W + x] = clamp(-heightAt(X, Z) / 12) * 255;
      }
    }
    this.depthData = data;
    this.depthW = W;
    const t = (this.depthTex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType));
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
  }

  // 바위·테트라포드 주변에도 포말이 생기도록 깊이 지도에 찍는다
  stampDepth(X, Z, rad, depth = 0) {
    const W = this.depthW;
    const x0 = Math.round(X + 80), z0 = Math.round(Z + 440);
    const R = Math.ceil(rad);
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = x0 + dx, z = z0 + dz;
        if (x < 0 || z < 0 || x >= W || z >= 600) continue;
        const k = Math.hypot(dx, dz) / rad;
        if (k > 1) continue;
        const v = clamp(depth / 12) * 255 + k * k * 40;
        const i = z * W + x;
        this.depthData[i] = Math.min(this.depthData[i], v);
      }
    }
  }

  buildWater() {
    const S = this.style;
    const geo = new THREE.PlaneGeometry(5000, 5000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(300, 0, -2400);
    const u = (this.waterU = {
      uTime: { value: 0 },
      uDepth: { value: this.depthTex },
      uBounds: { value: this.bounds },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color('#fff2d8') },
      uSkyTop: { value: new THREE.Color('#3f86d6') },
      uSkyHor: { value: new THREE.Color('#bcdcf2') },
      uShallow: { value: S.shallow.clone() },
      uDeep: { value: S.deep.clone() },
      uFogCol: { value: new THREE.Color('#cfe3f0') },
      uFogDen: { value: S.fog },
      uLight: { value: 1 },
      uChop: { value: this.line === 'west' ? 0.6 : 1 },
    });
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform float uTime, uFogDen, uLight, uChop;
        uniform sampler2D uDepth;
        uniform vec4 uBounds;
        uniform vec3 uSunDir, uSunCol, uSkyTop, uSkyHor, uShallow, uDeep, uFogCol;
        varying vec3 vW;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        vec2 wave(vec2 p, vec2 d, float f, float a, float s) {
          return d * (a * f * cos(dot(d, p) * f + uTime * s));
        }
        void main() {
          float dist = length(vW - cameraPosition);
          vec2 p = vW.xz;
          vec2 g = vec2(0.0);
          g += wave(p, normalize(vec2(0.12, 1.0)), 0.21, 0.16, 1.2);
          g += wave(p, normalize(vec2(-0.3, 1.0)), 0.37, 0.07, 1.7);
          g += wave(p, normalize(vec2(0.6, 0.8)), 0.73, 0.035, 2.3);
          g += wave(p, normalize(vec2(-0.8, 0.5)), 1.31, 0.018, 3.1);
          float e = 0.35;
          vec2 q = p * 1.6 + vec2(uTime * 0.35, uTime * 0.22);
          float n0 = noise(q), nx = noise(q + vec2(e, 0.0)), nz = noise(q + vec2(0.0, e));
          g += vec2(nx - n0, nz - n0) * 0.55;
          g *= uChop / (1.0 + dist * 0.012);
          vec3 n = normalize(vec3(-g.x, 1.0, -g.y));

          vec2 uv = (p - uBounds.xy) / uBounds.zw;
          float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          float depth = mix(12.0, texture2D(uDepth, clamp(uv, 0.0, 1.0)).r * 12.0, inside);

          // 포말: 물가에서 밀려왔다 빠지는 물 + 부서지며 다가오는 파도
          float swash = 0.03 + 0.12 * (0.5 + 0.5 * sin(uTime * 0.9));
          float edge = 1.0 - smoothstep(swash, swash + 0.1, depth);
          float fn = noise(p * 1.4 + uTime * 0.5) * 0.6 + noise(p * 4.0 - uTime * 0.3) * 0.4;
          float foam = edge * smoothstep(0.35, 0.7, fn + edge * 0.25);
          for (int i = 0; i < 2; i++) {
            float ph = fract(uTime / 7.0 + float(i) * 0.5);
            float front = mix(1.8, 0.1, ph);
            float w = 0.05 + ph * 0.1;
            float band = 1.0 - smoothstep(0.0, w, abs(depth - front));
            foam = max(foam, band * sin(ph * 3.14159) * smoothstep(0.35, 0.7, noise(p * vec2(0.7, 2.2) + float(i) * 7.0 + uTime * 0.1)) * 0.9);
          }
          foam *= 1.0 - smoothstep(60.0, 220.0, dist);

          vec3 V = normalize(cameraPosition - vW);
          vec3 R = reflect(-V, n);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          vec3 sky = mix(uSkyHor, uSkyTop, clamp(R.y * 1.8, 0.0, 1.0));
          float sh = 1.0 - smoothstep(0.0, 6.0, depth);
          vec3 base = mix(uDeep, uShallow, sh) * (0.25 + 0.75 * uLight);
          vec3 col = mix(base, sky, clamp(fres * 0.85, 0.0, 0.7));
          float spec = pow(max(dot(R, uSunDir), 0.0), 260.0) * 4.0 + pow(max(dot(R, uSunDir), 0.0), 30.0) * 0.12;
          col += uSunCol * spec * step(0.0, uSunDir.y);
          col = mix(col, vec3(0.94, 0.96, 0.97) * (0.35 + 0.65 * uLight), foam);
          float alpha = mix(0.3, 0.97, smoothstep(0.0, 2.2, depth));
          alpha = max(alpha, foam * 0.95);
          alpha *= smoothstep(0.0, 0.04, depth + 0.01);
          float fogF = 1.0 - exp(-uFogDen * uFogDen * dist * dist);
          col = mix(col, uFogCol, fogF);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const water = new THREE.Mesh(geo, m);
    water.renderOrder = 1;
    this.scene.add(water);
    this.water = water;
  }

  // ── 소나무(적송) ──
  buildTrees() {
    const r = rng(this.line === 'west' ? 21 : 11);
    const bark = new THREE.MeshStandardMaterial({ map: TX.barkTexture(), roughness: 1 });
    const crownM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const bend = (y, k) => k * Math.sin(y * 2.6) * y + k * 0.4 * y * y;
    const trunkGeos = [-0.9, 0.6, 1.3].map((k) => {
      const g = new THREE.CylinderGeometry(0.12, 0.26, 1, 7, 10);
      g.translate(0, 0.5, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + bend(p.getY(i), k) * 0.12);
      g.computeVertexNormals();
      g.userData.k = k;
      return g;
    });
    // 솔잎 덩어리: 울퉁불퉁한 납작한 구
    const blob = indexGeo(new THREE.IcosahedronGeometry(1, 2));
    {
      const p = blob.attributes.position;
      const cols = new Float32Array(p.count * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n = 0.75 + vnoise(v.x * 2.5 + 3, v.z * 2.5 + v.y * 2) * 0.5;
        v.multiplyScalar(n);
        v.y *= 0.5;
        p.setXYZ(i, v.x, v.y, v.z);
        const shade = 0.55 + 0.45 * smooth(-0.5, 0.5, v.y) + (Math.random() - 0.5) * 0.12;
        cols[i * 3] = 0.16 * shade; cols[i * 3 + 1] = 0.27 * shade; cols[i * 3 + 2] = 0.14 * shade;
      }
      blob.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      blob.computeVertexNormals();
    }
    const trees = [];
    const place = (x0, x1, z0, z1, gap, dens, hmin, hmax, skip) => {
      for (let x = x0; x < x1; x += gap) {
        for (let z = z0; z < z1; z += gap) {
          const X = x + (r() - 0.5) * gap, Z = z + (r() - 0.5) * gap;
          if (r() > dens(X, Z) || (skip && skip(X, Z))) continue;
          trees.push({ X, Z, H: hmin + r() * (hmax - hmin), v: Math.floor(r() * 3), rot: r() * Math.PI * 2 });
        }
      }
    };
    // 숲길 양옆의 울창한 솔숲
    place(-80, 175, -150, 80, 6.5, (X, Z) => (1 - smooth(105, 172, X)) * (Math.abs(Z) < 12 ? 0.95 : 0.8), 11, 19,
      (X, Z) => Math.abs(Z + Math.sin(X * 0.05) * 0.4) < 3.6 || shoreZ(X) + 6 > Z);
    // 해변 뒤 방풍림
    place(150, 340, 36, 90, 7.5, () => 0.55, 9, 15);
    const counts = [0, 0, 0];
    trees.forEach((t) => counts[t.v]++);
    const trunks = trunkGeos.map((g, i) => {
      const im = new THREE.InstancedMesh(g, bark, Math.max(1, counts[i]));
      im.castShadow = true;
      im.receiveShadow = true;
      im.count = 0;
      this.scene.add(im);
      return im;
    });
    const nBlobs = trees.length * 5 + 900;
    const crowns = new THREE.InstancedMesh(blob, crownM, nBlobs);
    crowns.castShadow = true;
    crowns.count = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
    const addBlob = (x, y, z, sx, sy, sz, rot) => {
      q.setFromAxisAngle(up, rot);
      m4.compose(p.set(x, y, z), q, s.set(sx, sy, sz));
      crowns.setMatrixAt(crowns.count, m4);
      tint.setHSL(0.27 + r() * 0.05, 0.35 + r() * 0.2, 0.42 + r() * 0.18);
      crowns.setColorAt(crowns.count, tint);
      crowns.count++;
    };
    for (const t of trees) {
      const y0 = heightAt(t.X, t.Z) - 0.2;
      const trunkH = t.H * 0.86;
      const sw = 0.8 + t.H / 30;
      q.setFromAxisAngle(up, t.rot);
      m4.compose(p.set(t.X, y0, t.Z), q, s.set(sw, trunkH, sw));
      const im = trunks[t.v];
      im.setMatrixAt(im.count++, m4);
      // 줄기 끝 위치(휜 만큼 이동)
      const k = trunkGeos[t.v].userData.k;
      const off = bend(1, k) * 0.12 * sw;
      const tx = t.X + Math.cos(t.rot) * off, tz = t.Z - Math.sin(t.rot) * off;
      const top = y0 + trunkH;
      const n = 3 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) {
        const a = r() * Math.PI * 2, d = j === 0 ? 0 : 1 + r() * 2.2;
        const sc = (j === 0 ? 3.2 : 2.2 + r() * 1.2) * (t.H / 16);
        addBlob(tx + Math.cos(a) * d, top - j * 0.7 - r() * 1.2 + 0.6, tz + Math.sin(a) * d, sc, sc * (0.9 + r() * 0.3), sc, r() * 6);
      }
    }
    // 언덕을 덮은 숲 (덩어리만)
    for (let i = 0; i < 900; i++) {
      const X = 318 + r() * 120, Z = 38 + r() * 110;
      const hh = hillH(X, Z);
      if (hh < 3 || crowns.count >= nBlobs) continue;
      const sc = 2 + r() * 1.6;
      addBlob(X, heightAt(X, Z) + sc * 0.3, Z, sc, sc * 0.8, sc, r() * 6);
    }
    trunks.forEach((im) => { im.instanceMatrix.needsUpdate = true; });
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    this.scene.add(crowns);

    // 숲길·모랫길 가장자리 풀 (갯그령)
    const blade = new THREE.ConeGeometry(0.035, 0.7, 3);
    blade.translate(0, 0.35, 0);
    const grass = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: '#8d9353', roughness: 1 }), 2600);
    grass.count = 0;
    for (let i = 0; i < 520; i++) {
      const X = 95 + r() * 90, side = r() < 0.5 ? -1 : 1, Z = side * (3 + r() * 9);
      if (Z < shoreZ(X) + 7) continue;
      const y = heightAt(X, Z);
      for (let b = 0; b < 5 && grass.count < 2600; b++) {
        q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.7, r() * 6, (r() - 0.5) * 0.7));
        const k = 0.6 + r() * 0.8;
        m4.compose(p.set(X + (r() - 0.5) * 0.4, y, Z + (r() - 0.5) * 0.4), q, s.set(1, k, 1));
        grass.setMatrixAt(grass.count++, m4);
      }
    }
    grass.instanceMatrix.needsUpdate = true;
    this.scene.add(grass);
  }

  // ── 갯바위: 동해는 홍합이 붙은 황갈색 화강암, 서해는 짙은 바위 ──
  buildRocks() {
    const S = this.style;
    const r = rng(this.line === 'west' ? 33 : 31);
    const geo = indexGeo(new THREE.IcosahedronGeometry(1, 4));
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    const cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 0.8 + vnoise(v.x * 1.8 + 7, v.z * 1.8 + v.y * 1.3) * 0.35 + vnoise(v.x * 5, v.y * 5) * 0.08;
      v.multiplyScalar(n);
      v.y = v.y * 0.62;
      p.setXYZ(i, v.x, v.y, v.z);
      const c = S.rock.clone().multiplyScalar(0.82 + vnoise(v.x * 6, v.z * 6) * 0.3);
      if (v.y < -0.05) c.lerp(S.mussel, smooth(-0.05, -0.3, v.y) * 0.85);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    const im = new THREE.InstancedMesh(geo, m, 260);
    im.castShadow = true;
    im.receiveShadow = true;
    im.count = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pp = new THREE.Vector3();
    const add = (X, Z, sc, yOff = 0) => {
      const y = Math.max(-0.6, heightAt(X, Z)) + sc * 0.12 + yOff;
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, r() * 6, (r() - 0.5) * 0.3));
      m4.compose(pp.set(X, y, Z), q, s.set(sc * (1 + r() * 0.6), sc * (0.7 + r() * 0.5), sc * (1 + r() * 0.5)));
      im.setMatrixAt(im.count++, m4);
      if (y - sc * 0.4 < 0.3) this.stampDepth(X, Z, sc * 1.4, 0.05);
    };
    for (let X = 316; X < 390; X += 2.2) {
      const sz = shoreZ(X);
      for (let k = 0; k < 3; k++) {
        const Z = sz - 6 + r() * 9;
        if (Z > -3.5) continue;
        add(X + (r() - 0.5) * 2, Z, 1.0 + r() * 2.2, -0.35);
      }
    }
    // 서해: 자갈 해변 곳곳의 바위 무더기
    if (this.line === 'west') {
      for (let i = 0; i < 26; i++) {
        const X = 190 + r() * 120, Z = shoreZ(X) - 2 + r() * 8;
        if (Z > -3.5) continue;
        add(X, Z, 0.5 + r() * 1.3, -0.25);
      }
    }
    // 바다 위 작은 바위섬
    [[250, -330, 9], [270, -345, 6], [520, -260, 7]].forEach(([X, Z, sc]) => {
      for (let i = 0; i < 4; i++) add(X + (r() - 0.5) * sc, Z + (r() - 0.5) * sc, sc * (0.5 + r() * 0.5), -0.2);
    });
    im.instanceMatrix.needsUpdate = true;
    this.scene.add(im);
    this.rockMesh = im;
  }

  // ── 해안 구조물: 동해=방호벽+도로, 서해=사석 축대+산책로 ──
  buildCoastStructures() {
    const r = rng(41);
    const scene = this.scene;
    if (this.line === 'east') {
      const wallT = TX.seawallTexture();
      wallT.repeat.set(40, 1);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(170, 1.3, 0.5), [
        new THREE.MeshStandardMaterial({ color: '#c9bea8' }), new THREE.MeshStandardMaterial({ color: '#c9bea8' }),
        new THREE.MeshStandardMaterial({ color: '#d4cab4' }), new THREE.MeshStandardMaterial({ color: '#d4cab4' }),
        new THREE.MeshStandardMaterial({ map: wallT, roughness: 1 }), new THREE.MeshStandardMaterial({ map: wallT, roughness: 1 }),
      ]);
      wall.position.set(250, heightAt(250, 26) + 0.4, 26);
      wall.castShadow = wall.receiveShadow = true;
      scene.add(wall);
      const roadT = TX.roadTexture();
      roadT.repeat.set(30, 1);
      const road = new THREE.Mesh(new THREE.PlaneGeometry(190, 8), new THREE.MeshStandardMaterial({ map: roadT, roughness: 0.95 }));
      road.rotation.x = -Math.PI / 2;
      road.position.set(250, heightAt(250, 30.5) + 0.12, 30.5);
      road.receiveShadow = true;
      scene.add(road);
      // 전봇대
      const poleM = new THREE.MeshStandardMaterial({ color: '#9b9a94' });
      for (let X = 165; X < 340; X += 36) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 9, 8), poleM);
        pole.position.set(X, heightAt(X, 35) + 4.5, 35);
        pole.castShadow = true;
        scene.add(pole);
      }
    } else {
      // 사석(깬 화강암 블록) 축대
      const blk = new THREE.DodecahedronGeometry(1, 0);
      const im = new THREE.InstancedMesh(blk, new THREE.MeshStandardMaterial({ color: '#c9c5bb', roughness: 0.95, flatShading: true }), 1400);
      im.castShadow = im.receiveShadow = true;
      im.count = 0;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), tint = new THREE.Color();
      for (let X = 168; X < 334; X += 1.5) {
        for (let Z = 16; Z < 27; Z += 1.4) {
          const k = (Z - 16) / 11;
          const y = heightAt(X, 16) + k * 4.2;
          q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
          const sc = 0.55 + r() * 0.45;
          m4.compose(p.set(X + (r() - 0.5), y, Z + (r() - 0.5) * 0.6), q, s.set(sc * 1.3, sc * 0.8, sc));
          im.setMatrixAt(im.count, m4);
          tint.setScalar(0.85 + r() * 0.2);
          im.setColorAt(im.count, tint);
          im.count++;
        }
      }
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
      const walk = new THREE.Mesh(new THREE.BoxGeometry(168, 0.6, 4), new THREE.MeshStandardMaterial({ map: TX.concreteTexture(false), color: '#d8d4ca' }));
      walk.position.set(251, heightAt(251, 16) + 4.4, 29);
      walk.receiveShadow = true;
      scene.add(walk);
    }
    // 모랫길 밧줄 울타리
    const postM = new THREE.MeshStandardMaterial({ color: '#7b5a3a', roughness: 1 });
    const pts = [];
    for (let X = 112; X < 178; X += 3.5) {
      const Z = -3.2, y = heightAt(X, Z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), postM);
      post.position.set(X, y + 0.45, Z);
      post.castShadow = true;
      scene.add(post);
      pts.push(new THREE.Vector3(X, y + 0.75, Z));
    }
    const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#d8c79e' }));
    scene.add(rope);
  }

  // ── 방파제: 테트라포드 + 빨간 등대 (서해는 노란 부잔교도) ──
  buildPier() {
    const scene = this.scene;
    const r = rng(51);
    const ct = TX.concreteTexture();
    ct.repeat.set(24, 2);
    const pier = new THREE.Mesh(new THREE.BoxGeometry(96, 6, 10.6), new THREE.MeshStandardMaterial({ map: ct, color: '#cfcdc6', roughness: 0.95 }));
    pier.position.set(PIER_X + 48, PIER_TOP - 3, -0.3);
    pier.castShadow = pier.receiveShadow = true;
    scene.add(pier);
    const para = new THREE.Mesh(new THREE.BoxGeometry(96, 0.9, 0.7), new THREE.MeshStandardMaterial({ map: ct, color: '#c4c2bb' }));
    para.position.set(PIER_X + 48, PIER_TOP + 0.45, -5.2);
    para.castShadow = true;
    scene.add(para);
    // 테트라포드 (다리 4개)
    const legs = [];
    const dirs = [[0, 1, 0], [0.943, -0.333, 0], [-0.471, -0.333, 0.816], [-0.471, -0.333, -0.816]];
    dirs.forEach((d) => {
      const g = new THREE.CylinderGeometry(0.35, 0.75, 1.6, 8);
      g.translate(0, 0.8, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d));
      g.applyQuaternion(q);
      legs.push(g.toNonIndexed());
    });
    const merged = mergeGeos(legs);
    const im = new THREE.InstancedMesh(merged, new THREE.MeshStandardMaterial({ color: '#bdbbb3', roughness: 0.95 }), 200);
    im.castShadow = im.receiveShadow = true;
    im.count = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let X = PIER_X - 2; X < PIER_X + 98; X += 2.2) {
      for (let row = 0; row < 3; row++) {
        const Z = -6.8 - row * 2.1 + (r() - 0.5);
        const y = -1.2 + row * -0.3 + r() * 1.4 - (row === 2 ? 0.6 : 0);
        q.setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
        m4.compose(p.set(X + (r() - 0.5), y, Z), q, s.setScalar(1));
        im.setMatrixAt(im.count++, m4);
        this.stampDepth(X, Z, 1.8, 0.05);
      }
    }
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
    // 빨간 등대
    const lh = new THREE.Group();
    lh.position.set(PIER_X + 92, PIER_TOP, -1);
    const red = new THREE.MeshStandardMaterial({ color: '#d0302b', roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: '#f1efe8', roughness: 0.7 });
    const add = (g, m, y) => { const o = new THREE.Mesh(g, m); o.position.y = y; o.castShadow = true; lh.add(o); return o; };
    add(new THREE.CylinderGeometry(1.6, 1.8, 0.8, 20), white, 0.4);
    add(new THREE.CylinderGeometry(0.95, 1.2, 9, 20), red, 5.2);
    add(new THREE.CylinderGeometry(1.5, 1.5, 0.2, 20), white, 9.8);
    this.lampM = new THREE.MeshStandardMaterial({ color: '#fff6c8', emissive: '#ffe58a', emissiveIntensity: 0.2, roughness: 0.2 });
    add(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 16), this.lampM, 10.5);
    add(new THREE.ConeGeometry(0.95, 1, 16), red, 11.6);
    scene.add(lh);
    this.lighthouse = lh;
    const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 120, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
    beam.geometry.translate(0, -60, 0);
    beam.geometry.rotateZ(Math.PI / 2);
    beam.position.set(0, 10.5, 0);
    lh.add(beam);
    this.beam = beam;
    // 정박한 배 / 노란 부잔교
    this.mooredBoat = makeBoat();
    this.mooredBoat.position.set(PIER_X + 40, 0, -17);
    this.mooredBoat.rotation.y = Math.PI / 2;
    scene.add(this.mooredBoat);
    if (this.line === 'west') {
      const dock = new THREE.Mesh(new THREE.BoxGeometry(40, 0.7, 5), new THREE.MeshStandardMaterial({ color: '#f2c318', roughness: 0.6 }));
      dock.position.set(PIER_X + 12, 0.2, -16);
      dock.castShadow = dock.receiveShadow = true;
      scene.add(dock);
      const crateM = ['#2f3b2f', '#3a7d4f', '#c9c3b5', '#2a4f8a'].map((c) => new THREE.MeshStandardMaterial({ color: c }));
      for (let i = 0; i < 40; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5 + r() * 0.5, 0.7), crateM[i % 4]);
        b.position.set(PIER_X - 6 + r() * 36, 0.8, -17.5 + r() * 3);
        b.castShadow = true;
        scene.add(b);
      }
      this.mooredBoat.position.set(PIER_X + 36, 0, -21);
    }
    // 배낚시용 배
    this.boat = makeBoat();
    this.boat.position.set(PIER_X + 50, 0, -62);
    this.boat.visible = false;
    scene.add(this.boat);
  }

  // ── 먼 풍경: 서해의 섬과 다리, 수평선의 산 ──
  buildDistant() {
    const scene = this.scene;
    const r = rng(61);
    const hill = (X, Z, rad, h, col, cliff) => {
      const g = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
      const p = g.attributes.position;
      const cols = new Float32Array(p.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = 0.85 + vnoise(x * 3 + X, z * 3) * 0.3;
        p.setXYZ(i, x * n, y * n, z * n);
        c.set(col).multiplyScalar(0.8 + vnoise(x * 8, z * 8) * 0.4);
        if (cliff && y < 0.35) c.lerp(new THREE.Color(cliff), smooth(0.35, 0.05, y));
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
      m.scale.set(rad, h, rad * 0.8);
      m.position.set(X, -2, Z);
      scene.add(m);
    };
    if (this.line === 'west') {
      hill(560, -190, 55, 46, '#30472b', '#8c7a63');
      hill(150, -520, 70, 30, '#3a4e33', '#8a7a66');
      hill(820, -700, 140, 40, '#5b6a5a');
      hill(-200, -900, 200, 35, '#6b7768');
      // 육지에서 섬으로 이어지는 다리
      const deckM = new THREE.MeshStandardMaterial({ color: '#d9d8d2', roughness: 0.8 });
      const A = new THREE.Vector3(505, 0, -2), B = new THREE.Vector3(548, 0, -170);
      const len = A.distanceTo(B), ang = Math.atan2(B.x - A.x, B.z - A.z);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, len), deckM);
      deck.position.set((A.x + B.x) / 2, 12, (A.z + B.z) / 2);
      deck.rotation.y = ang;
      deck.castShadow = true;
      scene.add(deck);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1, len), new THREE.MeshStandardMaterial({ color: '#eef0ee', wireframe: true }));
      rail.position.set(deck.position.x, 13, deck.position.z);
      rail.rotation.y = ang;
      scene.add(rail);
      for (let i = 1; i < 8; i++) {
        const k = i / 8;
        const x = lerp(A.x, B.x, k), z = lerp(A.z, B.z, k);
        const pier = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 12, 12), deckM);
        pier.position.set(x, 6, z);
        pier.castShadow = true;
        scene.add(pier);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, 4), deckM);
        foot.position.set(x, 0, z);
        scene.add(foot);
      }
    } else {
      hill(1100, -600, 180, 55, '#4f5f55');
      hill(-500, -800, 260, 70, '#59675e');
    }
  }

  // ── 하늘의 별·달·구름·갈매기 ──
  buildAmbient() {
    const scene = this.scene;
    const r = rng(71);
    const sp = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(r() * 0.95);
      sp[i * 3] = Math.sin(ph) * Math.cos(th) * 3000;
      sp[i * 3 + 1] = Math.cos(ph) * 3000;
      sp[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 3000;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.stars);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.softDot('245,242,225'), fog: false, transparent: true, depthWrite: false }));
    this.moon.scale.setScalar(160);
    scene.add(this.moon);
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.cloudTexture(i + 3), fog: false, transparent: true, depthWrite: false, opacity: 0.5, toneMapped: false }));
      c.scale.set(260 + r() * 260, 70 + r() * 40, 1);
      c.position.set(-600 + r() * 1800, 90 + r() * 120, -1500 - r() * 900);
      c.userData.v = 2 + r() * 3;
      scene.add(c);
      this.clouds.push(c);
    }
    // 갈매기
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.15, 0, 0, -0.15, 0.9, 0.1, 0]), 3));
    wing.computeVertexNormals();
    const wm = new THREE.MeshBasicMaterial({ color: '#f4f4f2', side: THREE.DoubleSide });
    this.gulls = [];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const l = new THREE.Mesh(wing, wm), rr = new THREE.Mesh(wing, wm);
      rr.scale.x = -1;
      g.add(l, rr);
      g.userData = { l, rr, cx: 180 + r() * 220, cz: -30 - r() * 40, rad: 15 + r() * 25, y: 12 + r() * 14, sp: 0.2 + r() * 0.2, ph: r() * 6 };
      g.scale.setScalar(0.9);
      scene.add(g);
      this.gulls.push(g);
    }
    // 발자국
    const fp = new THREE.CircleGeometry(0.075, 10);
    fp.rotateX(-Math.PI / 2);
    fp.scale(1, 1, 2.1);
    this.feet = new THREE.InstancedMesh(fp, new THREE.MeshStandardMaterial({ color: '#7d6849', transparent: true, opacity: 0.45, roughness: 1, depthWrite: false }), 120);
    this.feet.count = 120;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 120; i++) this.feet.setMatrixAt(i, zero);
    this.feet.userData.born = new Float32Array(120);
    scene.add(this.feet);
  }

  // ── 낚시 소품: 낚싯줄·루어·찌·받침대·물고기·물보라 ──
  buildFishingGear() {
    const scene = this.scene;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
    this.fline = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.85 }));
    this.fline.frustumCulled = false;
    scene.add(this.fline);
    this.lure = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 8), new THREE.MeshStandardMaterial({ color: '#c8d3dd', metalness: 0.8, roughness: 0.25 }));
    this.lure.rotation.z = Math.PI / 2;
    scene.add(this.lure);
    this.floatObj = new THREE.Group();
    const fb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshStandardMaterial({ color: '#ff3b2f', roughness: 0.4 }));
    fb.scale.y = 1.6;
    const fa = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), new THREE.MeshStandardMaterial({ color: '#ffd33d', emissive: '#ffb000', emissiveIntensity: 0.3 }));
    fa.position.y = 0.25;
    this.floatObj.add(fb, fa);
    scene.add(this.floatObj);
    // 원투 받침대 + 낚싯대 + 방울
    const st = (this.stand = new THREE.Group());
    const metal = new THREE.MeshStandardMaterial({ color: '#8a9098', metalness: 0.6, roughness: 0.4 });
    [-1, 1].forEach((s) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 6), metal);
      leg.position.set(s * 0.25, 0.6, 0);
      leg.rotation.z = -s * 0.35;
      st.add(leg);
    });
    const srod = new THREE.Group();
    srod.position.set(0, 1.05, 0.3);
    srod.rotation.x = -0.6;
    const sr = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.016, 4, 6), new THREE.MeshStandardMaterial({ color: '#15171a' }));
    sr.position.y = 1.6;
    sr.rotation.x = 0;
    srod.add(sr);
    this.standTip = new THREE.Object3D();
    this.standTip.position.y = 3.6;
    srod.add(this.standTip);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: '#f2c230', metalness: 0.7, roughness: 0.3 }));
    bell.position.y = 3.45;
    srod.add(bell);
    st.add(srod);
    this.standRod = srod;
    scene.add(st);
    // 물고기
    this.fish = makeFish();
    scene.add(this.fish);
    // 물보라 링
    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      ring.renderOrder = 2;
      scene.add(ring);
      this.rings.push(ring);
    }
  }

  // ── 시간대(해·달·하늘·조명) ──
  updateTime(hour) {
    if (Math.abs(hour - this.lastHour) < 0.02) return;
    this.lastHour = hour;
    const pal = skyAt(hour);
    const day = clamp((pal.light - 0.12) / 0.88);
    const p = (hour - 6) / 12;
    const elev = Math.sin(clamp(p, -0.15, 1.15) * Math.PI) * 62;
    const a = this.line === 'east' ? -Math.PI / 2 + p * Math.PI : Math.PI / 2 - p * Math.PI;
    const el = THREE.MathUtils.degToRad(elev);
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    this.sunDir = dir;
    const su = this.sky.material.uniforms;
    const S = this.style;
    const topC = new THREE.Color().setRGB(pal.top[0] / 255, pal.top[1] / 255, pal.top[2] / 255, THREE.SRGBColorSpace);
    const horC = new THREE.Color().setRGB(pal.bottom[0] / 255, pal.bottom[1] / 255, pal.bottom[2] / 255, THREE.SRGBColorSpace);
    // 한낮엔 사진처럼 맑고 진한 파란 하늘
    const noon = smooth(8, 30, elev);
    topC.lerp(S.zenith, noon);
    horC.lerp(S.horizon, noon);
    su.uTop.value.copy(topC);
    su.uHor.value.copy(horC);
    su.uSunDir.value.copy(dir);
    const low = 1 - smooth(4, 25, elev);
    const sunCol = new THREE.Color('#fff4e2').lerp(new THREE.Color('#ff9a52'), low);
    this.sun.color.copy(sunCol);
    this.sun.intensity = elev > 0 ? 3.2 * smooth(-1, 8, elev) : 0;
    // 밤: 달빛
    const night = elev < 0;
    if (night) {
      this.sun.intensity = 0.35;
      this.sun.color.set('#9fb6e6');
    }
    this.hemi.intensity = 0.25 + day * 0.95;
    this.hemi.color.set(night ? '#2a3a66' : '#cfe6ff');
    this.hemi.groundColor.set(night ? '#1d1a18' : '#b59d78');
    const fog = horC.clone();
    su.uSunCol.value.copy(sunCol);
    su.uNight.value = night ? 1 : 0;
    this.scene.fog.color.copy(fog);
    const u = this.waterU;
    u.uSunDir.value.copy(night ? new THREE.Vector3(-dir.x, 0.35, -dir.z).normalize() : dir);
    u.uSunCol.value.copy(night ? new THREE.Color('#8ea6d6') : sunCol);
    u.uSkyTop.value.copy(topC);
    u.uSkyHor.value.copy(fog);
    u.uFogCol.value.copy(fog);
    u.uLight.value = 0.2 + 0.8 * day;
    this.renderer.toneMappingExposure = night ? 1.1 : 0.85;
    this.stars.material.opacity = clamp((0.6 - pal.light) * 2);
    this.moon.visible = night;
    if (night) {
      const md = new THREE.Vector3(-0.25, 0.35, -1).normalize();
      this.moon.position.copy(md.multiplyScalar(2500));
    }
    this.clouds.forEach((c) => { c.material.opacity = (0.15 + 0.4 * day); c.material.color.copy(horC).lerp(new THREE.Color('#ffffff'), 0.6 * day); });
    this.lampM.emissiveIntensity = night ? 2.5 : 0.2;
    this.beam.visible = pal.light < 0.5;
    this.night = night;
  }

  // ── 깃발 ──
  syncFlags(flags) {
    if (flags === this.flagsRef) return;
    this.flagsRef = flags;
    const keep = new Set();
    for (const f of flags) {
      const id = f.report.id;
      keep.add(id);
      let fg = this.flagGroups.get(id);
      const key = `${id}|${f.isNew}|${f.report.species}|${f.report.size}`;
      if (fg && fg.userData.key !== key) { this.scene.remove(fg); this.flagGroups.delete(id); fg = null; }
      if (!fg) {
        fg = this.makeFlag(f);
        fg.userData.key = key;
        this.flagGroups.set(id, fg);
        this.scene.add(fg);
      }
      const X = f.x * M;
      const sz = shoreZ(X);
      const Z = lerp(sz + 3.2, -2.2, f.depth);
      fg.position.set(X, heightAt(X, Z), Z);
      fg.userData.plantedAt = f.plantedAt;
    }
    for (const [id, fg] of this.flagGroups) {
      if (!keep.has(id)) { this.scene.remove(fg); this.flagGroups.delete(id); }
    }
    this.flagHit = [];
    this.flagGroups.forEach((fg) => fg.traverse((o) => { if (o.isMesh || o.isSprite) this.flagHit.push(o); }));
  }

  makeFlag(f) {
    const r = f.report;
    const color = { lure: '#f26b1d', far: '#2aa198', float: '#3a6fd8' }[r.method] || '#d33';
    const g = new THREE.Group();
    g.userData.id = r.id;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.9, 8), new THREE.MeshStandardMaterial({ color: '#e8e8e8', metalness: 0.4, roughness: 0.4 }));
    pole.position.y = 1.45;
    pole.castShadow = true;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color }));
    ball.position.y = 2.93;
    const frameGeo = new THREE.PlaneGeometry(1.36, 0.98, 12, 6);
    frameGeo.translate(0.7, 0, 0);
    const clothGeo = new THREE.PlaneGeometry(1.24, 0.86, 12, 6);
    clothGeo.translate(0.7, 0, 0.004);
    const frame = new THREE.Mesh(frameGeo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }));
    const clothM = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, toneMapped: false });
    const cloth = new THREE.Mesh(clothGeo, clothM);
    if (r.photo) {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(r.photo, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        // 사진을 깃발 비율(1.44:1)에 맞게 가운데를 잘라 쓴다
        const ar = t.image.width / t.image.height, want = 1.24 / 0.86;
        if (ar > want) { t.repeat.set(want / ar, 1); t.offset.set((1 - want / ar) / 2, 0); }
        else { t.repeat.set(1, ar / want); t.offset.set(0, (1 - ar / want) / 2); }
        clothM.map = t;
        clothM.needsUpdate = true;
      });
    }
    frame.position.y = cloth.position.y = 2.42;
    frame.castShadow = true;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TX.labelTexture([`${r.species}${r.size ? ` ${r.size}cm` : ''}`, `📍 ${r.spot || ''}`], {
        border: color, badge: f.isNew ? { text: 'NEW', color: '#ff3b5c' } : r.sample ? { text: '예시', color: '#333' } : null,
      }),
      transparent: true, depthWrite: false, toneMapped: false, fog: false,
    }));
    label.scale.set(1.5, 0.49, 1);
    label.position.set(0.75, 1.55, 0.05);
    label.renderOrder = 3;
    g.add(pole, ball, frame, cloth, label);
    g.userData.cloth = [frame, cloth];
    g.userData.label = label;
    g.userData.phase = (hashStr(r.id) % 100) / 10;
    // 물결 애니메이션용 원래 좌표
    [frame, cloth].forEach((m) => { m.userData.base = m.geometry.attributes.position.array.slice(); });
    return g;
  }

  animateFlags(t, hoverId) {
    const now = performance.now();
    this.flagGroups.forEach((g, id) => {
      const ph = g.userData.phase;
      g.userData.cloth.forEach((m) => {
        const a = m.geometry.attributes.position;
        const b = m.userData.base;
        for (let i = 0; i < a.count; i++) {
          const x = b[i * 3];
          const k = Math.max(0, x - 0.05) / 1.4;
          a.array[i * 3 + 2] = b[i * 3 + 2] + Math.sin(t * 4.5 - x * 4 + ph) * 0.09 * k;
          a.array[i * 3 + 1] = b[i * 3 + 1] - k * k * 0.04;
        }
        a.needsUpdate = true;
      });
      const lab = g.userData.label;
      const hs = id === hoverId ? 1.12 : 1;
      lab.scale.set(1.5 * hs, 0.49 * hs, 1);
      const pa = g.userData.plantedAt;
      if (pa) {
        const k = clamp((now - pa) / 900);
        g.scale.set(1, 0.2 + 0.8 * (1 - (1 - k) ** 3), 1);
      } else g.scale.set(1, 1, 1);
    });
  }

  hitFlag(px, py) {
    if (!this.flagHit || !this.flagHit.length) return null;
    const rect = this.cv.getBoundingClientRect();
    const ndc = new THREE.Vector2(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.flagHit, false)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o && !o.userData.id) o = o.parent;
    return o ? o.userData.id : null;
  }

  addFootprint(wx, dir, foot) {
    if (!this.feet) return;
    const X = wx * M;
    if (X < 105 || X > 318) return;
    const Z = foot ? 0.12 : -0.12;
    const i = this.footIdx++ % 120;
    const m4 = new THREE.Matrix4().compose(
      new THREE.Vector3(X, heightAt(X, Z) + 0.02, Z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      new THREE.Vector3(1, 1, 1),
    );
    this.feet.setMatrixAt(i, m4);
    this.feet.instanceMatrix.needsUpdate = true;
  }

  // ── 매 프레임 ──
  render(st, t, dt = 0.016) {
    const line = st.line || 'east';
    if (!this.scene || this.line !== line) this.build(line);
    this.updateTime(this.hourOverride ?? 12);
    this.syncFlags(st.flags);
    this.waterU.uTime.value = t;

    // 플레이어 아바타
    const lk = JSON.stringify(st.look);
    if (lk !== this.playerKey) {
      this.playerKey = lk;
      if (this.player) this.scene.remove(this.player.group);
      this.player = new Avatar(st.look, st.look.name || '낚시꾼');
      this.scene.add(this.player.group);
      this.lamp = new THREE.PointLight('#ffd9a0', 0, 14, 1.6);
      this.lamp.position.set(0, 1.9, 0.3);
      this.player.group.add(this.lamp);
    }
    if (!this.npcs.length) {
      this.npcs = st.npcs.map((n) => {
        const a = new Avatar(n.look, n.name, { small: true });
        this.scene.add(a.group);
        return { a, n };
      });
    }
    const av = st.avatar;
    const fsh = st.fishing;
    const pose = fsh.pose(t);
    const fishingPose = pose.rod != null || pose.noRod;
    const X = av.x * M;
    const P = this.player;
    P.group.visible = !st.hideAvatar;
    this.boat.visible = !!st.onBoat;
    this.mooredBoat.visible = !st.onBoat;
    let ax = X, ay = groundY(X), az = 0;
    if (st.onBoat) {
      const b = this.boat;
      b.position.y = Math.sin(t * 1.3) * 0.15;
      b.rotation.z = Math.sin(t * 0.9) * 0.04;
      b.rotation.x = Math.sin(t * 1.1) * 0.025;
      ax = b.position.x; ay = 1.05 + b.position.y; az = b.position.z + 1.5;
    }
    P.pose({ walking: av.walking, phase: av.phase, rodE: pose.rod != null ? -pose.rod : 1.25, bend: pose.bend || 0, noRod: !!pose.noRod });
    P.group.position.set(ax, ay + P.bob, az);
    const yawTarget = fishingPose || st.onBoat ? Math.PI : av.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    P.group.rotation.y += angDiff(yawTarget, P.group.rotation.y) * Math.min(1, dt * 8);
    this.lamp.intensity = this.night ? 6 : 0;

    // NPC
    this.npcs.forEach(({ a, n }, i) => {
      const nx = n.x * M;
      const cyc = (t + n.seed) % 9;
      let e = 1.0;
      if (cyc < 0.6) e = 1.0 + 1.4 * (cyc / 0.6);
      else if (cyc < 0.9) e = 2.4 - 1.9 * ((cyc - 0.6) / 0.3);
      else e = 0.5 + Math.min(1, (cyc - 0.9) / 6) * 0.3;
      a.pose({ rodE: e });
      a.group.position.set(nx, groundY(nx), -1.5 - i * 0.5);
      a.group.rotation.y = Math.PI;
      a.group.visible = true;
      if (!a.line) {
        a.line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }));
        a.line.frustumCulled = false;
        this.scene.add(a.line);
      }
      if (cyc > 0.9) {
        a.group.updateMatrixWorld(true);
        const tip = a.tipWorld(new THREE.Vector3());
        const k = Math.min(1, (cyc - 0.9) / 0.7);
        const end = new THREE.Vector3(nx + 3, 0.02, shoreZ(nx) - 10 - 40 * k - n.seed * 2);
        if (nx > PIER_X) end.z = -14 - 40 * k;
        const mid = tip.clone().lerp(end, 0.5);
        mid.y += k < 1 ? 8 * (1 - k) : -1.5;
        a.line.geometry.setFromPoints(new THREE.QuadraticBezierCurve3(tip, mid, end).getPoints(20));
        a.line.visible = true;
      } else a.line.visible = false;
    });

    // 낚시 소품
    this.updateFishing(st, t, ax, ay, az, pose);

    // 카메라
    this.updateCamera(st, t, dt, ax, ay, az, fishingPose);

    // 그림자 영역을 아바타 주변으로
    const sd = this.sunDir || new THREE.Vector3(0, 1, 0);
    const sdir = this.night ? new THREE.Vector3(-0.3, 0.8, -0.5).normalize() : sd;
    this.sun.position.set(ax + sdir.x * 150, ay + Math.max(20, sdir.y * 150), az + sdir.z * 150);
    this.sun.target.position.set(ax, ay, az);

    // 주변 움직임
    this.animateFlags(t, st.hoverFlag);
    this.gulls.forEach((g) => {
      const u = g.userData;
      const a = t * u.sp + u.ph;
      g.position.set(u.cx + Math.cos(a) * u.rad, u.y + Math.sin(t * 0.7 + u.ph) * 1.5, u.cz + Math.sin(a) * u.rad);
      g.rotation.y = -a;
      const f = Math.sin(t * 7 + u.ph) * 0.6;
      u.l.rotation.z = f; u.rr.rotation.z = -f;
    });
    this.clouds.forEach((c) => { c.position.x += c.userData.v * dt; if (c.position.x > 1200) c.position.x = -600; });
    if (this.beam.visible) this.beam.rotation.y = t * 0.9;
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(st, t, dt, ax, ay, az, fishing) {
    const cam = this.camera;
    const X = st.avatar.x * M;
    const desiredPos = new THREE.Vector3(), desiredLook = new THREE.Vector3();
    const portrait = this.portrait ? 1.35 : 1;
    if (st.hideAvatar) {
      // 입장 화면: 해변을 천천히 훑는 풍경
      desiredPos.set(X - 4, 3.2, 9);
      desiredLook.set(X + 6, 1.2, -25);
      cam.position.lerp(desiredPos, Math.min(1, dt * 1.5));
      this.camLook.lerp(desiredLook, Math.min(1, dt * 1.5));
      cam.lookAt(this.camLook);
      return;
    }
    if (st.avatar.walking) this.camDir += (st.avatar.dir - this.camDir) * Math.min(1, dt * 1.6);
    const cd = this.camDir;
    if (st.onBoat) {
      desiredPos.set(ax - 2.5, ay + 2.6, az + 6.5 * portrait);
      desiredLook.set(ax + 0.5, 0.6, az - 25);
    } else {
      const sea = Math.max(smooth(150, 186, X), fishing ? 1 : 0);
      // 숲: 아바타 뒤에서 길을 따라 바라봄 / 바다: 바다를 정면으로
      const fp = new THREE.Vector3(ax - 6.2 * cd * portrait, ay + 2.3, az + 2.4);
      const fl = new THREE.Vector3(ax + 9 * cd, ay + 1.7, az - 0.6);
      const bp = new THREE.Vector3(ax - 2.8, ay + (fishing ? 2.9 : 2.2), az + (fishing ? 8 : 6.6) * portrait);
      const bl = new THREE.Vector3(ax + 1.6, ay + (fishing ? 0.3 : 1.1), az - (fishing ? 30 : 12));
      desiredPos.copy(fp).lerp(bp, sea);
      desiredLook.copy(fl).lerp(bl, sea);
      // 땅속으로 들어가지 않게
      desiredPos.y = Math.max(desiredPos.y, heightAt(desiredPos.x, desiredPos.z) + 1.2);
    }
    const k = Math.min(1, dt * 3);
    if (this.snapCam) { cam.position.copy(desiredPos); this.camLook.copy(desiredLook); this.snapCam = false; }
    cam.position.lerp(desiredPos, k);
    this.camLook.lerp(desiredLook, k);
    cam.lookAt(this.camLook);
  }

  updateFishing(st, t, ax, ay, az, pose) {
    const f = st.fishing;
    const s = f.state;
    const P = this.player;
    const hide = st.hideAvatar || s === 'idle' || s === 'charging';
    this.fline.visible = this.lure.visible = this.floatObj.visible = false;
    this.fish.visible = false;
    this.stand.visible = false;
    this.rings.forEach((r) => { r.material.opacity = 0; });
    if (hide) return;
    P.group.updateMatrixWorld(true);
    let tip = P.tipWorld(new THREE.Vector3());
    const boat = st.onBoat;
    const shore = boat ? az - 5 : shoreZ(ax) - 1.5;
    const reach = boat ? 38 : 88;
    const waterPos = (d) => new THREE.Vector3(ax + 1 + d * 6, 0.03, shore - Math.pow(d, 0.9) * reach);
    // 원투: 받침대
    if (f.mode === 'far' && (s === 'waiting' || s === 'bite')) {
      this.stand.visible = true;
      const sx = ax + 0.9, sz = az - 0.6;
      this.stand.position.set(sx, boat ? ay : groundY(sx * 1) , sz);
      this.stand.rotation.y = 0;
      this.standRod.rotation.z = s === 'bite' ? Math.sin(t * 40) * 0.02 : 0;
      this.stand.updateMatrixWorld(true);
      tip = this.standTip.getWorldPosition(new THREE.Vector3());
    }
    let lp;
    if (s === 'flying') {
      const end = waterPos(f.target);
      const k = f.k;
      lp = tip.clone().lerp(end, k);
      lp.y += Math.sin(k * Math.PI) * (6 + f.target * 16);
    } else if (s === 'result') {
      this.fish.visible = true;
      this.fish.position.set(tip.x, tip.y - 0.75, tip.z);
      this.fish.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.sin(t * 10) * 0.3);
      const k = (f.fish && f.fish.size) || 40;
      this.fish.scale.setScalar(k / 45);
      this.setLine(tip, new THREE.Vector3(tip.x, tip.y - 0.45, tip.z), 0);
      return;
    } else {
      lp = waterPos(f.d);
      if (s === 'fight') lp.x += Math.sin(t * 7) * (f.run > 0 ? 1.4 : 0.5);
    }
    const sag = s === 'fight' ? (1 - f.tension) * 2.5 : s === 'flying' ? 0 : 3.5;
    this.setLine(tip, lp, sag);
    if (s === 'flying') {
      this.lure.visible = true;
      this.lure.position.copy(lp);
    } else if (f.mode === 'float' && (s === 'waiting' || s === 'bite')) {
      this.floatObj.visible = true;
      const dip = s === 'bite' ? Math.min(1, (1.4 - f.window) * 3) : 0;
      this.floatObj.position.set(lp.x, Math.sin(t * 2.4) * 0.02 - dip * 0.35, lp.z);
    } else if (s === 'fight' && f.run > 0) {
      this.fish.visible = true;
      const j = Math.abs(Math.sin(t * 3.2));
      this.fish.position.set(lp.x, j * 0.9, lp.z);
      this.fish.rotation.set(0, t * 2, -0.6 + j);
      this.fish.scale.setScalar(((f.fish && f.fish.size) || 40) / 45);
    }
    // 물보라
    const rings = [...f.splashes.map((p) => ({ d: p.d, k: 1 - p.life / p.max }))];
    if (s === 'retrieve' || s === 'waiting' || s === 'fight') rings.push({ d: f.d, k: (t * 0.8) % 1, soft: true });
    rings.slice(0, 6).forEach((rr, i) => {
      const ring = this.rings[i];
      const wp = waterPos(rr.d);
      if (s === 'fight') wp.x = lp.x;
      ring.position.set(wp.x, 0.04, wp.z);
      const sc = (rr.soft ? 0.3 : 0.5) + rr.k * (rr.soft ? 0.8 : 2.4);
      ring.scale.set(sc, sc, sc);
      ring.material.opacity = (1 - rr.k) * (rr.soft ? 0.5 : 0.9);
    });
  }

  setLine(a, b, sag) {
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const pts = curve.getPoints(39);
    const arr = this.fline.geometry.attributes.position.array;
    pts.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
    this.fline.geometry.attributes.position.needsUpdate = true;
    this.fline.visible = true;
  }
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function mergeGeos(geos) {
  let n = 0;
  geos.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  geos.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

function makeBoat() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-1.3, -3.2); shape.lineTo(1.3, -3.2); shape.lineTo(1.35, 1.8); shape.quadraticCurveTo(0.9, 3.6, 0, 4.4);
  shape.quadraticCurveTo(-0.9, 3.6, -1.35, 1.8); shape.closePath();
  const hullG = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false });
  hullG.rotateX(-Math.PI / 2);
  hullG.translate(0, -0.4, 0);
  const hull = new THREE.Mesh(hullG, new THREE.MeshStandardMaterial({ color: '#f3f1ea', roughness: 0.6 }));
  hull.rotation.y = Math.PI;
  hull.castShadow = true;
  const stripeG = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false });
  stripeG.rotateX(-Math.PI / 2);
  stripeG.scale(1.02, 1, 1.01);
  const stripe = new THREE.Mesh(stripeG, new THREE.MeshStandardMaterial({ color: '#2b5fa6' }));
  stripe.rotation.y = Math.PI;
  stripe.position.y = 0.05;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 6), new THREE.MeshStandardMaterial({ color: '#b8b09e' }));
  deck.position.y = 0.78;
  deck.receiveShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 1.8), new THREE.MeshStandardMaterial({ color: '#f4f1ea' }));
  cabin.position.set(0, 1.55, 2.2);
  cabin.castShadow = true;
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: '#5f93b8', metalness: 0.5, roughness: 0.2 }));
  win.position.set(0, 1.85, 1.29);
  g.add(hull, stripe, deck, cabin, win);
  return g;
}

function makeFish() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: '#c9d4dc', metalness: 0.6, roughness: 0.3 }));
  body.scale.set(1, 0.32, 0.12);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: '#4b6676', metalness: 0.5, roughness: 0.35 }));
  back.scale.set(0.98, 0.18, 0.11);
  back.position.y = 0.035;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), new THREE.MeshStandardMaterial({ color: '#8fa2ae' }));
  tail.rotation.z = Math.PI / 2;
  tail.position.x = 0.26;
  tail.scale.z = 0.2;
  g.add(body, back, tail);
  return g;
}

// 겹친 꼭짓점을 합쳐 매끈한 법선을 얻는다
function indexGeo(g) {
  const pos = g.attributes.position;
  const map = new Map();
  const verts = [];
  const idx = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let j = map.get(key);
    if (j === undefined) { j = verts.length / 3; map.set(key, j); verts.push(x, y, z); }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

// 맑은 날 사진 같은 파란 하늘 돔 (해 주변 빛무리 포함)
function makeSkyDome() {
  const g = new THREE.SphereGeometry(4000, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color('#1d5fc4') },
      uHor: { value: new THREE.Color('#9fcbef') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color('#fff4e0') },
      uNight: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 uTop, uHor, uSunDir, uSunCol;
      uniform float uNight;
      varying vec3 vDir;
      void main() {
        float h = max(vDir.y, 0.0);
        vec3 col = mix(uHor, uTop, pow(smoothstep(0.0, 0.55, h), 0.7));
        col = mix(col, uHor * 0.9, smoothstep(0.0, -0.08, vDir.y));
        float sd = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        float day = 1.0 - uNight;
        col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 18.0) * 0.35 + pow(sd, 4.0) * 0.12 * (1.0 - h)) * day * step(-0.05, uSunDir.y);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
