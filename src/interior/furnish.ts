import type { FloorPlan } from '../api/types';
import { pointInPoly, polygonArea, polygonBounds, type Pt } from './geom';

export type FurnitureKind = 'bed' | 'desk' | 'wardrobe' | 'sofa' | 'tv' | 'counter' | 'fridge';
export type FurniturePart = { offset: [number, number, number]; size: [number, number, number]; color: string };
/** position 은 바닥 중심 (장면 좌표). 앞면은 로컬 +z, rotationY 로 방 안쪽을 향한다 */
export type Furniture = { kind: FurnitureKind; label: string; room: string; position: [number, number, number]; rotationY: number; size: [number, number, number]; parts: FurniturePart[] };

export type RoomUse = 'bedroom' | 'living' | 'kitchen' | 'none';

/** 방 이름으로 용도 추정. 모르면 'none'(가구 안 놓음) */
export function roomUse(name: string): RoomUse {
  if (/욕실|화장실|샤워|세탁|현관|베란다|발코니|다용도|복도|창고|보일러/.test(name)) return 'none';
  if (/거실|리빙|living|LDK/i.test(name)) return 'living';
  if (/주방|부엌|키친|kitchen/i.test(name)) return 'kitchen';
  if (/침실|원룸|룸|방|인실|bed|room|studio/i.test(name)) return 'bedroom';
  return 'none';
}

/** "2인실" 같은 이름의 인원수 (1~4), 없으면 1 */
export function occupantsOf(name: string): number {
  const m = /([1-4])\s*인/.exec(name);
  return m ? Number(m[1]) : 1;
}

type Spec = { kind: FurnitureKind; label: string; w: number; d: number; h: number };

/** 순서 = 우선순위. 방이 좁으면 뒤에서부터 못 놓고 빠진다 */
export function specsFor(use: RoomUse, areaM2: number, name: string): Spec[] {
  if (use === 'bedroom') {
    if (areaM2 < 3.5) return [];
    const n = occupantsOf(name), wide = areaM2 >= 12 && n === 1;
    const list: Spec[] = [];
    for (let i = 0; i < n; i++) {
      list.push({ kind: 'bed', label: '침대', w: wide ? 1.4 : 0.95, d: 2.0, h: 0.5 });
      list.push({ kind: 'desk', label: '책상', w: 1.2, d: 0.6, h: 0.74 });
    }
    list.push({ kind: 'wardrobe', label: '옷장', w: 0.9, d: 0.55, h: 1.9 });
    return list;
  }
  if (use === 'living') return areaM2 < 6 ? [] : [{ kind: 'sofa', label: '소파', w: 1.8, d: 0.85, h: 0.8 }, { kind: 'tv', label: '장식장', w: 1.4, d: 0.4, h: 0.5 }];
  if (use === 'kitchen') return areaM2 < 3 ? [] : [{ kind: 'counter', label: '조리대', w: 1.8, d: 0.6, h: 0.9 }, { kind: 'fridge', label: '냉장고', w: 0.6, d: 0.65, h: 1.7 }];
  return [];
}

const COLOR: Record<FurnitureKind, string> = { bed: '#b9a58a', desk: '#a98b66', wardrobe: '#d8d2c6', sofa: '#6f7f93', tv: '#5a4d43', counter: '#e4e0d8', fridge: '#cfd5d9' };

export function partsFor(kind: FurnitureKind, w: number, d: number, h: number): FurniturePart[] {
  const body: FurniturePart = { offset: [0, h / 2, 0], size: [w, h, d], color: COLOR[kind] };
  if (kind === 'bed') {
    return [
      { offset: [0, 0.15, 0], size: [w, 0.3, d], color: '#8a7560' }, // 프레임
      { offset: [0, 0.38, 0.05], size: [w - 0.06, 0.16, d - 0.12], color: '#f1ece4' }, // 매트리스
      { offset: [0, 0.5, -d / 2 + 0.3], size: [w - 0.3, 0.1, 0.35], color: '#ffffff' }, // 베개 (머리 쪽 = 벽)
    ];
  }
  if (kind === 'desk') return [{ offset: [0, 0.72, 0], size: [w, 0.04, d], color: COLOR.desk }, { offset: [-w / 2 + 0.04, 0.35, 0], size: [0.05, 0.7, d - 0.06], color: '#8c7352' }, { offset: [w / 2 - 0.04, 0.35, 0], size: [0.05, 0.7, d - 0.06], color: '#8c7352' }];
  if (kind === 'sofa') return [{ offset: [0, 0.22, 0.04], size: [w, 0.44, d - 0.08], color: COLOR.sofa }, { offset: [0, 0.6, -d / 2 + 0.1], size: [w, 0.5, 0.2], color: '#5d6c80' }];
  return [body];
}

