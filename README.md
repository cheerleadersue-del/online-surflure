# 온라인 서프루어낚시 🌊🎣

소나무 숲길을 지나 모래를 밟고 바다로. 아바타로 **서프루어 · 원투 · 찌낚시(배)** 를 즐기고,
실제 바다에서 잡은 물고기를 **사진으로 인증**해 해변에 깃발을 꽂아 정보를 나누는 웹사이트입니다.

## 주요 기능

| 구분 | 내용 |
| --- | --- |
| 입장 | 동해라인 / 서해라인 선택, 아이디 입력(추천 아이디), 모자·재킷·하의·구명조끼 꾸미기 |
| 바다로 가는 길 | 소나무 숲길 → 모랫길 → 모래 해변 → 갯바위 → 방파제(등대·선착장) → 배 위 |
| 실감 나는 소리 | 음원 파일 없이 코드로 합성: 솔바람, 새소리, 바닥별 발소리(솔잎/모래/바위/콘크리트), 파도, 갈매기, 캐스팅·릴·방울·히트 효과음 |
| 시간과 바다 | 실제 시각에 맞춰 새벽·낮·노을·밤 하늘이 바뀜(직접 선택 가능), 동해는 일출, 서해는 섬과 노을, 월별 추정 수온 |
| 낚시 | 🎣 서프루어: 길게 눌러 캐스팅 → 릴링 → 히트 → 텐션 조절 파이트<br>🔔 원투: 받침대에 꽂고 방울이 울리면 챔질<br>🚤 찌낚시: 배를 타고 나가 찌가 잠기면 챔질<br>잡은 물고기는 "내 어망"에 저장 |
| 인증 깃발 | 사진·장소·좌표·시간대·어종·크기·마릿수·미끼·장비·수온·물때·날씨·잡은 방법 입력 → 해변에 깃발이 꽂힘<br>사진의 EXIF에서 촬영 시각·위치를 자동으로 채움, 작성 중 실시간 미리보기 |
| 소통 | 깃발/게시판에서 상세 보기, 댓글, 좋아요, 카카오맵으로 위치 보기, 라인·방법·검색 필터 |

## 파일 구조

```
index.html                 화면 구조
css/style.css              스타일 (모바일 대응)
js/app.js                  화면 연결, 입력, 메인 루프
js/scene.js                캔버스 장면 (하늘·바다·숲·해변·갯바위·방파제·아바타·깃발)
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
