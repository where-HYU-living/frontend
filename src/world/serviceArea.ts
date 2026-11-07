import { SITES, type SiteId } from './neighborhood';
import { toLocal } from '../app/map/geo';

/** 캠퍼스 월드(world.json)가 덮는 범위 (m, 사자상 원점) */
export const CAMPUS_BOX = { minX: -268, maxX: 597, minZ: -425, maxZ: 249 };
const PATCH_HALF = 330; // 동네 조각은 한 변 700m — 가장자리 20m 는 벽이라 뺀다

export type Target = { area: 'campus' | SiteId; x: number; z: number } | null;

const inCampus = (x: number, z: number, pad = 0) => x > CAMPUS_BOX.minX + pad && x < CAMPUS_BOX.maxX - pad && z > CAMPUS_BOX.minZ + pad && z < CAMPUS_BOX.maxZ - pad;

/**
 * 위경도가 우리가 걸어 볼 수 있는 곳 어디인지: 캠퍼스, 동네 12곳 중 하나, 아니면 null(서비스 밖).
 * 집 근처(120m)는 캠퍼스 가장자리와 겹쳐도 동네를 우선한다 (캠퍼스 월드 가장자리는 지형이 거칠다).
 * current 가 동네이고 그 조각 안이면 월드를 바꾸지 않는다.
 */
export function serviceTargetFor(lat: number, lng: number, current: 'campus' | SiteId = 'campus'): Target {
  const [x, z] = toLocal(lat, lng);
  const within = (s: { x: number; z: number }, r: number) => Math.abs(x - s.x) < r && Math.abs(z - s.z) < r;
  if (current !== 'campus') { const cur = SITES.find((s) => s.id === current); if (cur && within(cur, PATCH_HALF)) return { area: current, x, z }; }
  const near = SITES.map((s) => ({ s, d: Math.hypot(x - s.x, z - s.z) })).filter((e) => e.d < 120).sort((a, b) => a.d - b.d)[0];
  if (near) return { area: near.s.id, x, z };
  if (inCampus(x, z, 10)) return { area: 'campus', x, z };
  const any = SITES.map((s) => ({ s, d: Math.hypot(x - s.x, z - s.z) })).filter((e) => within(e.s, PATCH_HALF)).sort((a, b) => a.d - b.d)[0];
  return any ? { area: any.s.id, x, z } : null;
}
