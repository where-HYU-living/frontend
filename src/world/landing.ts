import { SITES, type SiteId } from './neighborhood';
import { CAMPUS_BOX, serviceTargetFor } from './serviceArea';
import { toLocal } from '../app/map/geo';

/**
 * 지도에서 고른 지점(위경도)을 '3D로 가기' 했을 때 어디에 떨어질지 (3-3).
 *  - 캠퍼스 안 → 그 지점 (도착 후 goToPlace 가 가장 가까운 걸을 수 있는 빈자리로)
 *  - 동네 조각 안 → 그 동네. 집 근처(30m)면 동네 기본 자리(집 앞 길), 아니면 그 지점 근처 빈자리
 *  - 서비스 밖 → 가장 가까운 월드의 진입점(동네면 집 앞, 캠퍼스면 범위 안쪽으로 당긴 지점) + 안내 문구
 * 월드 밖 허공·지하로 보내지 않도록 좌표는 항상 그 월드 범위 안쪽이다.
 */
export type Landing = {
  area: 'campus' | SiteId;
  x: number;
  z: number;
  /** inside: 서비스 안 / outside: 밖이라 가장 가까운 곳으로 */
  kind: 'inside' | 'outside';
  /** 도착하는 월드 이름 (캠퍼스 또는 동네 이름) */
  worldName: string;
  /** 서비스 밖이면 고른 지점에서 진입점까지 직선거리(m) */
  distM: number;
};

const CAMPUS_IN = 40; // 캠퍼스 범위 가장자리는 지형이 거칠어 이만큼 안쪽으로 당긴다

export function planLanding(lat: number, lng: number, current: 'campus' | SiteId = 'campus'): Landing {
  const t = serviceTargetFor(lat, lng, current);
  const [x, z] = toLocal(lat, lng);
  if (t) {
    const site = t.area === 'campus' ? null : SITES.find((s) => s.id === t.area);
    return { area: t.area, x: t.x, z: t.z, kind: 'inside', worldName: site ? site.name : '한양대 캠퍼스', distM: 0 };
  }
  // 캠퍼스: 범위 안쪽으로 당긴 가장 가까운 점
  const cx = Math.min(Math.max(x, CAMPUS_BOX.minX + CAMPUS_IN), CAMPUS_BOX.maxX - CAMPUS_IN);
  const cz = Math.min(Math.max(z, CAMPUS_BOX.minZ + CAMPUS_IN), CAMPUS_BOX.maxZ - CAMPUS_IN);
  let best: Landing = { area: 'campus', x: cx, z: cz, kind: 'outside', worldName: '한양대 캠퍼스', distM: Math.hypot(x - cx, z - cz) };
  for (const s of SITES) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < best.distM) best = { area: s.id, x: s.x, z: s.z, kind: 'outside', worldName: s.name, distM: d };
  }
  best.distM = Math.round(best.distM);
  return best;
}

/** "1.2km" / "350m" */
export const distLabel = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);
