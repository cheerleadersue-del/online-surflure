// 실사풍 물고기: 비늘·옆줄·지느러미·젖은 광택, 팔딱이는 몸 휘기
import * as THREE from '../vendor/three/three.module.min.js';
import { rng } from './scene.js';

// 어종별 생김새: [등 색, 배 색, 무늬, 몸 높이비, 납작(가자미류), 길쭉(장어)]
const LOOK = {
  광어: { back: '#6b5a44', belly: '#efe9dc', pat: 'spots', h: 0.42, flat: true },
  도다리: { back: '#7a6a50', belly: '#f1ece0', pat: 'spots', h: 0.5, flat: true },
  농어: { back: '#4a5866', belly: '#e9eef1', pat: 'dots', h: 0.24 },
  우럭: { back: '#3b3530', belly: '#a69a8a', pat: 'bands', h: 0.32, spiny: true },
  양태: { back: '#7a6852', belly: '#e8dcc8', pat: 'mottle', h: 0.16 },
  노래미: { back: '#6a5238', belly: '#c9b79a', pat: 'mottle', h: 0.25 },
  쥐노래미: { back: '#6a4a30', belly: '#cdb898', pat: 'mottle', h: 0.25 },
  삼치: { back: '#2f5a74', belly: '#eef2f4', pat: 'rows', h: 0.18 },
  황어: { back: '#4a5a4e', belly: '#f0f0ea', pat: 'stripe', stripe: '#e0782a', h: 0.24 },
  숭어: { back: '#55626a', belly: '#e6eaec', pat: 'lines', h: 0.22 },
  방어: { back: '#2e5c86', belly: '#eef2f5', pat: 'stripe', stripe: '#e6c23a', h: 0.26 },
  보리멸: { back: '#b8ad94', belly: '#f4f1e8', pat: 'none', h: 0.18 },
  붕장어: { back: '#5a4a38', belly: '#e8e0cc', pat: 'eelDots', h: 0.08, eel: true },
  망둥어: { back: '#8a7a5e', belly: '#e0d6c0', pat: 'mottle', h: 0.2 },
  참돔: { back: '#d0626a', belly: '#f6e2de', pat: 'blueDots', h: 0.4 },
  감성돔: { back: '#3e4650', belly: '#d8dde0', pat: 'bands', h: 0.42 },
  볼락: { back: '#6a5040', belly: '#d8c4a8', pat: 'bands', h: 0.33, spiny: true },
  열기: { back: '#c0503a', belly: '#f0c8b0', pat: 'none', h: 0.33, spiny: true },
  // 민물고기
  쏘가리: { back: '#a88a4a', belly: '#efe2bc', pat: 'leopard', h: 0.3, spiny: true },
  꺽지: { back: '#5d5a3a', belly: '#cfc6a0', pat: 'bands', h: 0.34, spiny: true },
  배스: { back: '#4f6a3a', belly: '#e8ead8', pat: 'blotch', h: 0.3 },
  누치: { back: '#8a8a78', belly: '#f2f0e6', pat: 'none', h: 0.22 },
  강준치: { back: '#7f8c94', belly: '#f4f6f6', pat: 'none', h: 0.24 },
  끄리: { back: '#5c6e7a', belly: '#f0e8e0', pat: 'stripe', stripe: '#d77a5a', h: 0.22 },
  블루길: { back: '#4a5a6a', belly: '#e8b060', pat: 'bands', h: 0.5 },
  동자개: { back: '#8a6a2a', belly: '#e8d29a', pat: 'mottle', h: 0.2 },
  메기: { back: '#3a3a34', belly: '#bdb8a8', pat: 'mottle', h: 0.16 },
};
export const fishLook = (name) => LOOK[(name || '').replace(/\(.*\)/, '')] || LOOK.농어;

