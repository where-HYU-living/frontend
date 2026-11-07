# 3D 성능 개선 + R3F 이식 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 건물 모양을 바꾸지 않고 3D 월드를 가볍게 만들고(A단계), 그 구조를 그대로 React Three Fiber 위로 옮긴다(B단계).

**Architecture:** A단계는 지금의 순수 three.js 코드(`src/main.js` 등)에 품질 프리셋·텍스처 축소·LOD·구역 지연 로딩을 넣는다. B단계는 `bootScene`을 렌더러와 무관한 `buildWorld()`로 쪼개고, R3F `<Canvas>` 안에서 그 결과를 `<primitive>`로 올린다. 기존 `initWorld` 경로는 `?r3f=1` 플래그로 새 경로와 나란히 두고, 수치·테스트와 사용자 육안 확인을 통과한 뒤에만 지운다.

**Tech Stack:** three 0.180, React 18.3, `@react-three/fiber@^8`(React 18용), `@react-three/drei@^9`, Vite 6, Vitest, playwright-core, sharp, image-size

**Spec:** 별도 스펙 문서 없음. 근거는 이 대화의 측정·합의와 `docs/docs/frontend-3d-plan.md`(R3F 계획, 현재 코드와 어긋남), `frontend/CLAUDE.md`(3D층/메뉴층 규칙).

## Global Constraints
- 건물·랜드마크·길·옹벽·계단 모양은 바꾸지 않는다. 나무는 모양이 조금 망가져도 된다.
- 나무는 원래보다 20% 적게 (`TREE_CUT = 0.2`, `src/trees.js`에 적용 완료. 1,521 → 1,227그루).
- 앱이 실행 중 받는 외부 네트워크 요청은 0개 (현재 유일한 외부 요청은 jsdelivr의 Pretendard).
- `public/tex` 총 용량 ≤ 12MB (현재 약 32MB), 텍스처 한 변 ≤ 1024px (노멀·러프니스 ≤ 512px).
- `src/app/`(메뉴층)의 클래스는 `ui-`, CSS 변수는 `--ui-*`, 3D층 새 클래스는 `w3d-` 접두사 (`frontend/CLAUDE.md`).
- React `StrictMode`는 쓰지 않는다 (3D가 두 번 생김).
- `initWorld`가 돌려주는 `WorldApi`(`landmarks`, `goToLandmark`, `teleport`, `getPose`, `dispose`)의 형태는 유지한다. 바꾸면 `src/main.d.ts`도 같이 고친다.
- 좌표: 원점 = 사자상, x = 동, z = 남 (m).
- 구역 플러그인(`src/zones/*.js`)의 모양 코드는 건드리지 않는다. 이 계획이 구역 파일에서 바꾸는 것은 `STEP` 상수(Task 5)와 `manifest` export 추가(Task 8)뿐이다.
- 스크린샷 캡처·이미지 비교는 하지 않는다 (사용자 요청). 모양 확인은 수치(`scripts/perf.mjs`), 테스트, 그리고 각 단계 끝에 사용자가 브라우저에서 직접 보는 것으로 한다.
- 속도 목표는 Task 0이 기준값을 기록한 뒤 `scripts/perf-budget.json`에 정한다: 한 프레임 draw call과 삼각형을 각각 기준 대비 30% 이상 줄인다.

## Review Focus
- **R3F 언마운트·HMR 재마운트:** `Player`가 `window`에 단 키보드 리스너를 지우지 않아 재마운트마다 입력이 두 번씩 먹는다 → Task 11 테스트
- **아직 로드 안 된 구역의 건물로 걸어 들어가기:** 충돌은 `world.buildings` 다각형이 맡으므로 통과하면 안 된다 → Task 8 테스트
- **구역 로드 전에 그 구역 랜드마크로 이동:** 빈 땅 위에 서면 안 되고, 해당 구역이 로드될 때까지 기다린 뒤 이동한다 → Task 8 테스트
- **검색창(`INPUT`)에 글자를 칠 때 캐릭터가 움직임:** 입력 중에는 이동 키를 무시해야 한다 → Task 11 테스트
- **WebGL 컨텍스트 소실·브라우저 창 크기/모니터 DPR 변경:** 장면이 깨지지 않거나, 오류 메시지가 로딩 화면에 보여야 한다 → Task 12 테스트

---

## 파일 구조
```
frontend/
├── scripts/
│   ├── perf.mjs              # 로드 시간·프레임·draw call·삼각형 JSON 출력
│   ├── shrink-textures.mjs   # public/tex 축소 (sharp)
│   ├── bake-zone-manifest.mjs# 구역 manifest 추출 (playwright)
│   └── perf-budget.json      # 속도 목표 (Task 0 기준값에서 계산)
├── src/
│   ├── quality.ts            # 품질 프리셋 (high/med/low) 선택 — 순수 함수
│   ├── perf/stats.ts         # 프레임 시간 통계 — 순수 함수
│   ├── treeLod.ts            # 나무 LOD 단계 선택 — 순수 함수
│   ├── terrainMesh.ts        # 지형 메시용 격자 다운샘플 — 순수 함수
│   ├── zones/manifest.json   # 구역별 skipIds·clear·plazas·footprints·center (구워둔 값)
│   ├── zoneLoader.ts         # 구역을 가까운 순서로 불러오는 스케줄러
│   ├── world/                # (B단계) buildWorld.js, WorldCanvas.tsx, World.tsx, PlayerRig.tsx, Composer.tsx, Labels.tsx
│   └── main.js               # (A단계까지 유지, Task 13에서 initWorld 제거)
```

