// 실제 나무 배치 자료를 굽는다 → public/trees.json (앱은 실행 중 외부 API 를 부르지 않음)
//   node scripts/fetch-trees.mjs
// 자료 출처
//   1) OSM Overpass: 이름 붙은 도로(왕십리로·살곶이길·사근동길…) + natural=tree / tree_row (있으면)
//   2) campus-data/campus/*/appearance.json 의 "나무" 항목 (로드뷰·사진을 보고 적은 건물별 수목 메모)
//      예) 207 "살곶이길 가로수(은행나무)", 102 "북쪽 길가 벚나무류", 605 "키 큰 소나무 열식"
//   3) 서울시 가로수 위치정보(GeoInfoOfRoadsideTreeW)는 인증키 없이는 5건만 나와 못 씀
//      (샘플에서 성동구 수종 확인: 왕벚나무·양버즘나무·느티나무·은행나무·회화나무)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CAMPUS = path.resolve(ROOT, '..', 'campus-data', 'campus');
const world = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'world.json'), 'utf8'));
const LAT0 = 37.5561486, LON0 = 127.044341;
const MX = Math.cos((LAT0 * Math.PI) / 180) * 111320, MZ = 110574;
const toXZ = (lat, lon) => [+((lon - LON0) * MX).toFixed(2), +(-(lat - LAT0) * MZ).toFixed(2)];
const { minX, maxX, minZ, maxZ } = world.bounds;
const BBOX = [LAT0 - maxZ / MZ, LON0 + minX / MX, LAT0 - minZ / MZ, LON0 + maxX / MX].map((v) => v.toFixed(5)).join(',');

// ---- 1) OSM (거울 서버 여러 개 돌려가며)
const MIRRORS = ['https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass-api.de/api/interpreter'];
async function overpass(q) {
  for (let round = 0; round < 3; round++) {
    for (const u of MIRRORS) {
      try {
        const r = await fetch(u, { method: 'POST', headers: { 'User-Agent': 'chatatda-hanyang-bake/1.0', Accept: '*/*' }, body: new URLSearchParams({ data: q }) });
        if (r.ok) return await r.json();
        console.warn('overpass', r.status, u);
      } catch (e) { console.warn('overpass', e.message, u); }
    }
  }
  throw new Error('overpass 실패');
}
const osm = await overpass(`[out:json][timeout:60];(way["highway"]["name"](${BBOX});node["natural"="tree"](${BBOX});way["natural"="tree_row"](${BBOX}););out tags geom;`);
const named = {}, osmTrees = [];
for (const e of osm.elements) {
  const t = e.tags || {};
  if (e.type === 'node' && t.natural === 'tree') osmTrees.push({ p: toXZ(e.lat, e.lon), species: t['species:ko'] || t.species || t.genus || t.leaf_type || '' });
  if (e.type === 'way' && t.natural === 'tree_row') osmTrees.push(...e.geometry.map((g) => ({ p: toXZ(g.lat, g.lon), species: t.species || t.genus || '' })));
  if (e.type === 'way' && t.highway && t.name) (named[t.name] ||= []).push({ hw: t.highway, pts: e.geometry.map((g) => toXZ(g.lat, g.lon)) });
}

// 도로 이름 → 가로수 수종 (건물 메모·로드뷰 근거)
//   왕십리로: L02 "보도 가로수(느티나무 등)", 904 "보도 쪽 느티나무 등 큰 가로수"
//   살곶이길: 207 "살곶이길 가로수(은행나무)", 902 "살곶이길 가로수(은행나무 등)"
//   사근동 골목길: 804 "도로변 은행나무 가로수", 805 "도로변 은행나무"
const STREET = [
  [/^왕십리로$/, 'zelkova', 9],
  [/^살곶이길$/, 'ginkgo', 8],
  [/^사근동(8|10|12)길$/, 'ginkgo', 9],
  [/^마조로$/, 'ginkgo', 9],
];
const streets = [];
for (const [name, ways] of Object.entries(named)) {
  const rule = STREET.find(([re]) => re.test(name));
  if (!rule) continue;
  for (const w of ways) {
    if (w.hw === 'steps' || w.hw === 'footway') continue;
    streets.push({ name, species: rule[1], gap: rule[2], wide: /primary|secondary/.test(w.hw), pts: w.pts });
  }
}

