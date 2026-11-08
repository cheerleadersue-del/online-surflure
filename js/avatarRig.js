// 뼈대(37개)와 애니메이션(18개)이 들어간 탐험가 캐릭터 (Explorer Game Animation Kit)
// - 파일을 불러와 같은 재질끼리 합쳐(부품 229개 → 재질 수만큼) 가볍게 만든다.
// - 아바타마다 뼈대를 복제하고 AnimationMixer로 동작을 재생한다.
import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/addons/GLTFLoader.js';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { MeshoptDecoder } from '../vendor/three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from '../vendor/three/addons/SkeletonUtils.js';

const BASE = new URL('../assets/avatar/rig/', import.meta.url).href;
export const RIG_FILES = { basic: '01_Casual_ThirdPerson.glb', wader: '02_Overalls_ThirdPerson.glb', boots: '03_Explorer_ThirdPerson.glb' };
export const RIG_HEIGHT = 1.38; // 게임 속 키 (기존 아바타와 같게)
// 게임이 따로 그리는 것들(낚싯줄·루어·물고기)은 뺀다
const HIDE = /^(Fish (body|belly|eye|pupil)|Tail fin|Taut fishing line|Fishing lure)/;
const GEAR_PART = /rod|reel|crank|cork|guide|spool|bail|line/i; // 키 계산에서 뺄 장비
const baseName = (n) => String(n || '').replace(/_/g, ' ').replace(/\.?\d{3}$/, '').trim();

function floatAttr(a, k = a.itemSize) {
  const out = new Float32Array(a.count * k);
  for (let i = 0; i < a.count; i++) for (let j = 0; j < k; j++) out[i * k + j] = a.getComponent(i, j);
  return new THREE.BufferAttribute(out, k);
}
function plainGeo(g, keepColor, remap, bindMat) {
  const n = new THREE.BufferGeometry();
  n.setAttribute('position', floatAttr(g.attributes.position));
  n.setAttribute('normal', floatAttr(g.attributes.normal));
  if (keepColor && g.attributes.color) n.setAttribute('color', floatAttr(g.attributes.color, 4));
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const idx = new Uint16Array(si.count * 4);
  // 부품마다 뼈 번호가 달라서 공통 뼈대 번호로 바꾼다
  for (let i = 0; i < si.count; i++) for (let j = 0; j < 4; j++) idx[i * 4 + j] = remap[si.getComponent(i, j)] || 0;
  n.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  n.setAttribute('skinWeight', floatAttr(sw, 4));
  if (g.index) n.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
  // 압축 보정 행렬 Q: 공통 뼈대 기준 좌표로 옮긴다 (법선은 같은 선형 변환 후 정규화 — 원래 스키닝과 같게)
  const pos = n.attributes.position, nor = n.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(bindMat); pos.setXYZ(i, v.x, v.y, v.z); }
  const e = bindMat.elements;
  for (let i = 0; i < nor.count; i++) {
    const x = nor.getX(i), y = nor.getY(i), z = nor.getZ(i);
    v.set(e[0] * x + e[4] * y + e[8] * z, e[1] * x + e[5] * y + e[9] * z, e[2] * x + e[6] * y + e[10] * z).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  return n;
}

