// 여러 명 동시 접속: Supabase Realtime(Presence + Broadcast)
// Supabase를 쓸 수 없으면 같은 브라우저의 다른 탭끼리(BroadcastChannel) 연결된다.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

let clientPromise = null;
function supaClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm')
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }))
      .catch(() => null);
  }
  return clientPromise;
}

const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, '').slice(0, n);

export class Net {
  constructor({ onPeer, onLeave, onEvent, onStatus }) {
    this.id = Math.random().toString(36).slice(2, 10);
    this.peers = new Map(); // id → { name, look, st, seen }
    this.cb = { onPeer, onLeave, onEvent, onStatus };
    this.mode = 'off';
    this.lastSend = 0;
    setInterval(() => this.reap(), 2000);
  }

  async connect(line, me) {
    this.leave();
    this.line = line;
    this.me = { name: clean(me.name, 12) || '낚시꾼', look: me.look };
    const db = await supaClient();
    if (db) {
      try {
        const ch = db.channel(`surflure-${line}`, { config: { presence: { key: this.id }, broadcast: { self: false } } });
        ch.on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState();
          const ids = new Set(Object.keys(state));
          for (const [pid, arr] of Object.entries(state)) {
            if (pid === this.id) continue;
            const info = arr[0] || {};
            this.upsert(pid, { name: info.name, look: info.look });
          }
          for (const pid of [...this.peers.keys()]) if (!ids.has(pid)) this.drop(pid);
        });
        ch.on('broadcast', { event: 'st' }, ({ payload }) => this.recvState(payload));
        ch.on('broadcast', { event: 'ev' }, ({ payload }) => this.recvEvent(payload));
        await new Promise((res, rej) => {
          const to = setTimeout(() => rej(new Error('timeout')), 8000);
          ch.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') { clearTimeout(to); await ch.track({ name: this.me.name, look: this.me.look }); res(); }
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(to); rej(new Error(status)); }
          });
        });
        this.ch = ch;
        this.mode = 'online';
        this.cb.onStatus && this.cb.onStatus(this.mode);
        return this.mode;
      } catch (e) {
        console.warn('실시간 접속 실패, 같은 브라우저 탭끼리만 연결합니다:', e);
      }
    }
    if ('BroadcastChannel' in window) {
      this.bc = new BroadcastChannel(`surflure-net-${line}`);
      this.bc.onmessage = (e) => {
        const m = e.data || {};
        if (m.id === this.id) return;
        if (m.t === 'st') this.recvState(m.p);
        else if (m.t === 'ev') this.recvEvent(m.p);
        else if (m.t === 'bye') this.drop(m.id);
      };
      this.mode = 'local';
    }
    this.cb.onStatus && this.cb.onStatus(this.mode);
    return this.mode;
  }

  leave() {
    if (this.ch) { try { this.ch.untrack(); this.ch.unsubscribe(); } catch (_) { /* 무시 */ } this.ch = null; }
    if (this.bc) { this.bc.postMessage({ t: 'bye', id: this.id }); this.bc.close(); this.bc = null; }
    for (const pid of [...this.peers.keys()]) this.drop(pid);
    this.mode = 'off';
  }

  send(kind, payload) {
    const p = { ...payload, id: this.id, name: this.me && this.me.name, look: this.me && this.me.look };
    if (this.ch) this.ch.send({ type: 'broadcast', event: kind, payload: p });
    else if (this.bc) this.bc.postMessage({ t: kind, id: this.id, p });
  }

  // 위치·자세 (초당 약 8번)
  sendState(st, force) {
    const now = performance.now();
    if (!force && now - this.lastSend < 125) return;
    this.lastSend = now;
    this.send('st', { st });
  }

  sendEvent(type, data = {}) {
    this.send('ev', { type, ...data, at: Date.now() });
  }

  upsert(pid, info) {
    let p = this.peers.get(pid);
    const isNew = !p;
    if (!p) { p = { id: pid, name: '낚시꾼', look: null, st: null, seen: performance.now() }; this.peers.set(pid, p); }
    if (info.name) p.name = clean(info.name, 12);
    if (info.look) p.look = info.look;
    p.seen = performance.now();
    if (isNew || info.look) this.cb.onPeer && this.cb.onPeer(p, isNew);
    return p;
  }

  drop(pid) {
    if (!this.peers.has(pid)) return;
    const p = this.peers.get(pid);
    this.peers.delete(pid);
    this.cb.onLeave && this.cb.onLeave(p);
  }

  recvState(m) {
    if (!m || !m.id || m.id === this.id) return;
    const p = this.upsert(m.id, { name: m.name, look: this.peers.has(m.id) && this.peers.get(m.id).look ? null : m.look });
    p.st = m.st;
    p.seen = performance.now();
  }

  recvEvent(m) {
    if (!m || !m.id || m.id === this.id) return;
    const p = this.upsert(m.id, { name: m.name });
    if (m.text) m.text = clean(m.text, 80);
    this.cb.onEvent && this.cb.onEvent(p, m);
  }

  // 오래 소식이 없는 사람은 정리 (Presence가 없는 탭 연결용)
  reap() {
    if (this.ch) return;
    const now = performance.now();
    for (const [pid, p] of this.peers) if (now - p.seen > 8000) this.drop(pid);
  }
}
