import { useWorld } from './state/world';
import { useArea, siteOf } from './state/area';
import { useUi, type Tab } from './state/ui';
import { useDetailSel } from './state/detail';
import { useListingsUi } from './features/listings';
import { useMapFocus } from './map/mapFocus';
import { useLandAt } from './goTo';
import { distLabel } from '../world/landing';
import { siteForHousing, siteForListing, type SiteId } from '../world/neighborhood';

export type VisitKind = 'LISTING' | 'HOUSING' | 'TRANSFER' | 'DORM';
export type VisitTarget = { kind: VisitKind; id: number; lat: number; lng: number; name: string };

const TAB_OF: Record<VisitKind, Tab> = { LISTING: 'home', HOUSING: 'housing', TRANSFER: 'transfer', DORM: 'dorm' };
export const isVisitKind = (k: string | null | undefined): k is VisitKind => k != null && k in TAB_OF;

/** 이 집의 동네 3D 조각 (매물·청년안심주택 일부만 있다) */
export const siteFor = (kind: VisitKind, id: number): SiteId | null =>
  kind === 'LISTING' ? siteForListing(id) : kind === 'HOUSING' ? siteForHousing(id) : null;

/** 동네 조각 id → 그 집 (동네 HUD 의 [정보] 버튼용). l6 = 매물 6, h3 = 청년안심주택 3 */
export const visitOfSite = (site: SiteId): { kind: VisitKind; id: number } | null => {
  const m = /^([lh])(\d+)$/.exec(site);
  return m ? { kind: m[1] === 'l' ? 'LISTING' : 'HOUSING', id: Number(m[2]) } : null;
};

/** 그 집의 탭으로 바꾸고 상세를 골라 둔다 (패널을 열지는 않는다) */
export function selectInPanel(kind: VisitKind, id: number) {
  if (kind === 'LISTING') useListingsUi.getState().select(id);
  else if (kind === 'HOUSING') useDetailSel.getState().setHousing(id);
  else if (kind === 'TRANSFER') useDetailSel.getState().setTransfer(id);
  useUi.setState({ tab: TAB_OF[kind] });
}

/** 지금 패널이 이 집의 상세를 보여 주고 있는지 */
export function isShowing(kind: VisitKind, id: number): boolean {
  const ui = useUi.getState();
  if (!ui.panelOpen || ui.tab !== TAB_OF[kind]) return false;
  if (kind === 'LISTING') return useListingsUi.getState().selectedId === id;
  if (kind === 'HOUSING') return useDetailSel.getState().housing === id;
  if (kind === 'TRANSFER') return useDetailSel.getState().transfer === id;
  return true;
}

/**
 * 집 하나를 3D 로 보러 간다 — 상세 패널의 '주변 걸어보기'와 지도 핀의 '3D로 가기'가 같이 쓴다.
 * 어느 길로 와도 같게: 동네 조각이 있으면 그 동네의 기본 자리(집 앞, 집을 바라봄)에 서고,
 * 탭·상세는 그 집으로 맞춰 두되 패널은 접는다 (위 HUD 의 [정보] 로 다시 연다). 조각이 없으면 그 지점으로.
 */
export function useVisit() {
  const api = useWorld((s) => s.api);
  const areaId = useWorld((s) => s.areaId);
  const landAt = useLandAt();
  return (t: VisitTarget) => {
    selectInPanel(t.kind, t.id);
    useUi.setState({ panelOpen: false, mapMode: '3d' });
    const site = siteFor(t.kind, t.id);
    if (site) {
      useMapFocus.setState({ notice: null });
      useArea.setState({ pendingGoto: null });
      const cur = siteOf(useArea.getState().area);
      if (cur === site && areaId === site) { api?.goToLandmark('hero'); return; }
      const p = api?.getPose();
      useArea.getState().enter(site, p ? { x: p.p[0], z: p.p[2], yaw: p.heading } : null);
      return;
    }
    const plan = landAt(t);
    useMapFocus.setState({ notice: plan.kind === 'outside' ? `${t.name} 은(는) 3D 지원 지역 밖이라 가장 가까운 ${plan.worldName}(으)로 왔어요 (직선 ${distLabel(plan.distM)})` : null });
  };
}
