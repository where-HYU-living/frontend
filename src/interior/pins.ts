import type { FloorPlan, Review } from '../api/types';
import { polygonBounds } from './geom';

/**
 * 핀 좌표 규칙: pin = [x, y, z] = three.js 장면 좌표.
 * 평면도 (x, y) 는 장면 (x, z) 이고 y 는 바닥에서의 높이(m). buildInterior 와 같은 규칙.
 */
export type Pin = [number, number, number];

const r2 = (n: number) => Math.round(n * 100) / 100;

export function pinFromPoint(p: { x: number; y: number; z: number }): Pin {
  return [r2(p.x), r2(p.y), r2(p.z)];
}

/** 평면도 위치(x,y)+높이 → 핀 */
export function pinFromPlan(planX: number, planY: number, height: number): Pin {
  return [r2(planX), r2(height), r2(planY)];
}

function planBounds(plan: FloorPlan) {
  const pts: [number, number][] = [...plan.walls.flatMap((w) => [w.from, w.to]), ...plan.rooms.flatMap((r) => r.polygon)];
  return pts.length ? polygonBounds(pts) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

/** 이 평면도 안에 있는 핀인지 (벽 두께 여유 0.3m, 높이는 바닥~천장) */
export function isPinInPlan(pin: readonly number[] | null | undefined, plan: FloorPlan): pin is Pin {
  if (!pin || pin.length !== 3 || !pin.every(Number.isFinite)) return false;
  const b = planBounds(plan), m = 0.3;
  return pin[0] >= b.minX - m && pin[0] <= b.maxX + m && pin[2] >= b.minY - m && pin[2] <= b.maxY + m && pin[1] >= -0.1 && pin[1] <= plan.ceilingHeight + 0.1;
}

/** 후기 중 이 평면도에 찍힌 핀 후기만 */
export function pinnedReviews(reviews: Review[] | undefined, plan: FloorPlan): (Review & { pin: Pin })[] {
  return (reviews ?? []).filter((r): r is Review & { pin: Pin } => isPinInPlan(r.pin, plan));
}

export const LONG_PRESS_MS = 550;
export const MOVE_SLOP_PX = 8;

/** 포인터 하나의 입력이 탭인지, 길게 누르기인지, 드래그인지 */
export function classifyPress(durationMs: number, movedPx: number): 'tap' | 'long' | 'drag' {
  if (movedPx > MOVE_SLOP_PX) return 'drag';
  return durationMs >= LONG_PRESS_MS ? 'long' : 'tap';
}
