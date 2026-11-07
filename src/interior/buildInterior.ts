import type { FloorPlan } from '../api/types';

/** 벽 조각 하나 = 직육면체. rotationY 는 벽 방향(x축 기준, 라디안) */
export type Box = { center: [number, number, number]; size: [number, number, number]; rotationY: number };

/**
 * 평면도(m, x=오른쪽 y=아래) → three.js 좌표 (x, 높이, y) 의 벽 조각.
 * 문·창이 있는 벽은 열린 곳 좌우 + (문) 위 인방 / (창) 아래·위 조각으로 쪼갠다.
 */
export function buildInterior(fp: FloorPlan): { wallPieces: Box[]; floor: [number, number][][]; spawn: [number, number, number] } {
  const H = fp.ceilingHeight;
  const pieces: Box[] = [];

  fp.walls.forEach((w, i) => {
    const dx = w.to[0] - w.from[0], dy = w.to[1] - w.from[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const ux = dx / len, uy = dy / len;
    const rotationY = -Math.atan2(dy, dx);
    // 벽 위 구간 [a,b] (from 기준 거리) 와 높이 [y0,y1] 로 직육면체 하나
    const add = (a: number, b: number, y0: number, y1: number) => {
      if (b - a < 1e-6 || y1 - y0 < 1e-6) return;
      const mid = (a + b) / 2;
      pieces.push({ center: [w.from[0] + ux * mid, (y0 + y1) / 2, w.from[1] + uy * mid], size: [b - a, y1 - y0, w.thickness], rotationY });
    };
    const ops = fp.openings.filter((o) => o.wall === i).sort((p, q) => p.offset - q.offset);
    let cursor = 0;
    for (const o of ops) {
      const a = Math.max(o.offset, cursor), b = Math.min(o.offset + o.width, len);
      if (b <= a) continue;
      add(cursor, a, 0, H); // 열린 곳 왼쪽
      const top = o.sill + o.height;
      if (o.sill > 0) add(a, b, 0, o.sill); // 창 아래
      add(a, b, top, H); // 문 위 인방 / 창 위
      cursor = b;
    }
    add(cursor, len, 0, H);
  });

  // 입구에서 방 안쪽으로 0.8m: 입구가 놓인 벽의 법선 중 방 안쪽(방 폴리곤 안)을 고른다
  const [ex, ey] = fp.entrance;
  let spawn: [number, number, number] = [ex, 0, ey + 0.8];
  const wall = fp.walls.find((w) => distToSeg(ex, ey, w.from, w.to) < 0.05);
  if (wall) {
    const dx = wall.to[0] - wall.from[0], dy = wall.to[1] - wall.from[1], len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const inside = (x: number, y: number) => fp.rooms.some((r) => inPoly(x, y, r.polygon));
    const plus = inside(ex + nx * 0.8, ey + ny * 0.8), minus = inside(ex - nx * 0.8, ey - ny * 0.8);
    const sign = plus || !minus ? 1 : -1;
    spawn = [ex + nx * 0.8 * sign, 0, ey + ny * 0.8 * sign];
  }
  return { wallPieces: pieces, floor: fp.rooms.map((r) => r.polygon), spawn };
}

function distToSeg(px: number, py: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function inPoly(x: number, y: number, poly: [number, number][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
