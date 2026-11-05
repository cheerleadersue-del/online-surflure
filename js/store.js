// 조과 인증글 저장소
// 1) Netlify Functions(/api/catches)가 있으면 모두가 공유하는 클라우드 모드
// 2) 없으면(로컬 실행·GitHub Pages 등) 이 브라우저의 localStorage에 저장하는 로컬 모드
import { rng, hashStr } from './scene.js';

const API = '/api/catches';
const LS_KEY = 'surflure.catches.v1';

export class Store {
  constructor() {
    this.mode = 'unknown';
    this.items = [];
    this.listeners = new Set();
    this.bc = 'BroadcastChannel' in window ? new BroadcastChannel('surflure') : null;
    if (this.bc) this.bc.onmessage = () => this.refresh();
    window.addEventListener('storage', (e) => { if (e.key === LS_KEY) this.refresh(); });
  }

  on(fn) { this.listeners.add(fn); }
  emit() { this.listeners.forEach((fn) => fn(this.items)); }

  async init() {
    try {
      const res = await fetch(API, { headers: { accept: 'application/json' } });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('json')) {
        this.mode = 'cloud';
        this.items = (await res.json()).items || [];
      } else throw new Error('no api');
    } catch (_) {
      this.mode = 'local';
      this.items = this.readLocal();
    }
    this.emit();
    if (this.mode === 'cloud') setInterval(() => this.refresh(), 15000);
    return this.mode;
  }

  readLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (_) { return []; }
  }

  writeLocal(items) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(items));
    } catch (e) {
      throw new Error('브라우저 저장 공간이 가득 찼어요. 오래된 글을 지우거나 사진을 줄여주세요.');
    }
    this.bc && this.bc.postMessage('changed');
  }

  async refresh() {
    if (this.mode === 'cloud') {
      try {
        const res = await fetch(API, { headers: { accept: 'application/json' } });
        if (res.ok) this.items = (await res.json()).items || [];
      } catch (_) { return; }
    } else {
      this.items = this.readLocal();
    }
    this.emit();
  }

  get(id) { return this.items.find((x) => x.id === id); }

  async add(report) {
    if (this.mode === 'cloud') {
      const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '저장에 실패했어요');
      this.items = [data.item, ...this.items.filter((x) => x.id !== data.item.id)];
      this.emit();
      return data.item;
    }
    const item = { ...report, id: uid(), createdAt: new Date().toISOString(), comments: [], likes: 0 };
    const items = [item, ...this.readLocal()];
    this.writeLocal(items);
    this.items = items;
    this.emit();
    return item;
  }

  async comment(id, author, text) {
    if (this.mode === 'cloud') {
      const res = await fetch(`${API}/${encodeURIComponent(id)}/comments`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ author, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '댓글 저장 실패');
      this.replace(data.item);
      return data.item;
    }
    const items = this.readLocal();
    const it = items.find((x) => x.id === id);
    if (!it) throw new Error('글을 찾을 수 없어요');
    it.comments = [...(it.comments || []), { id: uid(), author, text, at: new Date().toISOString() }];
    this.writeLocal(items);
    this.items = items;
    this.emit();
    return it;
  }

  async like(id) {
    if (this.mode === 'cloud') {
      const res = await fetch(`${API}/${encodeURIComponent(id)}/like`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) this.replace(data.item);
      return data.item;
    }
    const items = this.readLocal();
    const it = items.find((x) => x.id === id);
    if (!it) return null;
    it.likes = (it.likes || 0) + 1;
    this.writeLocal(items);
    this.items = items;
    this.emit();
    return it;
  }

  replace(item) {
    if (!item) return;
    this.items = this.items.map((x) => (x.id === item.id ? item : x));
    this.emit();
  }
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── 예시 글 (실제 글이 적을 때 해변이 비어 보이지 않도록; 저장되지 않으며 '예시'로 표시) ──
const SAMPLES = {
  east: [
    ['양양 하조대', '광어', 58, 'lure', '메탈지그 30g', '새벽', 17.2, '해뜨기 직전 마즈메, 브레이크라인 너머로 풀캐스팅 후 바닥 찍고 리프트&폴 3번째에 묵직하게 들어왔어요.'],
    ['강릉 사천해변', '삼치', 66, 'lure', '싱킹펜슬 110mm', '아침', 18.1, '베이트(멸치)가 튀는 곳 확인하고 빠른 릴링으로 수면 바로 아래를 긁었더니 연타!'],
    ['고성 봉포해변', '황어', 42, 'lure', '스푼 28g', '오후', 16.5, '하구 근처 민물 유입구에서 잡혔습니다. 물색이 탁할 때 실버 스푼이 좋았어요.'],
    ['포항 칠포해변', '보리멸', 22, 'far', '청갯지렁이', '낮', 19.0, '원투 3대 펼쳐두고 방울 울릴 때마다 한 마리씩. 가족 나들이 손맛용으로 최고.'],
  ],
  west: [
    ['태안 만리포해변', '광어', 62, 'lure', '지그헤드+웜 4인치', '해질녘', 15.8, '들물 2시간째, 갯골 경계에서 웜을 바닥에 질질 끌다가 톡 하는 입질 후 챔질.'],
    ['보령 대천해수욕장', '농어', 71, 'lure', '미노우 120mm', '밤', 15.1, '파도가 적당히 있는 밤, 포말 지대 옆으로 미노우를 천천히 흘리니 강하게 물고 늘어졌어요.'],
    ['군산 선유도', '우럭', 34, 'float', '크릴', '아침', 14.6, '선상 찌낚시. 수심 8m 암초 위로 찌를 흘리다 찌가 쭉 잠기는 순간 챔질!'],
    ['부안 변산해변', '도다리', 31, 'far', '참갯지렁이', '오후', 14.9, '원투 100m, 모래와 뻘이 섞인 지점. 방울이 살짝 흔들릴 때 기다렸다가 확실할 때 챔질.'],
  ],
};

