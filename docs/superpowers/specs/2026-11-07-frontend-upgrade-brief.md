# 프론트 고도화 브리프 (2026-11-07)

모든 작업자가 먼저 읽는다. 읽을 것: `frontend/CLAUDE.md`, `docs/docs/spec-v0.5.md`(특히 3·4·5·10장), `docs/docs/api-contract.md`.

## 제품 컨셉 (UI의 기준)
「찾았다. 내 돈을 다 써버린 놈」 — 한양대 **신입생과 부모님**이 3D 동네를 걸으며 집을 **수사**한다.
- 집 = **용의자**. 집 상세 = **용의자 파일**(환산 월세, 적정가, 초과액, 등급). 결과 화면 = **판결 카드**. 초과 등급 "범인" 매물 = **수배 전단**(수치만, 비방·조롱 금지).
- 톤: 수사물 어휘를 살짝 쓰되(사건 번호, 용의자 파일, 증거, 판결) 읽기는 쉽게. 사용자는 서울이 처음인 19살과 그 부모님이다. 농담보다 **숫자가 먼저 보이게**.
- 등급 색·라벨·문구는 계약 2-2장 그대로(`src/lib/grade.ts`). 금액은 서버 원 → 화면 만원(`src/lib/money.ts`), `null` 은 "정보 없음".
- 왼쪽 패널 폭은 364px 안팎의 유리 패널(glass). 모바일(≤640px)에서도 쓸 수 있어야 한다.

## UI 원칙 (지금 가장 큰 불만: 입력칸을 세로로 대충 쌓아 놓음)
- 폼은 **섹션으로 묶는다** (예: 위치 / 금액 / 방 정보 / 계약 / 사진·설명). 섹션마다 작은 제목.
- 짧은 숫자 입력은 **2열 그리드**로, 단위(만원, ㎡, 개월, 층)는 입력칸 **안쪽 오른쪽 접미사**로.
- 방 구조는 `<select>` 가 아니라 **세그먼트 버튼**, 개월은 숫자칸 + 빠른 선택 칩(6/12/18/24), 사진은 **썸네일 격자 + 추가 칸**.
- 제출 버튼은 **하단 고정(sticky)**, 비활성일 때 무엇이 비었는지 한 줄로 알려준다. 입력 중에는 **즉석 요약**(환산 월세 = 월세 + 관리비 + 보증금×0.06÷12)을 보여준다.
- 라벨은 입력칸 위에 작게, 오류는 해당 칸 아래에. 키보드 Tab 순서·`aria-label`·포커스 링 유지(기존 테스트가 `aria-label` 로 찾는다 — 바꾸지 말 것).
- 카드 목록은 정보 위계를 둔다: 등급 배지 + **환산 월세(큰 글씨)** + 초과액 한 줄 + 보조 정보(도보·면적·층).
- 기존 클래스 규칙 준수: 메뉴 층은 `ui-` 접두사, 변수는 `--ui-*`. 3D 층(`style.css`)은 `w3d-` 접두사.

## 공통 규칙 (모두 지킬 것)
- **스크린샷 캡처·이미지 비교 금지.** 확인은 `npm run typecheck`, `npm test`, 수치(`node scripts/perf.mjs`), 사용자 육안.
- **자기 소유 파일만 수정.** 공용 파일(`src/main.d.ts`, `src/app/app.css`, `src/app/state/ui.ts`, `src/api/types.ts`, `src/app/App.tsx`)은 꼭 필요할 때만, **추가만** 하고 편집 직전에 다시 읽는다. 다른 작업자가 같은 시간에 일하고 있다.
- 새 CSS 는 자기 전용 파일을 만들어 컴포넌트에서 import (`app.css` 에 큰 블록을 넣지 않는다 — 소유자만 편집).
- 새 로직은 순수 함수로 분리해 Vitest 테스트를 쓴다. 기존 132개 테스트를 깨지 않는다. 끝나기 전 `npm run typecheck && npm test` 통과 확인.
- 서버에 없는 API 는 화면이 깨지지 않게 빈 상태/오류 문구 처리. 계약 문서 필드명·enum 그대로(`src/api/types.ts`).
- git commit 은 하지 않는다 (사용자가 요청할 때만).
- 끝나면 보고: 바꾼 파일, 추가한 것, 못한 것/사용자가 육안으로 볼 것(어떤 URL·쿼리로).

## 작업 분담 (파일 소유권)
| 작업 | 소유 파일 |
|---|---|
| U1 폼·입력 UI 전면 개선 | `app.css`, `src/app/forms/**`(신규), `TransferPanel`, `LoginModal`, `ProfileModal`, `BuildingPicker`, `DepartmentPicker`, `AddressPicker`, `MyHomePanel`, `ListingsPanel` 필터 영역 |
| U2 용의자 파일·판결·수배 전단·대안 | `ListingDetailView`, `VerdictCard`, `src/app/dossier/**`(신규), `FavoritesPanel`, `HousingPanel`, `DormPanel`, `InboxPanel`, `CampusTourPanel`, 카드 스타일(`dossier.css`) |
| W1 3D 월드: 입구·정문(B5), 문 앞 실내 진입(E1), 밤길 레이어(M2) | `src/world/**`, `src/landmarks*`, `PlaceMarkers`, `WorldEffects`, `src/main.d.ts`(추가만) |
| W2 캐릭터 꾸미기(B6) | `src/player.js`, `src/world/avatar*`(신규), `src/app/avatar/**`(신규) |
| I1 실내 3D 고도화 + 실내 후기 핀(G4) | `src/interior/**`, `ReviewSection` |
| M1 개발용 목 서버 | `src/mock/**`(신규), `src/api/client.ts`(최소 훅), `.env.example` |
