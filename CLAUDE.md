# frontend 작업 규칙 (3D 세션·메뉴 세션 공통)

화면은 두 층이다.
- **3D 층**: R3F `<Canvas>` (`src/world/WorldCanvas.tsx`). 장면 내용은 `src/world/buildWorld.js` 가 만들고, 후처리(GTAO)·라벨은 `WorldCanvas` 안의 `Post` 가 그린다. 타입은 `src/main.d.ts`·`src/world/buildWorld.d.ts`. 스타일은 `src/style.css`. (`?classic=1` 이면 예전 순수 three.js 경로 `src/main.js` 의 `initWorld` — 육안 확인 뒤 삭제 예정)
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
- 3D 쪽이 메뉴에 주는 기능은 `useWorld().api`(`landmarks`, `goToLandmark`, `teleport`, `getPose`, `dispose`)뿐이다. `WorldCanvas` 가 장면이 준비되면 채운다. 기능을 늘리면 `src/main.d.ts` 도 같이 고친다.
- React `StrictMode` 는 쓰지 않는다 (3D가 두 번 생김). `Player` 는 `dispose()` 로 입력 리스너를 모두 지운다 — 새 입력 리스너는 `Player` 의 `on()` 도우미로 달 것.
- 구역 파일(`src/zones/*.js`)은 `buildWorld.js` 가 `import.meta.glob('../zones/*.js')` 로 불러온다.
- 3D 좌표: 원점 = 사자상, x = 동, z = 남 (m). 계약 문서의 ORIGIN(정문 임시값)과 아직 다르다 → 매물 위경도를 붙일 때 맞출 것.

## 성능 측정 (캡처 없이 숫자만)
- `node scripts/perf.mjs "q=med"` — draw call/삼각형/프레임/외부 요청. dev 서버(5173)가 떠 있어야 한다. 기준값은 `scripts/perf-baseline.json`.
- 텍스처는 `public/tex` 합계 12MB 이하·한 변 1024px(노멀·러프니스 512) 이하 — `npm test` 가 지킨다. 줄이는 도구: `node scripts/shrink-textures.mjs`.

## 실행
- `npm run dev` → http://localhost:5173 (백엔드 CORS 허용 포트)
- `npm test` (Vitest), `npm run typecheck`, `npm run build`
