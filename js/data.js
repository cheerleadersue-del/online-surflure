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
};

// 월드 구역(가로 좌표, px)
export const ZONES = [
  { id: 'pine', name: '소나무 숲길', from: 0, to: 1900, ground: 'forest', fish: false,
    tip: '솔향 가득한 숲길. 파도 소리가 조금씩 가까워져요.' },
  { id: 'sandpath', name: '모랫길', from: 1900, to: 2900, ground: 'sand', fish: false,
    tip: '발밑의 모래가 사각사각. 수평선이 보이기 시작합니다.' },
  { id: 'beach', name: '모래 해변', from: 2900, to: 5300, ground: 'sand', fish: true,
    tip: '인증 깃발이 꽂힌 서프 포인트. 깃발을 눌러 조과를 확인하세요.' },
  { id: 'rocks', name: '갯바위', from: 5300, to: 6500, ground: 'rock', fish: true,
    tip: '포말이 부서지는 갯바위. 미끄럼 주의!' },
  { id: 'breakwater', name: '방파제', from: 6500, to: 7800, ground: 'concrete', fish: true,
    tip: '테트라포드 너머 빨간 등대. 배낚시 선착장이 있어요.' },
];
export const WORLD_END = 7800;

export const METHODS = {
  lure: { id: 'lure', name: '서프루어', icon: '🎣', desc: '던지고 감으며 입질을 유도' },
  far: { id: 'far', name: '원투', icon: '🔔', desc: '멀리 던져두고 방울이 울리면 챔질' },
  float: { id: 'float', name: '찌낚시(배)', icon: '🚤', desc: '배 위에서 찌가 잠기면 챔질' },
};

// 게임 속 어종 (가상 조과)
export const FISH = {
  lure: {
    east: [['광어', 35, 70], ['양태', 30, 60], ['황어', 30, 50], ['삼치', 45, 80], ['방어(새끼)', 35, 55], ['농어', 40, 80], ['숭어', 35, 60]],
    west: [['광어', 35, 75], ['농어', 40, 90], ['양태', 30, 60], ['우럭', 20, 40], ['노래미', 20, 38], ['삼치', 40, 70], ['숭어', 35, 65]],
  },
  far: {
    east: [['보리멸', 15, 25], ['도다리', 20, 35], ['노래미', 20, 35], ['황어', 30, 45], ['붕장어', 40, 80]],
    west: [['보리멸', 15, 25], ['도다리', 20, 38], ['붕장어', 40, 90], ['노래미', 20, 38], ['망둥어', 15, 25]],
  },
  float: {
    east: [['볼락', 15, 28], ['우럭', 20, 42], ['참돔', 30, 60], ['쥐노래미', 20, 40], ['열기', 15, 28]],
    west: [['우럭', 20, 50], ['참돔', 30, 65], ['광어', 35, 70], ['노래미', 20, 40], ['감성돔', 25, 50]],
  },
};

export const SPECIES_SUGGEST = ['광어', '농어', '양태', '삼치', '황어', '숭어', '방어', '우럭', '노래미', '쥐노래미', '보리멸', '도다리', '붕장어', '참돔', '감성돔', '볼락', '성대', '전갱이'];
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
