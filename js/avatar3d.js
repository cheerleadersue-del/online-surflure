// 귀여운 꼬마 낚시꾼 3D 아바타 (큰 머리·동글동글한 몸, 직접 디자인)
import * as THREE from '../vendor/three/three.module.min.js';
import { nameTexture, bubbleTexture } from './textures.js';

const SKIN = '#f6d2b4';
const fabric = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.75, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff') });
const toy = (color, rough = 0.45) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.25, clearcoatRoughness: 0.5 });

export class Avatar {
  static assets = null;

  constructor(look, name, { small = false } = {}) {
    this.group = new THREE.Group();
    this.small = small;
    this.build(look, name);
  }

  build(look, name) {
    const G = this.group;
    while (G.children.length) G.remove(G.children[0]);
    this.look = { ...look };
    const skin = toy(SKIN, 0.55);
    const jacket = fabric(look.jacket || '#f26b1d');
    const pants = fabric(look.pantsColor || '#4b5136');
    const boot = toy(look.pants === 'wader' ? '#3d4a33' : '#5a4636', 0.35);
    const hatM = fabric(look.hatColor || '#1f3b73');
    const add = (parent, geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const sph = (r, w = 24, h = 18) => new THREE.SphereGeometry(r, w, h);

    // 몸 전체를 흔들기 위한 뿌리
    const root = (this.root = new THREE.Group());
    G.add(root);

    // 다리 + 장화
    this.legs = [-1, 1].map((s) => {
      const p = new THREE.Group();
      p.position.set(s * 0.085, 0.3, 0);
      root.add(p);
      add(p, new THREE.CapsuleGeometry(0.06, 0.1, 6, 12), look.pants === 'shorts' ? skin : pants, 0, -0.11, 0);
      if (look.pants === 'shorts') add(p, new THREE.CapsuleGeometry(0.068, 0.04, 6, 12), pants, 0, -0.02, 0);
      add(p, sph(0.075), boot, 0, -0.22, 0.025, 1, 0.75, 1.35);
      return p;
    });
    // 몸통 (동그란 콩 모양)
    const body = add(root, sph(0.24), look.pants === 'wader' ? pants : jacket, 0, 0.5, 0, 1, 1.12, 0.9);
    if (look.pants !== 'wader') add(root, sph(0.235), pants, 0, 0.42, 0, 1, 0.55, 0.88);
    else add(root, sph(0.245, 24, 18), jacket, 0, 0.6, 0, 1, 0.75, 0.86); // 웨이더 위로 보이는 재킷
    body.receiveShadow = true;
    // 구명조끼
    if (look.vest) {
      const vest = toy('#ff5a2a', 0.5);
      add(root, sph(0.262, 24, 18, ), vest, 0, 0.56, 0, 1, 0.82, 0.92);
      add(root, new THREE.TorusGeometry(0.235, 0.022, 8, 32), toy('#ffd23a', 0.4), 0, 0.5, 0, 1, 1, 0.9).rotation.x = Math.PI / 2;
      add(root, new THREE.BoxGeometry(0.03, 0.18, 0.02), toy('#2b2b2b'), 0, 0.58, 0.235);
    }
    // 팔 (짧고 통통)
    this.arms = [-1, 1].map((s) => {
      const p = new THREE.Group();
      p.position.set(s * 0.25, 0.64, 0);
      root.add(p);
      add(p, new THREE.CapsuleGeometry(0.055, 0.12, 6, 12), jacket, 0, -0.09, 0);
      add(p, sph(0.06), skin, 0, -0.2, 0);
      return p;
    });
    // 머리 (크게)
    const head = (this.head = new THREE.Group());
    head.position.set(0, 0.98, 0);
    root.add(head);
    add(head, sph(0.31, 40, 30), skin, 0, 0, 0, 1, 0.94, 0.96);
    // 귀
    [-1, 1].forEach((s) => add(head, sph(0.06), skin, s * 0.3, -0.02, 0, 0.55, 1, 0.8));
    // 눈: 반짝이는 큰 눈
    const eyeM = new THREE.MeshPhysicalMaterial({ color: '#1c1410', roughness: 0.08, clearcoat: 1 });
    const shineM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.eyes = [-1, 1].map((s) => {
      const e = new THREE.Group();
      e.position.set(s * 0.11, 0.0, 0.27);
      head.add(e);
      add(e, sph(0.052), eyeM, 0, 0, 0, 0.85, 1.12, 0.5);
      add(e, sph(0.016, 10, 8), shineM, s * 0.012 + 0.012, 0.022, 0.024);
      add(e, sph(0.008, 8, 6), shineM, -0.014, -0.02, 0.024);
      return e;
    });
    // 볼터치
    const blush = new THREE.MeshBasicMaterial({ color: '#ff8f8f', transparent: true, opacity: 0.45, depthWrite: false });
    [-1, 1].forEach((s) => { const b = add(head, sph(0.05, 16, 10), blush, s * 0.18, -0.08, 0.235, 1.1, 0.6, 0.35); b.castShadow = false; b.rotation.y = s * 0.55; });
    // 코 · 입
    add(head, sph(0.022, 12, 8), toy('#efb999'), 0, -0.045, 0.3);
    const smile = add(head, new THREE.TorusGeometry(0.035, 0.008, 6, 16, Math.PI), toy('#9a4a3a'), 0, -0.1, 0.285);
    smile.rotation.z = Math.PI;
    // 앞머리 / 모자
    const hairM = toy('#3a2a20', 0.6);
    if (look.hat === 'cap') {
      add(head, new THREE.SphereGeometry(0.322, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.05), hatM, 0, 0.02, -0.01);
      add(head, new THREE.CylinderGeometry(0.2, 0.2, 0.025, 24, 1, false, -Math.PI / 2, Math.PI), hatM, 0, 0.06, 0.2, 1, 1, 1.25);
      add(head, sph(0.03, 10, 8), hatM, 0, 0.33, -0.01);
    } else if (look.hat === 'bucket') {
      add(head, new THREE.CylinderGeometry(0.25, 0.3, 0.2, 32), hatM, 0, 0.19, 0);
      add(head, new THREE.SphereGeometry(0.25, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), hatM, 0, 0.28, 0, 1, 0.4, 1);
      add(head, new THREE.CylinderGeometry(0.43, 0.46, 0.03, 40), hatM, 0, 0.09, 0);
      add(head, new THREE.CylinderGeometry(0.302, 0.302, 0.04, 32, 1, true), toy('#e9e2cf'), 0, 0.12, 0);
    } else if (look.hat === 'beanie') {
      add(head, new THREE.SphereGeometry(0.33, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), hatM, 0, 0.03, 0, 1, 1.05, 1);
      add(head, new THREE.TorusGeometry(0.305, 0.045, 10, 32), hatM, 0, 0.05, 0).rotation.x = Math.PI / 2;
      add(head, sph(0.075), toy('#ffffff', 0.9), 0, 0.38, 0);
    } else {
      add(head, new THREE.SphereGeometry(0.318, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.4), hairM, 0, 0.02, -0.015);
      add(head, new THREE.ConeGeometry(0.05, 0.12, 8), hairM, 0.02, 0.34, 0.02).rotation.z = -0.4;
    }

    // 낚싯대 (오른손)
    const rodM = new THREE.MeshPhysicalMaterial({ color: '#1a1d22', roughness: 0.25, clearcoat: 0.8 });
    this.rod = new THREE.Group();
    this.rod.position.set(0.25, 0.44, 0.12);
    root.add(this.rod);
    add(this.rod, new THREE.CylinderGeometry(0.01, 0.017, 1.4, 8), rodM, 0, 0.45, 0);
    add(this.rod, new THREE.CylinderGeometry(0.022, 0.022, 0.25, 10), toy('#3a2a20', 0.8), 0, 0.05, 0);
    const reel = add(this.rod, new THREE.CylinderGeometry(0.045, 0.045, 0.05, 16), toy('#b9c2cc', 0.25), 0.05, 0.22, 0);
    reel.rotation.z = Math.PI / 2;
    this.rodTipSeg = new THREE.Group();
    this.rodTipSeg.position.y = 1.15;
    this.rod.add(this.rodTipSeg);
    add(this.rodTipSeg, new THREE.CylinderGeometry(0.003, 0.009, 1.5, 6), rodM, 0, 0.75, 0);
    this.tip = new THREE.Object3D();
    this.tip.position.y = 1.5;
    this.rodTipSeg.add(this.tip);

    this.setName(name);
  }

  setName(name) {
    if (this.nameSprite) { this.group.remove(this.nameSprite); this.nameSprite.material.map.dispose(); }
    if (!name) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(name), depthTest: false, transparent: true, toneMapped: false }));
    const k = this.small ? 0.8 : 1;
    sp.scale.set(1.1 * k, 0.27 * k, 1);
    sp.position.y = 1.62;
    sp.renderOrder = 10;
    this.group.add(sp);
    this.nameSprite = sp;
  }

  // 말풍선 (몇 초 뒤 사라짐)
  say(text, ms = 4500) {
    if (this.bubble) { this.group.remove(this.bubble); this.bubble.material.map.dispose(); }
    const { tex, aspect } = bubbleTexture(text);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
    const h = 0.42;
    sp.scale.set(h * aspect, h, 1);
    sp.position.y = 2.05;
    sp.renderOrder = 11;
    sp.userData.until = performance.now() + ms;
    this.group.add(sp);
    this.bubble = sp;
  }

  // 1인칭: 몸은 숨기고 낚싯대와 오른팔만
  setFirstPerson(on) {
    if (this.fp === on) return;
    this.fp = on;
    this.root.children.forEach((c) => { c.visible = !on || c === this.rod || c === this.arms[1]; });
    if (this.nameSprite) this.nameSprite.visible = !on;
  }

  // rodE: 낚싯대 앙각(라디안), bend: 휨 0..1
  // action: bow(인사) · wave(손흔들기) · sit(앉기) · highfive · castle(모래성), actionT: 시작 후 초
  pose({ walking = false, phase = 0, rodE = 1.25, bend = 0, noRod = false, t = 0, action = null, actionT = 0 }) {
    if (this.bubble && performance.now() > this.bubble.userData.until) { this.group.remove(this.bubble); this.bubble = null; }
    const sw = walking ? Math.sin(phase) : 0;
    this.root.position.y = 0;
    this.root.rotation.x = 0;
    this.arms[0].rotation.z = 0;
    this.arms[1].rotation.z = 0;
    this.legs[0].rotation.x = sw * 0.7;
    this.legs[1].rotation.x = -sw * 0.7;
    this.arms[0].rotation.x = -sw * 0.6;
    // 뒤뚱뒤뚱
    this.root.rotation.z = walking ? Math.sin(phase) * 0.08 : Math.sin(t * 1.4) * 0.015;
    this.head.rotation.z = walking ? -Math.sin(phase) * 0.05 : 0;
    this.head.rotation.x = walking ? 0 : Math.sin(t * 0.9) * 0.03;
    this.rod.visible = !noRod;
    this.arms[1].rotation.x = noRod ? sw * 0.6 : -0.9;
    this.rod.rotation.x = Math.PI / 2 - rodE;
    this.rodTipSeg.rotation.x = bend * 0.8;
    // 눈 깜빡임
    const blink = (t % 4.2) < 0.12 ? 0.15 : 1;
    this.eyes.forEach((e) => { e.scale.y = blink; });
    this.bob = walking ? Math.abs(Math.cos(phase)) * 0.05 : 0;
    if (action && !walking) this.doAction(action, actionT, t);
  }

  doAction(a, at, t) {
    const L = this.arms[0], Rr = this.arms[1];
    if (a === 'bow') {
      // 꾸벅 인사
      this.root.rotation.x = Math.sin(Math.min(1, at / 1.4) * Math.PI) * 0.45;
    } else if (a === 'wave') {
      L.rotation.z = -2.5 + Math.sin(t * 12) * 0.35;
      L.rotation.x = 0;
    } else if (a === 'highfive') {
      L.rotation.x = -2.8;
      L.rotation.z = -0.3;
      if (at > 0.6 && at < 0.9) L.rotation.x = -2.4;
    } else if (a === 'sit' || a === 'castle') {
      this.root.position.y = -0.2;
      this.legs[0].rotation.x = -1.45;
      this.legs[1].rotation.x = -1.45;
      if (a === 'castle') {
        // 두 손으로 모래를 토닥토닥
        L.rotation.x = -0.9 + Math.sin(t * 8) * 0.35;
        Rr.rotation.x = -0.9 + Math.sin(t * 8 + Math.PI) * 0.35;
        this.rod.visible = false;
        this.head.rotation.x = 0.25;
      }
    }
  }

  tipWorld(v = new THREE.Vector3()) {
    return this.tip.getWorldPosition(v);
  }
}

