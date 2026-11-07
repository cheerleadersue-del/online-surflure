import {
  LINES, WORLD_START, WORLD_END, BOAT_DOCK, METHODS, DEFAULT_AVATAR,
  SPECIES_SUGGEST, timeSlot, estWaterTemp, zoneAt, setZonesFor,
  POINTS, POINT_TYPE_NAME, findPoint, GEAR, gearOf, DEFAULT_GEAR,
} from './data.js';
import * as DATA from './data.js';
const { RANK_TARGET, isRankFish } = DATA;
import { Records } from './records.js';
import { smooth, hashStr } from './scene.js';
import { World } from './scene3d.js';
import { AvatarPreview } from './avatar3d.js';
import { loadAssets } from './assets.js';
import { Net } from './net.js';
import { Friends } from './friends.js';
import { SoundScape } from './audio.js';
import { Fishing } from './fishing.js';
import { Store, sampleReports } from './store.js';
import { readExif, resizeImage } from './exif.js';

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  });
  kids.flat().forEach((c) => c != null && n.append(c));
  return n;
};
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* 무시 */ } };
const METHOD_NAME = { ...Object.fromEntries(Object.values(METHODS).map((m) => [m.id, m.name])), etc: '기타' };

// ── 상태 ──
const audio = new SoundScape();
const scene = new World($('#world'));
scene.audioHook = (d) => audio.boil(d);
scene.audioSplash = () => audio.plop(0.15);
scene.audioCrash = (d, power) => audio.crash && audio.crash(d, power);
let preview = null;
const store = new Store();
const profile = load('surflure.profile', {});
const params = new URLSearchParams(location.search);
const st = {
  line: LINES[params.get('line')] ? params.get('line') : profile.line || null,
  point: findPoint(params.get('point') || profile.point || ''),
  gear: { ...DEFAULT_GEAR, ...(profile.gear || {}) },
  look: { ...DEFAULT_AVATAR, name: (profile.look && profile.look.name) || '' },
  avatar: { x: 3500, dir: 1, walking: false, phase: 0 },
  camX: 3500,
  flags: [],
  npcs: [],
  onBoat: false,
  hoverFlag: null,
  hideAvatar: true,
  playing: false,
};
// 라인마다 포인트가 한 곳: 예전 포인트로 저장돼 있어도 그 라인의 포인트로
if (st.line) st.point = POINTS[st.line][0];
// 예전에 저장된 장비(없어진 것)는 기본값으로
for (const k of Object.keys(GEAR)) if (!GEAR[k].some((g) => g.id === st.gear[k])) st.gear[k] = DEFAULT_GEAR[k];
let creel = load('surflure.creel', []);
let timeMode = 'real';
let walkDir = 0;
const keys = new Set();
let zone = null;
let knownIds = null;

const fishing = new Fishing(audio, {
  onUI: renderFishUI,
  onCatch: (f) => showCatch(f),
  onHit: (f) => onHit(f),
  onFight: (info) => onFight(info),
  onFightEnd: (ok) => onFightEnd(ok),
  onJerk: () => audio.jerk && audio.jerk(),
});
st.fishing = fishing;
const records = new Records();

st.npcs = [
  { x: 5800, seed: 3, name: '몽돌꾼', look: { ...DEFAULT_AVATAR, jacket: '#2aa198', hat: 'none', pants: 'shorts', pantsColor: '#3a4a63', vest: false } },
  { x: 3820, seed: 1, name: '현지꾼', look: { ...DEFAULT_AVATAR, jacket: '#1f3b73', hat: 'bucket', hatColor: '#5f6b3a', vest: false } },
  { x: 8300, seed: 4, name: '갯바위꾼', look: { ...DEFAULT_AVATAR, jacket: '#c8262d', hat: 'cap', hatColor: '#222428', pants: 'wader' } },
  { x: 9800, seed: 7, name: '방파제꾼', look: { ...DEFAULT_AVATAR, jacket: '#f2c230', hat: 'beanie', hatColor: '#c8262d', pants: 'jogger', vest: true } },
];

// ── 입장 화면: 아이디 → 장비 → 라인·포인트 ──
// 복장 → 아바타 모습
function applyOutfit() {
  const o = st.gear.outfit;
  st.look.pants = o === 'wader' ? 'wader' : o === 'boots' ? 'jogger' : 'shorts';
  st.look.shoes = o === 'basic' ? 'slipper' : o === 'boots' ? 'knee' : 'wader';
  // 색은 아바타 디자인(베이지 캡·청록 포인트)에 고정
  st.look.pantsColor = o === 'wader' ? '#2f5d55' : '#cdb07a';
  st.look.jacket = o === 'basic' ? '#f8f8f5' : '#efe6d6';
  st.look.vest = o === 'boots';
  st.look.hat = 'cap';
  st.look.hatColor = '#e8dcc5';
  st.look.rod = st.gear.rod;
  st.look.reel = st.gear.reel;
}
function buildEntry() {
  applyOutfit();
  const gearSeg = (kind) => {
    const box = $(`#g-${kind}`);
    GEAR[kind].forEach((g) => box.append(el('button', {
      type: 'button', class: st.gear[kind] === g.id ? 'on' : '',
      onclick: (e) => {
        st.gear[kind] = g.id; applyOutfit(); audio.ui();
        if (kind === 'outfit') updateCharUI();
        [...box.children].forEach((c) => c.classList.toggle('on', c === e.currentTarget));
      },
    }, el('b', { text: g.name }), el('small', { text: g.tag }))));
  };
  ['rod', 'reel', 'bait', 'outfit'].forEach(gearSeg);
  updateCharUI();
  document.querySelectorAll('.line-card').forEach((b) => {
    b.classList.toggle('on', b.dataset.line === st.line);
    b.addEventListener('click', () => {
      st.line = b.dataset.line;
      st.point = POINTS[st.line][0]; // 라인마다 포인트 한 곳
      document.querySelectorAll('.line-card').forEach((x) => x.classList.toggle('on', x === b));
      audio.ui();
      renderPoints();
      validateEntry();
    });
  });
  const nameIn = $('#av-name');
  nameIn.value = st.look.name || '';
  nameIn.addEventListener('input', () => { st.look.name = nameIn.value.trim(); $('#id-msg').textContent = ''; $('#id-msg').className = 'id-msg'; validateEntry(); });
  $('#enter-btn').addEventListener('click', tryEnter);
  renderPoints();
  validateEntry();
}
function renderPoints() {
  const box = $('#point-list');
  box.textContent = '';
  if (!st.line) return;
  const list = POINTS[st.line];
  ['beach', 'breakwater', 'port', 'dike', 'bridge', 'river'].forEach((type) => {
    const items = list.filter((p) => p.type === type);
    if (!items.length) return;
    box.append(el('h3', { text: POINT_TYPE_NAME[type] }));
    const grid = el('div', { class: 'point-grid' });
    items.forEach((p) => grid.append(el('button', {
      type: 'button', class: st.point === p ? 'on' : '',
      onclick: (e) => {
        st.point = p; audio.ui();
        box.querySelectorAll('.point-grid button').forEach((c) => c.classList.toggle('on', c === e.currentTarget));
        validateEntry();
      },
    }, el('b', { text: p.name }), el('small', { text: p.desc }))));
    box.append(grid);
  });
}
function validateEntry() {
  const name = (st.look.name || '').trim();
  const ok = name.length >= 2 && !!st.line && !!st.point;
  const b = $('#enter-btn');
  b.disabled = !ok;
  b.textContent = name.length < 2 ? '아이디를 입력하세요 (2자 이상)' : !st.line ? '낚시터를 선택하세요' : !st.point ? '낚시터를 선택하세요' : `${st.point.name} 입장하기`;
}
async function tryEnter() {
  const b = $('#enter-btn');
  const msg = $('#id-msg');
  b.disabled = true;
  b.textContent = '아이디 확인 중…';
  const r = await records.claim(st.look.name);
  if (!r.ok) {
    msg.textContent = r.reason;
    msg.className = 'id-msg bad';
    $('#av-name').focus();
    validateEntry();
    return;
  }
  msg.textContent = r.local ? '✓ 사용할 수 있어요 (서버 미연결: 이 기기에서만 확인)' : '✓ 사용할 수 있는 아이디예요';
  msg.className = 'id-msg ok';
  friends.start(st.look.name);
  enterSea();
}

