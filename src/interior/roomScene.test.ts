import { describe, expect, test } from 'vitest';
import type { FloorPlan } from '../api/types';
import { FLOORPLAN_1 } from '../mock/fixtures/floorplan1';
import { FLOORPLANS } from '../mock/fixtures/floorplans';
import { fixtureSolids, placeFixtures, FACING_ROT } from './fixtures';
import { pointInPoly, polygonArea } from './geom';
import { MeshBuilder } from './meshBuilder';
import { buildRoomScene } from './roomScene';
import { floorHeightAt, floorSpec, leafPose, roomAt, roomKind } from './structure';

const plan = FLOORPLAN_1;
const idx = (name: string) => plan.rooms.findIndex((r) => r.name === name);

describe('MeshBuilder', () => {
  test('a box has 6 outward faces, normals unit length, winding agrees with normals', () => {
    const mb = new MeshBuilder();
    mb.box({ center: [1, 0.5, 2], size: [1, 1, 2], rotY: 0.6, all: { key: 'matte', color: '#ff0000' } });
    const g = mb.toGeometries().matte!;
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), idx = g.getIndex()!;
    expect(pos.count).toBe(24);
    expect(idx.count).toBe(36);
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const v = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
      const [pa, pb, pc] = [v(a), v(b), v(c)];
      const e1 = pb.map((x, i) => x - pa[i]), e2 = pc.map((x, i) => x - pa[i]);
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const n = [nor.getX(a), nor.getY(a), nor.getZ(a)];
      expect(Math.hypot(...n)).toBeCloseTo(1);
      expect(cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2]).toBeGreaterThan(0); // 삼각형이 법선 쪽을 향한다
      // 상자 중심에서 바깥쪽
      const mid = pa.map((x, i) => (x + pb[i] + pc[i]) / 3 - [1, 0.5, 2][i]);
      expect(mid[0] * n[0] + mid[1] * n[1] + mid[2] * n[2]).toBeGreaterThan(0);
    }
  });

  test('cylinder and flat polygon face outward / up', () => {
    const mb = new MeshBuilder();
    mb.cyl({ center: [0, 0, 0], rx: 0.5, h: 1, key: 'gloss', capBottom: true });
    mb.flat('wood', [[0, 0], [2, 0], [2, 1], [0, 1]], 0, true);
    mb.flat('ceiling', [[0, 0], [2, 0], [2, 1], [0, 1]], 2.4, false);
    const check = (key: 'gloss' | 'wood' | 'ceiling') => {
      const g = mb.toGeometries()[key]!, pos = g.getAttribute('position'), nor = g.getAttribute('normal'), ix = g.getIndex()!;
      let bad = 0;
      for (let t = 0; t < ix.count; t += 3) {
        const [a, b, c] = [ix.getX(t), ix.getX(t + 1), ix.getX(t + 2)];
        const p = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
        const [pa, pb, pc] = [p(a), p(b), p(c)];
        const e1 = pb.map((x, i) => x - pa[i]), e2 = pc.map((x, i) => x - pa[i]);
        const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const n = [nor.getX(a), nor.getY(a), nor.getZ(a)];
        if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] <= 0) bad++;
      }
      return bad;
    };
    expect(check('gloss')).toBe(0);
    expect(check('wood')).toBe(0);
    expect(check('ceiling')).toBe(0);
  });
});