/** 점과 축정렬 사각형(cx,cy,hw,hd) 사이 거리 */
function distToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x0 - px, 0, px - r.x1), dy = Math.max(r.y0 - py, 0, py - r.y1);
  return Math.hypot(dx, dy);
}
type Rect = { x0: number; y0: number; x1: number; y1: number };
const overlap = (a: Rect, b: Rect, pad: number) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad;

type Side = 'minY' | 'maxY' | 'minX' | 'maxX';
const SIDE_ROT: Record<Side, number> = { minY: 0, maxY: Math.PI, minX: Math.PI / 2, maxX: -Math.PI / 2 };

/**
 * 평면도의 방 이름·면적으로 추정한 '예시 배치'. 실제 가구 위치·치수가 아니다.
 * 가구는 벽에 붙이고(방 경계 사각형의 네 변), 문 앞·입구·창(키 큰 가구)은 비우며, 서로 겹치지 않게 한다.
 * 놓을 자리가 없는 가구는 건너뛴다. 같은 입력이면 항상 같은 결과.
 */
export function furnishPlan(fp: FloorPlan): Furniture[] {
  const out: Furniture[] = [];
  const gap = Math.max(0, ...fp.walls.map((w) => w.thickness)) / 2 + 0.02;

  const wallPoint = (wi: number, d: number): Pt | null => {
    const w = fp.walls[wi];
    if (!w) return null;
    const dx = w.to[0] - w.from[0], dy = w.to[1] - w.from[1], l = Math.hypot(dx, dy) || 1;
    return [w.from[0] + (dx / l) * d, w.from[1] + (dy / l) * d];
  };
  const doors = fp.openings.filter((o) => o.type === 'door').map((o) => ({ p: wallPoint(o.wall, o.offset + o.width / 2), r: o.width / 2 })).filter((d): d is { p: Pt; r: number } => !!d.p);
  const windows = fp.openings.filter((o) => o.type === 'window').map((o) => ({ p: wallPoint(o.wall, o.offset + o.width / 2), r: o.width / 2 })).filter((d): d is { p: Pt; r: number } => !!d.p);
  const clear: { p: Pt; r: number }[] = [...doors.map((d) => ({ p: d.p, r: d.r + 0.45 })), { p: fp.entrance, r: 0.9 }];

  for (const room of fp.rooms) {
    if (room.polygon.length < 3) continue;
    const area = polygonArea(room.polygon);
    const specs = specsFor(roomUse(room.name), area, room.name);
    if (!specs.length) continue;
    const bb = polygonBounds(room.polygon);
    const placed: Rect[] = [];

    for (const s of specs) {
      const sides: Side[] = ['minY', 'maxY', 'minX', 'maxX'];
      const cands: { rect: Rect; cx: number; cy: number; rot: number }[] = [];
      for (const side of sides) {
        const horizontal = side === 'minY' || side === 'maxY';
        const fw = horizontal ? s.w : s.d, fd = horizontal ? s.d : s.w; // 사각형 가로(x)·세로(y)
        const span = horizontal ? bb.maxX - bb.minX : bb.maxY - bb.minY;
        const along = s.w;
        if (along + 2 * gap > span) continue;
        const ts = [0, 1, 0.5].map((t) => gap + (span - along - 2 * gap) * t); // 모서리 → 반대 모서리 → 가운데
        for (const t of ts) {
          let cx: number, cy: number;
          if (side === 'minY') { cx = bb.minX + t + fw / 2; cy = bb.minY + gap + fd / 2; }
          else if (side === 'maxY') { cx = bb.minX + t + fw / 2; cy = bb.maxY - gap - fd / 2; }
          else if (side === 'minX') { cx = bb.minX + gap + fw / 2; cy = bb.minY + t + fd / 2; }
          else { cx = bb.maxX - gap - fw / 2; cy = bb.minY + t + fd / 2; }
          cands.push({ rect: { x0: cx - fw / 2, y0: cy - fd / 2, x1: cx + fw / 2, y1: cy + fd / 2 }, cx, cy, rot: SIDE_ROT[side] });
        }
      }
      const ok = cands.find(({ rect: r }) =>
        [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1], [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]].every(([x, y]) => pointInPoly(x, y, room.polygon)) &&
        !placed.some((p) => overlap(r, p, 0.05)) &&
        !clear.some((c) => distToRect(c.p[0], c.p[1], r) < c.r) &&
        !(s.h > 1.0 && windows.some((c) => distToRect(c.p[0], c.p[1], r) < c.r)));
      if (!ok) continue;
      placed.push(ok.rect);
      out.push({ kind: s.kind, label: s.label, room: room.name, position: [ok.cx, 0, ok.cy], rotationY: ok.rot, size: [s.w, s.h, s.d], parts: partsFor(s.kind, s.w, s.d, s.h) });
    }
  }
  return out;
}