// 캐릭터(복장) 고르기: 좌우로 넘기는 카드
const CHARS = {
  basic: { ko: '캐주얼', en: 'CASUAL', c: ['#ffb04a', '#ff8a1f'], desc: '흰 티셔츠 · 베이지 반바지 · 청록 샌들. 가볍게 물가를 거닐어요.' },
  boots: { ko: '탐험가', en: 'EXPLORER', c: ['#7ec8ff', '#3b8ff0'], desc: '청록 탐험 조끼 · 카고 반바지 · 장화 · 뒤쪽 뜰채까지 챙긴 탐험가.' },
  wader: { ko: '작업복', en: 'OVERALLS', c: ['#c7a6ff', '#8b6cf0'], desc: '청록 멜빵 작업복 · 무릎 패드 · 장화. 깊은 물도 문제없어요.' },
};
const OUTFITS = GEAR.outfit.map((o) => o.id);
const lookFor = (outfit) => {
  const pants = outfit === 'wader' ? 'wader' : outfit === 'boots' ? 'jogger' : 'shorts';
  return { ...st.look, name: '', pants, shoes: outfit === 'basic' ? 'slipper' : outfit === 'boots' ? 'knee' : 'wader', vest: outfit === 'boots' };
};
function stepChar(d) {
  const i = (OUTFITS.indexOf(st.gear.outfit) + d + OUTFITS.length) % OUTFITS.length;
  const b = $('#g-outfit').children[i];
  if (b) b.click();
}
function updateCharUI() {
  const o = st.gear.outfit;
  const i = OUTFITS.indexOf(o), n = OUTFITS.length;
  const E = $('#entry');
  E.dataset.char = o;
  const L = CHARS[OUTFITS[(i - 1 + n) % n]], R = CHARS[OUTFITS[(i + 1) % n]], C = CHARS[o];
  E.style.setProperty('--c-center', C.c[0]);
  E.style.setProperty('--c-center-2', C.c[1]);
  E.style.setProperty('--c-left', L.c[0]);
  E.style.setProperty('--c-right', R.c[0]);
  $('#char-name').textContent = C.ko;
  $('#char-en').textContent = C.en;
  $('#char-desc').textContent = C.desc;
  $('#char-count').textContent = `${i + 1} / ${n}`;
  const dots = $('#char-dots');
  if (dots.children.length !== n) { dots.textContent = ''; OUTFITS.forEach(() => dots.append(el('i'))); }
  [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = '#2f4fd8';
}
$('#char-prev').addEventListener('click', () => stepChar(-1));
$('#char-next').addEventListener('click', () => stepChar(1));
{
  // 손가락으로 좌우 밀기
  let sx = null;
  const hero = $('#hero');
  hero.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) sx = e.clientX; });
  hero.addEventListener('pointerup', (e) => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) stepChar(dx < 0 ? 1 : -1); });
  hero.addEventListener('pointercancel', () => { sx = null; });
}
function drawPreview(t) {
  const c = $('#avatar-preview');
  if (!preview) preview = new AvatarPreview(c);
  const i = OUTFITS.indexOf(st.gear.outfit);
  const side = (d) => lookFor(OUTFITS[(i + d + OUTFITS.length) % OUTFITS.length]);
  preview.render(t, st.look, [side(-1), side(1)]);
}

function enterSea() {
  audio.start();
  audio.setMuted(false);
  save('surflure.profile', { line: st.line, point: st.point.id, gear: st.gear, look: { name: st.look.name } });
  setZonesFor(st.point);
  fishing.gear = { rod: gearOf('rod', st.gear.rod), reel: gearOf('reel', st.gear.reel), bait: gearOf('bait', st.gear.bait), outfit: gearOf('outfit', st.gear.outfit) };
  scene.setPoint(st.point, st.line);
  scene.setGearLook(st.gear);
  scene.wade = fishing.gear.outfit.wade;
  // 쏘가리·배스(민물)는 서프루어만
  const river = DATA.isRiver(st.point);
  document.querySelectorAll('#method-tabs button').forEach((b) => {
    b.hidden = river && b.dataset.m !== 'lure';
    if (river) b.classList.toggle('on', b.dataset.m === 'lure');
  });
  if (river && fishing.mode !== 'lure') fishing.setMode('lure');
  updatePanel();
  fade(() => {
    $('#entry').hidden = true;
    $('#hud').hidden = false;
    st.hideAvatar = false;
    st.playing = true;
    st.onBoat = false;
    st.avatar.yaw = Math.PI;
    st.avatar.wade = fishing.gear.outfit.wade;
    const sp = scene.spawn();
    teleport(sp.x, sp.z);
    scene.viewPreset('normal');
    scene.orbit.yaw = scene.orbit.tYaw = sp.yaw;
    // 입장 연출: 멀리서 포인트 전경 → 3.5초 뒤 내 낚시꾼 곁으로
    scene.orbit.dist = scene.orbit.tDist = 60;
    scene.orbit.pitch = scene.orbit.tPitch = 0.2;
    setTimeout(() => { if (st.playing && scene.orbit.tDist === 60) { scene.orbit.tDist = 9; scene.orbit.tPitch = 0.3; } }, 3500);
    zone = zoneAt(st.avatar.x);
    $('#hud-zone').textContent = zone.name;
    updatePanel();
    $('#walk-hint').hidden = false;
    setTimeout(() => { $('#walk-hint').hidden = true; }, 9000);
    fishing.reset();
    $('#hud-line').textContent = LINES[st.line].name.includes(POINT_TYPE_NAME[st.point.type]) ? LINES[st.line].name : `${LINES[st.line].name} · ${POINT_TYPE_NAME[st.point.type]}`;
    $('#rank-point').textContent = st.point.name + (RANK_TARGET[st.line] ? ` ${RANK_TARGET[st.line]}` : '');
    showBanner(st.point.name, st.point.desc);
    st.flags = [];
    rankSig = '';
    st.myBest = null;
    buildMinimap();
    refreshRank();
    history.replaceState(null, '', `?line=${st.line}&point=${st.point.id}`);
    net.connect(st.point.id, { name: st.look.name, look: st.look });
    friends.setLocation(st.line, st.point.id, `${LINES[st.line].name} · ${st.point.name}`);
    chatLog(`${st.point.name}에 도착했어요. 💬 채팅으로 인사해 보세요!`, 'sys');
    if (!DATA.isRiver(st.point)) setTimeout(() => toast('🕊️ 하늘 뷰로 보일링(물고기 떼)을 찾아보세요! 표시를 누르면 그 앞으로 이동해요'), 4200);
  });
}

function goHome() {
  net.leave();
  friends.setLocation(null, null, '');
  fade(() => {
    st.playing = false;
    st.hideAvatar = true;
    st.onBoat = false;
    fishing.reset();
    $('#hud').hidden = true;
    $('#entry').hidden = false;
    st.avatar.x = 3500;
    validateEntry();
  });
}

// 미니맵·배 타기 등 순간 이동
function teleport(xpx, zPref) {
  scene.placeAt(st.avatar, xpx, zPref);
  st.camX = st.avatar.x;
  scene.snapCam = true;
}

function fade(fn, ms = 600) {
  let f = $('.fade');
  if (!f) { f = el('div', { class: 'fade' }); document.body.append(f); }
  f.classList.add('on');
  setTimeout(() => { fn(); setTimeout(() => f.classList.remove('on'), 60); }, ms);
}

// ── 깃발 ──
function allItems() {
  const real = store.items;
  const samples = sampleReports().filter((s) => real.filter((r) => r.line === s.line).length < 4);
  return [...real, ...samples];
}

// 해변의 인증 사진·깃발은 표시하지 않는다 (인증글은 게시판에서)

// ── 미니맵 ──
function buildMinimap() {
  const mm = $('#minimap');
  mm.textContent = '';
  const span = WORLD_END - WORLD_START;
  DATA.ZONES.forEach((z) => mm.append(el('div', {
    class: `seg-z z-${z.id}`, style: `width:${((z.to - z.from) / span) * 100}%`, text: z.name,
  })));
  mm.append(el('i', { class: 'me', id: 'mm-me' }));
}
$('#minimap').addEventListener('click', (e) => {
  if (fishing.busy && fishing.state !== 'result') return toast('낚시 중이에요. 먼저 채비를 회수하세요.');
  const r = e.currentTarget.getBoundingClientRect();
  const x = WORLD_START + ((e.clientX - r.left) / r.width) * (WORLD_END - WORLD_START);
  fade(() => {
    st.onBoat = false;
    fishing.reset();
    scene.clearCatch();
    teleport(Math.max(WORLD_START + 60, Math.min(WORLD_END - 60, x)));
  }, 350);
});

