// 정적 데이터: 라인, 구역, 포인트, 어종, 아바타 옵션

export const LINES = {
  east: {
    id: 'east',
    name: '동해라인',
    desc: '맑고 깊은 물, 수평선 위로 떠오르는 해. 광어·삼치·황어의 바다.',
    spots: [
      '고성 봉포해변', '속초 영랑해변', '양양 낙산해변', '양양 하조대', '강릉 사천해변',
      '강릉 경포해변', '동해 망상해변', '삼척 맹방해변', '울진 후정해변', '포항 칠포해변',
    ],
    // 월별 평균 표층 수온(°C, 대략치)
    temps: [11, 10, 10, 12, 15, 18, 21, 24, 23, 20, 17, 13],
  },
  west: {
    id: 'west',
    name: '서해라인',
    desc: '넓은 백사장과 갯벌, 섬 너머로 지는 노을. 광어·농어·우럭의 바다.',
    spots: [
      '인천 을왕리해변', '태안 만리포해변', '태안 꽃지해변', '태안 몽산포해변', '보령 대천해수욕장',
      '서천 춘장대해변', '군산 선유도', '부안 변산해변', '영광 가마미해변', '신안 증도 우전해변',
    ],
    temps: [6, 5, 7, 10, 14, 18, 22, 25, 23, 19, 14, 9],
  },
  sogari: {
    id: 'sogari',
    name: '쏘가리 낚시',
    desc: '임진강 군남댐과 다리 아래 여울 명당. 쏘가리·꺽지·누치의 강.',
    spots: ['연천 군남댐', '연천 장남교', '연천 동이대교', '연천 임진교', '연천 북삼교', '연천 삼화교'],
    temps: [3, 4, 7, 12, 17, 21, 24, 25, 21, 15, 9, 4],
  },
  bass: {
    id: 'bass',
    name: '배스 낚시',
    desc: '춘천 소양강의 잔잔한 물과 다리 기둥 주변. 배스·강준치·끄리.',
    spots: ['춘천 소양강 스카이워크', '춘천 소양2교', '춘천 소양강처녀상', '춘천 신매대교', '춘천 소양강댐 하류 세월교'],
    temps: [4, 5, 8, 13, 18, 22, 25, 26, 22, 16, 10, 5],
  },
};

// 월드 구역(가로 좌표, px)
// 동해 해안 구간 (게임 좌표 px, 1px = 0.06m) — 소나무 숲길 없이 바다에서 시작
const EAST_ZONES = [
  { id: 'beach', name: '모래 해변', from: 2900, to: 5300, ground: 'sand', fish: true, tip: '파도가 밀려오는 서프 포인트예요.' },
  { id: 'pebble', name: '몽돌 해변', from: 5300, to: 6500, ground: 'pebble', fish: true, tip: '파도에 몽돌이 자르르 구르는 작은 만.' },
  { id: 'deck', name: '해안 데크길', from: 6500, to: 7700, ground: 'wood', fish: true, tip: '절벽을 따라 걷는 나무 데크. 촛대바위가 발아래에.' },
  { id: 'rocks', name: '갯바위', from: 7700, to: 9100, ground: 'rock', fish: true, tip: '바위 위로 올라가 볼 수 있어요. 미끄럼 주의!' },
  { id: 'breakwater', name: '방파제', from: 9100, to: 10600, ground: 'concrete', fish: true, tip: '테트라포드 너머 등대. 배낚시 선착장이 있어요.' },
];
const RIVER_ZONES = [
  { id: 'riverbank', name: '강변', from: 2900, to: 10600, ground: 'pebble', fish: true, tip: '돌이 깔린 강변. 다리 기둥과 바위 주변을 노려보세요.' },
];
const SIHWA_ZONES = [
  { id: 'dike', name: '시화방조제', from: 2900, to: 10600, ground: 'concrete', fish: true, tip: '바깥은 서해, 안쪽은 시화호. 끝없이 곧은 방조제.' },
];
export let ZONES = EAST_ZONES;
export const isRiver = (point) => !!point && (point.type === 'bridge' || point.type === 'river');
export function setZonesFor(point) { ZONES = point && point.type === 'dike' ? SIHWA_ZONES : isRiver(point) ? RIVER_ZONES : EAST_ZONES; return ZONES; }
export const WORLD_START = 2900;
export const WORLD_END = 10600;
export const BOAT_DOCK = 10100;

