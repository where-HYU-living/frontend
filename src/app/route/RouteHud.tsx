import { useEffect, useMemo } from 'react';
import { Footprints, Map as MapIcon, Mountain, School, X } from 'lucide-react';
import { useRoute, showRoute, pickDepartment } from './useRoute';
import { clipToWorld, firstPointIn, minutesFor } from './routeLogic';
import { useWorld } from '../state/world';
import { useUi } from '../state/ui';
import { useArea } from '../state/area';
import { useCampusBuildings, useProfile } from '../features/catalog';
import { useLandAt } from '../goTo';
import { toLocal } from '../map/geo';
import { CAMPUS_BOX } from '../../world/serviceArea';
import { distLabel } from '../../world/landing';
import { CAMPUS_SVG, HOUSE_SVG } from '../icons';
import './route.css';

/**
 * 상세의 '과 건물까지 도보 N분' 버튼 (4단계 F6). 누르면 집 → 내 과 건물 경로를 받아
 * 3D 면 그 집이 있는 월드로 가서 바닥에, 지도면 폴리라인으로 보여 준다. 학과를 안 정했으면 고르라고 안내.
 */
export function WalkLink({ walkMin, from, className = 'ui-link ui-walk-link' }: { walkMin: number | null; from: { lat: number; lng: number; name: string }; className?: string }) {
  const profile = useProfile().data;
  const buildings = useCampusBuildings().data;
  const landAt = useLandAt();
  const loading = useRoute((s) => s.loading);
  const go = async () => {
    const r = await showRoute(from, profile, buildings);
    if (r && useUi.getState().mapMode === '3d') {
      const [lat, lng] = r.path[0]; // 경로 시작(집 앞 길) 에 선다
      landAt({ lat, lng });
    }
  };
  return (
    <button type="button" className={className} onClick={go} disabled={loading} aria-label={walkMin == null ? '과 건물까지 도보 길 보기' : `과 건물까지 도보 ${walkMin}분, 길 보기`}>
      <Footprints size={14} aria-hidden="true" />
      {walkMin == null ? '과 건물까지 길 보기' : `과 건물까지 도보 ${walkMin}분`}<span aria-hidden="true"> ›</span>
    </button>
  );
}

/** 경로 요약 막대 + 3D 바닥 경로·출발/도착 말풍선. 지도 모드에서는 KakaoMap 이 폴리라인을 그린다 */
export function RouteHud() {
  const { route, needDept, loading, clear } = useRoute();
  const api = useWorld((s) => s.api);
  const areaId = useWorld((s) => s.areaId);
  const mapMode = useUi((s) => s.mapMode);
  const indoor = useUi((s) => s.indoor);
  const landAt = useLandAt();

  const clip = useMemo(() => (route && api?.bounds ? clipToWorld(route.path, api.bounds) : null), [route, api]);

  useEffect(() => {
    if (!api || !route || !clip) return;
    const stats = api.setRoute?.(clip.segments) ?? null;
    const [fx, fz] = toLocal(route.from.lat, route.from.lng), [tx, tz] = toLocal(route.to.lat, route.to.lng);
    api.setMarkers([
      { id: 'route-from', x: fx, z: fz, color: '#d9480f', text: '출발 · 집', icon: HOUSE_SVG, label: `출발 ${route.from.name}` },
      { id: 'route-to', x: tx, z: tz, color: '#1c7ed6', text: `도착 · ${route.to.name}`, icon: CAMPUS_SVG, label: `도착 ${route.to.name}` },
    ], 'route');
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__routeStats = { ...stats, area: areaId, segments: clip.segments.length, shownM: Math.round(clip.shownM), outsideM: Math.round(clip.outsideM), first: clip.segments[0]?.[0] ?? null, last: clip.segments.at(-1)?.at(-1) ?? null };
    return () => { api.setRoute?.(null); api.setMarkers([], 'route'); };
  }, [api, route, clip, areaId]);

  if (indoor || (!route && !needDept && !loading)) return null;
  if (loading) return <div className="ui-route glass" role="status">길을 찾는 중…</div>;
  if (needDept) {
    return (
      <div className="ui-route glass" role="dialog" aria-label="도보 길 안내">
        <p className="ui-route-main">내 학과를 정하면 집에서 <b>과 건물까지 걷는 길</b>을 보여줘요.</p>
        <div className="ui-route-actions">
          <button type="button" className="ui-route-btn is-primary" onClick={() => { clear(); pickDepartment(); }}><School size={15} aria-hidden="true" />학과 고르기</button>
          <button type="button" className="ui-route-btn" onClick={clear} aria-label="닫기"><X size={15} aria-hidden="true" /></button>
        </div>
      </div>
    );
  }
  const r = route!;
  const outside = mapMode === '3d' && clip && clip.outsideM > 20 ? clip.outsideM : 0;
  const campusEntry = outside && areaId !== 'campus' ? firstPointIn(r.path, CAMPUS_BOX) : null;
  return (
    <div className="ui-route glass" role="region" aria-label="도보 길">
      <p className="ui-route-title">{r.from.name} → {r.to.name}</p>
      <p className="ui-route-main"><b data-testid="route-dist">{distLabel(r.distanceM)}</b> · 도보 <b data-testid="route-min">{r.minutes}분</b>{r.estimated && <span className="ui-route-est"> (직선 추정 — 길 정보를 못 받았어요)</span>}</p>
      {mapMode === '3d' && clip && (
        <p className="ui-route-sub">
          {clip.shownM < 5 ? '이 월드에서는 경로가 보이지 않아요' : `이 ${areaId === 'campus' ? '캠퍼스' : '동네'}에서 보이는 길 ${distLabel(clip.shownM)}`}
          {outside > 0 && ` · 밖으로 이어지는 길 ${distLabel(outside)} (약 ${minutesFor(outside, clip.totalM, r.minutes)}분)`}
        </p>
      )}
      <div className="ui-route-actions">
        {campusEntry && <button type="button" className="ui-route-btn is-primary" onClick={() => useArea.getState().goTo('campus', campusEntry.x, campusEntry.z, null, true)}><School size={15} aria-hidden="true" />캠퍼스로 이동</button>}
        {mapMode === '3d'
          ? <button type="button" className="ui-route-btn" onClick={() => useUi.getState().setMapMode('2d')}><MapIcon size={15} aria-hidden="true" />지도에서 보기</button>
          : <button type="button" className="ui-route-btn" onClick={() => { const [lat, lng] = r.path[0]; landAt({ lat, lng }); useUi.getState().setMapMode('3d'); }}><Mountain size={15} aria-hidden="true" />3D에서 보기</button>}
        <button type="button" className="ui-route-btn" onClick={clear} aria-label="길 닫기"><X size={15} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
