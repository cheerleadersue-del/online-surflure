import {
  LINES, ZONES, WORLD_END, METHODS, AVATAR_OPTIONS, NAME_IDEAS, DEFAULT_AVATAR,
  SPECIES_SUGGEST, BAIT_SUGGEST, TIDE, WEATHER, timeSlot, estWaterTemp, zoneAt,
} from './data.js';
import { smooth, hashStr } from './scene.js';
import { World } from './scene3d.js';
import { AvatarPreview } from './avatar3d.js';
import { loadAssets } from './assets.js';
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
let preview = null;
const store = new Store();
const profile = load('surflure.profile', {});
const params = new URLSearchParams(location.search);
const st = {
  line: LINES[params.get('line')] ? params.get('line') : profile.line || null,
  look: { ...DEFAULT_AVATAR, ...(profile.look || {}) },
  avatar: { x: 3500, dir: 1, walking: false, phase: 0 },
  camX: 3500,
  flags: [],
  npcs: [],
  onBoat: false,
  hoverFlag: null,
  hideAvatar: true,
  playing: false,
};
let creel = load('surflure.creel', []);
let timeMode = 'real';
let walkDir = 0;
const keys = new Set();
let zone = null;
let knownIds = null;

const fishing = new Fishing(audio, {
  onUI: renderFishUI,
  onCatch: (f) => showCatch(f),
});
st.fishing = fishing;

st.npcs = [
  { x: 3820, seed: 1, name: '현지꾼', look: { ...DEFAULT_AVATAR, jacket: '#1f3b73', hat: 'bucket', hatColor: '#5f6b3a', vest: false } },
  { x: 5620, seed: 4, name: '갯바위꾼', look: { ...DEFAULT_AVATAR, jacket: '#c8262d', hat: 'cap', hatColor: '#222428', pants: 'wader' } },
  { x: 7080, seed: 7, name: '방파제꾼', look: { ...DEFAULT_AVATAR, jacket: '#f2c230', hat: 'beanie', hatColor: '#c8262d', pants: 'jogger', vest: true } },
];

// ── 입장 화면 ──
function buildEntry() {
  document.querySelectorAll('.line-card').forEach((b) => {
    b.classList.toggle('on', b.dataset.line === st.line);
    b.addEventListener('click', () => {
      st.line = b.dataset.line;
      document.querySelectorAll('.line-card').forEach((x) => x.classList.toggle('on', x === b));
      audio.ui();
      validateEntry();
    });
  });
  const nameIn = $('#av-name');
  nameIn.value = st.look.name || '';
  nameIn.addEventListener('input', () => { st.look.name = nameIn.value.trim(); validateEntry(); });
  NAME_IDEAS.forEach((n) => $('#name-ideas').append(el('button', {
    type: 'button', text: n,
    onclick: () => { nameIn.value = n; st.look.name = n; validateEntry(); },
  })));
  const seg = (id, opts, key) => {
    const box = $(id);
    opts.forEach(([v, label]) => box.append(el('button', {
      type: 'button', text: label, class: st.look[key] === v ? 'on' : '',
      onclick: (e) => { st.look[key] = v; [...box.children].forEach((c) => c.classList.toggle('on', c === e.currentTarget)); },
    })));
  };
  const sw = (id, colors, key) => {
    const box = $(id);
    colors.forEach((c) => box.append(el('button', {
      type: 'button', style: `background:${c}`, class: st.look[key] === c ? 'on' : '', 'aria-label': c,
      onclick: (e) => { st.look[key] = c; [...box.children].forEach((x) => x.classList.toggle('on', x === e.currentTarget)); },
    })));
  };
  seg('#opt-hat', AVATAR_OPTIONS.hat, 'hat');
  sw('#opt-hatColor', AVATAR_OPTIONS.colors, 'hatColor');
  sw('#opt-jacket', AVATAR_OPTIONS.colors, 'jacket');
  seg('#opt-pants', AVATAR_OPTIONS.pants, 'pants');
  sw('#opt-pantsColor', AVATAR_OPTIONS.pantsColors, 'pantsColor');
  $('#opt-vest').checked = st.look.vest;
  $('#opt-vest').addEventListener('change', (e) => { st.look.vest = e.target.checked; });
  $('#enter-btn').addEventListener('click', enterSea);
  validateEntry();
}

