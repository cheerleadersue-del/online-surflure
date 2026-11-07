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
    // 옷차림: 기본형(반팔·반바지·샌들) / 무릎 장화(조끼·카키바지·장화) / 웨이더(가슴 장화)
    const kind = look.pants === 'wader' ? 'wader' : look.pants === 'shorts' ? 'basic' : 'boots';
    const skin = toy(SKIN, 0.55);
    const teal = fabric('#1f5c57');
    const tealToy = toy('#22605a', 0.5);
    const beige = fabric('#e9dcc4');
    const cream = fabric('#efe6d6');
    const khaki = fabric('#cdb07a');
    const white = fabric('#f8f8f5');
    const waderM = toy('#2f5d55', 0.55);
    const soleM = toy('#dccfb3', 0.8);
    const darkM = toy('#2d3a3a', 0.6);
    const hairM = toy('#5b3a26', 0.65);
    const add = (parent, geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const sph = (r, w = 24, h = 18) => new THREE.SphereGeometry(r, w, h);
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);

    // 몸 전체를 흔들기 위한 뿌리
    const root = (this.root = new THREE.Group());
    G.add(root);

    // ── 다리 ──
    this.legs = [-1, 1].map((s) => {
      const p = new THREE.Group();
      p.position.set(s * 0.085, 0.3, 0);
      root.add(p);
      if (kind === 'basic') {
        add(p, cap(0.07, 0.04), khaki, 0, -0.02, 0); // 반바지
        add(p, cap(0.05, 0.1), skin, 0, -0.12, 0); // 맨다리
        add(p, sph(0.058), skin, 0, -0.215, 0.03, 1, 0.65, 1.35); // 맨발
        add(p, box(0.12, 0.022, 0.21), soleM, 0, -0.262, 0.03); // 샌들 밑창
        add(p, box(0.125, 0.018, 0.205), tealToy, 0, -0.247, 0.03);
        add(p, box(0.12, 0.03, 0.06), tealToy, 0, -0.226, 0.055); // 발등 끈
      } else if (kind === 'boots') {
        add(p, cap(0.068, 0.06), khaki, 0, -0.05, 0); // 카키 바지
        add(p, cap(0.07, 0.09), tealToy, 0, -0.16, 0); // 장화 목
        add(p, new THREE.TorusGeometry(0.068, 0.012, 8, 20), tealToy, 0, -0.1, 0).rotation.x = Math.PI / 2;
        add(p, sph(0.074), tealToy, 0, -0.225, 0.03, 1, 0.72, 1.4); // 장화 발
        add(p, box(0.13, 0.03, 0.22), soleM, 0, -0.262, 0.03); // 베이지 밑창
      } else {
        add(p, cap(0.074, 0.12), waderM, 0, -0.11, 0); // 웨이더 다리
        add(p, sph(0.05), toy('#29534c', 0.6), 0, -0.1, 0.055, 1, 1.1, 0.5); // 무릎 패드
        add(p, sph(0.076), waderM, 0, -0.225, 0.03, 1, 0.72, 1.4);
        add(p, box(0.13, 0.03, 0.22), darkM, 0, -0.262, 0.03);
      }
      return p;
    });

    // ── 몸통 ──
    const shirt = kind === 'basic' ? white : cream;
    const body = add(root, sph(0.24), shirt, 0, 0.5, 0, 1, 1.12, 0.9);
    body.receiveShadow = true;
    if (kind === 'wader') {
      // 가슴까지 오는 웨이더 + 멜빵 + 벨트 + 가슴 주머니
      add(root, sph(0.252), waderM, 0, 0.46, 0, 1, 0.98, 0.92);
      add(root, box(0.15, 0.08, 0.03), toy('#29534c', 0.6), 0, 0.62, 0.205).rotation.x = -0.35;
      add(root, sph(0.012, 8, 6), toy('#6f8f7a'), 0, 0.655, 0.225);
      [-1, 1].forEach((s) => {
        add(root, box(0.035, 0.16, 0.02), waderM, s * 0.12, 0.72, 0.15).rotation.x = -0.55;
        add(root, box(0.035, 0.16, 0.02), waderM, s * 0.12, 0.72, -0.15).rotation.x = 0.55;
        add(root, box(0.045, 0.03, 0.025), darkM, s * 0.12, 0.67, 0.19);
      });
      add(root, new THREE.TorusGeometry(0.247, 0.015, 8, 40), darkM, 0, 0.42, 0, 1, 1, 0.93).rotation.x = Math.PI / 2;
      add(root, box(0.06, 0.04, 0.03), darkM, 0, 0.42, 0.235);
      add(root, box(0.1, 0.1, 0.06), khaki, -0.25, 0.4, 0.05).rotation.y = 0.4; // 허리 파우치
      add(root, box(0.02, 0.03, 0.01), toy('#ff7a2f'), -0.27, 0.4, 0.09);
    } else {
      add(root, sph(0.236), kind === 'basic' ? khaki : khaki, 0, 0.42, 0, 1, 0.55, 0.88); // 바지 윗부분
    }
    if (kind === 'boots') {
      // 낚시 조끼 (청록) + 베이지 주머니 + 주황 지퍼 손잡이 + 벨트 + 파우치 + 뜰채
      add(root, sph(0.258), teal, 0, 0.56, 0, 1, 0.82, 0.93);
      add(root, box(0.012, 0.2, 0.01), toy('#174743'), 0, 0.56, 0.236);
      add(root, box(0.018, 0.04, 0.012), toy('#ff7a2f'), 0, 0.6, 0.244);
      [-1, 1].forEach((s) => {
        const pk = add(root, box(0.09, 0.07, 0.03), beige, s * 0.1, 0.53, 0.21);
        pk.rotation.y = s * 0.35;
        add(root, box(0.094, 0.025, 0.035), beige, s * 0.1, 0.57, 0.212).rotation.y = s * 0.35;
        add(root, sph(0.01, 8, 6), toy('#ff7a2f'), s * 0.105, 0.565, 0.235);
      });
      add(root, new THREE.TorusGeometry(0.242, 0.014, 8, 40), toy('#4a3424', 0.6), 0, 0.42, 0, 1, 1, 0.92).rotation.x = Math.PI / 2;
      add(root, box(0.09, 0.1, 0.06), beige, -0.25, 0.41, 0.06).rotation.y = 0.4;
      add(root, box(0.02, 0.03, 0.01), toy('#ff7a2f'), -0.27, 0.4, 0.1);
      // 뒤 허리의 뜰채
      const net = new THREE.Group();
      net.position.set(0.17, 0.36, -0.2);
      root.add(net);
      add(net, new THREE.TorusGeometry(0.06, 0.01, 8, 20), toy('#c99a4e', 0.5), 0, 0, 0).rotation.y = 0.5;
      add(net, new THREE.ConeGeometry(0.058, 0.1, 12, 1, true), new THREE.MeshStandardMaterial({ color: '#f1ece2', transparent: true, opacity: 0.75, side: THREE.DoubleSide, roughness: 0.9 }), 0, -0.055, 0).rotation.x = Math.PI;
      add(net, box(0.012, 0.08, 0.012), darkM, 0, 0.08, 0.01);
    }
    // 옷깃 / 목둘레
    if (kind === 'basic') add(root, new THREE.TorusGeometry(0.075, 0.012, 8, 20), white, 0, 0.745, 0.02, 1, 1, 0.9).rotation.x = Math.PI / 2;
    else [-1, 1].forEach((s) => { const c = add(root, box(0.07, 0.015, 0.06), cream, s * 0.045, 0.75, 0.12); c.rotation.z = -s * 0.5; c.rotation.x = 0.4; });

    // ── 팔 (짧고 통통) ──
    this.arms = [-1, 1].map((s) => {
      const p = new THREE.Group();
      p.position.set(s * 0.25, 0.64, 0);
      root.add(p);
      if (kind === 'basic') {
        add(p, cap(0.062, 0.04), white, 0, -0.04, 0); // 반팔
        add(p, cap(0.048, 0.07), skin, 0, -0.12, 0);
      } else {
        add(p, cap(0.058, 0.08), cream, 0, -0.07, 0); // 걷어 올린 소매
        add(p, new THREE.TorusGeometry(0.056, 0.014, 8, 18), cream, 0, -0.12, 0).rotation.x = Math.PI / 2;
        add(p, cap(0.046, 0.04), skin, 0, -0.15, 0);
      }
      add(p, sph(0.058), skin, 0, -0.2, 0);
      return p;
    });

    // ── 머리 (크게) ──
    const head = (this.head = new THREE.Group());
    head.position.set(0, 0.98, 0);
    root.add(head);
    add(head, sph(0.31, 40, 30), skin, 0, 0, 0, 1, 0.94, 0.96);
    [-1, 1].forEach((s) => add(head, sph(0.06), skin, s * 0.3, -0.02, 0, 0.55, 1, 0.8)); // 귀
    // 갈색 머리: 뒤통수·옆머리·앞머리
    add(head, new THREE.SphereGeometry(0.322, 32, 16, Math.PI * 0.95, Math.PI * 1.1, 1.05, 1.05), hairM, 0, 0, 0, 1, 0.95, 0.98);
    [-1, 1].forEach((s) => {
      add(head, sph(0.07, 14, 10), hairM, s * 0.26, 0.07, 0.07, 0.6, 1, 1);
      add(head, sph(0.07, 14, 10), hairM, s * 0.14, 0.085, 0.235, 1.3, 0.5, 0.55).rotation.z = s * 0.35;
    });
    add(head, sph(0.065, 14, 10), hairM, -0.03, 0.09, 0.255, 1.3, 0.45, 0.55);
    // 눈: 웃으며 감은 눈 (^^)
    const eyeM = toy('#3a2418', 0.4);
    this.eyes = [-1, 1].map((s) => {
      const e = new THREE.Group();
      e.position.set(s * 0.11, 0.0, 0.282);
      e.rotation.y = s * 0.3;
      head.add(e);
      add(e, new THREE.TorusGeometry(0.038, 0.009, 6, 18, Math.PI), eyeM, 0, -0.015, 0);
      return e;
    });
    // 볼터치
    const blush = new THREE.MeshBasicMaterial({ color: '#ff8f7a', transparent: true, opacity: 0.45, depthWrite: false });
    [-1, 1].forEach((s) => { const b = add(head, sph(0.05, 16, 10), blush, s * 0.18, -0.08, 0.235, 1.1, 0.6, 0.35); b.castShadow = false; b.rotation.y = s * 0.55; });
    // 코 · 입
    add(head, sph(0.022, 12, 8), toy('#efb999'), 0, -0.045, 0.3);
    const smile = add(head, new THREE.TorusGeometry(0.035, 0.008, 6, 16, Math.PI), toy('#9a4a3a'), 0, -0.1, 0.285);
    smile.rotation.z = Math.PI;

    // ── 모자: 베이지 캡 + 청록 챙 + 청록 헤드밴드 + 헤드랜턴 ──
    const capM = fabric('#e8dcc5');
    add(head, new THREE.SphereGeometry(0.33, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.05), capM, 0, 0.03, -0.01, 1, 0.98, 1);
    add(head, sph(0.035, 12, 8), capM, 0, 0.35, -0.01);
    const holeM = toy('#c8b796', 0.8);
    for (let i = 0; i < 6; i++) {
      const ph = (i / 6) * Math.PI * 2 + 0.5, th = 0.75;
      add(head, sph(0.011, 8, 6), holeM, 0.33 * Math.sin(th) * Math.sin(ph), 0.03 + 0.33 * Math.cos(th) * 0.98, -0.01 + 0.33 * Math.sin(th) * Math.cos(ph));
    }
    const brim = add(head, new THREE.CylinderGeometry(0.21, 0.21, 0.026, 28, 1, false, -Math.PI / 2, Math.PI), teal, 0, 0.065, 0.22, 1, 1, 1.3);
    brim.rotation.x = 0.12;
    add(head, new THREE.TorusGeometry(0.33, 0.026, 8, 48), teal, 0, 0.1, 0, 1, 1, 1).rotation.x = Math.PI / 2; // 헤드밴드
    add(head, box(0.12, 0.04, 0.03), capM, 0, 0.06, -0.33); // 뒤 조절끈
    // 헤드랜턴
    const lamp = (this.lampG = new THREE.Group());
    lamp.position.set(0, 0.12, 0.345);
    head.add(lamp);
    add(lamp, box(0.12, 0.07, 0.06), toy('#2c3542', 0.4), 0, 0, 0);
    add(lamp, new THREE.CylinderGeometry(0.03, 0.03, 0.03, 18), toy('#c9ced4', 0.2), -0.008, 0, 0.03).rotation.x = Math.PI / 2;
    this.lensM = new THREE.MeshStandardMaterial({ color: '#f4f1e6', emissive: '#fff1c4', emissiveIntensity: 0, roughness: 0.15 });
    add(lamp, new THREE.CircleGeometry(0.022, 18), this.lensM, -0.008, 0, 0.0455).castShadow = false;
    add(lamp, sph(0.016, 10, 8), toy('#ff7a2f', 0.4), 0.038, 0.028, 0.012);
    // 빛줄기 (밤에만)
    const beamG = new THREE.Group();
    beamG.rotation.x = 0.32;
    lamp.add(beamG);
    // 랜턴에서 멀어질수록·가장자리일수록 흐려지는 빛줄기
    const beamM = (Avatar.beamM ||= new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uCol: { value: new THREE.Color('#ffefc2') } },
      vertexShader: 'varying float vA; varying vec3 vN; varying vec3 vV; void main(){ vA = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; varying float vA; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 0.8); float a = pow(vA, 1.4) * 0.5 * f; gl_FragColor = vec4(uCol * a, a); }',
    }));
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3.2, 24, 1, true), beamM);
    beam.rotation.x = -Math.PI / 2;
    beam.position.z = 1.6 + 0.05;
    beam.renderOrder = 5;
    beamG.add(beam);
    this.beam = beamG;
    this.lampDir = new THREE.Object3D(); // 빛이 향하는 곳 (스포트라이트 겨냥)
    this.lampDir.position.set(0, 0, 6);
    beamG.add(this.lampDir);
    this.setLamp(false);

    // 낚싯대 (오른손)
    const rodC = { bamboo: '#c9a55a', standard: '#1a1c20', premium: '#14306a' }[look.rod] || '#1a1d22';
    const rodM = new THREE.MeshPhysicalMaterial({ color: rodC, roughness: 0.25, clearcoat: 0.8 });
    this.rod = new THREE.Group();
    this.rod.position.set(0.25, 0.44, 0.12);
    root.add(this.rod);
    add(this.rod, new THREE.CylinderGeometry(0.01, 0.017, 1.4, 8), rodM, 0, 0.45, 0);
    add(this.rod, new THREE.CylinderGeometry(0.022, 0.022, 0.25, 10), toy('#3a2a20', 0.8), 0, 0.05, 0);
    const reel = add(this.rod, new THREE.CylinderGeometry(0.045, 0.045, 0.05, 16), toy({ basic: '#8f979f', ultegra: '#cfd6dc', stella: '#d9c27a', vanquish: '#3b4f7a' }[look.reel] || '#b9c2cc', 0.25), 0.05, 0.22, 0);
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

  // 헤드랜턴 켜기/끄기
  setLamp(on) {
    on = !!on;
    if (this.lampOn === on) return;
    this.lampOn = on;
    this.lensM.emissiveIntensity = on ? 4 : 0;
    this.beam.visible = on;
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
    if (a === 'release') {
      // 쪼그려 앉아 두 손으로 물고기를 감싸 쥐고 → 앞으로 살며시 밀어 보낸다
      const k = Math.min(1, at / 0.5), push = Math.max(0, Math.min(1, (at - 0.7) / 0.5));
      this.root.position.y = -0.16 * k;
      this.root.rotation.x = 0.45 * k + 0.15 * push;
      this.legs[0].rotation.x = this.legs[1].rotation.x = -1.2 * k;
      L.rotation.x = Rr.rotation.x = -1.2 * k - 0.6 * push;
      L.rotation.z = 0.25 * k; Rr.rotation.z = -0.25 * k;
      this.rod.visible = false;
      this.head.rotation.x = 0.3 * k;
      return;
    }
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
