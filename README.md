# 온라인 서프루어낚시 🌊🎣

소나무 숲길을 지나 모래를 밟고 바다로. 아바타로 **서프루어 · 원투 · 찌낚시(배)** 를 즐기고,
실제 바다에서 잡은 물고기를 **사진으로 인증**해 해변에 깃발을 꽂아 정보를 나누는 웹사이트입니다.

## 주요 기능

| 구분 | 내용 |
| --- | --- |
| 입장 | 아이디 직접 입력(중복 불가) → 장비 세팅(낚싯대 대나무/보급형/고급형, 릴 기본형/울테그라/스텔라/뱅퀴쉬, 미끼 기본형/웜/메탈/미노우, 복장 반바지·슬리퍼/무릎 장화/웨이더) → 라인·포인트 선택 |
| 포인트 | 동해: 해수욕장 6곳·방파제 4곳·항구 5곳 (대관람차·해수관음상·정자·등대·언덕 마을·과메기 덕장·스카이워크 등 상징 배경), 서해: 시화방조제(양쪽 바다, 달 전망대, 풍력발전기) |
| 랭킹 | 포인트별 최대어 1~3위(아이디·어종·크기), 기록 갱신 시 실시간 반영 |
| 3D 바다 | Three.js로 만든 실감형 3D: 맑은 청록 물빛과 파도·포말 셰이더, 붉은 적송 숲, 동해 흰 모래·황갈색 화강암 갯바위·테트라포드·빨간 등대, 서해 붉은 자갈 해변·사석 축대·바위 절벽 섬·다리·노란 부잔교 |
| 자유 이동·시점 | 가고 싶은 곳을 터치하면 걸어감(동서남북 자유, 소나무 사이·갯바위 위·데크·방파제), 방향키/WASD(Shift 달리기), 드래그로 시점 회전, 두 손가락/휠로 확대, 🕊️ 하늘 시점 |
| 바다로 가는 길 | 모래 해변 → 몽돌 해변 → 절벽 해안 데크길(촛대바위) → 갯바위 → 방파제(등대·선착장) → 배 위 |
| 실감 나는 소리 | 음원 파일 없이 코드로 합성: 솔바람, 새소리, 바닥별 발소리(솔잎/모래/바위/콘크리트), 파도, 갈매기, 캐스팅·릴·방울·히트 효과음 |
| 시간과 바다 | 실제 시각에 맞춰 새벽·낮·노을·밤 하늘이 바뀜(직접 선택 가능), 동해는 일출, 서해는 섬과 노을, 월별 추정 수온 |
| 낚시 | 🎣 서프루어: 길게 눌러 캐스팅 → 릴링 → 히트 → 텐션 조절 파이트<br>🔔 원투: 받침대에 꽂고 방울이 울리면 챔질<br>🚤 찌낚시: 배를 타고 나가 찌가 잠기면 챔질<br>잡은 물고기는 "내 어망"에 저장 |
| 인증 깃발 | 사진·장소·시간대·어종만 입력 → 해변에 깃발이 꽂힘 (사진 촬영 시각으로 시간대 자동 입력) |
| 함께 낚시 | 여러 명 동시 접속(Supabase Realtime, 별도 테이블 불필요): 서로의 아바타·낚시 모습, 인사·손흔들기·앉기·하이파이브·모래성 쌓기, 양해·매너 멘트(음성), 자유 채팅, 옆 사람 히트 시 박수와 "나이스~!" |
| 1인칭 낚시 | 캐스팅부터 1인칭: 힘 모으기·휘두르기, 릴링 중 저킹 액션(툭툭 쳐올리기), 히트 음성 "히트!/왔다!/나이스!" → "크다 커!" → 랜딩 직전 "빠지면 안 돼!/털리면 안 돼!" → 성공 감탄사 |
| 보일링 | 하늘 뷰에서 물고기 떼(보일링) 표시, 누르면 그 앞 물가로 이동, 보일링 안에 루어가 들어가면 입질 최대 6배 |
| 히트 연출 | 1인칭 시점 전환, 5~7초 릴링, 드랙 소리 + 휴대폰 진동 + 화면 흔들림 |
| 소통 | 깃발/게시판에서 상세 보기, 댓글, 좋아요, 카카오맵으로 위치 보기, 라인·방법·검색 필터 |

## 파일 구조