let sampleCache = null;
export function sampleReports() {
  if (sampleCache) return sampleCache;
  sampleCache = [];
  for (const line of ['east', 'west']) {
    SAMPLES[line].forEach(([spot, species, size, method, bait, slot, temp, story], i) => {
      const id = `sample-${line}-${i}`;
      const d = new Date(Date.now() - (i + 1) * 86400000 * 1.7);
      sampleCache.push({
        id, sample: true, line, spot, species, size, method, bait, slot, waterTemp: temp, story,
        caughtAt: d.toISOString(), createdAt: d.toISOString(), count: 1,
        rod: method === 'far' ? '원투대 4.2m' : method === 'float' ? '선상 찌낚시대 3m' : '서프로드 10ft',
        reel: method === 'far' ? '스피닝 5000번' : '스피닝 4000번', lineSpec: method === 'lure' ? '합사 1.2호 + 쇼크리더 20lb' : '나일론 4호',
        author: '운영자 예시', comments: [{ id: 'c' + i, author: '운영자', text: '예시 글입니다. 첫 인증글을 남겨주세요!', at: d.toISOString() }],
        likes: 0, photo: samplePhoto(species, hashStr(id)),
      });
    });
  }
  return sampleCache;
}

function samplePhoto(species, seed) {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = 480; c.height = 340;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 170);
  sky.addColorStop(0, `hsl(${200 + r() * 20},60%,${55 + r() * 15}%)`);
  sky.addColorStop(1, '#f4d9b5');
  g.fillStyle = sky; g.fillRect(0, 0, 480, 170);
  g.fillStyle = '#2d6f9a'; g.fillRect(0, 140, 480, 60);
  g.fillStyle = '#e3cfa2'; g.fillRect(0, 200, 480, 140);
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, 196, 480, 6);
  // 물고기
  g.save();
  g.translate(240, 255);
  g.rotate(-0.08);
  const body = g.createLinearGradient(0, -40, 0, 40);
  const flat = /광어|도다리/.test(species);
  body.addColorStop(0, flat ? '#6b5a42' : '#4f6676');
  body.addColorStop(1, flat ? '#a8946f' : '#eef3f6');
  g.fillStyle = body;
  g.beginPath(); g.ellipse(0, 0, 150, flat ? 52 : 36, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(135, 0); g.lineTo(200, -40); g.lineTo(200, 40); g.closePath(); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.arc(-110, -8, 7, 0, Math.PI * 2); g.fill();
  g.restore();
  // 줄자
  g.fillStyle = '#f2c230'; g.fillRect(60, 312, 360, 14);
  g.fillStyle = '#222';
  for (let i = 0; i <= 36; i++) g.fillRect(60 + i * 10, 312, 1, i % 5 ? 5 : 9);
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, 480, 30);
  g.fillStyle = '#fff'; g.font = '600 15px sans-serif';
  g.fillText(`예시 사진 · ${species}`, 12, 20);
  return c.toDataURL('image/jpeg', 0.8);
}