describe('room kinds, floors and heights (청아진 18타입)', () => {
  test('kinds and floor materials come from the JSON', () => {
    expect(plan.rooms.map(roomKind)).toEqual(['entrance', 'other', 'bathroom', 'living', 'utility']);
    expect(floorSpec(plan.rooms[idx('욕실')])).toMatchObject({ key: 'tile', height: -0.08 });
    expect(floorSpec(plan.rooms[idx('거실')])).toMatchObject({ key: 'wood', height: 0 });
    expect(floorSpec(plan.rooms[idx('실외기실')])).toMatchObject({ key: 'concrete', height: -0.05 });
  });

  test('floorHeightAt follows the room polygons', () => {
    expect(floorHeightAt(plan, 1.89, 0.5)).toBe(-0.08); // 현관
    expect(floorHeightAt(plan, 2.0, 3.0)).toBe(0); // 거실
    expect(floorHeightAt(plan, 0.5, 6.4)).toBe(-0.05); // 실외기실
    expect(floorHeightAt(plan, 50, 50)).toBe(0); // 방 밖
  });

  test('room names are guessed when kind is missing', () => {
    const r = (name: string) => roomKind({ name, polygon: [] });
    expect([r('욕실'), r('현관'), r('다용도실'), r('발코니'), r('주방'), r('거실'), r('침실'), r('PS')]).toEqual(['bathroom', 'entrance', 'utility', 'balcony', 'kitchen', 'living', 'bedroom', 'other']);
  });
});

describe('door swing: the image-verified directions (opensTo +1 = screen-left of from→to)', () => {
  const door = (wall: number) => {
    const o = plan.openings.findIndex((x) => x.wall === wall && x.type === 'door');
    return leafPose(plan, wall, plan.openings[o]);
  };
  test('entrance door opens OUTWARD (arc drawn above the building)', () => {
    const p = door(0);
    expect(p.dir[1]).toBeLessThan(0); // 평면 y 가 줄어드는 쪽 = 건물 바깥(위)
    expect(p.hinge[0]).toBeCloseTo(1.49); // 경첩은 왼쪽(from) 끝
  });
  test('bathroom door opens INTO the bathroom (toward -x)', () => {
    expect(door(4).dir[0]).toBeLessThan(0);
  });
  test('utility room door opens toward the living room (+x)', () => {
    expect(door(10).dir[0]).toBeGreaterThan(0);
  });
  test('without swing info: entrance opens inward, others toward the smaller room', () => {
    const noSwing = (w: number) => { const o = { ...plan.openings.find((x) => x.wall === w && x.type === 'door')! }; delete o.swing; return leafPose(plan, w, o); };
    expect(noSwing(0).dir[1]).toBeGreaterThan(0); // 위쪽이 바깥 → 안쪽(아래)으로
    expect(noSwing(4).dir[0]).toBeLessThan(0); // 욕실(작은 방) 쪽
  });
});

