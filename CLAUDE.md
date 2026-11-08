# frontend 작업 규칙 (3D 세션·메뉴 세션 공통)

화면은 두 층이다.
- **3D 층**: R3F `<Canvas>` (`src/world/WorldCanvas.tsx`). 장면 내용은 `src/world/buildWorld.js` 가 만들고, 후처리(GTAO)·라벨은 `WorldCanvas` 안의 `Post` 가 그린다. 타입은 `src/main.d.ts`(WorldApi)·`src/world/buildWorld.d.ts`. 스타일은 `src/style.css`.
- **품질 프리셋**: `src/quality.ts` (`?q=high|med|low|min`, 없으면 기기에 맞춰 자동). 픽셀비·그림자·나무 그림자·GTAO·MSAA·캔버스 안티에일리어싱·하늘 환경광·시야 끝·지형 셰이더를 정한다. 새 무거운 효과는 프리셋에 넣어서 끌 수 있게 할 것.
  - 상태는 `src/gfx.ts`(`useGfx`): 주소 `?q=` → 사용자가 고른 값(더 보기 > 그래픽, localStorage `chatatda.gfx`) → 자동(그래픽 장치: 가속 꺼짐=SwiftShader 면 `min`, 인텔 내장 그래픽이면 `low`). 자동일 때만 `FpsGuard`(WorldCanvas)가 24fps 아래면 한 단계씩 낮추고 같은 장치면 다음 접속에도 기억한다.
  - 품질 변경은 월드를 다시 만들지 않고 `buildWorld` 의 `applyQuality(Q)` 로 바꾼다. 캔버스 안티에일리어싱·가로등만 다음 접속부터.
  - 점검: `node scripts/gfx-check.mjs` (GPU 자동·실행 중 전환·가속 꺼짐 감지·자동 낮추기).
- **메뉴 층 (React+TS)**: `src/app/`. 스타일은 `src/app/app.css`. 3D API는 `useWorld().api` 로만 부른다.

## CSS 이름이 겹치지 않게 (중요)
두 스타일 파일이 한 페이지에 같이 로드된다. 같은 클래스·id·변수 이름을 쓰면 서로 덮어쓴다 (실제로 `.panel`, `.panel-head` 가 겹쳐서 메뉴 패널 제목이 안 보였던 적 있음).
- 메뉴 층 클래스는 `ui-` 로 시작한다 (`.ui-panel`, `.ui-panel-head` …). 새로 만드는 메뉴 클래스도 `ui-` 접두사.
- 메뉴 층 CSS 변수는 `--ui-*` 만 쓴다. 3D 쪽 `--ink`, `--glass`, `--line`, `--accent` 는 건드리지 않는다.
- 3D 쪽(`style.css`)에 새 클래스를 만들 때는 `ui-` 로 시작하지 않는다. 가능하면 `w3d-` 접두사를 쓴다.
- 3D 코드가 id로 찾는 요소(`#minimap`, `#joystick`, `#joystick-knob`, `#attrib`)는 React `WorldLayer.tsx` 가 깔아 둔다. 위치·크기 조정은 `app.css`, 모양은 `style.css`.
- 지금 `style.css` 에 남아 있는 옛 HUD 규칙(`.panel`, `.panel-head`, `.pill`, `.title-pill`, `#landmarks`, `#help`, `#loading*`)은 메뉴 층에서 그 이름을 쓰지 않는 한 영향 없다. 메뉴 쪽에서 이 이름들을 다시 쓰지 말 것.

