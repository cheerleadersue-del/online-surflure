// 최소 JPEG EXIF 파서: 촬영 시각(DateTimeOriginal)과 GPS 좌표만 읽는다.
export async function readExif(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xffd8) return {};
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off);
      const len = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
      if ((marker & 0xff00) !== 0xff00) break;
      off += 2 + len;
    }
  } catch (_) { /* EXIF 없음 */ }
  return {};
}

function parseTiff(v, start) {
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o) => v.getUint16(start + o, le);
  const u32 = (o) => v.getUint32(start + o, le);
  const ifd = (o) => {
    const out = {};
    const n = u16(o);
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12;
      out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), off: e + 8 };
    }
    return out;
  };
  const str = (ent) => {
    const o = ent.count > 4 ? u32(ent.off) : ent.off;
    let s = '';
    for (let i = 0; i < ent.count - 1; i++) s += String.fromCharCode(v.getUint8(start + o + i));
    return s;
  };
  const rational3 = (ent) => {
    const o = u32(ent.off);
    const r = (k) => u32(o + k * 8) / (u32(o + k * 8 + 4) || 1);
    return r(0) + r(1) / 60 + r(2) / 3600;
  };
  const res = {};
  const ifd0 = ifd(u32(4));
  if (ifd0[0x8769]) {
    const ex = ifd(u32(ifd0[0x8769].off));
    if (ex[0x9003]) {
      const m = str(ex[0x9003]).match(/(\d+):(\d+):(\d+) (\d+):(\d+)/);
      if (m) res.date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    }
  }
  if (ifd0[0x8825]) {
    const gps = ifd(u32(ifd0[0x8825].off));
    if (gps[2] && gps[4]) {
      let lat = rational3(gps[2]);
      let lng = rational3(gps[4]);
      if (gps[1] && String.fromCharCode(v.getUint8(gps[1].off)) === 'S') lat = -lat;
      if (gps[3] && String.fromCharCode(v.getUint8(gps[3].off)) === 'W') lng = -lng;
      if (isFinite(lat) && isFinite(lng) && (lat || lng)) res.gps = { lat, lng };
    }
  }
  return res;
}

// 업로드 전 사진 축소 (EXIF 등 메타데이터는 재인코딩으로 제거됨)
export function resizeImage(file, max = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없어요')); };
    img.src = url;
  });
}
