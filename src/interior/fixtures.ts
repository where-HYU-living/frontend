import type { FixtureKind, FloorPlan } from '../api/types';
import type { Box } from './buildInterior';
import type { Furniture } from './furnish';
import { pointInPoly } from './geom';
import { MeshBuilder, rotY, type Color, type MatKey, type Pt } from './meshBuilder';

export type Facing = 'N' | 'E' | 'S' | 'W';
/** 평면도 위치(x, y)·크기가 확정된 설비. size = [가로(앞에서 본 폭), 깊이, 높이] */
export type PlacedFixture = {
  kind: FixtureKind; x: number; y: number; facing: Facing; size: [number, number, number];
  /** 바닥에서 몸체 밑면까지 (조리대 위 인덕션·싱크, 벽걸이 수납장·보일러) */
  baseY: number;
  /** 조리대와 겹쳐 있는지 (인덕션·싱크가 조리대 위에 얹힌다) */
  onCounter: boolean;
  room?: string;
};

/** 앞면(local +z)이 향하는 방향 → 장면 Y 회전. S=0, E=π/2, N=π, W=-π/2 (furnish.ts 의 SIDE_ROT 와 같은 규칙) */
export const FACING_ROT: Record<Facing, number> = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };
const FACING_VEC: Record<Facing, Pt> = { S: [0, 1], E: [1, 0], N: [0, -1], W: [-1, 0] };

export const DEFAULT_SIZE: Record<FixtureKind, [number, number, number]> = {
  toilet: [0.38, 0.7, 0.78], sink: [0.5, 0.4, 0.85], shower: [0.8, 0.8, 2.1], bathtub: [0.7, 1.5, 0.55], washer: [0.6, 0.6, 0.85],
  kitchenSink: [0.55, 0.45, 0.2], cooktop: [0.5, 0.42, 0.03], fridge: [0.6, 0.65, 1.7], kitchenCounter: [1.8, 0.6, 0.85], upperCabinet: [0.8, 0.35, 0.7],
  bed: [1.0, 2.0, 0.5], desk: [1.2, 0.6, 0.74], chair: [0.45, 0.45, 0.9], wardrobe: [0.9, 0.55, 1.9], builtinWardrobe: [1.0, 0.55, 2.1],
  shoeRack: [0.9, 0.35, 1.0], shelf: [0.9, 0.3, 1.0], sofa: [1.8, 0.85, 0.8], tv: [1.4, 0.4, 0.5], table: [0.8, 0.8, 0.74],
  acOutdoor: [0.8, 0.3, 0.55], waterHeater: [0.4, 0.25, 0.6],
};
const BASE_Y: Partial<Record<FixtureKind, number>> = { cooktop: 0.85, kitchenSink: 0.85, upperCabinet: 1.4, waterHeater: 0.9 };
/** 몸체 뒷면을 벽에 붙이는 종류 */
const WALL_BACKED = new Set<FixtureKind>(['shower', 'toilet', 'sink', 'kitchenCounter', 'fridge', 'upperCabinet', 'wardrobe', 'builtinWardrobe', 'shoeRack', 'shelf', 'washer', 'acOutdoor', 'waterHeater', 'desk', 'bathtub', 'tv', 'sofa']);
/** 이 종류의 현실적인 깊이 상한(m). 이보다 깊고 폭은 상한 안이면 폭·깊이를 뒤바꿔 적은 것으로 의심한다 */
export const MAX_DEPTH: Partial<Record<FixtureKind, number>> = { wardrobe: 0.95, builtinWardrobe: 0.95, shoeRack: 0.75, kitchenCounter: 0.95, upperCabinet: 0.65, shelf: 0.75, tv: 0.75, desk: 0.95, washer: 0.8, fridge: 0.95 };
/** 지나다닐 수 있는(충돌 없는) 것 */
const NON_SOLID = new Set<FixtureKind>(['shower', 'cooktop', 'kitchenSink', 'upperCabinet', 'waterHeater']);
/** 걸어 다닐 때 막히는 종류인지 */
export function isSolidKind(k: FixtureKind) { return !NON_SOLID.has(k); }

/** 점 (x, y) 가 설비 바닥 사각형 안인지 (pad 만큼 여유) */
function inFootprint(f: PlacedFixture, x: number, y: number, pad = 0.05): boolean {
  const a = FACING_ROT[f.facing], ax = rotY(1, 0, a), az = rotY(0, 1, a), dx = x - f.x, dy = y - f.y;
  return Math.abs(dx * ax[0] + dy * ax[1]) <= f.size[0] / 2 + pad && Math.abs(dx * az[0] + dy * az[1]) <= f.size[1] / 2 + pad;
}