---

# A단계 — 지금 코드에서 가볍게

### Task 0: 수치 측정 도구

**Files:**
- Create: `src/perf/stats.ts`, `scripts/perf.mjs`
- Modify: `src/main.js` (`window.__proto`에 `composer` 추가, 렌더 루프에서 프레임 시간 기록), 
- Test: `src/perf/stats.test.ts`

**Interfaces:**
- Produces:
  - `summarizeFrames(ms: number[]): { p50: number; p95: number; fps: number }` — `fps = 1000 / p50`, 빈 배열이면 전부 `0`
  - `window.__proto.frameMs: number[]` — 최근 240프레임의 프레임 간격
  - `node scripts/perf.mjs [query]` — `{ loadMs, p50, p95, fps, callsPerFrame, trisPerFrame, textures, geometries, requests, external }` JSON 출력. `callsPerFrame`은 `renderer.info.autoReset=false`로 한 프레임 동안 쌓은 값 (그림자·AO 패스 포함)

- [ ] **Step 1: 실패하는 테스트** (`src/perf/stats.test.ts`)
```ts
test('summarizes 60fps frames', () => {
  const r = summarizeFrames(Array(100).fill(16.7));
  expect(r.p50).toBeCloseTo(16.7); expect(r.fps).toBeCloseTo(59.9, 0);
});
test('p95 picks the slow tail', () => {
  const ms = [...Array(95).fill(10), ...Array(5).fill(100)];
  expect(summarizeFrames(ms).p95).toBe(100);
});
test('empty input is all zero', () => expect(summarizeFrames([])).toEqual({ p50: 0, p95: 0, fps: 0 }));
```
- [ ] **Step 2: 실패 확인** — `npx vitest run src/perf` → FAIL
- [ ] **Step 3: `summarizeFrames` 구현.** 정렬 후 백분위 (인덱스 `floor(n*q)`, 상한 `n-1`).
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS
- [ ] **Step 5: `scripts/perf.mjs` 작성.** 뷰포트 1280×800, DPR 1, `window.__ready` 후 2초 대기. 화면 캡처는 하지 않고 숫자만 출력한다.
- [ ] **Step 6: 기준값 기록** — dev 서버(5173) 실행 상태에서
  - `node scripts/perf.mjs > scripts/perf-baseline.json`
  - `scripts/perf-budget.json`에 `{ "callsPerFrame": <기준×0.7 올림>, "trisPerFrame": <기준×0.7 올림>, "externalRequests": 0, "texBytes": 12000000 }` 작성
- [ ] **Step 7: 커밋** — `git add scripts src/perf src/main.js package.json package-lock.json && git commit -m "chore(perf): frame stats and perf probe"`

---

### Task 1: 폰트 로컬 번들 (외부 요청 제거)

**Files:**
- Modify: `index.html` (jsdelivr `<link>` 삭제), `src/app/main.tsx` (CSS import 추가), `package.json` (`pretendard` 의존성)
- Test: `src/app/__tests__/noExternal.test.ts`

**Interfaces:** Produces: 없음 (스타일 이름 `Pretendard`는 그대로).

- [ ] **Step 1: 실패하는 테스트**
```ts
import { readFileSync } from 'node:fs';
test('index.html loads nothing from the network', () => {
  const html = readFileSync('index.html', 'utf8');
  expect(html).not.toMatch(/https?:\/\//);
});
test('no source file hardcodes an external url', () => {
  // src/** 의 .css/.tsx/.ts/.js 중 'https?://cdn' 또는 'googleapis' 포함 파일 목록이 비어 있다
});
```
(두 번째 테스트는 `readdirSync(…, { recursive: true })`로 파일을 훑어 정규식 `/https?:\/\/(cdn|fonts)/`에 걸리는 파일을 모은다. `style.css`의 주석 안 URL은 없는지 확인한다.)
- [ ] **Step 2: 실패 확인** — `npx vitest run src/app/__tests__/noExternal.test.ts` → FAIL
- [ ] **Step 3: 구현** — `npm i pretendard`, `src/app/main.tsx` 맨 위에 `import 'pretendard/dist/web/static/pretendard.css';`, `index.html`의 `<link>` 삭제. `font-family` 이름이 Pretendard로 같은지 `style.css`/`app.css`에서 확인.
- [ ] **Step 4: 통과 확인** → PASS. 이어서 `node scripts/perf.mjs`의 `external`이 `[]`인지 확인.
- [ ] **Step 5: 커밋** — `git commit -m "perf: bundle Pretendard locally, no external requests"`

---

### Task 2: 텍스처 축소

**Files:**
- Create: `scripts/shrink-textures.mjs`
- Modify: `public/tex/*.jpg` (재생성), `package.json` (devDependencies `sharp`, `image-size`)
- Test: `src/tex.budget.test.ts`

**Interfaces:** Produces: `node scripts/shrink-textures.mjs` — `public/tex/*.jpg` 중 `_diff`는 한 변 1024 초과 시 1024로, `_nor`·`_rough`는 512 초과 시 512로 줄이고 JPEG 품질 80으로 다시 저장. 이미 작으면 건드리지 않는다(여러 번 돌려도 같은 결과). 원본은 `git`에 남아 있으므로 별도 백업 불필요.