// ── 입력 ──
// 키보드: 방향키/WASD = 카메라 기준 이동, Shift = 달리기, Space = 캐스팅
addEventListener('keydown', (e) => {
  if (!st.playing || e.target.closest('input, textarea, select, dialog')) return;
  const k = e.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', 'shift'].includes(k)) { keys.add(k); if (k !== 'shift') e.preventDefault(); }
  if (e.code === 'Space' && !e.repeat && !$('#fish-panel').hidden) { e.preventDefault(); mainPress(); }
});
addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.code === 'Space' && st.playing) mainRelease();
});
addEventListener('blur', () => keys.clear());

// 화면: 탭 = 그곳으로 걷기 / 드래그 = 시점 회전 / 두 손가락·휠 = 확대·축소
const cv = $('#world');
const pointers = new Map();
let dragMoved = 0, pinchDist = 0;
cv.addEventListener('pointerdown', (e) => {
  if (!st.playing) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
  dragMoved = 0;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
cv.addEventListener('pointermove', (e) => {
  if (!st.playing) return;
  const p = pointers.get(e.pointerId);
  if (!p) {
    const id = scene.hitFlag(e.clientX, e.clientY);
    st.hoverFlag = id;
    cv.style.cursor = id ? 'pointer' : 'grab';
    return;
  }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) {
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (dragMoved > 8) { scene.orbitBy(dx, dy); cv.style.cursor = 'grabbing'; }
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist) scene.zoomBy(pinchDist / d);
    pinchDist = d;
    dragMoved = 99;
  }
});
const endPointer = (e) => {
  if (!pointers.has(e.pointerId)) return;
  const wasTap = pointers.size === 1 && dragMoved <= 8;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (!wasTap || e.type === 'pointercancel') return;
  const id = scene.hitFlag(e.clientX, e.clientY);
  if (id) { audio.ui(); openDetail(id); return; }
  const boil = scene.hitBoil(e.clientX, e.clientY);
  if (boil) {
    if (fishing.busy && fishing.state !== 'result') return toast('채비를 회수한 뒤 이동하세요.');
    audio.ui();
    fade(() => { fishing.reset(); scene.clearCatch(); scene.goToBoil(st.avatar, boil); }, 350);
    setTimeout(() => {
      const dist = Math.max(10, Math.round(Math.abs(boil.Z - st.avatar.Z)));
      const need = Math.round(Math.min(100, Math.max(10, ((dist / 88) / fishing.gear.rod.cast - 0.3) / 0.68 * 100)));
      toast(`🐟 보일링까지 약 ${dist}m — 캐스팅 힘 ${need}% 정도로 던져보세요!`);
    }, 500);
    return;
  }
  if (st.onBoat) return toast('배 위에서는 움직일 수 없어요. ⚓ 하선하기를 눌러주세요.');
  if (fishing.busy && fishing.state !== 'result') return toast('낚시 중이에요. 회수하거나 랜딩 후 이동하세요.');
  const g = scene.pickGround(e.clientX, e.clientY);
  if (g) {
    if (fishing.state === 'result') { fishing.reset(); scene.clearCatch(); }
    st.avatar.target = g;
  }
};
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('wheel', (e) => {
  if (!st.playing) return;
  e.preventDefault();
  scene.zoomBy(Math.exp(e.deltaY * 0.0012));
}, { passive: false });
// 밤 헤드랜턴 켜기/끄기
$('#lamp-btn').addEventListener('click', () => {
  st.lampOn = st.lampOn === false;
  audio.ui();
  updateLampBtn();
  toast(st.lampOn ? '🔦 헤드랜턴을 켰어요' : '헤드랜턴을 껐어요');
});
function updateLampBtn() {
  const b = $('#lamp-btn');
  b.hidden = !scene.night;
  b.classList.toggle('on', st.lampOn !== false);
  b.textContent = st.lampOn !== false ? '🔦 랜턴 끄기' : '🔦 랜턴 켜기';
}
let wasNight = null;
document.querySelectorAll('#view-pad button[data-v]').forEach((b) => b.addEventListener('click', () => {
  audio.ui();
  const v = b.dataset.v;
  if (v === 'in') scene.zoomBy(0.7);
  else if (v === 'out') scene.zoomBy(1.45);
  else scene.viewPreset(v);
}));

// ── 낚시 패널 ──
const mainBtn = $('#fish-main');
function mainPress() {
  if (mainBtn.disabled) return;
  audio.start();
  if (fishing.state === 'idle' || fishing.state === 'result') { scene.clearCatch(); st.avatar.target = null; scene.focusSea(); }
  fishing.press();
}
function mainRelease() { fishing.release(); }
mainBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); try { mainBtn.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ } mainPress(); });
mainBtn.addEventListener('pointerup', mainRelease);
mainBtn.addEventListener('pointercancel', mainRelease);
mainBtn.addEventListener('contextmenu', (e) => e.preventDefault());
$('#fish-sub').addEventListener('click', () => fishing.secondary());
document.querySelectorAll('#method-tabs button').forEach((b) => b.addEventListener('click', () => {
  if (fishing.busy && fishing.state !== 'result') return toast('채비를 회수한 뒤 바꿀 수 있어요.');
  document.querySelectorAll('#method-tabs button').forEach((x) => x.classList.toggle('on', x === b));
  fishing.setMode(b.dataset.m);
  audio.ui();
  updatePanel();
}));
$('#boat-btn').addEventListener('click', () => {
  if (fishing.busy && fishing.state !== 'result') return toast('채비를 회수한 뒤 이동하세요.');
  const boarding = !st.onBoat;
  fade(() => {
    st.onBoat = boarding;
    fishing.reset();
    scene.clearCatch();
    teleport(BOAT_DOCK, -1.5);
    scene.viewPreset('sea');
    showBanner(boarding ? '배 위' : '방파제', boarding ? '선상 찌낚시 포인트로 나왔어요. 찌가 잠기면 챔질!' : '선착장으로 돌아왔어요.');
    $('#hud-zone').textContent = boarding ? '배 위 (선상)' : '방파제';
    updatePanel();
  });
});

function updatePanel() {
  const canFish = st.onBoat || (zone && zone.fish);
  $('#fish-panel').hidden = !canFish;
  const isFloat = fishing.mode === 'float';
  $('#boat-btn').hidden = !(isFloat || st.onBoat);
  $('#boat-btn').textContent = st.onBoat ? '⚓ 하선하기' : '🚤 배 타기';
  fishing.emit();
}

function renderFishUI(ui) {
  const needBoat = fishing.mode === 'float' && !st.onBoat;
  mainBtn.textContent = needBoat ? '배 위에서 할 수 있어요' : ui.main;
  mainBtn.disabled = needBoat || !ui.enabled;
  mainBtn.classList.toggle('pulse', ui.state === 'bite');
  $('#fish-sub').hidden = !ui.secondary;
  const msg = needBoat ? '찌낚시는 배를 타고 합니다. 🚤 배 타기를 눌러 선상으로 나가세요.' : ui.msg || METHODS[fishing.mode].desc;
  $('#fish-msg').textContent = msg;
  const pw = $('#g-power');
  pw.hidden = ui.fight;
  pw.querySelector('i').style.width = `${(ui.power || 0) * 100}%`;
  const tn = $('#g-tension');
  tn.hidden = !ui.fight;
  const tw = Math.min(1, ui.tension || 0);
  tn.querySelector('i').style.width = `${tw * 100}%`;
  tn.querySelector('i').style.setProperty('--full', `${tw > 0 ? 100 / tw : 100}%`);
}