// ---- 2) 건물별 수목 메모
const blds = JSON.parse(fs.readFileSync(path.join(CAMPUS, 'buildings.json'), 'utf8'));
const foot = new Map(world.buildings.map((b) => [String(b.id), b.pts]));
const findTree = (o) => {
  if (!o || typeof o !== 'object') return null;
  if (typeof o['나무'] === 'string') return o['나무'];
  for (const v of Object.values(o)) { const r = findTree(v); if (r) return r; }
  return null;
};
// 메모 한 구절에서 수종 뽑기
const speciesOf = (s) => {
  const out = [];
  if (/벚/.test(s)) out.push('cherry');
  if (/은행/.test(s)) out.push('ginkgo');
  if (/느티|플라타너스|버즘/.test(s)) out.push('zelkova');
  if (/활엽|단풍|수양버들|배롱/.test(s)) out.push('broad');
  // 활엽 수종 없이 '가로수·큰 나무·조경수'만 적힌 경우 → 느티나무로 (서울 가로수 대표 수종)
  if (!out.length && /가로수|큰 나무|조경수/.test(s)) out.push('zelkova');
  if (/소나무|적송|노송/.test(s)) out.push('pine');
  return out;
};
// 그루 수 어림 (메모의 말투로)
const countOf = (s, sp) => {
  if (/1그루/.test(s)) return 1;
  if (/2그루/.test(s)) return 2;
  if (/군식|열식|빽빽|촘촘|다수|숲|줄/.test(s)) return sp === 'pine' ? 9 : 7;
  if (/여러 그루|큰/.test(s)) return 6;
  if (/몇 그루/.test(s)) return 3;
  return 4;
};
// 사자상·역사관·애지문 소나무는 main.js(makePines)가 손으로 배치 → 건너뜀
const SKIP = new Set(['L01', 'L02', '101', '104']);
const sites = [], roadside = [];
for (const b of blds) {
  if (SKIP.has(b.no) || !b.folder) continue;
  const f = path.join(CAMPUS, b.folder, 'appearance.json');
  if (!fs.existsSync(f)) continue;
  let note;
  try { note = findTree(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { continue; }
  if (!note) continue;
  const ring = (b.osm_ids || []).map((id) => foot.get(String(id))).find(Boolean);
  if (!ring && !b.center) continue;
  for (const clause of note.split(/[,，]/)) {
    const sp = speciesOf(clause);
    if (!sp.length) continue;
    const isRoad = /도로변|가로수|길가|보도|살곶이길|왕십리로/.test(clause);
    const slope = /비탈|숲|옹벽 위|축대 위/.test(clause);
    for (const s of sp) {
      const n = countOf(clause, s);
      if (isRoad && s !== 'pine') roadside.push({ no: b.no, species: s, ring, c: b.center });
      else sites.push({ no: b.no, species: s, n: slope ? n + 4 : n, slope, ring: ring || null, c: b.center, note: clause.trim() });
    }
  }
}

// 건물 메모 "도로변/길가 ○○" → 건물에서 30m 안쪽 차도 구간에 그 수종 가로수
const distToRing = (x, z, ring) => {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j], [bx, bz] = ring[i];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
};
const nearB = (x, z, r) => (r.ring ? distToRing(x, z, r.ring) : Math.hypot(x - r.c[0], z - r.c[1]) - 15);
for (const r of roadside) {
  for (const road of world.roads) {
    if (road.kind !== 'road' || road.hw === 'trunk' || road.hw === 'primary') continue; // 큰길은 이름 규칙이 맡음
    let run = [];
    const flush = () => { if (run.length > 1) streets.push({ name: `${r.no} 길가`, species: r.species, gap: r.species === 'cherry' ? 7 : 9, wide: false, pts: run }); run = []; };
    for (const p of road.pts) { if (nearB(p[0], p[1], r) < 28) run.push(p); else flush(); }
    flush();
  }
}
const round = (a) => a.map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]);
const out = {
  note: '실제 나무 배치 자료 (scripts/fetch-trees.mjs 로 생성). streets=가로수 줄, sites=건물 둘레 수목(로드뷰 메모), osmTrees=OSM 개별 나무',
  source: ['OpenStreetMap contributors (ODbL) — 도로 이름·선형', 'campus-data appearance.json 나무 메모 (로드뷰·사진 판독)'],
  streets: streets.map((s) => ({ ...s, pts: round(s.pts) })),
  sites: sites.map((s) => ({ ...s, ring: s.ring ? round(s.ring) : null })),
  osmTrees,
};
fs.writeFileSync(path.join(ROOT, 'public', 'trees.json'), JSON.stringify(out));
const cnt = (a, k) => a.reduce((m, s) => ((m[s[k]] = (m[s[k]] || 0) + 1), m), {});
console.log('streets', streets.length, cnt(streets, 'species'), 'sites', sites.length, cnt(sites, 'species'), 'osmTrees', osmTrees.length);
