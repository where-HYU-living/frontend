# frontend 작업 규칙 (3D 세션·메뉴 세션 공통)

화면은 두 층이다.
- **3D 층**: R3F `<Canvas>` (`src/world/WorldCanvas.tsx`). 장면 내용은 `src/world/buildWorld.js` 가 만들고, 후처리(GTAO)·라벨은 `WorldCanvas` 안의 `Post` 가 그린다. 타입은 `src/main.d.ts`(WorldApi)·`src/world/buildWorld.d.ts`. 스타일은 `src/style.css`.
- **품질 프리셋**: `src/quality.ts` (`?q=high|med|low`, 없으면 기기에 맞춰 자동). 픽셀비·그림자 크기·나무 그림자·GTAO·MSAA 를 정한다. 새 무거운 효과는 프리셋에 넣어서 끌 수 있게 할 것.
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
- 3D 좌표: 원점 = 사자상, x = 동, z = 남 (m). 계약 문서의 ORIGIN(정문 임시값)과 아직 다르다 → 매물 위경도를 붙일 때 맞출 것.

## 서버 연결
- `VITE_API_BASE`(기본 `http://localhost:8080`)로 실서버에 바로 붙는다. 목 서버 없음 — 아직 없는 API(검색·찜·비교 등)는 실패해도 화면이 깨지지 않게 빈 상태/오류 문구로 처리한다.
- 계약 타입은 `src/api/types.ts` 한 곳, 호출은 `src/api/client.ts`(`api<T>()`), 서버 상태는 TanStack Query(`src/app/features/*.ts`), 로그인은 `src/app/state/session.ts`.
- 로그인: `VITE_GOOGLE_CLIENT_ID` 가 있으면 구글 버튼(`src/app/auth/`)이 뜨고 ID 토큰을 `POST /auth/google` 로 보낸다(도메인 검증은 서버). 없으면 메일 코드 인증만.
- 금액은 서버가 원, 화면은 만원(`src/lib/money.ts`). `null` 은 "정보 없음"으로 보여주고 0으로 바꾸지 않는다.

## 기능 위치
- 탭 패널: `ListingsPanel`(집 찾기·상세·판결), `DormPanel`, `HousingPanel`(단지·공고 캘린더), `FavoritesPanel`, `CampusTourPanel`. 3D 말풍선은 `ListingMarkers`·`PlaceMarkers` 가 `api.setMarkers(items, group)` 로 올린다.
- 후기 `ReviewSection`, 내 집 기록·월간 리포트·만료 알림 `MyHomePanel`, 양도 `TransferPanel`(+`AddressPicker`, `TransferMarkers`), 알림함 `InboxPanel`(상단 종 아이콘+안 읽은 개수). 판결 카드는 `VerdictCard` 하나를 매물·양도가 같이 쓴다. 서버 훅은 `features/more.ts`(후기·내 집·알림·양도), `features/catalog.ts`(기숙사·단지·프로필).
- 3D 부가 표시는 `WorldEffects` 한 곳(시간대 조명 `api.setTimeOfDay`·내 과 건물·선택한 집 주변 시설·모집 중 단지 빛 기둥 `api.setBeacons`). 시간대는 상단바 슬라이더(왼쪽 낮 ~ 오른쪽 밤, `useUi.timeOfDay` 0~1)이고 `src/world/timeOfDay.ts` 의 `lightAt`(보간)·`starsAt`(별)·`clockLabel`(시각)을 쓴다. 아이콘은 모두 `lucide-react`, 3D 말풍선처럼 DOM 에 직접 넣는 곳은 `src/app/icons.tsx` 의 SVG 문자열을 쓴다.
- 실내 3D: `src/interior/` — `buildInterior`(평면도→벽 조각, 순수 함수)·`InteriorScene`(별도 Canvas). 들어가면 동네 Canvas 는 멈추고(`frameloop never`) 나오면 그 자리 그대로.
- 멀티플레이: `src/net/` — `worldReducer`·`interpolate`(순수)·`worldSocket`(재접속·10Hz)·`useMultiplayer`(3D 에 `api.setRemotePlayers`). `?solo` 를 붙이면 접속 안 함, `?invite=` 는 접속 후 주소에서 지운다.

## 성능 측정 (캡처 없이 숫자만)
- `node scripts/perf.mjs "q=med"` — draw call/삼각형/프레임/외부 요청. dev 서버(5173)가 떠 있어야 한다. 기준값은 `scripts/perf-baseline.json`.
- 텍스처는 `public/tex` 합계 12MB 이하·한 변 1024px(노멀·러프니스 512) 이하 — `npm test` 가 지킨다. 줄이는 도구: `node scripts/shrink-textures.mjs`.

## 배포 (Vercel)
- `vercel.json` 준비됨(Vite, `dist`, 정적 자원 캐시). 저장소를 Vercel 에 불러오면 그대로 빌드된다.
- Vercel 프로젝트 환경변수(Production·Preview 모두): `VITE_API_BASE`(백엔드 주소), `VITE_KAKAO_JS_KEY`, `VITE_GOOGLE_CLIENT_ID`. 값은 `.env.example` 참고. `VITE_` 변수는 빌드 때 번들에 들어가므로 바꾸면 다시 배포해야 한다.
- 배포 주소가 생기면: 카카오 콘솔(JS SDK 도메인)과 구글 콘솔(승인된 JavaScript 원본), 백엔드 `CORS_ALLOWED_ORIGINS` 에 그 주소를 추가한다. `/privacy.html`, `/terms.html` 은 구글 OAuth 게시 URL 로 쓴다.

## 실행
- `npm run dev` → http://localhost:5173 (백엔드 CORS 허용 포트)
- `npm test` (Vitest), `npm run typecheck`, `npm run build`
