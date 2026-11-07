// 직접 디자인한 탐험가 캐릭터 3D 모델(GLB)을 불러와 움직일 수 있게 부위별로 나눈다.
// 모델에는 뼈대가 없어서, 부품 이름·위치로 머리 / 몸통 / 왼·오른팔 / 왼·오른다리로 나누고
// 같은 재질끼리 합쳐 가볍게 만든다.
import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/addons/GLTFLoader.js';
import { mergeGeometries } from '../vendor/three/addons/BufferGeometryUtils.js';
import { MeshoptDecoder } from '../vendor/three/addons/libs/meshopt_decoder.module.js';

const BASE = new URL('../assets/avatar/', import.meta.url).href;
export const MODEL_FILES = { basic: '01_Casual.glb', wader: '02_Overalls.glb', boots: '03_Explorer.glb' };
export const MODEL_HEIGHT = 1.38; // 게임 속 키(m 단위, 기존 아바타와 같게)

const ARM = new Set(['Sleeve', 'Sleeve cuff', 'Forearm', 'Mitten hand', 'Thumb']);
const LEG = new Set(['Boot molded shaft', 'Rounded boot toe', 'Boot cuff', 'Boot outsole', 'Outsole lug', 'Bare calf', 'Foot', 'Toe',
  'Sandal sole', 'Sandal sidewall stripe', 'Wide sandal strap', 'Knee pad', 'Knee pad edge', 'Knee pad tread']);
const baseName = (n) => String(n || '').replace(/_/g, ' ').replace(/\.?\d{3}$/, '').trim(); // 불러올 때 띄어쓰기가 _로 바뀐다

// 양자화된 속성을 일반 실수 배열로
function toFloat(attr) {
  const n = attr.count, k = attr.itemSize, out = new Float32Array(n * k);
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) out[i * k + j] = attr.getComponent(i, j);
  return new THREE.BufferAttribute(out, k);
}
function plain(geo, mat4) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', toFloat(geo.attributes.position));
  if (geo.attributes.normal) g.setAttribute('normal', toFloat(geo.attributes.normal));
  if (geo.attributes.color) g.setAttribute('color', toFloat(geo.attributes.color));
  if (geo.index) g.setIndex(Array.from(geo.index.array));
  g.applyMatrix4(mat4);
  return g.index ? g.toNonIndexed() : g;
}
// 삼각형 단위로 나누기 (두 다리가 붙은 바지용)
function splitTris(g, pick) {
  const out = {};
  const pos = g.attributes.position;
  const attrs = Object.keys(g.attributes);
  const buf = {};
  for (let t = 0; t < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
    const part = pick(cx, cy);
    (buf[part] ||= []).push(t);
  }
  for (const [part, tris] of Object.entries(buf)) {
    const ng = new THREE.BufferGeometry();
    for (const a of attrs) {
      const src = g.attributes[a], k = src.itemSize, arr = new Float32Array(tris.length * 3 * k);
      tris.forEach((t, i) => arr.set(src.array.subarray(t * k, (t + 3) * k), i * 3 * k));
      ng.setAttribute(a, new THREE.BufferAttribute(arr, k));
    }
    out[part] = ng;
  }
  return out;
}

function prepare(gltf) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const scale = MODEL_HEIGHT / (box.max.y - box.min.y);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  // 바지 가랑이 높이: 가운데(x≈0)에서 가장 낮은 점
  let crotch = 1.0;
  for (const m of meshes) {
    if (!/^Continuous/.test(baseName(m.name)) && !/^Continuous/.test(baseName(m.parent && m.parent.name))) continue;
    const g = plain(m.geometry, m.matrixWorld);
    const p = g.attributes.position;
    let lo = Infinity;
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < 0.04 && p.getZ(i) > -0.1 && p.getY(i) < lo) lo = p.getY(i);
    if (lo < Infinity) crotch = Math.min(crotch, lo);
  }
  const groups = {}; // part → material uuid → { mat, geos }
  const put = (part, mat, g) => {
    const pm = (groups[part] ||= {});
    (pm[mat.uuid] ||= { mat, geos: [] }).geos.push(g);
  };
  const center = new THREE.Vector3();
  for (const m of meshes) {
    const name = baseName(m.name || (m.parent && m.parent.name));
    const g = plain(m.geometry, m.matrixWorld);
    g.computeBoundingBox();
    g.boundingBox.getCenter(center);
    const mat = m.material;
    if (/^Continuous/.test(name)) {
      const parts = splitTris(g, (x, y) => (y < crotch + 0.02 ? (x < 0 ? 'legL' : 'legR') : 'body'));
      for (const [part, pg] of Object.entries(parts)) put(part, mat, pg);
    } else if (center.y > 2.15) put('head', mat, g);
    else if (ARM.has(name)) put(center.x < 0 ? 'armL' : 'armR', mat, g);
    else if (LEG.has(name)) put(center.x < 0 ? 'legL' : 'legR', mat, g);
    else put('body', mat, g);
  }
  // 관절 위치(모델 좌표)
  const pivots = {
    head: new THREE.Vector3(0, 2.05, 0),
    armL: new THREE.Vector3(-0.37, 1.8, 0), armR: new THREE.Vector3(0.37, 1.8, 0),
    legL: new THREE.Vector3(-0.3, crotch + 0.05, 0), legR: new THREE.Vector3(0.3, crotch + 0.05, 0),
    body: new THREE.Vector3(0, 0, 0),
  };
  const parts = {};
  for (const [part, pm] of Object.entries(groups)) {
    const pv = pivots[part];
    parts[part] = Object.values(pm).map(({ mat, geos }) => {
      // 색 정점이 있는 것과 없는 것이 섞이면 색을 버린다
      const hasColor = geos.every((x) => x.attributes.color);
      geos.forEach((x) => { if (!hasColor) x.deleteAttribute('color'); });
      const merged = mergeGeometries(geos, false);
      merged.translate(-pv.x, -pv.y - box.min.y * 0, -pv.z);
      merged.computeBoundingSphere();
      const m2 = mat.clone();
      if (!hasColor) m2.vertexColors = false;
      return { geo: merged, mat: m2, lens: /^Lens/.test(mat.name || '') };
    });
  }
  return { parts, pivots, scale, minY: box.min.y, lamp: new THREE.Vector3(0, 3.29, 0.98), hand: new THREE.Vector3(0.98, 1.19, 0.06) };
}

let cache = null;
export function loadAvatarModels() {
  if (cache) return cache;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  cache = Promise.all(Object.entries(MODEL_FILES).map(([kind, file]) => new Promise((res) => {
    loader.load(BASE + file, (gltf) => {
      try { res([kind, prepare(gltf)]); } catch (e) { console.warn('아바타 모델 준비 실패', kind, e); res([kind, null]); }
    }, undefined, (e) => { console.warn('아바타 모델 불러오기 실패', kind, e); res([kind, null]); });
  }))).then((list) => Object.fromEntries(list.filter(([, v]) => v)));
  return cache;
}
