// 캔버스 장면: 하늘·바다·소나무숲·모랫길·해변·갯바위·방파제·아바타·깃발
import { WORLD_END } from './data.js';

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixc(a, b, t) {
  const A = Array.isArray(a) ? a : rgb(a);
  const B = Array.isArray(b) ? b : rgb(b);
  return [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
}
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// 시간대별 하늘/바다 색
const SKY = [
  [0, '#070b1e', '#16203d', '#0b1630', '#0c1d36', 0.12],
  [4.6, '#0a1027', '#1c2848', '#0d1a33', '#0f2340', 0.15],
  [5.6, '#2c3a6e', '#f0a27a', '#43507a', '#2c4a6a', 0.45],
  [7, '#5ea2e4', '#f5d9b4', '#4c88b8', '#2e6f96', 0.85],
  [10, '#3a8be0', '#bfe0f7', '#2f7fbf', '#1d6a99', 1],
  [16, '#4a90da', '#d8e9f2', '#3080bd', '#1f6a96', 1],
  [18, '#4b5d9c', '#f4a96a', '#5a6fa0', '#2c5579', 0.72],
  [19.3, '#272c5a', '#dd7458', '#3a3f6a', '#1f3354', 0.42],
  [20.5, '#0a1027', '#1c2848', '#0d1a33', '#0f2340', 0.15],
  [24, '#070b1e', '#16203d', '#0b1630', '#0c1d36', 0.12],
];
export function skyAt(h) {
  let i = 0;
  while (i < SKY.length - 2 && SKY[i + 1][0] <= h) i++;
  const a = SKY[i], b = SKY[i + 1];
  const t = clamp((h - a[0]) / (b[0] - a[0]));
  return {
    top: mixc(a[1], b[1], t), bottom: mixc(a[2], b[2], t),
    seaFar: mixc(a[3], b[3], t), seaNear: mixc(a[4], b[4], t), light: lerp(a[5], b[5], t),
  };
}

// ── 소나무 스프라이트 (오프스크린 캔버스에 미리 그림) ──
function makePine(seed, fog, fogColor) {
  const W = 300, H = 460;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(seed);
  const lean = (r() - 0.5) * 60;
  const topX = W / 2 + lean, topY = 120 + r() * 40;
  // 붉은 적송 줄기 (휘어진 곡선)
  const grad = g.createLinearGradient(W / 2 - 14, 0, W / 2 + 14, 0);
  grad.addColorStop(0, '#5a2c19');
  grad.addColorStop(0.45, '#a3583a');
  grad.addColorStop(1, '#4a2414');
  g.strokeStyle = grad;
  g.lineCap = 'round';
  const cx1 = W / 2 + (r() - 0.5) * 80, cy1 = H * 0.6;
  for (let w = 22; w > 4; w -= 6) {
    g.lineWidth = w * (0.7 + (22 - w) / 60);
    g.beginPath();
    g.moveTo(W / 2, H);
    g.quadraticCurveTo(cx1, cy1, topX, topY);
    g.stroke();
  }
  // 수피 무늬
  g.strokeStyle = 'rgba(40,18,8,0.5)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) {
    const t = 0.25 + r() * 0.7;
    const x = (1 - t) * (1 - t) * (W / 2) + 2 * (1 - t) * t * cx1 + t * t * topX;
    const y = (1 - t) * (1 - t) * H + 2 * (1 - t) * t * cy1 + t * t * topY;
    g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 4, y + 2); g.stroke();
  }
  // 가지 + 층층이 퍼진 솔잎 덩어리
  const clumps = [];
  const nC = 5 + Math.floor(r() * 4);
  for (let i = 0; i < nC; i++) {
    const t = 0.55 + (i / nC) * 0.45;
    const bx = (1 - t) * (1 - t) * (W / 2) + 2 * (1 - t) * t * cx1 + t * t * topX;
    const by = (1 - t) * (1 - t) * H + 2 * (1 - t) * t * cy1 + t * t * topY;
    const side = i % 2 ? 1 : -1;
    const len = 40 + r() * 70;
    const ex = bx + side * len, ey = by - 20 - r() * 30;
    g.strokeStyle = '#5a2c19';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + side * len * 0.5, by + 5, ex, ey); g.stroke();
    clumps.push([ex, ey, 45 + r() * 35, 18 + r() * 10]);
  }
  clumps.push([topX, topY - 10, 70 + r() * 20, 26]);
  const greens = ['#16301b', '#1f3d22', '#29502c', '#36623a'];
  greens.forEach((col, li) => {
    g.fillStyle = col;
    clumps.forEach(([x, y, rw, rh]) => {
      for (let k = 0; k < 14; k++) {
        const ox = (r() - 0.5) * rw * 1.6;
        const oy = (r() - 0.5) * rh - li * 3;
        g.beginPath();
        g.ellipse(x + ox, y + oy, rw * 0.32 * (1 - li * 0.15), rh * 0.45 * (1 - li * 0.15), 0, 0, Math.PI * 2);
        g.fill();
      }
    });
  });
  if (fog > 0) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = fogColor;
    g.globalAlpha = fog;
    g.fillRect(0, 0, W, H);
  }
  return c;
}

function makeRock(seed) {
  const W = 260, H = 160;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(seed);
  const pts = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([10 + t * (W - 20), H - (Math.sin(t * Math.PI) * (H - 30) * (0.6 + r() * 0.4)) - 5]);
  }
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#6d675f');
  grad.addColorStop(0.5, '#47423d');
  grad.addColorStop(1, '#2a2724');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, H);
  pts.forEach(([x, y]) => g.lineTo(x, y));
  g.lineTo(W, H);
  g.closePath();
  g.fill();
  // 결 · 따개비
  g.strokeStyle = 'rgba(20,18,16,0.5)';
  g.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const x = 30 + r() * (W - 60), y = 40 + r() * (H - 60);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + 20 + r() * 20); g.stroke();
  }
  g.fillStyle = 'rgba(220,215,200,0.25)';
  pts.forEach(([x, y], i) => { if (i % 2) { g.beginPath(); g.ellipse(x, y + 6, 18, 4, 0, 0, Math.PI * 2); g.fill(); } });
  g.fillStyle = 'rgba(40,70,40,0.55)';
  g.fillRect(0, H - 22, W, 22);
  return c;
}

