// Supabase 저장소 (GitHub Pages 등 정적 호스팅에서 모두가 공유하는 저장 방식)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supaConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const fromRow = (r) => ({
  id: r.id, createdAt: r.created_at, line: r.line, method: r.method, spot: r.spot,
  lat: r.lat, lng: r.lng, caughtAt: r.caught_at, slot: r.slot, species: r.species,
  size: r.size, count: r.count, bait: r.bait, rod: r.rod, reel: r.reel, lineSpec: r.line_spec,
  waterTemp: r.water_temp, tide: r.tide, weather: r.weather, story: r.story, author: r.author,
  photo: r.photo_url, likes: r.likes || 0,
  comments: (r.comments || [])
    .map((c) => ({ id: c.id, author: c.author, text: c.text, at: c.created_at }))
    .sort((a, b) => (a.at < b.at ? -1 : 1)),
});

const cut = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : null) || null;
const numOrNull = (v) => (v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export class SupaBackend {
  async init(onChange) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    this.db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const items = await this.list();
    // 실시간: 누군가 글·댓글·좋아요를 남기면 바로 갱신
    let t = 0;
    const kick = () => { clearTimeout(t); t = setTimeout(onChange, 300); };
    this.db.channel('surflure')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catches' }, kick)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, kick)
      .subscribe();
    return items;
  }

  async list() {
    const { data, error } = await this.db
      .from('catches')
      .select('*, comments(*)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data.map(fromRow);
  }

  async add(r) {
    const blob = await dataUrlToBlob(r.photo);
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`;
    const up = await this.db.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw new Error(`사진 업로드 실패: ${up.error.message}`);
    const photoUrl = this.db.storage.from('photos').getPublicUrl(path).data.publicUrl;
    const row = {
      line: r.line === 'west' ? 'west' : 'east',
      method: ['lure', 'far', 'float', 'etc'].includes(r.method) ? r.method : 'lure',
      spot: cut(r.spot, 60), species: cut(r.species, 30),
      lat: numOrNull(r.lat), lng: numOrNull(r.lng),
      caught_at: r.caughtAt || null, slot: cut(r.slot, 10),
      size: numOrNull(r.size), count: numOrNull(r.count),
      bait: cut(r.bait, 60), rod: cut(r.rod, 60), reel: cut(r.reel, 60), line_spec: cut(r.lineSpec, 60),
      water_temp: numOrNull(r.waterTemp), tide: cut(r.tide, 20), weather: cut(r.weather, 20),
      story: cut(r.story, 2000), author: cut(r.author, 24) || '익명 낚시꾼',
      photo_url: photoUrl,
    };
    const { data, error } = await this.db.from('catches').insert(row).select('*, comments(*)').single();
    if (error) throw new Error(`저장 실패: ${error.message}`);
    return fromRow(data);
  }

  async comment(id, author, text) {
    const { error } = await this.db.from('comments').insert({ catch_id: id, author: cut(author, 24) || '익명', text: cut(text, 500) });
    if (error) throw new Error(`댓글 저장 실패: ${error.message}`);
    return this.get(id);
  }

  async like(id) {
    const { error } = await this.db.rpc('like_catch', { cid: id });
    if (error) throw new Error(error.message);
    return this.get(id);
  }

  async get(id) {
    const { data, error } = await this.db.from('catches').select('*, comments(*)').eq('id', id).single();
    if (error) throw new Error(error.message);
    return fromRow(data);
  }
}