function skinTexture(look, seed) {
  const fishFlat = !!look.flat;
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(seed);
  // v: 0=배, 0.5=등, 1=배 (몸통을 한 바퀴)
  if (look.flat) {
    // 가자미류: 윗면(눈 쪽)은 갈색, 아랫면은 흰색
    g.fillStyle = look.belly;
    g.fillRect(0, 0, W, H);
    g.fillStyle = look.back;
    g.fillRect(0, H * 0.5, W, H * 0.5);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${r() < 0.6 ? '35,25,15' : '220,205,175'},${0.3 + r() * 0.35})`;
      g.beginPath(); g.arc(r() * W, H * (0.54 + r() * 0.42), 5 + r() * 16, 0, Math.PI * 2); g.fill();
    }
    look = { ...look, pat: 'none' };
  }
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, look.belly);
  gr.addColorStop(0.3, look.belly);
  gr.addColorStop(0.43, look.back);
  gr.addColorStop(0.57, look.back);
  gr.addColorStop(0.7, look.belly);
  gr.addColorStop(1, look.belly);
  g.fillStyle = gr;
  if (!fishFlat) g.fillRect(0, 0, W, H);
  const backY = (k) => H * (0.5 + (k - 0.5) * 0.36);
  const dot = (x, y, rad, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); };
  switch (look.pat) {
    case 'spots':
      for (let i = 0; i < 70; i++) dot(r() * W, backY(r()), 6 + r() * 16, `rgba(${r() < 0.6 ? '40,30,20' : '230,215,190'},${0.35 + r() * 0.3})`);
      break;
    case 'dots':
      for (let i = 0; i < 160; i++) dot(r() * W * 0.85, backY(0.25 + r() * 0.5), 2 + r() * 3, 'rgba(25,30,35,0.55)');
      break;
    case 'bands':
      for (let i = 0; i < 6; i++) {
        g.fillStyle = 'rgba(15,12,10,0.35)';
        const x = W * (0.12 + i * 0.14) + r() * 20;
        g.beginPath(); g.ellipse(x, H / 2, 26 + r() * 20, H * 0.22, 0, 0, Math.PI * 2); g.fill();
      }
      break;
    case 'mottle':
      for (let i = 0; i < 220; i++) dot(r() * W, backY(r()), 4 + r() * 14, `rgba(${r() < 0.5 ? '35,25,15' : '200,180,150'},${0.15 + r() * 0.3})`);
      break;
    case 'rows':
      for (let row = 0; row < 4; row++) for (let i = 0; i < 40; i++) dot(W * 0.08 + i * 22 + r() * 6, backY(0.3 + row * 0.12), 4, 'rgba(20,40,55,0.6)');
      break;
    case 'stripe':
      g.fillStyle = look.stripe;
      g.globalAlpha = 0.8;
      g.fillRect(W * 0.05, H * 0.36, W * 0.85, H * 0.035);
      g.fillRect(W * 0.05, H * 0.605, W * 0.85, H * 0.035);
      g.globalAlpha = 1;
      break;
    case 'lines':
      g.strokeStyle = 'rgba(40,50,60,0.35)';
      g.lineWidth = 4;
      for (let k = 0; k < 6; k++) { const y = backY(0.2 + k * 0.12); g.beginPath(); g.moveTo(W * 0.1, y); g.lineTo(W * 0.9, y); g.stroke(); }
      break;
    case 'leopard':
      for (let i = 0; i < 120; i++) {
        g.fillStyle = `rgba(${r() < 0.7 ? '40,30,15' : '70,55,25'},${0.55 + r() * 0.3})`;
        g.beginPath(); g.ellipse(r() * W * 0.9, backY(0.15 + r() * 0.7), 6 + r() * 12, 4 + r() * 9, r() * 3, 0, Math.PI * 2); g.fill();
      }
      break;
    case 'blotch':
      g.fillStyle = 'rgba(25,35,20,0.6)';
      for (let i = 0; i < 16; i++) { g.beginPath(); g.ellipse(W * (0.12 + i * 0.05), H * (0.5 + Math.sin(i) * 0.03), 22, 14, 0, 0, Math.PI * 2); g.fill(); }
      break;
    case 'blueDots':
      for (let i = 0; i < 90; i++) dot(r() * W * 0.85, backY(0.15 + r() * 0.7), 3 + r() * 2, 'rgba(80,170,240,0.85)');
      break;
    case 'eelDots':
      for (let i = 0; i < 40; i++) dot(W * 0.06 + i * 23, H * 0.36, 4, 'rgba(250,250,240,0.9)');
      for (let i = 0; i < 40; i++) dot(W * 0.06 + i * 23, H * 0.64, 4, 'rgba(250,250,240,0.9)');
      break;
    default:
  }
  // 옆줄
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 3;
  [0.38, 0.62].forEach((v) => { g.beginPath(); g.moveTo(W * 0.12, H * v); g.quadraticCurveTo(W * 0.5, H * (v + (v < 0.5 ? -0.03 : 0.03)), W * 0.92, H * (v < 0.5 ? 0.45 : 0.55)); g.stroke(); });
  // 아가미 덮개
  g.strokeStyle = 'rgba(30,25,20,0.45)';
  g.lineWidth = 5;
  [0.25, 0.75].forEach((v) => { g.beginPath(); g.arc(W * 0.1, H * v, H * 0.13, -1.2, 1.2); g.stroke(); });
  // 비늘 (반달 무늬)
  const sc = document.createElement('canvas');
  sc.width = W; sc.height = H;
  const s = sc.getContext('2d');
  s.fillStyle = '#808080';
  s.fillRect(0, 0, W, H);
  const step = look.eel ? 0 : 11;
  if (step) {
    for (let y = 0; y < H + step; y += step * 0.75) {
      for (let x = W * 0.14; x < W * 0.9; x += step) {
        const ox = (Math.round(y / (step * 0.75)) % 2) * step * 0.5;
        const grd = s.createRadialGradient(x + ox - 3, y, 1, x + ox - 3, y, step * 0.75);
        grd.addColorStop(0, '#b0b0b0');
        grd.addColorStop(0.8, '#7a7a7a');
        grd.addColorStop(1, '#3a3a3a');
        s.fillStyle = grd;
        s.beginPath(); s.arc(x + ox, y, step * 0.72, Math.PI * 0.5, Math.PI * 1.5, true); s.fill();
      }
    }
  }
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.55;
  g.drawImage(sc, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  // 비늘 결 → 법선 맵
  const bump = new THREE.CanvasTexture(sc);
  return { map, bump };
}

function finTexture(col) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, col);
  gr.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(60,45,35,0.28)';
  g.lineWidth = 1.5;
  for (let x = 6; x < 256; x += 10) { g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 8, 0); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 몸 휘기를 셰이더에 넣는다 (모든 부위가 같은 물결로 움직이게)
function addBend(mat, uni, L) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBendT = uni.t;
    sh.uniforms.uBendA = uni.a;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uBendT, uBendA;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float bu = clamp((transformed.x + ${(L * 0.5).toFixed(3)}) / ${L.toFixed(3)}, 0.0, 1.0);
        transformed.z += uBendA * sin(uBendT - bu * 4.0) * bu * bu * ${(L * 0.35).toFixed(3)};`);
  };
}

