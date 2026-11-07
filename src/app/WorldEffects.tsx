import { useEffect, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { toLocal } from './map/geo';
import { useCampusBuildings, useDorms, useHousingList, useNearby, useProfile } from './features/catalog';
import { CAMPUS_SVG, NEARBY_ICON } from './icons';
import { useListingDetail, useListingsUi } from './features/listings';
import { useTransfers } from './features/more';
import { api as call } from '../api/client';
import type { HousingDetail } from '../api/types';
import campusPlaces from './data/campusPlaces.json';
import { resolveGates, resolveMyBuildings } from '../world/campus';
import { buildDoors, type DoorSrc } from '../world/doors';

/** 3D 에 올리는 부가 표시: 시간대 조명·정문·내 과 건물·문 마커·선택한 집 주변 시설·모집 중 단지 빛 기둥 (화면 요소 없음) */
export function WorldEffects() {
  const api = useWorld((s) => s.api);
  const timeOfDay = useUi((s) => s.timeOfDay);
  const showHousing = useUi((s) => s.showHousing);
  const profile = useProfile().data;
  const buildings = useCampusBuildings().data;
  const housing = useHousingList().data;
  const selectedId = useListingsUi((s) => s.selectedId);
  const selected = useListingDetail(selectedId).data;
  const nearby = useNearby(selectedId).data;
  const dorms = useDorms().data;
  const transfers = useTransfers().data;
  const indoor = useUi((s) => s.indoor);
  const enterIndoor = useUi((s) => s.enterIndoor);
  const housingDetails = useQueries({
    queries: (housing ?? []).slice(0, 30).map((h) => ({ queryKey: ['housing', h.id], retry: false, staleTime: 300_000, queryFn: ({ signal }: { signal?: AbortSignal }) => call<HousingDetail>(`/housing/${h.id}`, { signal }) })),
  });
  const housingKey = housingDetails.map((q) => q.data?.id ?? 0).join(',');

  useEffect(() => { api?.setTimeOfDay(timeOfDay); }, [api, timeOfDay]);

  // B5: 정문·후문 아치 + 이름 말풍선 (서버 GATE, 없으면 애지문)
  useEffect(() => {
    if (!api) return;
    const gates = resolveGates(buildings, toLocal, campusPlaces as never);
    api.setGates?.(gates);
    // 애지문은 3D 랜드마크 이름표('애지문 · 한양대역')가 이미 있어 말풍선을 또 달지 않는다
    api.setMarkers(gates.filter((g) => !g.name.includes('애지문')).map((g) => ({ id: g.id, x: g.x, z: g.z, color: '#0e4a84', text: g.name, icon: CAMPUS_SVG, label: `입구 ${g.name}` })), 'gate');
    return () => { api.setGates?.([]); api.setMarkers([], 'gate'); };
  }, [api, buildings]);

  // B5: 내 과 건물 (서버에 없으면 내장 캠퍼스 목록)
  useEffect(() => {
    if (!api) return;
    const mine = resolveMyBuildings(profile?.buildingIds, buildings, toLocal, campusPlaces as never);
    api.setMarkers(mine.map((b) => ({ id: b.id, x: b.x, z: b.z, color: '#0e4a84', text: `내 과 건물 · ${b.name}`, icon: CAMPUS_SVG, label: `내 과 건물 ${b.name}` })), 'mybuilding');
    return () => api.setMarkers([], 'mybuilding');
  }, [api, buildings, profile]);

  // E1: 평면도가 있는 건물 앞 문 마커 (기숙사·청년안심주택·선택한 매물·양도 글). 실내에 있는 동안엔 비운다
  const doors = useMemo(() => {
    const src: DoorSrc[] = [];
    for (const d of dorms ?? []) {
      const rt = d.roomTypes.find((r) => r.floorplanId != null);
      if (rt) { const [x, z] = toLocal(d.lat, d.lng); src.push({ id: `door-d${d.id}`, x, z, title: d.name, floorplanId: rt.floorplanId }); }
    }
    for (const q of housingDetails) {
      const h = q.data;
      const u = h?.unitTypes?.find((t) => t.floorplanId != null);
      if (h && u) { const [x, z] = toLocal(h.lat, h.lng); src.push({ id: `door-h${h.id}`, x, z, title: h.name, floorplanId: u.floorplanId }); }
    }
    if (selected?.floorplanId != null) { const [x, z] = toLocal(selected.lat, selected.lng); src.push({ id: `door-l${selected.id}`, x, z, title: selected.title, floorplanId: selected.floorplanId }); }
    for (const t of transfers?.items ?? []) {
      const fp = (t as { floorplanId?: number | null }).floorplanId;
      if (fp != null) { const [x, z] = toLocal(t.lat, t.lng); src.push({ id: `door-t${t.id}`, x, z, title: t.title, floorplanId: fp }); }
    }
    return buildDoors(src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dorms, housingKey, selected, transfers]);

  useEffect(() => {
    if (!api?.setDoors) return;
    api.setDoors(indoor ? [] : doors.map((d) => ({ id: d.id, x: d.x, z: d.z, title: d.title, onEnter: () => enterIndoor(d.floorplanId, d.title) })));
    return () => api.setDoors?.([]);
  }, [api, doors, indoor, enterIndoor]);

  // F5: 선택한 집 주변 300m
  useEffect(() => {
    if (!api) return;
    const items = selected && nearby ? nearby.map((n, i) => {
      const [x, z] = toLocal(n.lat, n.lng);
      const m = NEARBY_ICON[n.category];
      return { id: `n${i}`, x, z, color: '#5b6673', text: n.name, icon: m.svg, label: `${m.label} ${n.name} ${n.distanceM}m` };
    }) : [];
    api.setMarkers(items, 'nearby');
    return () => api.setMarkers([], 'nearby');
  }, [api, selected, nearby]);

  // M5: 모집 중 단지에 빛 기둥·깃발
  useEffect(() => {
    if (!api) return;
    api.setBeacons(showHousing ? (housing ?? []).filter((h) => h.recruiting).map((h) => { const [x, z] = toLocal(h.lat, h.lng); return { x, z, color: '#2f9e57' }; }) : []);
    return () => api.setBeacons([]);
  }, [api, housing, showHousing]);

  return null;
}
