import { useEffect } from 'react';
import { ArrowLeft, DoorOpen, Footprints } from 'lucide-react';
import { useWorld } from './state/world';
import { useArea, siteOf } from './state/area';
import { useUi } from './state/ui';
import { siteForHousing, siteForListing, siteMeta } from '../world/neighborhood';
import { HOUSE_SVG } from './icons';
import './venue.css';

/** 상세 패널의 "주변 걸어보기": 이 집이 있는 동네를 3D 로 걸어 본다. 동네 조각이 없는 집이면 아무것도 그리지 않는다 */
export function NeighborhoodButton({ kind, id }: { kind: 'listing' | 'housing'; id: number }) {
  const site = kind === 'listing' ? siteForListing(id) : siteForHousing(id);
  const api = useWorld((s) => s.api);
  const enter = useArea((s) => s.enter);
  const setPanelOpen = useUi((s) => s.setPanelOpen);
  if (!site) return null;
  const go = () => {
    const p = api?.getPose();
    enter(site, p ? { x: p.p[0], z: p.p[2], yaw: p.heading } : null);
    setPanelOpen(false);
  };
  return <button type="button" className="ui-v-walk" onClick={go}><Footprints size={16} aria-hidden="true" />주변 걸어보기</button>;
}

/** 동네에 있는 동안 위에 뜨는 막대(캠퍼스로 돌아가기·실내 보기)와, 돌아온 뒤 캠퍼스 위치 복원 */
export function NeighborhoodHud() {
  const area = useArea((s) => s.area);
  const leave = useArea((s) => s.leave);
  const consumeReturn = useArea((s) => s.consumeReturn);
  const consumeGoto = useArea((s) => s.consumeGoto);
  const pendingGoto = useArea((s) => s.pendingGoto);
  const api = useWorld((s) => s.api);
  const areaId = useWorld((s) => s.areaId);
  const enterIndoor = useUi((s) => s.enterIndoor);
  const indoor = useUi((s) => s.indoor);
  const id = siteOf(area);
  const meta = id ? siteMeta(id) : null;

  useEffect(() => {
    if (!api || id || areaId !== "campus" || useArea.getState().pendingGoto) return; // 캠퍼스 월드가 실제로 준비된 뒤에만 (바뀌는 중의 옛 api 는 건너뜀)
    const p = consumeReturn();
    if (p) api.teleport(p.x, p.z);
  }, [api, id, areaId, consumeReturn]);

  // 검색 결과로 이동: 그 월드가 준비되면 해당 자리로 옮긴다 (이미 그 월드면 바로)
  useEffect(() => {
    if (!api || !areaId || !pendingGoto) return;
    const g = consumeGoto(areaId);
    if (!g) return;
    const m = siteMeta(areaId);
    if (!g.stand && m && Math.hypot(g.x - m.x, g.z - m.z) < 30) { api.goToLandmark('hero'); return; } // 집 근처면 기본 자리(집 앞 길). stand(초대 스폰·지도 지점)는 그 자리에
    if (g.stand) { if (!api.teleport(g.x, g.z, g.x, g.z - 1) && !api.goToPlace(g.x, g.z)) api.goToLandmark('hero'); return; }
    if (!api.goToPlace(g.x, g.z)) api.teleport(g.x, g.z);
  }, [api, areaId, pendingGoto, consumeGoto]);

  useEffect(() => {
    if (!api || !meta || areaId !== meta.id) return;
    api.setMarkers([{ id: `home-${meta.id}`, x: meta.x, z: meta.z, color: '#d9480f', text: meta.name, icon: HOUSE_SVG, label: `${meta.name} 위치` }], 'home');
    api.setBeacons([{ x: meta.x, z: meta.z, color: 0xff8a1f }]);
    return () => { api.setMarkers([], 'home'); api.setBeacons([]); };
  }, [api, meta, areaId]);

  if (!meta || indoor) return null;
  return (
    <div className="ui-v-hud" role="region" aria-label="동네 둘러보기">
      <button type="button" className="ui-v-back" onClick={leave}><ArrowLeft size={16} aria-hidden="true" />캠퍼스로</button>
      <span className="ui-v-hud-name">{meta.name}</span>
      {meta.floorplanId != null && <button type="button" className="ui-v-enter ui-v-hud-in" onClick={() => enterIndoor(meta.floorplanId!, meta.name)}><DoorOpen size={16} aria-hidden="true" />실내 보기</button>}
    </div>
  );
}
