import fs from 'node:fs';
import { expect, test } from 'vitest';
import { campusLabelSpots, LANDMARK_LABEL_NOS } from './campusLabels';
import { visiblePlaces } from '../app/data/hiddenBuildings';
import { HIDDEN_BUILDING_NOS } from '../app/data/hiddenBuildings';

type B = { id: number; no?: string; pts: [number, number][] };
const world = JSON.parse(fs.readFileSync('public/world.json', 'utf8')) as { buildings: B[] };
const spots = campusLabelSpots(visiblePlaces, world.buildings);
const byNo = (no: string) => spots.find((s) => s.sub === no);

test('캠퍼스 건물에 이름표가 붙는다 (이름 + 건물 번호)', () => {
  const s = byNo('212');
  expect(s?.name).toBe('제1공학관');
  expect(spots.length).toBeGreaterThan(40);
});
test('이미 랜드마크 이름표가 있는 본관·역사관·애지문·노천극장은 두 번 붙이지 않는다', () => {
  for (const no of LANDMARK_LABEL_NOS) expect(byNo(no), no).toBeUndefined();
});
test('숨긴 건물·3D 건물이 없는 곳은 빠진다', () => {
  for (const no of HIDDEN_BUILDING_NOS) expect(byNo(no), no).toBeUndefined();
  const withBuilding = new Set(world.buildings.map((b) => b.no));
  for (const s of spots) expect(withBuilding.has(s.sub), s.sub).toBe(true);
});
test('이름표는 그 건물 위(높이 기준은 같은 번호의 가장 큰 건물)', () => {
  const area = (pts: [number, number][]) => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  for (const s of spots) {
    const same = world.buildings.filter((b) => b.no === s.sub);
    const biggest = same.reduce((a, b) => (area(b.pts) > area(a.pts) ? b : a));
    expect(s.bid, s.name).toBe(biggest.id);
  }
});
test('함수만 따로: 번호가 같은 건물이 없거나 위치가 없으면 빼고, 위치는 장소 중심', () => {
  const places = [
    { id: 1, no: 'A1', name: '가', en: '', group: 'etc' as const, center: [1, 2] as [number, number] },
    { id: 2, no: 'A2', name: '나', en: '', group: 'etc' as const, center: null },
    { id: 3, no: 'A3', name: '다', en: '', group: 'etc' as const, center: [5, 5] as [number, number] },
  ];
  const bs: B[] = [{ id: 10, no: 'A1', pts: [[0, 0], [2, 0], [2, 4], [0, 4]] }, { id: 11, no: 'A2', pts: [[0, 0], [1, 0], [1, 1]] }];
  expect(campusLabelSpots(places, bs)).toEqual([{ name: '가', sub: 'A1', x: 1, z: 2, bid: 10, door: false }]);
});
test('입구가 있으면 이름표는 문 위(간판처럼) — 문 앞에 서면 지붕 위 이름표는 화면 밖이라', () => {
  const places = [{ id: 1, no: 'A1', name: '가', en: '', group: 'etc' as const, center: [1, 2] as [number, number], entrance: { door: [0, 3] as [number, number], stand: [0, 8] as [number, number] } }];
  const bs: B[] = [{ id: 10, no: 'A1', pts: [[0, 0], [2, 0], [2, 4], [0, 4]] }];
  expect(campusLabelSpots(places, bs)).toEqual([{ name: '가', sub: 'A1', x: 0, z: 3, bid: 10, door: true }]);
  const real = byNo('212')!;
  const p212 = visiblePlaces.find((p) => p.no === '212')!;
  expect([real.x, real.z, real.door]).toEqual([...p212.entrance!.door, true]);
});