```
index.html                 화면 구조
css/style.css              스타일 (모바일 대응)
js/app.js                  화면 연결, 입력, 메인 루프
js/scene3d.js              3D 월드 (Three.js): 하늘·물 셰이더·적송 숲·모래/자갈 해변·갯바위·방파제·깃발
js/avatar3d.js             귀여운 꼬마 낚시꾼 3D 아바타와 입장 화면 미리보기
js/fish3d.js               실사풍 물고기(어종별 무늬·비늘·지느러미) + 팔딱이는 애니메이션
js/textures.js             코드로 그리는 텍스처 (모래·자갈·수피·방호벽·도로·라벨)
js/scene.js                공용 수학/색 함수, 시간대 팔레트
vendor/three/              Three.js r170 + GLTFLoader/RGBELoader (MIT, 외부 CDN 없이 동작)
js/assets.js               실사 스캔 자료 로더
assets/                    실사 스캔 자료 (모두 Poly Haven, CC0 — 출처 표시 의무 없음)
  hdri/                    실사 하늘: kloofendal_48d_partly_cloudy_puresky(낮), belfast_sunset_puresky(노을)
  textures/                모래 sand_01·damp_beach_sand·coast_sand_01, 자갈 dry_river_pebbles, 숲바닥 forest_leaves_02,
                           바위 rock_boulder_dry, 콘크리트 concrete_floor_worn_001, 아스팔트 asphalt_02, 수피 pine_bark,
                           옷감 denim_fabric, 솔잎 pine_needles(pine_tree_01 잔가지 스캔으로 만든 카드)
  models/                  coast_land_rocks_03·coast_rocks_01(해안 바위), life_jacket(구명조끼), fishermans_hat(버킷햇), rubber_boots(장화)
js/audio.js                Web Audio로 만드는 자연의 소리
js/fishing.js              낚시 미니게임
js/store.js                인증글 저장 (클라우드 / 로컬)
js/exif.js                 사진 EXIF 읽기, 사진 축소
js/data.js                 라인·포인트·어종·아바타 옵션
js/config.js               Supabase 연결 키 (비워두면 로컬 저장)
js/supa.js                 Supabase 저장 방식
supabase/schema.sql        Supabase 표·권한·사진 저장소 설정 SQL
netlify/functions/catches.mjs   인증글 API (Netlify Blobs 저장)
```

## 무료 배포: GitHub Pages + Supabase (추천)

> v2(아이디 중복 방지·랭킹)를 쓰려면 `supabase/schema_v2.sql` 도 SQL Editor에서 한 번 실행하세요. 실행 전에는 이 브라우저에만 저장됩니다.


1. **Supabase 프로젝트 만들기**: [supabase.com](https://supabase.com) → New project (지역은 Seoul 추천)
2. **표 만들기**: Supabase → SQL Editor → `supabase/schema.sql` 내용을 붙여넣고 **Run**
3. **키 넣기**: Project Settings → API 의 **Project URL** 과 **anon public 키**를 `js/config.js` 에 입력
   (service_role 키는 절대 넣지 마세요)
4. **GitHub Pages 켜기**: 저장소 Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save
5. `https://<아이디>.github.io/online-surflure/` 접속 → HUD에 **"실시간 공유"** 가 보이면 완료

> 누구나 로그인 없이 글·댓글을 쓸 수 있는 구조라, 부적절한 글은 Supabase → Table Editor 에서 지우면 됩니다.

## 저장 방식

- **`js/config.js` 에 Supabase 키가 있으면 "실시간 공유" 모드**: 글·사진·댓글이 Supabase에 저장되고, 새 깃발·댓글이 실시간으로 반영됩니다.
- **Netlify에 배포하면 "실시간 공유" 모드**: `netlify/functions/catches.mjs` 가 Netlify Blobs에 글·사진·댓글을 저장하고, 모든 방문자가 같은 해변을 봅니다. 15초마다 새 깃발을 불러옵니다.
- **그 밖의 경우(로컬 실행, GitHub Pages 등) "로컬 저장" 모드**: 이 브라우저의 localStorage에만 저장됩니다.
- 실제 글이 라인별로 4개 미만이면 해변이 비어 보이지 않게 **"예시"** 깃발을 보여줍니다(저장되지 않음).

## 로컬에서 보기

```bash
npx http-server . -p 8080 -c-1
# http://localhost:8080   (로컬 저장 모드)
```

API까지 함께 테스트하려면 `npm i -g netlify-cli` 후 `netlify dev` 를 실행하세요.

## Netlify 배포

1. Netlify → **Add new site → Import an existing project → GitHub** → `online-surflure` 선택
2. Build command는 비워두고 Publish directory는 `.` (netlify.toml에 설정됨)
3. 배포가 끝나면 HUD의 저장 표시가 **"실시간 공유"** 로 바뀝니다.

## 다음 단계 아이디어

- 다른 방문자 아바타가 실시간으로 보이는 멀티플레이 (WebSocket 서비스 필요)
- 로그인(카카오/구글)과 글 수정·삭제, 신고 기능
- 물때표·기상 API 연동, 지도 위 조과 모아보기