export class Scene {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.line = 'east';
    this.hour = 12;
    this.flagHits = [];
    this.photoCache = new Map();
    this.footprints = [];
    const fog = 'rgb(160,180,190)';
    this.pinesNear = [0, 1, 2, 3, 4].map((i) => makePine(100 + i * 17, 0, fog));
    this.pinesMid = [0, 1, 2, 3].map((i) => makePine(300 + i * 13, 0.28, fog));
    this.pinesFar = [0, 1, 2].map((i) => makePine(500 + i * 11, 0.55, fog));
    this.rocks = [0, 1, 2, 3].map((i) => makeRock(900 + i * 7));
    this.layout();
    this.resize();
  }

  layout() {
    const r = rng(42);
    const mk = (from, to, gap, dens) => {
      const out = [];
      for (let x = from; x < to; x += gap * (0.5 + r())) {
        if (r() < dens(x)) out.push({ x, v: Math.floor(r() * 9), k: 0.8 + r() * 0.45 });
      }
      return out;
    };
    const d = (x) => 1 - smooth(1400, 2500, x);
    this.treesFar = mk(-400, 2000, 55, d);
    this.treesMid = mk(-300, 2300, 120, d);
    this.treesNear = mk(-200, 2600, 230, (x) => 1 - smooth(1600, 2700, x));
    this.treesFront = mk(150, 1700, 650, () => 0.7);
    this.grass = mk(1900, 3100, 45, () => 0.8);
    this.rockProps = mk(5320, 6450, 170, () => 1);
    this.clouds = Array.from({ length: 7 }, () => ({ x: r() * 3000, y: r(), s: 0.6 + r() * 0.9 }));
    this.stars = Array.from({ length: 120 }, () => [r(), r() * 0.55, r()]);
    this.islands = Array.from({ length: 6 }, () => ({ x: r() * 2400, w: 80 + r() * 260, h: 8 + r() * 26 }));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w; this.H = h;
    const portrait = h / w > 1.2;
    this.hY = h * (portrait ? 0.3 : 0.38); // 수평선
    this.sY = h * (portrait ? 0.44 : 0.6); // 물가
    this.gY = h * (portrait ? 0.56 : 0.8); // 아바타 발 위치
    this.fY = h * (portrait ? 0.68 : 0.94); // 깃발이 꽂히는 가장 앞쪽
    this.S = clamp(Math.min(h / 720, w / 560), 0.62, 1.4); // 기본 크기 배율
  }

  photo(report) {
    const key = report.id;
    let img = this.photoCache.get(key);
    if (!img && report.photo) {
      img = new Image();
      img.decoding = 'async';
      img.src = report.photo;
      this.photoCache.set(key, img);
    }
    return img && img.complete && img.naturalWidth ? img : null;
  }

  // world x → 화면 x (패럴랙스 p)
  sx(wx, p = 1) { return (wx - this.focus) * p + this.focusSx; }

  render(st, t) {
    const g = this.g;
    const { W, H } = this;
    this.focus = st.camX;
    this.focusSx = W * 0.42;
    const sky = skyAt(this.hour);
    this.sky = sky;
    const boat = st.onBoat;

    g.save();
    if (boat) {
      g.translate(W / 2, H * 0.8);
      g.rotate(Math.sin(t * 0.9) * 0.025);
      g.translate(-W / 2, -H * 0.8 + Math.sin(t * 1.3) * 6);
    }
    this.drawSky(g, sky, t);
    this.drawSea(g, sky, t, boat);
    if (!boat) {
      this.drawForestWall(g, sky);
      this.drawTreeLayer(g, this.treesFar, this.pinesFar, 0.45, this.sY + 4, H * 0.32);
      this.drawGround(g, sky, t);
      this.drawTreeLayer(g, this.treesMid, this.pinesMid, 0.7, this.sY + H * 0.08, H * 0.55);
      this.drawProps(g, t, st);
      this.drawTreeLayer(g, this.treesNear, this.pinesNear, 1, this.gY - H * 0.07, H * 0.85);
    }
    this.flagHits = [];
    const flagsBack = [], flagsFront = [];
    if (!boat) {
      for (const f of st.flags) (f.depth < 0.55 ? flagsBack : flagsFront).push(f);
      flagsBack.forEach((f) => this.drawFlag(g, f, t, st));
      this.drawFootprints(g, st, t);
      st.npcs.forEach((n) => this.drawNpc(g, n, t));
    } else {
      this.drawBoat(g, t);
    }
    // 낚싯줄/루어 (아바타 뒤)
    const av = st.avatar;
    const ax = boat ? W * 0.46 : this.sx(av.x);
    const ay = boat ? Math.min(H * 0.86, this.gY + H * 0.1) : this.gY;
    if (!st.hideAvatar) {
      const pose = st.fishing.pose(t);
      const tip = this.drawAvatar(g, ax, ay, this.S, st.look, { ...pose, phase: av.phase, dir: pose.rod != null || pose.noRod ? 1 : av.dir, walking: av.walking, name: st.look.name || '낚시꾼' });
      st.fishing.draw(g, this, tip, t, { ax, ay, boat });
    }
    if (!boat) flagsFront.forEach((f) => this.drawFlag(g, f, t, st));
    if (!boat) this.drawFront(g);
    g.restore();

    // 밤/노을 조명
    const dark = 1 - sky.light;
    if (dark > 0.05) {
      g.fillStyle = `rgba(8,12,35,${dark * 0.55})`;
      g.fillRect(0, 0, W, H);
      const lg = g.createRadialGradient(ax, ay - 60 * this.S, 10, ax, ay - 60 * this.S, 260 * this.S);
      lg.addColorStop(0, `rgba(255,220,150,${dark * 0.35})`);
      lg.addColorStop(1, 'rgba(255,220,150,0)');
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = lg;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }
    // 비네트
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  drawSky(g, sky, t) {
    const { W, hY } = this;
    const gr = g.createLinearGradient(0, 0, 0, hY + 2);
    gr.addColorStop(0, css(sky.top));
    gr.addColorStop(1, css(sky.bottom));
    g.fillStyle = gr;
    g.fillRect(0, 0, W, hY + 2);
    const h = this.hour;
    const night = 1 - sky.light;
    if (night > 0.4) {
      g.fillStyle = '#fff';
      this.stars.forEach(([x, y, k]) => {
        g.globalAlpha = (night - 0.4) * 1.6 * (0.4 + 0.6 * Math.abs(Math.sin(t * (0.5 + k) + k * 9)));
        g.fillRect(x * W, y * hY, 1.6, 1.6);
      });
      g.globalAlpha = 1;
    }
    // 해 / 달
    const east = this.line === 'east';
    if (h > 5.3 && h < 19.8) {
      const p = (h - 5.3) / 14.5;
      const x = east ? W * (0.8 - 0.6 * p) : W * (0.2 + 0.6 * p);
      const y = hY - Math.sin(p * Math.PI) * hY * 0.85 + 6;
      const low = 1 - Math.sin(p * Math.PI);
      const col = mixc('#fff6d8', '#ff8a4a', low * low);
      const glow = g.createRadialGradient(x, y, 4, x, y, 120 + low * 120);
      glow.addColorStop(0, css(col, 0.9));
      glow.addColorStop(1, css(col, 0));
      g.fillStyle = glow;
      g.fillRect(0, 0, W, hY);
      g.fillStyle = css(col);
      g.beginPath(); g.arc(x, y, 18 * this.S, 0, Math.PI * 2); g.fill();
      this.sun = { x, low, col };
    } else {
      const p = ((h + 24 - 19.8) % 24) / 9.5;
      const x = W * (0.2 + 0.6 * p);
      const y = hY - Math.sin(clamp(p) * Math.PI) * hY * 0.7 + 10;
      g.fillStyle = '#f2f0e0';
      g.beginPath(); g.arc(x, y, 14 * this.S, 0, Math.PI * 2); g.fill();
      g.fillStyle = css(skyAt(h).top);
      g.beginPath(); g.arc(x + 6 * this.S, y - 3 * this.S, 12 * this.S, 0, Math.PI * 2); g.fill();
      this.sun = { x, low: 0.6, col: [220, 225, 240], moon: true };
    }
    // 구름
    this.clouds.forEach((c) => {
      const x = ((c.x - this.focus * 0.04 + t * 6 * c.s) % (W + 600)) - 300;
      const y = 30 + c.y * hY * 0.5;
      g.fillStyle = css(mixc([255, 255, 255], sky.bottom, 0.35), 0.55 * (0.4 + sky.light * 0.6));
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.ellipse(x + k * 34 * c.s, y + Math.sin(k * 2) * 6, 46 * c.s, 15 * c.s, 0, 0, Math.PI * 2);
        g.fill();
      }
    });
    // 날아가는 갈매기
    const seaVis = smooth(2200, 3200, this.focus);
    if (seaVis > 0) {
      g.strokeStyle = `rgba(30,30,40,${0.6 * seaVis})`;
      g.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        const x = ((t * (22 + i * 7) + i * 400) % (W + 200)) - 100;
        const y = hY * (0.3 + i * 0.12) + Math.sin(t * 2 + i) * 8;
        const f = Math.sin(t * 8 + i) * 5;
        g.beginPath();
        g.moveTo(x - 9, y - f); g.quadraticCurveTo(x - 4, y - 5, x, y); g.quadraticCurveTo(x + 4, y - 5, x + 9, y - f);
        g.stroke();
      }
    }
  }

  drawSea(g, sky, t, boat) {
    const { W, H, hY } = this;
    const bottom = boat ? H : this.sY + 4;
    let near = sky.seaNear;
    if (this.line === 'west') near = mixc(near, '#6f7b5a', 0.22);
    const gr = g.createLinearGradient(0, hY, 0, bottom);
    gr.addColorStop(0, css(sky.seaFar));
    gr.addColorStop(1, css(near));
    g.fillStyle = gr;
    g.fillRect(0, hY, W, bottom - hY);
    // 서해: 수평선의 섬들
    if (this.line === 'west') {
      g.fillStyle = css(mixc(sky.seaFar, [30, 40, 50], 0.5));
      this.islands.forEach((is) => {
        const x = ((is.x - this.focus * 0.05) % 2600 + 2600) % 2600 - 300;
        g.beginPath();
        g.moveTo(x, hY + 1);
        g.quadraticCurveTo(x + is.w * 0.4, hY - is.h * this.S, x + is.w, hY + 1);
        g.fill();
      });
    }
    // 햇빛/달빛 반사
    if (this.sun) {
      const { x, low, col } = this.sun;
      for (let i = 0; i < 26; i++) {
        const k = i / 26;
        const y = hY + 3 + k * k * (bottom - hY);
        const w = (8 + k * 70) * (0.5 + low) * (0.6 + 0.4 * Math.sin(t * 3 + i * 1.7));
        g.fillStyle = css(col, (0.5 - k * 0.35) * (0.3 + low * 0.7));
        g.fillRect(x - w / 2 + Math.sin(t * 2 + i) * 6, y, w, 1.5 + k * 2);
      }
    }
    // 물결 (원근: 멀수록 촘촘)
    g.strokeStyle = css(mixc(sky.seaFar, [255, 255, 255], 0.35), 0.35);
    const r = rng(7);
    for (let i = 0; i < 70; i++) {
      const k = r();
      const y = hY + 2 + k * k * (bottom - hY);
      const len = 6 + k * 40;
      const x = ((r() * W * 1.4 - this.focus * (0.2 + k * 0.6) + t * 10 * (r() - 0.5)) % (W + 100) + W + 100) % (W + 100) - 50;
      g.lineWidth = 0.6 + k * 1.4;
      g.beginPath();
      g.moveTo(x, y + Math.sin(t * 1.5 + i) * 1.5);
      g.lineTo(x + len, y + Math.sin(t * 1.5 + i) * 1.5);
      g.stroke();
    }
    if (boat) return;
    // 밀려드는 파도 줄 (해변 가까이에서 하얗게 부서짐)
    const sY = this.sY;
    for (let i = 0; i < 3; i++) {
      const ph = ((t / 7 + i / 3) % 1);
      const y = lerp(sY - 50 * this.S, sY + 2, ph * ph);
      const a = Math.sin(ph * Math.PI) * 0.75;
      g.strokeStyle = `rgba(255,255,255,${a})`;
      g.lineWidth = 1 + ph * 3;
      g.beginPath();
      for (let x = 0; x <= W; x += 12) {
        const wx = x + this.focus;
        const yy = y + Math.sin(wx * 0.013 + i * 2) * 3 + Math.sin(wx * 0.041) * 1.5;
        x ? g.lineTo(x, yy) : g.moveTo(x, yy);
      }
      g.stroke();
    }
  }

  drawForestWall(g, sky) {
    const { W, hY, sY } = this;
    const col = css(mixc('#203826', sky.bottom, 0.25));
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, sY + 6);
    let any = false;
    for (let x = 0; x <= W + 8; x += 8) {
      const wx = this.focus + (x - this.focusSx) * 0.4;
      const a = 1 - smooth(1300, 2300, wx);
      const top = lerp(sY + 6, hY - 40 * this.S - Math.abs(Math.sin(wx * 0.05) * 18 + Math.sin(wx * 0.013) * 22), a);
      if (a > 0) any = true;
      g.lineTo(x, top);
    }
    g.lineTo(W + 8, sY + 6);
    g.closePath();
    if (any) g.fill();
  }

  drawTreeLayer(g, trees, sprites, p, baseY, h) {
    for (const tr of trees) {
      const x = this.sx(tr.x, p);
      const hh = h * tr.k;
      const w = hh * (300 / 460);
      if (x < -w || x > this.W + w) continue;
      g.drawImage(sprites[tr.v % sprites.length], x - w / 2, baseY - hh, w, hh);
    }
  }

  groundAt(wx) {
    const forest = '#4b3b29', fPath = '#8c7452';
    const sand = '#e6d3a8', sPath = '#dcc496';
    const rock = '#5f5852', conc = '#a3a39c';
    let base, path;
    const a = smooth(1700, 2150, wx);
    base = mixc(forest, sand, a);
    path = mixc(fPath, sPath, a);
    const b = smooth(5250, 5400, wx);
    base = mixc(base, rock, b);
    path = mixc(path, '#6a625b', b);
    const c = smooth(6450, 6550, wx);
    base = mixc(base, conc, c);
    path = mixc(path, '#b8b8b1', c);
    return { base, path };
  }

  drawGround(g, sky, t) {
    const { W, H, sY, gY } = this;
    const step = 6;
    for (let x = 0; x < W; x += step) {
      const wx = this.focus + (x - this.focusSx);
      const { base, path } = this.groundAt(wx);
      g.fillStyle = css(base);
      g.fillRect(x, sY, step + 1, H - sY);
      // 물가의 젖은 모래
      const beach = smooth(2500, 2900, wx) * (1 - smooth(5250, 5350, wx));
      if (beach > 0) {
        const wg = g.createLinearGradient(0, sY, 0, sY + 40 * this.S);
        wg.addColorStop(0, `rgba(120,100,70,${0.55 * beach})`);
        wg.addColorStop(1, 'rgba(120,100,70,0)');
        g.fillStyle = wg;
        g.fillRect(x, sY, step + 1, 40 * this.S);
      }
      const forest = 1 - smooth(1700, 2150, wx);
      const pathA = forest + (1 - forest) * (1 - smooth(2600, 2900, wx));
      if (pathA > 0) {
        g.fillStyle = css(path, pathA);
        const wob = Math.sin(wx * 0.004) * 10 * this.S;
        g.fillRect(x, gY - 22 * this.S + wob, step + 1, 44 * this.S);
      }
    }
    // 바닥 질감
    const r = rng(11);
    for (let i = 0; i < 260; i++) {
      const wx0 = r() * 8000;
      const x = ((wx0 - this.focus) % 8000 + 8000) % 8000 + this.focusSx - 4000;
      if (x < 0 || x > W) continue;
      const wx = this.focus + (x - this.focusSx);
      const y = sY + 6 + r() * (H - sY);
      if (wx < 2100) {
        g.strokeStyle = 'rgba(160,110,60,0.6)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, y + 2); g.stroke();
      } else if (wx < 5300) {
        g.fillStyle = 'rgba(160,135,95,0.4)';
        g.fillRect(x, y, 2, 1.5);
      } else if (wx < 6500) {
        g.fillStyle = 'rgba(30,28,25,0.35)';
        g.beginPath(); g.ellipse(x, y, 10, 3, 0, 0, Math.PI * 2); g.fill();
      } else {
        g.strokeStyle = 'rgba(80,80,75,0.35)';
        g.beginPath(); g.moveTo(x, gY - 30 * this.S); g.lineTo(x, H); g.stroke();
      }
    }
    // 물가 포말 (밀려왔다 빠지는 물)
    const swash = Math.sin(t * (Math.PI * 2 / 7)) * 0.5 + 0.5;
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.moveTo(0, sY);
    for (let x = 0; x <= W; x += 10) {
      const wx = this.focus + (x - this.focusSx);
      const beach = smooth(2600, 2950, wx) * (1 - smooth(5250, 5350, wx));
      g.lineTo(x, sY + beach * (4 + swash * 18 * this.S + Math.sin(wx * 0.02 + t) * 3));
    }
    g.lineTo(W, sY);
    g.closePath();
    g.fill();
  }

  drawProps(g, t, st) {
    const { S, gY, sY, H } = this;
    // 모랫길: 밧줄 울타리
    for (let wx = 1950; wx < 2950; wx += 110) {
      const x = this.sx(wx);
      if (x < -50 || x > this.W + 50) continue;
      g.fillStyle = '#7b5a3a';
      g.fillRect(x - 3 * S, gY - 70 * S, 6 * S, 40 * S);
      g.strokeStyle = '#c9b48a';
      g.lineWidth = 2 * S;
      const nx = this.sx(wx + 110);
      if (wx + 110 < 2950) {
        g.beginPath();
        g.moveTo(x, gY - 64 * S);
        g.quadraticCurveTo((x + nx) / 2, gY - 52 * S, nx, gY - 64 * S);
        g.stroke();
      }
    }
    // 갯그령(해안 풀)
    g.strokeStyle = '#7d8a4a';
    g.lineWidth = 1.4;
    for (const gr of this.grass) {
      const x = this.sx(gr.x);
      if (x < -20 || x > this.W + 20) continue;
      const y = sY + 20 * S + (gr.v / 9) * 50 * S;
      for (let k = 0; k < 6; k++) {
        const sw = Math.sin(t * 1.6 + gr.x + k) * 4;
        g.beginPath();
        g.moveTo(x + k * 3, y);
        g.quadraticCurveTo(x + k * 3 + sw, y - 12 * S, x + k * 3 + sw * 2 + (k - 3) * 2, y - 22 * S * gr.k);
        g.stroke();
      }
    }
    // 해변 입구 안내판
    this.sign(g, 2900, '모래 해변 · 서프 포인트');
    this.sign(g, 5320, '갯바위 · 미끄럼 주의');
    this.sign(g, 6520, '방파제');
    this.sign(g, 7320, '⚓ 배낚시 선착장');

    // 갯바위
    const wavePh = (t / 7) % 1;
    for (const rp of this.rockProps) {
      const x = this.sx(rp.x);
      const w = 230 * S * rp.k, h = 140 * S * rp.k;
      if (x < -w || x > this.W + w) continue;
      const y = sY + 30 * S + (rp.v % 3) * 12 * S;
      g.drawImage(this.rocks[rp.v % 4], x - w / 2, y - h, w, h);
      // 부서지는 포말
      if (wavePh > 0.82) {
        const k = (wavePh - 0.82) / 0.18;
        g.fillStyle = `rgba(255,255,255,${(1 - k) * 0.8})`;
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI;
          g.beginPath();
          g.arc(x + Math.cos(a) * w * 0.4 * k, y - h * 0.8 - Math.sin(a) * 60 * S * k, (5 + i % 3 * 3) * S, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // 방파제: 테트라포드 + 콘크리트 상판 + 등대
    const bwFrom = this.sx(6500), bwTo = this.sx(WORLD_END + 400);
    if (bwTo > 0 && bwFrom < this.W) {
      for (let wx = 6520; wx < WORLD_END + 300; wx += 70) {
        const x = this.sx(wx);
        if (x < -60 || x > this.W + 60) continue;
        this.tetrapod(g, x, sY + 10 * S + ((wx / 70) % 2) * 10 * S, 34 * S);
      }
      const x0 = Math.max(-10, bwFrom);
      g.fillStyle = '#c3c3bc';
      g.fillRect(x0, gY - 40 * S, bwTo - x0, 10 * S);
      g.fillStyle = '#8f8f88';
      g.fillRect(x0, gY + 30 * S, bwTo - x0, H - gY);
      const lx = this.sx(7700);
      if (lx > -80 && lx < this.W + 80) this.lighthouse(g, lx, gY - 40 * S, t);
      // 선착장 배
      const bx = this.sx(7400);
      if (bx > -100 && bx < this.W + 100) this.smallBoat(g, bx, sY - 6 * S + Math.sin(t * 1.4) * 2, 0.7 * S);
    }
  }

  sign(g, wx, text) {
    const { S, gY } = this;
    const x = this.sx(wx);
    if (x < -120 || x > this.W + 120) return;
    g.fillStyle = '#6b4a2b';
    g.fillRect(x - 3 * S, gY - 95 * S, 6 * S, 70 * S);
    g.font = `600 ${12 * S}px Pretendard, sans-serif`;
    const w = g.measureText(text).width + 16 * S;
    g.fillStyle = '#8a6339';
    g.fillRect(x - w / 2, gY - 118 * S, w, 26 * S);
    g.strokeStyle = '#4e3520';
    g.lineWidth = 2;
    g.strokeRect(x - w / 2, gY - 118 * S, w, 26 * S);
    g.fillStyle = '#fff4dc';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x, gY - 105 * S);
  }

  tetrapod(g, x, y, s) {
    g.lineCap = 'round';
    const legs = [[0, -1], [0.9, 0.45], [-0.9, 0.45], [0.15, 0.75]];
    legs.forEach(([dx, dy], i) => {
      g.strokeStyle = i === 3 ? '#8a8a83' : '#a9a9a2';
      g.lineWidth = s * 0.42;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx * s, y + dy * s * 0.75); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = s * 0.12;
      g.beginPath(); g.moveTo(x - s * 0.06, y - s * 0.08); g.lineTo(x + dx * s - s * 0.06, y + dy * s * 0.75 - s * 0.08); g.stroke();
    });
    g.lineCap = 'butt';
  }

  lighthouse(g, x, y, t) {
    const S = this.S;
    const h = 230 * S, w0 = 34 * S, w1 = 22 * S;
    for (let i = 0; i < 6; i++) {
      const y0 = y - (h * i) / 6, y1 = y - (h * (i + 1)) / 6;
      const a = lerp(w0, w1, i / 6), b = lerp(w0, w1, (i + 1) / 6);
      g.fillStyle = i % 2 ? '#f4f1ea' : '#d22b2b';
      g.beginPath();
      g.moveTo(x - a, y0); g.lineTo(x + a, y0); g.lineTo(x + b, y1); g.lineTo(x - b, y1);
      g.closePath(); g.fill();
    }
    g.fillStyle = '#333';
    g.fillRect(x - w1 - 4, y - h - 4, (w1 + 4) * 2, 6);
    g.fillStyle = '#ffe9a0';
    g.fillRect(x - 12 * S, y - h - 26 * S, 24 * S, 22 * S);
    g.fillStyle = '#d22b2b';
    g.beginPath(); g.moveTo(x - 18 * S, y - h - 26 * S); g.lineTo(x, y - h - 44 * S); g.lineTo(x + 18 * S, y - h - 26 * S); g.fill();
    if (this.sky.light < 0.6) {
      const ang = t * 1.2;
      g.fillStyle = 'rgba(255,240,170,0.18)';
      g.beginPath();
      g.moveTo(x, y - h - 15 * S);
      g.lineTo(x + Math.cos(ang) * 600, y - h - 15 * S - 40);
      g.lineTo(x + Math.cos(ang) * 600, y - h - 15 * S + 40);
      g.fill();
    }
  }

  smallBoat(g, x, y, s) {
    g.fillStyle = '#f4f1ea';
    g.beginPath();
    g.moveTo(x - 90 * s, y - 20 * s);
    g.lineTo(x + 100 * s, y - 20 * s);
    g.lineTo(x + 70 * s, y + 14 * s);
    g.lineTo(x - 80 * s, y + 14 * s);
    g.closePath(); g.fill();
    g.fillStyle = '#2b5fa6';
    g.fillRect(x - 85 * s, y - 2 * s, 170 * s, 7 * s);
    g.fillStyle = '#e7e2d6';
    g.fillRect(x - 30 * s, y - 52 * s, 50 * s, 32 * s);
    g.fillStyle = '#6fa6c9';
    g.fillRect(x - 24 * s, y - 46 * s, 16 * s, 12 * s);
    g.fillRect(x, y - 46 * s, 14 * s, 12 * s);
  }

  drawBoat(g, t) {
    const { W, H, S } = this;
    // 배 위: 뱃전과 갑판
    const y = H * 0.82;
    g.fillStyle = '#e9e5da';
    g.beginPath();
    g.moveTo(-20, y - 20 * S);
    g.lineTo(W + 20, y - 40 * S);
    g.lineTo(W + 20, H + 10);
    g.lineTo(-20, H + 10);
    g.closePath(); g.fill();
    g.fillStyle = '#2b5fa6';
    g.beginPath();
    g.moveTo(-20, y - 20 * S); g.lineTo(W + 20, y - 40 * S); g.lineTo(W + 20, y - 30 * S); g.lineTo(-20, y - 10 * S);
    g.closePath(); g.fill();
    g.fillStyle = '#b9b2a2';
    g.fillRect(0, y + 10 * S, W, H);
    // 선실
    g.fillStyle = '#f4f1ea';
    g.fillRect(W * 0.72, y - 170 * S, 160 * S, 150 * S);
    g.fillStyle = '#6fa6c9';
    g.fillRect(W * 0.72 + 16 * S, y - 150 * S, 50 * S, 40 * S);
    g.fillRect(W * 0.72 + 86 * S, y - 150 * S, 50 * S, 40 * S);
    // 물보라
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 12; i++) {
      const x = ((i * 137 + t * 40) % (W + 40)) - 20;
      g.beginPath(); g.ellipse(x, y - 24 * S - (x / W) * 20 * S, 14 * S, 3 * S, 0, 0, Math.PI * 2); g.fill();
    }
  }

  drawFront(g) {
    const { H, S } = this;
    for (const tr of this.treesFront) {
      const x = this.sx(tr.x, 1.4);
      if (x < -200 || x > this.W + 200) continue;
      g.fillStyle = 'rgba(40,18,10,0.92)';
      g.beginPath();
      g.moveTo(x - 30 * S, H + 10);
      g.quadraticCurveTo(x - 10 * S, H * 0.5, x + 10 * S * tr.k, -20);
      g.lineTo(x + 46 * S * tr.k, -20);
      g.quadraticCurveTo(x + 20 * S, H * 0.5, x + 34 * S, H + 10);
      g.closePath();
      g.fill();
    }
  }

  addFootprint(wx, dir, foot) {
    this.footprints.push({ x: wx, dir, foot, born: performance.now() });
    if (this.footprints.length > 80) this.footprints.shift();
  }

  drawFootprints(g) {
    const now = performance.now();
    const { S, gY } = this;
    for (const f of this.footprints) {
      const age = (now - f.born) / 9000;
      if (age > 1) continue;
      if (f.x < 1950 || f.x > 5300) continue;
      const x = this.sx(f.x);
      g.fillStyle = `rgba(110,85,55,${0.35 * (1 - age)})`;
      g.beginPath();
      g.ellipse(x, gY + (f.foot ? 4 : -4) * S, 6 * S, 2.6 * S, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  // 깃발: 인증 사진이 천에 펄럭인다
  drawFlag(g, f, t, st) {
    const S = this.S * (0.75 + f.depth * 0.5);
    const x = this.sx(f.x);
    if (x < -120 || x > this.W + 120) return;
    const y = lerp(this.sY + 34 * this.S, this.fY, f.depth);
    const poleH = 120 * S;
    const r = f.report;
    const methodCol = { lure: '#f26b1d', far: '#2aa198', float: '#3a6fd8' }[r.method] || '#d33';
    const hover = st.hoverFlag === r.id;
    // 그림자
    g.fillStyle = 'rgba(60,40,20,0.25)';
    g.beginPath(); g.ellipse(x + 10 * S, y, 16 * S, 4 * S, 0, 0, Math.PI * 2); g.fill();
    // 깃대
    g.fillStyle = '#ddd';
    g.fillRect(x - 2 * S, y - poleH, 4 * S, poleH);
    g.fillStyle = methodCol;
    g.beginPath(); g.arc(x, y - poleH, 5 * S, 0, Math.PI * 2); g.fill();
    // 천 (세로 슬라이스로 물결)
    const cw = 84 * S, ch = 60 * S;
    const top = y - poleH + 4 * S;
    const img = this.photo(r);
    const slices = 24;
    for (let i = 0; i < slices; i++) {
      const u = i / slices;
      const off = Math.sin(t * 5 - u * 5 + f.x) * 5 * S * u;
      const sx = x + 2 * S + u * cw;
      const sw = cw / slices + 0.8;
      g.fillStyle = methodCol;
      g.fillRect(sx, top + off, sw, ch);
      if (img) {
        const iw = img.naturalWidth, ih = img.naturalHeight;
        const ar = cw / ch;
        let cropW = iw, cropH = iw / ar;
        if (cropH > ih) { cropH = ih; cropW = ih * ar; }
        const ox = (iw - cropW) / 2, oy = (ih - cropH) / 2;
        g.drawImage(img, ox + u * cropW, oy, cropW / slices + 1, cropH, sx, top + off + 3 * S, sw, ch - 6 * S);
      }
      // 명암
      const shade = Math.cos(t * 5 - u * 5 + f.x) * 0.1 * u;
      g.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`;
      g.fillRect(sx, top + off, sw, ch);
    }
    // 장소 / 어종 팻말
    g.font = `700 ${11 * S}px Pretendard, sans-serif`;
    const label = `${r.species}${r.size ? ' ' + r.size + 'cm' : ''}`;
    const place = r.spot || '';
    const w = Math.max(g.measureText(label).width, g.measureText(place).width) + 14 * S;
    const ly = y - poleH + ch + 12 * S;
    g.fillStyle = hover ? '#fffbe8' : 'rgba(255,250,236,0.92)';
    g.strokeStyle = methodCol;
    g.lineWidth = hover ? 3 : 1.5;
    roundRect(g, x - w / 2 + 40 * S, ly, w, 32 * S, 6 * S);
    g.fill(); g.stroke();
    g.fillStyle = '#1b2230';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText(label, x + 40 * S, ly + 3 * S);
    g.font = `500 ${10 * S}px Pretendard, sans-serif`;
    g.fillStyle = '#4b5565';
    g.fillText('📍 ' + place, x + 40 * S, ly + 17 * S);
    if (r.sample) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.font = `600 ${9 * S}px Pretendard, sans-serif`;
      g.fillText('예시', x + 2 * S + cw - 12 * S, top + 4 * S);
    }
    if (f.isNew) {
      g.fillStyle = '#ff3b5c';
      roundRect(g, x - 2 * S, top - 18 * S, 34 * S, 14 * S, 7 * S);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `800 ${9 * S}px Pretendard, sans-serif`;
      g.fillText('NEW', x + 15 * S, top - 16 * S);
    }
    // 꽂히는 애니메이션
    if (f.plantedAt) {
      const k = (performance.now() - f.plantedAt) / 900;
      if (k < 1) {
        g.strokeStyle = `rgba(255,220,120,${1 - k})`;
        g.lineWidth = 3;
        g.beginPath(); g.ellipse(x, y, 30 * S * (0.4 + k), 8 * S * (0.4 + k), 0, 0, Math.PI * 2); g.stroke();
      }
    }
    this.flagHits.push({ id: r.id, x0: x - 10 * S, x1: x + Math.max(cw, 40 * S + w / 2) + 6 * S, y0: top - 20 * S, y1: y + 4 * S, d: f.depth });
  }

  hitFlag(px, py) {
    let best = null;
    for (const h of this.flagHits) {
      if (px >= h.x0 && px <= h.x1 && py >= h.y0 && py <= h.y1) {
        if (!best || h.d > best.d) best = h;
      }
    }
    return best && best.id;
  }

  drawNpc(g, n, t) {
    const x = this.sx(n.x);
    if (x < -100 || x > this.W + 100) return;
    const cyc = (t + n.seed) % 9;
    let rod = -0.9;
    if (cyc < 0.6) rod = -0.9 - 1.6 * (cyc / 0.6);
    else if (cyc < 0.9) rod = -2.5 + 2.2 * ((cyc - 0.6) / 0.3);
    else rod = -0.5 - Math.min(1, (cyc - 0.9) / 8) * 0.4;
    const y = this.gY - 18 * this.S;
    const s = this.S * 0.85;
    const tip = this.drawAvatar(g, x, y, s, n.look, { rod, dir: 1, name: n.name, small: true });
    if (cyc > 0.9) {
      const k = Math.min(1, (cyc - 0.9) / 0.6);
      const lx = tip.x + 180 * s * k;
      const ly = lerp(tip.y, this.sY - (40 + n.seed * 3) * this.S, k);
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(tip.x, tip.y); g.quadraticCurveTo((tip.x + lx) / 2, tip.y - 20 * k, lx, ly); g.stroke();
    }
  }

  // 아바타 (서프루어 낚시꾼)
  drawAvatar(g, x, y, s, look, pose = {}) {
    const dir = pose.dir || 1;
    const walk = pose.walking ? Math.sin(pose.phase || 0) : 0;
    const bob = pose.walking ? Math.abs(Math.cos(pose.phase || 0)) * 2 * s : 0;
    const skin = '#f0c8a2';
    const pants = look.pantsColor || '#4b5136';
    g.save();
    g.translate(x, y - bob);
    // 그림자
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath(); g.ellipse(0, bob, 20 * s, 5 * s, 0, 0, Math.PI * 2); g.fill();
    g.scale(dir, 1);
    const hipY = -38 * s;
    const leg = (ang, back) => {
      g.save();
      g.translate(0, hipY);
      g.rotate(ang);
      g.fillStyle = back ? shade(pants, -0.18) : pants;
      g.fillRect(-5 * s, 0, 10 * s, look.pants === 'shorts' ? 16 * s : 34 * s);
      if (look.pants === 'shorts') {
        g.fillStyle = skin;
        g.fillRect(-4 * s, 16 * s, 8 * s, 18 * s);
      }
      g.fillStyle = look.pants === 'wader' ? shade(pants, -0.3) : '#2a2a2a';
      g.fillRect(-5 * s, 30 * s, 13 * s, 7 * s);
      g.restore();
    };
    leg(-walk * 0.45, true);
    leg(walk * 0.45, false);
    // 몸통
    const jacket = look.jacket || '#f26b1d';
    g.fillStyle = jacket;
    roundRect(g, -11 * s, -72 * s, 22 * s, 38 * s, 6 * s);
    g.fill();
    if (look.pants === 'wader') {
      g.fillStyle = pants;
      g.fillRect(-10 * s, -54 * s, 20 * s, 18 * s);
      g.strokeStyle = shade(pants, -0.3);
      g.lineWidth = 2 * s;
      g.beginPath(); g.moveTo(-7 * s, -54 * s); g.lineTo(-5 * s, -70 * s); g.moveTo(7 * s, -54 * s); g.lineTo(5 * s, -70 * s); g.stroke();
    }
    if (look.vest) {
      g.fillStyle = '#ff4d2e';
      roundRect(g, -12 * s, -68 * s, 24 * s, 16 * s, 4 * s);
      g.fill();
      g.fillStyle = '#f5d33b';
      g.fillRect(-12 * s, -62 * s, 24 * s, 2.5 * s);
    }
    // 뒷팔
    const rodAng = pose.rod != null ? pose.rod : null;
    g.fillStyle = shade(jacket, -0.2);
    g.save();
    g.translate(-2 * s, -68 * s);
    g.rotate(rodAng != null ? rodAng + 1.3 : -walk * 0.5);
    g.fillRect(-3.5 * s, 0, 7 * s, 26 * s);
    g.restore();
    // 머리
    g.fillStyle = skin;
    g.beginPath(); g.arc(1 * s, -82 * s, 9 * s, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#222';
    g.beginPath(); g.arc(6 * s, -83 * s, 1.3 * s, 0, Math.PI * 2); g.fill();
    // 편광 선글라스
    g.fillStyle = 'rgba(20,30,40,0.85)';
    g.fillRect(3 * s, -86 * s, 7 * s, 3.4 * s);
    // 모자
    const hc = look.hatColor || '#1f3b73';
    g.fillStyle = hc;
    if (look.hat === 'cap') {
      g.beginPath(); g.arc(1 * s, -85 * s, 9.5 * s, Math.PI, 0); g.fill();
      g.fillRect(4 * s, -87 * s, 11 * s, 3 * s);
    } else if (look.hat === 'bucket') {
      g.beginPath();
      g.moveTo(-8 * s, -86 * s); g.lineTo(-6 * s, -95 * s); g.lineTo(8 * s, -95 * s); g.lineTo(10 * s, -86 * s);
      g.closePath(); g.fill();
      g.fillRect(-13 * s, -87 * s, 28 * s, 3 * s);
    } else if (look.hat === 'beanie') {
      g.beginPath(); g.arc(1 * s, -85 * s, 10 * s, Math.PI, 0); g.fill();
      g.fillStyle = shade(hc, -0.2);
      g.fillRect(-9 * s, -87 * s, 20 * s, 4 * s);
    } else {
      g.fillStyle = '#2b2018';
      g.beginPath(); g.arc(0, -86 * s, 9 * s, Math.PI, 0); g.fill();
    }
    // 앞팔 + 낚싯대
    let tip;
    g.save();
    g.translate(2 * s, -67 * s);
    const armA = rodAng != null ? rodAng + 1.0 : walk * 0.5;
    g.rotate(armA);
    g.fillStyle = jacket;
    g.fillRect(-3.5 * s, 0, 7 * s, 24 * s);
    g.fillStyle = skin;
    g.beginPath(); g.arc(0, 25 * s, 3.5 * s, 0, Math.PI * 2); g.fill();
    g.restore();
    const hx = 2 * s - Math.sin(armA) * 25 * s;
    const hy = -67 * s + Math.cos(armA) * 25 * s;
    if (pose.noRod) {
      g.restore();
      tip = { x: x + hx * dir, y: y - bob + hy };
      this.nameTag(g, x, y - bob, s, pose);
      return tip;
    }
    const ang = rodAng != null ? rodAng : -1.2 + walk * 0.05;
    const L = (pose.small ? 80 : 95) * s;
    const bend = pose.bend || 0;
    const tx = hx + Math.cos(ang) * L + bend * 18 * s;
    const ty = hy + Math.sin(ang) * L + bend * 30 * s;
    g.strokeStyle = '#1c1c1c';
    g.lineWidth = 2.6 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(hx - Math.cos(ang) * 18 * s, hy - Math.sin(ang) * 18 * s);
    g.quadraticCurveTo(hx + Math.cos(ang) * L * 0.6, hy + Math.sin(ang) * L * 0.6, tx, ty);
    g.stroke();
    g.strokeStyle = '#c9c9c9';
    g.lineWidth = 1.2 * s;
    g.beginPath(); g.moveTo(hx + Math.cos(ang) * L * 0.75, hy + Math.sin(ang) * L * 0.75 + bend * 12 * s); g.lineTo(tx, ty); g.stroke();
    // 릴
    g.fillStyle = '#9aa3ad';
    g.beginPath(); g.arc(hx + Math.cos(ang) * 4 * s, hy + Math.sin(ang) * 4 * s + 5 * s, 4 * s, 0, Math.PI * 2); g.fill();
    g.restore();
    tip = { x: x + tx * dir, y: y - bob + ty };
    this.nameTag(g, x, y - bob, s, pose);
    return tip;
  }

  nameTag(g, x, y, s, pose) {
    const bob = 0;
    if (pose.name) {
      g.font = `700 ${(pose.small ? 11 : 13) * Math.max(0.8, s)}px Pretendard, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      const ny = y - bob - 102 * s;
      const w = g.measureText(pose.name).width + 14;
      g.fillStyle = pose.small ? 'rgba(0,0,0,0.38)' : 'rgba(15,30,55,0.7)';
      roundRect(g, x - w / 2, ny - 18, w, 20, 10);
      g.fill();
      g.fillStyle = '#fff';
      g.fillText(pose.name, x, ny);
    }
  }
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function shade(hex, k) {
  const c = rgb(hex);
  const t = k < 0 ? [0, 0, 0] : [255, 255, 255];
  return css(mixc(c, t, Math.abs(k)));
}