- [ ] **Step 1: 실패하는 테스트**
```ts
test('texture folder stays under 12MB', () => { expect(totalBytes('public/tex')).toBeLessThanOrEqual(12_000_000); });
test('diffuse maps are at most 1024px', () => { for (const f of files('_diff')) expect(Math.max(w(f), h(f))).toBeLessThanOrEqual(1024); });
test('normal and roughness maps are at most 512px', () => { for (const f of [...files('_nor'), ...files('_rough')]) expect(Math.max(w(f), h(f))).toBeLessThanOrEqual(512); });
```
- [ ] **Step 2: 실패 확인** — `npx vitest run src/tex.budget.test.ts` → FAIL (현재 약 32MB)
- [ ] **Step 3: 스크립트 작성·실행** — `node scripts/shrink-textures.mjs`
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 사용자 확인** — dev 서버에서 사용자가 바닥·벽·도로 질감이 눈에 띄게 뭉개지지 않았는지 본다. 뭉개졌다면 `_nor`·`_rough`만 768로 올려 다시 돌린다.
- [ ] **Step 6: 커밋** — `git commit -m "perf: shrink textures to <=12MB"`

(KTX2/Basis 압축은 이 계획에서 뺀다: GPU 메모리는 줄지만 인코더 도구 체인이 필요하고, 위 축소만으로 다운로드·디코드 비용은 크게 준다. 필요하면 별도 계획.)

---

### Task 3: 품질 프리셋 + 그림자 비용 절감

**Files:**
- Create: `src/quality.ts`
- Modify: `src/main.js` (렌더러·그림자 설정을 프리셋에서 읽음, `window.__proto.quality` 노출), `src/trees.js` (나무 메시 `castShadow` 프리셋 반영)
- Test: `src/quality.test.ts`

**Interfaces:**
- Produces:
```ts
export type Quality = {
  name: 'high' | 'med' | 'low';
  pixelRatio: number;      // renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatio))
  shadowMap: number;       // 2048 | 1024 | 512
  treeShadows: boolean;    // 나무 InstancedMesh.castShadow
  ao: 'full' | 'half' | 'off';
  msaa: 0 | 4;            // Task 7
};
export function pickQuality(i: { search: string; dpr: number; cores: number; mobile: boolean }): Quality;
```
- 규칙: `?q=high|med|low`가 있으면 그것. 없으면 `mobile` 또는 `cores<=4`면 `low`, `dpr>=2` 또는 `cores<=8`이면 `med`, 아니면 `high`. 프리셋 값은 `high={1.5, 2048, true, 'full', 4}`, `med={1.25, 1024, false, 'half', 0}`, `low={1, 512, false, 'off', 0}`.

- [ ] **Step 1: 실패하는 테스트**
```ts
test('explicit ?q wins', () => expect(pickQuality({ search: '?q=low', dpr: 1, cores: 16, mobile: false }).name).toBe('low'));
test('mobile defaults to low', () => expect(pickQuality({ search: '', dpr: 3, cores: 8, mobile: true }).name).toBe('low'));
test('retina laptop defaults to med', () => expect(pickQuality({ search: '', dpr: 2, cores: 10, mobile: false }).name).toBe('med'));
test('big desktop defaults to high', () => expect(pickQuality({ search: '', dpr: 1, cores: 16, mobile: false }).name).toBe('high'));
test('med has no tree shadows and 1024 shadow map', () => {
  const q = pickQuality({ search: '?q=med', dpr: 1, cores: 8, mobile: false });
  expect([q.treeShadows, q.shadowMap]).toEqual([false, 1024]);
});
test('unknown q falls back to auto', () => expect(pickQuality({ search: '?q=ultra', dpr: 1, cores: 16, mobile: false }).name).toBe('high'));
```
- [ ] **Step 2: 실패 확인** — `npx vitest run src/quality.test.ts` → FAIL
- [ ] **Step 3: `pickQuality` 구현** (위 규칙·프리셋 값 그대로).
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: `main.js` 연결** — `setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio))`, `sun.shadow.mapSize.set(q.shadowMap, q.shadowMap)`, `trees.js`의 `mesh.castShadow = q.treeShadows` (`makeTrees`에 `quality` 인자 추가). `high`는 지금과 같은 모양이어야 한다.
- [ ] **Step 6: 확인** — `node scripts/perf.mjs "q=med"`의 `callsPerFrame`이 기준보다 줄었는지 확인. `?q=high`는 지금과 같은 설정이어야 하므로 `callsPerFrame`이 기준과 같거나 나무 그림자 때문에 거의 같다.
- [ ] **Step 7: 커밋** — `git commit -m "perf: quality presets (pixel ratio, shadow map, tree shadows)"`

---

### Task 4: GTAO 비용 절감

**Files:**
- Modify: `src/main.js` (후처리 구성 부분, `useAO`)

**Interfaces:** Consumes: Task 3 `Quality.ao`. 동작: `'off'` → `composer` 없이 `renderer.render` (기존 `?noao`와 같음, `?noao`는 계속 동작). `'half'` → GTAOPass를 `setSize(innerWidth/2, innerHeight/2)`로 만들고 리사이즈 때도 같은 비율 적용. `'full'` → 지금과 같음.

