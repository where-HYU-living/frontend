/** 집 → 내 과 건물 도보 경로 (4단계 F6) 순수 계산. 좌표: 서버는 [lat, lng], 3D 는 toLocal 로 (x, z) m */
import { toLocal } from '../map/geo';

export type LatLng = [number, number];
export type XZ = { x: number; z: number };
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** 경로 길이(m) — 3D 로컬 좌표(등장방형 근사, 반경 3km 안 오차 무시)로 잰다 */
export function pathLengthM(path: LatLng[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = toLocal(path[i - 1][0], path[i - 1][1]), [bx, bz] = toLocal(path[i][0], path[i][1]);
    d += Math.hypot(bx - ax, bz - az);
  }
  return d;
}

export const toLocalPath = (path: LatLng[]): XZ[] => path.map(([lat, lng]) => { const [x, z] = toLocal(lat, lng); return { x, z }; });

const inside = (p: XZ, b: Bounds, pad: number) => p.x > b.minX + pad && p.x < b.maxX - pad && p.z > b.minZ + pad && p.z < b.maxZ - pad;

/** 직선 보간으로 촘촘하게 (지형을 따라 그리려고) */
export function densify(pts: XZ[], step = 2): XZ[] {
  if (pts.length < 2) return pts.slice();
  const out: XZ[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  return out;
}

/**
 * 지금 월드 범위(가장자리 pad m 안쪽) 안에 드는 구간만 잘라낸다.
 * @returns segments: 그릴 구간들, shownM: 그 길이, totalM: 전체 길이, outsideM: 월드 밖 길이
 */
export function clipToWorld(path: LatLng[], b: Bounds, pad = 12): { segments: XZ[][]; shownM: number; totalM: number; outsideM: number } {
  const pts = densify(toLocalPath(path), 2);
  const segments: XZ[][] = [];
  let cur: XZ[] = [], shownM = 0, totalM = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) totalM += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (inside(pts[i], b, pad)) {
      if (cur.length) shownM += Math.hypot(pts[i].x - cur[cur.length - 1].x, pts[i].z - cur[cur.length - 1].z);
      cur.push(pts[i]);
    } else if (cur.length) { if (cur.length > 1) segments.push(cur); cur = []; }
  }
  if (cur.length > 1) segments.push(cur);
  return { segments, shownM, totalM, outsideM: Math.max(0, totalM - shownM) };
}

/** 도보 분 = 거리 비율로 나눈다 (서버 분이 전체 경로 기준이라, 남은 구간 분도 같은 속도로) */
export const minutesFor = (m: number, totalM: number, totalMin: number) => (totalM > 0 ? Math.max(0, Math.round((m / totalM) * totalMin)) : 0);

/** 서버 경로를 못 받을 때 직선 추정 (돌아가는 길 1.25배, 분당 80m — 서버 기본값과 같은 가정) */
export function estimateRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): { path: LatLng[]; distanceM: number; minutes: number } {
  const [ax, az] = toLocal(from.lat, from.lng), [bx, bz] = toLocal(to.lat, to.lng);
  const d = Math.round(Math.hypot(bx - ax, bz - az) * 1.25);
  return { path: [[from.lat, from.lng], [to.lat, to.lng]], distanceM: d, minutes: Math.max(1, Math.round(d / 80)) };
}

/** 경로에서 캠퍼스 월드 범위에 처음 들어가는 점 ('캠퍼스로 이동' 연결) */
export function firstPointIn(path: LatLng[], b: Bounds, pad = 30): XZ | null {
  for (const p of densify(toLocalPath(path), 5)) if (inside(p, b, pad)) return p;
  return null;
}