describe('structure geometry', () => {
  const scene = buildRoomScene(plan);
  const stats = scene.structure.stats();

  test('no NaN and sensible size', () => {
    for (const mb of [scene.structure, scene.furniture]) {
      for (const g of Object.values(mb.toGeometries())) {
        const a = g!.getAttribute('position').array as Float32Array;
        expect(a.every(Number.isFinite)).toBe(true);
      }
    }
    const tris = Object.values(stats).reduce((n, s) => n + s.tris, 0) + Object.values(scene.furniture.stats()).reduce((n, s) => n + s.tris, 0);
    expect(tris).toBeLessThan(40000);
  });

  test('bathroom walls are tiled, outer faces are exterior concrete, living room is paint', () => {
    expect(stats.wallTile?.tris ?? 0).toBeGreaterThan(0);
    expect(stats.paint?.tris ?? 0).toBeGreaterThan(0);
    expect(stats.concrete?.tris ?? 0).toBeGreaterThan(0);
    expect(stats.tile?.tris ?? 0).toBeGreaterThan(0); // 욕실·현관 바닥
    expect(stats.wood?.tris ?? 0).toBeGreaterThan(0);
    expect(stats.glass?.tris ?? 0).toBeGreaterThan(0);
    expect(stats.lamp?.tris ?? 0).toBeGreaterThan(0);
  });

  test('draw call budget: few material buckets', () => {
    expect(Object.keys(stats).length + Object.keys(scene.furniture.stats()).length).toBeLessThanOrEqual(20);
  });

  test('step risers exist where floor heights differ (현관 -0.08 vs 거실 0, 실외기실 -0.05 vs 거실 0)', () => {
    const g = scene.structure.toGeometries().trim!;
    const pos = g.getAttribute('position');
    let riser = 0;
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - -0.08) < 1e-6 || Math.abs(pos.getY(i) - -0.05) < 1e-6) riser++;
    expect(riser).toBeGreaterThanOrEqual(8);
  });

  test('rooms do not overlap and cover the plan (sanity of the fixture itself)', () => {
    const total = plan.rooms.reduce((s, r) => s + polygonArea(r.polygon), 0);
    expect(total).toBeCloseTo(2.95 * 6.9, 1);
  });

  test('sun comes from the biggest exterior window: bottom wall → outward is +y', () => {
    expect(scene.info.sun.outward[1]).toBeGreaterThan(0.9);
  });

  test('big rooms get several lamps along the long side (so a long dorm room has no dark end)', () => {
    const long: FloorPlan = { ...plan, rooms: [{ name: '긴방', kind: 'bedroom', polygon: [[0, 0], [3.9, 0], [3.9, 8.6], [0, 8.6]] }], fixtures: [], walls: [{ from: [0, 0], to: [3.9, 0], thickness: 0.2 }, { from: [3.9, 0], to: [3.9, 8.6], thickness: 0.2 }, { from: [3.9, 8.6], to: [0, 8.6], thickness: 0.2 }, { from: [0, 8.6], to: [0, 0], thickness: 0.2 }], openings: [{ type: 'door', wall: 0, offset: 0.5, width: 0.9, height: 2.1, sill: 0 }], entrance: [0.95, 0] };
    const lamps = buildRoomScene(long).info.lamps;
    expect(lamps.length).toBe(3); // 33.5㎡ → ceil(33.5/12)=3
    const zs = lamps.map((l) => l.z).sort((a, b) => a - b);
    expect(zs[0]).toBeLessThan(2.9); expect(zs[2]).toBeGreaterThan(5.7); // 방 길이 방향으로 고르게
    expect(lamps.every((l) => l.count === 3)).toBe(true);
  });

  test('lamps: one per real room, inside the room', () => {
    expect(scene.info.lamps.length).toBeGreaterThanOrEqual(4);
    for (const l of scene.info.lamps) expect(roomAt(plan, l.x, l.z)).toBeGreaterThanOrEqual(0);
  });
});

describe('fixtures (청아진 18타입)', () => {
  const placed = placeFixtures(plan);
  const get = (kind: string, room?: string) => placed.find((p) => p.kind === kind && (!room || p.room === room))!;

  test('every fixture stays inside its own room', () => {
    for (const p of placed) {
      const room = plan.rooms.find((r) => r.name === p.room)!;
      expect(pointInPoly(p.x, p.y, room.polygon), `${p.kind} @ ${p.x.toFixed(2)},${p.y.toFixed(2)}`).toBe(true);
    }
  });

  test('kitchen counter back is snapped flush to the east wall inner face (x = 2.95 - 0.1)', () => {
    const c = get('kitchenCounter');
    expect(c.x + c.size[1] / 2).toBeCloseTo(2.85, 3);
  });

  test('cooktop and sink sit on the counter; fridge is nudged out of the counter plane', () => {
    expect(get('cooktop').onCounter).toBe(true);
    expect(get('kitchenSink').onCounter).toBe(true);
    const f = get('fridge');
    expect(f.size[1]).toBeCloseTo(0.52);
    expect(f.size[2]).toBeCloseTo(0.86);
  });

  test('missing height falls back to the default per kind', () => {
    expect(get('desk').size[2]).toBeCloseTo(0.74);
    expect(get('wardrobe').size[2]).toBeCloseTo(1.9);
    expect(get('bed').size).toEqual([0.95, 1.73, 0.45]);
  });

  test('solids: furniture blocks, shower/cooktop/sink/wall-hung things do not', () => {
    const kinds = fixtureSolids(placed).length;
    const nonSolid = placed.filter((p) => ['shower', 'cooktop', 'kitchenSink', 'upperCabinet', 'waterHeater'].includes(p.kind)).length;
    expect(kinds).toBe(placed.length - nonSolid);
    expect(fixtureSolids(placed).every((b) => b.solid)).toBe(true);
  });

  test('facing → rotation: S 0, E π/2, N π, W -π/2', () => {
    expect(FACING_ROT).toEqual({ S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 });
  });

  test('unknown kinds still render as a box', () => {
    const p: FloorPlan = { ...plan, fixtures: [{ kind: 'mystery' as never, position: [2, 3], facing: 'S' }] };
    const s = buildRoomScene(p);
    expect(s.furniture.stats().matte?.tris).toBeGreaterThan(0);
  });
});