- [ ] **Step 1: 구현** — 리사이즈 핸들러(`onComposerResize`)에서 `ao.setSize`도 같은 비율로 부른다.
- [ ] **Step 2: 사용자 확인** — `?q=med`에서 처마·계단 틈 그늘이 조금 약해지는 정도인지, 건물 윤곽이 무너진 곳이 없는지 사용자가 본다.
- [ ] **Step 3: 속도 확인** — `node scripts/perf.mjs "q=med"`와 `"q=low"`의 `trisPerFrame`이 `q=high`보다 작은지 확인 (AO가 장면을 다시 그리는 패스가 빠짐).
- [ ] **Step 4: 커밋** — `git commit -m "perf: half-res / off GTAO by quality preset"`

---

### Task 5: 지형 메시와 도로 삼각형 축소

**Files:**
- Create: `src/terrainMesh.ts`
- Modify: `src/terrain.js` (`makeTerrain`의 메시 격자), `src/zones/roads.js:14` (`STEP`)
- Test: `src/terrainMesh.test.ts`

**Interfaces:**
- Produces:
```ts
export type Terrain = { step: number; w: number; h: number; minX: number; minZ: number; data: ArrayLike<number> };
export function downsampleTerrain(t: Terrain, factor: number): Terrain; // factor 2 → step ×2, 격자점 = 원본의 짝수 칸 샘플
export function maxDeviation(full: Terrain, coarse: Terrain): number;    // 거친 격자를 쌍선형 보간한 값과 원본 격자점 차이의 최댓값 (m)
```
- 메시만 거친 격자를 쓴다. `heightAt`(충돌·건물 높이)은 원본 격자 그대로 둔다.

- [ ] **Step 1: 실패하는 테스트**
```ts
test('factor 2 halves the grid and doubles step', () => {
  const t = flatTerrain(9, 7, 2); const c = downsampleTerrain(t, 2);
  expect([c.w, c.h, c.step]).toEqual([5, 4, 4]);
});
test('flat terrain has zero deviation', () => expect(maxDeviation(flatTerrain(9, 7, 2), downsampleTerrain(flatTerrain(9, 7, 2), 2))).toBe(0));
test('real campus terrain deviates under 0.5m at factor 2', () => {
  const t = JSON.parse(readFileSync('public/world.json', 'utf8')).terrain;
  expect(maxDeviation(t, downsampleTerrain(t, 2))).toBeLessThan(0.5);
});
```
- [ ] **Step 2: 실패 확인** — `npx vitest run src/terrainMesh.test.ts` → FAIL
- [ ] **Step 3: 구현** — 마지막 열·행이 짝수 칸에 안 떨어지면 마지막 점을 포함해 덮는다 (`w = ceil((w-1)/factor)+1`).
- [ ] **Step 4: 통과 확인** → PASS. 세 번째 테스트가 실패하면 편차가 큰 곳이 있다는 뜻이므로 `factor` 대신 3으로 낮추지 말고 편차 상위 위치를 출력해 사용자에게 보고한다.
- [ ] **Step 5: 적용** — `makeTerrain`의 `PlaneGeometry`/`setY`를 `downsampleTerrain(t, 2)` 기반으로 바꾼다. 셰이더 UV 계산(`vSUv`, `uTile`)이 `sizeX/sizeZ` 기준이라 바뀌지 않는지 확인. `roads.js`의 `STEP`을 `2.5`에서 `4`로 올린다.
- [ ] **Step 6: 확인** — `node scripts/perf.mjs`의 `trisPerFrame` 감소 확인. 사용자가 `?go=209`, `?go=102`에서 도로가 건물 기단·옹벽 위로 뜨거나 파묻히지 않았는지 본다.
- [ ] **Step 7: 커밋** — `git commit -m "perf: coarser terrain mesh and road sampling"`

---

### Task 6: 나무 거리별 LOD

**Files:**
- Create: `src/treeLod.ts`
- Modify: `src/trees.js` (`buildSpecies(kind, seed, density = 1)`, 칸마다 LOD별 InstancedMesh, `update(camPos)`), `src/main.js` (렌더 루프에서 `trees.update(camera.position)`을 0.25초마다 호출)
- Test: `src/treeLod.test.ts`

**Interfaces:**
- Produces:
```ts
export const LOD_NEAR = 140, LOD_FAR = 420;         // m, 칸 중심~카메라 거리
export type TreeLod = 0 | 1 | 2;                    // 0=원본, 1=카드 밀도 0.5, 2=숨김
export function lodFor(dist: number, prev?: TreeLod): TreeLod; // 경계에서 깜빡이지 않게 ±12m 여유(히스테리시스)
```
- `trees.js`: `makeTrees(...)`가 돌려주는 객체에 `update(camPos: THREE.Vector3): void` 추가. LOD1용 지오메트리는 `buildSpecies(kind, seed, 0.5)` (퍼프마다 카드 수 `n`에 `density`를 곱해 올림). 칸(260m)마다 LOD0/LOD1 메시를 둘 다 만들고 `visible`만 바꾼다.