function validateEntry() {
  const ok = !!st.line && !!(st.look.name || '').trim();
  const b = $('#enter-btn');
  b.disabled = !ok;
  b.textContent = !st.line ? '바다(라인)를 선택하세요' : !st.look.name ? '아이디를 입력하세요' : `${LINES[st.line].name}로 입장하기 🌊`;
}

function drawPreview(t) {
  const c = $('#avatar-preview');
  if (!preview) preview = new AvatarPreview(c);
  preview.render(t, st.look);
}

function enterSea() {
  audio.start();
  audio.setMuted(false);
  save('surflure.profile', { line: st.line, look: st.look });
  fade(() => {
    $('#entry').hidden = true;
    $('#hud').hidden = false;
    st.hideAvatar = false;
    st.playing = true;
    st.onBoat = false;
    st.avatar.x = 140;
    st.avatar.dir = 1;
    st.camX = 140;
    scene.snapCam = true;
    zone = null;
    fishing.reset();
    $('#hud-line').textContent = LINES[st.line].name;
    rebuildFlags();
    buildMinimap();
    history.replaceState(null, '', `?line=${st.line}`);
  });
}

function goHome() {
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

const DEPTHS = [0.18, 0.78, 0.4, 0.96, 0.62, 0.28, 0.88];
function rebuildFlags() {
  const items = allItems().filter((r) => r.line === st.line).slice(0, 40);
  const now = Date.now();
  const prev = new Map(st.flags.map((f) => [f.report.id, f]));
  st.flags = items.map((r, i) => {
    const jitter = (hashStr(r.id) % 60) - 30;
    const f = {
      report: r,
      x: 3050 + ((i * 173) % 2150) + jitter,
      depth: DEPTHS[i % DEPTHS.length],
      isNew: !r.sample && now - new Date(r.createdAt).getTime() < 86400000,
      plantedAt: prev.get(r.id)?.plantedAt,
    };
    if (knownIds && !knownIds.has(r.id)) f.plantedAt = performance.now();
    return f;
  });
  knownIds = new Set(allItems().map((r) => r.id));
  buildMinimap();
}

// ── 미니맵 ──
function buildMinimap() {
  const mm = $('#minimap');
  mm.textContent = '';
  ZONES.forEach((z) => mm.append(el('div', {
    class: `seg-z z-${z.id}`, style: `width:${((z.to - z.from) / WORLD_END) * 100}%`, text: z.name,
  })));
  st.flags.forEach((f) => mm.append(el('i', { class: 'fl', style: `left:${(f.x / WORLD_END) * 100}%` })));
  mm.append(el('i', { class: 'me', id: 'mm-me' }));
}
$('#minimap').addEventListener('click', (e) => {
  if (fishing.busy && fishing.state !== 'result') return toast('낚시 중이에요. 먼저 채비를 회수하세요.');
  const r = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * WORLD_END;
  fade(() => {
    st.onBoat = false;
    st.avatar.x = Math.max(60, Math.min(WORLD_END - 60, x));
    st.camX = st.avatar.x;
    scene.snapCam = true;
    fishing.reset();
  }, 350);
});

// ── 입력 ──
addEventListener('keydown', (e) => {
  if (!st.playing || e.target.closest('input, textarea, select, dialog')) return;
  if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) { keys.add(e.key.toLowerCase()); e.preventDefault(); }
  if (e.code === 'Space' && !e.repeat && !$('#fish-panel').hidden) { e.preventDefault(); mainPress(); }
});
addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.code === 'Space' && st.playing) mainRelease();
});
document.querySelectorAll('#walk-pad button').forEach((b) => {
  const d = +b.dataset.dir;
  const on = (e) => { e.preventDefault(); walkDir = d; b.classList.add('held'); try { b.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ } };
  const off = () => { if (walkDir === d) walkDir = 0; b.classList.remove('held'); };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off);
  b.addEventListener('lostpointercapture', off);
});

const cv = $('#world');
cv.addEventListener('pointermove', (e) => {
  if (!st.playing) return;
  const id = scene.hitFlag(e.clientX, e.clientY);
  st.hoverFlag = id;
  cv.style.cursor = id ? 'pointer' : 'default';
});
cv.addEventListener('click', (e) => {
  if (!st.playing) return;
  const id = scene.hitFlag(e.clientX, e.clientY);
  if (id) { audio.ui(); openDetail(id); }
});

