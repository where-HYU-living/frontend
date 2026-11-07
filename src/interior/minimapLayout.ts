import type { FloorPlan } from '../api/types';
import { polygonBounds } from './geom';

/** 평면도 → 작은 SVG 미니맵 좌표. size = 긴 변 픽셀 */
export function minimapLayout(plan: FloorPlan, size = 110, pad = 6) {
  const pts: [number, number][] = [...plan.walls.flatMap((w) => [w.from, w.to]), ...plan.rooms.flatMap((r) => r.polygon)];
  const b = pts.length ? polygonBounds(pts) : { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const w = Math.max(b.maxX - b.minX, 0.1), h = Math.max(b.maxY - b.minY, 0.1);
  const scale = (size - pad * 2) / Math.max(w, h);
  const width = w * scale + pad * 2, height = h * scale + pad * 2;
  /** 장면 좌표(x, z) → 미니맵 픽셀 */
  const toMap = (x: number, z: number): [number, number] => [pad + (x - b.minX) * scale, pad + (z - b.minY) * scale];
  return { width, height, scale, toMap };
}