// ── 잡은 물고기 ──
let pendingCatch = null;
function goldenCelebrate(f) {
  let fl = $('.gold-flash');
  if (!fl) { fl = el('div', { class: 'gold-flash' }); document.body.append(fl); }
  fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
  toast(`✨ 전설의 황금쏘가리 ${f.size}cm! (1% 확률)`);
  setTimeout(() => shout('황쏘다!', { cut: true, pitch: 1.45, rate: 1.05 }), 900);
  net.sendEvent('chat', { text: `✨ 황금쏘가리 ${f.size}cm 잡았어요!` });
  vibrate([120, 60, 120, 60, 300]);
}
function showCatch(f) {
  if (f.name === '황금쏘가리') goldenCelebrate(f);
  setTimeout(() => shout(pick(['나이스!', '와~!', '우와 대박!', '오예~!', '됐다!', '와 크다!', '나이스 손맛!', '역시~!']), { cut: true, pitch: 1.35, rate: 1.1 }), 150);
  pendingCatch = f;
  net.sendEvent('land', { fish: f.name, size: f.size });
  submitRecord(f);
  const av = st.avatar;
  const img = DATA.fishImage(f.name);
  audio.land && audio.land();
  if (img) scene.showTrophy(f, img); // 직접 그린 물고기: 1인칭으로 크게
  else scene.showTrophy3D(f); // 그림이 없는 어종도 같은 방식
  setTimeout(() => openCatchDialog(f), 3200);
}
function openCatchDialog(f) {
  const counted = isRankFish(st.line, f.name);
  const img = DATA.fishImage(f.name);
  $('#c-img').hidden = !img;
  if (img) $('#c-img').src = img;
  $('#c-title').textContent = `${f.name} ${f.size}cm!`;
  $('#c-sub').textContent = `${METHOD_NAME[f.method]} · ${st.point ? st.point.name : ''} · ${timeSlot(nowDate())}\n${counted ? '랭킹에 기록됐어요. ' : ''}물고기를 놓아줄까요?`;
  $('#dlg-catch').showModal();
}
// 방생: 쪼그려 앉아 두 손으로 물고기를 물로 돌려보낸다
function releaseCatch() {
  if (!pendingCatch) return;
  pendingCatch = null;
  scene.playerAction('release', 1.8);
  scene.releaseCatch();
  setTimeout(() => shout(pick(['잘 가~!', '다음에 또 만나!', '건강하게 커라~', '고마워, 잘 가!']), { cut: true, pitch: 1.25, rate: 1.0 }), 500);
  setTimeout(() => { if (fishing.state === 'result') fishing.reset(); }, 1900);
}
$('#c-release').addEventListener('click', () => { $('#dlg-catch').close(); });
$('#dlg-catch').addEventListener('close', releaseCatch);

// ── 상세 보기 ──
let detailId = null;
function findItem(id) { return allItems().find((x) => x.id === id); }
function fmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function openDetail(id) {
  const r = findItem(id);
  if (!r) return;
  detailId = id;
  $('#d-photo').src = r.photo || '';
  $('#d-photo').alt = `${r.species} 인증 사진`;
  const tags = $('#d-tags');
  tags.textContent = '';
  tags.append(el('span', { class: 'tag', text: LINES[r.line]?.name || '' }), el('span', { class: `tag m-${r.method}`, text: METHOD_NAME[r.method] || '' }));
  if (r.sample) tags.append(el('span', { class: 'tag sample', text: '예시 글' }));
  $('#d-title').textContent = `${r.species}${r.size ? ` ${r.size}cm` : ''}${r.count > 1 ? ` × ${r.count}마리` : ''}`;
  $('#d-by').textContent = `🎣 ${r.author || '익명'} · 등록 ${fmtDate(r.createdAt)}`;
  const meta = $('#d-meta');
  meta.textContent = '';
  const rows = [
    ['📍 위치', r.spot + (r.lat != null && r.lng != null ? ` (${(+r.lat).toFixed(4)}, ${(+r.lng).toFixed(4)})` : '')],
    ['🕒 잡은 시각', `${fmtDate(r.caughtAt)}${r.slot ? ` · ${r.slot}` : ''}`],
    ['🐟 어종', `${r.species}${r.size ? ` / ${r.size}cm` : ''}`],
    ['🪝 미끼·루어', r.bait],
    ['🎣 장비', [r.rod, r.reel, r.lineSpec].filter(Boolean).join(' · ')],
    ['🌡️ 수온', r.waterTemp != null && r.waterTemp !== '' ? `${r.waterTemp}°C` : ''],
    ['🌊 물때', r.tide],
    ['⛅ 날씨', r.weather],
  ];
  rows.filter(([, v]) => v).forEach(([k, v]) => meta.append(el('dt', { text: k }), el('dd', { text: v })));
  $('#d-story').textContent = r.story || '';
  $('#d-like b').textContent = r.likes || 0;
  $('#d-map').href = r.lat != null && r.lng != null
    ? `https://map.kakao.com/link/map/${encodeURIComponent(r.spot)},${r.lat},${r.lng}`
    : `https://map.kakao.com/?q=${encodeURIComponent(r.spot)}`;
  renderComments(r);
  if (!$('#dlg-detail').open) $('#dlg-detail').showModal();
}
function renderComments(r) {
  const ul = $('#d-comments');
  ul.textContent = '';
  const cs = r.comments || [];
  $('#d-ccount').textContent = cs.length;
  if (!cs.length) ul.append(el('li', { text: '첫 댓글을 남겨보세요.' }));
  cs.forEach((c) => ul.append(el('li', {},
    el('b', { text: c.author }), el('time', { text: fmtDate(c.at) }), el('p', { text: c.text }),
  )));
  ul.scrollTop = ul.scrollHeight;
}
$('#d-cform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = findItem(detailId);
  const text = $('#d-ctext').value.trim();
  if (!text || !r) return;
  if (r.sample) {
    r.comments = [...r.comments, { id: String(Date.now()), author: st.look.name || '익명', text, at: new Date().toISOString() }];
    $('#d-ctext').value = '';
    renderComments(r);
    return toast('예시 글의 댓글은 저장되지 않아요.');
  }
  try {
    const it = await store.comment(detailId, st.look.name || '익명', text);
    $('#d-ctext').value = '';
    renderComments(it);
  } catch (err) { toast(err.message); }
});
$('#d-like').addEventListener('click', async () => {
  const r = findItem(detailId);
  if (!r) return;
  const likedKey = 'surflure.liked';
  const liked = load(likedKey, []);
  if (liked.includes(r.id)) return toast('이미 좋아요를 눌렀어요.');
  if (r.sample) { r.likes = (r.likes || 0) + 1; }
  else await store.like(r.id);
  save(likedKey, [...liked, r.id]);
  $('#d-like b').textContent = findItem(r.id)?.likes || 0;
});

// ── 인증글 쓰기 ──
let photoData = null;
const W = (id) => $(`#w-${id}`);
SPECIES_SUGGEST.forEach((s) => $('#species-list').append(el('option', { value: s })));
function fillSpots(line) {
  const dl = $('#spot-list');
  dl.textContent = '';
  LINES[line].spots.forEach((s) => dl.append(el('option', { value: s })));
}
let writeMeta = { caughtAt: null, method: 'lure' };
function openWrite(pre = {}) {
  $('#write-form').reset();
  photoData = null;
  W('photo-prev').hidden = true;
  W('photo-txt').hidden = false;
  W('err').textContent = '';
  fillSpots(st.line || 'east');
  writeMeta = { caughtAt: new Date(), method: pre.method || fishing.mode };
  W('slot').value = timeSlot(new Date());
  if (pre.species) W('species').value = pre.species;
  livePreview();
  $('#dlg-write').showModal();
}
W('photo').addEventListener('change', async () => {
  const file = W('photo').files[0];
  if (!file) return;
  W('err').textContent = '';
  try {
    const [exif, data] = await Promise.all([readExif(file), resizeImage(file, 1280, 0.8)]);
    photoData = data;
    W('photo-prev').src = data;
    W('photo-prev').hidden = false;
    W('photo-txt').hidden = true;
    if (exif.date) {
      writeMeta.caughtAt = exif.date;
      W('slot').value = timeSlot(exif.date);
      toast('사진 촬영 시각으로 시간대를 채웠어요.');
    }
    livePreview();
  } catch (err) {
    W('err').textContent = err.message;
  }
});
$('#write-form').addEventListener('input', livePreview);

