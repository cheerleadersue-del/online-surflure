// 코드로 그리는 텍스처 (외부 이미지 없음)
import * as THREE from '../vendor/three/three.module.min.js';
import { rng } from './scene.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 지면 세부 질감(곱해지는 밝기 맵): 모래알 / 자갈·조개껍질 / 솔잎
export function groundDetail(kind, seed = 1) {
  const [c, g] = canvas(512, 512);
  const r = rng(seed);
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, 512, 512);
  if (kind === 'pebble') {
    for (let i = 0; i < 2600; i++) {
      const v = 150 + r() * 105;
      const tint = r();
      g.fillStyle = tint < 0.15 ? `rgb(${v},${v * 0.92},${v * 0.86})` : tint < 0.3 ? `rgb(255,250,242)` : `rgb(${v},${v},${v})`;
      g.beginPath();
      g.ellipse(r() * 512, r() * 512, 2 + r() * 7, 1.5 + r() * 5, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'forest') {
    for (let i = 0; i < 4000; i++) {
      const v = 120 + r() * 135;
      g.strokeStyle = `rgb(${v},${v * 0.9},${v * 0.75})`;
      g.lineWidth = 1 + r();
      const x = r() * 512, y = r() * 512, a = r() * Math.PI, l = 6 + r() * 14;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  } else {
    const img = g.getImageData(0, 0, 512, 512);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 205 + r() * 50;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v * 0.98;
    }
    g.putImageData(img, 0, 0);
    // 바람에 생긴 잔물결 자국
    g.strokeStyle = 'rgba(150,140,120,0.18)';
    g.lineWidth = 3;
    for (let y = 0; y < 512; y += 22) {
      g.beginPath();
      for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 4);
      g.stroke();
    }
  }
  return tex(c, 1);
}

export function barkTexture() {
  const [c, g] = canvas(128, 512);
  const r = rng(77);
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, '#5e2f1b');
  grad.addColorStop(0.5, '#a5613f');
  grad.addColorStop(1, '#5a2b18');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 160; i++) {
    const x = r() * 128, y = r() * 512;
    g.fillStyle = r() < 0.5 ? 'rgba(40,18,8,0.45)' : 'rgba(205,130,90,0.35)';
    g.fillRect(x, y, 6 + r() * 22, 2 + r() * 5);
  }
  return tex(c, 1);
}

export function concreteTexture(lines = true) {
  const [c, g] = canvas(256, 256);
  const r = rng(5);
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 170 + r() * 40;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v - 6; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (lines) {
    g.strokeStyle = 'rgba(70,70,65,0.5)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 256, 256);
  }
  return tex(c, 1);
}

// 사진 속 해안 방호벽의 둥근 블록 무늬
export function seawallTexture() {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#cfc4ad';
  g.fillRect(0, 0, 512, 128);
  const r = rng(9);
  g.strokeStyle = 'rgba(90,80,65,0.55)';
  g.lineWidth = 4;
  for (let x = 0; x < 512; x += 64) {
    for (let y = 18; y < 120; y += 34) {
      g.beginPath();
      g.roundRect(x + 6 + (y % 68 ? 20 : 0) - 10, y, 54, 26, 12);
      g.stroke();
    }
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '60,55,45' : '255,250,235'},0.12)`;
    g.fillRect(r() * 512, r() * 128, 2, 2);
  }
  g.fillStyle = 'rgba(200,190,170,1)';
  g.fillRect(0, 0, 512, 12);
  return tex(c, 1);
}

export function roadTexture() {
  const [c, g] = canvas(256, 256);
  const r = rng(3);
  g.fillStyle = '#55575a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const v = 60 + r() * 60;
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  g.fillStyle = '#e9e9e2';
  g.fillRect(0, 14, 256, 6);
  g.fillStyle = '#e8a62a';
  g.fillRect(0, 232, 256, 5);
  g.fillRect(0, 240, 256, 5);
  return tex(c, 1);
}

export function labelTexture(lines, { bg = 'rgba(255,250,236,0.95)', border = '#f26b1d', badge = null, w = 512, h = 168 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.strokeStyle = border;
  g.lineWidth = 8;
  g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 28); g.fill(); g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#1b2230';
  g.font = '800 54px Pretendard, sans-serif';
  g.fillText(lines[0], w / 2, h * 0.36, w - 40);
  if (lines[1]) {
    g.fillStyle = '#4b5565';
    g.font = '600 40px Pretendard, sans-serif';
    g.fillText(lines[1], w / 2, h * 0.72, w - 40);
  }
  if (badge) {
    g.fillStyle = badge.color;
    g.beginPath(); g.roundRect(w - 124, 0, 118, 48, 22); g.fill();
    g.fillStyle = '#fff';
    g.font = '800 30px Pretendard, sans-serif';
    g.fillText(badge.text, w - 65, 25);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function nameTexture(name) {
  const [c, g] = canvas(512, 128);
  g.font = '800 64px Pretendard, sans-serif';
  const w = Math.min(500, g.measureText(name).width + 60);
  g.fillStyle = 'rgba(15,30,55,0.72)';
  g.beginPath(); g.roundRect((512 - w) / 2, 14, w, 100, 50); g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 256, 66, 470);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function softDot(color = '255,255,255') {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${color},1)`);
  gr.addColorStop(0.4, `rgba(${color},0.6)`);
  gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function cloudTexture(seed) {
  const [c, g] = canvas(512, 256);
  const r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const x = 90 + r() * 330, y = 110 + (r() - 0.5) * 70, rad = 30 + r() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function woodTexture() {
  const [c, g] = canvas(256, 256);
  const r = rng(13);
  for (let y = 0; y < 256; y += 32) {
    const v = 150 + r() * 40;
    g.fillStyle = `rgb(${v},${v * 0.78},${v * 0.55})`;
    g.fillRect(0, y, 256, 30);
    g.fillStyle = 'rgba(40,25,15,0.6)';
    g.fillRect(0, y + 30, 256, 2);
    for (let k = 0; k < 18; k++) {
      g.strokeStyle = `rgba(70,45,25,${0.1 + r() * 0.2})`;
      g.beginPath();
      const yy = y + r() * 30;
      g.moveTo(0, yy);
      g.bezierCurveTo(80, yy + (r() - 0.5) * 6, 170, yy + (r() - 0.5) * 6, 256, yy);
      g.stroke();
    }
  }
  return tex(c, 1);
}

// 말풍선
export function bubbleTexture(text) {
  const [c0, g0] = canvas(8, 8);
  g0.font = '700 44px Pretendard, sans-serif';
  const lines = [];
  let cur = '';
  for (const ch of String(text)) {
    if (g0.measureText(cur + ch).width > 560) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  const L = lines.slice(0, 3);
  const w = Math.min(600, Math.max(...L.map((l) => g0.measureText(l).width))) + 56;
  const h = L.length * 54 + 44;
  const [c, g] = canvas(Math.ceil(w), Math.ceil(h + 22));
  g.fillStyle = 'rgba(255,255,255,0.96)';
  g.strokeStyle = 'rgba(20,40,70,0.25)';
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(2, 2, w - 4, h - 4, 26);
  g.moveTo(w / 2 - 16, h - 3); g.lineTo(w / 2, h + 18); g.lineTo(w / 2 + 16, h - 3);
  g.fill(); g.stroke();
  g.fillStyle = '#16233a';
  g.font = '700 44px Pretendard, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  L.forEach((l, i) => g.fillText(l, w / 2, 26 + 27 + i * 54 - 6));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: c.width / c.height };
}
