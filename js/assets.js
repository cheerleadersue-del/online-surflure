// Poly Haven(CC0) 스캔 자료 로더: 질감·하늘(HDRI)·3D 모델
import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/addons/GLTFLoader.js';
import { RGBELoader } from '../vendor/three/addons/RGBELoader.js';

const BASE = new URL('../assets/', import.meta.url).href;
const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const rgbeLoader = new RGBELoader().setDataType(THREE.HalfFloatType);

function tex(path, srgb) {
  return new Promise((res) => {
    texLoader.load(BASE + path, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      res(t);
    }, undefined, () => res(null));
  });
}

async function pbr(name) {
  const [map, normal, arm] = await Promise.all([
    tex(`textures/${name}/diff.jpg`, true), tex(`textures/${name}/nor.jpg`, false), tex(`textures/${name}/arm.jpg`, false),
  ]);
  return { map, normal, arm };
}

// HDRI에서 가장 밝은 점(해)의 방향을 찾는다
function findSun(t) {
  const { data: raw, width, height } = t.image;
  const h = THREE.DataUtils.fromHalfFloat;
  const data = { length: raw.length };
  const get = (k) => h(raw[k]);
  let best = 0, bi = 0;
  for (let i = 0; i < width * height; i += 3) {
    const l = get(i * 4) * 0.2 + get(i * 4 + 1) * 0.7 + get(i * 4 + 2) * 0.1;
    if (l > best) { best = l; bi = i; }
  }
  const x = bi % width, y = Math.floor(bi / width);
  // 수평선 바로 위(약 3°)의 평균 색 → 안개 색
  const row = Math.floor(height * (0.5 - 3 / 180));
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < width; i++) { const k = (row * width + i) * 4; r += get(k); g += get(k + 1); b += get(k + 2); }
  return { az: (x / width - 0.5) * Math.PI * 2, el: (0.5 - y / height) * Math.PI, horizon: [r / width, g / width, b / width] };
}

export function loadHDR(name) {
  return new Promise((res) => {
    rgbeLoader.load(BASE + `hdri/${name}.hdr`, (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.userData.sun = findSun(t);
      res(t);
    }, undefined, () => res(null));
  });
}

async function model(name) {
  try {
    const g = await gltfLoader.loadAsync(BASE + `models/${name}.glb`);
    return g.scene;
  } catch (_) {
    return null;
  }
}

export async function loadAssets() {
  const [sand, wet, pebble, forest, path, concrete, asphalt, bark, rock, denim, needles, day, rockCluster, rockShelf, lifeJacket, hat, boots] = await Promise.all([
    pbr('sand_01'), pbr('damp_beach_sand'), pbr('dry_river_pebbles'), pbr('forest_leaves_02'), pbr('coast_sand_01'),
    pbr('concrete_floor_worn_001'), pbr('asphalt_02'), pbr('pine_bark'), pbr('rock_boulder_dry'), pbr('denim_fabric'),
    tex('textures/pine_needles/card.png', true),
    loadHDR('kloofendal_48d_partly_cloudy_puresky_2k'),
    model('coast_land_rocks_03'), model('coast_rocks_01'), model('life_jacket'), model('fishermans_hat'), model('rubber_boots'),
  ]);
  const firstMesh = (o, pred = () => true) => { let m = null; o && o.traverse((c) => { if (!m && c.isMesh && pred(c)) m = c; }); return m; };
  return {
    tex: { sand, wet, pebble, forest, path, concrete, asphalt, bark, rock, denim, needles },
    hdr: { day, sunset: null },
    models: {
      rockCluster: firstMesh(rockCluster),
      rockShelf: firstMesh(rockShelf),
      lifeJacket: firstMesh(lifeJacket),
      hat: firstMesh(hat),
      bootL: firstMesh(boots, (c) => /boots_l$/.test(c.name)),
      bootR: firstMesh(boots, (c) => /boots_r$/.test(c.name)),
    },
  };
}