function prepare(gltf) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const found = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) found.push(o); });
  const groups = new Map();
  let parent = null;
  // 공통 뼈대: 모든 부품의 뼈를 하나로 모은다
  const bones = [], inv = [], boneIdx = new Map();
  const addBone = (b, m) => {
    if (!boneIdx.has(b)) { boneIdx.set(b, bones.length); bones.push(b); inv.push(m); }
    return boneIdx.get(b);
  };
  let maxScale = 0;
  for (const o of found) for (const b of o.skeleton.bones) maxScale = Math.max(maxScale, b.matrixWorld.getMaxScaleOnAxis());
  for (const o of found) {
    const par = o.parent;
    par.remove(o);
    if (HIDE.test(baseName(o.name))) continue;
    parent ||= par;
    const sk = o.skeleton;
    // 압축 보정 Q: 부품마다 뼈 역행렬에 섞여 있다 (부품 역행렬 = 진짜 역행렬 × Q).
    // 크기가 정상인 기준 뼈로 Q = 뼈월드 × 부품역행렬 × 바인드 를 구하고, 진짜 역행렬 = 부품역행렬 × 바인드 × Q⁻¹
    let ri = sk.bones.findIndex((b) => b.matrixWorld.getMaxScaleOnAxis() > 0.5 * maxScale);
    if (ri < 0) ri = 0;
    const Q = new THREE.Matrix4().copy(sk.bones[ri].matrixWorld).multiply(sk.boneInverses[ri]).multiply(o.bindMatrix);
    const Qi = Q.clone().invert();
    const remap = sk.bones.map((b, i) => addBone(b, new THREE.Matrix4().copy(sk.boneInverses[i]).multiply(o.bindMatrix).multiply(Qi)));
    const g = groups.get(o.material.uuid) || { mat: o.material, list: [] };
    g.list.push({ geo: o.geometry, remap, bindMat: Q, name: baseName(o.name) });
    groups.set(o.material.uuid, g);
  }
  const skeleton = new THREE.Skeleton(bones, inv);
  const box = new THREE.Box3();
  for (const { mat, list } of groups.values()) {
    const keepColor = list.every((x) => x.geo.attributes.color);
    const geos = list.map((x) => plainGeo(x.geo, keepColor, x.remap, x.bindMat));
    // 키는 몸(장비 제외)으로 잰다
    geos.forEach((g, i) => { if (!GEAR_PART.test(list[i].name)) { g.computeBoundingBox(); box.union(g.boundingBox); } });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const m = mat.clone();
    m.vertexColors = keepColor;
    const mesh = new THREE.SkinnedMesh(merged, m);
    mesh.name = mat.name || 'part';
    mesh.castShadow = true;
    mesh.frustumCulled = false; // 동작으로 몸이 움직여도 잘리지 않게
    parent.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
  }
  const h = box.max.y - box.min.y || 1;
  const eyeBone = scene.getObjectByName('CameraPOV') || scene.getObjectByName('Head');
  const eye = eyeBone ? eyeBone.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, box.max.y * 0.8, 0);
  return { scene, clips: gltf.animations, scale: RIG_HEIGHT / h, minY: box.min.y, eye };
}

let cache = null;
export function loadRigs() {
  if (cache) return cache;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  cache = Promise.all(Object.entries(RIG_FILES).map(([kind, file]) => loader.loadAsync(BASE + file)
    .then((g) => [kind, prepare(g)])
    .catch((e) => { console.warn('애니메이션 캐릭터 불러오기 실패', kind, e); return [kind, null]; })))
    .then((list) => Object.fromEntries(list.filter(([, v]) => v)));
  return cache;
}

