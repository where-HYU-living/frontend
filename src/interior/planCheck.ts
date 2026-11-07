import type { FloorPlan } from '../api/types';
import { buildInterior } from './buildInterior';
import { isBlocked } from './collision';
import { MAX_DEPTH, fixtureSolids, footprint, placeFixtures } from './fixtures';
import { pointInPoly, polygonArea } from './geom';
import { rotY } from './meshBuilder';
import { leafPose, roomAt, roomKind } from './structure';

type P = [number, number];

/** 설비 바닥 사각형 모서리. shrink 만큼 안쪽으로 줄여서 (벽에 딱 붙은 것을 파고든 걸로 오해하지 않게) */
const corners = (f: Parameters<typeof footprint>[0], shrink = 0): P[] => footprint(shrink ? { ...f, size: [f.size[0] - 2 * shrink, f.size[1] - 2 * shrink, 0] as [number, number, number] } : f);

/** 두 볼록 사각형이 겹치는지(분리축). 1cm 안쪽으로 닿는 건 겹침으로 안 본다 */
export function rectsOverlap(A: P[], B: P[], tol = 0.01): boolean {
  for (const poly of [A, B]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], ax: P = [-(q[1] - p[1]), q[0] - p[0]];
    const proj = (S: P[]) => S.map((v) => v[0] * ax[0] + v[1] * ax[1]);
    const a = proj(A), b = proj(B);
    if (Math.max(...a) <= Math.min(...b) + tol * Math.hypot(...ax) || Math.max(...b) <= Math.min(...a) + tol * Math.hypot(...ax)) return false;
  }
  return true;
}

/** 일부러 겹쳐 놓는 조합: 의자는 책상 밑으로 들어가고, 인덕션·싱크·가전은 조리대 라인에 끼운다 */
const OK_PAIRS = new Set(['chair|desk', 'cooktop|kitchenCounter', 'kitchenCounter|kitchenSink', 'fridge|kitchenCounter', 'kitchenCounter|washer', 'chair|table']);
const overlapAllowed = (a: string, b: string) => OK_PAIRS.has([a, b].sort().join('|'));

/**
 * 평면도 JSON 이 "3D 로 올려도 되는지" 보는 검수. 렌더와 같은 코드(문 자세·가구 배치·충돌)로 계산하므로 눈으로 보기 전에 걸러낸다.
 * 문제가 없으면 빈 배열. 점검 항목:
 *  1. 입구(entrance) 가 문 위에 있다                   2. 열린 문짝이 가구에 걸리지 않는다
 *  3. 설비가 자기 방 안에 있고 벽을 파고들지 않으며 폭·깊이가 뒤바뀌지 않았다   4. 설비끼리 (의도된 조합 빼고) 겹치지 않는다
 *  5. 입구에서 걸어서 모든 방(1.5㎡ 이상, PS 같은 닫힌 공간 제외)의 대부분에 갈 수 있고, 옷장·신발장 앞에 설 수 있다
 * (현관문이 바깥으로 열리는 건 정상이다: 청년안심주택 도면은 현관문이 복도 쪽으로 열린다)
 */
export type PlanReport = { errors: string[]; warnings: string[] };