/** 뒷면이 벽 안쪽 면에서 조금 떠 있거나(≤9cm) 벽 반두께 안으로 파묻혀 있으면 딱 붙인다 */
function snapToWall(plan: FloorPlan, p: PlacedFixture) {
  const f = FACING_VEC[p.facing], d = p.size[1];
  let best: { gap: number } | null = null;
  for (const w of plan.walls) {
    const dx = w.to[0] - w.from[0], dy = w.to[1] - w.from[1], len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const u: Pt = [dx / len, dy / len];
    if (Math.abs(u[0] * f[0] + u[1] * f[1]) > 0.05) continue; // 벽이 앞면과 직각이어야 한다 (벽면이 앞면과 평행)
    const wf = w.from[0] * f[0] + w.from[1] * f[1], pf = p.x * f[0] + p.y * f[1];
    if (pf < wf) continue; // 설비가 벽의 앞쪽에 있어야 한다
    const lc = (p.x - w.from[0]) * u[0] + (p.y - w.from[1]) * u[1];
    if (lc < -0.05 || lc > len + 0.05) continue;
    const gap = pf - d / 2 - (wf + w.thickness / 2);
    if (gap < -(w.thickness / 2 + 0.03) || gap > 0.09) continue; // AI 가 벽 중심선에 맞춰 잡으면 벽 반두께만큼 파고든다 → 밀어낸다
    if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { gap };
  }
  if (best) { p.x -= f[0] * best.gap; p.y -= f[1] * best.gap; }
}

/**
 * 설비를 마주 보는 벽 사이 빈 공간 안으로 맞춘다 (벽끼리 직각인 평면도 기준).
 * AI 는 벽 중심선 기준으로 좌표·크기를 잡는 경향이 있어, 가구가 벽 반두께만큼 파묻히거나 양쪽 벽 사이 틈보다 넓게 적히는 일이 흔하다.
 * 각 축(폭·깊이)마다: 양쪽 벽의 안쪽 면 사이 틈을 구해, 가구가 틈보다 크면 틈에 맞게 줄이고(최대 35% 또는 30cm 까지) 가운데에 놓고,
 * 틈 안이면 벽에서 파고든 만큼만 밀어낸다. 한쪽에만 벽이 있으면 그 벽에서 밀어낸다. 16cm 넘게 파고든 건 의도된 배치로 보고 건드리지 않는다.
 */
function fitBetweenWalls(plan: FloorPlan, p: PlacedFixture) {
  const a = FACING_ROT[p.facing];
  const axes: [Pt, Pt, 0 | 1][] = [[rotY(1, 0, a), rotY(0, 1, a), 0], [rotY(0, 1, a), rotY(1, 0, a), 1]]; // [이 축 방향, 다른 축 방향, size 인덱스]
  for (let pass = 0; pass < 2; pass++) for (const [e, f, si] of axes) {
    const ext = p.size[si], extF = p.size[1 - si];
    const c0 = p.x * e[0] + p.y * e[1], f0 = p.x * f[0] + p.y * f[1];
    let left = -Infinity, right = Infinity;
    for (const w of plan.walls) {
      const dx = w.to[0] - w.from[0], dy = w.to[1] - w.from[1], len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const n: Pt = [-dy / len, dx / len];
      if (Math.abs(n[0] * e[0] + n[1] * e[1]) < 0.99) continue; // 이 축에 수직으로 서 있는 벽만
      const half = w.thickness / 2, pc = w.from[0] * e[0] + w.from[1] * e[1];
      const f1 = w.from[0] * f[0] + w.from[1] * f[1], f2 = w.to[0] * f[0] + w.to[1] * f[1];
      if (Math.min(f1, f2) - half > f0 + extF / 2 - 0.02 || Math.max(f1, f2) + half < f0 - extF / 2 + 0.02) continue; // 가구 옆으로 지나가는 벽이 아님
      if (pc < c0) { const inner = pc + half; if (inner > c0 - ext / 2 - 0.16 && inner < c0) left = Math.max(left, inner); }
      else { const inner = pc - half; if (inner < c0 + ext / 2 + 0.16 && inner > c0) right = Math.min(right, inner); }
    }
    let lo = c0 - ext / 2, hi = c0 + ext / 2;
    if (left !== -Infinity && right !== Infinity && right - left < ext - 0.004) {
      const gap = right - left;
      if (ext - gap > Math.min(0.3, ext * 0.35) || gap < 0.2) continue; // 너무 많이 줄여야 하면 의도된 배치로 보고 둔다
      lo = left; hi = right;
      p.size[si] = gap;
    } else {
      if (left !== -Infinity && lo < left) { hi += left - lo; lo = left; }
      if (right !== Infinity && hi > right) { lo -= hi - right; hi = right; }
    }
    const shift = (lo + hi) / 2 - c0;
    p.x += e[0] * shift; p.y += e[1] * shift;
  }
}

