import { expect, test } from 'vitest';
import { buildInterior } from './buildInterior';
import { isBlocked, slideMove } from './collision';
import { classifyPress, isPinInPlan, pinFromPlan, pinFromPoint, pinnedReviews } from './pins';
import { minimapLayout } from './minimapLayout';
import { polygonArea, polygonCenter, pointInPoly } from './geom';
import type { FloorPlan, Review } from '../api/types';

const fp: FloorPlan = {
  id: 1, name: 't', areaM2: 10, ceilingHeight: 2.4,
  walls: [{ from: [0, 0], to: [3, 0], thickness: 0.15 }, { from: [3, 0], to: [3, 4], thickness: 0.15 }],
  openings: [{ type: 'door', wall: 0, offset: 0.5, width: 0.9, height: 2.1, sill: 0 }, { type: 'window', wall: 1, offset: 1, width: 1.5, height: 1.2, sill: 0.9 }],
  rooms: [{ name: '침실', polygon: [[0, 0], [3, 0], [3, 4], [0, 4]] }], entrance: [0.95, 0], glbUrl: null,
};

test('geom: area, center, containment', () => {
  const sq: [number, number][] = [[0, 0], [2, 0], [2, 3], [0, 3]];
  expect(polygonArea(sq)).toBeCloseTo(6);
  expect(polygonCenter(sq)).toEqual([1, 1.5]);
  expect(pointInPoly(1, 1, sq)).toBe(true);
  expect(pointInPoly(3, 1, sq)).toBe(false);
});

test('collision: wall blocks, door gap and lintel allow passing, slide along wall, furniture (solid) always blocks', () => {
  const { wallPieces } = buildInterior(fp);
  expect(isBlocked(wallPieces, 0.2, 0)).toBe(true); // 문 왼쪽 벽
  expect(isBlocked(wallPieces, 0.95, 0)).toBe(false); // 문 자리 (인방은 위라서 안 막음)
  expect(isBlocked(wallPieces, 1.5, 2)).toBe(false); // 방 안
  const [x, z] = slideMove(wallPieces, [0.2, 0.6], [0.4, 0.1]);
  expect(x).toBeCloseTo(0.4); // 벽 쪽(z)만 막히고 x 는 이동
  expect(z).toBeCloseTo(0.6);
  const bed = { center: [1.5, 0.25, 2] as [number, number, number], size: [1, 0.45, 2] as [number, number, number], rotationY: 0 }; // 낮은 침대: 일반 조각이면 안 막지만 solid 면 막는다
  expect(isBlocked([bed], 1.5, 2)).toBe(false);
  expect(isBlocked([{ ...bed, solid: true }], 1.5, 2)).toBe(true);
});

test('pins: coordinate convention, bounds, filtering', () => {
  expect(pinFromPlan(1.234, 2.5, 0.5)).toEqual([1.23, 0.5, 2.5]);
  expect(pinFromPoint({ x: 1, y: 0, z: 2 })).toEqual([1, 0, 2]);
  expect(isPinInPlan([1, 1, 2], fp)).toBe(true);
  expect(isPinInPlan([9, 1, 2], fp)).toBe(false);
  expect(isPinInPlan([1, 5, 2], fp)).toBe(false);
  expect(isPinInPlan([1, NaN, 2], fp)).toBe(false);
  expect(isPinInPlan(null, fp)).toBe(false);
  const r = (id: number, pin: Review['pin']): Review => ({ id, rating: 4, scores: { noise: 4, light: 4, bugs: 4, landlord: 4, depositReturn: 4 }, text: '', pin, authorNickname: 'a', createdAt: 'x' });
  expect(pinnedReviews([r(1, null), r(2, [1, 1, 1]), r(3, [50, 1, 1])], fp).map((x) => x.id)).toEqual([2]);
  expect(pinnedReviews(undefined, fp)).toEqual([]);
});

test('classifyPress', () => {
  expect(classifyPress(100, 2)).toBe('tap');
  expect(classifyPress(700, 2)).toBe('long');
  expect(classifyPress(700, 30)).toBe('drag');
});

test('minimap fits the box and maps corners', () => {
  const m = minimapLayout(fp, 100, 5);
  expect(Math.max(m.width, m.height)).toBeCloseTo(100);
  expect(m.toMap(0, 0)).toEqual([5, 5]);
  const [x, y] = m.toMap(3, 4);
  expect(x).toBeLessThanOrEqual(m.width - 5 + 1e-6);
  expect(y).toBeLessThanOrEqual(m.height - 5 + 1e-6);
});

import { findReviewTarget } from './reviewTarget';
test('review target is found from dorm room types and housing unit types', () => {
  const dorm = { id: 3, name: 'd', lat: 0, lng: 0, roomTypes: [{ id: 1, name: '2인실', capacity: 2, semesterFee: 0, semesterMonths: 4, mealIncluded: false, monthlyCost: 0, floorplanId: 7 }] };
  const housing = { id: 9, unitTypes: [{ id: 1, floorplanId: 8 }] } as never;
  expect(findReviewTarget(7, [dorm], [housing])).toEqual({ targetType: 'DORM', targetId: 3 });
  expect(findReviewTarget(8, [dorm], [housing])).toEqual({ targetType: 'HOUSING', targetId: 9 });
  expect(findReviewTarget(1, [dorm], [housing])).toBeNull();
});