// ── 낚시 패널 ──
const mainBtn = $('#fish-main');
function mainPress() {
  if (mainBtn.disabled) return;
  audio.start();
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
    st.avatar.x = 7360;
    st.camX = 7360;
    scene.snapCam = true;
    fishing.reset();
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
function showCatch(f) {
  pendingCatch = f;
  $('#c-title').textContent = `${f.name} ${f.size}cm!`;
  $('#c-sub').textContent = `${METHOD_NAME[f.method]} · ${zone ? (st.onBoat ? '배 위' : zone.name) : ''} · ${timeSlot(nowDate())}`;
  $('#dlg-catch').showModal();
}
function stashCatch() {
  if (!pendingCatch) return;
  creel.unshift({ ...pendingCatch, line: st.line, place: st.onBoat ? '선상' : zone?.name });
  creel = creel.slice(0, 100);
  save('surflure.creel', creel);
  $('#creel-count').textContent = creel.length;
  pendingCatch = null;
}
$('#c-ok').addEventListener('click', () => { stashCatch(); $('#dlg-catch').close(); });
$('#c-real').addEventListener('click', () => {
  const f = pendingCatch;
  stashCatch();
  $('#dlg-catch').close();
  openWrite({ species: f?.name, method: f?.method });
});
$('#dlg-catch').addEventListener('close', stashCatch);
$('#btn-creel').addEventListener('click', () => {
  const ul = $('#creel-list');
  ul.textContent = '';
  if (!creel.length) ul.append(el('li', { text: '아직 비어 있어요. 바다로 캐스팅해 보세요!' }));
  creel.forEach((c) => ul.append(el('li', {},
    el('b', { text: `${c.name} ${c.size}cm` }),
    el('span', { text: `${LINES[c.line]?.name || ''} · ${METHOD_NAME[c.method]} · ${new Date(c.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` }),
  )));
  $('#dlg-creel').showModal();
});

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
function fillSelect(sel, opts) { opts.forEach((o) => sel.append(el('option', { value: o, text: o || '선택 안 함' }))); }
fillSelect(W('tide'), TIDE);
fillSelect(W('weather'), WEATHER);
SPECIES_SUGGEST.forEach((s) => $('#species-list').append(el('option', { value: s })));
BAIT_SUGGEST.forEach((s) => $('#bait-list').append(el('option', { value: s })));
function fillSpots(line) {
  const dl = $('#spot-list');
  dl.textContent = '';
  LINES[line].spots.forEach((s) => dl.append(el('option', { value: s })));
}
function localISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function openWrite(pre = {}) {
  $('#write-form').reset();
  photoData = null;
  W('photo-prev').hidden = true;
  W('photo-txt').hidden = false;
  W('err').textContent = '';
  W('line').value = st.line || 'east';
  fillSpots(W('line').value);
  W('method').value = pre.method || fishing.mode;
  W('time').value = localISO(new Date());
  if (pre.species) W('species').value = pre.species;
  W('temp').placeholder = `추정 ${estWaterTemp(W('line').value)}`;
  updateSlot();
  livePreview();
  $('#dlg-write').showModal();
}
function updateSlot() {
  const d = new Date(W('time').value);
  W('slot').value = isNaN(d) ? '' : timeSlot(d);
}
W('line').addEventListener('change', () => { fillSpots(W('line').value); W('temp').placeholder = `추정 ${estWaterTemp(W('line').value)}`; });
W('time').addEventListener('input', updateSlot);
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
    const filled = [];
    if (exif.date) { W('time').value = localISO(exif.date); updateSlot(); filled.push('촬영 시각'); }
    if (exif.gps) { W('lat').value = exif.gps.lat.toFixed(4); W('lng').value = exif.gps.lng.toFixed(4); filled.push('위치'); }
    if (filled.length) toast(`사진에서 ${filled.join('·')} 정보를 가져왔어요. (공개를 원치 않으면 지워주세요)`);
    livePreview();
  } catch (err) {
    W('err').textContent = err.message;
  }
});
$('#write-form').addEventListener('input', livePreview);

