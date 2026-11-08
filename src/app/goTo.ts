import { useWorld } from './state/world';
import { useArea, siteOf } from './state/area';
import { serviceTargetFor } from '../world/serviceArea';
import { distLabel, planLanding, type Landing } from '../world/landing';
import { useMapFocus } from './map/mapFocus';

/**
 * 위경도 지점으로 3D 이동: 캠퍼스면 그 자리로, 집 주변이면 그 동네로 들어가서,
 * 서비스 지역 밖이면 가장 가까운 월드의 진입점으로 가고 안내를 띄운다 (예전엔 false 만 돌려 카드를 눌러도 아무 일도 없었다).
 * (캠퍼스 월드는 범위 밖 좌표로 보내면 지형 없는 빈 들판이 되므로 모든 이동이 이 길을 지난다)
 */
export function useGoToPoint() {
  const api = useWorld((s) => s.api);
  const areaId = useWorld((s) => s.areaId);
  const landAt = useLandAt();
  return (p: { lat: number; lng: number; name?: string; title?: string }): boolean => {
    const cur = areaId ?? 'campus';
    const t = serviceTargetFor(p.lat, p.lng, cur);
    if (!t) {
      const plan = landAt(p);
      useMapFocus.setState({ notice: `${p.title ?? p.name ?? '그곳'} 은(는) 3D 지원 지역 밖이라 가장 가까운 ${plan.worldName}(으)로 왔어요 (직선 ${distLabel(plan.distM)})` });
      return true;
    }
    useMapFocus.setState({ notice: null }); // 서비스 안으로 가면 이전 '지역 밖' 안내는 지운다
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
 * face 를 주면 (x,z) 에 바로 서서 face 쪽을 본다(건물 입구 앞). 없으면 (x,z) 가 보이는 빈자리로.
 * @returns 바로 옮겼으면 true, 월드를 바꾸는 중이면 'switching', 갈 수 없으면(자리가 막힘) false
 */
export function useGoToCampus() {
  const api = useWorld((s) => s.api);
  const areaId = useWorld((s) => s.areaId);
  return (x: number, z: number, face?: [number, number]): boolean | 'switching' => {
    if ((areaId ?? 'campus') !== 'campus') { useArea.getState().goTo('campus', x, z, null, !!face, face); return 'switching'; }
    if (face) return api?.teleport(x, z, face[0], face[1]) ?? false;
    return api?.goToPlace(x, z) ?? false;
  };
}

/**
 * 지도 정보 카드의 '3D로 가기' (3-3): 서비스 안이면 그 지점에 서고(걸을 수 없으면 가장 가까운 빈자리),
 * 밖이면 가장 가까운 월드의 진입점으로. 돌려준 Landing 으로 안내 문구를 만든다.
 */
export function useLandAt() {
  const api = useWorld((s) => s.api);
  const areaId = useWorld((s) => s.areaId);
  return (p: { lat: number; lng: number }): Landing => {
    const cur = (areaId ?? 'campus') as Landing['area'];
    const plan = planLanding(p.lat, p.lng, cur);
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__lastLanding = plan;
    const pose = api?.getPose?.();
    const from = pose && cur === 'campus' ? { x: pose.p[0], z: pose.p[2], yaw: pose.heading } : null;
    if (plan.area === cur && api) {
      const site = cur !== 'campus' && plan.kind === 'outside';
      if (site) api.goToLandmark('hero');
      else if (!api.teleport(plan.x, plan.z, plan.x, plan.z - 1) && !api.goToPlace(plan.x, plan.z)) api.goToLandmark('hero');
    } else {
      useArea.getState().goTo(plan.area, plan.x, plan.z, from, plan.kind === 'inside');
    }
    return plan;
  };
}
export { siteOf };
