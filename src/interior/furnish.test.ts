import { expect, test } from 'vitest';
import { furnishPlan, occupantsOf, roomUse, specsFor } from './furnish';
import { pointInPoly } from './geom';
import type { FloorPlan } from '../api/types';

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const plan = (o: Partial<FloorPlan> = {}): FloorPlan => ({
  id: 1, name: 't', areaM2: 20, ceilingHeight: 2.4,
  walls: [{ from: [0, 0], to: [4, 0], thickness: 0.15 }, { from: [4, 0], to: [4, 5], thickness: 0.15 }, { from: [4, 5], to: [0, 5], thickness: 0.15 }, { from: [0, 5], to: [0, 0], thickness: 0.15 }],
  openings: [{ type: 'door', wall: 0, offset: 1.5, width: 0.9, height: 2.1, sill: 0 }],
  rooms: [{ name: '침실', polygon: rect(0, 0, 4, 5) }], entrance: [1.95, 0], glbUrl: null, ...o,
});

test('room use from names', () => {
  expect(roomUse('침실')).toBe('bedroom');
  expect(roomUse('원룸')).toBe('bedroom');
  expect(roomUse('2인실')).toBe('bedroom');
  expect(roomUse('거실')).toBe('living');
  expect(roomUse('주방')).toBe('kitchen');
  expect(roomUse('욕실')).toBe('none');
  expect(roomUse('현관')).toBe('none');
  expect(roomUse('???')).toBe('none');
  expect(occupantsOf('4인실')).toBe(4);
  expect(occupantsOf('침실')).toBe(1);
});

test('tiny rooms get nothing, bedroom gets bed desk wardrobe', () => {
  expect(specsFor('bedroom', 2, '침실')).toEqual([]);
  expect(furnishPlan(plan()).map((f) => f.kind).sort()).toEqual(['bed', 'desk', 'wardrobe']);
});

test('is deterministic and keeps everything inside the room, off the door and entrance', () => {
  const p = plan();
  const a = furnishPlan(p), b = furnishPlan(p);
  expect(a).toEqual(b);
  for (const f of a) {
    const [x, , z] = f.position;
    expect(pointInPoly(x, z, p.rooms[0].polygon)).toBe(true);
    expect(Math.hypot(x - 1.95, z - 0)).toBeGreaterThan(0.9); // 입구 중심에서 떨어짐
  }
});

test('furniture does not overlap each other', () => {
  const a = furnishPlan(plan({ rooms: [{ name: '2인실', polygon: rect(0, 0, 4, 5) }] }));
  expect(a.filter((f) => f.kind === 'bed')).toHaveLength(2);
  const box = (f: (typeof a)[number]) => { const q = Math.abs(Math.sin(f.rotationY)) > 0.5; const w = q ? f.size[2] : f.size[0], d = q ? f.size[0] : f.size[2]; return [f.position[0] - w / 2, f.position[2] - d / 2, f.position[0] + w / 2, f.position[2] + d / 2]; };
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    const p = box(a[i]), q = box(a[j]);
    expect(p[0] < q[2] && p[2] > q[0] && p[1] < q[3] && p[3] > q[1], `${a[i].kind}/${a[j].kind}`).toBe(false);
  }
});

test('items hug a wall of the room bounds', () => {
  const p = plan();
  for (const f of furnishPlan(p)) {
    const q = Math.abs(Math.sin(f.rotationY)) > 0.5;
    const hx = (q ? f.size[2] : f.size[0]) / 2, hz = (q ? f.size[0] : f.size[2]) / 2;
    const gaps = [f.position[0] - hx, 4 - (f.position[0] + hx), f.position[2] - hz, 5 - (f.position[2] + hz)];
    expect(Math.min(...gaps)).toBeLessThan(0.15);
  }
});

test('too-small room places only what fits; bathroom and unknown rooms stay empty', () => {
  expect(furnishPlan(plan({ rooms: [{ name: '욕실', polygon: rect(0, 0, 4, 5) }] }))).toEqual([]);
  const small = furnishPlan(plan({ rooms: [{ name: '침실', polygon: rect(0, 0, 1.8, 2.2) }] }));
  expect(small.length).toBeLessThan(3);
});

test('tall furniture stays away from a window', () => {
  const p = plan({ openings: [{ type: 'window', wall: 2, offset: 0.2, width: 3.6, height: 1.2, sill: 0.9 }] });
  expect(furnishPlan(p).find((f) => f.kind === 'wardrobe')).toBeTruthy();
  const w = furnishPlan(p).find((f) => f.kind === 'wardrobe')!;
  expect(w.position[2]).toBeLessThan(4); // 아래쪽(창이 있는 y=5) 벽에는 안 붙음
});