export function makeRealFish(name, seed = 1) {
  const look = fishLook(name);
  const L = 1; // 길이 1 기준, 바깥에서 cm로 크기 조절
  const group = new THREE.Group();
  const uni = { t: { value: 0 }, a: { value: 0 } };
  group.userData.bend = uni;
  const { map, bump } = skinTexture(look, seed);
  const body = new THREE.MeshPhysicalMaterial({
    map, bumpMap: bump, bumpScale: 0.6, roughness: 0.32, metalness: 0.12,
    clearcoat: 0.9, clearcoatRoughness: 0.18, iridescence: look.flat ? 0.1 : 0.45, iridescenceIOR: 1.6, sheen: 0.3,
  });
  addBend(body, uni, L);
  // 몸통: 머리(-x)→꼬리(+x), 옆으로 납작한 단면
  const nu = 48, nv = 32;
  const pos = [], uv = [], idx = [];
  const H = look.h;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const x = -L / 2 + u * L * 0.86;
    let h = H * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(u, 0.75) * 0.97)), 0.8);
    h = Math.max(h, H * 0.18 * (u > 0.8 ? 1 : 0)) + 0.012;
    if (look.eel) h = H * (u < 0.1 ? Math.sin((u / 0.1) * Math.PI / 2) : 1 - (u - 0.1) * 0.6);
    const w = look.flat ? h * 0.22 : h * (look.eel ? 0.9 : 0.42) * (1 - u * 0.5);
    for (let j = 0; j <= nv; j++) {
      const a = (j / nv) * Math.PI * 2;
      let y = Math.cos(a) * h * 0.5, z = Math.sin(a) * w * 0.5;
      if (look.flat) { const t = y; y = z; z = t; } // 가자미류는 눕혀서
      pos.push(x, y, z);
      uv.push(u * 0.86 + 0.06, j / nv);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  bg.setIndex(idx);
  bg.computeVertexNormals();
  const bodyMesh = new THREE.Mesh(bg, body);
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // 지느러미
  const finCol = look.pat === 'blueDots' ? 'rgba(220,120,130,0.9)' : look.pat === 'stripe' && look.stripe === '#e6c23a' ? 'rgba(220,190,60,0.9)' : 'rgba(110,100,90,0.85)';
  const finM = new THREE.MeshPhysicalMaterial({ map: finTexture(finCol), transparent: true, opacity: 0.8, side: THREE.DoubleSide, roughness: 0.35, clearcoat: 0.6, depthWrite: false });
  addBend(finM, uni, L);
  const fin = (pts, z = 0) => {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(([x, y]) => sh.lineTo(x, y));
    sh.closePath();
    const g = new THREE.ShapeGeometry(sh);
    // uv: 지느러미 줄기 방향
    const p = g.attributes.position, u = g.attributes.uv;
    g.computeBoundingBox();
    const bb = g.boundingBox;
    for (let i = 0; i < p.count; i++) u.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x + 1e-6), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y + 1e-6));
    const m = new THREE.Mesh(g, finM);
    m.position.z = z;
    if (look.flat) m.rotation.x = Math.PI / 2;
    group.add(m);
    return m;
  };
  const top = H * 0.5;
  if (look.flat) {
    // 가자미류: 몸 둘레를 감싸는 지느러미
    fin([[-0.32, top * 0.6], [0.3, top * 0.55], [0.36, top * 0.95], [-0.2, top * 1.2]]);
    fin([[-0.3, -top * 0.6], [0.3, -top * 0.55], [0.36, -top * 0.95], [-0.2, -top * 1.2]]);
  } else if (!look.eel) {
    const spike = look.spiny ? 1.25 : 1;
    fin([[-0.22, top * 0.85], [0.02, top * 0.92], [0.03, top * (1.3 * spike)], [-0.18, top * (1.4 * spike)]]);
    fin([[0.06, top * 0.8], [0.25, top * 0.45], [0.2, top * 1.05]]);
    fin([[0.08, -top * 0.75], [0.25, -top * 0.42], [0.18, -top * 1.0]]);
    const pec = fin([[-0.3, -top * 0.15], [-0.14, -top * 0.5], [-0.12, -top * 0.05]], H * 0.2);
    pec.rotation.y = 0.5;
  } else {
    fin([[-0.35, top * 0.9], [0.45, top * 0.9], [0.48, top * 1.6], [-0.3, top * 1.6]]);
  }
  // 꼬리 (갈라진 모양)
  const tx = L * 0.36;
  const th = look.eel ? H * 0.8 : Math.max(0.12, H * 0.75);
  fin([[tx, 0], [tx + 0.16, th * 0.75], [tx + 0.12, th * 0.15], [tx + 0.08, 0], [tx + 0.12, -th * 0.15], [tx + 0.16, -th * 0.75]]);

  // 눈 (볼록한 유리질)
  const eyeR = look.flat ? 0.022 : Math.max(0.012, H * 0.075);
  const irisM = new THREE.MeshPhysicalMaterial({ color: look.pat === 'blueDots' ? '#e8c060' : '#d8c890', roughness: 0.2, clearcoat: 1, metalness: 0.4 });
  const pupilM = new THREE.MeshPhysicalMaterial({ color: '#050505', roughness: 0.05, clearcoat: 1 });
  const ex = -L * 0.38, ey = look.flat ? 0 : H * 0.12;
  const eyes = look.flat ? [[ex + 0.06, H * 0.08, 0.035], [ex + 0.1, H * 0.12, 0.03]] : [[ex, ey, 1], [ex, ey, -1]];
  eyes.forEach(([x, y, side]) => {
    const e = new THREE.Group();
    const iris = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 16, 12), irisM);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.62, 16, 12), pupilM);
    if (look.flat) { e.position.set(x, side, y); pupil.position.y = eyeR * 0.45; }
    else { e.position.set(x, y, side * H * 0.125); pupil.position.z = side * eyeR * 0.45; }
    e.add(iris, pupil);
    group.add(e);
  });
  return group;
}

// 팔딱팔딱: 땅 위에서 튀어오르며 몸을 휜다
export function flop(fish, t, base, sizeM) {
  const u = fish.userData.bend;
  const ph = t * 1.7;
  const k = ph % 1;
  const jump = k < 0.35 ? Math.sin((k / 0.35) * Math.PI) : 0;
  u.t.value = t * 22;
  u.a.value = 0.25 + jump * 0.9;
  fish.position.set(base.x, base.y + 0.06 + jump * (0.25 + sizeM * 0.4), base.z);
  const side = Math.floor(ph / 3) % 2 ? 1 : -1;
  fish.rotation.set(Math.PI / 2 * side + jump * side * 0.6, base.yaw + Math.sin(t * 3) * 0.2, jump * 0.5);
}
