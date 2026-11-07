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
writeFileSync('src/app/data/campusPlaces.json', JSON.stringify(places, null, 1) + '\n');
console.log(`places ${places.length} (dorm ${places.filter((p) => p.group === 'dorm').length}, no 3D position ${places.filter((p) => !p.center).length})`);
