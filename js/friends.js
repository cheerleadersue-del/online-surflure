// 친구: 접속자 목록(대기실) · 친구 요청/수락 · 같이 낚시 초대
// - 대기실 채널(Presence)에 모든 접속자가 아이디와 현재 위치를 알린다.
// - 친구 관계는 Supabase friend_links (schema_v3.sql). 없으면 이 기기에 저장한다.
//   A→B 와 B→A 가 모두 있으면 친구, 한쪽만 있으면 요청 상태.

const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, n);
const key = (a, b) => `${a}\u0001${b}`;

export class Friends {
  constructor(records, cb = {}) {
    this.records = records;
    this.cb = cb; // { onChange, onRequest(name), onAccepted(name), onInvite(name, info) }
    this.me = null;
    this.links = new Set(); // "owner\u0001friend" (나와 관련된 것만)
    this.online = new Map(); // name → { name, line, point, pname }
    this.loc = { line: null, point: null, pname: '' };
    this.mode = 'off'; // 'cloud' | 'local' | 'off'
    this.id = Math.random().toString(36).slice(2, 10);
  }

  // ── 상태 ──
  has(a, b) { return this.links.has(key(a, b)); }
  others() {
    const s = new Set();
    for (const k of this.links) { const [a, b] = k.split('\u0001'); s.add(a === this.me ? b : a); }
    return [...s];
  }
  get friends() { return this.others().filter((n) => this.has(this.me, n) && this.has(n, this.me)).sort(); }
  get incoming() { return this.others().filter((n) => this.has(n, this.me) && !this.has(this.me, n)).sort(); }
  get outgoing() { return this.others().filter((n) => this.has(this.me, n) && !this.has(n, this.me)).sort(); }
  isFriend(n) { return this.has(this.me, n) && this.has(n, this.me); }
  status(n) { return this.isFriend(n) ? 'friend' : this.has(this.me, n) ? 'sent' : this.has(n, this.me) ? 'incoming' : 'none'; }

  lsKey() { return `surflure.friends.v1.${this.me}`; }
  saveLocal() { try { localStorage.setItem(this.lsKey(), JSON.stringify([...this.links])); } catch (_) { /* 무시 */ } }
  loadLocal() {
    try { (JSON.parse(localStorage.getItem(this.lsKey())) || []).forEach((k) => this.links.add(k)); } catch (_) { /* 무시 */ }
  }
  changed() { this.saveLocal(); this.cb.onChange && this.cb.onChange(); }

  // ── 시작: 아이디가 정해진 뒤 한 번 ──
  async start(name) {
    if (this.me === name && this.mode !== 'off') return;
    this.stop();
    this.me = name;
    this.links.clear();
    this.loadLocal();
    await this.records.ready;
    this.db = this.records.db;
    if (this.db) {
      const { error } = await this.db.from('friend_links').select('owner').limit(1);
      this.cloud = !error;
      if (error) console.warn('친구 서버 테이블이 없어요 (supabase/schema_v3.sql 실행 필요):', error.message);
    }
    if (this.cloud) await this.reload();
    await this.joinLobby();
    this.changed();
  }

  stop() {
    if (this.ch) { try { this.ch.untrack(); this.ch.unsubscribe(); } catch (_) { /* 무시 */ } this.ch = null; }
    if (this.bc) { try { this.bc.postMessage({ t: 'bye', id: this.id, name: this.me }); this.bc.close(); } catch (_) { /* 무시 */ } this.bc = null; }
    this.online.clear();
    this.mode = 'off';
  }

  async reload() {
    if (!this.cloud || !this.me) return;
    const me = this.me;
    const { data, error } = await this.db.from('friend_links').select('owner,friend').or(`owner.eq."${me}",friend.eq."${me}"`).limit(1000);
    if (error) { console.warn('친구 목록 불러오기 실패', error.message); return; }
    this.links = new Set(data.map((r) => key(r.owner, r.friend)));
    this.changed();
  }