## 3D ↔ 메뉴 연결
- 3D 쪽이 메뉴에 주는 기능은 `useWorld().api`(`landmarks`, `goToLandmark`, `goToPlace`, `setMarkers`, `setBeacons`, `setTimeOfDay`, `setRemotePlayers`, `teleport`, `getPose`, `dispose`)뿐이다. `WorldCanvas` 가 장면이 준비되면 채운다. 기능을 늘리면 `src/main.d.ts` 도 같이 고친다.
- React `StrictMode` 는 쓰지 않는다 (3D가 두 번 생김). `Player` 는 `dispose()` 로 입력 리스너를 모두 지운다 — 새 입력 리스너는 `Player` 의 `on()` 도우미로 달 것.
- 구역 파일(`src/zones/*.js`)은 `buildWorld.js` 가 `import.meta.glob('../zones/*.js')` 로 불러온다.
- 3D 좌표: 원점 = 사자상, x = 동, z = 남 (m). 계약 문서의 ORIGIN(`37.5561486, 127.044341`)과 `src/app/map/geo.ts`·`world.json` 이 모두 같다(확정). 위경도 ↔ 3D 변환은 `geo.ts` 의 `toLocal`/`toLatLng` 만 쓴다.

## 환경변수 (.env 관리)
- 로컬 `npm run dev` 는 `.env.development`(공개 값만: 카카오 JS 키·구글 클라이언트 ID·`VITE_API_BASE=http://localhost:8080`)를 읽는다. 배포(Vercel)는 프로젝트 환경변수만 쓴다. `.env`·`.env.local` 은 git 에 안 올라간다 — 개인 설정은 `.env.local`.
- 비밀 값(구글 클라이언트 보안 비밀번호·토큰·DB 비밀번호)은 어떤 `.env*` 에도 넣지 않는다. `VITE_` 로 시작하는 값은 번들에 들어가 누구나 볼 수 있다.

## 서버 연결
- `VITE_API_BASE`(기본 `http://localhost:8080`)로 실서버에 바로 붙는다. 백엔드가 아직 일부 API만 구현했으므로 **`?mock=1`(또는 `VITE_USE_MOCK=true`)로 개발용 목 서버**(`src/mock/`, 계약 전 엔드포인트·메모리 상태·`MOCK` 배지)를 켜서 모든 탭을 볼 수 있다. 목은 동적 import 라 평소 번들에 안 들어간다. 아직 없는 API(검색·찜·비교 등)는 실패해도 화면이 깨지지 않게 빈 상태/오류 문구로 처리한다.
- 계약 타입은 `src/api/types.ts` 한 곳, 호출은 `src/api/client.ts`(`api<T>()`), 서버 상태는 TanStack Query(`src/app/features/*.ts`), 로그인은 `src/app/state/session.ts`.
- 로그인: `VITE_GOOGLE_CLIENT_ID` 가 있으면 구글 버튼(`src/app/auth/`)이 뜨고 ID 토큰을 `POST /auth/google` 로 보낸다(도메인 검증은 서버). 화면 로그인은 구글뿐이다(키가 없으면 '로그인을 쓸 수 없어요' 안내). 메일 코드 인증(`/auth/email/*`)은 서버에만 남겨 둔다 — `final-qa.mjs`·백엔드 테스트가 그 길로 로그인한다.
- 금액은 서버가 원, 화면은 만원(`src/lib/money.ts`). `null` 은 "정보 없음"으로 보여주고 0으로 바꾸지 않는다.

## 기능 위치
- 탭 패널: `ListingsPanel`(집 찾기·상세·판결), `DormPanel`, `HousingPanel`(단지·공고 캘린더), `FavoritesPanel`, `CampusTourPanel`. 3D 말풍선은 `ListingMarkers`·`PlaceMarkers` 가 `api.setMarkers(items, group)` 로 올린다.
- 후기 `ReviewSection`, 내 집 기록·월간 리포트·만료 알림 `MyHomePanel`, 양도 `TransferPanel`(+`AddressPicker`, `TransferMarkers`), 알림함 `InboxPanel`(상단 종 아이콘+안 읽은 개수). 판결 카드는 `VerdictCard` 하나를 매물·양도가 같이 쓴다. 서버 훅은 `features/more.ts`(후기·내 집·알림·양도), `features/catalog.ts`(기숙사·단지·프로필).
- 3D 부가 표시는 `WorldEffects` 한 곳(시간대 조명 `api.setTimeOfDay`·내 과 건물·선택한 집 주변 시설·모집 중 단지 빛 기둥 `api.setBeacons`). 시간대는 상단바 슬라이더(왼쪽 낮 ~ 오른쪽 밤, `useUi.timeOfDay` 0~1)이고 `src/world/timeOfDay.ts` 의 `lightAt`(보간)·`starsAt`(별)·`clockLabel`(시각)을 쓴다. 아이콘은 모두 `lucide-react`, 3D 말풍선처럼 DOM 에 직접 넣는 곳은 `src/app/icons.tsx` 의 SVG 문자열을 쓴다.
- 실내 3D: `src/interior/` — `buildInterior`(평면도→벽 조각, 순수 함수)·`InteriorScene`(별도 Canvas). 들어가면 동네 Canvas 는 멈추고(`frameloop never`) 나오면 그 자리 그대로.
- 멀티플레이: `src/net/` — `worldReducer`·`interpolate`(순수)·`worldSocket`(재접속·10Hz)·`useMultiplayer`(3D 에 `api.setRemotePlayers`). `?solo` 를 붙이면 접속 안 함, `?invite=` 는 접속 후 주소에서 지운다.