// 입장 포인트 (실제 주요 해수욕장·방파제·항구). mark = 그 포인트를 상징하는 배경
export const POINTS = {
  east: [
    { id: 'hwajinpo', type: 'beach', name: '고성 화진포해수욕장', mark: 'villa', desc: '호수와 바다 사이 고운 모래, 언덕 위 돌별장' },
    { id: 'sokcho-beach', type: 'beach', name: '속초해수욕장', mark: 'wheel', desc: '해변 옆으로 도는 대관람차' },
    { id: 'naksan', type: 'beach', name: '양양 낙산해수욕장', mark: 'statue', desc: '언덕 위 하얀 해수관음상을 바라보는 해변' },
    { id: 'gyeongpo', type: 'beach', name: '강릉 경포해수욕장', mark: 'pavilion', desc: '넓은 백사장과 언덕 위 정자' },
    { id: 'mangsang', type: 'beach', name: '동해 망상해수욕장', mark: 'cabins', desc: '끝없는 백사장, 알록달록 캠핑 오두막' },
    { id: 'samcheok', type: 'beach', name: '삼척해수욕장', mark: 'resort', desc: '하얀 벽 파란 지붕 리조트가 보이는 해변' },
    { id: 'dongmyeong', type: 'breakwater', name: '속초 동명항 방파제', mark: 'rockPavilion', desc: '바위 위 정자(영금정)가 있는 방파제' },
    { id: 'jumunjin-bw', type: 'breakwater', name: '강릉 주문진 방파제', mark: 'twinLights', desc: '빨간 등대와 하얀 등대가 마주 보는 방파제' },
    { id: 'anmok', type: 'breakwater', name: '강릉 안목항 방파제', mark: 'cafes', desc: '커피거리 카페들이 늘어선 방파제' },
    { id: 'imwon', type: 'breakwater', name: '삼척 임원항 방파제', mark: 'cliffLight', desc: '절벽 아래 빨간 등대' },
    { id: 'jumunjin-port', type: 'port', name: '강릉 주문진항', mark: 'market', desc: '어선이 빼곡한 항구와 수산시장' },
    { id: 'daepo', type: 'port', name: '속초 대포항', mark: 'boats', desc: '등대 탑과 오징어배들' },
    { id: 'mukho', type: 'port', name: '동해 묵호항', mark: 'village', desc: '언덕 위 알록달록 마을과 하얀 등대' },
    { id: 'guryongpo', type: 'port', name: '포항 구룡포항', mark: 'racks', desc: '과메기 덕장이 늘어선 항구' },
    { id: 'hupo', type: 'port', name: '울진 후포항', mark: 'skywalk', desc: '바다 위로 뻗은 스카이워크와 언덕 등대' },
  ],
  west: [
    { id: 'sihwa', type: 'dike', name: '시화방조제', mark: 'moonTower', desc: '바다와 호수 사이 11km 방조제, 달 전망대' },
  ],
  // 쏘가리: 임진강 주요 포인트
  sogari: [
    { id: 'gunnam', type: 'bridge', name: '연천 군남댐', mark: 'dam', desc: '수문이 늘어선 댐 아래 거센 여울' },
    { id: 'jangnam', type: 'bridge', name: '연천 장남교', mark: 'cable', desc: '주탑과 케이블이 있는 다리, 주상절리 절벽' },
    { id: 'dongi', type: 'bridge', name: '연천 동이대교', mark: 'arch', desc: '붉은 아치 다리 아래 바위 여울' },
    { id: 'imjin', type: 'bridge', name: '연천 임진교', mark: 'old', desc: '낮게 놓인 오래된 다리와 자갈 여울' },
    { id: 'buksam', type: 'bridge', name: '연천 북삼교', mark: 'girder', desc: '긴 교각 사이로 흐르는 깊은 소' },
    { id: 'samhwa', type: 'bridge', name: '연천 삼화교', mark: 'low', desc: '물이 넘나드는 낮은 다리 주변 여울' },
  ],
  // 배스: 소양강
  bass: [
    { id: 'skywalk', type: 'river', name: '소양강 스카이워크', mark: 'riverSkywalk', desc: '강 위로 뻗은 유리 스카이워크' },
    { id: 'soyang2', type: 'river', name: '소양2교', mark: 'arch', desc: '하얀 아치 다리 아래 잔잔한 물' },
    { id: 'maiden', type: 'river', name: '소양강처녀상', mark: 'maiden', desc: '강변에 선 처녀상과 데크' },
    { id: 'sinmae', type: 'river', name: '신매대교', mark: 'girder', desc: '긴 다리 교각 주변 배스 포인트' },
    { id: 'sewol', type: 'river', name: '소양강댐 하류 세월교', mark: 'low', desc: '물이 넘나드는 낮은 잠수교' },
  ],
};
export const POINT_TYPE_NAME = { beach: '해수욕장', breakwater: '방파제', port: '항구', dike: '방조제', bridge: '임진강', river: '소양강' };
export const findPoint = (id) => Object.values(POINTS).flat().find((p) => p.id === id) || null;

