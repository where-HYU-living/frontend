import { useEffect } from 'react';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { toLocal } from './map/geo';
import { useCampusBuildings, useHousingList, useNearby, useProfile } from './features/catalog';
import { CAMPUS_SVG, NEARBY_ICON } from './icons';
import { useListingDetail, useListingsUi } from './features/listings';

/** 3D 에 올리는 부가 표시: 시간대 조명·내 과 건물·선택한 집 주변 시설·모집 중 단지 빛 기둥 (화면 요소 없음) */
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

  useEffect(() => { api?.setTimeOfDay(timeOfDay); }, [api, timeOfDay]);

  // B5: 내 과 건물
  useEffect(() => {
    if (!api) return;
    const mine = (buildings ?? []).filter((b) => profile?.buildingIds?.includes(b.id));
    api.setMarkers(mine.map((b) => {
      const [x, z] = toLocal(b.lat, b.lng);
      return { id: `b${b.id}`, x, z, color: '#0e4a84', text: `내 과 건물 · ${b.name}`, icon: CAMPUS_SVG, label: `내 과 건물 ${b.name}`, onClick: () => api.goToPlace(x, z) };
    }), 'mybuilding');
    return () => api.setMarkers([], 'mybuilding');
  }, [api, buildings, profile]);

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
