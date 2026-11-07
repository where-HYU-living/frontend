# frontend — 어디서사냥 · 한양대 서울캠퍼스 3D

한양대 서울캠퍼스를 걸어 다닐 수 있는 3D 장면 (Vite + Three.js r180). 이후 매물 지도·매물 상세·등굣길 화면이 이 장면을 불러 쓴다.

## 실행
```bash
npm install
npm run dev        # http://localhost:5173 (메뉴 React 층 + 3D)
```
- 시작 화면: **사자상 정면** (서쪽 광장에서 동쪽 — 뒤로 역사관·본관, 오른쪽 뒤로 애지문)
- 조작: WASD/방향키 이동, Shift 달리기, 드래그 시점, 휠 확대, 왼쪽 메뉴로 랜드마크 이동, 미니맵 클릭 이동
- `?noao` 를 붙이면 그늘 후처리(GTAO)를 끈다 (느린 기기용)

## 데이터는 어디서 오나
`public/world.json` 은 **[campus-data](https://github.com/where-HYU-living/campus-data)** 레포가 만든 결과물이다 (지형·건물 윤곽·외관·옹벽·계단).
```bash
# campus-data 를 이 레포 옆(../campus-data)에 받아 두고
npm run world      # world.json 다시 만들어 public/ 에 복사
npm run assets     # Poly Haven 텍스처·하늘 다시 받기 (public/tex, public/env)
```

## 구조
| 파일 | 내용 |
|---|---|
| `src/main.js` | 장면 조립: 하늘·빛·안개, 지형, 건물, 랜드마크, 나무, 캐릭터, 미니맵, 후처리 |
| `src/terrain.js` | 지형 메시 + 바닥 셰이더 (숲 바닥·잔디·보도·차도·광장 화강석을 마스크로 섞음) |
| `src/buildings.js` | 일반 건물: OSM 윤곽을 높이만큼 세우고 `appearance` 의 외벽 색·재질·창 패턴 적용 |
| `src/facade.js` | 외벽 텍스처 생성 (재질 사진 + 색 + 창 패턴, 층별로 다른 재질 쌓기) |
| `src/hero.js` | 사진 보고 직접 만든 건물: 101 역사관, 102 본관(시계탑), 104 애지문(=한양대역 2번 출구), 105 학생복지관 + 화단 관목·장식 가로등·구름다리 |
| `src/site.js` | 국토지리정보원 수치지도의 옹벽·석축·계단을 세움 |
| `src/landmarks/lion.js`, `sdf.js` | 사자상 조각 (SDF + Marching Cubes) |
| `src/landmarks.js` | 노천극장, 역 출구, 가로등·벤치, 라벨 |
| `src/trees.js` | 봄 나무(연두·초록·벚꽃), 소나무, 바람 흔들림 |
| `src/player.js` | 캐릭터·3인칭 카메라 (건물에 가리면 당겨옴) |

## 지금 수준
- **사자상 대표 장면**: 사자상·역사관·본관·애지문·학생복지관을 로드뷰·사진 기준으로 모델링, 광장 화강석 포장과 `HANYANG UNIVERSITY` 바닥 글씨
- 나머지 건물: 외관 조사(64동) 색·재질만 입힌 상자, 평지붕
- 지형: 수치지도 2m 격자 (옹벽 단차는 벽으로 따로 세움)
- 애지문은 사용자 확인으로 데이터 위치보다 남쪽 10m 로 옮김 (`src/hero.js` 의 `AEJI_SHIFT`)

## 다음 할 일
1. 노천극장 일대, 2. 언덕 위 사범대·자연대 (옹벽·계단), 3. 법대·경영 광장, 4. 공대 구역 — 사자상처럼 사진 기준 모델링
- 지붕 모양(박공·모임) 반영, 경사지 건물 기단 드러내기, 길(회차로·보행띠·점자블록)
- 로딩 시간 줄이기(사자상 미리 만들기, 텍스처 압축)

## 출처
지도 © OpenStreetMap contributors (ODbL) · 지형·옹벽·계단: 국토지리정보원 수치지도 가공 · 텍스처·하늘: Poly Haven (CC0) · 외관 참고: 카카오맵 로드뷰, 한대신문·뉴스H 사진