// 사진 · 장소 · 시간대 · 어종만 받는다 (위치 좌표 등은 저장하지 않음)
function formData() {
  const v = (id) => W(id).value.trim();
  const d = writeMeta.caughtAt || new Date();
  return {
    line: st.line || 'east', method: writeMeta.method || 'lure', spot: v('spot'), slot: v('slot'),
    caughtAt: d.toISOString(), species: v('species'), count: 1,
    author: st.look.name || '익명 낚시꾼',
  };
}
function card(r, onclick) {
  const ph = el('div', { class: 'ph' });
  if (r.photo) ph.append(el('img', { src: r.photo, alt: '', loading: 'lazy' }));
  else ph.textContent = '📷 사진';
  return el(onclick ? 'button' : 'div', { class: 'card', type: 'button', ...(onclick ? { onclick } : {}) },
    ph,
    el('div', { class: 'cb' },
      el('span', { class: `tag m-${r.method}`, text: METHOD_NAME[r.method] || '' }),
      r.sample ? el('span', { class: 'tag sample', text: '예시', style: 'margin-left:4px' }) : null,
      el('h4', { text: `${r.species || '어종'}${r.size ? ` ${r.size}cm` : ''}` }),
      el('p', { text: `📍 ${r.spot || '장소'} · ${LINES[r.line]?.name || ''}` }),
      el('p', { text: `🕒 ${r.caughtAt ? fmtDate(r.caughtAt) : ''} ${r.slot ? `(${r.slot})` : ''}` }),
      r.bait ? el('p', { text: `🪝 ${r.bait}` }) : null,
      el('div', { class: 'mini' },
        el('span', { text: `🎣 ${r.author || ''}` }),
        el('span', { text: `💬 ${(r.comments || []).length}` }),
        el('span', { text: `👍 ${r.likes || 0}` })),
    ));
}
function livePreview() {
  const box = $('#w-preview');
  const c = card({ ...formData(), photo: photoData, comments: [], likes: 0 });
  box.replaceWith(c);
  c.id = 'w-preview';
}
$('#write-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = formData();
  if (!photoData) { W('err').textContent = '인증 사진을 올려주세요.'; return; }
  if (!data.spot || !data.species) { W('err').textContent = '장소와 어종은 꼭 입력해주세요.'; return; }
  const btn = W('submit');
  btn.disabled = true;
  btn.textContent = '등록 중…';
  try {
    const item = await store.add({ ...data, photo: photoData });
    $('#dlg-write').close();
    audio.flag();
    toast('📸 조과 인증이 등록됐어요! 📋 조과 게시판에서 볼 수 있어요.');
  } catch (err) {
    W('err').textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '📸 인증 등록';
  }
});
$('#btn-write').addEventListener('click', () => openWrite());

// ── 게시판 ──
function renderBoard() {
  const line = $('#b-line').value, method = $('#b-method').value, q = $('#b-q').value.trim().toLowerCase();
  const grid = $('#board-grid');
  grid.textContent = '';
  const list = allItems().filter((r) => (!line || r.line === line) && (!method || r.method === method)
    && (!q || [r.species, r.spot, r.bait, r.story, r.author].join(' ').toLowerCase().includes(q)));
  if (!list.length) grid.append(el('p', { class: 'board-empty', text: '조건에 맞는 인증글이 없어요.' }));
  list.forEach((r) => grid.append(card(r, () => openDetail(r.id))));
}
['#b-line', '#b-method', '#b-q'].forEach((s) => $(s).addEventListener('input', renderBoard));
$('#btn-board').addEventListener('click', () => { $('#b-line').value = st.line || ''; renderBoard(); $('#dlg-board').showModal(); });

// ── 기타 버튼 ──
$('#btn-sound').addEventListener('click', (e) => {
  audio.start();
  const muted = !audio.muted;
  audio.setMuted(muted);
  e.currentTarget.textContent = muted ? '🔇' : '🔊';
  e.currentTarget.setAttribute('aria-pressed', String(!muted));
});
$('#btn-home').addEventListener('click', goHome);
$('#time-mode').addEventListener('change', (e) => { timeMode = e.target.value; });

let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2800);
}
let bannerT = 0;
function showBanner(title, sub) {
  const b = $('#zone-banner');
  b.querySelector('strong').textContent = title;
  b.querySelector('span').textContent = sub;
  b.classList.add('show');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => b.classList.remove('show'), 3200);
}

function nowDate() {
  if (timeMode === 'real') return new Date();
  const d = new Date();
  const h = +timeMode;
  d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
  return d;
}