/** 점에서 다각형 변까지의 최소 거리 */
function distToPolygon(x: number, y: number, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/** 설비 바닥 사각형의 네 모서리 (평면 좌표) */
export function footprint(p: Pick<PlacedFixture, 'x' | 'y' | 'facing' | 'size'>): Pt[] {
  const a = FACING_ROT[p.facing], hw = p.size[0] / 2, hd = p.size[1] / 2;
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as Pt[]).map(([lx, lz]) => { const [x, z] = rotY(lx, lz, a); return [p.x + x, p.y + z] as Pt; });
}

/** 축에 나란한 바깥 사각형 (설비는 N/E/S/W 로만 놓이므로 축 정렬) */
function aabb(p: Pick<PlacedFixture, 'x' | 'y' | 'facing' | 'size'>) {
  const c = footprint(p), xs = c.map((q) => q[0]), ys = c.map((q) => q[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/**
 * 문이 드나드는 자리(문 폭 × 양쪽 35cm)를 막은 가구는 벽을 따라 비켜 놓는다 (70cm 까지만).
 * 3D 그림만 있는 도면처럼 치수 없이 AI 가 추정한 배치에서, 세면대·신발장이 문 앞에 놓여 욕실에 못 들어가는 일이 흔하다.
 * 비킨 자리가 자기 방 안이고, 벽을 파고들지 않고, 다른 가구와 겹치지 않을 때만 적용한다 (아니면 원래 자리 그대로).
 */
function clearDoorways(plan: FloorPlan, placed: PlacedFixture[]) {
  for (const o of plan.openings) {
    const w = plan.walls[o.wall];
    if (o.type !== 'door' || !w || o.style === 'open') continue;
    const dx = w.to[0] - w.from[0], dy = w.to[1] - w.from[1], len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const u: Pt = [dx / len, dy / len], n: Pt = [-u[1], u[0]], reach = w.thickness / 2 + 0.35;
    const a = Math.max(0, o.offset), b = Math.min(len, o.offset + o.width);
    const span = (p: PlacedFixture) => {
      const cs = footprint(p);
      return { al: cs.map((c) => (c[0] - w.from[0]) * u[0] + (c[1] - w.from[1]) * u[1]), ac: cs.map((c) => (c[0] - w.from[0]) * n[0] + (c[1] - w.from[1]) * n[1]) };
    };
    const blocks = (p: PlacedFixture) => {
      const { al, ac } = span(p);
      return !(Math.max(...ac) < -reach || Math.min(...ac) > reach || Math.max(...al) <= a + 0.03 || Math.min(...al) >= b - 0.03);
    };
    for (const p of placed) {
      if (!isSolidKind(p.kind) || p.baseY > 1.2 || !blocks(p)) continue;
      const { al } = span(p);
      const cands = [b - Math.min(...al) + 0.03, a - Math.max(...al) - 0.03].filter((s) => Math.abs(s) <= 0.7).sort((x, y) => Math.abs(x) - Math.abs(y));
      const room = plan.rooms.find((r) => r.name === p.room);
      const orig = { x: p.x, y: p.y, size: [...p.size] as PlacedFixture['size'] };
      let done = false;
      for (const s of cands) {
        p.x = orig.x + u[0] * s; p.y = orig.y + u[1] * s; p.size = [...orig.size];
        fitBetweenWalls(plan, p);
        const me = aabb(p);
        const inRoom = !room || footprint(p).every(([x, y]) => pointInPoly(x, y, room.polygon.map(([px, py]) => [px, py] as Pt)) || distToPolygon(x, y, room.polygon) < 0.12); // 벽 두께 안쪽 면까지 허용
        const clash = placed.some((q) => q !== p && isSolidKind(q.kind) && q.baseY < p.baseY + p.size[2] && p.baseY < q.baseY + q.size[2] && (() => { const o2 = aabb(q); return Math.min(me.x1, o2.x1) - Math.max(me.x0, o2.x0) > 0.02 && Math.min(me.y1, o2.y1) - Math.max(me.y0, o2.y0) > 0.02; })());
        if (inRoom && !clash && !blocks(p)) { done = true; break; }
      }
      if (!done) { p.x = orig.x; p.y = orig.y; p.size = orig.size; }
    }
  }
}

/** 겹친 L자 주방의 조리대끼리는 짧게 줄여도 되는 쪽의 끝을 잘라 맞닿게 한다 (윗면이 같은 평면이라 깜박이는 것도 막는다) */
function trimOverlappingCounters(placed: PlacedFixture[]) {
  const cs = placed.filter((p) => p.kind === 'kitchenCounter');
  const box = (p: PlacedFixture) => { const c = footprint(p), xs = c.map((q) => q[0]), ys = c.map((q) => q[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const A = box(cs[i]), B = box(cs[j]);
    const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
    if (ox <= 0.01 || oy <= 0.01) continue;
    // 각 조리대의 폭 방향(N/S 면 x, E/W 면 y)으로 자를 양
    const lateral = (p: PlacedFixture) => (p.facing === 'N' || p.facing === 'S' ? 'x' : 'y');
    const costA = lateral(cs[i]) === 'x' ? ox : oy, costB = lateral(cs[j]) === 'x' ? ox : oy;
    const [t, other, cost] = costA <= costB ? [cs[i], B, costA] : [cs[j], A, costB];
    if (cost > t.size[0] * 0.5) continue;
    const bx = box(t), ax = lateral(t) === 'x' ? 'x' : 'y';
    const tc = ax === 'x' ? (bx.x0 + bx.x1) / 2 : (bx.y0 + bx.y1) / 2, oc = ax === 'x' ? (other.x0 + other.x1) / 2 : (other.y0 + other.y1) / 2;
    const dir = tc >= oc ? 1 : -1; // 겹침의 반대쪽으로 중심이 밀려난다
    t.size = [t.size[0] - cost, t.size[1], t.size[2]];
    if (ax === 'x') t.x += (dir * cost) / 2; else t.y += (dir * cost) / 2;
  }
}

export function placeFixtures(plan: FloorPlan, list: NonNullable<FloorPlan['fixtures']> = plan.fixtures ?? []): PlacedFixture[] {
  const placed: PlacedFixture[] = list.map((f) => {
    const d = DEFAULT_SIZE[f.kind] ?? [0.5, 0.5, 0.8], s = f.size;
    return {
      kind: f.kind, x: f.position[0], y: f.position[1], facing: f.facing,
      size: [s?.[0] ?? d[0], s?.[1] ?? d[1], s?.[2] ?? d[2]], baseY: f.elevation ?? BASE_Y[f.kind] ?? 0, onCounter: false, room: f.room,
    };
  });
  for (const p of placed) { if (WALL_BACKED.has(p.kind)) snapToWall(plan, p); if (p.kind !== 'shower') fitBetweenWalls(plan, p); }
  const counters = placed.filter((p) => p.kind === 'kitchenCounter');
  for (const p of placed) {
    const over = counters.some((c) => c !== p && inFootprint(c, p.x, p.y, 0.02));
    if (p.kind === 'cooktop' || p.kind === 'kitchenSink') p.onCounter = over;
    else if (over && (p.kind === 'fridge' || p.kind === 'washer')) {
      // 조리대 라인에 끼워 넣은 가전: 앞면·윗면이 조리대와 같은 평면이 되어 깜박이지 않게 살짝 내민다
      const v = FACING_VEC[p.facing];
      p.size = [p.size[0], p.size[1] + 0.02, p.size[2] + 0.01];
      p.x += v[0] * 0.01; p.y += v[1] * 0.01;
    }
  }
  trimOverlappingCounters(placed);
  clearDoorways(plan, placed);
  // 같은 조리대에 나란히 놓인 인덕션·싱크가 겹치면 윗면이 같은 평면이라 깜박인다 → 두 폭을 줄여 맞춘다
  const hobs = placed.filter((p) => p.kind === 'cooktop'), sinks = placed.filter((p) => p.kind === 'kitchenSink');
  for (const h of hobs) for (const k of sinks) {
    if (h.facing !== k.facing) continue;
    const dist = h.facing === 'N' || h.facing === 'S' ? Math.abs(h.x - k.x) : Math.abs(h.y - k.y);
    const need = (h.size[0] + k.size[0]) / 2;
    if (dist < 0.2 || need <= dist - 0.01) continue; // 거의 같은 자리(다른 조리대)거나 이미 안 겹침
    const scale = Math.max(0.6, ((dist - 0.01) * 2) / (h.size[0] + k.size[0]));
    h.size = [h.size[0] * scale, h.size[1], h.size[2]]; k.size = [k.size[0] * scale, k.size[1], k.size[2]];
  }
  return placed;
}

/** 평면도에 설비가 없을 때 쓰는 예시 가구(furnish.ts)를 같은 형식으로 */
export function fixturesFromFurniture(list: Furniture[]): NonNullable<FloorPlan['fixtures']> {
  const KIND: Record<Furniture['kind'], FixtureKind> = { bed: 'bed', desk: 'desk', wardrobe: 'wardrobe', sofa: 'sofa', tv: 'tv', counter: 'kitchenCounter', fridge: 'fridge' };
  const facingOf = (r: number): Facing => {
    const q = ((Math.round(r / (Math.PI / 2)) % 4) + 4) % 4;
    return (['S', 'E', 'N', 'W'] as const)[q];
  };
  return list.map((f) => ({ kind: KIND[f.kind], position: [f.position[0], f.position[2]] as [number, number], facing: facingOf(f.rotationY), size: [f.size[0], f.size[2], f.size[1]] as [number, number, number], room: f.room }));
}

/** 충돌용 상자. 장면 좌표(x, 높이, z)이고 rotationY 는 three 의 mesh.rotation.y 와 같다 */
export function fixtureSolids(placed: PlacedFixture[]): Box[] {
  return placed.filter((p) => !NON_SOLID.has(p.kind)).map((p) => ({
    center: [p.x, p.baseY + p.size[2] / 2, p.y], size: [p.size[0], p.size[2], p.size[1]], rotationY: FACING_ROT[p.facing], solid: true,
  }));
}

// ───────────────────────── 모양 ─────────────────────────

const WHITE = '#f3f1ec', CERAMIC = '#f8f9f9', STEEL = '#c6cacd', DARK = '#2b2e33', WOOD = '#c8a273', WOOD_DARK = '#8a6a4b';

/** 설비 로컬 좌표(바닥 접지 면 중심 원점, 앞면 +z)로 상자·원기둥을 놓는 도우미 */
class Local {
  private a: number;
  constructor(private mb: MeshBuilder, private p: PlacedFixture) { this.a = FACING_ROT[p.facing]; }
  /** cy = 몸체 밑면 기준 높이(m) */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, key: MatKey, color: Color) {
    const [wx, wz] = rotY(cx, cz, this.a);
    this.mb.box({ center: [this.p.x + wx, this.p.baseY + cy + sy / 2, this.p.y + wz], size: [sx, sy, sz], rotY: this.a, all: { key, color } });
  }
  cyl(cx: number, cy: number, cz: number, rx: number, rz: number, h: number, key: MatKey, color: Color, top = 1, capBottom = false) {
    const [wx, wz] = rotY(cx, cz, this.a);
    this.mb.cyl({ center: [this.p.x + wx, this.p.baseY + cy, this.p.y + wz], rx, rz, h, key, color, rotY: this.a, top, seg: 18, capBottom });
  }
}

type Builder = (l: Local, w: number, d: number, h: number, p: PlacedFixture) => void;

const doors = (l: Local, w: number, d: number, y0: number, hh: number, color: Color, gapColor: Color, handle = true) => {
  const n = Math.max(1, Math.round(w / 0.45)), dw = w / n;
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + dw * (i + 0.5);
    l.box(cx, y0, d / 2 - 0.006, dw - 0.006, hh, 0.02, 'matte', color); // 앞면이 몸체보다 4mm 나와서 같은 평면이 안 된다
    if (handle) l.box(cx + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), y0 + hh - 0.1, d / 2 + 0.008, 0.012, 0.09, 0.014, 'metal', STEEL);
  }
  for (let i = 1; i < n; i++) l.box(-w / 2 + dw * i, y0, d / 2 - 0.004, 0.006, hh, 0.012, 'matte', gapColor);
};

const counter: Builder = (l, w, d, h) => {
  l.box(0, 0, -0.04, w - 0.02, 0.08, d - 0.08, 'matte', '#3a3d42'); // 걸레받이(발받침)
  l.box(0, 0.08, 0, w, h - 0.12, d - 0.02, 'matte', '#f1eee7'); // 몸체
  doors(l, w, d - 0.02, 0.08, h - 0.12, '#f6f3ec', '#cfc9bc');
  l.box(0, h - 0.04, 0.005, w, 0.04, d + 0.01, 'gloss', '#d8d5ce'); // 상판
};

const BUILD: Partial<Record<FixtureKind, Builder>> = {
  toilet: (l, w, d, h) => {
    l.cyl(0, 0, d * 0.16, w * 0.46, d * 0.34, 0.4, 'gloss', CERAMIC, 0.92); // 변기 본체
    l.cyl(0, 0.4, d * 0.16, w * 0.46 * 0.92, d * 0.34 * 0.92, 0.012, 'gloss', '#e6e9ea'); // 변좌
    l.box(0, 0, -d * 0.3, w * 0.6, 0.4, d * 0.22, 'gloss', CERAMIC); // 뒤쪽 받침
    l.box(0, 0.4, -d / 2 + 0.1, w * 0.96, h - 0.4, 0.2, 'gloss', CERAMIC); // 물탱크
    l.cyl(0, h, -d / 2 + 0.1, 0.022, 0.022, 0.012, 'metal', STEEL); // 물 내림 버튼
  },
  sink: (l, w, d, h) => {
    l.box(0, 0, -d / 2 + 0.1, 0.1, h - 0.12, 0.1, 'gloss', CERAMIC); // 기둥
    l.box(0, h - 0.12, 0, w, 0.12, d, 'gloss', CERAMIC); // 세면대
    l.cyl(0, h, 0.02, w * 0.36, d * 0.34, 0.003, 'gloss', '#dde1e3'); // 물 받는 곳
    l.cyl(0, h + 0.003, 0.02, 0.025, 0.025, 0.002, 'matte', DARK); // 배수구
    l.cyl(0, h, -d / 2 + 0.07, 0.016, 0.016, 0.12, 'metal', STEEL); // 수전
    l.box(0, h + 0.1, -d / 2 + 0.14, 0.014, 0.014, 0.13, 'metal', STEEL);
    l.box(0, 1.1, -d / 2 + 0.006, w * 0.95, 0.75, 0.012, 'metal', '#e6ecee'); // 거울
  },
  shower: (l, w, d) => {
    l.cyl(0, 0, 0, 0.05, 0.05, 0.004, 'matte', DARK); // 배수구
    l.cyl(0, 0.85, -d / 2 + 0.05, 0.011, 0.011, 1.15, 'metal', STEEL); // 샤워 레일
    l.box(0, 1.98, -d / 2 + 0.15, 0.012, 0.012, 0.2, 'metal', STEEL);
    l.cyl(0, 1.96, -d / 2 + 0.25, 0.085, 0.085, 0.018, 'metal', STEEL, 1, true); // 샤워 헤드
    l.box(0, 1.05, -d / 2 + 0.02, 0.16, 0.07, 0.04, 'metal', STEEL); // 수전
  },
  bathtub: (l, w, d, h) => {
    const t = 0.06;
    l.box(0, 0, 0, w, 0.08, d, 'gloss', '#e9eded');
    l.box(-w / 2 + t / 2, 0.08, 0, t, h - 0.08, d, 'gloss', CERAMIC); l.box(w / 2 - t / 2, 0.08, 0, t, h - 0.08, d, 'gloss', CERAMIC);
    l.box(0, 0.08, -d / 2 + t / 2, w - 2 * t, h - 0.08, t, 'gloss', CERAMIC); l.box(0, 0.08, d / 2 - t / 2, w - 2 * t, h - 0.08, t, 'gloss', CERAMIC);
  },
  washer: (l, w, d, h) => {
    l.box(0, 0, 0, w, h, d, 'gloss', '#eef0f1');
    l.box(0, h * 0.28, d / 2 + 0.003, w * 0.62, w * 0.62, 0.012, 'glass', '#46505a');
    l.box(0, h - 0.1, d / 2 + 0.003, w * 0.8, 0.07, 0.01, 'matte', '#c9ced2');
  },
  kitchenCounter: counter,
  cooktop: (l, w, d) => {
    l.box(0, 0, 0, w, 0.012, d, 'gloss', '#15171a');
    for (const sx of [-1, 1]) l.cyl(sx * w * 0.24, 0.012, 0, 0.085, 0.085, 0.003, 'matte', '#a23c3c');
  },
  kitchenSink: (l, w, d) => {
    l.box(0, 0, 0, w, 0.012, d, 'metal', STEEL); // 스테인리스 싱크볼
    l.box(0, 0.012, 0.02, w * 0.78, 0.004, d * 0.7, 'metal', '#9aa1a6');
    l.cyl(0, 0.016, 0.02, 0.03, 0.03, 0.002, 'matte', DARK);
    l.cyl(0, 0.012, -d / 2 + 0.07, 0.018, 0.018, 0.13, 'metal', STEEL); // 수전
    l.box(0, 0.12, -d / 2 + 0.14, 0.016, 0.016, 0.15, 'metal', STEEL);
  },
  fridge: (l, w, d, h) => {
    l.box(0, 0, 0, w, h, d, 'gloss', '#d9dee2');
    if (h > 1.2) {
      l.box(0, h * 0.64, d / 2 + 0.002, w, 0.006, 0.004, 'matte', '#8b9399');
      l.box(-w / 2 + 0.05, h * 0.68, d / 2 + 0.014, 0.018, 0.3, 0.02, 'metal', STEEL);
      l.box(-w / 2 + 0.05, h * 0.3, d / 2 + 0.014, 0.018, 0.4, 0.02, 'metal', STEEL);
    } else l.box(0, h - 0.12, d / 2 + 0.014, w * 0.5, 0.016, 0.02, 'metal', STEEL);
  },
  upperCabinet: (l, w, d, h) => {
    l.box(0, 0, 0, w, h, d, 'matte', '#f1eee7');
    doors(l, w, d, 0.01, h - 0.02, '#f6f3ec', '#cfc9bc');
  },
  bed: (l, w, d, h) => {
    const fh = h * 0.5;
    l.box(0, 0.05, 0, w, fh - 0.05, d, 'matte', WOOD_DARK); // 프레임
    l.box(0, fh, 0.02, w - 0.05, h - fh, d - 0.1, 'matte', '#f2eee6'); // 매트리스
    l.box(0, 0, -d / 2 + 0.025, w, h + 0.4, 0.05, 'matte', WOOD_DARK); // 머리판
    const n = w > 1.2 ? 2 : 1;
    for (let i = 0; i < n; i++) l.box((i - (n - 1) / 2) * (w / n), h, -d / 2 + 0.3, w / n - 0.12, 0.1, 0.34, 'matte', '#ffffff'); // 베개
    l.box(0, h - 0.005, d * 0.25, w - 0.03, 0.05, d * 0.5, 'matte', '#c9d3df'); // 이불
  },
  desk: (l, w, d, h) => {
    l.box(0, h - 0.035, 0, w, 0.035, d, 'matte', '#d2b183');
    for (const sx of [-1, 1]) l.box(sx * (w / 2 - 0.025), 0, 0, 0.04, h - 0.035, d - 0.04, 'matte', '#c19a6b');
    l.box(0, h * 0.45, -d / 2 + 0.02, w - 0.08, h * 0.4, 0.015, 'matte', '#c19a6b');
  },
  chair: (l, w, d, h) => {
    const sh = 0.44;
    l.box(0, sh, 0, w, 0.05, d, 'matte', '#4d6a8c');
    l.box(0, sh + 0.05, -d / 2 + 0.025, w - 0.04, h - sh - 0.05, 0.05, 'matte', '#4d6a8c');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) l.box(sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03), 0.035, sh, 0.035, 'matte', DARK);
  },
  shelf: (l, w, d, h) => {
    const t = 0.025, n = Math.max(2, Math.round(h / 0.32));
    l.box(-w / 2 + t / 2, 0, 0, t, h, d, 'matte', '#6b4a35'); l.box(w / 2 - t / 2, 0, 0, t, h, d, 'matte', '#6b4a35');
    l.box(0, 0, -d / 2 + 0.006, w, h, 0.012, 'matte', '#5a3d2c');
    for (let i = 0; i <= n; i++) l.box(0, (i * (h - t)) / n, 0, w - 2 * t, t, d - 0.02, 'matte', '#7d5a41');
  },
  wardrobe: (l, w, d, h) => {
    l.box(0, 0, 0, w, h, d, 'matte', '#e2dccf');
    doors(l, w, d, 0.02, h - 0.04, '#ebe6da', '#bfb8a8');
  },
  builtinWardrobe: (l, w, d, h) => {
    l.box(0, 0, 0, w, h, d, 'matte', '#4b3326');
    const n = Math.max(2, Math.round(w / 0.5)), dw = w / n;
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + dw * (i + 0.5);
      l.box(cx, 0.02, d / 2 - 0.006, dw - 0.006, h - 0.04, 0.02, 'matte', '#6b4a35');
      for (let k = 1; k < Math.floor(dw / 0.07); k++) l.box(cx - dw / 2 + k * 0.07, 0.02, d / 2 + 0.006, 0.007, h - 0.04, 0.004, 'matte', '#3b271b'); // 세로 살
    }
  },
  shoeRack: (l, w, d, h) => {
    l.box(0, 0, 0, w, h, d, 'matte', '#8b6a4c');
    const n = Math.max(1, Math.round(w / 0.45)), dw = w / n;
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + dw * (i + 0.5);
      l.box(cx, 0.02, d / 2 - 0.006, dw - 0.006, h - 0.04, 0.02, 'matte', '#a07d5b');
      for (let k = 0; k < Math.floor((h - 0.1) / 0.08); k++) l.box(cx, 0.06 + k * 0.08, d / 2 + 0.006, dw - 0.05, 0.012, 0.004, 'matte', '#7a5c42'); // 환기 살
    }
  },
  sofa: (l, w, d, h) => {
    l.box(0, 0.08, 0, w, 0.3, d, 'matte', '#6f7f93');
    l.box(0, 0.38, -d / 2 + 0.1, w, h - 0.38, 0.2, 'matte', '#5d6c80');
    for (const sx of [-1, 1]) l.box(sx * (w / 2 - 0.1), 0.38, 0.05, 0.2, 0.2, d - 0.1, 'matte', '#5d6c80');
  },
  tv: (l, w, d, h) => {
    l.box(0, 0, 0, w, h * 0.55, d, 'matte', '#5a4d43');
    l.box(0, h * 0.55, 0, w * 0.5, 0.01, d * 0.5, 'matte', DARK);
    l.box(0, h * 0.55 + 0.01, 0.0, w * 0.86, w * 0.5, 0.035, 'gloss', '#101215');
  },
  table: (l, w, d, h) => {
    l.box(0, h - 0.035, 0, w, 0.035, d, 'matte', '#d2b183');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) l.box(sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.045, h - 0.035, 0.045, 'matte', '#b8905e');
  },
  acOutdoor: (l, w, d, h) => {
    l.box(0, 0, 0, w, h, d, 'matte', '#d5d8da');
    l.box(0, h * 0.12, d / 2 + 0.002, w * 0.72, h * 0.76, 0.012, 'matte', '#3a3f44');
    for (let k = 0; k < 5; k++) l.box(0, h * 0.18 + k * h * 0.14, d / 2 + 0.009, w * 0.7, 0.012, 0.008, 'matte', '#6c7278');
  },
  waterHeater: (l, w, d, h) => {
    l.box(0, 0, 0, w, h, d, 'gloss', '#f0f1f2');
    l.box(0, h * 0.7, d / 2 + 0.003, w * 0.5, h * 0.18, 0.008, 'matte', '#46505a');
    for (const sx of [-1, 0, 1]) l.cyl(sx * w * 0.25, -0.35, 0, 0.012, 0.012, 0.35, 'metal', '#b6bbbf');
  },
};

/** 모르는 종류(AI 가 엉뚱한 이름을 냈을 때)는 그냥 상자 */
const GENERIC: Builder = (l, w, d, h) => l.box(0, 0, 0, w, h, d, 'matte', '#b9b2a6');

export function buildFurniture(mb: MeshBuilder, placed: PlacedFixture[]) {
  for (const p of placed) {
    const l = new Local(mb, p), [w, d, h] = p.size;
    if ((p.kind === 'cooktop' || p.kind === 'kitchenSink') && !p.onCounter) {
      // 조리대 없이 따로 그려진 인덕션·싱크: 아래에 하부장을 깔아 준다
      counter(new Local(mb, { ...p, baseY: 0 }), Math.max(w, 0.6), Math.max(d, 0.55), 0.85, p);
    }
    (BUILD[p.kind] ?? GENERIC)(l, w, d, h, p);
  }
}