describe('older plans without the new fields still build', () => {
  test.each(FLOORPLANS.map((f) => [f.id, f] as const))('plan %i', (_id, fp) => {
    const s = buildRoomScene(fp);
    expect(Object.keys(s.structure.stats()).length).toBeGreaterThan(0);
    for (const g of Object.values(s.structure.toGeometries())) expect((g!.getAttribute('position').array as Float32Array).every(Number.isFinite)).toBe(true);
  });
  test('plans without fixtures get the example furniture', () => {
    const old = FLOORPLANS.find((f) => f.id === 2)!;
    expect(buildRoomScene(old).example).toBe(true);
    expect(buildRoomScene(plan).example).toBe(false);
  });
});

describe('walkability with furniture solids (반경 0.22m)', async () => {
  const { buildInterior } = await import('./buildInterior');
  const { isBlocked } = await import('./collision');
  const built = buildInterior(plan);
  const scene = buildRoomScene(plan);
  const colliders = [...built.wallPieces, ...scene.solids];
  const R = 0.22, STEP = 0.05;

  // 입구에서 시작하는 도달 가능 영역 (격자 flood fill)
  const reach = (() => {
    const key = (i: number, j: number) => `${i},${j}`;
    const start: [number, number] = [Math.round(built.spawn[0] / STEP), Math.round(built.spawn[2] / STEP)];
    const seen = new Set([key(...start)]);
    const q = [start];
    while (q.length) {
      const [i, j] = q.pop()!;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj, k = key(ni, nj);
        if (seen.has(k) || ni < -4 || nj < -4 || ni > 70 || nj > 150) continue;
        if (isBlocked(colliders, ni * STEP, nj * STEP, R)) continue;
        seen.add(k);
        q.push([ni, nj]);
      }
    }
    return (x: number, z: number) => seen.has(`${Math.round(x / STEP)},${Math.round(z / STEP)}`);
  })();

  test('spawn is free', () => expect(isBlocked(colliders, built.spawn[0], built.spawn[2], R)).toBe(false));
  test('from the entrance you can reach the living room, bathroom and utility room', () => {
    expect(reach(1.9, 3.0), '거실 가운데(조리대 앞 통로)').toBe(true);
    expect(reach(1.9, 6.3), '거실 아래(창가)').toBe(true);
    expect(reach(1.2, 1.9), '욕실 안').toBe(true);
    expect(reach(0.8, 6.55), '실외기실 안').toBe(true);
  });
  test('you cannot walk through the bed, the counter or the toilet', () => {
    expect(isBlocked(colliders, 0.56, 4.43, R)).toBe(true);
    expect(isBlocked(colliders, 2.59, 2.07, R)).toBe(true);
    expect(isBlocked(colliders, 0.47, 1.97, R)).toBe(true);
  });
  test('the corridor between the bed and the desk is passable', () => {
    expect(reach(1.6, 4.4)).toBe(true);
  });
});
