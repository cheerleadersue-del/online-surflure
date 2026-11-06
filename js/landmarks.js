// 포인트를 상징하는 배경 건축물·풍경 (단순화한 모형)
import * as THREE from '../vendor/three/three.module.min.js';
import { rng } from './scene.js';
import { labelTexture } from './textures.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

export class Landmarks {
  constructor(scene, heightAt, assets) {
    this.scene = scene;
    this.h = heightAt;
    this.assets = assets;
    this.anim = [];
    this.r = rng(99);
  }

  add(obj, x, z, yOff = 0) {
    obj.position.set(x, this.h(x, z) + yOff, z);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(obj);
    return obj;
  }

  update(t) { this.anim.forEach((fn) => fn(t)); }

  mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (parent) parent.add(m);
    return m;
  }

  // 창문이 있는 벽 질감
  windowsTex(base = '#efe9df', win = '#4b6a86', cols = 4, rows = 3) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    g.fillStyle = win;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) g.fillRect(20 + i * (216 / cols), 24 + j * (220 / rows), 216 / cols - 18, 220 / rows - 30);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  house(w, d, h, wall, roof, parent, x = 0, z = 0) {
    const g = new THREE.Group();
    this.mesh(new THREE.BoxGeometry(w, h, d), std(wall, { map: this.windowsTex(wall, '#3e5468', 2, 1) }), 0, h / 2, 0, g);
    const rf = this.mesh(new THREE.CylinderGeometry(0.01, Math.max(w, d) * 0.75, h * 0.6, 4), std(roof), 0, h + h * 0.3, 0, g);
    rf.rotation.y = Math.PI / 4;
    rf.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
    g.position.set(x, 0, z);
    if (parent) parent.add(g);
    return g;
  }

  // 화진포: 언덕 위 돌로 지은 별장
  villa(x, z) {
    const g = new THREE.Group();
    const stone = std('#9a948a', { map: this.assets ? this.assets.tex.rock.map : null });
    this.mesh(new THREE.BoxGeometry(9, 6, 6), stone, 0, 3, 0, g);
    this.mesh(new THREE.CylinderGeometry(2, 2, 9, 12), stone, 4.5, 4.5, 0, g);
    this.mesh(new THREE.ConeGeometry(2.4, 3, 12), std('#5a3b2e'), 4.5, 10.5, 0, g);
    const roof = this.mesh(new THREE.CylinderGeometry(0.1, 6.5, 2.6, 4), std('#5a3b2e'), -0.5, 7.3, 0, g);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.7;
    this.add(g, x, z, -0.3);
  }

  // 속초해수욕장: 대관람차
  wheel(x, z) {
    const g = new THREE.Group();
    const steel = std('#e8ecef', { metalness: 0.5, roughness: 0.4 });
    const R = 18;
    [-1, 1].forEach((s) => {
      [-1, 1].forEach((k) => {
        const leg = this.mesh(new THREE.CylinderGeometry(0.35, 0.5, R + 4, 8), steel, k * 5, (R + 4) / 2, s * 2.2, g);
        leg.rotation.z = -k * 0.27;
      });
    });
    const rot = new THREE.Group();
    rot.position.y = R + 3;
    g.add(rot);
    [-1.2, 1.2].forEach((zz) => this.mesh(new THREE.TorusGeometry(R, 0.25, 8, 64), steel, 0, 0, zz, rot));
    const colors = ['#ff5a5a', '#ffd23a', '#4cc9f0', '#7ad17a', '#c77dff', '#ff9f43'];
    const cabins = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const sp = this.mesh(new THREE.CylinderGeometry(0.08, 0.08, R, 4), steel, Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0, rot);
      sp.rotation.z = a + Math.PI / 2;
      const cab = this.mesh(new THREE.CapsuleGeometry(0.9, 0.8, 4, 10), std(colors[i % colors.length], { roughness: 0.4 }), 0, 0, 0, this.scene);
      cabins.push({ cab, a });
    }
    this.mesh(new THREE.CylinderGeometry(1, 1, 3, 16), steel, 0, 0, 0, rot).rotation.x = Math.PI / 2;
    this.add(g, x, z, 0);
    const base = g.position.clone();
    rot.rotation.y = 0;
    g.rotation.y = 0.35;
    this.anim.push((t) => {
      rot.rotation.z = t * 0.06;
      cabins.forEach(({ cab, a }) => {
        const aa = a + t * 0.06;
        const lx = Math.cos(aa) * R, ly = Math.sin(aa) * R;
        const v = new THREE.Vector3(lx, ly + R + 3 - 1.4, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35);
        cab.position.set(base.x + v.x, base.y + v.y, base.z + v.z);
      });
    });
  }

  // 낙산: 언덕 위 하얀 해수관음상
  statue(x, z) {
    const g = new THREE.Group();
    const white = std('#f3f1ea', { roughness: 0.6 });
    this.mesh(new THREE.CylinderGeometry(3.4, 4, 2.4, 8), std('#c9c3b5'), 0, 1.2, 0, g);
    this.mesh(new THREE.CylinderGeometry(2.6, 3, 1.2, 16), white, 0, 3, 0, g); // 연꽃 받침
    this.mesh(new THREE.CylinderGeometry(1.1, 2.1, 11, 20), white, 0, 9, 0, g); // 옷자락
    this.mesh(new THREE.SphereGeometry(1.25, 20, 16), white, 0, 15.6, 0, g);
    this.mesh(new THREE.CylinderGeometry(0.5, 0.9, 1.3, 12), white, 0, 17.2, 0, g); // 보관
    this.mesh(new THREE.CapsuleGeometry(0.35, 3, 4, 8), white, 1.25, 11.5, 0.3, g).rotation.z = 0.25;
    this.mesh(new THREE.CapsuleGeometry(0.35, 3, 4, 8), white, -1.25, 11.5, 0.3, g).rotation.z = -0.25;
    g.rotation.y = Math.PI; // 바다를 바라보게
    this.add(g, x, z, -0.4);
  }

  // 정자 (경포대·영금정 느낌의 한옥 정자)
  pavilion(x, z, s = 1, onRocks = false) {
    const g = new THREE.Group();
    const red = std('#9b2d22', { roughness: 0.7 });
    const roofM = std('#3d4650', { roughness: 0.6 });
    let base = 0;
    if (onRocks) {
      const rockM = std('#8b7d6b', { map: this.assets ? this.assets.tex.rock.map : null, roughness: 0.95 });
      for (let i = 0; i < 6; i++) {
        const rk = this.mesh(new THREE.DodecahedronGeometry(3 + this.r() * 2, 1), rockM, (this.r() - 0.5) * 6, 1 + this.r() * 2, (this.r() - 0.5) * 6, g);
        rk.scale.y = 0.7;
      }
      base = 5;
    }
    this.mesh(new THREE.BoxGeometry(8 * s, 0.6, 8 * s), std('#bdb6a8'), 0, base + 0.3, 0, g);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      this.mesh(new THREE.CylinderGeometry(0.22 * s, 0.25 * s, 3.4 * s, 10), red, Math.cos(a) * 3.3 * s, base + 0.6 + 1.7 * s, Math.sin(a) * 3.3 * s, g);
    }
    this.mesh(new THREE.CylinderGeometry(3.6 * s, 3.6 * s, 0.5 * s, 8), std('#4a7a6a'), 0, base + 4.2 * s, 0, g); // 단청 띠
    const roof = this.mesh(new THREE.ConeGeometry(6.2 * s, 2.6 * s, 8, 1, true), roofM, 0, base + 5.6 * s, 0, g);
    roof.material.side = THREE.DoubleSide;
    // 처마 끝이 살짝 들린 모양
    const p = roof.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) + (Math.abs(Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 4)) * 0.6) * s);
    roof.geometry.computeVertexNormals();
    this.mesh(new THREE.SphereGeometry(0.4 * s, 10, 8), roofM, 0, base + 7 * s, 0, g);
    this.add(g, x, z, -0.2);
  }

  // 망상: 알록달록 캠핑 오두막
  cabins(x, z) {
    const g = new THREE.Group();
    const cols = ['#e76f51', '#2a9d8f', '#e9c46a', '#f4a261', '#8ecae6', '#a8dadc'];
    for (let i = 0; i < 9; i++) {
      const hx = i * 7 + this.r() * 2, hz = (i % 2) * 6;
      const hgt = this.h(x + hx, z + hz) - this.h(x, z);
      const hs = this.house(4.5, 4, 3, cols[i % cols.length], '#5a4636', g, hx, hz);
      hs.position.y = hgt;
    }
    this.add(g, x, z);
  }

  // 삼척: 하얀 벽, 파란 돔 리조트
  resort(x, z) {
    const g = new THREE.Group();
    const wall = std('#f7f7f4', { map: this.windowsTex('#f7f7f4', '#5d8fc2', 5, 4), roughness: 0.6 });
    const blue = std('#1f5fb0', { roughness: 0.35 });
    [[0, 0, 26, 14, 10], [24, 6, 18, 11, 9], [-20, 8, 16, 9, 9]].forEach(([dx, dz, w, h, d]) => {
      this.mesh(new THREE.BoxGeometry(w, h, d), wall, dx, h / 2, dz, g);
      this.mesh(new THREE.SphereGeometry(2.6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), blue, dx + w * 0.25, h, dz, g);
    });
    this.add(g, x, z, -0.5);
  }

  // 등대 (흰 등대 / 탑형)
  lighthouse(x, z, color = '#f4f2ec', tower = false) {
    const g = new THREE.Group();
    const rockM = std('#9a978f', { roughness: 0.95 });
    for (let i = 0; i < 8; i++) this.mesh(new THREE.DodecahedronGeometry(1.6, 0), rockM, (this.r() - 0.5) * 6, -0.3 + this.r(), (this.r() - 0.5) * 6, g);
    const body = std(color, { roughness: 0.5 });
    const h = tower ? 15 : 10;
    this.mesh(new THREE.CylinderGeometry(tower ? 1.4 : 1.0, tower ? 1.8 : 1.3, h, tower ? 8 : 20), body, 0, h / 2 + 0.8, 0, g);
    this.mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 16), body, 0, h + 0.9, 0, g);
    this.mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 16), std('#fff6c8', { emissive: '#ffe58a', emissiveIntensity: 0.3 }), 0, h + 1.6, 0, g);
    this.mesh(new THREE.ConeGeometry(1, 1, 16), color === '#f4f2ec' ? std('#2a6b3a') : body, 0, h + 2.7, 0, g);
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
  }

  // 안목: 바닷가 카페 거리
  cafes(x, z) {
    const g = new THREE.Group();
    const cols = ['#e9d8c4', '#c9b8a0', '#f0f0ea', '#d8c2b0', '#9fb5c8', '#efe2d0'];
    for (let i = 0; i < 8; i++) {
      const h = 8 + this.r() * 10, w = 7 + this.r() * 3;
      this.mesh(new THREE.BoxGeometry(w, h, 8), std(cols[i % cols.length], { map: this.windowsTex(cols[i % cols.length], '#2f3b46', 3, 3), roughness: 0.6 }), i * 9, h / 2, 0, g);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), new THREE.MeshBasicMaterial({ map: labelTexture(['☕ 커피거리'], { border: '#6b4a2b', w: 512, h: 120 }), toneMapped: false }));
    sign.position.set(30, 6, -4.1);
    sign.rotation.y = Math.PI;
    g.add(sign);
    this.add(g, x, z, -0.3);
  }

  // 임원: 절벽 위 빨간 등대
  cliff(x, z) {
    const g = new THREE.Group();
    const rockM = std('#7d6f60', { map: this.assets ? this.assets.tex.rock.map : null, roughness: 0.95 });
    for (let i = 0; i < 10; i++) {
      const rk = this.mesh(new THREE.DodecahedronGeometry(6 + this.r() * 4, 1), rockM, (this.r() - 0.5) * 20, 3 + this.r() * 10, (this.r() - 0.5) * 10, g);
      rk.scale.y = 1.4;
    }
    this.mesh(new THREE.CylinderGeometry(1, 1.3, 9, 20), std('#d0302b', { roughness: 0.5 }), 0, 24, 0, g);
    this.mesh(new THREE.ConeGeometry(1.1, 1.2, 16), std('#d0302b'), 0, 29.2, 0, g);
    this.add(g, x, z, -2);
  }

  // 어선 무리 (오징어배는 집어등 줄)
  boats(x, z, n, squid = false) {
    for (let i = 0; i < n; i++) {
      const b = fishingBoat(this.r, squid);
      b.position.set(x + (i % 5) * 9 + this.r() * 2, 0, z - Math.floor(i / 5) * 9 - this.r() * 2);
      b.rotation.y = Math.PI / 2 + (this.r() - 0.5) * 0.3;
      this.scene.add(b);
      const ph = this.r() * 6;
      this.anim.push((t) => { b.position.y = Math.sin(t * 1.1 + ph) * 0.12; b.rotation.z = Math.sin(t * 0.9 + ph) * 0.03; });
    }
  }

  // 수산시장: 긴 건물과 간판
  market(x, z) {
    const g = new THREE.Group();
    this.mesh(new THREE.BoxGeometry(46, 7, 14), std('#e8e4da', { map: this.windowsTex('#e8e4da', '#3d5a74', 8, 1) }), 0, 3.5, 0, g);
    const roof = this.mesh(new THREE.CylinderGeometry(7.5, 7.5, 46, 16, 1, false, 0, Math.PI), std('#2f6fb0', { roughness: 0.4, side: THREE.DoubleSide }), 0, 7, 0, g);
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(1, 1, 0.5);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3), new THREE.MeshBasicMaterial({ map: labelTexture(['🐟 수산시장'], { border: '#1f3b73', w: 640, h: 120 }), toneMapped: false }));
    sign.position.set(0, 5.6, -7.05);
    sign.rotation.y = Math.PI;
    g.add(sign);
    this.add(g, x, z, -0.3);
  }

  // 묵호: 언덕 위 알록달록 마을 + 하얀 등대
  village(x, z) {
    const cols = ['#f4a261', '#e9c46a', '#8ecae6', '#ffb4a2', '#cdeac0', '#ffffff', '#bde0fe'];
    for (let i = 0; i < 45; i++) {
      const hx = x - 30 + this.r() * 70, hz = z - 10 + this.r() * 45;
      const g = this.house(3 + this.r() * 2, 3 + this.r() * 1.5, 2.5 + this.r() * 1.5, cols[i % cols.length], this.r() < 0.5 ? '#c0504d' : '#3f6e9e');
      g.rotation.y = (this.r() - 0.5) * 0.4;
      this.add(g, hx, hz, -0.2);
    }
    this.lighthouse(x + 20, z + 50, '#f4f2ec');
    const top = this.scene.children[this.scene.children.length - 1];
    top.position.y = this.h(x + 20, z + 50);
  }

  // 구룡포: 과메기 덕장 (매달린 생선)
  racks(x, z) {
    const wood = std('#7a5a3a');
    const fishM = std('#3a3530', { metalness: 0.4, roughness: 0.4 });
    for (let k = 0; k < 4; k++) {
      const g = new THREE.Group();
      [-6, 6].forEach((dx) => this.mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), wood, dx, 1.6, 0, g));
      [2.9, 2.3, 1.7].forEach((y) => {
        this.mesh(new THREE.CylinderGeometry(0.05, 0.05, 12, 6), wood, 0, y, 0, g).rotation.z = Math.PI / 2;
        for (let i = 0; i < 26; i++) {
          const f = this.mesh(new THREE.CapsuleGeometry(0.06, 0.45, 3, 6), fishM, -5.6 + i * 0.45, y - 0.32, 0, g);
          f.rotation.z = (this.r() - 0.5) * 0.2;
        }
      });
      this.add(g, x + k * 3, z + k * 4);
    }
  }

  // 후포: 바다로 뻗은 스카이워크 + 언덕 위 등대
  skywalk(x, z) {
    const g = new THREE.Group();
    const steel = std('#dfe3e6', { metalness: 0.4, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: '#9fd3ef', transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.3 });
    const len = 80;
    this.mesh(new THREE.BoxGeometry(3, 0.25, len), glass, 0, 9, -len / 2, g);
    [-1.5, 1.5].forEach((dx) => this.mesh(new THREE.BoxGeometry(0.1, 1.1, len), glass, dx, 9.6, -len / 2, g));
    for (let i = 0; i <= 8; i++) this.mesh(new THREE.CylinderGeometry(0.5, 0.6, 12, 10), steel, 0, 3, -i * (len / 8), g);
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
    this.lighthouse(x + 10, z + 40, '#f4f2ec');
  }

  // ── 강을 건너는 다리 ── type: girder · freedom · old · arch · cable · low
  bridge(type, X, z0, z1, color = '#f4f4f0') {
    const g = new THREE.Group();
    const conc = std('#cfcbc2', { map: this.assets ? this.assets.tex.concrete.map : null, roughness: 0.9 });
    const len = z0 - z1, cz = (z0 + z1) / 2;
    const deckY = type === 'low' ? 0.7 : type === 'old' ? 4 : type === 'freedom' ? 3 : 10;
    const width = type === 'freedom' ? 3 : type === 'old' || type === 'low' ? 6 : 14;
    // 상판
    const deckM = type === 'freedom' ? std('#8a6a48') : conc;
    this.mesh(new THREE.BoxGeometry(width, type === 'low' ? 0.6 : 1.4, len), deckM, 0, deckY, cz, g);
    // 교각
    const span = type === 'girder' ? 22 : type === 'old' || type === 'low' ? 7 : type === 'freedom' ? 9 : 30;
    for (let z = z0 - span / 2; z > z1; z -= span) {
      const h = deckY + 4;
      if (type === 'low') this.mesh(new THREE.BoxGeometry(width, 1.4, 1.2), conc, 0, 0, z, g);
      else this.mesh(new THREE.BoxGeometry(type === 'freedom' ? 0.5 : width * 0.6, h, type === 'freedom' ? 0.5 : 2.2), type === 'freedom' ? std('#6a5038') : conc, 0, deckY - h / 2, z, g);
    }
    // 난간
    if (type !== 'low') [-1, 1].forEach((s) => this.mesh(new THREE.BoxGeometry(0.15, 1, len), std(type === 'freedom' ? '#6a5038' : '#9aa3ad'), s * (width / 2 - 0.1), deckY + 1.1, cz, g));
    if (type === 'freedom') {
      // 옛 철교 교각 (부서진 다리)
      for (let z = z0 - 6; z > z1 + 6; z -= 16) this.mesh(new THREE.BoxGeometry(5, 12, 3), std('#9a8f80'), -14, 0, z, g);
      for (let k = 0; k < 3; k++) {
        const t = this.mesh(new THREE.BoxGeometry(4, 4, 15), std('#4a4a4a', { metalness: 0.5, wireframe: true }), -14, 8, z0 - 14 - k * 16, g);
        t.material.wireframe = true;
      }
    }
    if (type === 'arch') {
      // 큰 아치 두 줄 + 행어
      const am = std(color, { roughness: 0.4, metalness: 0.2 });
      [-1, 1].forEach((s) => {
        const arc = this.mesh(new THREE.TorusGeometry(len * 0.35, 0.6, 10, 60, Math.PI), am, s * (width / 2), deckY, cz, g);
        arc.rotation.y = Math.PI / 2;
        for (let k = 1; k < 10; k++) {
          const a = (k / 10) * Math.PI;
          const zz = cz + Math.cos(a) * len * 0.35, hh = Math.sin(a) * len * 0.35;
          this.mesh(new THREE.CylinderGeometry(0.06, 0.06, hh, 4), am, s * (width / 2), deckY + hh / 2, zz, g);
        }
      });
    }
    if (type === 'cable') {
      // 주탑과 사장 케이블
      const tm = std('#e9e9e4', { roughness: 0.6 });
      const tz = cz;
      [-1, 1].forEach((s) => this.mesh(new THREE.BoxGeometry(1.4, 34, 2), tm, s * (width / 2 + 0.5), deckY + 12, tz, g));
      this.mesh(new THREE.BoxGeometry(width + 3, 1.6, 2), tm, 0, deckY + 28, tz, g);
      const cm = new THREE.LineBasicMaterial({ color: '#dfe3e6' });
      [-1, 1].forEach((s) => {
        for (let k = 1; k <= 8; k++) {
          for (const dir of [-1, 1]) {
            const pts = [new THREE.Vector3(s * (width / 2 + 0.5), deckY + 26 - k * 0.6, tz), new THREE.Vector3(s * (width / 2), deckY + 0.7, tz + dir * k * (len / 18))];
            g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cm));
          }
        }
      });
    }
    if (type === 'low') {
      // 잠수교 위로 넘실대는 물
      const flow = this.mesh(new THREE.PlaneGeometry(width + 2, len), new THREE.MeshStandardMaterial({ color: '#e8f2f2', transparent: true, opacity: 0.35 }), 0, 1.05, cz, g);
      flow.rotation.x = -Math.PI / 2;
      this.anim.push((t) => { flow.material.opacity = 0.25 + 0.15 * Math.sin(t * 3); });
    }
    g.position.set(X, 0, 0);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
  }

  // 소양강 스카이워크: 강 위로 뻗은 유리 데크와 쏘가리 조형물
  riverSkywalk(X, zShore, len) {
    const g = new THREE.Group();
    const steel = std('#e6e8ea', { metalness: 0.4, roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: '#a7d8ef', transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.3 });
    this.mesh(new THREE.BoxGeometry(4, 0.25, len), glass, 0, 4, -len / 2, g);
    [-2, 2].forEach((dx) => this.mesh(new THREE.BoxGeometry(0.1, 1.1, len), glass, dx, 4.6, -len / 2, g));
    for (let i = 0; i <= 4; i++) this.mesh(new THREE.CylinderGeometry(0.35, 0.4, 8, 10), steel, 0, 0, -i * (len / 4), g);
    // 쏘가리 조형물 (금빛 물고기)
    const gold = std('#d8b04a', { metalness: 0.8, roughness: 0.3 });
    const fish = this.mesh(new THREE.SphereGeometry(2.4, 20, 14), gold, 6, 6, 4, g);
    fish.scale.set(1.8, 0.8, 0.5);
    const tail = this.mesh(new THREE.ConeGeometry(1.4, 2.4, 4), gold, 10.4, 6.4, 4, g);
    tail.rotation.z = Math.PI / 2;
    this.mesh(new THREE.CylinderGeometry(0.3, 0.3, 4, 8), steel, 6, 2, 4, g);
    g.position.set(X, 0, zShore + 3);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
  }

  // 소양강처녀상: 강변 받침대 위 여인상
  maiden(X, Z) {
    const g = new THREE.Group();
    const stone = std('#cfc8ba');
    const bronze = std('#8a7a5a', { metalness: 0.5, roughness: 0.45 });
    this.mesh(new THREE.CylinderGeometry(2.4, 2.8, 2.4, 16), stone, 0, 1.2, 0, g);
    this.mesh(new THREE.CylinderGeometry(0.5, 1.3, 4.4, 16), bronze, 0, 4.6, 0, g); // 치마
    this.mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.6, 12), bronze, 0, 7.5, 0, g);
    this.mesh(new THREE.SphereGeometry(0.42, 16, 12), bronze, 0, 8.7, 0, g);
    this.mesh(new THREE.SphereGeometry(0.3, 12, 10), bronze, 0, 8.9, -0.35, g); // 쪽진 머리
    g.rotation.y = Math.PI;
    this.add(g, X, Z, -0.2);
  }
}

