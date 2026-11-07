import type { FloorPlan, RoomKind } from '../api/types';
import { pointInPoly, polygonArea, polygonBounds, polygonCenter } from './geom';
import { MeshBuilder, type Color, type Face, type FaceName, type MatKey, type Pt, type V3 } from './meshBuilder';

type Room = FloorPlan['rooms'][number];
type Opening = FloorPlan['openings'][number];

/** 벽은 가장 낮은 바닥(단차)보다 아래에서 시작해서 틈이 보이지 않게 한다 */
export const BASE_Y = -0.12;
export const BASEBOARD_H = 0.08;
export const DOOR_SWING = 1.2; // 문짝을 약 69° 열어 둔다 (라디안)
const FRAME = 0.05;
const STONE = '#c8c2b6';
const TRIM: Face = { key: 'trim', color: '#f1eee8' };

// ───────────────────────── 방 종류·바닥 ─────────────────────────

/** kind 가 있으면 그대로, 없으면 이름으로 추측 */
export function roomKind(r: Room): RoomKind {
  if (r.kind) return r.kind;
  const n = r.name;
  if (/욕실|화장실|샤워/.test(n)) return 'bathroom';
  if (/현관/.test(n)) return 'entrance';
  if (/실외기|다용도|세탁|보일러/.test(n)) return 'utility';
  if (/베란다|발코니/.test(n)) return 'balcony';
  if (/주방|부엌|키친/.test(n)) return 'kitchen';
  if (/거실|리빙|living/i.test(n)) return 'living';
  if (/침실|원룸|룸|방|인실|bed|room|studio/i.test(n)) return 'bedroom';
  if (/복도/.test(n)) return 'hallway';
  if (/창고|수납|드레스/.test(n)) return 'storage';
  return 'other';
}

const TILED = new Set<RoomKind>(['bathroom']);
const ROUGH = new Set<RoomKind>(['utility', 'balcony', 'other', 'storage']);
/** 걸레받이를 두르는 방 (타일·콘크리트 방은 제외) */
const BASEBOARD_KINDS = new Set<RoomKind>(['bedroom', 'living', 'kitchen', 'hallway', 'entrance']);

export type FloorSpec = { key: MatKey; color: string; height: number };
const FLOOR_COLOR: Record<string, string> = { wood: '#d9bd90', tile: '#e4dfd4', vinyl: '#d8ccb6', concrete: '#a9a9a5' };

export function floorSpec(r: Room): FloorSpec {
  const kind = roomKind(r);
  const m = r.floor?.material ?? (TILED.has(kind) || kind === 'entrance' ? 'tile' : ROUGH.has(kind) ? 'concrete' : 'wood');
  return { key: m, color: r.floor?.color ?? FLOOR_COLOR[m], height: r.floor?.height ?? 0 };
}

/** 이 방 안쪽에서 본 벽면. room 이 없으면(= 건물 바깥쪽 면) 외벽 */
function wallFace(kind: RoomKind | null): Face {
  if (kind === null) return { key: 'concrete', color: '#8f918e' };
  if (kind === 'bathroom') return { key: 'wallTile', color: '#f2f4f3' };
  if (kind === 'entrance') return { key: 'paint', color: '#eee8dc' };
  if (ROUGH.has(kind)) return { key: 'concrete', color: '#cac9c4' };
  return { key: 'paint', color: '#f6f3ec' };
}

const CEILING_COLOR: Partial<Record<RoomKind, string>> = { bathroom: '#eef1f1' };

export function roomAt(plan: FloorPlan, x: number, y: number): number {
  return plan.rooms.findIndex((r) => pointInPoly(x, y, r.polygon));
}

/** (x, y) 평면 좌표 바닥 높이. 방 밖은 0 */
export function floorHeightAt(plan: FloorPlan, x: number, y: number): number {
  const i = roomAt(plan, x, y);
  return i < 0 ? 0 : floorSpec(plan.rooms[i]).height;
}

// ───────────────────────── 벽 도우미 ─────────────────────────