function formData() {
  const v = (id) => W(id).value.trim();
  const n = (id) => (v(id) === '' ? null : Number(v(id)));
  const d = new Date(v('time'));
  return {
    line: v('line'), method: v('method'), spot: v('spot'), lat: n('lat'), lng: n('lng'),
    caughtAt: isNaN(d) ? new Date().toISOString() : d.toISOString(), slot: v('slot'),
    species: v('species'), size: n('size'), count: n('count') || 1, bait: v('bait'),
    rod: v('rod'), reel: v('reel'), lineSpec: v('linespec'),
    waterTemp: n('temp'), tide: v('tide'), weather: v('weather'), story: v('story'),
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
  btn.textContent = '깃발 꽂는 중…';
  try {
    const item = await store.add({ ...data, photo: photoData });
    $('#dlg-write').close();
    audio.flag();
    if (st.playing && item.line === st.line) {
      rebuildFlags();
      const f = st.flags.find((x) => x.report.id === item.id);
      if (f) {
        f.plantedAt = performance.now();
        fade(() => { st.onBoat = false; fishing.reset(); st.avatar.x = f.x - 120; st.camX = st.avatar.x; scene.snapCam = true; }, 350);
      }
      toast('🚩 해변에 인증 깃발이 꽂혔어요!');
    } else {
      toast(`🚩 ${LINES[item.line].name} 해변에 깃발이 꽂혔어요!`);
    }
  } catch (err) {
    W('err').textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '🚩 깃발 꽂기 (등록)';
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
    let dir = walkDir;
    if (keys.has('arrowleft') || keys.has('a')) dir = -1;
    if (keys.has('arrowright') || keys.has('d')) dir = 1;
    const anyDialog = document.querySelector('dialog[open]');
    if (anyDialog || st.onBoat) dir = 0;
    if (dir && fishing.busy && fishing.state !== 'result') {
      dir = 0;
      if (!toastT || !$('#toast').classList.contains('show')) toast('낚시 중이에요. 회수하거나 랜딩 후 이동하세요.');
    }
    if (dir && fishing.state === 'result') fishing.reset();
    av.walking = !!dir;
    if (dir) {
      av.dir = dir;
      av.x = Math.max(40, Math.min(WORLD_END - 40, av.x + dir * 100 * dt));
      av.phase += dt * 7.5;
      const sign = Math.sign(Math.sin(av.phase));
      if (sign !== lastStepSign) {
        lastStepSign = sign;
        const z = zoneAt(av.x);
        audio.step(z.ground);
        scene.addFootprint(av.x, dir, sign > 0);
      }
    }
    const z = zoneAt(av.x);
    if (z !== zone) {
      zone = z;
      showBanner(z.name, z.tip);
      $('#hud-zone').textContent = z.name;
      if (z.id === 'pine') $('#walk-hint').textContent = '→ 오른쪽으로 걸어 바다로 가요';
      else if (z.fish) $('#walk-hint').textContent = '오른쪽 아래 패널로 낚시를 해보세요';
      updatePanel();
    }
    // 카메라는 부드럽게 따라감
    st.camX += (av.x - st.camX) * Math.min(1, dt * 4);
    fishing.update(dt, { line: st.line, date, onBoat: st.onBoat });

    const x = st.onBoat ? 7600 : av.x;
    audio.update({
      forest: st.onBoat ? 0 : 1 - smooth(1700, 2700, x),
      sea: st.onBoat ? 0.6 : 0.08 + smooth(1500, 3000, x) * 0.92,
      gull: smooth(2600, 3200, x),
      rock: st.onBoat ? 0 : smooth(5200, 5400, x) * (1 - smooth(6400, 6600, x)),
      boat: st.onBoat ? 1 : 0,
    }, dt);

    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.5;
      $('#hud-time').textContent = `${timeSlot(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      $('#hud-temp').textContent = `수온(추정) ${estWaterTemp(st.line, date)}°C`;
      const me = $('#mm-me');
      if (me) me.style.left = `${(av.x / WORLD_END) * 100}%`;
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

// ── 시작 ──
addEventListener('resize', () => scene.resize());
buildEntry();
$('#creel-count').textContent = creel.length;
store.on(() => {
  if (st.playing) rebuildFlags();
  else knownIds = new Set(allItems().map((r) => r.id));
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
