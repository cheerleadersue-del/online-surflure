// 3D 바다 월드: 소나무 숲길 → 모랫길 → 해변 → 갯바위 → 방파제 (Three.js)
import * as THREE from '../vendor/three/three.module.min.js';
import { Avatar } from './avatar3d.js';
import { loadHDR } from './assets.js';
import { makeRealFish, flop, fishLook } from './fish3d.js';
import { Landmarks } from './landmarks.js';
import * as TX from './textures.js';
import { rng, smooth, lerp, clamp, skyAt, hashStr } from './scene.js';

export const M = 0.06; // 게임 좌표(px) → 미터
// 시화방조제 모드 (양쪽이 바다인 긴 방조제)
const MODE = { sihwa: false, river: false };
// 강(임진강·소양강): 가까운 강둑 물가 Z≈-8, 강폭 약 46m, 건너편 강둑과 산
const riverW = (X) => 44 + Math.sin(X * 0.013) * 6;
function farShore(X) { return shoreZ(X) - riverW(X); }
const DIKE = { x0: 150, x1: 690, half: 7, top: 3.2 };
// 해안선 구간(미터): 숲 → 모랫길 → 모래해변 → 몽돌해변 → 해안 데크길(절벽) → 갯바위 → 방파제
const LAY = { beach0: 174, peb0: 318, deck0: 390, deck1: 462, rock0: 462, pier0: 546, end: 640 };
const PIER_X = LAY.pier0, PIER_TOP = 2.6, PIER_LEN = 94;
const DECK_Y = 3.4, DECK_Z0 = -3.6, DECK_Z1 = 0.4;

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
  if (MODE.sihwa) return -DIKE.half - 1.2;
  if (MODE.river) return -8 + Math.sin(X * 0.021) * 2.2;
  // 소나무 숲길 없이 처음부터 해변
  let z = -13 + Math.sin(X * 0.035) * 2.5;
  // 몽돌 해변: 안쪽으로 둥글게 들어간 작은 만
  const cove = smooth(LAY.peb0 - 6, LAY.peb0 + 8, X) * (1 - smooth(LAY.deck0 - 12, LAY.deck0 + 2, X));
  z = lerp(z, -6 + 5 * Math.sin(((X - LAY.peb0) / (LAY.deck0 - LAY.peb0)) * Math.PI) - 4, cove);
  // 해안 데크길: 절벽이 바다에 바짝
  z = lerp(z, -7 + Math.sin(X * 0.09) * 1.2, smooth(LAY.deck0 - 4, LAY.deck0 + 6, X));
  z = lerp(z, -9 + Math.sin(X * 0.11) * 1.5, smooth(LAY.rock0 - 6, LAY.rock0 + 10, X));
  z = lerp(z, -5.6, smooth(PIER_X - 7, PIER_X + 1, X));
  return z;
}
function hillH(X, Z) {
  const mask = smooth(6, 26, Z - shoreZ(X)); // 언덕이 물가까지 번지지 않게
  if (mask <= 0) return 0;
  return mask * hillRaw(X, Z);
}
function hillRaw(X, Z) {
  return 42 * Math.exp(-(((X - 600) ** 2) / (2 * 40 * 40) + ((Z - 96) ** 2) / (2 * 32 * 32)))
    + 26 * Math.exp(-(((X - 425) ** 2) / (2 * 46 * 46) + ((Z - 70) ** 2) / (2 * 36 * 36)));
}
// 데크길 뒤편 절벽 높이
function cliffH(X, Z) {
  const k = smooth(LAY.deck0 - 2, LAY.deck0 + 10, X) * (1 - smooth(LAY.deck1 - 10, LAY.deck1 + 4, X));
  if (k <= 0) return 0;
  const dz = Z - shoreZ(X);
  return k * 8.5 * smooth(5.2, 9, dz) * (0.85 + fbm(X * 0.2, Z * 0.2) * 0.3);
}
function heightAt(X, Z) {
  if (MODE.river) {
    const sz = shoreZ(X), fz = farShore(X), n = fbm(X * 0.05, Z * 0.05);
    const mtn = (d) => Math.max(0, d - 26) * 0.32 * (0.6 + n * 0.8) + Math.max(0, d - 70) * 0.25;
    if (Z >= sz) { const d = Z - sz; return d * 0.07 + (n - 0.5) * 0.3 * smooth(4, 12, d) + mtn(d); }
    if (Z <= fz) { const d = fz - Z; return d * 0.1 + (n - 0.5) * 0.4 * smooth(4, 12, d) + mtn(d) * 1.3; }
    const k = (sz - Z) / (sz - fz);
    return -3.4 * Math.pow(Math.sin(k * Math.PI), 0.7) * (0.8 + n * 0.4) - 0.05;
  }
  if (MODE.sihwa) {
    // 방조제 둑(사석 경사) + 양쪽 바다/호수 바닥
    const d = Math.abs(Z) - DIKE.half;
    const inX = smooth(DIKE.x0 - 6, DIKE.x0, X) * (1 - smooth(DIKE.x1, DIKE.x1 + 6, X));
    const bank = d < 0 ? DIKE.top - 0.4 : Math.max(-5, DIKE.top - 0.4 - d * 0.9);
    const floor = -5 + fbm(X * 0.02, Z * 0.02) * 1.5;
    return lerp(floor, Math.max(bank, floor), inX);
  }
  const sz = shoreZ(X);
  const dz = Z - sz;
  const forest = 0;
  let h;
  if (dz < 0) h = dz > -25 ? dz * 0.07 : Math.max(-16, -1.75 + (dz + 25) * 0.15);
  else h = dz < 22 ? dz * 0.065 : 1.43 + Math.min(dz - 22, 80) * 0.018;
  if (dz > 0) {
    h += (fbm(X * 0.05, Z * 0.05) - 0.5) * 1.3 * forest;
    h += Math.max(0, fbm(X * 0.08, Z * 0.11) - 0.42) * 1.6 * (1 - forest) * smooth(14, 22, dz);
    if (Math.abs(Z) < 2.4) h -= 0.12 * forest * (1 - Math.abs(Z) / 2.4);
  }
  const rocky = rockyK(X);
  if (rocky > 0 && dz > -8 && dz < 10) h += rocky * fbm(X * 0.22, Z * 0.22) * 1.4 * (1 - Math.abs(dz - 1) / 11);
  h += hillH(X, Z) + cliffH(X, Z);
  return h;
}
function rockyK(X) {
  return Math.max(smooth(LAY.rock0 - 6, LAY.rock0 + 12, X) * (1 - smooth(PIER_X - 6, PIER_X + 2, X)),
    smooth(LAY.deck0, LAY.deck0 + 8, X) * (1 - smooth(LAY.deck1 - 8, LAY.deck1, X)) * 0.8);
}
export { heightAt };
export function deckY(X) {
  // 몽돌해변에서 올라가는 경사로 → 평평한 데크 → 갯바위로 내려가는 계단
  if (X < LAY.deck0 - 6 || X > LAY.deck1 + 4) return null;
  const up = smooth(LAY.deck0 - 6, LAY.deck0 + 6, X), down = 1 - smooth(LAY.deck1 - 8, LAY.deck1 + 4, X);
  return lerp(0.7, DECK_Y, Math.min(up, down));
}
export function groundY(X) {
  return X > PIER_X ? PIER_TOP : heightAt(X, 0);
}

