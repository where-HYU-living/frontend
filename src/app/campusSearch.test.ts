import { expect, test } from 'vitest';
import places from './data/campusPlaces.json';
import { filterPlaces, groupPlaces, type Place } from './campusSearch';

const ALL = places as Place[];
const names = (ps: Place[]) => ps.map((p) => p.name);

test('empty query returns every place', () => expect(filterPlaces(ALL, '  ')).toHaveLength(ALL.length));
test('matches a part of the name', () => {
  expect(names(filterPlaces(ALL, '공학관'))).toEqual(expect.arrayContaining(['제1공학관', '제2공학관']));
});
test('ignores spaces in the query and the name', () => {
  expect(names(filterPlaces(ALL, '제 1 공학관'))).toContain('제1공학관');
});
test('matches by building number', () => {
  expect(names(filterPlaces(ALL, '805'))).toEqual(['개나리관']);
});
test('no match returns empty', () => expect(filterPlaces(ALL, 'zzz')).toEqual([]));
test('groups dorms first and drops empty groups', () => {
  const g = groupPlaces(ALL);
  expect(g.map((x) => x.label)).toEqual(['기숙사', '그 외 건물']);
  expect(groupPlaces(filterPlaces(ALL, '개나리')).map((x) => x.group)).toEqual(['dorm']);
});
test('dorm group has the 8xx dorms', () => {
  const dorm = groupPlaces(ALL)[0].items.map((p) => p.no);
  expect(dorm).toEqual(expect.arrayContaining(['801', '805', '810']));
});
test('Hanyang Women\'s College (9xx) is not in the list', () => {
  expect(ALL.some((p) => p.no.startsWith('9'))).toBe(false);
});

// 캠퍼스 투어 텔레포트 위치: OSM 입구(entrance) 앞에 서서 건물을 바라본다 (예전엔 건물 동쪽부터 찾은 빈자리 → 뒤편에 서는 일이 많았다)
import fs from 'node:fs';
import { pointInPoly } from '../interior/geom';
type Pt = [number, number];
const world = JSON.parse(fs.readFileSync('public/world.json', 'utf8')) as { buildings: { no?: string; pts: Pt[] }[] };
const withEntrance = ALL.filter((p) => p.entrance);
test('3D 건물이 있는 투어 장소 대부분(40곳 이상)에 입구가 있다', () => {
  expect(withEntrance.length).toBeGreaterThanOrEqual(40);
});
test('입구 앞 자리는 문에서 3~10m 떨어져 있고 어느 건물 안도 아니다', () => {
  for (const p of withEntrance) {
    const { door, stand } = p.entrance!;
    const d = Math.hypot(stand[0] - door[0], stand[1] - door[1]);
    expect(d, p.name).toBeGreaterThanOrEqual(2.9); // 좌표를 0.1m 로 반올림해서 ±0.1
    expect(d, p.name).toBeLessThanOrEqual(10.1); // 역사관은 현관 지붕 밖(10m)
    expect(world.buildings.some((b) => pointInPoly(stand[0], stand[1], b.pts)), `${p.name} 의 서는 자리가 건물 안`).toBe(false);
  }
});
test('입구 문은 그 건물 외곽선 위(1m 안)에 있다', () => {
  const segDist = ([px, pz]: Pt, [ax, az]: Pt, [bx, bz]: Pt) => {
    const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(px - ax - t * dx, pz - az - t * dz);
  };
  for (const p of withEntrance) {
    const polys = world.buildings.filter((b) => b.no === p.no).map((b) => b.pts);
    const d = Math.min(...polys.flatMap((pts) => pts.map((a, i) => segDist(p.entrance!.door, a, pts[(i + 1) % pts.length]))));
    expect(d, p.name).toBeLessThan(1);
  }
});