// 작은 어선 (선실·마스트·집어등)
function fishingBoat(r, squid) {
  const g = new THREE.Group();
  const hullC = ['#2b5fa6', '#c8262d', '#2a9d8f', '#f2f1ea'][Math.floor(r() * 4)];
  const shape = new THREE.Shape();
  shape.moveTo(-1.6, -4); shape.lineTo(1.6, -4); shape.lineTo(1.7, 2); shape.quadraticCurveTo(1, 4.2, 0, 5.2); shape.quadraticCurveTo(-1, 4.2, -1.7, 2); shape.closePath();
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false }), std('#f3f1ea', { roughness: 0.5 }));
  hull.rotation.x = -Math.PI / 2;
  hull.position.y = -0.5;
  const band = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }), std(hullC));
  band.rotation.x = -Math.PI / 2;
  band.position.y = -0.45;
  band.scale.set(1.02, 1.01, 1);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.2), std('#f6f4ee'));
  cabin.position.set(0, 1.8, 1);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 6), std('#d9d9d9'));
  mast.position.set(0, 3.4, -0.8);
  g.add(hull, band, cabin, mast);
  if (squid) {
    const bulbM = new THREE.MeshStandardMaterial({ color: '#fff6c8', emissive: '#ffe9a0', emissiveIntensity: 0.6 });
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bulbM);
      b.position.set(0, 1.6, -3.5 + i * 0.9);
      g.add(b);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