// 아바타 하나: 뼈대를 복제하고 동작을 재생
export class RigInstance {
  constructor(T) {
    this.T = T;
    this.root = SkeletonUtils.clone(T.scene);
    this.root.scale.setScalar(T.scale);
    this.root.position.y = -T.minY * T.scale;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const c of T.clips) this.actions[c.name] = this.mixer.clipAction(c);
    this.bone = (n) => this.root.getObjectByName(n);
    this.rodBone = this.bone('Rod');
    this.tipBone = this.bone('RodFlex05') || this.rodBone;
    this.lampBone = this.bone('Lamp') || this.bone('Head');
    this.lens = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      // 헤드랜턴 렌즈는 아바타마다 따로 빛나게
      if (/^(Lens|LED|Amber LED)/i.test(o.material.name || '')) { o.material = o.material.clone(); this.lens.push(o.material); }
    });
    this.cur = null;
    this.curName = '';
  }

  play(name, { once = false, fade = 0.22, speed = 1 } = {}) {
    const a = this.actions[name];
    if (!a) return;
    a.setEffectiveTimeScale(speed);
    if (this.curName === name) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.setEffectiveWeight(1);
    a.play();
    if (this.cur) this.cur.crossFadeTo(a, fade, false);
    this.cur = a;
    this.curName = name;
  }

  // 게임 상태 → 동작 클립 (3인칭·1인칭 공통). anim: { oneShot, lampAnim, fsPrev } 상태를 담는 객체
  drive({ walking = false, action = null, fs = null, pressed = false, dt = 0, anim = this }) {
    const f = fs || 'idle';
    const prev = anim.fsPrev || 'idle';
    if (f !== prev) {
      if (f === 'fight') anim.oneShot = 'Fish_Hit';
      else if (f === 'result') anim.oneShot = 'Fish_Land';
      else if (f === 'idle' && ['retrieve', 'waiting', 'bite', 'fight', 'flying'].includes(prev)) anim.oneShot = 'Fish_Wind_In';
      else if (f !== 'idle') anim.oneShot = null;
      anim.fsPrev = f;
    }
    let want = 'Idle', once = false, speed = 1;
    if (action === 'wave' || action === 'bow' || action === 'highfive') { want = 'Wave'; once = true; }
    else if (walking) { want = 'Walk'; anim.oneShot = null; anim.lampAnim = null; }
    else if (anim.oneShot) { want = anim.oneShot; once = true; }
    else if (f === 'charging' || f === 'flying') { want = 'Fish_Cast'; once = true; }
    else if (f === 'retrieve') want = pressed ? 'Fish_Jerk' : 'Fish_Stay';
    else if (f === 'waiting' || f === 'bite') want = 'Fish_Stay';
    else if (f === 'fight') { want = 'Fish_Reel'; speed = pressed ? 1.5 : 0.7; }
    else if (anim.lampAnim) { want = anim.lampAnim; once = true; }
    this.play(want, { once, speed });
    // 힘 모으는 동안은 캐스팅 준비 자세에서 멈춘다
    if (this.cur) {
      const hold = this.cur.getClip().duration * 0.32;
      if (f === 'charging' && want === 'Fish_Cast' && this.cur.time >= hold) { this.cur.time = hold; this.cur.paused = true; }
      else this.cur.paused = false;
    }
    this.mixer.update(dt);
    if (once && this.done()) {
      if (want === anim.oneShot) anim.oneShot = null;
      if (want === anim.lampAnim) anim.lampAnim = null;
    }
    return want;
  }

  done() { return this.cur && this.cur.loop === THREE.LoopOnce && this.cur.time >= this.cur.getClip().duration - 0.02; }
}

// ── 1인칭: 팔과 장비 + 애니메이션 카메라 ──
export const FP_FILES = { basic: '01_Casual_FirstPerson.glb', wader: '02_Overalls_FirstPerson.glb', boots: '03_Explorer_FirstPerson.glb' };
const fpCache = {};
export function loadFP(kind) {
  if (!fpCache[kind]) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    fpCache[kind] = loader.loadAsync(BASE + FP_FILES[kind]).then((g) => {
      const T = prepare(g);
      T.fov = g.cameras && g.cameras[0] ? THREE.MathUtils.radToDeg(g.cameras[0].fov) : 70;
      return T;
    }).catch((e) => { console.warn('1인칭 모델 불러오기 실패', kind, e); return null; });
  }
  return fpCache[kind];
}

// 게임 카메라에 붙여, 모델 속 카메라가 게임 카메라와 겹치도록 맞춘다
export class FPInstance extends RigInstance {
  constructor(T) {
    super(T);
    this.root.scale.setScalar(1);
    this.root.position.set(0, 0, 0);
    this.camNode = this.root.getObjectByName('CAM_First_Person');
    this.holder = new THREE.Group();
    this.holder.matrixAutoUpdate = false;
    this.holder.add(this.root);
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    this._m = new THREE.Matrix4();
  }

  align() {
    if (!this.camNode) return;
    this.holder.matrix.identity();
    this.holder.updateMatrixWorld(true);
    // 모델 기준 카메라 위치·방향 → 그 역행렬을 붙이면 카메라가 게임 카메라 자리에 온다
    this._m.copy(this.root.matrixWorld).invert().multiply(this.camNode.matrixWorld);
    this.holder.matrix.copy(this._m).invert();
    this.holder.updateMatrixWorld(true);
  }
}
