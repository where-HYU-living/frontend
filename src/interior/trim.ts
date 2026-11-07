import type { FloorPlan } from '../api/types';
import type { Box } from './buildInterior';

export type DoorLeaf = { pivot: [number, number, number]; rotationY: number; size: [number, number, number] };
export type Trim = { frames: Box[]; glass: Box[]; leaves: DoorLeaf[]; baseboards: Box[] };

const FRAME = 0.05;
const BASE_H = 0.09;
const BASE_T = 0.014;
const SWING = 1.25; // 문짝을 약 72° 열어 둔다 (라디안)

/** 문틀·문짝(열린 형태)·창틀·유리·걸레받이 조각. 벽 조각(buildInterior)과 같은 좌표 규칙 */
export function buildTrim(fp: FloorPlan): Trim {
  const out: Trim = { frames: [], glass: [], leaves: [], baseboards: [] };
  fp.walls.forEach((w, i) => {
    const dx = w.to[0] - w.from[0], dy = w.to[1] - w.from[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const rotationY = -Math.atan2(dy, dx);
    const at = (d: number, y: number, side = 0): [number, number, number] => [w.from[0] + ux * d + nx * side, y, w.from[1] + uy * d + ny * side];
    const box = (list: Box[], a: number, b: number, y0: number, y1: number, depth: number, side = 0) => {
      if (b - a < 1e-6 || y1 - y0 < 1e-6) return;
      list.push({ center: at((a + b) / 2, (y0 + y1) / 2, side), size: [b - a, y1 - y0, depth], rotationY });
    };
    const fd = w.thickness + 0.04; // 틀은 벽보다 살짝 두껍게
    const ops = fp.openings.filter((o) => o.wall === i).map((o) => ({ o, a: Math.max(0, o.offset), b: Math.min(len, o.offset + o.width) })).filter((x) => x.b > x.a);

    for (const { o, a, b } of ops) {
      const top = o.sill + o.height;
      if (o.type === 'door') {
        box(out.frames, a, a + FRAME, 0, top, fd);
        box(out.frames, b - FRAME, b, 0, top, fd);
        box(out.frames, a, b, top - FRAME, top, fd);
        const lw = b - a - 0.06;
        if (lw > 0.3) out.leaves.push({ pivot: at(a + 0.03, 0), rotationY: rotationY - SWING, size: [lw, top - 0.03, 0.04] });
      } else {
        box(out.frames, a, a + FRAME, o.sill, top, fd);
        box(out.frames, b - FRAME, b, o.sill, top, fd);
        box(out.frames, a, b, o.sill, o.sill + FRAME, fd + 0.04); // 창턱
        box(out.frames, a, b, top - FRAME, top, fd);
        box(out.frames, (a + b) / 2 - 0.015, (a + b) / 2 + 0.015, o.sill, top, 0.04); // 가운데 살
        box(out.glass, a + FRAME, b - FRAME, o.sill + FRAME, top - FRAME, 0.01);
      }
    }

    // 걸레받이: 문 자리는 비운다. 양면
    const doors = ops.filter((x) => x.o.type === 'door').sort((p, q) => p.a - q.a);
    let cur = 0;
    const spans: [number, number][] = [];
    for (const d of doors) { if (d.a > cur) spans.push([cur, d.a]); cur = Math.max(cur, d.b); }
    if (len > cur) spans.push([cur, len]);
    for (const [a, b] of spans) for (const s of [1, -1]) box(out.baseboards, a, b, 0, BASE_H, BASE_T, s * (w.thickness / 2 + BASE_T / 2));
  });
  return out;
}