/** errors = 3D 로 올리면 안 되는 것, warnings = 올려도 되지만 3D 에서 눈으로 볼 것 */
export function checkPlan(plan: FloorPlan): PlanReport {
  const out: string[] = [], warn: string[] = [];
  const built = buildInterior(plan);
  const placed = placeFixtures(plan);
  const solids = fixtureSolids(placed);
  const colliders = [...built.wallPieces, ...solids];

  // 1·2. 문
  let entranceDoor = false;
  plan.openings.forEach((o, i) => {
    if (o.type !== 'door') return;
    const w = plan.walls[o.wall];
    if (!w) return;
    const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]) || 1;
    const mx = w.from[0] + ((w.to[0] - w.from[0]) / len) * (o.offset + o.width / 2), my = w.from[1] + ((w.to[1] - w.from[1]) / len) * (o.offset + o.width / 2);
    const isEntrance = Math.hypot(mx - plan.entrance[0], my - plan.entrance[1]) < 0.25;
    entranceDoor ||= isEntrance;
    if (o.style === 'sliding' || o.style === 'open') return;
    const p = leafPose(plan, o.wall, o);
    const tip: P = [p.hinge[0] + p.dir[0] * p.width, p.hinge[1] + p.dir[1] * p.width];
    const nx = -p.dir[1] * 0.04, ny = p.dir[0] * 0.04;
    const leaf: P[] = [[p.hinge[0] + nx, p.hinge[1] + ny], [tip[0] + nx, tip[1] + ny], [tip[0] - nx, tip[1] - ny], [p.hinge[0] - nx, p.hinge[1] - ny]];
    for (const f of placed) {
      if (f.kind === 'cooktop' || f.kind === 'kitchenSink' || f.baseY > 1.9 || f.baseY + f.size[2] < 0.1) continue; // 문짝(높이 ~2m) 높이와 안 겹치는 건 제외
      if (rectsOverlap(corners(f), leaf, 0.02)) warn.push(`문#${i}: 열린 문짝이 ${f.kind}(${f.room ?? '?'}) 위치 [${f.x.toFixed(2)}, ${f.y.toFixed(2)}] 와 겹쳐요`);
    }
  });
  if (!entranceDoor) out.push('entrance 가 문 개구부 위에 있지 않아요 (문 중심과 25cm 이상 떨어짐)');

  // 3. 설비가 방 안에 있고 벽 안으로 안 들어간다
  for (const f of placed) {
    const room = plan.rooms.find((r) => r.name === f.room);
    if (f.room && !room) out.push(`${f.kind}: room "${f.room}" 이름의 방이 없어요`);
    else if (room && !pointInPoly(f.x, f.y, room.polygon)) out.push(`${f.kind}(${f.room}): 중심 [${f.x.toFixed(2)}, ${f.y.toFixed(2)}] 이 방 밖이에요`);
    // 벽 안으로 파고든 깊이(cm 단위로 안쪽으로 줄여 가며 모서리가 벽 밖에 나올 때까지). 2.5cm 이하는 눈에 안 띄어 무시. 샤워는 얇은 부품만 그려서 제외
    if (f.kind !== 'shower') {
      let depth = 0;
      while (depth < 0.3 && corners(f, depth + 0.012).some(([x, z]) => isBlocked(built.wallPieces, x, z, 0))) depth += 0.01;
      if (depth > 0.025) out.push(`${f.kind}(${f.room ?? '?'}): 벽 안으로 약 ${Math.round(depth * 100)}cm 파고들어요 [${f.x.toFixed(2)}, ${f.y.toFixed(2)}] — 좌표를 벽 안쪽 면 기준으로`);
    }
  }

  for (const f of placed) {
    const max = MAX_DEPTH[f.kind];
    if (max && f.size[1] > max && f.size[0] <= max) out.push(`${f.kind}(${f.room ?? '?'}): 깊이 ${f.size[1].toFixed(2)}m 가 비현실적이에요 — size 의 폭·깊이를 뒤바꿔 적은 듯 ([폭, 깊이, 높이] 순서, 벽을 따라 긴 쪽이 폭)`);
  }

  // 4. 설비끼리 겹침 (높이 구간까지 본다: 책상 위 책꽂이는 elevation 으로 띄우면 겹치지 않는다)
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    if (overlapAllowed(a.kind, b.kind) || a.kind === 'shower' || b.kind === 'shower') continue;
    if (a.baseY + a.size[2] <= b.baseY + 0.005 || b.baseY + b.size[2] <= a.baseY + 0.005) continue;
    if (rectsOverlap(corners(a), corners(b))) out.push(`겹침: ${a.kind}[${a.x.toFixed(2)}, ${a.y.toFixed(2)}] × ${b.kind}[${b.x.toFixed(2)}, ${b.y.toFixed(2)}]`);
  }

  // 5. 걸어서 갈 수 있는 곳
  const R = 0.22, S = 0.05, key = (i: number, j: number) => `${i},${j}`;
  const maxX = Math.max(...plan.walls.flatMap((w) => [w.from[0], w.to[0]])), maxY = Math.max(...plan.walls.flatMap((w) => [w.from[1], w.to[1]]));
  if (isBlocked(colliders, built.spawn[0], built.spawn[2], R)) out.push('시작 위치(입구 안쪽 0.8m)가 가구·벽에 막혀 있어요');
  const seen = new Set<string>();
  const start: P = [Math.round(built.spawn[0] / S), Math.round(built.spawn[2] / S)];
  const stack = [start]; seen.add(key(...start));
  while (stack.length) {
    const [i, j] = stack.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, k = key(ni, nj);
      if (seen.has(k) || ni < -5 || nj < -5 || ni > maxX / S + 5 || nj > maxY / S + 5 || isBlocked(colliders, ni * S, nj * S, R)) continue;
      seen.add(k); stack.push([ni, nj]);
    }
  }
  const reach = (x: number, z: number) => seen.has(key(Math.round(x / S), Math.round(z / S)));
  for (const r of plan.rooms) {
    if (polygonArea(r.polygon) < 1.5 || roomKind(r) === 'other') continue;
    const xs = r.polygon.map((p) => p[0]), ys = r.polygon.map((p) => p[1]);
    let free = 0, got = 0;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.1) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.1) {
      if (!pointInPoly(x, y, r.polygon) || isBlocked(colliders, x, y, R)) continue;
      free++; if (reach(x, y)) got++;
    }
    const service = ['utility', 'balcony', 'storage'].includes(roomKind(r)); // 실외기실·발코니·수납은 설비로 가득 차서 못 들어가는 게 보통이라 경고만
    if (free === 0) (service ? warn : out).push(`방 "${r.name}": 서 있을 수 있는 자리가 없어요 (가구로 가득 참)`);
    else if (got / free < 0.2) (service ? warn : out).push(`방 "${r.name}": 들어갈 수 있는 곳의 ${Math.round((got / free) * 100)}% 만 입구에서 갈 수 있어요 — 문 앞이나 통로가 막혀 사실상 못 들어가요`);
    else if (got / free < 0.85) warn.push(`방 "${r.name}": 들어갈 수 있는 곳의 ${Math.round((got / free) * 100)}% 만 입구에서 갈 수 있어요 (구석이 가구에 막힘 — 좁은 방이면 정상일 수 있음)`);
  }
  for (const f of placed) {
    if (f.kind !== 'wardrobe' && f.kind !== 'builtinWardrobe' && f.kind !== 'shoeRack') continue;
    const v = ({ N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] } as const)[f.facing];
    if (!reach(f.x + v[0] * (f.size[1] / 2 + 0.3), f.y + v[1] * (f.size[1] / 2 + 0.3))) warn.push(`${f.kind}(${f.room ?? '?'}) 앞(30cm)에 설 수 없어요 — 문을 열 수 없는 배치`);
  }
  return { errors: out, warnings: warn };
}
