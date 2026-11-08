// 캠퍼스 투어 목록 만들기: node scripts/build-campus-places.mjs
// ../campus-data/campus/buildings.json → src/app/data/campusPlaces.json
// 앱은 campus-data 폴더에 직접 의존하지 않고 이 JSON 만 읽는다. 건물 자료가 바뀌면 다시 돌린다.
import { readFileSync, writeFileSync } from 'node:fs';

const src = JSON.parse(readFileSync('../campus-data/campus/buildings.json', 'utf8'));
const places = src
  .filter((b) => !/^9/.test(b.no)) // 9xx = 한양여대·한양초: 한양대 신입생용 목록에서 제외
  .map((b) => ({
    no: b.no,
    name: b.name,
    en: b.en ?? '',
    group: /^8/.test(b.no) || /기숙사/.test(b.name) ? 'dorm' : 'etc', // 8xx = 기숙사 동
    center: b.center ?? null, // 3D 좌표(m, 원점 사자상). 없으면 3D 이동 불가
  }))
  .sort((a, b) => a.no.localeCompare(b.no, 'en', { numeric: true }));
// 서버(buildings 시드)와 같은 id: 숫자 번호(101…)는 그 숫자, 그 밖(L01·N08 …)은 1001부터 번호순
let extra = 1000;
for (const p of places) p.id = /^\d+$/.test(p.no) ? Number(p.no) : ++extra;

// 입구: OSM entrance 점 중 그 건물 외곽선에서 4m 안에 있는 것(main 우선, 그다음 가까운 것).
// door = 외곽선 위로 붙인 문 위치, stand = 문 밖으로 STAND_M 떨어진 자리(다른 건물 안이면 거리를 바꿔 본다).
// 캠퍼스 투어는 stand 에 서서 door 를 바라본다. 입구가 없으면 entrance 를 넣지 않는다(예전처럼 건물이 보이는 빈자리로).
const world = JSON.parse(readFileSync('public/world.json', 'utf8'));
const osm = JSON.parse(readFileSync('../campus-data/data/osm/hanyang_campus_geometry.json', 'utf8')).elements;
const LAT0 = world.origin.lat, LON0 = world.origin.lon;
const MX = Math.cos((LAT0 * Math.PI) / 180) * 111320, MZ = 110574; // campus-data/world/build-world.mjs 의 proj 와 같게
const doors = osm.filter((e) => e.type === 'node' && e.tags?.entrance).map((e) => ({ p: [(e.lon - LON0) * MX, -(e.lat - LAT0) * MZ], main: e.tags.entrance === 'main' }));
const inPoly = (x, z, pts) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const nearestOnPoly = ([px, pz], pts) => {
  let best = null;
  pts.forEach(([ax, az], i) => {
    const [bx, bz] = pts[(i + 1) % pts.length], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (L * L)));
    const q = [ax + t * dx, az + t * dz], d = Math.hypot(px - q[0], pz - q[1]);
    if (!best || d < best.d) best = { d, q, n: [-dz / L, dx / L] };
  });
  return best;
};
const r1 = (v) => Math.round(v * 10) / 10;
const STAND_M = [5, 4, 6, 3, 7, 8];
// 문 앞에 지붕 있는 현관(포치)이 있어 5m 면 지붕 밑이라 카메라가 머리 뒤로 붙는 건물: 계단 밖에 선다
const STAND_FIRST = { 101: 10 }; // 101 역사관(구본관)
// 문 앞 어디에 서도 나무가 카메라를 가리는 건물(3D 화면으로 확인): 입구를 쓰지 않고 예전처럼 건물이 보이는 빈자리로
const NO_ENTRANCE = new Set(['607']); // 607 동문회관
for (const p of places) {
  const polys = world.buildings.filter((b) => b.no === p.no).map((b) => b.pts);
  if (!p.center || !polys.length || NO_ENTRANCE.has(p.no)) continue;
  const cands = doors
    .map((d) => ({ ...d, hit: polys.map((pts) => ({ pts, ...nearestOnPoly(d.p, pts) })).sort((a, b) => a.d - b.d)[0] }))
    .filter((d) => d.hit.d < 4)
    .sort((a, b) => b.main - a.main || a.hit.d - b.hit.d);
  for (const c of cands) {
    const { q, n, pts } = c.hit;
    const out = inPoly(q[0] + n[0] * 0.5, q[1] + n[1] * 0.5, pts) ? [-n[0], -n[1]] : n; // 바깥쪽 법선
    const m = [...(STAND_FIRST[p.no] ? [STAND_FIRST[p.no]] : []), ...STAND_M].find((m) => !world.buildings.some((b) => inPoly(q[0] + out[0] * m, q[1] + out[1] * m, b.pts)));
    if (m == null) continue;
    p.entrance = { door: [r1(q[0]), r1(q[1])], stand: [r1(q[0] + out[0] * m), r1(q[1] + out[1] * m)] };
    break;
  }
}
writeFileSync('src/app/data/campusPlaces.json', JSON.stringify(places, null, 1) + '\n');
console.log(`places ${places.length} (dorm ${places.filter((p) => p.group === 'dorm').length}, no 3D position ${places.filter((p) => !p.center).length}, entrance ${places.filter((p) => p.entrance).length})`);