- [ ] **Step 1: 실패하는 테스트**
```ts
test('near is lod 0', () => expect(lodFor(50)).toBe(0));
test('mid is lod 1', () => expect(lodFor(200)).toBe(1));
test('far is hidden', () => expect(lodFor(600)).toBe(2));
test('hysteresis keeps lod 0 just past the near edge', () => expect(lodFor(LOD_NEAR + 5, 0)).toBe(0));
test('hysteresis lets go past the margin', () => expect(lodFor(LOD_NEAR + 20, 0)).toBe(1));
test('coming back needs to cross the margin too', () => expect(lodFor(LOD_NEAR - 5, 1)).toBe(1));
```
- [ ] **Step 2: 실패 확인** — `npx vitest run src/treeLod.test.ts` → FAIL
- [ ] **Step 3: `lodFor` 구현.**
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: `trees.js` 연결** — 칸 중심은 해당 칸 나무 좌표의 평균. 숨김(LOD2)은 안개 때문에 거의 안 보이는 거리다. `treeSpots`(꽃잎 위치)는 LOD와 무관하게 유지.
- [ ] **Step 6: 확인** — `perf.mjs`의 `trisPerFrame` 감소 확인. 사용자가 도시를 내려다보는 `?cam=0,0,0,0,300,0.9`에서 나무가 갑자기 사라지는 선이 거슬리는지 본다.
- [ ] **Step 7: 커밋** — `git commit -m "perf: distance LOD for tree cells"`

---

### Task 7: 나뭇잎 가장자리 반짝임 완화 (high 프리셋만)

가설: 잎은 `alphaTest`로 오려낸 카드인데 후처리 렌더 타깃에 멀티샘플링이 없어서 가장자리가 반짝인다. 측정 도구 없이 확인할 수 없으므로 `high`에만 넣고 사용자가 판단한다.

**Files:**
- Modify: `src/main.js` (EffectComposer 렌더 타깃 `samples`), `src/trees.js` (재질 `alphaToCoverage`)

**Interfaces:** Consumes: Task 3 `Quality.msaa`. `msaa > 0`일 때만 적용.

- [ ] **Step 1: 구현** — 컴포저 렌더 타깃을 `new WebGLRenderTarget(w, h, { samples: q.msaa, type: HalfFloatType })`로 만들어 `EffectComposer(renderer, target)`에 넘기고, 나무 재질에 `alphaToCoverage: true`. `med`·`low`는 그대로.
- [ ] **Step 2: 확인** — `node scripts/perf.mjs "q=high"`의 `p50`이 적용 전 대비 +20% 이내인지 확인. 사용자가 `?q=high`와 `?q=med`에서 숲 속을 걸으며 반짝임이 줄었는지 판단한다. 안 줄었으면 되돌린다.
- [ ] **Step 3: 커밋** — `git commit -m "perf: alpha-to-coverage + MSAA for tree leaves on high preset"`

---

### Task 8: 구역 지연 로딩

현재 모든 구역(`src/zones/*.js` 5개)이 시작할 때 한꺼번에 만들어진다. 구역마다 "건물을 제외할 id, 나무를 비울 다각형, 충돌 외곽선"을 미리 구워 두고, 구역 본체는 플레이어와 가까운 순서로 나중에 불러온다.

**Files:**
- Create: `scripts/bake-zone-manifest.mjs`, `src/zones/manifest.json`, `src/zoneLoader.ts`
- Modify: `src/main.js` (`loadZones` → `zoneLoader`, `makeBuildings`/`makeTrees`/충돌 색인이 manifest를 읽음)
- Test: `src/zoneLoader.test.ts`

**Interfaces:**
- Produces:
```ts
export type ZoneManifest = { name: string; center: [number, number]; skipIds: string[]; clear: [number, number][][]; plazas: [number, number][][]; replace: string[] };
export function zoneOrder(zones: ZoneManifest[], from: [number, number]): string[]; // 가까운 순 이름 목록, roads는 항상 마지막
export function createZoneLoader(opts: {
  manifest: ZoneManifest[];
  load: (name: string) => Promise<unknown>;       // 구역 본체 실행
  from: () => [number, number];                   // 현재 플레이어 위치
  concurrency?: number;                           // 기본 2
}): { start(): void; ready(name: string): Promise<void>; isReady(name: string): boolean; zoneAt(x: number, z: number): string | null };
```
- 충돌은 구역 로드와 무관하게 `world.buildings` 다각형으로 만든 색인을 쓴다 (구역 건물의 외곽선도 거기 이미 있다).
- `goToLandmark(key)`는 해당 랜드마크가 속한 구역(`zoneAt`)이 `ready`일 때까지 기다린 뒤 이동한다.