// 장비: 효과는 캐스팅 거리(cast) · 줄 강도(strong) · 감는 속도(speed) · 입질(bite) · 어종 선호(prefer)
export const GEAR = {
  rod: [
    { id: 'bamboo', name: '대나무', tag: '기본형', cast: 0.72, strong: 0.85 },
    { id: 'standard', name: '보급형', tag: '카본 서프로드', cast: 0.88, strong: 1.0 },
    { id: 'premium', name: '고급형', tag: '고탄성 서프로드', cast: 1.0, strong: 1.15 },
  ],
  reel: [
    { id: 'basic', name: '기본형', tag: '스피닝릴', speed: 1.0, smooth: 1.0 },
    { id: 'ultegra', name: '울테그라', tag: '원투·서프', speed: 1.12, smooth: 0.9 },
    { id: 'stella', name: '스텔라', tag: '최고급 스피닝', speed: 1.28, smooth: 0.72 },
    { id: 'vanquish', name: '뱅퀴쉬', tag: '초경량 스피닝', speed: 1.3, smooth: 0.78 },
  ],
  bait: [
    { id: 'basic', name: '기본형', tag: '갯지렁이', bite: 1.0, prefer: [] },
    { id: 'worm', name: '웜', tag: '바닥 공략', bite: 1.1, prefer: ['대광어', '양태', '우럭', '돌우럭', '배스', '쏘가리', '꺽지'] },
    { id: 'metal', name: '메탈', tag: '원거리·회유어', bite: 1.05, prefer: ['대삼치', '알방어', '대방어', '부시리', '고등어', '전갱이', '풀치'] },
    { id: 'minnow', name: '미노우', tag: '표층·중층', bite: 1.1, prefer: ['농어', '황어', '감성돔', '쏘가리', '강준치'] },
  ],
  outfit: [
    { id: 'basic', name: '기본형', tag: '반바지·슬리퍼', wade: -0.25 },
    { id: 'boots', name: '무릎 장화', tag: '긴바지·장화', wade: -0.45 },
    { id: 'wader', name: '웨이더', tag: '가슴 장화', wade: -1.05 },
  ],
};
export const gearOf = (kind, id) => GEAR[kind].find((g) => g.id === id) || GEAR[kind][0];
export const DEFAULT_GEAR = { rod: 'bamboo', reel: 'basic', bait: 'basic', outfit: 'basic' };