// ── 메인 루프 ──
let last = performance.now();
let lastStepSign = 0;
let hudT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  const date = nowDate();
  scene.hourOverride = date.getHours() + date.getMinutes() / 60;
  const av = st.avatar;

  if (st.playing) {
    // 카메라 기준 키보드 방향
    let kx = 0, kz = 0;
    if (keys.has('arrowleft') || keys.has('a')) kx -= 1;
    if (keys.has('arrowright') || keys.has('d')) kx += 1;
    if (keys.has('arrowup') || keys.has('w')) kz -= 1;
    if (keys.has('arrowdown') || keys.has('s')) kz += 1;
    const anyDialog = document.querySelector('dialog[open]');
    let input = null;
    if ((kx || kz) && !anyDialog && !st.onBoat) {
      if (fishing.busy && fishing.state !== 'result') {
        if (!$('#toast').classList.contains('show')) toast('낚시 중이에요. 회수하거나 랜딩 후 이동하세요.');
      } else {
        if (fishing.state === 'result') { fishing.reset(); scene.clearCatch(); }
        const yaw = scene.orbit.yaw;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // 화면 안쪽
        const rx = -fz, rz = fx; // 오른쪽
        const vx = fx * -kz + rx * kx, vz = fz * -kz + rz * kx;
        const l = Math.hypot(vx, vz) || 1;
        input = { dx: vx / l, dz: vz / l };
      }
    }
    if (anyDialog || st.onBoat) av.target = null;
    av.run = keys.has('shift');
    if (!st.onBoat) {
      const stepKind = scene.stepAvatar(av, dt, input);
      if (stepKind) audio.step(stepKind === 'ground' ? zoneAt(av.x).ground : stepKind);
    } else av.walking = false;
    const z = zoneAt(av.x);
    if (z !== zone) {
      zone = z;
      showBanner(z.name, z.tip);
      $('#hud-zone').textContent = z.name;
      if (z.fish) $('#walk-hint').textContent = '오른쪽 아래 패널로 낚시를 해보세요';
      updatePanel();
    }
    // 카메라는 부드럽게 따라감
    st.camX += (av.x - st.camX) * Math.min(1, dt * 4);
    fishing.update(dt, { line: st.line, date, onBoat: st.onBoat, boil: scene.boilFactor() });
    // 캐스팅부터 랜딩까지 1인칭 (원투 받침대 대기는 3인칭)
    const fs = fishing.state;
    const fpvState = ['charging', 'flying', 'retrieve', 'fight'].includes(fs) || (fishing.mode !== 'far' && ['waiting', 'bite'].includes(fs)) || (fs === 'result' && scene.landing);
    document.body.classList.toggle('fpv', fpvState);
    if (fpvState !== !!scene.fpv) { scene.fpv = fpvState; if (!fpvState) { scene.fightInfo = null; scene.shake = 0; } }
    scene.vmPose = { state: fs, power: fishing.power, k: fishing.k, jerk: fs === 'retrieve' ? fishing.jerk || 0 : 0, pressed: fishing.pressed };

    const x = st.onBoat ? BOAT_DOCK : av.x;
    const river = DATA.isRiver(st.point);
    audio.update({
      forest: river ? 0.35 : st.onBoat ? 0 : 1 - smooth(1700, 2700, x),
      sea: river ? 0 : st.onBoat ? 0.6 : 0.08 + smooth(1500, 3000, x) * 0.92,
      stream: river ? 1 : 0,
      gull: river ? 0 : smooth(2600, 3200, x),
      rock: st.onBoat || river ? 0 : Math.max(smooth(6400, 6600, x) * (1 - smooth(9000, 9200, x)), smooth(5300, 5600, x) * 0.4),
      boat: st.onBoat ? 1 : 0,
    }, dt);

    scene.syncPeers(net.peers);
    if (net.mode !== 'off') {
      const ps = fishing.pose(t);
      const act = scene.playerAct && (performance.now() - scene.playerAct.t0) / 1000 < scene.playerAct.dur ? scene.playerAct : null;
      net.sendState({
        X: +av.X.toFixed(2), Y: +av.Y.toFixed(2), Z: +av.Z.toFixed(2), yaw: +(scene.player ? scene.player.group.rotation.y : 0).toFixed(2),
        w: av.walking ? 1 : 0, rod: ps.rod != null ? +ps.rod.toFixed(2) : null, bend: ps.bend ? +ps.bend.toFixed(2) : 0, noRod: ps.noRod ? 1 : 0,
        f: fishing.state, fd: +(fishing.d || 0).toFixed(2), lp: st.lampOn === false ? 0 : 1, rk: st.myBest || null, act: act ? act.name : null, actT: act ? act.wall : null,
      });
    }
    npcLife(dt);
    if (scene.night !== wasNight) {
      wasNight = scene.night;
      updateLampBtn();
      if (scene.night && st.playing) toast(st.lampOn !== false ? '🌙 밤이에요. 헤드랜턴을 켰어요 🔦' : '🌙 밤이에요. 🔦 버튼으로 헤드랜턴을 켤 수 있어요');
    }
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.5;
      $('#hud-time').textContent = `${timeSlot(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      $('#hud-temp').textContent = `수온(추정) ${estWaterTemp(st.line, date)}°C`;
      const me = $('#mm-me');
      if (me) me.style.left = `${((av.x - WORLD_START) / (WORLD_END - WORLD_START)) * 100}%`;
    }
  } else {
    // 입장 화면 뒤: 해변을 천천히 흘러가는 풍경
    st.camX = 3300 + Math.sin(t * 0.05) * 900;
    av.x = st.camX;
    drawPreview(t);
    audio.update({ forest: 0.2, sea: 0.8, gull: 0.5, rock: 0, boat: 0 }, dt);
  }

  scene.render(st, t, dt);
  requestAnimationFrame(frame);
}

// ── 함께 낚시: 같은 포인트 동시 접속 · 채팅 · 랭킹 ──
function speak(text, { pitch = 1.15, rate = 1.05 } = {}) {
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR'; u.pitch = pitch; u.rate = rate; u.volume = 0.9;
    const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith('ko'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (_) { /* 음성 미지원 */ }
}
function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { /* 미지원 */ } }

const net = new Net({
  onPeer: (p, isNew) => {
    if (isNew && st.myBest) setTimeout(() => net.sendEvent('rec', { rec: st.myBest }), 500); if (isNew) chatLog(`${p.name}님이 들어왔어요 👋`, 'sys'); updatePeople(); },
  onLeave: (p) => { chatLog(`${p.name}님이 나갔어요`, 'sys'); updatePeople(); },
  onEvent: (p, ev) => onPeerEvent(p, ev),
  onStatus: () => updatePeople(),
});
function updatePeople() {
  const n = net.peers.size + 1;
  const e = $('#hud-people');
  e.textContent = `👥 ${n}명`;
  e.title = net.mode === 'online' ? '실시간 접속 중' : net.mode === 'local' ? '이 브라우저의 다른 탭과만 연결됨' : '연결 안 됨';
  e.classList.toggle('cloud', net.mode === 'online');
}
// 채팅 줄: 최근 4줄만, 8초 뒤 흐려진다 (화면을 가리지 않게)
function chatLog(text, cls = '', who = '') {
  const ul = $('#chat-feed');
  const li = el('li', { class: cls });
  if (who) li.append(el('b', { text: who }));
  li.append(document.createTextNode(text));
  ul.append(li);
  while (ul.children.length > 4) ul.firstChild.remove();
  setTimeout(() => li.classList.add('old'), 8000);
  setTimeout(() => li.remove(), 8800);
}
function distTo(pos) {
  const av = st.avatar;
  return pos ? Math.hypot(pos.x - av.X, pos.z - av.Z) : Infinity;
}
function sendChat(text) {
  scene.sayPlayer(text);
  net.sendEvent('chat', { text });
  chatLog(text, 'me', `${st.look.name || '나'}`);
}

function onPeerEvent(p, ev) {
  const pos = scene.peerPos(p.id);
  if (ev.type === 'rec' && ev.rec && st.point && ev.rec.point === st.point.id) {
    if (records.addPeerRecord({ ...ev.rec, name: p.name })) { rankSig = ''; refreshRank(); }
    return;
  }
  if (ev.type === 'chat' && ev.text) {
    scene.sayPeer(p.id, ev.text);
    chatLog(ev.text, '', p.name);
  } else if (ev.type === 'hit') {
    scene.sayPeer(p.id, '히트!! 🎣');
    // 옆 사람 히트: 박수와 나이스~!
    if (distTo(pos) < 40) {
      audio.clap && audio.clap();
      setTimeout(() => { scene.sayPlayer('나이스~!'); speak('나이스~!'); }, 500);
    } else chatLog(`${p.name}님 히트!`, 'sys');
  } else if (ev.type === 'land') {
    scene.sayPeer(p.id, `${ev.fish || '물고기'} ${ev.size || ''}cm! 🎉`);
    chatLog(`${p.name}님 ${ev.fish || '물고기'}${ev.size ? ` ${ev.size}cm` : ''} 랜딩!`, 'sys');
  }
}

// NPC도 가끔 입질 → 옆이면 나이스~!
let npcNext = 40 + Math.random() * 40;
function npcLife(dt) {
  npcNext -= dt;
  if (npcNext > 0 || !scene.npcs || !scene.npcs.length) return;
  npcNext = 60 + Math.random() * 70;
  const i = Math.floor(Math.random() * scene.npcs.length);
  const g = scene.npcs[i].a.group.position;
  scene.sayNpc(i, '히트!! 🎣');
  if (Math.hypot(g.x - st.avatar.X, g.z - st.avatar.Z) < 35) {
    audio.clap && audio.clap();
    setTimeout(() => { scene.sayPlayer('나이스~!'); speak('나이스~!'); }, 500);
  }
}

// 히트 → 1인칭(휘어진 낚싯대 · 릴 감는 손) + 진동 + 드랙
let vibT = 0;
// ── 음성 멘트 ──
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function shout(text, opt = {}) {
  try { if (opt.cut && 'speechSynthesis' in window) speechSynthesis.cancel(); } catch (_) { /* 무시 */ }
  scene.sayPlayer(text);
  speak(text, opt);
}
let fightVoice = { big: false, plead: false };
function onHit() {
  scene.fpv = true;
  fightVoice = { big: false, plead: false, t0: performance.now() };
  shout(pick(['히트!', '왔다!', '나이스!']), { cut: true, pitch: 1.3, rate: 1.2 });
  vibrate([220, 60, 220]);
  let fl = $('.hit-flash');
  if (!fl) { fl = el('div', { class: 'hit-flash' }); document.body.append(fl); }
  fl.classList.add('on');
  setTimeout(() => fl.classList.remove('on'), 500);
  net.sendEvent('hit', {});
  (scene.npcs || []).forEach((n, i) => {
    const g = n.a.group.position;
    if (Math.hypot(g.x - st.avatar.X, g.z - st.avatar.Z) < 30) setTimeout(() => { scene.sayNpc(i, '나이스~!'); speak('나이스~!', { pitch: 0.9 }); }, 600 + i * 300);
  });
}
function onFight({ running, pressed, tension, progress, fish }) {
  // 1.5초쯤 지나 묵직하면 "크다 커!", 마지막 랜딩 직전엔 간절하게
  if (!fightVoice.big && performance.now() - fightVoice.t0 > 1500) {
    fightVoice.big = true;
    shout(fish && fish.size >= 35 ? '크다 커!' : pick(['크다 커!', '묵직하다!']), { pitch: 1.2, rate: 1.15 });
  }
  if (!fightVoice.plead && progress > 0.82) {
    fightVoice.plead = true;
    shout(pick(['빠지면 안 돼!', '털리면 안 돼!', '제발… 빠지면 안 돼…', '조금만, 털리면 안 돼!']), { cut: true, pitch: 1.45, rate: 0.85 });
  }
  scene.shake = running ? 1 : pressed ? 0.45 : 0.12;
  scene.fightInfo = { running, pressed, tension };
  const now = performance.now();
  if ((running || pressed) && now - vibT > 240) { vibT = now; vibrate(running ? 160 : 70); }
}
function onFightEnd() {
  if (!scene.fpv) return;
  scene.fpv = false;
  scene.shake = 0;
  scene.fightInfo = null;
  vibrate(0);
}

// 포인트 랭킹 1~3위
// ── 오늘의 랭킹: 오늘 이 포인트에서 잡은 최대어 1~3위 (나가도 유지) ──
const todayISO = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
let rankSig = '';
async function refreshRank() {
  if (!st.point) return [];
  for (const p of net.peers.values()) if (p.st && p.st.rk && p.st.rk.point === st.point.id) records.addPeerRecord({ ...p.st.rk, name: p.name });
  const top = await records.ranking({ point: st.point.id, since: todayISO(), limit: 3, species: RANK_TARGET[st.line] || null });
  const sig = top.map((r) => `${r.name}|${r.size}|${r.species}`).join(',');
  if (sig === rankSig) return top;
  rankSig = sig;
  const ol = $('#rank-list');
  ol.textContent = '';
  const medal = ['🥇', '🥈', '🥉'];
  const online = new Set([st.look.name, ...[...net.peers.values()].map((p) => p.name)]);
  for (let i = 0; i < 3; i++) {
    const r = top[i];
    ol.append(r
      ? el('li', { class: r.name === st.look.name ? 'me' : '' }, el('span', { class: 'm', text: medal[i] }),
        el('span', { text: `${r.name}${online.has(r.name) ? ' 🟢' : ''} · ${r.species} ${Math.round(r.size * 10) / 10}cm` }))
      : el('li', { class: 'vacant' }, el('span', { class: 'm', text: medal[i] }), el('span', { text: '— 도전자를 기다려요' })));
  }
  return top;
}
records.on((point) => { if (st.playing && st.point && (!point || point === st.point.id)) { rankSig = ''; refreshRank(); } });
setInterval(() => { if (st.playing) refreshRank(); }, 5000);
async function submitRecord(f) {
  if (!st.point) return;
  if (!isRankFish(st.line, f.name)) {
    // 대상 어종이 아니면 잡어: 랭킹에 올리지 않는다
    return;
  }
  const before = await records.ranking({ point: st.point.id, since: todayISO(), limit: 3, species: RANK_TARGET[st.line] || null });
  const ok = await records.submit(st.point.id, st.look.name, f.name, f.size);
  // 같은 포인트 접속자에게 내 오늘 최고 기록을 실시간으로 알린다 (서버 저장이 실패해도 서로 보이게)
  if (!st.myBest || f.size > st.myBest.size) st.myBest = { point: st.point.id, name: st.look.name, species: f.name, size: f.size, created_at: new Date().toISOString() };
  net.sendEvent('rec', { rec: st.myBest });
  if (ok === false) setTimeout(() => toast('⚠️ 기록 서버 저장에 실패했어요. 접속 중인 사람에게만 보여요. 새로고침 후 다시 시도해 주세요.'), 1500);
  rankSig = '';
  const top = await refreshRank();
  const rank = top.findIndex((r) => r.name === st.look.name && r.size === f.size);
  const was = before.findIndex((r) => r.name === st.look.name);
  if (rank >= 0 && (was < 0 || rank < was || before[was].size < f.size)) {
    toast(`🏆 오늘의 랭킹 ${rank + 1}위! ${f.name} ${f.size}cm`);
    net.sendEvent('chat', { text: `🏆 오늘의 랭킹 ${rank + 1}위! ${f.name} ${f.size}cm` });
  }
}

// ── 역대 랭킹 화면 ──
const RANK_PERIODS = { today: '오늘', week: '최근 7일', month: '최근 30일', all: '역대' };
function periodSince(p) {
  if (p === 'today') return todayISO();
  if (p === 'week') return new Date(Date.now() - 7 * 864e5).toISOString();
  if (p === 'month') return new Date(Date.now() - 30 * 864e5).toISOString();
  return null;
}
function fillRankPoints() {
  const line = $('#rk-line').value;
  const sel = $('#rk-point');
  const keep = sel.value;
  sel.textContent = '';
  sel.append(el('option', { value: '', text: '전체 포인트' }));
  (POINTS[line] || []).forEach((p) => sel.append(el('option', { value: p.id, text: p.name })));
  sel.hidden = (POINTS[line] || []).length <= 1;
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}
async function renderRankBoard() {
  const line = $('#rk-line').value, point = $('#rk-point').value, period = $('#rk-period').value;
  const body = $('#rk-body');
  body.textContent = '';
  body.append(el('tr', {}, el('td', { colspan: '5', class: 'rk-empty', text: '불러오는 중…' })));
  const rows = await records.ranking({ point: point || null, points: point ? null : POINTS[line].map((p) => p.id), since: periodSince(period), limit: 20, species: RANK_TARGET[line] || null });
  body.textContent = '';
  if (!rows.length) { body.append(el('tr', {}, el('td', { colspan: '5', class: 'rk-empty', text: '아직 기록이 없어요. 첫 기록의 주인공이 되어보세요!' }))); return; }
  const medal = ['🥇', '🥈', '🥉'];
  rows.forEach((r, i) => {
    const d = new Date(r.created_at);
    body.append(el('tr', { class: r.name === st.look.name ? 'me' : '' },
      el('td', { class: 'rk-n', text: medal[i] || String(i + 1) }),
      el('td', { text: r.name }),
      el('td', { text: `${r.species} ${Math.round(r.size * 10) / 10}cm` }),
      el('td', { class: 'rk-pt', text: (findPoint(r.point) || {}).name || r.point }),
      el('td', { class: 'rk-d', text: isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()}` })));
  });
  $('#rk-note').textContent = `${LINES[line].name} · ${point ? findPoint(point).name : '전체 포인트'} · ${RANK_PERIODS[period]} ${RANK_TARGET[line] ? `${RANK_TARGET[line]} ` : ''}최대어 순위 (아이디별 최고 기록${RANK_TARGET[line] ? `, ${RANK_TARGET[line]}만` : ''})${records.mode === 'cloud' ? '' : ' — 서버 미연결: 이 기기 기록만 보여요'}`;
}
function openRankBoard() {
  $('#rk-line').value = st.line || 'east';
  fillRankPoints();
  $('#rk-point').value = st.point && POINTS[$('#rk-line').value].includes(st.point) ? st.point.id : '';
  $('#rk-period').value = 'all';
  renderRankBoard();
  $('#dlg-rank').showModal();
}
$('#rk-line').addEventListener('change', () => { fillRankPoints(); renderRankBoard(); });
['#rk-point', '#rk-period'].forEach((id) => $(id).addEventListener('change', renderRankBoard));
$('#btn-rank').addEventListener('click', () => { audio.ui(); openRankBoard(); });
$('#rank').addEventListener('click', () => { audio.ui(); openRankBoard(); });