type WallGeo = { from: Pt; to: Pt; len: number; u: Pt; /** 장면 +z 쪽 법선 (-uy, ux) */ n: Pt; t: number; height: number };
function wallGeo(plan: FloorPlan, i: number): WallGeo {
  const w = plan.walls[i];
  const dx = w.to[0] - w.from[0], dy = w.to[1] - w.from[1], len = Math.hypot(dx, dy) || 1;
  return { from: w.from, to: w.to, len, u: [dx / len, dy / len], n: [-dy / len, dx / len], t: w.thickness, height: w.height ?? plan.ceilingHeight };
}
const wallRotY = (g: WallGeo) => -Math.atan2(g.u[1], g.u[0]);
const at = (g: WallGeo, s: number, side = 0): Pt => [g.from[0] + g.u[0] * s + g.n[0] * side, g.from[1] + g.u[1] * s + g.n[1] * side];

function distToSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * 문짝 자세. opensTo 의 기준: 평면도를 위에서 본 화면(y 가 아래)에서 벽 진행방향(from→to)을 바라볼 때
 * 왼쪽이 +1, 오른쪽이 -1. 화면 왼쪽 법선 = (uy, -ux).
 * swing 이 없으면 현관은 방 안쪽으로, 그 밖의 문은 더 작은 방 쪽으로 연다.
 */
export function leafPose(plan: FloorPlan, wi: number, o: Opening, angle = DOOR_SWING) {
  const g = wallGeo(plan, wi);
  const a = Math.max(0, o.offset), b = Math.min(g.len, o.offset + o.width);
  const hingeEnd = (o.swing?.hinge ?? 'start') === 'end';
  const left: Pt = [g.u[1], -g.u[0]];
  let opensTo = o.swing?.opensTo;
  if (!opensTo) {
    const mid = (a + b) / 2, probe = g.t / 2 + 0.3;
    const rl = roomAt(plan, ...at(g, mid, -probe)); // left = -n 쪽
    const rr = roomAt(plan, ...at(g, mid, probe));
    const area = (i: number) => (i < 0 ? Infinity : polygonArea(plan.rooms[i].polygon));
    opensTo = (area(rl) <= area(rr) ? 1 : -1) as 1 | -1;
    if (rl < 0 && rr >= 0) opensTo = -1; // 한쪽이 바깥이면 안쪽(방)으로
    if (rr < 0 && rl >= 0) opensTo = 1;
  }
  const hingeS = hingeEnd ? b : a;
  const hinge = at(g, hingeS);
  const d0: Pt = hingeEnd ? [-g.u[0], -g.u[1]] : [g.u[0], g.u[1]];
  const c = Math.cos(angle), s = Math.sin(angle);
  const dir: Pt = [d0[0] * c + left[0] * opensTo * s, d0[1] * c + left[1] * opensTo * s];
  return { hinge, dir, width: b - a, opensTo, hingeEnd };
}

// ───────────────────────── 구조 빌드 ─────────────────────────