export const METHODS = {
  lure: { id: 'lure', name: '서프루어', icon: '🎣', desc: '던지고 감으며 입질을 유도' },
  far: { id: 'far', name: '원투', icon: '🔔', desc: '멀리 던져두고 방울이 울리면 챔질' },
  float: { id: 'float', name: '찌낚시(배)', icon: '🚤', desc: '배 위에서 찌가 잠기면 챔질' },
};

// 게임 속 어종 (가상 조과)
// 게임에 나오는 물고기는 직접 그린 22종만 — 바다 18종 / 민물 4종
export const SEA_FISH = ['대방어', '알방어', '부시리', '대삼치', '고등어', '전갱이', '풀치', '농어', '양태', '감성돔', '황어', '대광어', '우럭', '돌우럭', '문어', '쭈꾸미', '갑오징어', '무늬오징어', '도다리'];
export const FRESH_FISH = ['쏘가리', '꺽지', '배스', '강준치', '메기', '황금쏘가리']; // 황금쏘가리: 민물 1% 확률
export const FISH = {
  lure: {
    east: [['대광어', 35, 80], ['양태', 30, 60], ['황어', 30, 50], ['대삼치', 50, 95], ['알방어', 35, 60], ['대방어', 65, 105], ['부시리', 60, 110], ['농어', 40, 85], ['고등어', 25, 45], ['전갱이', 18, 35], ['풀치', 50, 85]],
    west: [['대광어', 35, 80], ['농어', 40, 90], ['양태', 30, 60], ['우럭', 20, 40], ['돌우럭', 25, 48], ['대삼치', 45, 85], ['감성돔', 25, 50]],
    sogari: [['쏘가리', 20, 50], ['쏘가리', 20, 50], ['꺽지', 12, 22], ['강준치', 40, 75], ['배스', 25, 50]],
    bass: [['배스', 25, 55], ['배스', 25, 55], ['강준치', 40, 80], ['쏘가리', 20, 45], ['꺽지', 12, 22]],
  },
  far: {
    east: [['대광어', 30, 70], ['도다리', 20, 38], ['갑오징어', 15, 30], ['문어', 30, 80], ['쭈꾸미', 10, 22], ['황어', 30, 45], ['양태', 30, 55]],
    west: [['도다리', 20, 40], ['쭈꾸미', 10, 22], ['갑오징어', 15, 30], ['문어', 30, 80], ['우럭', 20, 40], ['양태', 30, 55]],
    sogari: [['쏘가리', 20, 45], ['꺽지', 12, 22], ['강준치', 40, 70], ['메기', 30, 75]],
    bass: [['배스', 25, 50], ['강준치', 40, 75], ['꺽지', 12, 22], ['메기', 30, 80]],
  },
  float: {
    east: [['도다리', 20, 35], ['돌우럭', 25, 45], ['감성돔', 25, 50], ['무늬오징어', 20, 45], ['고등어', 25, 45], ['전갱이', 18, 35], ['우럭', 20, 42]],
    west: [['우럭', 20, 50], ['감성돔', 25, 55], ['문어', 30, 80], ['대광어', 35, 70], ['쭈꾸미', 10, 20], ['돌우럭', 25, 48]],
    sogari: [['쏘가리', 20, 48], ['꺽지', 12, 22], ['강준치', 40, 70]],
    bass: [['배스', 25, 55], ['강준치', 40, 75], ['꺽지', 12, 22], ['메기', 30, 70]],
  },
};
// 직접 그린 물고기 그림 (assets/fish/*.webp)
const FISH_IMG_KEY = {
  대방어: 'yellowtail_l', 알방어: 'yellowtail_s', 부시리: 'amberjack', 대삼치: 'spanish_mackerel', 고등어: 'mackerel', 배스: 'bass',
  쏘가리: 'mandarin_fish', 강준치: 'skygazer', 쭈꾸미: 'webfoot_octopus', 주꾸미: 'webfoot_octopus', 갑오징어: 'cuttlefish', 무늬오징어: 'bigfin_squid',
  농어: 'seabass', 양태: 'flathead', 감성돔: 'black_seabream', 황어: 'dace', 대광어: 'flounder', 광어: 'flounder', 도다리: 'dodari', 메기: 'catfish', 황금쏘가리: 'golden_mandarin',
  꺽지: 'kkeokji', 문어: 'octopus', 풀치: 'hairtail', 우럭: 'rockfish', 돌우럭: 'stone_rockfish', 볼락: 'stone_rockfish', 전갱이: 'horse_mackerel',
  삼치: 'spanish_mackerel', '방어(새끼)': 'yellowtail_s', 방어: 'yellowtail_l',
};
export const fishImage = (name) => (FISH_IMG_KEY[name] ? `assets/fish/${FISH_IMG_KEY[name]}.webp` : null);