- [ ] **Step 1: 실패하는 테스트**
```ts
test('zones load nearest first, roads last', () => {
  const m = [z('law', [200, 0]), z('eng', [50, 0]), z('roads', [0, 0]), z('hill', [120, 0])];
  expect(zoneOrder(m, [0, 0])).toEqual(['eng', 'hill', 'law', 'roads']);
});
test('loader respects concurrency', async () => { /* load 호출을 지연시켜 동시 실행 수가 2를 넘지 않음 */ });
test('ready resolves after that zone loads', async () => { /* start() 후 await ready('eng') → isReady('eng') true */ });
test('a failing zone does not block the rest', async () => { /* eng가 throw → hill은 로드됨, ready('eng')는 reject하지 않고 resolve */ });
test('roads waits for all other zones', async () => { /* roads 로드 시작 시점에 나머지가 모두 ready */ });
test('player inside an unloaded zone footprint still collides', () => { /* 충돌 색인이 world.buildings 로 만들어졌는지: 구역 건물 id 중 하나의 중심점에서 collide() 가 truthy */ });
```
- [ ] **Step 2: 실패 확인** — `npx vitest run src/zoneLoader.test.ts` → FAIL
- [ ] **Step 3: 구현** — `zoneOrder`, `createZoneLoader` (실패한 구역은 `console.error` 후 ready 처리, 기존 `loadZones`의 개별 try/catch 동작 유지).
- [ ] **Step 4: manifest 굽기** — `scripts/bake-zone-manifest.mjs`: 전체 로드된 현재 앱에서 `window.__proto.zones`를 읽어 구역별 `{name, center(footprints 평균), skipIds, clear, plazas, replace}`를 `src/zones/manifest.json`에 쓴다. 구역 파일에 `export const manifest`를 따로 쓰지 않고 이 JSON을 단일 출처로 삼는다. 구역 코드를 고치면 이 스크립트를 다시 돌린다고 `src/zones/README.md`에 한 줄 추가.
- [ ] **Step 5: `main.js` 연결** — 건물(`makeBuildings`)의 `skip`, 나무의 `blockIdx`, `roads`가 쓰는 `prior`를 manifest에서 읽는다 (구역 본체 실행 결과를 기다리지 않음). 첫 화면은 지형·하늘·길 바탕·주인공 건물(hero)·사자상까지 만들고 `progress(1)`을 보낸 뒤 `zoneLoader.start()`. 구역이 도착하면 기존처럼 `mergeStatic` 후 `buildings`/`scene`에 추가.
- [ ] **Step 6: 확인** — `node scripts/perf.mjs`의 `loadMs`가 기준보다 줄었는지 확인. `window.__zonesReady`가 모든 구역 로드 후 `true`가 되는지 콘솔로 확인. 사용자가 로드 후 몇 초 뒤 구역 건물이 모두 나타나는지 본다.
- [ ] **Step 7: 커밋** — `git commit -m "perf: baked zone manifest, nearest-first lazy zone loading"`

---

### Task 9: A단계 게이트 (예산 확인)

**Files:** Modify: `scripts/perf-baseline.json`

- [ ] **Step 1:** `npm test && npm run typecheck && npm run build` → 모두 성공
- [ ] **Step 2:** `node scripts/perf.mjs "q=med" > /tmp/after.json` → `callsPerFrame`, `trisPerFrame`이 `scripts/perf-budget.json` 이하, `external`이 `[]`, `public/tex` 합계 ≤ 12MB. 하나라도 초과하면 어느 항목인지 보고하고 멈춘다.
- [ ] **Step 3:** 사용자가 `q=med`와 `q=high` 화면을 직접 보고 건물 모양에 이상이 없는지 확인한다. 승인 뒤 다음 단계로.
- [ ] **Step 4: 커밋** — `git commit -m "chore(perf): phase A gate"`

---

# B단계 — R3F로 이식 (모양 그대로)

### Task 10: `buildWorld()` 분리 (동작 변화 없음)

**Files:**
- Create: `src/world/buildWorld.js`
- Modify: `src/main.js` (`bootScene`의 장면 조립 부분을 `buildWorld`로 옮기고 `initWorld`는 그것을 호출), `src/main.d.ts`
- Test: `src/app/__tests__/App.test.tsx` (기존, 변경 없이 통과)

**Interfaces:**
- Produces:
```js
// 렌더러·애니메이션 루프·리사이즈 리스너 없음. 순수하게 장면 내용과 게임 상태만 만든다.
export async function buildWorld(ctx: { camera: THREE.PerspectiveCamera; domElement: HTMLElement; quality: Quality; onProgress?: (p: number) => void }): Promise<{
  scene: THREE.Scene;                 // fog·environment·background 포함 (environment 는 PMREM 이 필요하므로 아래 setupEnvironment 로 분리)
  player: Player; landmarks: Landmark[]; labels: { obj: THREE.Object3D; position: THREE.Vector3 }[];
  sun: THREE.DirectionalLight; sunDir: THREE.Vector3;
  trees: { update(camPos: THREE.Vector3): void; count: number };
  zoneLoader: ReturnType<typeof createZoneLoader>;
  minimap: { drawBase(canvas: HTMLCanvasElement): void };
  api: Omit<WorldApi, 'dispose'>;
}>;
export function setupEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): Promise<void>; // HDR+배경
```
- `initWorld`는 내부에서 이 둘을 불러 기존과 똑같이 동작해야 한다.

- [ ] **Step 1: 확인용 테스트 먼저 돌려 기준 통과 확인** — `npx vitest run src/app` → PASS (변경 전)
- [ ] **Step 2: 분리** — `main.js` 안의 `bootScene` 본문을 `buildWorld.js`로 옮기고, 렌더러 의존 코드(`PMREMGenerator`, `composer`, `setAnimationLoop`, `CSS2DRenderer`, `resize`)만 `main.js`에 남긴다.
- [ ] **Step 3: 확인** — `npx vitest run && npm run typecheck` → PASS. 사용자가 화면이 이전과 같은지 본다 (같은 코드를 옮겼을 뿐이다).
- [ ] **Step 4: 커밋** — `git commit -m "refactor(3d): extract buildWorld from bootScene"`

---

### Task 11: R3F 캔버스와 플레이어 (`?r3f=1`)