## 고도화 기능 위치 (2026-11-07)
- 폼 부품: `src/app/forms/`(Field·UnitInput·Segmented·ChipSelect·PhotoGrid·FormSection·StickyActions, 환산 월세 `calc.ts`). 새 폼은 이 부품으로 만든다(세로 한 줄 쌓기 금지, 섹션·2열·단위 접미사·하단 고정 버튼).
- 용의자 파일·판결·수배 전단·비교: `src/app/dossier/`(`DossierCard`·`ExcessGauge`·`WantedFlyer`·`CompareSection`, 순수 로직 `dossierLogic.ts`).
- 입구·정문·문 앞 실내 진입·가로등: `src/world/`(`campus.ts`·`doors.ts`·`streetlamps.ts`·`worldExtras.js`). 가로등은 품질 프리셋 `streetlamps`(low 에서 끔).
- 캐릭터 꾸미기: `src/world/avatar.ts` + `src/app/avatar/`. 내 화면에만 적용(서버 계약에 `look` 필드 없음).
- 실내 3D: `src/interior/`(`Room3D`·`Walker`·`furnish`·`trim`·`pins`). 실내 후기 핀 좌표 규칙은 `pins.ts` 상단 주석(계약과 맞춰야 함).

## 성능 측정 (캡처 없이 숫자만)
- `node scripts/perf.mjs "q=med"` — draw call/삼각형/프레임/외부 요청. dev 서버(5173)가 떠 있어야 한다. 기준값은 `scripts/perf-baseline.json`.
- draw call 200 이하 목표는 폐기했다(더 줄이지 않는다). `perf-baseline.json` 은 회귀 감시용.
- 텍스처는 `public/tex` 합계 12MB 이하·한 변 1024px(노멀·러프니스 512) 이하 — `npm test` 가 지킨다. 줄이는 도구: `node scripts/shrink-textures.mjs`.

## 배포 (Vercel)
- `vercel.json` 준비됨(Vite, `dist`, 정적 자원 캐시). 저장소를 Vercel 에 불러오면 그대로 빌드된다.
- Vercel 프로젝트 환경변수(Production·Preview 모두): `VITE_API_BASE`(백엔드 주소), `VITE_KAKAO_JS_KEY`, `VITE_GOOGLE_CLIENT_ID`. 값은 `.env.example` 참고. `VITE_` 변수는 빌드 때 번들에 들어가므로 바꾸면 다시 배포해야 한다.
- 배포 주소가 생기면: 카카오 콘솔(JS SDK 도메인)과 구글 콘솔(승인된 JavaScript 원본), 백엔드 `CORS_ALLOWED_ORIGINS` 에 그 주소를 추가한다. `/privacy.html`, `/terms.html` 은 구글 OAuth 게시 URL 로 쓴다.

## 실행
- `npm run dev` → http://localhost:5173 (백엔드 CORS 허용 포트)
- `npm test` (Vitest), `npm run typecheck`, `npm run build`
