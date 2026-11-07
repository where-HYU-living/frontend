import { describe, expect, test } from 'vitest';
import type { FloorPlan } from '../api/types';
import { footprint, placeFixtures } from './fixtures';
import { checkPlan } from './planCheck';
import { buildRoomScene } from './roomScene';

/** 3×4m 방 하나 (바깥 벽 두께 0.2). 필요한 것만 덮어쓴다 */
const room = (o: Partial<FloorPlan> = {}): FloorPlan => ({
  id: 1, name: 't', areaM2: 12, ceilingHeight: 2.4,
  walls: [
    { from: [0, 0], to: [3, 0], thickness: 0.2 }, { from: [3, 0], to: [3, 4], thickness: 0.2 },
    { from: [3, 4], to: [0, 4], thickness: 0.2 }, { from: [0, 4], to: [0, 0], thickness: 0.2 },
  ],
  openings: [{ type: 'door', wall: 0, offset: 1.1, width: 0.9, height: 2.1, sill: 0 }],
  rooms: [{ name: '방', kind: 'bedroom', polygon: [[0, 0], [3, 0], [3, 4], [0, 4]] }],
  entrance: [1.55, 0], glbUrl: null, ...o,
});
const aabb = (p: Parameters<typeof footprint>[0]) => { const c = footprint(p), xs = c.map((q) => q[0]), ys = c.map((q) => q[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };

describe('벽 사이 맞춤 (AI 가 벽 중심선 기준으로 적은 좌표·폭)', () => {
  test('벽 반두께만큼 파묻힌 가구는 안쪽 면에 딱 붙는다', () => {
    const [p] = placeFixtures(room(), [{ kind: 'wardrobe', position: [0.45, 2], facing: 'E', size: [1.0, 0.7, 2.0] }]); // 깊이 0.7 → 뒷면 x=0.1 (벽 안쪽 면)
    expect(aabb(p).x0).toBeCloseTo(0.1, 2);
    const [q] = placeFixtures(room(), [{ kind: 'wardrobe', position: [0.3, 2], facing: 'E', size: [1.0, 0.6, 2.0] }]); // 뒷면 x=0.0 → 벽 안으로 10cm
    expect(aabb(q).x0).toBeCloseTo(0.1, 2);
  });

  test('양쪽 벽 사이 틈보다 넓은 조리대는 틈에 맞게 줄이고 가운데에 놓는다', () => {
    const fp = room({ walls: [...room().walls, { from: [1.31, 2], to: [1.31, 4], thickness: 0.12 }] }); // 안쪽 면 x=1.25
    const [c] = placeFixtures(fp, [{ kind: 'kitchenCounter', position: [0.65, 3.0], facing: 'S', size: [1.28, 0.62, 0.85] }]);
    const b = aabb(c);
    expect(b.x0).toBeCloseTo(0.1, 2);
    expect(b.x1).toBeCloseTo(1.25, 2);
    expect(c.size[0]).toBeCloseTo(1.15, 2);
  });

  test('너무 크게 줄여야 하면(35% 초과) 의도된 배치로 보고 그대로 둔다', () => {
    const fp = room({ walls: [...room().walls, { from: [1.0, 2], to: [1.0, 4], thickness: 0.1 }] }); // 틈 0.85 vs 폭 1.6
    const [c] = placeFixtures(fp, [{ kind: 'kitchenCounter', position: [0.6, 3.0], facing: 'S', size: [1.6, 0.6, 0.85] }]);
    expect(c.size[0]).toBeCloseTo(1.6, 2);
  });
});

describe('문 앞 비우기', () => {
  const bath = room({
    walls: [...room().walls, { from: [1.5, 0], to: [1.5, 4], thickness: 0.1 }],
    openings: [{ type: 'door', wall: 4, offset: 1.0, width: 0.7, height: 2.0, sill: 0 }],
    rooms: [{ name: '욕실', kind: 'bathroom', polygon: [[1.5, 0], [3, 0], [3, 4], [1.5, 4]] }], entrance: [1.5, 1.35],
  });
  test('문 한가운데 놓인 세면대는 벽을 따라 비켜 놓는다 (문 폭 y 1.0~1.7 밖으로)', () => {
    const [s] = placeFixtures(bath, [{ kind: 'sink', position: [1.8, 1.35], facing: 'E', room: '욕실' }]);
    const b = aabb(s);
    expect(b.y0 >= 1.7 - 0.005 || b.y1 <= 1.0 + 0.005).toBe(true);
    expect(b.x0).toBeGreaterThanOrEqual(1.55 - 0.005); // 벽 안으로 안 들어감
  });
  test('방 밖으로 밀려나야 하면 원래 자리에 둔다 (좁은 방에서 가구를 벽 속으로 밀지 않는다)', () => {
    const tiny = { ...bath, rooms: [{ name: '욕실', kind: 'bathroom' as const, polygon: [[1.5, 0.9], [3, 0.9], [3, 1.8], [1.5, 1.8]] as [number, number][] }] };
    const [s] = placeFixtures(tiny, [{ kind: 'toilet', position: [1.95, 1.35], facing: 'E', size: [0.9, 0.7, 0.78], room: '욕실' }]);
    expect(s.y).toBeCloseTo(1.35, 2);
  });
});

describe('L자 주방의 겹친 조리대, 인덕션·싱크, 공중 높이', () => {
  test('겹친 조리대는 맞닿게 줄인다 (윗면이 같은 평면이라 깜박이지 않게)', () => {
    const big = room({ walls: [{ from: [0, 0], to: [8, 0], thickness: 0.2 }, { from: [8, 0], to: [8, 6], thickness: 0.2 }, { from: [8, 6], to: [0, 6], thickness: 0.2 }, { from: [0, 6], to: [0, 0], thickness: 0.2 }], rooms: [{ name: '방', polygon: [[0, 0], [8, 0], [8, 6], [0, 6]] }] });
    const [a, b] = placeFixtures(big, [
      { kind: 'kitchenCounter', position: [5.87, 2.1], facing: 'W', size: [2.56, 0.55, 0.85] },
      { kind: 'kitchenCounter', position: [4.94, 2.99], facing: 'N', size: [1.73, 0.65, 0.85] },
    ]);
    const A = aabb(a), B = aabb(b);
    const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
    expect(ox <= 0.011 || oy <= 0.011).toBe(true);
  });

  test('나란히 놓인 인덕션·싱크가 겹치면 두 폭을 줄여 맞춘다', () => {
    const [h, k] = placeFixtures(room(), [
      { kind: 'cooktop', position: [2.9, 1.0], facing: 'W' }, { kind: 'kitchenSink', position: [2.9, 1.48], facing: 'W' },
    ]);
    expect((h.size[0] + k.size[0]) / 2).toBeLessThanOrEqual(0.48 - 0.01 + 1e-9);
  });

  test('elevation 은 몸체 밑면 높이: 책상 위 책꽂이는 책상과 겹치지 않는다', () => {
    const fp = room({ fixtures: [
      { kind: 'desk', position: [0.4, 2], facing: 'W', size: [1.2, 0.6, 0.75] },
      { kind: 'shelf', position: [0.25, 2], facing: 'E', size: [1.2, 0.3, 1.05], elevation: 0.75 },
    ] });
    const placed = placeFixtures(fp);
    expect(placed[1].baseY).toBe(0.75);
    expect(checkPlan(fp).errors.filter((e) => e.startsWith('겹침'))).toEqual([]);
    expect(buildRoomScene(fp).solids[1].center[1]).toBeCloseTo(0.75 + 1.05 / 2, 3);
  });
});

describe('planCheck 가 잡아야 하는 것', () => {
  const withFx = (fixtures: FloorPlan['fixtures']) => room({ fixtures });
  test('폭·깊이를 뒤바꿔 적은 붙박이장', () => {
    const { errors } = checkPlan(withFx([{ kind: 'builtinWardrobe', position: [0.5, 2], facing: 'E', size: [0.6, 3.4, 2.1] }]));
    expect(errors.some((e) => e.includes('폭·깊이를 뒤바꿔'))).toBe(true);
  });
  test('방 밖 가구', () => {
    const { errors } = checkPlan(withFx([{ kind: 'bed', position: [9, 9], facing: 'N', room: '방' }]));
    expect(errors.some((e) => e.includes('방 밖'))).toBe(true);
  });
  test('입구가 문 위에 있지 않음', () => {
    const { errors } = checkPlan(room({ entrance: [0.2, 2] }));
    expect(errors.some((e) => e.includes('entrance'))).toBe(true);
  });
  test('들어가야 하는 방이 가구로 막히면 오류, 설비실이면 경고', () => {
    const walled = (kind: 'bedroom' | 'utility'): FloorPlan => room({
      walls: [...room().walls, { from: [0, 0.9], to: [3, 0.9], thickness: 0.1 }],
      openings: [{ type: 'door', wall: 0, offset: 1.1, width: 0.9, height: 2.1, sill: 0 }, { type: 'door', wall: 4, offset: 1.1, width: 0.7, height: 2.0, sill: 0, swing: { hinge: 'start', opensTo: 1 } }],
      rooms: [{ name: '현관', kind: 'entrance', polygon: [[0, 0], [3, 0], [3, 0.9], [0, 0.9]] }, { name: '안쪽', kind, polygon: [[0, 0.9], [3, 0.9], [3, 4], [0, 4]] }],
      fixtures: [{ kind: 'sofa', position: [1.45, 1.4], facing: 'S', size: [1.0, 0.6, 0.8], room: '안쪽' }, { kind: 'wardrobe', position: [0.5, 1.4], facing: 'E', size: [0.9, 0.5, 2.0], room: '안쪽' }, { kind: 'shelf', position: [2.5, 1.4], facing: 'W', size: [0.9, 0.5, 1.0], room: '안쪽' }],
    });
    expect(checkPlan(walled('bedroom')).errors.some((e) => e.includes('못 들어가요'))).toBe(true);
    const r = checkPlan(walled('utility'));
    expect(r.errors.some((e) => e.includes('못 들어가요'))).toBe(false);
    expect(r.warnings.some((e) => e.includes('안쪽'))).toBe(true);
  });
  test('현관문이 바깥으로 열리는 건 정상 (오류 아님)', () => {
    const fp = room({ openings: [{ type: 'door', wall: 0, offset: 1.1, width: 0.9, height: 2.1, sill: 0, swing: { hinge: 'start', opensTo: 1 } }] }); // 위쪽 벽에서 +1 = 화면 위 = 바깥
    expect(checkPlan(fp).errors).toEqual([]);
  });
});