const C = (hex) => new THREE.Color(hex);
const LINE_STYLE = {
  east: {
    dry: C('#e8dcc0'), wet: C('#b5a07a'), under: C('#c9b98f'), deepFloor: C('#6f7a62'),
    rock: C('#b6a184'), mussel: C('#26231f'), detail: 'sand',
    shallow: C('#2fb2b6'), deep: C('#0c4f8f'), fog: 0.0016,
    zenith: C('#1d5fc4'), horizon: C('#9fcbef'),
  },
  river: {
    dry: C('#c9c2b2'), wet: C('#8a8474'), under: C('#7a7a62'), deepFloor: C('#4a5a46'),
    rock: C('#8a8276'), mussel: C('#3a3a30'), detail: 'pebble',
    shallow: C('#6f9a7c'), deep: C('#2e5a4e'), fog: 0.0026,
    zenith: C('#2a66c0'), horizon: C('#c3d6e2'),
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
    // 궤도 카메라 (드래그 회전 · 휠/핀치 확대 · 하늘 시점)
    this.orbit = { yaw: -0.9, pitch: 0.32, dist: 7, tYaw: -0.9, tPitch: 0.32, tDist: 7, touched: 0 };
    this.catchCamUntil = 0;
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
    MODE.river = !!(this.point && (this.point.type === 'bridge' || this.point.type === 'river'));
    const S = (this.style = LINE_STYLE[MODE.river ? 'river' : line] || LINE_STYLE.east);
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

    this.colliders = [];
    this.rockTops = [];
    this.walkMeshes = [];
    MODE.sihwa = !!(this.point && this.point.type === 'dike');
    this.turbines = [];
    this.landmarks = null;
    this.buildTerrain();
    this.buildWater();
    this.buildTrees();
    if (MODE.sihwa) {
      this.buildSihwa();
    } else if (MODE.river) {
      this.buildRiver();
    } else {
      this.buildRocks();
      this.buildCoastStructures();
      this.buildPier();
      this.buildCoveAndDeck();
    }
    this.buildDistant();
    this.buildLandmark();
    this.buildAmbient();
    this.buildFishingGear();
    this.buildViewModel();
    this.buildBoils();
    this.buildSpray();
    scene.add(this.camera);
    this.depthTex.needsUpdate = true;

    // 아바타 & 낚시꾼들
    this.player = null;
    this.playerKey = '';
    this.npcs = [];
    this.flagGroups.clear();
    this.flagsRef = null;
    this.lastHour = -1;
    this.skyMode = '';
  }

  setAssets(a) {
    this.assets = a;
    Avatar.assets = a;
    if (this.scene) this.build(this.line);
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
    for (let x = -80; x <= 720; x += 1.6) xs.push(x);
    const zs = [];
    for (let z = -440; z < -80; z += 8) zs.push(z);
    for (let z = -80; z < -40; z += 3) zs.push(z);
    for (let z = -40; z < 30; z += 1) zs.push(z);
    for (let z = 30; z <= 160; z += 3) zs.push(z);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const splat = new Float32Array(nx * nz * 4);
    const A = this.assets;
    const west = this.line !== 'east';
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
        const f = 0;
        if (f > 0 && dz > 0) {
          const fc = forestC.clone().lerp(mossC, smooth(0.45, 0.7, n)).lerp(needleC, smooth(0.55, 0.8, fbm(X * 0.4, Z * 0.4)) * 0.6);
          const p = 1 - smooth(1.2, 2.6, Math.abs(Z + Math.sin(X * 0.05) * 0.4));
          fc.lerp(pathC, p * 0.9);
          c.lerp(fc, f);
        }
        // 갯바위 지대
        const rocky = rockyK(X);
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
        if (A) {
          // 실사 질감 섞기 비율: x=젖은 모래, y=자갈, z=숲 바닥/풀, w=바위
          const land = dz > 0 ? 1 : 0;
          const pathK = 1 - smooth(1.2, 2.6, Math.abs(Z + Math.sin(X * 0.05) * 0.4));
          const beach = 1 - f;
          let wet = (dz < 0 ? 1 : 1 - smooth(1.2, 5, dz)) * beach;
          let peb = west ? beach * smooth(-14, -6, dz) * (1 - smooth(22, 30, dz)) : 0;
          const coveK = smooth(LAY.peb0 - 4, LAY.peb0 + 6, X) * (1 - smooth(LAY.deck0 - 6, LAY.deck0 + 2, X));
          peb = Math.max(peb, coveK * smooth(-10, -3, dz) * (1 - smooth(18, 26, dz)));
          let fo = Math.max(f * land * (1 - pathK * 0.95), smooth(24, 34, dz) * beach);
          let rk = 0;
          if (rocky > 0 && dz > -6 && dz < 9) rk = rocky * smooth(0.25, 0.5, n + 0.2);
          const hh2 = hillH(X, Z);
          if (hh2 > 2) {
            const steep = Z < 75 ? smooth(4, 14, hh2) * (1 - smooth(18, 30, hh2)) * smooth(40, 70, 75 - Z + 40) : 0;
            fo = Math.max(fo, smooth(2, 6, hh2) * (1 - steep));
            rk = Math.max(rk, smooth(2, 6, hh2) * steep);
          }
          const ch = cliffH(X, Z);
          if (ch > 0.5) { rk = Math.max(rk, smooth(0.5, 3, ch) * (1 - smooth(7, 8.5, ch) * 0.7)); fo = Math.max(fo, smooth(7, 8.5, ch)); }
          if (MODE.river) {
            // 강: 양쪽 물가는 자갈, 그 뒤는 풀·숲
            const fz = farShore(X);
            const dn = Z - sz, df = fz - Z;
            const bank = Math.max(smooth(-3, 0, dn) * (1 - smooth(10, 16, dn)), smooth(-3, 0, df) * (1 - smooth(9, 14, df)));
            peb = bank; wet = (dn < 0 && df < 0) ? 1 : 0; rk = Math.max(rk, smooth(30, 60, Math.max(dn, df)) * 0.5);
            fo = Math.max(smooth(12, 20, dn), smooth(11, 18, df));
          }
          splat[i * 4] = wet; splat[i * 4 + 1] = peb; splat[i * 4 + 2] = fo; splat[i * 4 + 3] = rk;
          // 색 보정(틴트)
          c.setRGB(1, 1, 1).multiplyScalar(0.9 + n * 0.2);
          if (west) c.multiply(new THREE.Color(1.0, 0.86, 0.76));
          if (f > 0.3 && hh2 < 2) c.lerp(new THREE.Color(0.66, 0.5, 0.36), f * (1 - pathK * 0.7));
          if (hh2 > 2 || (dz > 24 && f < 1)) c.lerp(new THREE.Color(0.62, 0.8, 0.5), Math.max(smooth(2, 6, hh2), smooth(24, 34, dz) * (1 - f)) * 0.8);
          if (dz < 0) c.multiplyScalar(lerp(0.85, 0.45, smooth(0, 12, -dz)));
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
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = A ? this.terrainMaterial() : new THREE.MeshStandardMaterial({ vertexColors: true, map: TX.groundDetail(S.detail, 3), roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrain = mesh;

    // 물 깊이 지도 (물 셰이더의 얕은 물빛·포말용)
    this.bounds = new THREE.Vector4(-80, -440, 800, 600);
    const W = 800, H = 600;
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

  // 여러 장의 스캔 질감을 정점 비율로 섞는 지면 재질
  terrainMaterial() {
    const T = this.assets.tex;
    const west = this.line === 'west';
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, map: (west ? T.path : T.sand).map, normalMap: T.sand.normal, roughness: 1, metalness: 0,
    });
    m.normalScale.set(0.9, 0.9);
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        tWet: { value: T.wet.map }, tPeb: { value: T.pebble.map }, tFor: { value: T.forest.map }, tRock: { value: T.rock.map },
        tPebN: { value: T.pebble.normal }, tRockN: { value: T.rock.normal }, uWest: { value: west ? 1 : 0 },
      });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec2 vWxz;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSplat = splat;\nvWxz = position.xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D tWet, tPeb, tFor, tRock, tPebN, tRockN;
          uniform float uWest;
          varying vec4 vSplat;
          varying vec2 vWxz;
          vec4 tile(sampler2D t, vec2 p, float s) {
            vec2 a = p / s;
            vec2 b = mat2(0.8, -0.6, 0.6, 0.8) * p / (s * 3.7);
            return mix(texture2D(t, a), texture2D(t, b), 0.35);
          }`)
        .replace('#include <map_fragment>', `
          vec4 cBase = tile(map, vWxz, 3.5);
          vec4 cc = cBase;
          cc = mix(cc, tile(tPeb, vWxz, 1.6), vSplat.y);
          cc = mix(cc, tile(tFor, vWxz, 3.0), vSplat.z);
          cc = mix(cc, tile(tRock, vWxz, 4.0), vSplat.w);
          vec4 wetC = tile(tWet, vWxz, 4.0);
          cc = mix(cc, mix(wetC, cc * 0.62, uWest), vSplat.x * (1.0 - vSplat.w));
          diffuseColor *= cc;`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * mix(1.0, 0.42, vSplat.x * (1.0 - vSplat.w));');
    };
    return m;
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
    // 가까운 바다: 촘촘한 격자(실제로 출렁임) / 먼 바다: 구멍 뚫린 큰 판
    const NX0 = -500, NX1 = 1300, NZ0 = -1100, NZ1 = 60;
    const near = new THREE.PlaneGeometry(NX1 - NX0, NZ1 - NZ0, this.mobile ? 200 : 320, this.mobile ? 150 : 240);
    near.rotateX(-Math.PI / 2);
    near.translate((NX0 + NX1) / 2, 0, (NZ0 + NZ1) / 2);
    const shape = new THREE.Shape();
    shape.moveTo(-6000, -3000); shape.lineTo(6000, -3000); shape.lineTo(6000, 9000); shape.lineTo(-6000, 9000); shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(NX0, -NZ1); hole.lineTo(NX1, -NZ1); hole.lineTo(NX1, -NZ0); hole.lineTo(NX0, -NZ0); hole.closePath();
    shape.holes.push(hole);
    const far = new THREE.ShapeGeometry(shape);
    far.rotateX(-Math.PI / 2);
    const sky = this.assets && this.assets.hdr.day;
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
      uChop: { value: MODE.river ? 0.14 : this.line === 'west' ? 0.65 : 1 },
      uFoamK: { value: MODE.river ? 0.12 : 1 },
      uSky: { value: sky || null },
      uHasSky: { value: sky ? 1 : 0 },
      uSkyRot: { value: new THREE.Matrix3() },
      uSkyGain: { value: 1 },
    });
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        uniform float uTime, uChop;
        uniform sampler2D uDepth;
        uniform vec4 uBounds;
        varying vec3 vW;
        varying vec3 vN;
        varying float vCrest;
        // 게르스트너 파도 (방향, 파장, 높이, 속도)
        vec3 gerstner(vec2 p, vec2 d, float L, float A, float sp, inout vec3 T, inout vec3 B, inout float crest) {
          float k = 6.28318 / L;
          float f = k * (dot(d, p) - sp * uTime);
          float Q = 0.55;
          float c = cos(f), s = sin(f);
          T += vec3(-Q * d.x * d.x * A * k * s, d.x * A * k * c, -Q * d.x * d.y * A * k * s);
          B += vec3(-Q * d.x * d.y * A * k * s, d.y * A * k * c, -Q * d.y * d.y * A * k * s);
          crest += max(s, 0.0) * A;
          return vec3(Q * A * d.x * c, A * s, Q * A * d.y * c);
        }
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vec2 uv = (w.xz - uBounds.xy) / uBounds.zw;
          float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          float depth = mix(12.0, texture2D(uDepth, clamp(uv, 0.0, 1.0)).r * 12.0, inside);
          float dist = length(w.xyz - cameraPosition);
          // 얕은 곳·먼 곳은 파도를 줄인다
          float amp = uChop * smoothstep(0.05, 2.5, depth) * (1.0 - smoothstep(250.0, 700.0, dist));
          vec3 T = vec3(1.0, 0.0, 0.0), B = vec3(0.0, 0.0, 1.0);
          float crest = 0.0;
          vec3 off = vec3(0.0);
          off += gerstner(w.xz, normalize(vec2(0.10, 1.0)), 24.0, 0.32 * amp, 3.2, T, B, crest);
          off += gerstner(w.xz, normalize(vec2(-0.35, 1.0)), 13.0, 0.16 * amp, 2.4, T, B, crest);
          off += gerstner(w.xz, normalize(vec2(0.55, 0.8)), 7.5, 0.08 * amp, 1.8, T, B, crest);
          off += gerstner(w.xz, normalize(vec2(-0.8, 0.45)), 4.2, 0.04 * amp, 1.4, T, B, crest);
          w.xyz += off;
          vW = w.xyz;
          vN = normalize(cross(B, T));
          vCrest = crest / max(0.001, 0.6 * amp + 0.0001) * step(0.001, amp);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform float uTime, uFogDen, uLight, uChop, uHasSky, uSkyGain, uFoamK;
        uniform sampler2D uDepth, uSky;
        uniform mat3 uSkyRot;
        uniform vec4 uBounds;
        uniform vec3 uSunDir, uSunCol, uSkyTop, uSkyHor, uShallow, uDeep, uFogCol;
        varying vec3 vW;
        varying vec3 vN;
        varying float vCrest;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        vec2 eqUv(vec3 d) {
          return vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830988 + 0.5);
        }
        void main() {
          float dist = length(vW - cameraPosition);
          vec2 p = vW.xz;
          // 잔물결(세밀한 법선)
          float e = 0.3;
          vec2 g = vec2(0.0);
          for (int i = 0; i < 3; i++) {
            float sc = 1.3 + float(i) * 1.9;
            vec2 q = p * sc + vec2(uTime * (0.35 + float(i) * 0.12), uTime * (0.22 - float(i) * 0.05));
            float n0 = noise(q), nx = noise(q + vec2(e, 0.0)), nz = noise(q + vec2(0.0, e));
            g += vec2(nx - n0, nz - n0) * (0.5 / (1.0 + float(i)));
          }
          g *= 0.6 * uChop / (1.0 + dist * 0.015);
          vec3 n = normalize(vN + vec3(-g.x, 0.0, -g.y));
          // 멀리서는 잔물결을 지워 반짝이는 노이즈를 없앤다
          n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(40.0, 260.0, dist) * 0.85));

          vec2 uv = (p - uBounds.xy) / uBounds.zw;
          float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          float depth = mix(12.0, texture2D(uDepth, clamp(uv, 0.0, 1.0)).r * 12.0, inside);

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
          // 파도 마루의 흰 물결
          foam = max(foam, smoothstep(0.75, 1.0, vCrest) * smoothstep(0.55, 0.85, fn) * 0.5 * (1.0 - smoothstep(80.0, 300.0, dist)));
          foam *= (1.0 - smoothstep(60.0, 260.0, dist)) * uFoamK;

          vec3 V = normalize(cameraPosition - vW);
          vec3 Rr = reflect(-V, n);
          Rr.y = abs(Rr.y);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          vec3 sky = mix(uSkyHor, uSkyTop, clamp(Rr.y * 1.8, 0.0, 1.0));
          if (uHasSky > 0.5) {
            vec3 sk = texture2D(uSky, eqUv(uSkyRot * Rr)).rgb * uSkyGain;
            sky = mix(min(sk, vec3(3.0)), uFogCol, smoothstep(60.0, 600.0, dist) * 0.6);
          }
          float sh = 1.0 - smoothstep(0.0, 6.0, depth);
          vec3 base = mix(uDeep, uShallow, sh) * (0.25 + 0.75 * uLight);
          // 물속으로 비치는 빛(산란)
          base += uShallow * 0.25 * pow(max(dot(V, -uSunDir) * 0.5 + 0.5, 0.0), 3.0) * max(vCrest, 0.0) * uLight;
          vec3 col = mix(base, sky, clamp(fres * 0.95, 0.0, 0.85));
          float spec = pow(max(dot(Rr, uSunDir), 0.0), 320.0) * 5.0 + pow(max(dot(Rr, uSunDir), 0.0), 40.0) * 0.15;
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
    const water = new THREE.Mesh(near, m);
    water.renderOrder = 1;
    water.frustumCulled = false;
    const farMesh = new THREE.Mesh(far, m);
    farMesh.renderOrder = 1;
    this.scene.add(water, farMesh);
    this.water = water;
  }

  // ── 소나무(적송) ──
  buildTrees() {
    const r = rng(this.line === 'west' ? 21 : 11);
    const A = this.assets;
    let bark;
    if (A) {
      const B = A.tex.bark;
      [B.map, B.normal, B.arm].forEach((t) => t && t.repeat.set(1.5, 7));
      // 적송: 위로 갈수록 붉은 껍질
      bark = new THREE.MeshStandardMaterial({ map: B.map, normalMap: B.normal, roughnessMap: B.arm, aoMap: B.arm, color: '#f0a07a', roughness: 1 });
      bark.normalScale.set(1.4, 1.4);
    } else bark = new THREE.MeshStandardMaterial({ map: TX.barkTexture(), roughness: 1 });
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
    if (MODE.river) {
      // 양쪽 강둑의 숲
      place(40, PIER_X + PIER_LEN, 14, 80, 7, (X, Z) => (Z > shoreZ(X) + 16 ? 0.5 : 0), 9, 15);
      place(40, PIER_X + PIER_LEN, -170, -50, 7.5, (X, Z) => (Z < farShore(X) - 16 ? 0.6 : 0), 9, 16);
    } else if (!MODE.sihwa) {
      // 해변 뒤 방풍림
      place(40, LAY.deck0 - 30, 36, 90, 7.5, () => 0.55, 9, 15);
      // 절벽 위 소나무 (데크길 뒤)
      place(LAY.deck0 + 6, LAY.deck1 - 6, 3, 40, 6, (X, Z) => (cliffH(X, Z) > 6 ? 0.7 : 0), 7, 12);
    }
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
    const nBlobs = (trees.length * 5 + 900) * (A ? 4 : 1);
    let crownGeo = blob, crownMat = crownM;
    if (A) {
      crownGeo = needlePad();
      crownMat = new THREE.MeshStandardMaterial({
        map: A.tex.needles, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true, alphaToCoverage: true,
      });
    }
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, nBlobs);
    crowns.castShadow = true;
    crowns.count = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
    const addBlob = (x, y, z, sx, sy, sz, rot) => {
      q.setFromAxisAngle(up, rot);
      m4.compose(p.set(x, y, z), q, s.set(sx, sy, sz));
      crowns.setMatrixAt(crowns.count, m4);
      if (A) tint.setHSL(0.24 + r() * 0.05, 0.3 + r() * 0.2, 0.32 + r() * 0.16);
      else tint.setHSL(0.27 + r() * 0.05, 0.35 + r() * 0.2, 0.42 + r() * 0.18);
      crowns.setColorAt(crowns.count, tint);
      crowns.count++;
    };
    for (const t of trees) this.colliders.push({ X: t.X, Z: t.Z, r: 0.45 + t.H / 60 });
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
      if (A) {
        // 소나무 특유의 층층이 펼쳐진 솔잎 덩어리
        const n = 11 + Math.floor(r() * 6);
        for (let j = 0; j < n; j++) {
          const a = r() * Math.PI * 2, d = j < 3 ? r() * 1.0 : 1.0 + r() * 2.8;
          const sc = (2.4 + r() * 1.6) * (t.H / 16);
          addBlob(tx + Math.cos(a) * d, top - r() * 3.2 + 0.5, tz + Math.sin(a) * d, sc * 1.2, sc * 0.75, sc * 1.2, r() * 6);
        }
      } else {
        const n = 3 + Math.floor(r() * 3);
        for (let j = 0; j < n; j++) {
          const a = r() * Math.PI * 2, d = j === 0 ? 0 : 1 + r() * 2.2;
          const sc = (j === 0 ? 3.2 : 2.2 + r() * 1.2) * (t.H / 16);
          addBlob(tx + Math.cos(a) * d, top - j * 0.7 - r() * 1.2 + 0.6, tz + Math.sin(a) * d, sc, sc * (0.9 + r() * 0.3), sc, r() * 6);
        }
      }
    }
    // 언덕을 덮은 숲 (덩어리만)
    for (let i = 0; i < 900; i++) {
      const X = 360 + r() * 300, Z = 30 + r() * 120;
      const hh = hillH(X, Z);
      if (hh < 3 || crowns.count >= nBlobs) continue;
      const sc = 2 + r() * 1.6;
      if (A) addBlob(X, heightAt(X, Z) + sc * 0.5, Z, sc * 1.4, sc, sc * 1.4, r() * 6);
      else addBlob(X, heightAt(X, Z) + sc * 0.3, Z, sc, sc * 0.8, sc, r() * 6);
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
    for (let i = 0; i < (MODE.sihwa ? 0 : 520); i++) {
      const X = 60 + r() * 250, Z = shoreZ(X) + 16 + r() * 12;
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
      const base = this.assets ? (this.line === 'west' ? new THREE.Color(0.36, 0.3, 0.27) : new THREE.Color(0.86, 0.74, 0.6)) : S.rock.clone();
      const c = base.multiplyScalar(0.82 + vnoise(v.x * 6, v.z * 6) * 0.3);
      if (v.y < -0.05) c.lerp(S.mussel, smooth(-0.05, -0.3, v.y) * 0.85);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const A = this.assets;
    let m;
    if (A) {
      const T = A.tex.rock;
      [T.map, T.normal, T.arm].forEach((t) => t && t.repeat.set(2, 2));
      m = new THREE.MeshStandardMaterial({ vertexColors: true, map: T.map, normalMap: T.normal, roughnessMap: T.arm, aoMap: T.arm, roughness: 1 });
      m.normalScale.set(1.6, 1.6);
    } else m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
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
      this.rockTops.push({ X, Z, rad: Math.min(s.x, s.z) * 0.92, top: y + s.y * 0.62 });
      if (y - sc * 0.4 < 0.3) this.stampDepth(X, Z, sc * 1.4, 0.05);
    };
    for (let X = LAY.rock0 - 2; X < PIER_X; X += 2.2) {
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
    [[250, -330, 9], [270, -345, 6], [520, -260, 7], [700, -300, 8]].forEach(([X, Z, sc]) => {
      for (let i = 0; i < 4; i++) add(X + (r() - 0.5) * sc, Z + (r() - 0.5) * sc, sc * (0.5 + r() * 0.5), -0.2);
    });
    im.instanceMatrix.needsUpdate = true;
    this.scene.add(im);
    this.rockMesh = im;
    this.walkMeshes.push(im);

    // 실제 스캔한 해안 바위 (Poly Haven, CC0)
    if (A && A.models.rockCluster) {
      const src = A.models.rockCluster;
      const sm = src.material.clone();
      if (this.line === 'east') sm.color.set('#e8d2b0');
      const cl = new THREE.InstancedMesh(src.geometry, sm, 40);
      cl.castShadow = cl.receiveShadow = true;
      cl.count = 0;
      const put = (X, Z, sc, y) => {
        q.setFromEuler(new THREE.Euler(0, r() * 6.28, 0));
        m4.compose(pp.set(X, y, Z), q, s.set(sc, sc * (0.8 + r() * 0.5), sc));
        cl.setMatrixAt(cl.count++, m4);
        this.rockTops.push({ X, Z, rad: 3.3 * sc, top: y + 1.25 * s.y });
        this.stampDepth(X, Z, 4 * sc, 0.05);
      };
      for (let X = LAY.rock0 + 2; X < PIER_X - 6; X += 7 + r() * 5) put(X, shoreZ(X) - 2 - r() * 6, 0.7 + r() * 0.6, -0.5 - r() * 0.4);
      if (this.line === 'west') for (let i = 0; i < 8; i++) { const X = 195 + r() * 110; put(X, shoreZ(X) - 1 - r() * 5, 0.35 + r() * 0.4, -0.3); }
      cl.instanceMatrix.needsUpdate = true;
      this.scene.add(cl);
      this.walkMeshes.push(cl);
    }
    if (A && A.models.rockShelf) {
      const src = A.models.rockShelf;
      const sh = new THREE.Mesh(src.geometry, src.material.clone());
      if (this.line === 'east') sh.material.color.set('#d9c4a4');
      sh.scale.setScalar(0.55);
      sh.position.set(500, -0.6, shoreZ(500) - 8);
      sh.rotation.y = 0.4;
      sh.receiveShadow = true;
      this.scene.add(sh);
      for (let X = 484; X < 516; X += 3) this.stampDepth(X, shoreZ(500) - 8 + (r() - 0.5) * 10, 5, 0.1);
    }
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
      if (this.assets) {
        const T = this.assets.tex.asphalt;
        const a = T.map.clone(); a.repeat.set(24, 1); a.needsUpdate = true;
        const lines = roadT;
        road.material = new THREE.MeshStandardMaterial({ map: a, normalMap: T.normal, roughness: 0.9 });
        const paint = new THREE.Mesh(new THREE.PlaneGeometry(190, 8), new THREE.MeshBasicMaterial({ map: lines, transparent: true, opacity: 0.0 }));
        paint.visible = false;
      }
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
      const rkT = this.assets && this.assets.tex.rock;
      const im = new THREE.InstancedMesh(blk, new THREE.MeshStandardMaterial(rkT ? { map: rkT.map, normalMap: rkT.normal, color: '#e6e2da', roughness: 0.95, flatShading: true } : { color: '#c9c5bb', roughness: 0.95, flatShading: true }), 1400);
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
    if (MODE.sihwa) return;
    // 해변 밧줄 울타리
    const postM = new THREE.MeshStandardMaterial({ color: '#7b5a3a', roughness: 1 });
    const pts = [];
    for (let X = 60; X < 300; X += 3.5) {
      const Z = shoreZ(X) + 15, y = heightAt(X, Z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), postM);
      post.position.set(X, y + 0.45, Z);
      post.castShadow = true;
      scene.add(post);
      pts.push(new THREE.Vector3(X, y + 0.75, Z));
    }
    const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#d8c79e' }));
    scene.add(rope);
  }

  // ── 몽돌 해변 + 절벽 해안 데크길 + 촛대바위 + 오가는 배 ──
  buildCoveAndDeck() {
    const scene = this.scene;
    const r = rng(this.line === 'west' ? 91 : 81);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), tint = new THREE.Color();
    // 몽돌 (둥글고 매끈한 돌)
    const stone = new THREE.SphereGeometry(1, 10, 8);
    const T = this.assets && this.assets.tex.rock;
    const sm = new THREE.MeshStandardMaterial(T ? { map: T.map, normalMap: T.normal, roughness: 0.55 } : { roughness: 0.55 });
    const stones = new THREE.InstancedMesh(stone, sm, 1800);
    stones.receiveShadow = stones.castShadow = true;
    stones.count = 0;
    for (let i = 0; i < 1800; i++) {
      const X = LAY.peb0 + r() * (LAY.deck0 - LAY.peb0 - 4);
      const dz = -2 + r() * 18;
      const Z = shoreZ(X) + dz;
      const sc = 0.08 + r() * r() * 0.28;
      q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
      sv.set(sc * (1.2 + r() * 0.5), sc * 0.55, sc);
      m4.compose(pv.set(X, heightAt(X, Z) + sc * 0.25, Z), q, sv);
      stones.setMatrixAt(stones.count, m4);
      const g = 0.35 + r() * 0.5;
      tint.setRGB(g * (0.95 + r() * 0.15), g * (0.92 + r() * 0.1), g * (0.9 + r() * 0.12));
      stones.setColorAt(stones.count, tint);
      stones.count++;
    }
    stones.instanceMatrix.needsUpdate = true;
    scene.add(stones);
    // 떠밀려온 나무
    const logM = new THREE.MeshStandardMaterial({ color: '#a89580', roughness: 1, map: this.assets ? this.assets.tex.bark.map : null });
    for (let i = 0; i < 5; i++) {
      const X = LAY.peb0 + 8 + r() * 55, Z = shoreZ(X) + 4 + r() * 6;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.5 + r() * 2, 8), logM);
      log.rotation.set(Math.PI / 2, 0, r() * 3);
      log.position.set(X, heightAt(X, Z) + 0.15, Z);
      log.castShadow = true;
      scene.add(log);
    }

    // 해안 데크길: 나무 판, 기둥, 난간
    const wood = new THREE.MeshStandardMaterial({ color: '#9b7652', roughness: 0.85, map: TX.woodTexture() });
    const railM = new THREE.MeshStandardMaterial({ color: '#7d5c3e', roughness: 0.8 });
    const x0 = LAY.deck0 - 6, x1 = LAY.deck1 + 4;
    const seg = 2;
    for (let X = x0; X < x1; X += seg) {
      const y0 = deckY(X), y1 = deckY(X + seg);
      const board = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(seg, y1 - y0) + 0.05, 0.12, DECK_Z1 - DECK_Z0), wood);
      board.position.set(X + seg / 2, (y0 + y1) / 2 - 0.06, (DECK_Z0 + DECK_Z1) / 2);
      board.rotation.z = Math.atan2(y1 - y0, seg);
      board.receiveShadow = board.castShadow = true;
      scene.add(board);
      this.walkMeshes.push(board);
      if (Math.round(X) % 4 === 0) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 8, 6), railM);
        post.position.set(X, y0 - 4.1, DECK_Z0 + 0.2);
        scene.add(post);
        const rp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), railM);
        rp.position.set(X, y0 + 0.5, DECK_Z0 + 0.05);
        rp.castShadow = true;
        scene.add(rp);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(seg, y1 - y0) + 0.02, 0.07, 0.1), railM);
      rail.position.set(X + seg / 2, (y0 + y1) / 2 + 1.0, DECK_Z0 + 0.05);
      rail.rotation.z = board.rotation.z;
      scene.add(rail);
    }
    // 촛대바위 (바다에 솟은 바위기둥)
    const pillarGeo = indexGeo(new THREE.CylinderGeometry(1, 1.4, 1, 14, 10));
    {
      const p = pillarGeo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n = 0.75 + vnoise(v.x * 2 + v.y * 3, v.z * 2 + v.y * 5) * 0.5;
        p.setXYZ(i, v.x * n * (1 - (v.y + 0.5) * 0.35), v.y, v.z * n * (1 - (v.y + 0.5) * 0.35));
      }
      pillarGeo.computeVertexNormals();
    }
    const pm = this.rockMesh ? this.rockMesh.material.clone() : new THREE.MeshStandardMaterial({ color: '#8a7a68' });
    pm.vertexColors = false;
    pm.color.set(this.line === 'west' ? '#6a5a50' : '#b9a588');
    [[LAY.deck0 + 18, -22, 2.2, 15], [LAY.deck0 + 30, -30, 1.4, 9], [LAY.deck0 + 52, -19, 1.8, 12], [LAY.deck0 + 62, -36, 3, 7]].forEach(([X, Z, rad, h]) => {
      const pl = new THREE.Mesh(pillarGeo, pm);
      pl.scale.set(rad, h, rad);
      pl.position.set(X, h / 2 - 2, Z);
      pl.rotation.y = r() * 6;
      pl.castShadow = pl.receiveShadow = true;
      scene.add(pl);
      this.stampDepth(X, Z, rad * 2.2, 0.05);
      // 꼭대기의 작은 소나무
      if (h > 10) {
        const crown = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.9, 10, 8), new THREE.MeshStandardMaterial({ color: '#2f4a2a', roughness: 1 }));
        crown.scale.y = 0.55;
        crown.position.set(X, h - 1.6, Z);
        scene.add(crown);
      }
    });
    // 수평선을 오가는 배와 부표
    this.sailing = [];
    for (let i = 0; i < 4; i++) {
      const b = makeBoat();
      b.scale.setScalar(0.8 + r() * 0.6);
      b.userData = { z: -140 - r() * 260, sp: (r() < 0.5 ? -1 : 1) * (2 + r() * 3), x0: r() * 800 };
      b.rotation.y = b.userData.sp > 0 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(b);
      this.sailing.push(b);
    }
    const buoyM = new THREE.MeshStandardMaterial({ color: '#ff6a1a', roughness: 0.5 });
    this.buoys = [];
    for (let i = 0; i < 10; i++) {
      const bu = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), buoyM);
      bu.userData = { X: 200 + r() * 420, Z: -45 - r() * 70, ph: r() * 6 };
      scene.add(bu);
      this.buoys.push(bu);
    }
  }

  // ── 입장 포인트 ──
  setPoint(point, line) {
    this.point = point;
    this.vmStyleWanted = point && point.type === 'beach' ? 'beach' : 'rock';
    this.line = null; // 다음 render에서 다시 짓는다
    this.pendingLine = line;
    this.build(line);
  }

  // 포인트별 처음 서는 곳(px)과 카메라 방향
  spawn() {
    const t = this.point ? this.point.type : 'beach';
    let sp;
    if (t === 'dike') sp = { x: 400 / M, z: -4.5, yaw: -1.25 };
    else if (t === 'bridge' || t === 'river') sp = { x: 262 / M, z: null, yaw: -1.2 };
    else if (t === 'beach') sp = { x: 215 / M, z: null, yaw: -1.1 };
    else sp = { x: (PIER_X + 22) / M, z: -1.5, yaw: -1.0 };
    // 상징 배경이 화면에 들어오게 카메라를 돌린다 (바다 쪽으로 살짝)
    const L = this.landmarkPos;
    if (L) {
      const ax = sp.x * M, az = sp.z ?? shoreZ(ax) + 4;
      const yl = Math.atan2(-(L.x - ax), -(L.z - az));
      // 상징물과 바다가 함께 보이도록 바다 쪽(-Z)을 향해 0.6rad 돌린다
      sp.yaw = Math.cos(yl + 0.6) > Math.cos(yl - 0.6) ? yl + 0.6 : yl - 0.6;
    }
    return sp;
  }

  // ── 시화방조제: 곧게 뻗은 둑길, 양쪽 바다, 달 전망대, 조력발전소 수문 ──
  buildSihwa() {
    const scene = this.scene;
    const r = rng(77);
    const len = DIKE.x1 - DIKE.x0, cx = (DIKE.x0 + DIKE.x1) / 2;
    const conc = this.assets ? this.assets.tex.concrete : null;
    const roadM = new THREE.MeshStandardMaterial({ color: '#8d8f91', roughness: 0.9, map: this.assets ? this.assets.tex.asphalt.map : null });
    const edgeM = new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.95, map: conc ? conc.map : null });
    // 둑 몸체 + 도로 + 보도
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, 6, DIKE.half * 2), edgeM);
    body.position.set(cx, DIKE.top - 3, 0);
    body.receiveShadow = true;
    scene.add(body);
    const road = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 7), roadM);
    road.position.set(cx, DIKE.top + 0.02, 1.5);
    road.receiveShadow = true;
    scene.add(road);
    // 차선
    const laneM = new THREE.MeshBasicMaterial({ color: '#f2c230' });
    const lane = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.15), laneM);
    lane.position.set(cx, DIKE.top + 0.08, 1.5);
    scene.add(lane);
    // 바다 쪽 난간 + 낚시하는 보도
    const railM = new THREE.MeshStandardMaterial({ color: '#2f6fb0', roughness: 0.5, metalness: 0.4 });
    [-DIKE.half + 0.3, DIKE.half - 0.3].forEach((z) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.07), railM);
      rail.position.set(cx, DIKE.top + 1.0, z);
      scene.add(rail);
      for (let X = DIKE.x0; X < DIKE.x1; X += 3) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), railM);
        post.position.set(X, DIKE.top + 0.5, z);
        scene.add(post);
      }
    });
    this.walkMeshes.push(body, road);
    // 양쪽 테트라포드
    const legs = [];
    const dirs = [[0, 1, 0], [0.943, -0.333, 0], [-0.471, -0.333, 0.816], [-0.471, -0.333, -0.816]];
    dirs.forEach((d) => {
      const g = new THREE.CylinderGeometry(0.35, 0.75, 1.6, 8);
      g.translate(0, 0.8, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d)));
      legs.push(g.toNonIndexed());
    });
    const tetra = new THREE.InstancedMesh(mergeGeos(legs), new THREE.MeshStandardMaterial({ color: '#c3c1b9', roughness: 0.95 }), 1200);
    tetra.castShadow = tetra.receiveShadow = true;
    tetra.count = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    for (let X = DIKE.x0; X < DIKE.x1; X += 2.3) {
      for (const side of [-1, 1]) {
        for (let row = 0; row < 2; row++) {
          const Z = side * (DIKE.half + 1.4 + row * 2.2) + (r() - 0.5);
          q.setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
          m4.compose(pv.set(X + (r() - 0.5), 0.6 - row * 1.1 + r() * 0.6, Z), q, sv.setScalar(1));
          tetra.setMatrixAt(tetra.count++, m4);
          this.stampDepth(X, Z, 2.2, 0.05);
        }
      }
    }
    tetra.instanceMatrix.needsUpdate = true;
    scene.add(tetra);
    // 달 전망대: 높은 기둥 + 둥근 달 모양 전망대
    const tower = new THREE.Group();
    tower.position.set(470, DIKE.top, 0);
    const white = new THREE.MeshStandardMaterial({ color: '#f1f2f4', roughness: 0.35, metalness: 0.2 });
    const glass = new THREE.MeshStandardMaterial({ color: '#7fb7e0', roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.85 });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 52, 24), white);
    col.position.y = 26;
    const moon = new THREE.Mesh(new THREE.TorusGeometry(9, 2.2, 20, 60, Math.PI * 1.55), glass);
    moon.position.y = 60;
    moon.rotation.z = -0.4;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 3, 32), white);
    disc.position.y = 52;
    tower.add(col, moon, disc);
    tower.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(tower);
    // 조력발전소 수문 (둑을 가로지르는 회색 건물 띠)
    const gateM = new THREE.MeshStandardMaterial({ color: '#b9bcc0', roughness: 0.8 });
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 4), gateM);
      g.position.set(560 + i * 7, DIKE.top + 1, DIKE.half + 6);
      g.castShadow = true;
      scene.add(g);
    }
    // 풍력발전기 (먼 호수 쪽)
    const bladeM = new THREE.MeshStandardMaterial({ color: '#f4f4f4' });
    this.turbines = [];
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Group();
      t.position.set(250 + i * 70, 0, 160 + (i % 2) * 40);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 50, 12), bladeM);
      pole.position.y = 25;
      const hub = new THREE.Group();
      hub.position.y = 50;
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 0.3), bladeM);
        b.position.y = 11;
        const arm = new THREE.Group();
        arm.rotation.z = (k / 3) * Math.PI * 2;
        arm.add(b);
        hub.add(arm);
      }
      t.add(pole, hub);
      scene.add(t);
      this.turbines.push(hub);
    }
    // 배·부표·등대 대체물
    this.boat = makeBoat();
    this.boat.position.set(420, 0, -55);
    this.boat.visible = false;
    scene.add(this.boat);
    this.mooredBoat = makeBoat();
    this.mooredBoat.position.set(600, 0, -24);
    this.mooredBoat.rotation.y = Math.PI / 2;
    scene.add(this.mooredBoat);
    this.lampM = new THREE.MeshStandardMaterial();
    this.beam = new THREE.Object3D();
    this.sailing = [];
    for (let i = 0; i < 3; i++) {
      const b = makeBoat();
      b.userData = { z: -160 - r() * 200, sp: (r() < 0.5 ? -1 : 1) * (2 + r() * 3), x0: r() * 800 };
      b.rotation.y = b.userData.sp > 0 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(b);
      this.sailing.push(b);
    }
    this.buoys = [];
  }

  // ── 강변: 자갈밭의 바위, 물속 바위, 작은 보트 ──
  buildRiver() {
    const scene = this.scene;
    const r = rng(this.line === 'bass' ? 12 : 21);
    const T = this.assets && this.assets.tex.rock;
    const geo = indexGeo(new THREE.IcosahedronGeometry(1, 3));
    const p = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 0.8 + vnoise(v.x * 1.8 + 3, v.z * 1.8 + v.y) * 0.35;
      p.setXYZ(i, v.x * n, v.y * n * 0.6, v.z * n);
    }
    geo.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial(T ? { map: T.map, normalMap: T.normal, color: '#b9b2a6', roughness: 0.95 } : { color: '#8a8276' });
    const im = new THREE.InstancedMesh(geo, m, 160);
    im.castShadow = im.receiveShadow = true;
    im.count = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    for (let i = 0; i < 160; i++) {
      const X = 50 + r() * (PIER_X + PIER_LEN - 60);
      const near = r() < 0.65;
      const Z = near ? shoreZ(X) - 6 + r() * 12 : farShore(X) - 4 + r() * 9;
      const sc = 0.5 + r() * r() * 2.2;
      const y = heightAt(X, Z) + sc * 0.15;
      q.setFromEuler(new THREE.Euler(0, r() * 6, 0));
      m4.compose(pv.set(X, y, Z), q, sv.set(sc * (1 + r() * 0.5), sc, sc * (1 + r() * 0.4)));
      im.setMatrixAt(im.count++, m4);
      if (near) this.rockTops.push({ X, Z, rad: Math.min(sv.x, sv.z) * 0.9, top: y + sc * 0.6 });
      if (y < 0.4) this.stampDepth(X, Z, sc * 1.3, 0.05);
    }
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
    this.walkMeshes.push(im);
    this.rockMesh = im;
    this.boat = makeBoat();
    this.boat.scale.setScalar(0.7);
    this.boat.position.set(330, 0, shoreZ(330) - 20);
    this.boat.visible = false;
    scene.add(this.boat);
    this.mooredBoat = makeBoat();
    this.mooredBoat.scale.setScalar(0.6);
    this.mooredBoat.position.set(260, 0, shoreZ(260) - 3);
    this.mooredBoat.rotation.y = Math.PI / 2;
    scene.add(this.mooredBoat);
    this.lampM = new THREE.MeshStandardMaterial();
    this.beam = new THREE.Object3D();
    this.sailing = [];
    this.buoys = [];
  }

  // ── 포인트를 상징하는 배경 ──
  buildLandmark() {
    const pt = this.point;
    // 포인트 이름 표지판
    const sp = this.spawn();
    const sx = sp.x * M + 6, sz = MODE.sihwa ? -DIKE.half + 0.6 : (sp.z ?? shoreZ(sp.x * M) + 4) + 3.5;
    if (pt) {
      const sign = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.9 });
      [-0.8, 0.8].forEach((x) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 8), wood); p.position.set(x, 1.2, 0); p.castShadow = true; sign.add(p); });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), new THREE.MeshBasicMaterial({ map: TX.labelTexture([pt.name, pt.desc.slice(0, 18)], { border: '#1f3b73', w: 768, h: 256 }), toneMapped: false, side: THREE.DoubleSide }));
      board.position.y = 2.1;
      sign.add(board);
      const ground = this.surfaceAt(sx, sz).y;
      sign.position.set(sx, ground, sz);
      sign.rotation.y = 0.5;
      this.scene.add(sign);
    }
    if (MODE.sihwa) this.landmarkPos = { x: 470, z: 30 };
    if (!pt || MODE.sihwa) return;
    const L = new Landmarks(this.scene, (X, Z) => heightAt(X, Z), this.assets);
    if (MODE.river) {
      // 강을 가로지르는 다리 (포인트마다 모양이 다르다)
      const X = 336, z0 = shoreZ(X) + 16, z1 = farShore(X) - 16;
      const red = this.line === 'sogari';
      switch (pt.mark) {
        case 'riverSkywalk': L.riverSkywalk(X - 6, shoreZ(X), 28); L.bridge('girder', X + 110, shoreZ(X + 110) + 16, farShore(X + 110) - 16); break;
        case 'maiden': L.maiden(X - 26, shoreZ(X - 26) + 5); L.bridge('arch', X + 40, shoreZ(X + 40) + 16, farShore(X + 40) - 16, '#f4f4f0'); break;
        case 'dam': L.dam(X + 40, shoreZ(X + 40) + 12, farShore(X + 40) - 12); break;
        default: L.bridge(pt.mark, X, z0, z1, red ? '#c8362d' : '#f4f4f0');
      }
      this.landmarkPos = { x: pt.mark === 'dam' ? X + 40 : X, z: (z0 + z1) / 2 };
      this.landmarks = L;
      return;
    }
    this.landmarkPos = null;
    const bx = 262, bz = shoreZ(262) + 34; // 해변 포인트: 해변 오른쪽 뒤
    const px = PIER_X + 40, pz = 24; // 방파제·항구: 방파제 뒤 육지
    switch (pt.mark) {
      case 'villa': L.villa(bx, bz + 6); this.landmarkPos = { x: bx, z: bz }; break;
      case 'wheel': L.wheel(bx - 8, bz - 4); break;
      case 'statue': L.statue(bx, bz + 14); break;
      case 'pavilion': L.pavilion(bx, bz + 10, 1.4); break;
      case 'cabins': L.cabins(bx - 30, bz - 6); break;
      case 'resort': L.resort(bx - 10, bz + 4); break;
      case 'rockPavilion': L.pavilion(PIER_X + 70, -14, 1.1, true); break;
      case 'twinLights': L.lighthouse(PIER_X + 60, -22, '#f4f2ec'); break;
      case 'cafes': L.cafes(PIER_X - 30, 18); break;
      case 'cliffLight': L.cliff(PIER_X + 20, 30); break;
      case 'market': L.boats(PIER_X + 10, -16, 10); L.market(px - 30, pz); break;
      case 'boats': L.boats(PIER_X + 10, -16, 8, true); L.lighthouse(PIER_X + 52, -24, '#f4f2ec', true); break;
      case 'village': L.boats(PIER_X + 20, -16, 5); L.village(PIER_X + 30, 40); break;
      case 'racks': L.boats(PIER_X + 15, -16, 6); L.racks(PIER_X - 10, 16); break;
      case 'skywalk': L.boats(PIER_X + 15, -16, 4); L.skywalk(PIER_X - 40, -6); break;
      default:
    }
    if (!this.landmarkPos) {
      const P = {
        wheel: [bx - 8, bz - 4], statue: [bx, bz + 14], pavilion: [bx, bz + 10], cabins: [bx - 6, bz], resort: [bx, bz + 4],
        rockPavilion: [PIER_X + 70, -14], twinLights: [PIER_X + 60, -22], cafes: [PIER_X, 18], cliffLight: [PIER_X + 20, 30],
        market: [px - 30, pz], boats: [PIER_X + 40, -24], village: [PIER_X + 30, 50], racks: [PIER_X, 20], skywalk: [PIER_X - 40, -40],
      }[pt.mark];
      if (P) this.landmarkPos = { x: P[0], z: P[1] };
    }
    this.landmarks = L;
  }

  // ── 방파제: 테트라포드 + 빨간 등대 (서해는 노란 부잔교도) ──
  buildPier() {
    const scene = this.scene;
    const r = rng(51);
    let ct = TX.concreteTexture();
    ct.repeat.set(24, 2);
    let pierM = new THREE.MeshStandardMaterial({ map: ct, color: '#cfcdc6', roughness: 0.95 });
    if (this.assets) {
      const T = this.assets.tex.concrete;
      const cl = (t, sx, sy) => { const c = t.clone(); c.repeat.set(sx, sy); c.needsUpdate = true; return c; };
      pierM = new THREE.MeshStandardMaterial({ map: cl(T.map, 24, 3), normalMap: cl(T.normal, 24, 3), roughnessMap: cl(T.arm, 24, 3), color: '#f2efe8', roughness: 1 });
      ct = pierM.map;
    }
    const pier = new THREE.Mesh(new THREE.BoxGeometry(PIER_LEN, 6, 10.6), pierM);
    pier.position.set(PIER_X + PIER_LEN / 2, PIER_TOP - 3, -0.3);
    pier.castShadow = pier.receiveShadow = true;
    this.walkMeshes.push(pier);
    scene.add(pier);
    const para = new THREE.Mesh(new THREE.BoxGeometry(PIER_LEN, 0.9, 0.7), new THREE.MeshStandardMaterial({ map: ct, color: '#c4c2bb' }));
    para.position.set(PIER_X + PIER_LEN / 2, PIER_TOP + 0.45, -5.2);
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
    for (let X = PIER_X - 2; X < PIER_X + PIER_LEN + 2; X += 2.2) {
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
    lh.position.set(PIER_X + PIER_LEN - 4, PIER_TOP, -1);
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
    if (MODE.river) {
      // 강을 감싼 먼 산줄기
      const mat = new THREE.MeshStandardMaterial({ color: '#4c6a48', roughness: 1, flatShading: true });
      for (let i = 0; i < 16; i++) {
        const g = new THREE.ConeGeometry(60 + r() * 80, 50 + r() * 60, 7);
        const mtn = new THREE.Mesh(g, mat);
        const side = i % 2 ? 1 : -1;
        mtn.position.set(-200 + i * 70 + r() * 40, 10, side > 0 ? 260 + r() * 120 : -320 - r() * 160);
        mtn.scale.z = 0.7;
        scene.add(mtn);
      }
      return;
    }
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
      const A = new THREE.Vector3(665, 0, -2), B = new THREE.Vector3(708, 0, -170);
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
    // 터치한 목적지 표시
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.renderOrder = 3;
    this.marker.visible = false;
    scene.add(this.marker);
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
    // 실사 하늘(HDRI): 낮/노을, 밤은 별하늘
    const A = this.assets;
    let mode = 'dome';
    if (A && A.hdr.day && elev > -1) mode = elev < 13 && A.hdr.sunset ? 'sunset' : elev < 13 ? 'sunsetWait' : 'day';
    if (mode === 'sunsetWait') {
      if (!this.loadingSunset) {
        this.loadingSunset = true;
        loadHDR('belfast_sunset_puresky_2k').then((t) => { if (t) { A.hdr.sunset = t; this.lastHour = -1; } });
      }
      mode = 'day';
    }
    if (mode !== 'dome') {
      const t = mode === 'sunset' ? A.hdr.sunset : A.hdr.day;
      const sunInfo = t.userData.sun;
      const theta = sunInfo.az - Math.atan2(dir.z, dir.x);
      this.scene.background = t;
      this.scene.environment = t;
      this.scene.backgroundRotation.set(0, theta, 0);
      this.scene.environmentRotation.set(0, theta, 0);
      this.scene.backgroundIntensity = mode === 'sunset' ? 0.9 : 1;
      this.scene.environmentIntensity = 0.45;
      this.sun.intensity *= 1.2;
      u.uSky.value = t;
      u.uHasSky.value = 1;
      u.uSkyRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationY(-theta));
      u.uSkyGain.value = this.scene.backgroundIntensity;
      const hz = sunInfo.horizon;
      const fogC = new THREE.Color(hz[0], hz[1], hz[2]);
      const mx = Math.max(fogC.r, fogC.g, fogC.b);
      if (mx > 1.5) fogC.multiplyScalar(1.5 / mx);
      this.scene.fog.color.copy(fogC);
      u.uFogCol.value.copy(fogC);
      u.uSkyHor.value.copy(fogC);
      this.sky.visible = false;
      this.clouds.forEach((c) => { c.visible = false; });
      this.hemi.intensity *= 0.55;
    } else {
      this.scene.background = null;
      this.scene.environment = null;
      u.uHasSky.value = 0;
      this.sky.visible = true;
      this.clouds.forEach((c) => { c.visible = true; });
    }
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
    const P = this.player;
    P.group.visible = !st.hideAvatar;
    this.boat.visible = !!st.onBoat;
    this.mooredBoat.visible = !st.onBoat;
    if (av.X == null) this.placeAt(av, av.x);
    let ax = av.X, ay = av.Y, az = av.Z;
    if (st.hideAvatar) { ax = av.x * M; ay = groundY(ax); az = 0; }
    if (st.onBoat) {
      const b = this.boat;
      b.position.y = Math.sin(t * 1.3) * 0.15;
      b.rotation.z = Math.sin(t * 0.9) * 0.04;
      b.rotation.x = Math.sin(t * 1.1) * 0.025;
      ax = b.position.x; ay = 1.05 + b.position.y; az = b.position.z + 1.5;
    }
    const act = this.playerAct && (performance.now() - this.playerAct.t0) / 1000 < this.playerAct.dur ? this.playerAct : null;
    if (av.walking || (fishingPose && !(act && act.name === 'release'))) this.playerAct = null;
    P.pose({ walking: av.walking, phase: av.phase, rodE: pose.rod != null ? -pose.rod : 1.25, bend: pose.bend || 0, noRod: !!pose.noRod || !!(act && act.name === 'release'), t,
      action: act && act.name, actionT: act ? (performance.now() - act.t0) / 1000 : 0 });
    P.group.visible = !st.hideAvatar && !this.fpv;
    P.group.position.set(ax, ay + P.bob, az);
    const yawTarget = fishingPose || st.onBoat ? Math.PI : (av.yaw ?? Math.PI / 2);
    P.group.rotation.y += angDiff(yawTarget, P.group.rotation.y) * Math.min(1, dt * 10);
    this.lamp.intensity = this.night ? 6 : 0;
    // 목적지 표시
    if (this.marker) {
      const tg = av.target;
      this.marker.visible = !!tg && !st.hideAvatar;
      if (tg) {
        this.marker.position.set(tg.X, tg.Y + 0.05, tg.Z);
        const k = (t * 1.5) % 1;
        this.marker.scale.setScalar(0.6 + k * 0.6);
        this.marker.material.opacity = 0.9 * (1 - k);
      }
    }

    // NPC
    this.npcs.forEach(({ a, n }, i) => {
      if (n.X == null) {
        n.X = n.x * M;
        if (MODE.sihwa) { n.X = clamp(n.X, DIKE.x0 + 5, DIKE.x1 - 5); n.Z = -5.6; }
        else if (n.X > PIER_X) n.Z = -3.6;
        else {
          // 물가에서 가장 높은 바위 위 또는 물가 모래
          n.Z = shoreZ(n.X) + 2.2;
          let best = null;
          for (const rt of this.rockTops) if (Math.abs(rt.X - n.X) < 8 && rt.Z > shoreZ(n.X) - 7 && (!best || rt.top > best.top)) best = rt;
          if (best && best.top < 3) { n.X = best.X; n.Z = best.Z; }
        }
        n.Y = this.surfaceAt(n.X, n.Z).y;
      }
      const nx = n.X;
      const cyc = (t + n.seed) % 9;
      let e = 1.0;
      if (cyc < 0.6) e = 1.0 + 1.4 * (cyc / 0.6);
      else if (cyc < 0.9) e = 2.4 - 1.9 * ((cyc - 0.6) / 0.3);
      else e = 0.5 + Math.min(1, (cyc - 0.9) / 6) * 0.3;
      a.pose({ rodE: e, t: t + i });
      a.group.position.set(nx, n.Y, n.Z);
      a.group.rotation.y = Math.PI;
      // 1인칭일 때 바로 옆 사람은 시야를 가리지 않게 숨긴다
      a.group.visible = !(this.fpv && Math.hypot(nx - ax, n.Z - az) < 3.5);
      if (!a.line) {
        a.line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }));
        a.line.frustumCulled = false;
        this.scene.add(a.line);
      }
      if (cyc > 0.9) {
        a.group.updateMatrixWorld(true);
        const tip = a.tipWorld(new THREE.Vector3());
        const k = Math.min(1, (cyc - 0.9) / 0.7);
        const end = new THREE.Vector3(nx + 3, 0.02, Math.min(n.Z, shoreZ(nx)) - 10 - 40 * k - n.seed * 2);
        if (nx > PIER_X) end.z = -14 - 40 * k;
        const mid = tip.clone().lerp(end, 0.5);
        mid.y += k < 1 ? 8 * (1 - k) : -1.5;
        a.line.geometry.setFromPoints(new THREE.QuadraticBezierCurve3(tip, mid, end).getPoints(20));
        a.line.visible = true;
      } else a.line.visible = false;
    });

    this.updatePeers(t, dt);
    // 바다 위의 배·부표
    this.sailing.forEach((b) => {
      const u = b.userData;
      b.position.set(((u.x0 + t * u.sp) % 1400 + 1400) % 1400 - 400, Math.sin(t + u.x0) * 0.15, u.z);
      b.rotation.z = Math.sin(t * 0.8 + u.x0) * 0.03;
    });
    this.buoys.forEach((bu) => { const u = bu.userData; bu.position.set(u.X, Math.sin(t * 1.2 + u.ph) * 0.12, u.Z); });

    // 낚시 소품
    this.updateFishing(st, t, ax, ay, az, pose);

    if (this.caught) {
      const c = this.caught;
      const age = (performance.now() - c.userData.born) / 1000;
      const b = c.userData.base;
      const rel = c.userData.release;
      if (rel) {
        const k = (performance.now() - rel.t0) / 1100;
        if (k < 0) { c.position.set(b.x, b.y + 0.35, b.z); c.rotation.set(0, b.yaw, 0); c.userData.bend.a.value = 0.2; c.userData.bend.t.value = t * 10; }
        else if (k < 1) {
          // 포물선 + 꼬리 치기
          c.position.lerpVectors(rel.from, rel.to, k);
          c.position.y = lerp(rel.from.y + 0.35, 0, k) + Math.sin(k * Math.PI) * 1.4;
          c.rotation.set(0, b.yaw, -0.6 + k * 1.4);
          c.userData.bend.t.value = t * 26; c.userData.bend.a.value = 0.6;
        } else {
          if (!rel.splashed) {
            rel.splashed = true;
            const ring = this.rings[0];
            ring.position.set(rel.to.x, 0.05, rel.to.z);
            ring.userData.splashT = performance.now();
            if (this.audioSplash) this.audioSplash();
          }
          // 물속으로 헤엄쳐 사라진다
          const k2 = Math.min(1, (k - 1) / 1.2);
          c.position.set(rel.to.x, -0.25 - k2 * 0.6, rel.to.z - k2 * 3);
          c.rotation.set(0, Math.PI / 2, 0);
          c.userData.bend.t.value = t * 18;
          if (k2 >= 1) this.clearCatch();
        }
      } else if (c.userData.flat) {
        const u = c.userData.bend;
        u.t.value = t * 18; u.a.value = age < 8 ? 0.5 : 0.15;
        const j = age < 8 ? Math.max(0, Math.sin(t * 9)) * 0.12 : 0;
        c.position.set(b.x, b.y + 0.04 + j, b.z);
        c.rotation.set(0, b.yaw, Math.sin(t * 7) * 0.2);
      } else flop(c, age < 8 ? t : t * 0.3, b, c.userData.sizeM);
    }
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
    if (this.landmarks) this.landmarks.update(t);
    this.turbines.forEach((h, i) => { h.rotation.z = t * 0.6 + i; });
    this.updateViewModel(t, dt);
    this.updateBoils(t, dt, st);
    this.updateSpray(t, dt, ax, az);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(st, t, dt, ax, ay, az, fishing) {
    const cam = this.camera;
    const X = st.avatar.x * M;
    if (st.hideAvatar) {
      // 입장 화면: 해변을 천천히 훑는 풍경
      const desiredPos = new THREE.Vector3(X - 4, 3.2, 9), desiredLook = new THREE.Vector3(X + 6, 1.2, -25);
      cam.position.lerp(desiredPos, Math.min(1, dt * 1.5));
      this.camLook.lerp(desiredLook, Math.min(1, dt * 1.5));
      cam.lookAt(this.camLook);
      return;
    }
    if (this.fpv && this.player) {
      // 1인칭(고프로 시점): 바다(루어) 쪽을 보고, 자세에 따라 시선이 위·아래로
      const P = this.player;
      const eye = P.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.05, 0));
      let flat;
      if (this.landing && this.catchSpot) flat = this.catchSpot.clone().sub(eye);
      else if (this.fpTarget) flat = this.fpTarget.clone().sub(eye);
      else flat = new THREE.Vector3(-Math.sin(this.orbit.yaw), 0, -Math.cos(this.orbit.yaw));
      const hz = Math.hypot(flat.x, flat.z) || 1;
      let pitch = this.landing ? Math.atan2(flat.y, hz) : Math.max(-0.35, Math.atan2(flat.y, hz)) * 0.5 - 0.08;
      pitch += this.landing ? 0 : (this.vmLook || 0);
      const look = eye.clone().add(new THREE.Vector3(flat.x / hz * Math.cos(pitch), Math.sin(pitch), flat.z / hz * Math.cos(pitch)).multiplyScalar(10));
      const sh = this.shake || 0;
      eye.x += (Math.random() - 0.5) * sh * 0.05; eye.y += (Math.random() - 0.5) * sh * 0.04 + Math.sin(t * 1.6) * 0.008;
      cam.position.lerp(eye, Math.min(1, dt * 10));
      this.camLook.lerp(look, Math.min(1, dt * 8));
      cam.lookAt(this.camLook);
      cam.rotation.z += Math.sin(t * 0.7) * 0.012 + (Math.random() - 0.5) * sh * 0.02 + (this.landing ? 0 : this.vmRoll || 0);
      const fov = this.portrait ? 92 : 78;
      if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); this.fpvFov = fov; }
      return;
    }
    if (this.fpvFov && cam.fov === this.fpvFov) { cam.fov = this.portrait ? 62 : 50; cam.updateProjectionMatrix(); this.fpvFov = 0; }
    const o = this.orbit;
    const k = Math.min(1, dt * 6);
    o.yaw += angDiff(o.tYaw, o.yaw) * k;
    o.pitch += (o.tPitch - o.pitch) * k;
    o.dist += (o.tDist - o.dist) * Math.min(1, dt * 5);
    const look = new THREE.Vector3(ax, ay + (o.dist < 5 ? 0.85 : 0.6 + Math.min(1, o.dist / 60) * 0.4), az);
    let dist = o.dist, pitch = o.pitch, yaw = o.yaw;
    // 손맛 순간: 잡은 물고기를 가까이서
    if (performance.now() < this.catchCamUntil && this.catchSpot) {
      look.copy(this.catchSpot).add(new THREE.Vector3(0, 0.1, 0));
      dist = Math.max(1.3, (this.caught ? this.caught.userData.sizeM : 0.5) * 2.6); pitch = 0.62; yaw = o.yaw;
    }
    const portrait = this.portrait ? 1.3 : 1;
    dist *= portrait;
    const pos = new THREE.Vector3(
      look.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      look.y + Math.sin(pitch) * dist,
      look.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    // 절벽·언덕이 시야를 가리면 카메라를 앞으로 당긴다
    const seg = new THREE.Vector3();
    for (let i = 1; i <= 16; i++) {
      seg.lerpVectors(look, pos, i / 16);
      if ((i / 16) * dist < 1.4) continue;
      if (Math.max(heightAt(seg.x, seg.z), 0) + 0.35 > seg.y) {
        const f = Math.max(0.12, (i - 1) / 16);
        pos.lerpVectors(look, pos, f);
        // 절벽에 막히면 (직접 돌리는 중이 아닐 때) 바다 쪽으로 카메라를 돌린다
        if (f < 0.5 && performance.now() - o.touched > 1500) o.tYaw += angDiff(-2.5, o.tYaw) * Math.min(1, dt * 2);
        break;
      }
    }
    const floor = Math.max(heightAt(pos.x, pos.z), 0) + 0.4;
    if (pos.y < floor) pos.y = floor;
    if (this.snapCam) { cam.position.copy(pos); this.camLook.copy(look); this.snapCam = false; }
    cam.position.lerp(pos, Math.min(1, dt * 8));
    this.camLook.lerp(look, Math.min(1, dt * 8));
    cam.lookAt(this.camLook);
    if (this.shake) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake * 0.08, (Math.random() - 0.5) * this.shake * 0.06, 0));
  }

  // ── 1인칭 뷰모델 (고프로 시점): 그립을 쥔 오른손, 릴 핸들을 돌리는 왼손, 휘어지는 낚싯대 ──
  buildViewModel() {
    const vm = (this.vm = new THREE.Group());
    vm.visible = false;
    const skin = new THREE.MeshPhysicalMaterial({ color: '#c98f68', roughness: 0.6, clearcoat: 0.15, sheen: 0.3, sheenColor: new THREE.Color('#ffd2b0') });
    const sleeve = new THREE.MeshPhysicalMaterial({ color: '#f2f1ec', roughness: 0.9, sheen: 0.8, sheenColor: new THREE.Color('#ffffff') });
    // 래쉬가드 메시 질감
    {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#5a5a5a';
      for (let y = 0; y < 128; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < 128; x += 6) { g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 6);
      sleeve.bumpMap = t; sleeve.bumpScale = 0.8;
    }
    this.vmRodMat = new THREE.MeshPhysicalMaterial({ color: '#15171a', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 });
    this.vmReelMat = new THREE.MeshPhysicalMaterial({ color: '#1c1e22', metalness: 0.6, roughness: 0.3, clearcoat: 0.8 });
    const gold = new THREE.MeshPhysicalMaterial({ color: '#c9a646', metalness: 0.9, roughness: 0.25 });
    const lineM = new THREE.MeshStandardMaterial({ color: '#b6f23a', roughness: 0.6, emissive: '#4a6a00', emissiveIntensity: 0.25 });
    const black = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.8 });
    const add = (par, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); par.add(m); return m; };

    // 낚싯대 좌표계: +Y = 낚싯대 방향, +Z = 낚싯대 윗면, +X = 오른쪽
    const rf = (this.vmRF = new THREE.Group());
    vm.add(rf);
    add(rf, new THREE.CylinderGeometry(0.017, 0.02, 0.38, 14), black, 0, -0.17, 0); // 뒷 그립(EVA)
    add(rf, new THREE.CylinderGeometry(0.02, 0.02, 0.04, 14), gold, 0, -0.36, 0); // 버트 캡
    add(rf, new THREE.CylinderGeometry(0.015, 0.016, 0.1, 14), this.vmRodMat, 0, 0.04, 0); // 릴 시트
    add(rf, new THREE.CylinderGeometry(0.016, 0.013, 0.1, 14), black, 0, 0.12, 0); // 앞 그립
    // 스피닝릴: 낚싯대 아래에 매달림
    const reel = (this.vmReel = new THREE.Group());
    reel.position.set(0, 0.03, -0.0);
    reel.scale.setScalar(1.3);
    rf.add(reel);
    add(reel, new THREE.BoxGeometry(0.012, 0.05, 0.06), this.vmReelMat, 0, 0, -0.035); // 다리
    const body = add(reel, new THREE.SphereGeometry(0.038, 18, 14), this.vmReelMat, 0, -0.01, -0.085);
    body.scale.set(0.8, 1.15, 1);
    const spool = add(reel, new THREE.CylinderGeometry(0.034, 0.03, 0.045, 24), this.vmReelMat, 0, 0.055, -0.085);
    add(reel, new THREE.CylinderGeometry(0.031, 0.031, 0.03, 24), lineM, 0, 0.058, -0.085); // 감긴 형광 합사
    add(reel, new THREE.TorusGeometry(0.038, 0.0025, 6, 24), gold, 0, 0.065, -0.085).rotation.x = Math.PI / 2; // 베일
    spool.castShadow = false;
    // 핸들 (왼쪽, 감으면 회전)
    const crank = (this.vmCrank = new THREE.Group());
    crank.position.set(-0.04, -0.005, -0.085);
    reel.add(crank);
    const arm = add(crank, new THREE.BoxGeometry(0.006, 0.075, 0.01), gold, -0.008, 0, 0.035);
    arm.rotation.x = Math.PI / 2;
    this.vmKnob = add(crank, new THREE.CylinderGeometry(0.011, 0.011, 0.03, 12), black, -0.022, 0, 0.072);
    this.vmKnob.rotation.z = Math.PI / 2;
    // 오른손: 릴 다리를 손가락 사이에 끼고 그립을 감싼다
    const rh = (this.vmRH = new THREE.Group());
    rh.position.set(0, -0.01, 0);
    rf.add(rh);
    const palm = add(rh, new THREE.SphereGeometry(0.042, 18, 14), skin, 0.022, -0.02, 0.012);
    palm.scale.set(0.85, 1.35, 1.05);
    for (let i = 0; i < 4; i++) {
      const f = add(rh, new THREE.CapsuleGeometry(0.0115, 0.04, 4, 8), skin, -0.008, 0.02 - i * 0.022, -0.026);
      f.rotation.set(0, 0, Math.PI / 2 - 0.2);
    }
    const thumb = add(rh, new THREE.CapsuleGeometry(0.012, 0.045, 4, 8), skin, 0.006, 0.06, 0.03);
    thumb.rotation.set(0.5, 0, 0.2);
    // 왼손
    const lh = (this.vmLH = new THREE.Group());
    vm.add(lh);
    const lp = add(lh, new THREE.SphereGeometry(0.042, 18, 14), skin);
    lp.scale.set(1.05, 0.8, 1.3);
    for (let i = 0; i < 4; i++) {
      const f = add(lh, new THREE.CapsuleGeometry(0.011, 0.035, 4, 8), skin, 0.03, 0.012, -0.03 + i * 0.02);
      f.rotation.set(0, 0, -1.2);
    }
    // 소매 (손 → 화면 밖 어깨)
    const sl = new THREE.CylinderGeometry(0.06, 0.075, 1, 16, 1, true);
    sl.translate(0, 0.5, 0);
    this.vmSleeveR = add(vm, sl, sleeve);
    this.vmSleeveL = add(vm, sl.clone(), sleeve.clone());
    this.vmForeR = add(vm, new THREE.CylinderGeometry(0.03, 0.036, 1, 12, 1, true).translate(0, 0.5, 0), skin);
    this.vmForeL = add(vm, new THREE.CylinderGeometry(0.03, 0.036, 1, 12, 1, true).translate(0, 0.5, 0), skin.clone());
    this.vmSkin = skin;
    this.vmLeftSkin = lp.material = skin.clone();
    lh.children.forEach((c) => { if (c.isMesh) c.material = this.vmLeftSkin; });
    // 손목시계 (해변 스타일)
    const watch = (this.vmWatch = new THREE.Group());
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 20), new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.5, metalness: 0.4 }));
    band.scale.set(1, 1, 1.8);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.045), new THREE.MeshStandardMaterial({ color: '#3a3d40', metalness: 0.7, roughness: 0.3 }));
    face.position.y = 0.047;
    watch.add(band, face);
    vm.add(watch);
    this.vmStyleName = '';
    // 블랭크 (매 프레임 휨 계산)
    this.vmRod = new THREE.Mesh(new THREE.BufferGeometry(), this.vmRodMat);
    vm.add(this.vmRod);
    this.vmGuides = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Mesh(new THREE.TorusGeometry(0.012 - i * 0.0014, 0.0018, 6, 14), gold);
      vm.add(g);
      this.vmGuides.push(g);
    }
    this.vmTip = new THREE.Object3D();
    vm.add(this.vmTip);
    vm.traverse((o) => { if (o.isMesh) { o.renderOrder = 20; o.frustumCulled = false; } });
    this.camera.add(vm);
    this.crankAngle = 0;
    this.vmCur = null;
  }

  setGearLook(gear) {
    if (!this.vmRodMat) return;
    const rod = { bamboo: '#b58a3a', standard: '#16181c', premium: '#10285c' }[gear.rod] || '#15171a';
    const reel = { basic: '#5a6068', ultegra: '#2a2d33', stella: '#1d1d1f', vanquish: '#22324f' }[gear.reel] || '#1c1e22';
    this.vmRodMat.color.set(rod);
    this.vmReelMat.color.set(reel);
  }

  // 자세 키프레임 (카메라 좌표): 그립 위치 g, 낚싯대 앙각 pitch·좌우 yaw, 시선 올림 look
  // 해변(서프): 검은 소매 + 황갈색 장갑·시계, 오른손을 높이 든 서프루어 자세 / 갯바위: 흰 래쉬가드
  setVmStyle(name) {
    if (!this.vm || this.vmStyleName === name) return;
    this.vmStyleName = name;
    const beach = name === 'beach';
    this.vmSleeveR.material.color.set(beach ? '#1b1d22' : '#f2f1ec');
    this.vmSleeveL.material.color.set(beach ? '#1b1d22' : '#f2f1ec');
    this.vmLeftSkin.color.set(beach ? '#c08a4e' : '#c98f68'); // 장갑
    this.vmLeftSkin.roughness = beach ? 0.95 : 0.6;
    this.vmForeL.material.color.set(beach ? '#c08a4e' : '#c98f68');
    this.vmWatch.visible = beach;
    this.vmReel.scale.setScalar(beach ? 1.65 : 1.3);
  }

  vmKey(name) {
    if (this.vmStyleName === 'beach') {
      const KB = {
        idle: { g: [0.24, -0.04, -0.44], pitch: 0.42, yaw: -0.42, look: -0.02, roll: 0 },
        jerk: { g: [0.2, 0.1, -0.42], pitch: 1.05, yaw: -0.3, look: 0.22, roll: 0.04 },
        back: { g: [0.3, 0.16, -0.16], pitch: 2.2, yaw: 0.3, look: 0.25, roll: 0 },
        ready: { g: [0.24, -0.06, -0.4], pitch: 0.8, yaw: 0.0, look: 0.05, roll: 0 },
        release: { g: [0.27, 0.15, -0.42], pitch: -0.38, yaw: -0.32, look: -0.18, roll: -0.05 },
        fight: { g: [0.26, 0.06, -0.4], pitch: 0.72, yaw: -0.4, look: 0.1, roll: -0.14 },
        run: { g: [0.26, -0.02, -0.46], pitch: 0.45, yaw: -0.5, look: 0.0, roll: -0.22 },
        land: { g: [0.26, 0.04, -0.38], pitch: 1.2, yaw: 0.5, look: -0.6, roll: 0 },
        wait: { g: [0.24, -0.08, -0.44], pitch: 0.3, yaw: -0.35, look: -0.04, roll: 0 },
      };
      const k = KB[name];
      return { g: new THREE.Vector3(...k.g), pitch: k.pitch, yaw: k.yaw, look: k.look, roll: k.roll };
    }
    const K = {
      idle: { g: [0.02, -0.24, -0.46], pitch: 0.34, yaw: -0.2, look: 0 },
      jerk: { g: [-0.02, 0.0, -0.44], pitch: 1.15, yaw: -0.08, look: 0.3 },
      back: { g: [0.26, 0.12, -0.18], pitch: 2.15, yaw: 0.32, look: 0.26 },
      ready: { g: [0.08, -0.16, -0.42], pitch: 0.75, yaw: 0.05, look: 0.05 },
      release: { g: [0.0, -0.12, -0.6], pitch: 0.5, yaw: -0.1, look: 0.06 },
      fight: { g: [0.0, -0.08, -0.42], pitch: 1.0, yaw: -0.12, look: 0.12 },
      run: { g: [0.03, -0.18, -0.52], pitch: 0.6, yaw: -0.25, look: 0.02 },
      land: { g: [0.24, 0.02, -0.38], pitch: 1.2, yaw: 0.55, look: -0.6 },
      wait: { g: [0.03, -0.26, -0.46], pitch: 0.24, yaw: -0.18, look: -0.03 },
    };
    const k = K[name];
    return { g: new THREE.Vector3(...k.g), pitch: k.pitch, yaw: k.yaw, look: k.look, roll: 0 };
  }
  vmMix(a, b, k) {
    return { g: a.g.clone().lerp(b.g, k), pitch: lerp(a.pitch, b.pitch, k), yaw: lerp(a.yaw, b.yaw, k), look: lerp(a.look, b.look, k), roll: lerp(a.roll || 0, b.roll || 0, k) };
  }

  // 현재 상태에 맞는 목표 자세
  vmTarget(t) {
    const vp = this.vmPose || {};
    const fi = this.fightInfo;
    const s = vp.state;
    if (this.landing) return this.vmKey('land');
    if (s === 'charging') return this.vmMix(this.vmKey('ready'), this.vmKey('back'), Math.min(1, (vp.power || 0) * 1.6));
    if (s === 'flying') {
      // 0~0.18: 힘차게 앞으로 휘두름, 이후 루어가 날아가는 동안 그대로
      const k = clamp((vp.k || 0) / 0.18);
      const e = 1 - (1 - k) * (1 - k);
      return this.vmMix(this.vmKey('back'), this.vmKey('release'), e);
    }
    if (fi) {
      const p = this.vmMix(this.vmKey('fight'), this.vmKey('run'), fi.running ? 0.8 : 0);
      if (fi.pressed && !fi.running) { p.pitch += Math.sin(t * 2.4) * 0.12; p.g.y += Math.sin(t * 2.4) * 0.03; } // 펌핑
      return p;
    }
    if (s === 'retrieve') return this.vmMix(this.vmKey('idle'), this.vmKey('jerk'), vp.jerk || 0);
    return this.vmKey('wait');
  }

  updateViewModel(t, dt) {
    const vm = this.vm;
    if (!vm) return;
    vm.visible = !!this.fpv;
    if (!this.fpv) { this.vmCur = null; return; }
    // 해변 포인트의 모래 해변 구간이면 서프 스타일
    const onSand = !!this.player && !MODE.river && !MODE.sihwa && this.player.group.position.x < LAY.peb0;
    this.setVmStyle(onSand ? 'beach' : 'rock');
    const vp = this.vmPose || {};
    const fi = this.fightInfo;
    const tgt = this.vmTarget(t);
    // 캐스팅 휘두르기와 저킹은 빠르게, 나머지는 부드럽게 따라간다
    const fast = vp.state === 'flying' || vp.state === 'charging' || (vp.jerk || 0) > 0.05;
    if (!this.vmCur) this.vmCur = tgt;
    else this.vmCur = this.vmMix(this.vmCur, tgt, Math.min(1, dt * (fast ? 22 : 7)));
    const cur = this.vmCur;
    this.vmLook = cur.look;
    this.vmRoll = cur.roll || 0;
    // 숨쉬기·흔들림
    const breathe = Math.sin(t * 1.6) * 0.006;
    const sh = this.shake || 0;
    const G = cur.g.clone().add(new THREE.Vector3((Math.random() - 0.5) * sh * 0.01, breathe + (Math.random() - 0.5) * sh * 0.012, 0));
    const dir = new THREE.Vector3(Math.sin(cur.yaw) * Math.cos(cur.pitch), Math.sin(cur.pitch), -Math.cos(cur.yaw) * Math.cos(cur.pitch)).normalize();
    // 낚싯대 좌표계 기준
    const up0 = new THREE.Vector3(0, 1, 0);
    let top = up0.clone().sub(dir.clone().multiplyScalar(up0.dot(dir)));
    if (top.lengthSq() < 1e-4) top.set(0, 0, 1);
    top.normalize();
    const right = new THREE.Vector3().crossVectors(dir, top).normalize();
    const basis = new THREE.Matrix4().makeBasis(right, dir, top);
    this.vmRF.position.copy(G);
    this.vmRF.quaternion.setFromRotationMatrix(basis);
    // 휨: 줄이 당기는 쪽으로 (없으면 무게로 살짝 아래)
    const L = 2.25;
    let bend = 0.04, pull = new THREE.Vector3(0, -1, 0);
    const lineTarget = this.landing && this.caught ? this.caught.getWorldPosition(new THREE.Vector3()) : this.fpTarget;
    if (lineTarget) pull = this.camera.worldToLocal(lineTarget.clone()).sub(G).normalize();
    if (fi) bend = clamp(0.3 + fi.tension * 0.75 + (fi.running ? 0.3 : 0), 0, 1.25) * (this.vmStyleName === 'beach' ? 1.25 : 1);
    else if (this.landing) bend = 0.55;
    else if (vp.state === 'retrieve') bend = 0.08 + (vp.jerk || 0) * 0.22;
    else if (vp.state === 'charging') { bend = 0.12 + (vp.power || 0) * 0.25; pull.set(0, -1, 0.3).normalize(); }
    else if (vp.state === 'flying') { const k = clamp((vp.k || 0) / 0.18); bend = 0.45 * Math.sin(k * Math.PI); pull.copy(dir).multiplyScalar(-1).add(new THREE.Vector3(0, -0.3, 0.5)).normalize(); }
    const bd = pull.clone().sub(dir.clone().multiplyScalar(pull.dot(dir)));
    if (bd.lengthSq() < 1e-4) bd.set(0, -1, 0);
    bd.normalize();
    const vib = fi && fi.running ? Math.sin(t * 38) * 0.015 : 0;
    const N = 30;
    const pts = [];
    const start = G.clone().add(dir.clone().multiplyScalar(0.17));
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const along = u * L * (1 - bend * 0.18 * u);
      const off = bend * L * 0.55 * Math.pow(u, 2.2) + vib * u;
      pts.push(start.clone().add(dir.clone().multiplyScalar(along)).add(bd.clone().multiplyScalar(off)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, N, 0.0105, 7, false);
    const P = geo.attributes.position;
    for (let i = 0; i <= N; i++) {
      const k = 1 - (i / N) * 0.75;
      const c = curve.getPoint(i / N);
      for (let j = 0; j <= 7; j++) {
        const idx = i * 8 + j;
        P.setXYZ(idx, c.x + (P.getX(idx) - c.x) * k, c.y + (P.getY(idx) - c.y) * k, c.z + (P.getZ(idx) - c.z) * k);
      }
    }
    this.vmRod.geometry.dispose();
    this.vmRod.geometry = geo;
    const tip = curve.getPoint(1);
    this.vmTip.position.copy(tip);
    // 가이드
    this.vmGuides.forEach((g, i) => {
      const u = 0.08 + i * 0.16;
      const p = curve.getPoint(u), tn = curve.getTangent(u);
      g.position.copy(p).add(top.clone().multiplyScalar(-0.018 + i * 0.002));
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tn);
    });
    // 릴 핸들: 감을 때 회전
    const reeling = (fi && fi.pressed) || (vp.state === 'retrieve' && vp.pressed) || this.landing;
    if (reeling) this.crankAngle += dt * (fi && fi.running ? 7 : 15);
    this.vmCrank.rotation.x = this.crankAngle;
    vm.updateMatrixWorld(true);
    // 왼손: 릴링 중엔 핸들 노브, 캐스팅 중엔 그립 끝, 저킹 땐 앞 그립
    const toVm = (obj, local) => vm.worldToLocal(obj.localToWorld(local.clone()));
    let LH;
    if (vp.state === 'charging' || vp.state === 'flying') LH = toVm(this.vmRF, new THREE.Vector3(0, -0.33, 0));
    else LH = toVm(this.vmKnob, new THREE.Vector3(0, 0, 0)).add(new THREE.Vector3(-0.025, 0, 0.01));
    this.vmLH.position.copy(LH);
    this.vmLH.quaternion.copy(this.vmRF.quaternion);
    // 소매·팔: 손목 → 화면 밖 어깨
    const RH = toVm(this.vmRH, new THREE.Vector3(0.03, -0.05, 0.01));
    const beachSt = this.vmStyleName === 'beach';
    // 해변 자세: 왼팔이 화면 왼쪽에서 가로로 뻗어 핸들을 잡는다
    const shR = beachSt ? new THREE.Vector3(0.55, -0.35, 0.12) : new THREE.Vector3(0.42, -0.62, 0.15);
    const shL = beachSt ? new THREE.Vector3(-0.75, -0.18, 0.05) : new THREE.Vector3(-0.48, -0.66, 0.15);
    const limb = (mesh, a, b, from = 0, to = 1) => {
      const p0 = a.clone().lerp(b, from), p1 = a.clone().lerp(b, to);
      const d = p1.clone().sub(p0);
      mesh.position.copy(p0);
      mesh.scale.set(1, d.length(), 1);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    };
    limb(this.vmForeR, RH, shR, 0, 0.16);
    limb(this.vmSleeveR, RH, shR, 0.12, 1.2);
    limb(this.vmForeL, LH, shL, 0, 0.16);
    limb(this.vmSleeveL, LH, shL, beachSt ? 0.3 : 0.12, 1.2);
    if (beachSt) {
      // 장갑 낀 손등 + 손목시계
      limb(this.vmForeL, LH, shL, 0, 0.32);
      const wp = LH.clone().lerp(shL, 0.22);
      this.vmWatch.position.copy(wp);
      this.vmWatch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), shL.clone().sub(LH).normalize());
    }
    // 낚싯줄: 초리 → 루어/물고기
    const tw = this.vmTip.getWorldPosition(new THREE.Vector3());
    if (lineTarget && vp.state !== 'charging') {
      const mouth = this.landing && this.caught ? new THREE.Vector3(-0.45 * this.caught.userData.sizeM, 0, 0).applyMatrix4(this.caught.matrixWorld) : lineTarget;
      this.setLine(tw, mouth, fi ? (1 - fi.tension) * 1.2 : this.landing ? 0.05 : 1.6);
    } else if (vp.state === 'charging') {
      // 초리 끝에 매달린 루어
      const lw = tw.clone().add(new THREE.Vector3(0, -0.45, 0));
      this.setLine(tw, lw, 0);
      this.lure.visible = true;
      this.lure.position.copy(lw);
    }
  }

  // ── 갯바위에 부딪혀 하얗게 부서지는 파도 ──
  buildSpray() {
    const tex = TX.softDot('255,255,255');
    this.spray = [];
    for (let i = 0; i < 90; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      sp.userData = { life: 0 };
      this.scene.add(sp);
      this.spray.push(sp);
    }
    this.nextSpray = 0;
  }

  updateSpray(t, dt, ax, az) {
    if (!this.spray) return;
    if (t > this.nextSpray && !MODE.river) {
      this.nextSpray = t + 0.5 + Math.random() * 1.1;
      // 근처 물가의 바위(없으면 물가)에서 터진다
      const near = this.rockTops.filter((r) => Math.abs(r.X - ax) < 30 && Math.abs(r.Z - az) < 30 && r.top < 2.5 && heightAt(r.X, r.Z) < 0.4);
      let X, Z, Y, power;
      if (near.length) { const r = near[Math.floor(Math.random() * near.length)]; X = r.X + (Math.random() - 0.5) * r.rad; Z = r.Z - r.rad * 0.5; Y = Math.max(0.1, r.top * 0.5); power = 1 + Math.random(); }
      else if (MODE.sihwa || ax > PIER_X) { X = ax + (Math.random() - 0.5) * 40; Z = MODE.sihwa ? -DIKE.half - 2 : -7.5; Y = 0.3; power = 1.2; }
      else { X = ax + (Math.random() - 0.5) * 40; Z = shoreZ(X) - 1; Y = 0.05; power = 0.45; }
      let n = 0;
      for (const sp of this.spray) {
        if (sp.userData.life > 0) continue;
        const u = sp.userData;
        u.life = u.max = 0.9 + Math.random() * 0.8;
        u.v = new THREE.Vector3((Math.random() - 0.5) * 2.5, (2.5 + Math.random() * 3.5) * power, (Math.random() - 0.2) * 2);
        sp.position.set(X + (Math.random() - 0.5) * 1.5, Y, Z + (Math.random() - 0.5) * 1.2);
        u.size = 0.6 + Math.random() * 1.2 * power;
        if (++n > 16 * power) break;
      }
      if (this.audioCrash) this.audioCrash(Math.hypot(X - ax, Z - az), power);
    }
    for (const sp of this.spray) {
      const u = sp.userData;
      if (u.life <= 0) { sp.material.opacity = 0; continue; }
      u.life -= dt;
      u.v.y -= 9.8 * dt;
      sp.position.addScaledVector(u.v, dt);
      const k = 1 - u.life / u.max;
      sp.scale.setScalar(u.size * (0.6 + k * 1.8));
      sp.material.opacity = 0.85 * (1 - k) * (this.night ? 0.4 : 1);
    }
  }

  // ── 보일링: 베이트 떼를 쫓는 물고기가 수면을 끓게 하는 곳 ──
  buildBoils() {
    this.boils = [];
    if (MODE.river) return; // 민물에는 보일링 없음
    const scene = this.scene;
    const foamTex = TX.softDot('255,255,255');
    const fishGeo = new THREE.CapsuleGeometry(0.05, 0.22, 3, 6);
    fishGeo.rotateZ(Math.PI / 2);
    const fishM = new THREE.MeshStandardMaterial({ color: '#c9d4dc', metalness: 0.7, roughness: 0.25 });
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.15, 0, 0, -0.15, 0.9, 0.1, 0]), 3));
    const wm = new THREE.MeshBasicMaterial({ color: '#f4f4f2', side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      // 하얗게 끓는 물
      const foam = [];
      for (let k = 0; k < 14; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: foamTex, transparent: true, depthWrite: false, opacity: 0.8 }));
        sp.userData = { a: Math.random() * 6.28, r: Math.random() * 3.2, ph: Math.random() * 6.28 };
        g.add(sp);
        foam.push(sp);
      }
      // 튀어 오르는 베이트·포식어
      const fish = [];
      for (let k = 0; k < 10; k++) {
        const f = new THREE.Mesh(fishGeo, fishM);
        f.userData = { a: Math.random() * 6.28, r: 0.5 + Math.random() * 3, ph: Math.random() * 6.28, sp: 1.6 + Math.random() * 1.6, big: k < 3 };
        if (f.userData.big) f.scale.setScalar(3.2);
        g.add(f);
        fish.push(f);
      }
      // 몰려든 갈매기
      const birds = [];
      for (let k = 0; k < 5; k++) {
        const b = new THREE.Group();
        const l = new THREE.Mesh(wing, wm), r = new THREE.Mesh(wing, wm);
        r.scale.x = -1;
        b.add(l, r);
        b.userData = { l, r, a: Math.random() * 6.28, h: 5 + Math.random() * 5, rad: 3 + Math.random() * 5, sp: 0.6 + Math.random() * 0.5 };
        g.add(b);
        birds.push(b);
      }
      // 하늘에서 보이는 표시
      const mk = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.labelTexture(['🐟 보일링!', '물고기 떼 발견'], { border: '#ff5a2a', w: 512, h: 168 }), transparent: true, depthTest: false, toneMapped: false, fog: false }));
      mk.renderOrder = 30;
      mk.userData.boil = i;
      g.add(mk);
      const ring = new THREE.Mesh(new THREE.RingGeometry(5.2, 6, 48), new THREE.MeshBasicMaterial({ color: '#ff5a2a', transparent: true, opacity: 0.0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      g.add(ring);
      scene.add(g);
      const b = { g, foam, fish, birds, mk, ring, X: 0, Z: 0, until: 0, i };
      this.placeBoil(b, true);
      this.boils.push(b);
    }
  }

  // 걸어갈 수 있는 해안 앞바다에 보일링을 놓는다
  placeBoil(b, first) {
    let X, Z;
    if (MODE.sihwa) { X = DIKE.x0 + 30 + Math.random() * (DIKE.x1 - DIKE.x0 - 60); Z = -(DIKE.half + 25 + Math.random() * 45); }
    else if (MODE.river) { X = 70 + Math.random() * (PIER_X + PIER_LEN - 100); Z = shoreZ(X) - (9 + Math.random() * (riverW(X) - 22)); }
    else {
      X = 70 + Math.random() * (PIER_X + PIER_LEN - 90);
      Z = Math.min(shoreZ(X), X > PIER_X ? -6 : 0) - (22 + Math.random() * 50);
    }
    b.X = X; b.Z = Z;
    b.born = performance.now();
    b.until = b.born + (first ? 50 + Math.random() * 70 : 70 + Math.random() * 80) * 1000;
    b.g.position.set(X, 0, Z);
  }

  updateBoils(t, dt, st) {
    if (!this.boils) return;
    const now = performance.now();
    const sky = this.orbit.dist > 40 && !this.fpv;
    for (const b of this.boils) {
      if (now > b.until) this.placeBoil(b, false);
      const life = clamp((now - b.born) / 4000) * clamp((b.until - now) / 4000);
      b.foam.forEach((f) => {
        const u = f.userData;
        const k = 0.5 + 0.5 * Math.sin(t * 6 + u.ph);
        f.position.set(Math.cos(u.a + t * 0.3) * u.r, 0.15, Math.sin(u.a + t * 0.3) * u.r);
        f.scale.setScalar((0.8 + k * 1.6) * life);
        f.material.opacity = 0.75 * life;
      });
      b.fish.forEach((f) => {
        const u = f.userData;
        const ph = (t * u.sp + u.ph) % 1.6;
        const jump = ph < 0.6 ? Math.sin((ph / 0.6) * Math.PI) : -1;
        f.visible = jump > 0 && life > 0.2;
        f.position.set(Math.cos(u.a) * u.r + ph * 0.6, jump * (u.big ? 1.4 : 0.6), Math.sin(u.a) * u.r);
        f.rotation.set(0, u.a, -0.9 + (ph / 0.6) * 1.8);
      });
      b.birds.forEach((bd) => {
        const u = bd.userData;
        const a = u.a + t * u.sp;
        bd.position.set(Math.cos(a) * u.rad, u.h + Math.sin(t * 2 + u.a), Math.sin(a) * u.rad);
        bd.rotation.y = -a;
        const fl = Math.sin(t * 8 + u.a) * 0.6;
        u.l.rotation.z = fl; u.r.rotation.z = -fl;
        bd.visible = life > 0.3;
      });
      // 하늘 뷰: 크게 보이는 표시와 주황 원
      b.mk.visible = sky && life > 0.2;
      const s = clamp(this.orbit.dist / 12, 4, 26);
      b.mk.scale.set(s * 3.05, s, 1);
      b.mk.position.y = 4 + s * 0.8;
      b.ring.material.opacity = sky ? 0.55 * life * (0.6 + 0.4 * Math.sin(t * 4)) : 0;
      b.ring.scale.setScalar(sky ? 1 + 0.15 * Math.sin(t * 3) : 1);
    }
    // 가까운 보일링 소리
    if (st && !st.hideAvatar && this.audioHook) {
      let best = Infinity;
      for (const b of this.boils) best = Math.min(best, Math.hypot(b.X - st.avatar.X, b.Z - st.avatar.Z));
      this.audioHook(best);
    }
  }

  // 루어가 보일링 안에 있으면 입질 배율
  boilFactor() {
    if (!this.boils || !this.lureWorld) return 1;
    let f = 1;
    for (const b of this.boils) {
      const d = Math.hypot(this.lureWorld.x - b.X, this.lureWorld.z - b.Z);
      if (d < 9) f = Math.max(f, 6 - d * 0.45);
      else if (d < 20) f = Math.max(f, 1.6);
    }
    return f;
  }

  hitBoil(px, py) {
    if (!this.boils) return null;
    const rect = this.cv.getBoundingClientRect();
    const ndc = new THREE.Vector2(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const vis = this.boils.filter((b) => b.mk.visible).map((b) => b.mk);
    const hit = this.raycaster.intersectObjects(vis, false)[0];
    return hit ? this.boils[hit.object.userData.boil] : null;
  }

  // 보일링 정면의 물가로 옮기고 바다를 바라보게
  goToBoil(av, b) {
    this.placeAt(av, b.X / M, null);
    av.yaw = Math.PI;
    const yaw = Math.atan2(-(b.X - av.X), -(b.Z - av.Z));
    this.orbit.tYaw = this.orbit.yaw = yaw;
    this.orbit.tDist = 9; this.orbit.tPitch = 0.3;
    this.snapCam = true;
  }

  // ── 함께 있는 사람들 ──
  syncPeers(peers) {
    if (!this.scene) return;
    this.peerAvs = this.peerAvs || new Map();
    for (const [id, pa] of this.peerAvs) {
      if (!peers.has(id)) { this.scene.remove(pa.a.group); if (pa.line) this.scene.remove(pa.line); this.peerAvs.delete(id); }
    }
    for (const [id, p] of peers) {
      if (!p.st || !p.look) continue;
      let pa = this.peerAvs.get(id);
      const key = JSON.stringify(p.look) + p.name;
      if (pa && pa.key !== key) { this.scene.remove(pa.a.group); pa = null; }
      if (!pa) {
        const a = new Avatar(p.look, p.name, { small: true });
        a.group.position.set(p.st.X, p.st.Y, p.st.Z);
        this.scene.add(a.group);
        pa = { a, key, X: p.st.X, Y: p.st.Y, Z: p.st.Z, yaw: p.st.yaw || 0, phase: 0 };
        this.peerAvs.set(id, pa);
      }
      pa.p = p;
    }
  }

  updatePeers(t, dt) {
    if (!this.peerAvs) return;
    for (const [, pa] of this.peerAvs) {
      const st = pa.p && pa.p.st;
      if (!st) continue;
      const k = Math.min(1, dt * 8);
      const dx = st.X - pa.X, dz = st.Z - pa.Z;
      const far = Math.hypot(dx, dz) > 20;
      pa.X = far ? st.X : pa.X + dx * k;
      pa.Z = far ? st.Z : pa.Z + dz * k;
      pa.Y += (st.Y - pa.Y) * k;
      pa.yaw += angDiff(st.yaw || 0, pa.yaw) * k;
      if (st.w) pa.phase += dt * 10;
      const act = st.act && st.actT != null ? st.act : null;
      pa.a.pose({ walking: !!st.w, phase: pa.phase, rodE: st.rod != null ? -st.rod : 1.25, bend: st.bend || 0, noRod: !!st.noRod, t: t + pa.X,
        action: act, actionT: act ? (Date.now() - st.actT) / 1000 : 0 });
      pa.a.group.position.set(pa.X, pa.Y + pa.a.bob, pa.Z);
      pa.a.group.visible = !(this.fpv && this.player && Math.hypot(pa.X - this.player.group.position.x, pa.Z - this.player.group.position.z) < 2.2);
      pa.a.group.rotation.y = pa.yaw;
      // 낚싯줄
      const fishing = st.f && ['flying', 'retrieve', 'waiting', 'bite', 'fight'].includes(st.f);
      if (!pa.line) {
        pa.line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }));
        pa.line.frustumCulled = false;
        this.scene.add(pa.line);
      }
      pa.line.visible = !!fishing;
      if (fishing) {
        pa.a.group.updateMatrixWorld(true);
        const tip = pa.a.tipWorld(new THREE.Vector3());
        const d = st.fd || 0.5;
        const end = new THREE.Vector3(pa.X + 1 + d * 6, 0.02, Math.min(pa.Z - 1.5, shoreZ(pa.X) - 1.5) - Math.pow(d, 0.9) * 80);
        const mid = tip.clone().lerp(end, 0.5);
        mid.y -= st.f === 'fight' ? 0.5 : 2.5;
        pa.line.geometry.setFromPoints(new THREE.QuadraticBezierCurve3(tip, mid, end).getPoints(20));
      }
    }
    // 모래성 쌓이는 모습
    (this.castles || []).forEach((c) => {
      const k = clamp((performance.now() - c.userData.born) / 3500);
      c.scale.setScalar(0.2 + 0.8 * k);
    });
  }

  peerById(id) { return this.peerAvs && this.peerAvs.get(id); }
  peerPos(id) { const pa = this.peerById(id); return pa ? new THREE.Vector3(pa.X, pa.Y, pa.Z) : null; }

  sayPeer(id, text) { const pa = this.peerById(id); if (pa) pa.a.say(text); }
  sayPlayer(text) { if (this.player) this.player.say(text); }
  sayNpc(i, text) { if (this.npcs[i]) this.npcs[i].a.say(text); }

  playerAction(name, dur = 2.5) { this.playerAct = { name, t0: performance.now(), dur }; }

  // 모래성 (모두에게 보인다)
  addCastle(X, Z, seed = 1) {
    this.castles = this.castles || [];
    const g = makeCastle(seed, this.assets && this.assets.tex.sand.map);
    g.position.set(X, heightAt(X, Z) - 0.02, Z);
    g.userData.born = performance.now();
    this.scene.add(g);
    this.castles.push(g);
    if (this.castles.length > 30) this.scene.remove(this.castles.shift());
  }
  frontOfPlayer(dist = 0.8) {
    const P = this.player;
    const yaw = P ? P.group.rotation.y : 0;
    return { X: P.group.position.x + Math.sin(yaw) * dist, Z: P.group.position.z + Math.cos(yaw) * dist };
  }

  // ── 카메라 조작 API ──
  orbitBy(dx, dy) {
    const o = this.orbit;
    o.tYaw -= dx * 0.006;
    o.tPitch = clamp(o.tPitch + dy * 0.005, 0.04, 1.5);
    o.touched = performance.now();
  }
  zoomBy(f) {
    const o = this.orbit;
    o.tDist = clamp(o.tDist * f, 2.2, 360);
    if (o.tDist > 60) o.tPitch = Math.max(o.tPitch, 0.5 + Math.min(0.9, (o.tDist - 60) / 250));
    o.touched = performance.now();
  }
  viewPreset(name) {
    const o = this.orbit;
    if (name === 'near') { o.tDist = 3.6; o.tPitch = 0.22; }
    else if (name === 'normal') { o.tDist = 8; o.tPitch = 0.32; }
    else if (name === 'sky') { o.tDist = 170; o.tPitch = 1.2; }
    else if (name === 'sea') { o.tYaw = -0.35; o.tPitch = 0.3; o.tDist = Math.min(Math.max(o.tDist, 7), 14); }
  }
  // 낚시할 땐 바다가 보이게 (사용자가 방금 돌린 게 아니면)
  focusSea() {
    if (performance.now() - this.orbit.touched > 2500) this.viewPreset('sea');
  }

  // ── 걷기: 서 있을 수 있는 높이와 충돌 ──
  surfaceAt(X, Z) {
    let y = heightAt(X, Z), kind = 'ground';
    if (MODE.sihwa) {
      if (X >= DIKE.x0 && X <= DIKE.x1 && Math.abs(Z) <= DIKE.half) return { y: DIKE.top, kind: 'concrete' };
      return { y, kind: 'ground' };
    }
    if (!MODE.river) {
      const dy = deckY(X);
      if (dy != null && Z >= DECK_Z0 && Z <= DECK_Z1 && dy > y - 0.4) { y = dy; kind = 'wood'; }
      if (X >= PIER_X - 0.5 && X <= PIER_X + PIER_LEN && Z >= -5.4 && Z <= 5) { y = PIER_TOP; kind = 'concrete'; }
    }
    for (const rt of this.rockTops) {
      const dx = X - rt.X, dz = Z - rt.Z;
      if (Math.abs(dx) > rt.rad || Math.abs(dz) > rt.rad) continue;
      const d2 = (dx * dx + dz * dz) / (rt.rad * rt.rad);
      if (d2 >= 1) continue;
      const g = heightAt(rt.X, rt.Z);
      const yr = g + (rt.top - g) * Math.sqrt(1 - d2);
      if (yr > y) { y = yr; kind = 'rock'; }
    }
    return { y, kind };
  }

  canStand(from, X, Z, surf) {
    if (MODE.sihwa) {
      // 방조제 위만 걸을 수 있다 (양쪽 난간)
      return X >= DIKE.x0 + 1 && X <= DIKE.x1 - 1 && Math.abs(Z) <= DIKE.half - 0.8 && surf.kind === 'concrete';
    }
    if (X < 40 || X > PIER_X + PIER_LEN - 1 || Z < -95 || Z > (MODE.river ? 22 : 65)) return false;
    if (MODE.river && Z < shoreZ(X) - 14) return false; // 강을 건너가지 않게
    for (const c of this.colliders) {
      const dx = X - c.X, dz = Z - c.Z;
      if (dx * dx + dz * dz < c.r * c.r) return false;
    }
    if (surf.kind === 'concrete' && Z < -4.7) return false; // 방파제 난간
    if (from.kind === 'wood' && surf.kind !== 'wood' && Z < DECK_Z0 + 0.3) return false; // 데크 난간
    if (from.kind === 'wood' && surf.kind === 'wood' && Z < DECK_Z0 + 0.3) return false;
    if (surf.kind === 'ground' && surf.y < (this.wade ?? -0.3)) return false; // 복장에 따라 물에 들어갈 수 있는 깊이
    const rise = surf.y - from.y;
    const limit = surf.kind === 'rock' ? 0.55 : surf.kind === 'concrete' || surf.kind === 'wood' ? 0.6 : 0.32;
    if (rise > limit) return false; // 절벽·너무 높은 턱
    return true;
  }

  placeAt(av, xpx, zPref) {
    const X = MODE.sihwa ? clamp(xpx * M, DIKE.x0 + 2, DIKE.x1 - 2) : clamp(xpx * M, 50, PIER_X + PIER_LEN - 3);
    let Z = zPref;
    if (MODE.sihwa) Z = Z == null ? -4.5 : clamp(Z, -DIKE.half + 1, DIKE.half - 1);
    if (Z == null) {
      if (X < 120) Z = 0;
      else if (X > PIER_X) Z = -1.5;
      else if (deckY(X) != null && X > LAY.deck0 && X < LAY.deck1 - 4) Z = -1.6;
      else Z = shoreZ(X) + 4;
    }
    const surf = this.surfaceAt(X, Z);
    av.X = X; av.Z = Z; av.Y = surf.y; av.kind = surf.kind;
    av.x = X / M;
    av.target = null;
    if (av.yaw == null) av.yaw = Math.PI / 2;
    if (surf.kind === 'wood') { this.orbit.tYaw = this.orbit.yaw = -2.5; }
  }

  // input: {dx, dz} 월드 방향(키보드) 또는 av.target(터치한 곳)
  stepAvatar(av, dt, input) {
    let vx = 0, vz = 0;
    if (av.target) {
      vx = av.target.X - av.X; vz = av.target.Z - av.Z;
      const d = Math.hypot(vx, vz);
      if (d < 0.2) { av.target = null; vx = vz = 0; }
      else { vx /= d; vz /= d; }
    }
    if (input && (input.dx || input.dz)) { vx = input.dx; vz = input.dz; av.target = null; }
    const moving = !!(vx || vz);
    let stepEvent = null;
    if (moving) {
      const speed = av.run ? 7 : 4.2;
      const step = speed * dt;
      const from = { y: av.Y, kind: av.kind };
      const tryMove = (mx, mz) => {
        const X = av.X + mx * step, Z = av.Z + mz * step;
        const surf = this.surfaceAt(X, Z);
        if (!this.canStand(from, X, Z, surf)) return false;
        av.X = X; av.Z = Z; av.kind = surf.kind; av.Ytarget = surf.y;
        return true;
      };
      let ok = tryMove(vx, vz);
      // 나무·바위를 비껴 미끄러지듯 돌아간다
      if (!ok) ok = tryMove(vx, 0) || tryMove(0, vz) || tryMove(vx * 0.7 - vz * 0.7, vz * 0.7 + vx * 0.7) || tryMove(vx * 0.7 + vz * 0.7, vz * 0.7 - vx * 0.7);
      if (!ok) { av.blocked = (av.blocked || 0) + dt; if (av.blocked > 0.35) { av.target = null; av.blocked = 0; } }
      else av.blocked = 0;
      av.walking = ok;
      if (ok) {
        av.yaw += angDiff(Math.atan2(vx, vz), av.yaw) * Math.min(1, dt * 12);
        const prev = Math.sign(Math.sin(av.phase));
        av.phase += dt * (av.run ? 13 : 10);
        if (Math.sign(Math.sin(av.phase)) !== prev) stepEvent = av.kind;
      }
    } else av.walking = false;
    // 높이를 부드럽게 (바위 위로 폴짝)
    const ty = av.Ytarget ?? av.Y;
    av.Y += (ty - av.Y) * Math.min(1, dt * (ty > av.Y ? 14 : 9));
    av.x = av.X / M;
    if (av.X > 0 && this.feet && stepEvent && av.kind === 'ground') this.addFootprint3(av.X, av.Z, av.yaw, Math.sin(av.phase) > 0);
    return stepEvent;
  }

  pickGround(px, py) {
    const rect = this.cv.getBoundingClientRect();
    const ndc = new THREE.Vector2(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const objs = [this.terrain, ...this.walkMeshes];
    const hit = this.raycaster.intersectObjects(objs, false)[0];
    if (!hit) return null;
    return { X: hit.point.x, Z: hit.point.z, Y: this.surfaceAt(hit.point.x, hit.point.z).y };
  }

  addFootprint3(X, Z, yaw, foot) {
    if (X < 105 || X > LAY.deck0 - 4) return;
    const i = this.footIdx++ % 120;
    const side = foot ? 0.1 : -0.1;
    const fx = X + Math.cos(yaw) * side, fz = Z - Math.sin(yaw) * side;
    const m4 = new THREE.Matrix4().compose(
      new THREE.Vector3(fx, heightAt(fx, fz) + 0.02, fz),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(1, 1, 1),
    );
    this.feet.setMatrixAt(i, m4);
    this.feet.instanceMatrix.needsUpdate = true;
  }

  // 잡은 물고기를 바닥에 내려놓고 카메라를 가까이
  showCatch(fish, ax, ay, az) {
    if (this.caught) this.scene.remove(this.caught);
    const f = makeRealFish(fish.name, Math.floor(Math.random() * 1000));
    const sizeM = (fish.size || 40) / 100;
    f.scale.setScalar(sizeM);
    f.userData.sizeM = sizeM;
    f.userData.flat = !!fishLook(fish.name).flat;
    const yaw = this.orbit.yaw;
    const X = ax + Math.sin(yaw) * 0.9 + Math.cos(yaw) * 0.25, Z = az + Math.cos(yaw) * 0.9 - Math.sin(yaw) * 0.25;
    f.userData.base = { x: X, y: this.surfaceAt(X, Z).y, z: Z, yaw };
    f.userData.born = performance.now();
    this.scene.add(f);
    this.caught = f;
    this.catchSpot = new THREE.Vector3(X, f.userData.base.y, Z);
    this.catchCamUntil = performance.now() + (this.catchCamMs || 3200);
    this.landing = true;
    clearTimeout(this.landingT);
    this.landingT = setTimeout(() => { this.landing = false; }, this.catchCamMs || 3000);
  }
  // 방생: 손에서 물로 포물선을 그리며 돌아간다
  releaseCatch() {
    const c = this.caught;
    if (!c) return;
    const b = c.userData.base;
    let wz;
    if (MODE.sihwa) wz = -DIKE.half - 6;
    else if (b.x > PIER_X && !MODE.river) wz = -9;
    else wz = Math.min(b.z - 2.5, shoreZ(b.x) - 2.5);
    this.landing = false;
    c.userData.release = { t0: performance.now() + 500, from: new THREE.Vector3(b.x, b.y, b.z), to: new THREE.Vector3(b.x + 0.5, 0, wz) };
    this.catchCamUntil = performance.now() + 2600;
  }

  clearCatch() {
    this.landing = false;
    if (this.caught) { this.scene.remove(this.caught); this.caught = null; }
    this.catchCamUntil = 0;
  }

  updateFishing(st, t, ax, ay, az, pose) {
    const f = st.fishing;
    const s = f.state;
    const P = this.player;
    const hide = st.hideAvatar || s === 'idle' || s === 'charging';
    this.fline.visible = this.lure.visible = this.floatObj.visible = false;
    this.fish.visible = false;
    this.stand.visible = false;
    this.rings.forEach((r) => {
      const sp = r.userData.splashT;
      if (sp && performance.now() - sp < 1200) { const k = (performance.now() - sp) / 1200; r.material.opacity = 0.9 * (1 - k); r.scale.setScalar(0.4 + k * 2.6); }
      else r.material.opacity = 0;
    });
    if (hide) { this.fpTarget = null; this.lureWorld = null; return; }
    P.group.updateMatrixWorld(true);
    let tip = P.tipWorld(new THREE.Vector3());
    const boat = st.onBoat;
    const shore = boat ? az - 5 : Math.min(az - 1.5, shoreZ(ax) - 1.5);
    const reach = boat ? 38 : MODE.river ? Math.min(38, riverW(ax) - 8) : 88;
    const waterPos = (d) => new THREE.Vector3(ax + 1 + d * 6, 0.03, shore - Math.pow(d, 0.9) * reach);
    // 원투: 받침대
    if (f.mode === 'far' && (s === 'waiting' || s === 'bite')) {
      this.stand.visible = true;
      const sx = ax + 0.9, sz = az - 0.6;
      this.stand.position.set(sx, boat ? ay : this.surfaceAt(sx, sz).y, sz);
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
      if (this.caught && !this.caught.userData.release) {
        const c = this.caught;
        const mouth = new THREE.Vector3(-0.45 * c.userData.sizeM, 0, 0).applyMatrix4(c.matrixWorld);
        this.setLine(tip, mouth, 0.3);
      }
      return;
    } else {
      lp = waterPos(f.d);
      if (s === 'fight') lp.x += Math.sin(t * 7) * (f.run > 0 ? 1.4 : 0.5);
    }
    this.fpTarget = lp.clone();
    if (s !== 'flying') this.lureWorld = lp.clone();
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

// 솔잎 카드 묶음: 수직 십자 3장 + 수평 1장 (법선은 위쪽으로 부풀려 덩어리처럼 보이게)
function needlePad() {
  const quads = [];
  const mk = (rotY, horizontal) => {
    const g = new THREE.PlaneGeometry(1, 1);
    if (horizontal) g.rotateX(-Math.PI / 2);
    g.rotateY(rotY);
    return g.toNonIndexed();
  };
  quads.push(mk(0), mk(Math.PI / 3), mk((2 * Math.PI) / 3), mk(0.3, true));
  let n = 0;
  quads.forEach((q) => { n += q.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  let o = 0;
  quads.forEach((q) => {
    const P = q.attributes.position, U = q.attributes.uv;
    for (let i = 0; i < P.count; i++, o++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      pos.set([x, y, z], o * 3);
      const len = Math.hypot(x, y * 0.5 + 0.9, z) || 1;
      nor.set([x / len, (y * 0.5 + 0.9) / len, z / len], o * 3);
      uv.set([U.getX(i), U.getY(i)], o * 2);
      const sh = 0.6 + 0.4 * (y + 0.5);
      col.set([sh, sh, sh], o * 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// 모래성: 둥근 탑 + 원뿔 지붕 + 성벽
function makeCastle(seed, sandMap) {
  const r = rng(seed);
  const m = new THREE.MeshStandardMaterial({ color: '#e2cb98', roughness: 1, map: sandMap || null });
  const g = new THREE.Group();
  const add = (geo, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.CylinderGeometry(0.32, 0.38, 0.18, 20), 0, 0.09, 0);
  add(new THREE.CylinderGeometry(0.12, 0.14, 0.32, 14), 0, 0.34, 0);
  add(new THREE.ConeGeometry(0.13, 0.16, 14), 0, 0.58, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    const x = Math.cos(a) * 0.26, z = Math.sin(a) * 0.26;
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.2, 10), x, 0.25, z);
    add(new THREE.ConeGeometry(0.07, 0.09, 10), x, 0.39, z);
  }
  // 꼭대기 깃발
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 4), new THREE.MeshStandardMaterial({ color: '#7a5a3a' }));
  pole.position.y = 0.74;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.06), new THREE.MeshStandardMaterial({ color: '#ff5a5a', side: THREE.DoubleSide }));
  flag.position.set(0.045, 0.8, 0);
  g.add(pole, flag);
  return g;
}
