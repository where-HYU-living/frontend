import { expect, test } from 'vitest';
import { buildDoors, doorPromptText, nearestDoor } from './doors';
import { resolveGates, resolveMyBuildings } from './campus';
import { lampGlow, sampleLamps } from './streetlamps';

const tl = (lat: number, lng: number): [number, number] => [lng, lat];

test('nearestDoor picks the closest within radius, else null', () => {
  const ds = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 40, z: 0 }];
  expect(nearestDoor(ds, 2.6, 0)).toBe(ds[1]);
  expect(nearestDoor(ds, 20, 0)).toBeNull();
  expect(nearestDoor(ds, 0, 5)).toBe(ds[0]);
  expect(nearestDoor(ds, 0, 5.1)).toBeNull();
  expect(nearestDoor([], 0, 0)).toBeNull();
});

test('buildDoors keeps only floorplan entries and dedupes same plan at same spot', () => {
  const d = buildDoors([
    { id: 'a', x: 0, z: 0, title: 'A', floorplanId: 5 },
    { id: 'b', x: 0.4, z: 0.2, title: 'B', floorplanId: 5 },
    { id: 'c', x: 0, z: 0, title: 'C', floorplanId: null },
    { id: 'd', x: 0, z: 0, title: 'D', floorplanId: 6 },
    { id: 'e', x: NaN, z: 0, title: 'E', floorplanId: 7 },
  ]);
  expect(d.map((x) => x.id)).toEqual(['a', 'd']);
});

test('prompt text differs for touch', () => {
  expect(doorPromptText('청아진', false)).toContain('(E)');
  expect(doorPromptText('청아진', true)).not.toContain('(E)');
});

test('resolveGates uses GATE buildings, else falls back to 애지문', () => {
  const places = [{ id: 104, name: '애지문', center: [-41.8, 10.9] as [number, number] }];
  const g = resolveGates([{ id: 1, name: '정문', type: 'GATE', lat: 2, lng: 1 }, { id: 2, name: '본관', type: 'CAMPUS', lat: 0, lng: 0 }], tl, places);
  expect(g).toEqual([{ id: 'g1', name: '정문', x: 1, z: 2 }]);
  expect(resolveGates(undefined, tl, places)[0]).toMatchObject({ x: -41.8, z: 10.9 });
  expect(resolveGates([], tl, [])).toEqual([]);
});

test('resolveMyBuildings prefers server, falls back to built-in centers', () => {
  const places = [{ id: 102, name: '본관', center: [20, -56] as [number, number] }, { id: 9, name: '없음', center: null }];
  const r = resolveMyBuildings([5, 102, 9, 777], [{ id: 5, name: '공학관', type: 'CAMPUS', lat: 3, lng: 4 }], tl, places);
  expect(r).toEqual([{ id: 'b5', name: '공학관', x: 4, z: 3 }, { id: 'b102', name: '본관', x: 20, z: -56 }]);
});

test('lamps: spaced along roads, offset from the centerline, capped, kinds filtered', () => {
  const roads = [{ kind: 'road', w: 6, pts: [[0, 0], [100, 0]] as [number, number][] }, { kind: 'steps', w: 2, pts: [[0, 50], [100, 50]] as [number, number][] }];
  const l = sampleLamps(roads, { spacing: 30 });
  expect(l.map((p) => Math.round(p[0]))).toEqual([15, 45, 75]);
  expect(l.every((p) => Math.abs(p[1]) > 3)).toBe(true);
  expect(new Set(l.map((p) => Math.sign(p[1]))).size).toBe(2);
  expect(sampleLamps(roads, { spacing: 5, max: 4 })).toHaveLength(4);
});

test('lampGlow only after t>0.5', () => {
  expect(lampGlow(0.5)).toBe(0);
  expect(lampGlow(0.3)).toBe(0);
  expect(lampGlow(0.6)).toBeCloseTo(0.5);
  expect(lampGlow(1)).toBe(1);
});
