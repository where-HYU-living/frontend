import { useEffect } from 'react';
import { ArrowLeft, DoorOpen, Footprints, House, PanelLeft } from 'lucide-react';
import { useWorld } from './state/world';
import { useArea, siteOf } from './state/area';
import { useUi } from './state/ui';
import { siteMeta } from '../world/neighborhood';
import { isShowing, selectInPanel, siteFor, useVisit, visitOfSite } from './visit';
import { useDetailSel } from './state/detail';
import { useListingsUi } from './features/listings';
import './venue.css';

/** 상세 패널의 "주변 걸어보기": 지도 핀의 '3D로 가기'와 같은 useVisit 으로 간다. 동네 조각이 없는 집이면 아무것도 그리지 않는다 */
export function NeighborhoodButton({ kind, id, lat, lng, name }: { kind: 'listing' | 'housing'; id: number; lat: number; lng: number; name: string }) {
  const k = kind === 'listing' ? 'LISTING' : 'HOUSING';
  const visit = useVisit();
  if (!siteFor(k, id)) return null;
  return <button type="button" className="ui-v-walk" onClick={() => visit({ kind: k, id, lat, lng, name })}><Footprints size={16} aria-hidden="true" />주변 걸어보기</button>;
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
  const mapMode = useUi((s) => s.mapMode);
  const panelOpen = useUi((s) => s.panelOpen);
  const tab = useUi((s) => s.tab);
  const selHousing = useDetailSel((s) => s.housing);
  const selListing = useListingsUi((s) => s.selectedId);
  const hv = meta ? visitOfSite(meta.id) : null;
  const infoOn = !!hv && panelOpen && (hv.kind === 'LISTING' ? tab === 'home' && selListing === hv.id : tab === 'housing' && selHousing === hv.id);

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
    if (g.stand) { const [fx, fz] = g.face ?? [g.x, g.z - 1]; if (!api.teleport(g.x, g.z, fx, fz) && !api.goToPlace(g.x, g.z)) api.goToLandmark('hero'); return; }
    if (!api.goToPlace(g.x, g.z)) api.teleport(g.x, g.z);
  }, [api, areaId, pendingGoto, consumeGoto]);

  useEffect(() => {
    if (!api || !meta || areaId !== meta.id) return;
    // 이름표는 띄우지 않는다: 이름은 위 HUD 에 있고, 집 앞에 서 있으니 빛 기둥만으로 어느 건물인지 안다 (이름이 세 번 겹쳐 헷갈렸음)
    api.setBeacons([{ x: meta.x, z: meta.z, color: 0xff8a1f }]);
    return () => { api.setBeacons([]); };
  }, [api, meta, areaId]);

  if (!meta || indoor || mapMode === '2d') return null;
  const home = visitOfSite(meta.id);
  const toggleInfo = () => {
    if (!home) return;
    if (isShowing(home.kind, home.id)) { useUi.setState({ panelOpen: false }); return; }
    selectInPanel(home.kind, home.id);
    useUi.setState({ panelOpen: true });
  };
  return (
    <div className="ui-v-hud" role="region" aria-label="동네 둘러보기">
      <button type="button" className="ui-v-back" onClick={leave}><ArrowLeft size={16} aria-hidden="true" />캠퍼스로</button>
      <span className="ui-v-hud-sep" aria-hidden="true" />
      <span className="ui-v-hud-place">
        <House size={15} className="ui-v-hud-ico" aria-hidden="true" />
        <span className="ui-v-hud-name" title={meta.name}>{meta.name}</span>
      </span>
      {home && <button type="button" className="ui-v-hud-info" aria-pressed={infoOn} onClick={toggleInfo}><PanelLeft size={15} aria-hidden="true" />{home.kind === 'LISTING' ? '매물 정보' : '단지 정보'}</button>}
      {meta.floorplanId != null && <button type="button" className="ui-v-hud-in" onClick={() => enterIndoor(meta.floorplanId!, meta.name)}><DoorOpen size={16} aria-hidden="true" />실내 보기</button>}
    </div>
  );
}
