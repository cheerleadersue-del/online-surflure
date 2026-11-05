// 조과 인증글 API (Netlify Functions + Netlify Blobs)
//   GET  /api/catches                 목록
//   POST /api/catches                 새 글 (사진은 dataURL로 받아 별도 저장)
//   GET  /api/catches/:id/photo       사진
//   POST /api/catches/:id/comments    댓글
//   POST /api/catches/:id/like        좋아요
import { getStore } from '@netlify/blobs';

export const config = { path: ['/api/catches', '/api/catches/*'] };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const METHODS = new Set(['lure', 'far', 'float', 'etc']);
const LINES = new Set(['east', 'west']);

function clean(body) {
  const line = LINES.has(body.line) ? body.line : 'east';
  const method = METHODS.has(body.method) ? body.method : 'lure';
  const species = str(body.species, 30);
  const spot = str(body.spot, 60);
  if (!species || !spot) throw new Error('어종과 장소는 꼭 입력해주세요');
  const caughtAt = new Date(body.caughtAt);
  return {
    line, method, species, spot,
    lat: num(body.lat, -90, 90), lng: num(body.lng, -180, 180),
    caughtAt: isNaN(caughtAt) ? new Date().toISOString() : caughtAt.toISOString(),
    slot: str(body.slot, 10),
    size: num(body.size, 0, 300), count: num(body.count, 0, 999),
    bait: str(body.bait, 60), rod: str(body.rod, 60), reel: str(body.reel, 60), lineSpec: str(body.lineSpec, 60),
    waterTemp: num(body.waterTemp, -5, 40),
    tide: str(body.tide, 20), weather: str(body.weather, 20),
    story: str(body.story, 2000),
    author: str(body.author, 24) || '익명 낚시꾼',
  };
}

export default async (req) => {
  const store = getStore({ name: 'surflure', consistency: 'strong' });
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/catches\/?/, '').split('/').filter(Boolean);

  try {
    if (parts.length === 0 && req.method === 'GET') {
      const { blobs } = await store.list({ prefix: 'catch/' });
      const items = (await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean);
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return json({ items: items.slice(0, 300) });
    }

    if (parts.length === 0 && req.method === 'POST') {
      const body = await req.json();
      const data = clean(body);
      const m = typeof body.photo === 'string' && body.photo.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
      if (!m) return json({ error: '인증 사진이 필요해요' }, 400);
      const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      if (bytes.length > 1.5 * 1024 * 1024) return json({ error: '사진이 너무 커요 (1.5MB 이하)' }, 413);
      const id = uid();
      await store.set(`photo/${id}`, bytes, { metadata: { type: `image/${m[1]}` } });
      const item = { ...data, id, photo: `/api/catches/${id}/photo`, createdAt: new Date().toISOString(), comments: [], likes: 0 };
      await store.setJSON(`catch/${id}`, item);
      return json({ item }, 201);
    }

    const [id, action] = parts;
    if (!/^[a-z0-9]{6,20}$/.test(id || '')) return json({ error: 'not found' }, 404);

    if (action === 'photo' && req.method === 'GET') {
      const res = await store.getWithMetadata(`photo/${id}`, { type: 'arrayBuffer' });
      if (!res) return new Response('not found', { status: 404 });
      return new Response(res.data, {
        headers: { 'content-type': res.metadata?.type || 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' },
      });
    }

    const item = await store.get(`catch/${id}`, { type: 'json' });
    if (!item) return json({ error: '글을 찾을 수 없어요' }, 404);

    if (action === 'comments' && req.method === 'POST') {
      const body = await req.json();
      const text = str(body.text, 500);
      if (!text) return json({ error: '댓글 내용을 입력해주세요' }, 400);
      item.comments = [...(item.comments || []), { id: uid(), author: str(body.author, 24) || '익명', text, at: new Date().toISOString() }].slice(-200);
      await store.setJSON(`catch/${id}`, item);
      return json({ item });
    }

    if (action === 'like' && req.method === 'POST') {
      item.likes = (item.likes || 0) + 1;
      await store.setJSON(`catch/${id}`, item);
      return json({ item });
    }

    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e.message || '서버 오류' }, 400);
  }
};
