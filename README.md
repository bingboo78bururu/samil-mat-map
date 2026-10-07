# 삼일맛지도

삼일 구성원의 맛집 정보와 후기를 함께 쌓고 공유하는 웹앱. 기획안 1~6장 + 화면 목업 v8 기준.

함께 작업하기 전에 [작업 규칙](CONVENTIONS.md)을 읽어주세요.

- 화면: S0 로그인·회원가입 / S1 목록·약도 / S2 식당 상세 / S3 추천 등록 / S4 랜덤 결과(창)
- 공동 저장소: Supabase (Postgres + RLS)
- **이번 범위 밖**
  - 카카오맵 지도 표시 — 좌표 컬럼(`lat`, `lng`, `kakao_place_id`)만 준비. 값이 없는 식당은 '위치 확인 중'. 임의 좌표 생성 금지 (추천 등록의 카카오 장소 검색은 연결됨)
  - 사내 메일 인증 — 로그인 게이트는 접근을 제한할 뿐, **삼일 구성원임을 확인해주지 않습니다.** 기획·PPT에 "구성원만 접근 가능"이라고 쓰면 안 됩니다
  - 사다리타기·함께 결정하기(S5), 후보 담기 — 기획팀 합의 후 다음 스코프

---

## 1. Supabase 준비 (한 번만)

1. <https://supabase.com> 에서 프로젝트 생성 (Region: **Northeast Asia (Seoul)**)
2. **SQL Editor** 새 쿼리 탭에 `supabase/setup_all.sql` 전체를 붙여넣고 **Run without RLS**
   - "Run and enable RLS"를 고르면 Supabase가 문장을 중간에 끼워 넣어 문법 오류가 납니다. 스크립트가 직접 RLS를 켭니다
   - 결과 표 2개 확인: 테이블 4개 모두 `RLS 켜짐 = true` / `restaurants 25` `reviews 10`
3. **Authentication → Sign In / Providers → Email**
   - `Enable Email provider` **켜기**
   - `Confirm email` **끄기** — 메일 인증이 이번 범위 밖이라서
   - `Enable anonymous sign-ins` **꺼진 상태 유지** — 켜면 로그인 없이 `authenticated` 권한을 얻어 접근 제한이 통째로 무너집니다
4. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키 복사

### 가입 허용 도메인 바꾸기

시연용으로 `samil-demo.example.com` 만 허용돼 있습니다. 실제 사내 도메인이 정해지면 SQL Editor에서:

```sql
insert into public.allowed_email_domains(domain) values ('사내도메인.com');
delete from public.allowed_email_domains where domain = 'samil-demo.example.com';
```

`.env` 의 `VITE_ALLOWED_EMAIL_DOMAINS` 도 같이 바꿔주세요(안내 문구용).

### 시연용 테스트 계정

회원가입 화면에서 `tester1@samil-demo.example.com` 같은 주소로 가입하면 됩니다. 존재하지 않는 도메인이어도 `Confirm email`이 꺼져 있으면 가입됩니다.

---

## 2. 로컬 실행

```bash
npm install
cp .env.example .env     # 값을 채웁니다
npm run dev
npm test                 # 필터 규칙 + 화면 렌더링 검사 (70건)
npm run lint             # 실수·구조 위반 검사
```

`.env` 에는 **anon public 키만** 넣습니다. `service_role` 키는 빌드 결과물에 그대로 노출되므로 절대 넣지 마세요.

---

## 3. 보안 설계

| 막는 것 | 방법 |
|---|---|
| 비로그인 사용자의 데이터 접근 | RLS가 `authenticated` 에게만 SELECT 허용 + `anon` 역할의 테이블 권한 자체를 `revoke` |
| 허용되지 않은 도메인의 가입 | `auth.users` BEFORE INSERT 트리거. REST·SDK·대시보드 어느 경로로도 우회 불가 |
| 남의 글로 위장한 등록 | INSERT 정책이 `created_by = auth.uid()` 를 강제 |
| 남의 글 수정·삭제 | UPDATE/DELETE 정책을 **아예 만들지 않음** |
| 잘못된 값 저장 | DB의 CHECK 제약이 최종 판정 (가격 > 0, 음식 종류·상황 태그·인원 화이트리스트, 링크 형식) |
| 대량 입력 | INSERT 트리거로 계정당 5분에 10건 |
| XSS | 화면에 들어가는 모든 사용자 입력에 `esc()` 적용 (`src/ui.js`) |
| 클릭재킹·외부 리소스 | `vercel.json` 의 CSP + `X-Frame-Options: DENY` |

**잘못 올라온 글 지우기**: 클라이언트에 삭제 수단이 없습니다. Supabase 대시보드 Table Editor에서 운영자가 직접 지웁니다.