export const SPECIES_SUGGEST = [...SEA_FISH, ...FRESH_FISH];
export const BAIT_SUGGEST = ['메탈지그 30g', '메탈지그 40g', '미노우 120mm', '싱킹펜슬 110mm', '바이브레이션 26g', '지그헤드+웜 4인치', '스푼 28g', '청갯지렁이', '참갯지렁이', '크릴', '오징어 살'];
export const TIDE = ['', '조금', '1물', '2물', '3물', '4물', '5물', '6물', '7물', '8물(사리)', '9물', '10물', '11물', '12물', '13물', '무시'];
export const WEATHER = ['', '맑음', '구름조금', '흐림', '비', '안개', '강풍', '너울'];

export function timeSlot(date) {
  const h = date.getHours();
  if (h < 5) return '밤';
  if (h < 7) return '새벽';
  if (h < 11) return '아침';
  if (h < 15) return '낮';
  if (h < 18) return '오후';
  if (h < 20) return '해질녘';
  return '밤';
}

export function estWaterTemp(line, date = new Date()) {
  const t = LINES[line].temps;
  const m = date.getMonth();
  const d = date.getDate() / 31;
  const v = t[m] + (t[(m + 1) % 12] - t[m]) * d;
  return Math.round(v * 10) / 10;
}

export function zoneAt(x) {
  if (x < ZONES[0].from) return ZONES[0];
  return ZONES.find((z) => x >= z.from && x < z.to) || ZONES[ZONES.length - 1];
}

export const AVATAR_OPTIONS = {
  hat: [['cap', '캡'], ['bucket', '버킷햇'], ['beanie', '비니'], ['none', '없음']],
  colors: ['#f26b1d', '#1f3b73', '#5f6b3a', '#c8262d', '#f2c230', '#f4f1ea', '#2aa198', '#222428'],
  pants: [['wader', '웨이더'], ['shorts', '반바지'], ['jogger', '조거']],
  pantsColors: ['#4b5136', '#1e1f22', '#3a4a63', '#7a6a55'],
};

export const NAME_IDEAS = ['동해광어왕', '서해농어헌터', '새벽캐스터', '갯바위요정', '메탈지그장인', '원투방울', '노을서퍼', '파도타는루어'];

export const DEFAULT_AVATAR = {
  name: '',
  hat: 'cap',
  hatColor: '#1f3b73',
  jacket: '#f26b1d',
  pants: 'wader',
  pantsColor: '#4b5136',
  vest: true,
};

// 라인별 랭킹 대상 어종 (없으면 모든 어종). 대상이 아니면 '잡어'
export const RANK_TARGET = { sogari: '쏘가리', bass: '배스' };
export const isRankFish = (line, name) => !RANK_TARGET[line] || name === RANK_TARGET[line] || (RANK_TARGET[line] === '쏘가리' && name === '황금쏘가리');