// ── 친구 ──
const friends = new Friends(records, {
  onChange: () => renderFriends(),
  onRequest: (name) => {
    audio.ui();
    notify(`👋 ${name}님이 친구 요청을 보냈어요.`, [
      ['수락', async () => { const r = await friends.add(name); toast(r.ok ? `🤝 ${name}님과 친구가 되었어요!` : r.reason); }, 'go'],
      ['나중에', null],
    ]);
  },
  onAccepted: (name) => { audio.ui(); toast(`🤝 ${name}님이 친구 요청을 수락했어요!`); },
  onInvite: (name, info) => {
    audio.ui();
    vibrate([80, 40, 80]);
    notify(`🎣 ${name}님: 동출 Go, Go~ (${info.pname || '포인트'})`, [
      ['같이 낚시하기', () => joinFriendAt(name, info), 'go'],
      ['닫기', null],
    ]);
  },
});
let noteT = 0;
function notify(text, actions) {
  const n = $('#fr-note');
  n.querySelector('p').textContent = text;
  const box = n.querySelector('.fr-note-btns');
  box.textContent = '';
  actions.forEach(([label, fn, cls]) => box.append(el('button', { type: 'button', class: cls || '', text: label, onclick: () => { n.hidden = true; fn && fn(); } })));
  n.hidden = false;
  clearTimeout(noteT);
  noteT = setTimeout(() => { n.hidden = true; }, 30000);
}
// 친구가 있는 포인트로 이동
function joinFriendAt(name, info) {
  const p = info && findPoint(info.point);
  if (!p || !LINES[info.line]) return toast(`${name}님은 지금 낚시 포인트에 있지 않아요.`);
  if (st.playing && st.point === p) return toast(`이미 ${name}님과 같은 포인트예요!`);
  if (fishing.busy && fishing.state !== 'result') fishing.reset();
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  st.line = info.line;
  st.point = p;
  document.querySelectorAll('.line-card').forEach((x) => x.classList.toggle('on', x.dataset.line === st.line));
  renderPoints();
  validateEntry();
  if (st.playing) net.leave();
  enterSea();
  setTimeout(() => toast(`🎣 ${name}님이 있는 ${p.name}(으)로 왔어요!`), 1200);
}
const whereText = (info) => (info && info.point ? `📍 ${info.pname}` : '🏠 대기실');
function frRow(name, sub, online, ...btns) {
  return el('li', {}, el('span', { class: `fr-dot${online ? ' on' : ''}` }), el('span', { class: 'fr-who' }, el('b', { text: name }), el('small', { text: sub })), ...btns);
}
const frBtn = (text, fn, cls = '') => el('button', { type: 'button', class: cls, text, onclick: async (e) => { e.currentTarget.disabled = true; await fn(); } });
async function frAdd(name) {
  const r = await friends.add(name);
  toast(!r.ok ? r.reason : r.accepted ? `🤝 ${name}님과 친구가 되었어요!` : `📨 ${name}님에게 친구 요청을 보냈어요.`);
}
async function frRemove(name, what) {
  if (what === '친구 삭제' && !confirm(`${name}님을 친구에서 삭제할까요?`)) return renderFriends();
  if (!(await friends.remove(name))) toast('처리에 실패했어요. 잠시 후 다시 시도해 주세요.');
}
function renderFriends() {
  const inc = friends.incoming, list = friends.friends, out = friends.outgoing;
  const badge = $('#fr-badge');
  badge.hidden = !inc.length;
  badge.textContent = inc.length;
  if (!$('#dlg-friends').open) return;
  $('#fr-mode').textContent = friends.cloud ? '친구는 서버에 저장돼요. 다른 기기에서도 같은 아이디로 들어오면 그대로예요.'
    : '서버 친구 저장소가 없어 이 기기에만 저장돼요. 친구 요청은 상대가 접속 중일 때 전달돼요.';
  const ulIn = $('#fr-in');
  ulIn.textContent = '';
  $('#fr-in-h').hidden = !inc.length;
  inc.forEach((n) => ulIn.append(frRow(n, '친구 요청을 보냈어요', friends.online.has(n),
    frBtn('수락', () => frAdd(n), 'go'), frBtn('거절', () => frRemove(n), 'ghost'))));
  const ul = $('#fr-list');
  ul.textContent = '';
  if (!list.length) ul.append(el('li', { class: 'empty', text: '아직 친구가 없어요. 접속자 탭이나 아이디로 친구를 추가해 보세요.' }));
  list.sort((a, b) => (friends.online.has(b) - friends.online.has(a)) || a.localeCompare(b)).forEach((n) => {
    const info = friends.online.get(n);
    const btns = [];
    if (info && info.point) btns.push(frBtn('같이 낚시하기', () => joinFriendAt(n, info), 'go'));
    if (info && st.playing) btns.push(frBtn('초대', () => { friends.invite(n); toast(`📨 ${n}님을 ${st.point.name}(으)로 초대했어요.`); }));
    btns.push(frBtn('삭제', () => frRemove(n, '친구 삭제'), 'ghost'));
    ul.append(frRow(n, info ? whereText(info) : '오프라인', !!info, ...btns));
  });
  const ulOut = $('#fr-out');
  ulOut.textContent = '';
  $('#fr-out-h').hidden = !out.length;
  out.forEach((n) => ulOut.append(frRow(n, '수락을 기다리는 중', friends.online.has(n), frBtn('취소', () => frRemove(n), 'ghost'))));
  // 접속자
  const ulOn = $('#fr-online');
  ulOn.textContent = '';
  const people = [...friends.online.values()].sort((a, b) => (b.point === (st.point && st.point.id)) - (a.point === (st.point && st.point.id)) || a.name.localeCompare(b.name));
  if (!people.length) ulOn.append(el('li', { class: 'empty', text: friends.mode === 'off' ? '접속자 목록에 연결 중이에요…' : '지금은 다른 접속자가 없어요.' }));
  people.forEach((p) => {
    const s = friends.status(p.name);
    const btn = s === 'friend' ? (p.point ? frBtn('같이 낚시하기', () => joinFriendAt(p.name, p), 'go') : el('button', { type: 'button', disabled: '', text: '🤝 친구' }))
      : s === 'sent' ? el('button', { type: 'button', disabled: '', text: '요청 보냄' })
        : s === 'incoming' ? frBtn('수락', () => frAdd(p.name), 'go') : frBtn('친구 추가', () => frAdd(p.name));
    ulOn.append(frRow(p.name, (st.point && p.point === st.point.id ? '🟢 같은 포인트 · ' : '') + whereText(p), true, btn));
  });
}
async function renderFriendRank() {
  const line = $('#frk-line').value, period = $('#frk-period').value;
  const body = $('#frk-body');
  body.textContent = '';
  body.append(el('tr', {}, el('td', { colspan: '5', class: 'rk-empty', text: '불러오는 중…' })));
  const names = [st.look.name, ...friends.friends];
  const rows = await records.ranking({ points: POINTS[line].map((p) => p.id), since: periodSince(period), limit: 50, species: RANK_TARGET[line] || null, names });
  body.textContent = '';
  $('#frk-note').textContent = `나와 친구 ${friends.friends.length}명 · ${LINES[line].name} · ${RANK_PERIODS[period]} ${RANK_TARGET[line] ? `${RANK_TARGET[line]} ` : ''}최대어 순위 (아이디별 최고 기록)`;
  if (!rows.length) { body.append(el('tr', {}, el('td', { colspan: '5', class: 'rk-empty', text: friends.friends.length ? '아직 기록이 없어요. 친구들과 첫 기록에 도전해 보세요!' : '친구를 추가하면 친구끼리 순위를 겨룰 수 있어요.' }))); return; }
  const medal = ['🥇', '🥈', '🥉'];
  rows.forEach((r, i) => {
    const d = new Date(r.created_at);
    const on = r.name === st.look.name || friends.online.has(r.name);
    body.append(el('tr', { class: r.name === st.look.name ? 'me' : '' },
      el('td', { class: 'rk-n', text: medal[i] || String(i + 1) }),
      el('td', { text: `${r.name}${on ? ' 🟢' : ''}` }),
      el('td', { text: `${r.species} ${Math.round(r.size * 10) / 10}cm` }),
      el('td', { class: 'rk-pt', text: (findPoint(r.point) || {}).name || r.point }),
      el('td', { class: 'rk-d', text: isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()}` })));
  });
}
function frTab(t) {
  document.querySelectorAll('.fr-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll('.fr-pane').forEach((p) => { p.hidden = p.dataset.p !== t; });
  if (t === 'rank') renderFriendRank();
}
document.querySelectorAll('.fr-tabs button').forEach((b) => b.addEventListener('click', () => { audio.ui(); frTab(b.dataset.t); }));
['#frk-line', '#frk-period'].forEach((id) => $(id).addEventListener('change', renderFriendRank));
$('#fr-add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = $('#fr-add-name').value.trim();
  if (!v) return;
  if (friends.isFriend(v)) return toast(`${v}님은 이미 친구예요.`);
  await frAdd(v);
  $('#fr-add-name').value = '';
});
$('#btn-friends').addEventListener('click', () => {
  audio.ui();
  if (friends.mode === 'off' && st.look.name) friends.start(st.look.name);
  $('#frk-line').value = st.line || 'east';
  $('#dlg-friends').showModal();
  frTab('list');
  renderFriends();
  friends.reload();
});
setInterval(() => { if ($('#dlg-friends').open) friends.reload(); }, 15000);

// 채팅 입력: 버튼을 누를 때만 위쪽에 한 줄로 열린다
function openChat(on) {
  $('#chat-bar').hidden = !on;
  if (on) setTimeout(() => $('#chat-input').focus(), 30);
  else $('#chat-input').blur();
}
$('#btn-chat').addEventListener('click', () => { audio.ui(); openChat($('#chat-bar').hidden); });
$('#chat-close').addEventListener('click', () => openChat(false));
$('#chat-bar').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#chat-input').value.trim().slice(0, 80);
  if (!v) return;
  sendChat(v);
  $('#chat-input').value = '';
  if (matchMedia('(max-width: 760px)').matches) openChat(false);
});
addEventListener('keydown', (e) => {
  if (st.playing && e.key === 'Enter' && $('#chat-bar').hidden && !e.target.closest('input, textarea, select, dialog')) { e.preventDefault(); openChat(true); }
  if (e.key === 'Escape' && !$('#chat-bar').hidden) openChat(false);
});
addEventListener('beforeunload', () => { net.leave(); friends.stop(); });

// ── 시작 ──
addEventListener('resize', () => scene.resize());
buildEntry();
store.on(() => {
  if ($('#dlg-board').open) renderBoard();
  if ($('#dlg-detail').open && detailId) {
    const r = findItem(detailId);
    if (r) { renderComments(r); $('#d-like b').textContent = r.likes || 0; }
  }
});
store.init().then((mode) => {
  const p = $('#hud-store');
  const shared = mode === 'cloud' || mode === 'supabase';
  p.textContent = shared ? '실시간 공유' : '로컬 저장';
  p.classList.toggle('cloud', shared);
  p.title = shared ? '모든 방문자와 인증글이 공유됩니다' : '서버가 연결되지 않아 이 브라우저에만 저장됩니다';
});
// 실사 스캔 자료(질감·하늘·모델) 불러오기
{
  const fine = document.querySelector('.fine');
  const prev = fine ? fine.textContent : '';
  if (fine) fine.textContent = '🌊 실사 바다 자료를 불러오는 중… (처음 한 번만 조금 걸려요)';
  loadAssets().then((a) => {
    scene.setAssets(a);
    if (fine) fine.textContent = prev;
  }).catch(() => { if (fine) fine.textContent = prev; });
}
requestAnimationFrame(frame);
// 개발 확인용 (?debug)
if (params.has('debug')) window.__surf = { st, scene, fishing, audio, net, friends, records };
