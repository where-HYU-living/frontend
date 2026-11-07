import { useWorld } from './state/world';
import { useArea, siteOf } from './state/area';
import { serviceTargetFor } from '../world/serviceArea';

/**
 * 위경도 지점으로 3D 이동: 캠퍼스면 그 자리로, 집 주변이면 그 동네로 들어가서, 서비스 지역 밖이면 false.
 * (캠퍼스 월드는 범위 밖 좌표로 보내면 지형 없는 빈 들판이 되므로 모든 이동이 이 길을 지난다)
 */
export function useGoToPoint() {
  const api = useWorld((s) => s.api);
  const areaId = useWorld((s) => s.areaId);
  return (p: { lat: number; lng: number }): boolean => {
    const cur = areaId ?? 'campus';
    const t = serviceTargetFor(p.lat, p.lng, cur);
    if (!t) return false;
    if (t.area === cur) return api?.goToPlace(t.x, t.z) ?? false;
    const pose = api?.getPose?.();
    // 동네에 막 들어갔을 땐 기본 자리(집 앞)에서 시작하고, 집에서 먼 지점일 때만 그 자리로 옮긴다
    useArea.getState().goTo(t.area, t.x, t.z, pose && cur === 'campus' ? { x: pose.p[0], z: pose.p[2], yaw: pose.heading } : null);
    return true;
  };
}

/**
 * 캠퍼스 3D 좌표(x,z)로 이동 (캠퍼스 투어·지도의 캠퍼스 건물 핀). 지금 동네 월드에 있으면 캠퍼스 월드로 바꾼 뒤 도착하면 옮긴다.
 * 동네 월드의 api.goToPlace 에 캠퍼스 좌표를 넘기면 그 조각 안에서 빈자리를 못 찾아 아무 일도 안 일어났다(3-1 B).
 * @returns 바로 옮겼으면 true, 월드를 바꾸는 중이면 'switching', 갈 수 없으면 false
 */
export function useGoToCampus() {
  const api = useWorld((s) => s.api);
  const areaId = useWorld((s) => s.areaId);
  return (x: number, z: number): boolean | 'switching' => {
    if ((areaId ?? 'campus') !== 'campus') { useArea.getState().goTo('campus', x, z); return 'switching'; }
    return api?.goToPlace(x, z) ?? false;
  };
}
export { siteOf };