  // ── 대기실: 누가 어디서 낚시 중인지 ──
  async joinLobby() {
    if (this.db) {
      try {
        const ch = this.db.channel('surflure-lobby', { config: { presence: { key: this.id }, broadcast: { self: false } } });
        ch.on('presence', { event: 'sync' }, () => {
          this.online.clear();
          for (const [pid, arr] of Object.entries(ch.presenceState())) {
            if (pid === this.id) continue;
            const i = arr[0] || {};
            if (i.name && i.name !== this.me) this.online.set(clean(i.name, 12), { name: clean(i.name, 12), line: clean(i.line, 10), point: clean(i.point, 40), pname: clean(i.pname, 30) });
          }
          this.cb.onChange && this.cb.onChange();
        });
        ch.on('broadcast', { event: 'fr' }, ({ payload }) => this.recv(payload));
        await new Promise((res, rej) => {
          const to = setTimeout(() => rej(new Error('timeout')), 8000);
          ch.subscribe((s) => {
            if (s === 'SUBSCRIBED') { clearTimeout(to); res(); } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { clearTimeout(to); rej(new Error(s)); }
          });
        });
        this.ch = ch;
        this.mode = 'cloud';
        await this.track();
        return;
      } catch (e) { console.warn('대기실 연결 실패', e); }
    }
    if ('BroadcastChannel' in window) {
      // 서버가 없으면 같은 브라우저의 다른 탭끼리
      this.bc = new BroadcastChannel('surflure-lobby');
      this.bc.onmessage = (e) => {
        const m = e.data || {};
        if (m.id === this.id) return;
        if (m.t === 'here' && m.name && m.name !== this.me) {
          const isNew = !this.online.has(m.name);
          this.online.set(m.name, { name: m.name, line: m.line, point: m.point, pname: m.pname, seen: Date.now() });
          if (isNew) this.bc.postMessage({ t: 'here', id: this.id, name: this.me, ...this.loc });
          this.cb.onChange && this.cb.onChange();
        } else if (m.t === 'bye') { this.online.delete(m.name); this.cb.onChange && this.cb.onChange(); } else if (m.t === 'fr') this.recv(m.p);
      };
      this.mode = 'local';
      this.track();
    }
  }

  async track() {
    const info = { name: this.me, ...this.loc };
    if (this.ch) { try { await this.ch.track(info); } catch (_) { /* 무시 */ } } else if (this.bc) this.bc.postMessage({ t: 'here', id: this.id, ...info });
  }

  // 지금 있는 곳 (대기실이면 point = null)
  setLocation(line, point, pname) {
    this.loc = { line: line || null, point: point || null, pname: pname || '' };
    if (this.mode !== 'off') this.track();
  }

  send(type, to, extra = {}) {
    const p = { type, from: this.me, to, ...extra };
    if (this.ch) this.ch.send({ type: 'broadcast', event: 'fr', payload: p });
    else if (this.bc) this.bc.postMessage({ t: 'fr', id: this.id, p });
  }

  async recv(m) {
    if (!m || m.to !== this.me || !m.from || m.from === this.me) return;
    const from = clean(m.from, 12);
    if (m.type === 'req') {
      if (this.cloud) await this.reload(); else { this.links.add(key(from, this.me)); this.changed(); }
      if (!this.isFriend(from)) this.cb.onRequest && this.cb.onRequest(from);
    } else if (m.type === 'acc') {
      if (this.cloud) await this.reload(); else { this.links.add(key(from, this.me)); this.changed(); }
      if (this.isFriend(from)) this.cb.onAccepted && this.cb.onAccepted(from);
    } else if (m.type === 'rem') {
      if (this.cloud) await this.reload(); else { this.links.delete(key(from, this.me)); this.links.delete(key(this.me, from)); this.changed(); }
    } else if (m.type === 'inv' && this.isFriend(from)) {
      this.cb.onInvite && this.cb.onInvite(from, { line: clean(m.line, 10), point: clean(m.point, 40), pname: clean(m.pname, 30) });
    }
  }

  // ── 동작 ──
  // 친구 추가 = 요청 보내기 (상대가 이미 나를 추가했다면 수락)
  async add(name) {
    name = clean(name, 12).trim();
    if (!name || name === this.me) return { ok: false, reason: '아이디를 확인해 주세요.' };
    if (this.cloud) {
      const { data, error } = await this.db.rpc('add_friend', { p_name: this.me, p_token: this.records.token(), p_friend: name });
      if (error || !data) return { ok: false, reason: error ? '서버 저장에 실패했어요.' : '없는 아이디이거나 친구를 더 추가할 수 없어요.' };
    }
    const wasIncoming = this.has(name, this.me);
    this.links.add(key(this.me, name));
    this.changed();
    this.send(wasIncoming ? 'acc' : 'req', name);
    return { ok: true, accepted: wasIncoming };
  }

  // 친구 삭제 / 요청 거절·취소
  async remove(name) {
    if (this.cloud) {
      const { data, error } = await this.db.rpc('remove_friend', { p_name: this.me, p_token: this.records.token(), p_other: name });
      if (error || !data) return false;
    }
    this.links.delete(key(this.me, name));
    this.links.delete(key(name, this.me));
    this.changed();
    this.send('rem', name);
    return true;
  }

  invite(name) {
    if (!this.isFriend(name) || !this.loc.point) return false;
    this.send('inv', name, this.loc);
    return true;
  }
}