**Files:**
- Create: `src/world/WorldCanvas.tsx`, `src/world/World.tsx`, `src/world/PlayerRig.tsx`
- Modify: `package.json` (`@react-three/fiber@^8`, `@react-three/drei@^9`), `src/player.js` (`dispose()` 추가: 단 모든 `window`/`dom` 리스너 제거), `src/app/WorldLayer.tsx` (`?r3f=1`이면 `<WorldCanvas/>`, 아니면 기존)
- Test: `src/player.test.ts`

**Interfaces:**
- Consumes: Task 10 `buildWorld`, `setupEnvironment`
- Produces:
  - `Player#dispose(): void` — 키보드(`keydown`/`keyup`/`blur`), 포인터, 휠, 조이스틱 리스너를 모두 제거
  - `<WorldCanvas />` — `<Canvas gl={{ antialias: true, powerPreference: 'high-performance' }} dpr={[1, quality.pixelRatio]} shadows={{ type: THREE.PCFSoftShadowMap }} camera={{ fov: 55, near: 0.3, far: 3000 }} frameloop="always">`. 톤매핑 ACESFilmic·노출 1.05·sRGB 출력은 `onCreated`에서 설정(지금과 같은 값). 로딩 진행률은 `useWorld.setState({ progress })`로 그대로 전달.
  - `<World world={...} />` — `<primitive object={world.scene} />` 하나. `<PlayerRig player={...} />` — `useFrame((_, dt) => player.update(Math.min(0.05, dt)))`와 태양이 플레이어를 따라가는 갱신(`sun.position.copy(player.pos).addScaledVector(sunDir, 160)`)
- 이식 중 `Player` 클래스(입력·충돌·카메라 따라가기)는 그대로 쓴다. rapier·ecctrl은 도입하지 않는다 (현재 충돌은 다각형 색인 조회 한 번으로 충분하고, wasm과 건물 253개 물리 바디 비용만 는다).

- [ ] **Step 1: 실패하는 테스트** (`src/player.test.ts`, jsdom)
```ts
test('dispose removes keyboard listeners', () => {
  const p = makePlayer(); p.dispose();
  dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  expect(p.keys.size).toBe(0);
});
test('keys typed into an INPUT do not move the player', () => {
  const p = makePlayer(); const input = document.createElement('input'); document.body.append(input);
  input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
  expect(p.keys.size).toBe(0);
});
test('mounting twice then disposing the first leaves one live player', () => {
  const a = makePlayer(), b = makePlayer(); a.dispose();
  dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  expect([a.keys.size, b.keys.size]).toEqual([0, 1]);
});
```
(`makePlayer()`는 `heightAt: () => 0`, `collide: () => null`, `bounds`, 가짜 `dom = document.createElement('canvas')`로 `new Player(...)`를 만든다.)
- [ ] **Step 2: 실패 확인** — `npx vitest run src/player.test.ts` → FAIL (`dispose` 없음; 두 번째 테스트는 `e.target`이 `window`가 아닌 `input`이라 현재 코드가 이미 막는지 확인하고, 이미 통과하면 그대로 회귀 방지용으로 둔다)
- [ ] **Step 3: `Player#dispose` 구현** — 리스너를 생성자에서 이름 있는 함수로 보관해 `removeEventListener`로 지운다.
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: R3F 의존성·컴포넌트 작성** — `npm i @react-three/fiber@^8 @react-three/drei@^9`. `WorldCanvas`는 `buildWorld`가 끝나면 `<World/>`를 렌더하고, 끝나기 전엔 `null` (로딩 화면은 기존 `Loading`이 담당). 언마운트 시 `player.dispose()`.
- [ ] **Step 6: 확인** — `http://localhost:5173/?r3f=1`에서 걷기·마우스 회전·휠 줌·미니맵 클릭이 기존과 같은지 눈으로 확인.
- [ ] **Step 7: 커밋** — `git commit -m "feat(3d): R3F canvas and player rig behind ?r3f=1"`

---

### Task 12: 후처리·라벨·미니맵·환경

**Files:**
- Create: `src/world/Composer.tsx`, `src/world/Labels.tsx`, `src/world/Minimap.tsx`
- Modify: `src/world/WorldCanvas.tsx`
- Test: `src/world/Labels.test.tsx`

**Interfaces:**
- Consumes: Task 3 `Quality`, Task 10 `labels`·`minimap`
- Produces:
  - `<Composer quality />` — `EffectComposer`(RenderPass → GTAOPass → OutputPass, Task 4와 같은 설정·`ao` 모드)를 만들고 `useFrame(() => composer.render(), 1)`로 기본 렌더를 대체한다. `ao === 'off'`면 아무것도 하지 않고 R3F 기본 렌더를 쓴다. `useThree`의 `size`가 바뀌면 `composer.setSize`.
  - `<Labels items />` — drei `<Html position center distanceFactor wrapperClass="w3d-label">`로 랜드마크 라벨을 그린다. 카메라와의 거리가 `320`m를 넘으면 `opacity: 0`. 기존 `makeLabel`의 DOM 모양·클래스 이름 그대로(`style.css`).
  - `<Minimap />` — 기존 `drawMinimap`을 `setInterval(…, 100)`으로 부르고(`useFrame`에서 매 프레임 그리지 않는다), 클릭 → `api.teleport`. 컨텍스트 소실 시 `onCreated`에서 `gl.domElement.addEventListener('webglcontextlost', …)`로 `useWorld.setState({ status: 'error', error: 'WebGL 컨텍스트가 끊겼어요. 새로고침해 주세요' })`.
  - `setupEnvironment(gl, scene)` — 하늘 HDR + 배경 (Task 10 함수)