---

## 4. 파일 구조 — 8명이 나눠 작업할 때

```
src/
  config.js          상수·화면 문구          ← 공용. 수정 전 알리기
  state.js           필터 규칙 + 데이터 캐시  ← 공용. 기획안 4장 규칙이 여기에만 있음
  api.js             DB 읽기/쓰기            ← 공용
  supabase.js        클라이언트 생성
  auth.js            로그인·회원가입·세션
  router.js          해시 라우팅 (#/, #/r/:id, #/new)
  ui.js              공용 조각 함수
  icons.js           음식 종류별 SVG 아이콘 15종
  map.js             약도 — 카카오맵 붙일 때 이 파일만 교체
  styles.css         전체 스타일
  main.js            시작점 + 화면 전환
  screens/
    login.js  S0   list.js  S1   detail.js  S2
    register.js S3  random.js S4
supabase/
  setup_all.sql           ← 빈 프로젝트에 이것 하나만 실행
  schema.sql              기본 스키마
  migrations/001_v8_fields.sql   목업 v8 반영
  migrations/002_kakao_map.sql   카카오맵 결정 반영
reference/
  mockup_v8.html     원본 목업 (참고용, 빌드에 포함 안 됨)
  smoke.mjs          필터·요약 로직 검사
  render.mjs         화면 렌더링 검사 (jsdom)
```

한 사람이 `screens/` 안의 파일 하나씩 맡으면 충돌이 나지 않습니다.

---

## 5. 콘텐츠팀 데이터 → DB 컬럼

| 기획안 항목 | DB 컬럼 | 비고 |
|---|---|---|
| 식당명 | `name` | 필수 |
| 지역 | `region` | 필수 |
| 주소 | `address` | 필수. **카카오 좌표 변환의 입력값이라 정확해야 합니다** |
| 음식 종류 | `cuisine` | **한식/중식/일식/양식/아시안/카페·디저트** 중 1개 (기획안 §5의 '기타'는 삭제됨) |
| 세분류 | `sub` | 선택. 국밥, 베트남, 이탈리안 등 |
| 대표 메뉴 | `menu` / `menus` | 필수 / 설명은 `menus` |
| 1인 가격(원) | `price` | 모르면 **비워둠**(NULL). 0 입력은 DB가 거부 |
| 추천 상황 | `tags` | 배열. 1개 이상 |
| 추천 이유 | `reviews.body` (첫 후기) | `kind='member'` |
| 추천 근거 | `source_type` | 직접 방문 / 동료 추천 / 자료 조사 |
| 출처·지도 링크 | `link` | http:// 또는 https:// |
| 정보 확인일 | `info_checked_on` | |
| 영업시간·예약·웨이팅 | `hours` `reserve` `wait` | 선택 |
| 본사 도보·거리 | `walk_min` `dist_m` | 좌표에서 계산. 직접 입력 불필요 |
| 좌표 | `lat` `lng` `kakao_place_id` | **카카오 로컬 API로 주소에서 자동 변환.** 직접 입력 금지 |

후기의 `kind` 는 `member`(구성원 실제) / `research`(조사 메모) / `virtual`(시연용 가상) 중 하나이고, `member`가 아니면 화면에 **배지가 강제로 붙습니다.**

---

## 6. 배포

정적 사이트입니다.

- 빌드: `npm run build` / 출력: `dist`
- 환경변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ALLOWED_EMAIL_DOMAINS`, `VITE_KAKAO_JS_KEY`
- 카카오 JavaScript 키는 카카오 디벨로퍼스 > 앱 > 플랫폼 키 > JavaScript 키의 **JavaScript SDK 도메인**에 배포 주소와 `http://localhost:5173` 이 등록돼 있어야 동작합니다
- `vercel.json` 에 CSP·보안 헤더·`noindex` 설정이 들어 있습니다

---

## 7. 열려 있는 항목

- 카카오 장소 검색(추천 등록 화면)은 붙었지만 좌표(`lat` `lng` `kakao_place_id`)는 아직 저장하지 않습니다. 등록 RPC에 인자를 추가하는 마이그레이션이 필요합니다. 지도 링크(`https://place.map.kakao.com/<id>`)에 장소 ID가 남아 있어 나중에 채울 수 있습니다
- v8 조사 자료 42곳은 **가격이 확인된 곳이 1곳뿐**이라 예산 필터가 사실상 작동하지 않습니다
- v8 조사 자료에 **'출장' 태그가 붙은 식당이 0곳**입니다 (용산 데이터만 있어서)
- 공개 URL에 PwC 로고와 회사명이 노출됩니다. 팀·회사 확인 필요
