// 3D 낚시꾼 아바타 (기본 도형으로 조립)
import * as THREE from '../vendor/three/three.module.min.js';
import { nameTexture } from './textures.js';

const SKIN = '#e9c09a';
const mat = (color, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });

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
    const A = Avatar.assets;
    const pantsM = mat(look.pantsColor || '#4b5136', 0.9);
    const jacketM = mat(look.jacket || '#f26b1d', 0.75);
    if (A && A.tex.denim.map) {
      const D = A.tex.denim;
      // 옷감 결(데님 스캔)을 입힌다
      jacketM.normalMap = D.normal;
      jacketM.normalScale.set(0.6, 0.6);
      if (look.pants !== 'wader') {
        pantsM.map = D.map;
        pantsM.normalMap = D.normal;
        pantsM.color.set(look.pantsColor || '#4b5136').lerp(new THREE.Color('#ffffff'), 0.55);
      } else {
        pantsM.normalMap = D.normal;
        pantsM.normalScale.set(0.3, 0.3);
        pantsM.roughness = 0.55;
      }
    }
    const skinM = mat(SKIN, 0.7);
    const bootM = mat(look.pants === 'wader' ? '#2e3127' : '#222', 0.6);
    const hatM = mat(look.hatColor || '#1f3b73', 0.85);
    const add = (parent, geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // 다리
    this.legs = [-1, 1].map((s) => {
      const p = new THREE.Group();
      p.position.set(s * 0.1, 0.94, 0);
      G.add(p);
      if (look.pants === 'shorts') {
        add(p, new THREE.CapsuleGeometry(0.08, 0.2, 4, 8), pantsM, 0, -0.17, 0);
        add(p, new THREE.CapsuleGeometry(0.06, 0.42, 4, 8), skinM, 0, -0.55, 0);
      } else {
        add(p, new THREE.CapsuleGeometry(0.078, 0.66, 4, 8), pantsM, 0, -0.42, 0);
      }
      const bootSrc = A && (s < 0 ? A.models.bootL : A.models.bootR);
      if (bootSrc && look.pants === 'wader') {
        const g = bootSrc.geometry.clone();
        g.computeBoundingBox();
        const bb = g.boundingBox;
        g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
        const boot = new THREE.Mesh(g, bootSrc.material);
        boot.position.set(0, -0.94, 0.02);
        boot.scale.setScalar(1.05);
        boot.castShadow = true;
        p.add(boot);
      } else add(p, new THREE.BoxGeometry(0.13, 0.12, 0.27), bootM, 0, -0.88, 0.04);
      return p;
    });

    // 몸통
    const torso = add(G, new THREE.CapsuleGeometry(0.17, 0.36, 4, 12), jacketM, 0, 1.3, 0);
    torso.scale.z = 0.75;
    if (look.pants === 'wader') {
      add(G, new THREE.BoxGeometry(0.32, 0.32, 0.25), pantsM, 0, 1.13, 0);
      [-1, 1].forEach((s) => add(G, new THREE.BoxGeometry(0.03, 0.34, 0.27), mat('#2b2e25'), s * 0.09, 1.38, 0));
    }
    if (look.vest && A && A.models.lifeJacket) {
      // 실제 스캔 구명조끼 (앞판)
      const lj = new THREE.Mesh(A.models.lifeJacket.geometry, A.models.lifeJacket.material);
      lj.scale.setScalar(0.56);
      lj.position.set(0, 1.3, 0.14);
      lj.castShadow = true;
      G.add(lj);
      add(G, new THREE.BoxGeometry(0.4, 0.05, 0.3), mat('#d9d4c6', 0.8), 0, 1.12, 0);
    } else if (look.vest) {
      add(G, new THREE.BoxGeometry(0.39, 0.27, 0.29), mat('#ff4d2e', 0.6), 0, 1.36, 0);
      add(G, new THREE.BoxGeometry(0.4, 0.035, 0.3), mat('#f5d33b', 0.4), 0, 1.33, 0);
    }
    // 팔
    this.arms = [-1, 1].map((s) => {
      const p = new THREE.Group();
      p.position.set(s * 0.23, 1.5, 0);
      G.add(p);
      add(p, new THREE.CapsuleGeometry(0.056, 0.46, 4, 8), jacketM, 0, -0.27, 0);
      add(p, new THREE.SphereGeometry(0.052, 10, 8), skinM, 0, -0.56, 0);
      return p;
    });
    // 머리
    add(G, new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), skinM, 0, 1.6, 0);
    const head = add(G, new THREE.SphereGeometry(0.118, 24, 18), skinM, 0, 1.72, 0);
    head.scale.set(0.95, 1.08, 1);
    add(G, new THREE.SphereGeometry(0.022, 8, 6), skinM, 0, 1.715, 0.118);
    [-1, 1].forEach((s) => add(G, new THREE.SphereGeometry(0.028, 8, 6), skinM, s * 0.112, 1.72, 0).scale.set(0.5, 1, 0.8));
    add(G, new THREE.SphereGeometry(0.121, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), mat('#2b2018', 0.9), 0, 1.735, -0.008);
    add(G, new THREE.BoxGeometry(0.17, 0.04, 0.03), mat('#111a22', 0.2), 0, 1.74, 0.105);
    if (look.hat === 'cap') {
      add(G, new THREE.SphereGeometry(0.124, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatM, 0, 1.75, 0);
      add(G, new THREE.BoxGeometry(0.17, 0.014, 0.13), hatM, 0, 1.77, 0.15);
    } else if (look.hat === 'bucket' && A && A.models.hat) {
      const hm = A.models.hat.material.clone();
      hm.color.set(look.hatColor || '#c9c1a8').lerp(new THREE.Color('#ffffff'), 0.45);
      const hat = new THREE.Mesh(A.models.hat.geometry, hm);
      hat.scale.setScalar(0.92);
      hat.position.set(0, 1.79, 0);
      hat.castShadow = true;
      G.add(hat);
    } else if (look.hat === 'bucket') {
      add(G, new THREE.CylinderGeometry(0.11, 0.13, 0.11, 16), hatM, 0, 1.83, 0);
      add(G, new THREE.CylinderGeometry(0.21, 0.21, 0.012, 20), hatM, 0, 1.78, 0);
    } else if (look.hat === 'beanie') {
      add(G, new THREE.SphereGeometry(0.128, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatM, 0, 1.75, 0);
      add(G, new THREE.TorusGeometry(0.12, 0.022, 6, 18), hatM, 0, 1.76, 0).rotation.x = Math.PI / 2;
    } else {
      add(G, new THREE.SphereGeometry(0.122, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2b2018'), 0, 1.74, -0.01);
    }

    // 낚싯대 (손잡이 쪽 + 초리 쪽 두 마디)
    const rodM = mat('#15171a', 0.35);
    this.rod = new THREE.Group();
    this.rod.position.set(0.24, 1.02, 0.2);
    G.add(this.rod);
    add(this.rod, new THREE.CylinderGeometry(0.009, 0.015, 1.5, 6), rodM, 0, 0.55, 0);
    add(this.rod, new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), mat('#9aa3ad', 0.3), 0.045, 0.15, 0).rotation.z = Math.PI / 2;
    this.rodTipSeg = new THREE.Group();
    this.rodTipSeg.position.y = 1.3;
    this.rod.add(this.rodTipSeg);
    add(this.rodTipSeg, new THREE.CylinderGeometry(0.003, 0.009, 1.7, 5), rodM, 0, 0.85, 0);
    this.tip = new THREE.Object3D();
    this.tip.position.y = 1.7;
    this.rodTipSeg.add(this.tip);

    // 이름표
    this.setName(name);
  }

  setName(name) {
    if (this.nameSprite) { this.group.remove(this.nameSprite); this.nameSprite.material.map.dispose(); }
    if (!name) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(name), depthTest: false, transparent: true }));
    const k = this.small ? 0.8 : 1;
    sp.scale.set(1.3 * k, 0.32 * k, 1);
    sp.position.y = 2.15;
    sp.renderOrder = 10;
    this.group.add(sp);
    this.nameSprite = sp;
  }

  // e: 낚싯대 앙각(라디안), bend: 휨 0..1
  pose({ walking = false, phase = 0, rodE = 1.25, bend = 0, noRod = false }) {
    const sw = walking ? Math.sin(phase) : 0;
    this.legs[0].rotation.x = sw * 0.55;
    this.legs[1].rotation.x = -sw * 0.55;
    this.arms[0].rotation.x = -sw * 0.45;
    this.group.children.forEach(() => {});
    this.rod.visible = !noRod;
    // 오른팔은 낚싯대를 쥔다
    this.arms[1].rotation.x = noRod ? sw * 0.45 : -0.55 - (rodE < 1 ? 0.4 : 0);
    this.rod.rotation.x = Math.PI / 2 - rodE;
    this.rodTipSeg.rotation.x = bend * 0.75;
    this.bob = walking ? Math.abs(Math.cos(phase)) * 0.04 : 0;
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
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, (canvas.clientWidth || 200) / (canvas.clientHeight || 240), 0.1, 50);
    this.camera.position.set(0, 1.35, 5.4);
    this.camera.lookAt(0, 1.05, 0);
    this.scene.add(new THREE.HemisphereLight('#dff1ff', '#d9c49a', 1.6));
    const d = new THREE.DirectionalLight('#fff4e0', 2.2);
    d.position.set(2, 4, 3);
    this.scene.add(d);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.15 }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.key = '';
  }

  render(t, look) {
    const key = JSON.stringify(look) + (Avatar.assets ? '+A' : '');
    if (key !== this.key) {
      this.key = key;
      if (this.av) this.scene.remove(this.av.group);
      this.av = new Avatar(look, look.name || '아이디');
      this.scene.add(this.av.group);
    }
    this.av.pose({ walking: true, phase: t * 5, rodE: 1.3 });
    this.av.group.rotation.y = Math.sin(t * 0.6) * 0.9 + 0.5;
    this.av.group.position.y = this.av.bob;
    this.renderer.render(this.scene, this.camera);
  }
}
