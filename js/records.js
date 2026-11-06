// 아이디 중복 확인 + 포인트별 최대어 랭킹 (Supabase, 없으면 이 브라우저에 저장)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const LS_REC = 'surflure.records.v1';
const LS_NAMES = 'surflure.names.v1';
const LS_TOKEN = 'surflure.token';

function token() {
  let t = null;
  try { t = localStorage.getItem(LS_TOKEN); } catch (_) { /* 무시 */ }
  if (!t) {
    const a = new Uint8Array(24);
    crypto.getRandomValues(a);
    t = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(LS_TOKEN, t); } catch (_) { /* 무시 */ }
  }
  return t;
}
const readLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* 무시 */ } };

export class Records {
  constructor() {
    this.mode = 'local';
    this.listeners = new Set();
    this.db = null;
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
      const { data, error } = await this.db.rpc('submit_record', { p_name: name, p_token: token(), p_point: point, p_species: species, p_size: size });
      if (error || !data) console.warn('기록 저장 실패', error);
      return;
    }
    const all = readLS(LS_REC, []);
    all.push({ point, name, species, size, created_at: new Date().toISOString() });
    writeLS(LS_REC, all.slice(-500));
    this.listeners.forEach((fn) => fn(point));
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
}
