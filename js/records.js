// 아이디 중복 확인 + 포인트별 최대어 랭킹 (Supabase, 없으면 이 브라우저에 저장)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const LS_REC = 'surflure.records.v1';
const LS_NAMES = 'surflure.names.v1';
const LS_TOKEN = 'surflure.token';

// 기기 토큰: 저장소를 못 쓰는 브라우저(인앱·사생활 보호)에서도 한 번 접속하는 동안은 같은 값
let memToken = null;
function token() {
  if (memToken) return memToken;
  let t = null;
  try { t = localStorage.getItem(LS_TOKEN); } catch (_) { /* 무시 */ }
  if (!t) {
    const a = new Uint8Array(24);
    crypto.getRandomValues(a);
    t = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(LS_TOKEN, t); } catch (_) { /* 무시 */ }
  }
  memToken = t;
  return t;
}
const readLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* 무시 */ } };

export class Records {
  constructor() {
    this.mode = 'local';
    this.listeners = new Set();
    this.db = null;
    this.extra = new Map(); // 같은 포인트 접속자가 실시간으로 알려준 기록 (서버 저장 실패 대비)
    this.ready = this.init();
  }

  async init() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    try {
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm');
      const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      // v2 SQL이 실행됐는지 확인
      const { error } = await db.rpc('top3', { p_point: '_check' });
      if (error) { console.warn('랭킹 서버 함수가 없어요 (supabase/schema_v2.sql 실행 필요):', error.message); return; }
      this.db = db;
      this.mode = 'cloud';
      db.channel('surflure-records')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'records' }, (p) => this.listeners.forEach((fn) => fn(p.new && p.new.point)))
        .subscribe();
    } catch (e) {
      console.warn('랭킹 서버 연결 실패, 이 브라우저에만 저장합니다:', e);
    }
  }

  on(fn) { this.listeners.add(fn); }

  // 아이디 등록: { ok, reason }
  async claim(name) {
    await this.ready;
    name = name.trim();
    if (name.length < 2 || name.length > 12) return { ok: false, reason: '아이디는 2~12자로 입력해주세요.' };
    if (/[<>"'`\\]/.test(name)) return { ok: false, reason: '아이디에 특수기호(<>"\'`)는 쓸 수 없어요.' };
    if (this.db) {
      const { data, error } = await this.db.rpc('claim_name', { p_name: name, p_token: token() });
      if (error) return { ok: false, reason: '아이디 확인에 실패했어요. 잠시 후 다시 시도해주세요.' };
      return data ? { ok: true } : { ok: false, reason: '이미 다른 분이 쓰는 아이디예요. 다른 아이디를 입력해주세요.' };
    }
    const names = readLS(LS_NAMES, {});
    const key = name.toLowerCase();
    if (names[key] && names[key] !== token()) return { ok: false, reason: '이미 사용 중인 아이디예요.' };
    names[key] = token();
    writeLS(LS_NAMES, names);
    return { ok: true, local: true };
  }

  async submit(point, name, species, size) {
    await this.ready;
    if (this.db) {
      const args = { p_name: name, p_token: token(), p_point: point, p_species: species, p_size: size };
      let { data, error } = await this.db.rpc('submit_record', args);
      if (!error && !data) {
        // 아이디가 서버에 등록되지 않은 경우(입장 때 서버 연결 지연 등) 다시 등록 후 재시도
        const c = await this.db.rpc('claim_name', { p_name: name, p_token: token() });
        if (c.data) ({ data, error } = await this.db.rpc('submit_record', args));
      }
      if (!error && data) return true;
      console.warn('기록 서버 저장 실패, 이 기기에 보관합니다', error);
      this.lastError = error ? error.message : '아이디 확인 실패';
      // 실패해도 이 기기 기록에는 남긴다
      const all = readLS(LS_REC, []);
      all.push({ point, name, species, size, created_at: new Date().toISOString() });
      writeLS(LS_REC, all.slice(-500));
      return false;
    }
    const all = readLS(LS_REC, []);
    all.push({ point, name, species, size, created_at: new Date().toISOString() });
    writeLS(LS_REC, all.slice(-500));
    this.listeners.forEach((fn) => fn(point));
  }

  // 다른 접속자의 기록을 받아 둔다
  addPeerRecord(r) {
    if (!r || !r.name || !r.point || !(r.size > 0)) return false;
    const key = `${r.point}|${r.name}|${r.species}|${r.size}`;
    if (this.extra.has(key)) return false;
    this.extra.set(key, { point: String(r.point).slice(0, 40), name: String(r.name).slice(0, 12), species: String(r.species).slice(0, 20), size: +r.size, created_at: r.created_at || new Date().toISOString() });
    return true;
  }

  async top3(point) {
    await this.ready;
    if (this.db) {
      const { data, error } = await this.db.rpc('top3', { p_point: point });
      return error ? [] : data;
    }
    const best = new Map();
    for (const r of readLS(LS_REC, [])) {
      if (r.point !== point) continue;
      const b = best.get(r.name);
      if (!b || r.size > b.size) best.set(r.name, r);
    }
    return [...best.values()].sort((a, b) => b.size - a.size || (a.created_at < b.created_at ? -1 : 1)).slice(0, 3);
  }

  // 순위: 포인트(없으면 points 목록 전체)·기간(since ISO)별, 아이디마다 최고 기록 1개
  async ranking({ point = null, points = null, since = null, limit = 10, species = null } = {}) {
    await this.ready;
    let rows = [];
    if (this.db) {
      let q = this.db.from('records').select('point,name,species,size,created_at').order('size', { ascending: false }).limit(1000);
      if (point) q = q.eq('point', point);
      else if (points) q = q.in('point', points);
      if (since) q = q.gte('created_at', since);
      if (species) q = q.eq('species', species);
      const { data, error } = await q;
      if (error) { console.warn('랭킹 불러오기 실패', error.message); return []; }
      rows = data;
    } else {
      rows = readLS(LS_REC, []).filter((r) => (!point || r.point === point) && (!points || points.includes(r.point)) && (!since || r.created_at >= since) && (!species || r.species === species));
    }
    // 서버 기록 + 접속자들이 실시간으로 알려준 기록 + (서버 저장 실패 시) 이 기기 기록
    const extra = [...this.extra.values()];
    if (this.db) extra.push(...readLS(LS_REC, []));
    for (const r of extra) {
      if ((point && r.point !== point) || (points && !points.includes(r.point)) || (since && r.created_at < since) || (species && r.species !== species)) continue;
      rows.push(r);
    }
    const best = new Map();
    for (const r of rows) {
      const b = best.get(r.name);
      if (!b || r.size > b.size || (r.size === b.size && r.created_at < b.created_at)) best.set(r.name, r);
    }
    return [...best.values()].sort((a, b) => b.size - a.size || (a.created_at < b.created_at ? -1 : 1)).slice(0, limit);
  }
}