- [ ] **Step 1: 실패하는 테스트** (`Labels.test.tsx`, drei `Html` 대신 얇은 래퍼를 모킹)
```tsx
test('label hides beyond 320m', () => { expect(labelOpacity(321)).toBe(0); });
test('label shows within 320m', () => { expect(labelOpacity(100)).toBe(1); });
test('webgl context loss sets an error status', () => {
  handleContextLost(); expect(useWorld.getState()).toMatchObject({ status: 'error' });
});
```
(`labelOpacity(dist: number): 0 | 1`, `handleContextLost(): void`는 컴포넌트 밖에 내놓은 순수 함수.)
- [ ] **Step 2: 실패 확인** — `npx vitest run src/world` → FAIL
- [ ] **Step 3: 구현** — 위 컴포넌트·함수 작성. `Labels`는 `CSS2DRenderer`를 대체하므로 R3F 경로에서는 `CSS2DRenderer`를 만들지 않는다.
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 사용자 확인** — `?r3f=1`과 기본 화면을 나란히 열어 톤·그림자·AO·라벨이 같은지 사용자가 본다. 다르면 톤매핑 노출·`outputColorSpace`·`antialias` 설정부터 맞춘다.
- [ ] **Step 6: 커밋** — `git commit -m "feat(3d): R3F composer (GTAO), labels, minimap, context-loss handling"`

---

### Task 13: 기본 경로 교체와 정리

**Files:**
- Modify: `src/app/WorldLayer.tsx` (항상 `<WorldCanvas/>`), `src/app/state/world.ts` (변경 없음 확인), `src/main.js` (`initWorld` 삭제 → 파일 삭제 또는 `export { buildWorld }`만 남김), `src/main.d.ts`, `src/app/__tests__/App.test.tsx` (모킹 경로 변경), `frontend/CLAUDE.md`, `../docs/docs/frontend-3d-plan.md`
- Test: `src/app/__tests__/App.test.tsx`

**Interfaces:**
- `WorldApi`(`landmarks`, `goToLandmark`, `teleport`, `getPose`, `dispose`)는 그대로. `WorldCanvas`가 준비되면 `useWorld.setState({ status: 'ready', api })`를 한다. `dispose()`는 `player.dispose()`와 이벤트 해제만 담당하고, 렌더러 정리는 R3F가 한다.

- [ ] **Step 1: 테스트 수정** — `App.test.tsx`의 `vi.mock('../../main', …)`를 `vi.mock('../../world/WorldCanvas', () => ({ WorldCanvas: () => null }))`로 바꾸고, `useWorld.setState({ status: 'ready', api: fakeApi })`를 테스트에서 직접 호출하도록 `renderReady`를 고친다. 이 변경만으로 기존 테스트 항목(메뉴 탭이 한 번만 나옴 등)이 모두 통과해야 한다.
- [ ] **Step 2: 확인** — `npx vitest run src/app` → PASS
- [ ] **Step 3: 교체** — `WorldLayer`에서 `?r3f` 분기와 `initWorld` 호출 삭제. `main.js`의 `initWorld`·`loadZones`·`bootScene` 중 쓰지 않는 것 삭제 (`git grep initWorld`로 남은 참조가 0개인지 확인).
- [ ] **Step 4: 문서 정리** — `frontend/CLAUDE.md`의 "3D층: `src/main.js`의 `initWorld`" 문장을 "3D층: `src/world/WorldCanvas.tsx`(R3F), 장면 조립은 `src/world/buildWorld.js`"로 고치고, 3D API 설명(`initWorld`가 돌려주는 객체)을 `useWorld().api`로 바꾼다. `../docs/docs/frontend-3d-plan.md` 맨 위에 "현재 구현: R3F `<Canvas>` + 순수 three.js 장면 조립(`buildWorld`). rapier·ecctrl은 도입하지 않음. 이 문서의 파일 구조는 계획이며 실제는 `frontend/CLAUDE.md` 참조" 경고 블록을 추가한다 (docs 저장소는 별도 커밋).
- [ ] **Step 5: 최종 게이트** — `npm test && npm run typecheck && npm run build` 성공. `node scripts/perf.mjs "q=med"`가 `scripts/perf-budget.json` 이하. 브라우저에서 새로고침·탭 전환·검색창 입력(캐릭터가 안 움직임)·미니맵 클릭·랜드마크 이동을 눈으로 확인.
- [ ] **Step 6: 커밋** — frontend: `git commit -m "feat(3d): switch to R3F canvas, remove initWorld"` / docs 저장소: `git commit -m "docs: mark frontend-3d-plan as partially applied (R3F + three scene)"`

---

## 이 계획에서 뺀 것
- rapier·ecctrl: 충돌이 이미 가볍고 wasm·물리 바디 비용만 는다. 실내·멀티플레이 계획(`frontend-3d-plan.md` Task 9·16)에서 필요해지면 그때 다시 본다.
- KTX2/Basis 텍스처: 위 축소로 다운로드·디코드는 줄어든다. GPU 메모리까지 줄이는 압축은 별도 작업.
- 매물 말풍선·실내·멀티플레이: `World.tsx`가 R3F 트리이므로 이후에 `<Markers/>` 같은 컴포넌트로 얹으면 된다.