export type Lamp = { x: number; z: number; kind: RoomKind; area: number; /** 방 이름 (이름표용) */ name: string; /** 이 방의 몇 번째 조명인지, 그리고 이 방의 조명 수 */ index: number; count: number };
export type StructureInfo = {
  lamps: Lamp[];
  /** 햇빛이 들어올 창: 바깥쪽 단위 방향(평면 x,y), 창 위치 */
  sun: { outward: Pt; at: Pt };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

/** 다각형 안에서 target(기본: 무게중심)에 가장 가까운 점 */
function pointInside(poly: Pt[], target?: Pt): Pt {
  const c = target ?? polygonCenter(poly);
  if (pointInPoly(c[0], c[1], poly)) return c;
  const b = polygonBounds(poly);
  let best: Pt = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2], bd = Infinity;
  for (let x = b.minX; x <= b.maxX; x += 0.05) for (let y = b.minY; y <= b.maxY; y += 0.05) {
    if (!pointInPoly(x, y, poly)) continue;
    const d = Math.hypot(x - c[0], y - c[1]);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}

export function buildStructure(plan: FloorPlan, mb: MeshBuilder): StructureInfo {
  const H = plan.ceilingHeight;
  const specs = plan.rooms.map(floorSpec);
  const kinds = plan.rooms.map(roomKind);
  const hAt = (x: number, y: number) => floorHeightAt(plan, x, y);
  const allPts: Pt[] = [...plan.walls.flatMap((w) => [w.from, w.to]), ...plan.rooms.flatMap((r) => r.polygon)];
  const bounds = allPts.length ? polygonBounds(allPts) : { minX: 0, minY: 0, maxX: 1, maxY: 1 };

  // ── 바닥·천장 ──
  plan.rooms.forEach((r, i) => {
    mb.flat(specs[i].key, r.polygon, specs[i].height, true, specs[i].color);
    mb.flat('ceiling', r.polygon, H, false, CEILING_COLOR[kinds[i]] ?? '#f7f5f0');
  });

  // ── 바닥 단차의 계단면 (이웃한 방과 높이가 다른 경계) ──
  for (let a = 0; a < plan.rooms.length; a++) for (let b = a + 1; b < plan.rooms.length; b++) {
    const dh = specs[a].height - specs[b].height;
    if (Math.abs(dh) < 0.005) continue;
    const lower = dh < 0 ? a : b, loH = Math.min(specs[a].height, specs[b].height), hiH = Math.max(specs[a].height, specs[b].height);
    const pa = plan.rooms[a].polygon, pb = plan.rooms[b].polygon;
    for (let i = 0; i < pa.length; i++) {
      const p = pa[i], q = pa[(i + 1) % pa.length];
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (L < 1e-6) continue;
      const u: Pt = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
      for (let j = 0; j < pb.length; j++) {
        const r = pb[j], s = pb[(j + 1) % pb.length];
        const cr = (v: Pt) => u[0] * (v[1] - p[1]) - u[1] * (v[0] - p[0]);
        if (Math.abs(cr(r)) > 1e-3 || Math.abs(cr(s)) > 1e-3) continue; // 같은 직선이 아님
        const t1 = (r[0] - p[0]) * u[0] + (r[1] - p[1]) * u[1], t2 = (s[0] - p[0]) * u[0] + (s[1] - p[1]) * u[1];
        const lo = Math.max(0, Math.min(t1, t2)), hi = Math.min(L, Math.max(t1, t2));
        if (hi - lo < 0.02) continue;
        const perp: Pt = [-u[1], u[0]], m: Pt = [p[0] + u[0] * (lo + hi) / 2, p[1] + u[1] * (lo + hi) / 2];
        const sign = pointInPoly(m[0] + perp[0] * 0.03, m[1] + perp[1] * 0.03, plan.rooms[lower].polygon) ? 1 : -1;
        const A: Pt = [p[0] + u[0] * lo, p[1] + u[1] * lo], B: Pt = [p[0] + u[0] * hi, p[1] + u[1] * hi];
        const corners: [V3, V3, V3, V3] = [[A[0], loH, A[1]], [B[0], loH, B[1]], [B[0], hiH, B[1]], [A[0], hiH, A[1]]];
        const uvs: [Pt, Pt, Pt, Pt] = [[lo, loH], [hi, loH], [hi, hiH], [lo, hiH]];
        if (sign > 0) mb.quad('trim', corners, [perp[0], 0, perp[1]], uvs, STONE);
        else mb.quad('trim', [corners[1], corners[0], corners[3], corners[2]], [-perp[0], 0, -perp[1]], [uvs[1], uvs[0], uvs[3], uvs[2]], STONE);
      }
    }
  }

  // ── 벽 ──
  plan.walls.forEach((_, wi) => {
    const g = wallGeo(plan, wi), rot = wallRotY(g), probe = g.t / 2 + 0.03;
    const touches = (p: Pt) => plan.walls.some((o, j) => j !== wi && distToSeg(p, o.from, o.to) <= o.thickness / 2 + 0.02);
    const ext0 = touches(g.from) ? g.t / 2 : 0, ext1 = touches(g.to) ? g.t / 2 - 0.003 : 0; // 모서리 틈 메우기 (겹치는 면이 같은 평면이 되지 않게 살짝 덜)
    const roomsAt = (s: number): [number, number] => {
      const c = Math.max(0, Math.min(g.len, s));
      return [roomAt(plan, ...at(g, c, probe)), roomAt(plan, ...at(g, c, -probe))];
    };

    // 벽 길이를 따라 양쪽 방이 바뀌는 지점 (벽면 재질이 바뀐다)
    const cuts: number[] = [];
    let prev = roomsAt(0);
    for (let s = 0.03; s < g.len + 0.03; s += 0.03) {
      const hi0 = Math.min(s, g.len), cur = roomsAt(hi0);
      if (cur[0] !== prev[0] || cur[1] !== prev[1]) {
        let lo = Math.max(0, s - 0.03), hi = hi0;
        for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2, p = roomsAt(m); if (p[0] === prev[0] && p[1] === prev[1]) lo = m; else hi = m; }
        cuts.push((lo + hi) / 2);
      }
      prev = cur;
    }

    // 개구부로 나뉜 세로 구간
    type Range = { a: number; b: number; y0: number; y1: number };
    const ranges: Range[] = [];
    const ops = plan.openings.filter((o) => o.wall === wi).sort((p, q) => p.offset - q.offset);
    let cursor = 0;
    for (const o of ops) {
      const a = Math.max(o.offset, cursor), b = Math.min(o.offset + o.width, g.len);
      if (b <= a) continue;
      ranges.push({ a: cursor, b: a, y0: BASE_Y, y1: g.height });
      if (o.sill > 0) ranges.push({ a, b, y0: BASE_Y, y1: o.sill });
      ranges.push({ a, b, y0: o.sill + o.height, y1: g.height });
      cursor = b;
    }
    ranges.push({ a: cursor, b: g.len, y0: BASE_Y, y1: g.height });

    for (const r of ranges) {
      if (r.b - r.a < 1e-4 || r.y1 - r.y0 < 1e-4) continue;
      const a0 = r.a <= 1e-9 ? -ext0 : r.a, b0 = r.b >= g.len - 1e-9 ? g.len + ext1 : r.b;
      const stops = [a0, ...cuts.filter((c) => c > a0 + 1e-3 && c < b0 - 1e-3), b0];
      for (let k = 0; k < stops.length - 1; k++) {
        const sa = stops[k], sb = stops[k + 1];
        const [rp, rn] = roomsAt((sa + sb) / 2);
        const faces: Partial<Record<FaceName, Face | null>> = {
          pz: wallFace(rp < 0 ? null : kinds[rp]), nz: wallFace(rn < 0 ? null : kinds[rn]),
          nx: k === 0 ? TRIM : null, px: k === stops.length - 2 ? TRIM : null,
          py: r.y1 >= g.height - 1e-6 ? null : TRIM, ny: r.y0 <= BASE_Y + 1e-6 ? null : TRIM,
        };
        const mid = (sa + sb) / 2, [cx, cz] = at(g, mid);
        mb.box({ center: [cx, (r.y0 + r.y1) / 2, cz], size: [sb - sa, r.y1 - r.y0, g.t], rotY: rot, faces, uBase: sa });

        // 걸레받이: 바닥에 닿는 구간만, 방 쪽 양면
        if (r.y0 <= BASE_Y + 1e-6) {
          const ca = Math.max(sa, 0), cb = Math.min(sb, g.len);
          if (cb - ca > 0.01) {
            for (const [room, side] of [[rp, 1], [rn, -1]] as const) {
              if (room < 0 || !BASEBOARD_KINDS.has(kinds[room])) continue;
              const [bx, bz] = at(g, (ca + cb) / 2, side * (g.t / 2 + 0.006));
              mb.box({ center: [bx, specs[room].height + BASEBOARD_H / 2, bz], size: [cb - ca, BASEBOARD_H, 0.012], rotY: rot, all: { key: 'trim', color: '#fbfaf7' } });
            }
          }
        }
      }
    }

    // ── 문·창 틀, 문짝, 창 ──
    for (const o of ops) {
      const a = Math.max(0, o.offset), b = Math.min(g.len, o.offset + o.width);
      if (b <= a) continue;
      const top = o.sill + o.height, w = b - a, fd = g.t + 0.02;
      const entrance = (() => { const [mx, mz] = at(g, (a + b) / 2); return Math.hypot(mx - plan.entrance[0], mz - plan.entrance[1]) < 0.25; })();
      const piece = (s0: number, s1: number, y0: number, y1: number, depth: number, color: Color, key: MatKey = 'trim', side = 0) => {
        if (s1 - s0 < 1e-6 || y1 - y0 < 1e-6) return;
        const [px, pz] = at(g, (s0 + s1) / 2, side);
        mb.box({ center: [px, (y0 + y1) / 2, pz], size: [s1 - s0, y1 - y0, depth], rotY: rot, all: { key, color } });
      };

      if (o.type === 'door') {
        const sideH = [hAt(...at(g, (a + b) / 2, g.t / 2 + 0.06)), hAt(...at(g, (a + b) / 2, -g.t / 2 - 0.06))];
        const floorTop = Math.max(...sideH);
        piece(a, b, BASE_Y, floorTop, g.t, STONE); // 문턱 (벽 두께 전체를 덮는다)
        if ((o.style ?? 'swing') === 'open') continue; // 문 없이 뚫린 곳은 틀도 없음
        const frameColor = entrance ? '#8a9096' : '#f1eee8';
        piece(a, a + FRAME, floorTop, top, fd, frameColor);
        piece(b - FRAME, b, floorTop, top, fd, frameColor);
        piece(a, b, top - FRAME, top, fd, frameColor);
        if (o.style === 'sliding') { slidingPanes(a, b, floorTop + 0.02, top - FRAME); continue; }
        const lw = w - 0.05;
        if (lw > 0.3) {
          const p = leafPose(plan, wi, o);
          const cxz: Pt = [p.hinge[0] + p.dir[0] * (lw / 2 + 0.02), p.hinge[1] + p.dir[1] * (lw / 2 + 0.02)];
          const lr = Math.atan2(-p.dir[1], p.dir[0]), lh = top - floorTop - 0.025;
          const leaf = entrance ? '#7b8187' : '#ece6d9';
          mb.box({ center: [cxz[0], floorTop + 0.01 + lh / 2, cxz[1]], size: [lw, lh, 0.04], rotY: lr, all: { key: 'matte', color: leaf } });
          if (!entrance && lw > 0.5) { // 문짝 가운데 살짝 들어간 판 (양면)
            for (const sd of [1, -1]) {
              const off = sd * 0.0215, [bx, bz] = [cxz[0] + -p.dir[1] * off, cxz[1] + p.dir[0] * off];
              mb.box({ center: [bx, floorTop + 0.01 + lh * 0.62, bz], size: [lw * 0.7, lh * 0.34, 0.004], rotY: lr, all: { key: 'matte', color: '#e1dacb' } });
              mb.box({ center: [bx, floorTop + 0.01 + lh * 0.2, bz], size: [lw * 0.7, lh * 0.22, 0.004], rotY: lr, all: { key: 'matte', color: '#e1dacb' } });
            }
          }
          // 손잡이: 열리는 끝 쪽, 양면
          const hx = p.hinge[0] + p.dir[0] * (lw - 0.07), hz = p.hinge[1] + p.dir[1] * (lw - 0.07);
          for (const sd of [1, -1]) {
            const off = sd * 0.04;
            mb.box({ center: [hx + -p.dir[1] * off, floorTop + 1.0, hz + p.dir[0] * off], size: [0.11, 0.022, 0.026], rotY: lr, all: { key: 'metal', color: '#c9ccce' } });
          }
        }
      } else {
        const style = o.style ?? 'swing';
        const frameColor = style === 'sliding' ? '#cdd1d4' : '#f2f0ea';
        piece(a, a + FRAME, o.sill, top, fd, frameColor);
        piece(b - FRAME, b, o.sill, top, fd, frameColor);
        piece(a, b, top - FRAME, top, fd, frameColor);
        piece(a, b, o.sill, o.sill + FRAME, fd, frameColor);
        if (o.sill > 0.3) piece(a - 0.03, b + 0.03, o.sill, o.sill + 0.035, g.t + 0.07, '#f7f6f2'); // 창턱 (양쪽으로 살짝 튀어나옴)
        if (style === 'sliding') slidingPanes(a, b, o.sill + FRAME, top - FRAME);
        else if (style !== 'open') {
          if (w > 1.2) piece((a + b) / 2 - 0.018, (a + b) / 2 + 0.018, o.sill + FRAME, top - FRAME, 0.045, frameColor); // 가운데 살
          piece(a + FRAME, b - FRAME, o.sill + FRAME, top - FRAME, 0.012, '#d7e9f6', 'glass');
        }
      }

      /** 슬라이딩: 두 장의 유리 문짝이 레일 앞뒤로 겹쳐 있다 */
      function slidingPanes(sa: number, sb: number, y0: number, y1: number) {
        const ww = sb - sa, bar = 0.035;
        const panes: [number, number, number][] = [[sa + FRAME * 0.5, sa + ww * 0.56, -0.022], [sa + ww * 0.44, sb - FRAME * 0.5, 0.022]];
        for (const [s0, s1, side] of panes) {
          piece(s0, s1, y0, y0 + bar, 0.03, '#cdd1d4', 'metal', side);
          piece(s0, s1, y1 - bar, y1, 0.03, '#cdd1d4', 'metal', side);
          piece(s0, s0 + bar, y0, y1, 0.03, '#cdd1d4', 'metal', side);
          piece(s1 - bar, s1, y0, y1, 0.03, '#cdd1d4', 'metal', side);
          piece(s0 + bar, s1 - bar, y0 + bar, y1 - bar, 0.008, '#d7e9f6', 'glass', side);
        }
      }
    }
  });

  // ── 천장 조명(원판) 과 점광원 위치 ──
  const lamps: Lamp[] = [];
  plan.rooms.forEach((r, i) => {
    const area = polygonArea(r.polygon);
    if (area < 0.8 || kinds[i] === 'other' || kinds[i] === 'storage') return;
    // 14㎡ 이상이면 12㎡ 당 하나씩(최대 4개) 긴 쪽으로 나눠 단다: 긴 방의 양 끝이 어둡지 않게
    const n = area >= 14 ? Math.min(4, Math.ceil(area / 12)) : 1;
    const b = polygonBounds(r.polygon), alongX = b.maxX - b.minX >= b.maxY - b.minY;
    const rad = kinds[i] === 'living' || kinds[i] === 'bedroom' ? 0.2 : 0.11;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const target: Pt | undefined = n === 1 ? undefined : alongX ? [b.minX + t * (b.maxX - b.minX), (b.minY + b.maxY) / 2] : [(b.minX + b.maxX) / 2, b.minY + t * (b.maxY - b.minY)];
      const [x, z] = pointInside(r.polygon, target);
      mb.cyl({ center: [x, H - 0.022, z], rx: rad, h: 0.022, seg: 20, key: 'lamp', color: '#fff3d3', capTop: false, capBottom: true });
      lamps.push({ x, z, kind: kinds[i], area, name: r.name, index: k, count: n });
    }
  });

  // ── 햇빛: 가장 큰 창의 바깥쪽 ──
  let sun: StructureInfo['sun'] = { outward: [0, 1], at: [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2] };
  let bestArea = 0;
  for (const o of plan.openings) {
    if (o.type !== 'window' || !plan.walls[o.wall]) continue;
    const g = wallGeo(plan, o.wall), mid = o.offset + o.width / 2, ar = o.width * o.height;
    const inP = roomAt(plan, ...at(g, mid, g.t / 2 + 0.3)), inM = roomAt(plan, ...at(g, mid, -g.t / 2 - 0.3));
    if (ar <= bestArea || (inP >= 0) === (inM >= 0)) continue; // 한쪽만 방인 벽(외벽)의 창만
    bestArea = ar;
    const outSign = inP >= 0 ? -1 : 1;
    sun = { outward: [g.n[0] * outSign, g.n[1] * outSign], at: at(g, mid) };
  }
  return { lamps, sun, bounds };
}