// 입장 화면의 회전하는 미리보기
export class AvatarPreview {
  constructor(canvas) {
    this.cv = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(canvas.clientWidth || 200, canvas.clientHeight || 240, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, (canvas.clientWidth || 200) / (canvas.clientHeight || 240), 0.1, 50);
    this.camera.position.set(0, 0.95, 4.1);
    this.camera.lookAt(0, 0.72, 0);
    this.scene.add(new THREE.HemisphereLight('#eaf5ff', '#e2cfa8', 2.2));
    const d = new THREE.DirectionalLight('#fff4e0', 2.6);
    d.position.set(2, 4, 3);
    this.scene.add(d);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.12 }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.key = '';
  }

  render(t, look) {
    const key = JSON.stringify(look);
    if (key !== this.key) {
      this.key = key;
      if (this.av) this.scene.remove(this.av.group);
      this.av = new Avatar(look, look.name || '아이디');
      this.scene.add(this.av.group);
    }
    const walking = (t % 6) < 3;
    this.av.pose({ walking, phase: t * 7, rodE: 1.3, t });
    this.av.group.rotation.y = Math.sin(t * 0.6) * 0.8 + 0.3;
    this.av.group.position.y = this.av.bob;
    this.renderer.render(this.scene, this.camera);
  }
}
