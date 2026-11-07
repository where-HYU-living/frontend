// 학과 → 건물 데이터 만들기: node scripts/build-departments.mjs [원본.json]
// 원본(campus-data/campus/departments.json: 출처·확신도 포함)에서 아래 세 파일을 만든다.
//   frontend  src/app/data/departments.json              서버가 없을 때 쓰는 목록 (id·name·college·buildingIds)
//   backend   $BACKEND_DIR(기본 ../backend)/src/main/resources/fixtures/departments.json   서버 시드 (계약의 /departments 와 같은 모양)
//   backend   ../backend/src/main/resources/fixtures/buildings.json     서버 시드 (건물 id 는 campusPlaces.json 의 id 와 같다)
// 건물 번호("212") → id 는 scripts/build-campus-places.mjs 가 정한 규칙을 그대로 쓴다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SRC = process.argv[2] ?? '../campus-data/campus/departments.json';
const src = JSON.parse(readFileSync(SRC, 'utf8'));
const places = JSON.parse(readFileSync('src/app/data/campusPlaces.json', 'utf8'));
const idOf = new Map(places.map((p) => [p.no, p.id]));

// 3D 좌표(m, 원점 사자상, x 동 z 남) → 위경도. src/app/map/geo.ts 와 같은 식
const ORIGIN = { lat: 37.5561486, lng: 127.044341 };
const toLatLng = (x, z) => [ORIGIN.lat - z / 110540, ORIGIN.lng + x / (111320 * Math.cos((ORIGIN.lat * Math.PI) / 180))];

const departments = [];
const problems = [];
for (const c of src.colleges) {
  for (const d of c.departments) {
    const ids = [];
    for (const no of d.buildings ?? []) {
      if (!idOf.has(no)) { problems.push(`${d.name}: 건물 번호 ${no} 가 campusPlaces 에 없음`); continue; }
      ids.push(idOf.get(no));
    }
    departments.push({ id: departments.length + 1, name: d.name, college: c.college, defaultBuildingIds: ids, buildingNos: d.buildings ?? [], confidence: d.confidence ?? 'guess' });
  }
}
const names = departments.map((d) => d.name);
for (const n of new Set(names.filter((n, i) => names.indexOf(n) !== i))) problems.push(`학과 이름 중복: ${n}`);
if (problems.length) { console.error('문제:\n- ' + problems.join('\n- ')); process.exit(1); }

const write = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 2) + '\n'); };

// 프론트 폴백 (확신도는 화면에서 안 쓰므로 뺀다)
write('src/app/data/departments.json', departments.map(({ id, name, college, defaultBuildingIds }) => ({ id, name, college, defaultBuildingIds })));

// 백엔드 시드
const BACKEND = process.env.BACKEND_DIR ?? '../backend';
if (existsSync(BACKEND)) {
  const dir = `${BACKEND}/src/main/resources/fixtures`;
  write(`${dir}/departments.json`, departments.map(({ id, name, college, defaultBuildingIds }) => ({ id, name, college, defaultBuildingIds })));
  const buildings = places.filter((p) => p.center).map((p) => {
    const [lat, lng] = toLatLng(p.center[0], p.center[1]);
    const type = p.group === 'dorm' ? 'DORM' : p.no === '104' ? 'GATE' : 'CAMPUS';
    return { id: p.id, name: p.name, type, lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
  });
  write(`${dir}/buildings.json`, buildings);
  console.log(`백엔드 시드: 학과 ${departments.length}, 건물 ${buildings.length}`);
} else console.log(`${BACKEND} 가 없어서 백엔드 시드는 건너뜀`);

const none = departments.filter((d) => d.defaultBuildingIds.length === 0);
console.log(`학과 ${departments.length} (단과대 ${src.colleges.length}), confirmed ${departments.filter((d) => d.confidence === 'confirmed').length}, guess ${departments.filter((d) => d.confidence !== 'confirmed').length}, 건물 없음 ${none.length}${none.length ? ' → ' + none.map((d) => d.name).join(', ') : ''}`);
