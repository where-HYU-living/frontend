import { useEffect } from 'react';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { useDetailSel } from './state/detail';
import { toLocal } from './map/geo';
import { manwon } from '../lib/money';
import { useDorms, useHousingList } from './features/catalog';
import { useFavoriteLookup } from './features/favorites';
import { HEART_SVG } from './icons';

/** 기숙사(주황)·청년안심주택(초록: 모집 중, 파랑: 그 외) 말풍선 */
export function PlaceMarkers() {
  const api = useWorld((s) => s.api);
  const dorms = useDorms().data;
  const housing = useHousingList().data;
  const showHousing = useUi((s) => s.showHousing);
  const fav = useFavoriteLookup();

  useEffect(() => {
    if (!api) return;
    api.setMarkers((dorms ?? []).map((d) => {
      const [x, z] = toLocal(d.lat, d.lng);
      const min = d.roomTypes.length ? Math.min(...d.roomTypes.map((r) => r.monthlyCost)) : null;
      return { id: `d${d.id}`, x, z, color: '#d96f12', text: `${d.name}${min != null ? ` 월 ${manwon(min)}` : ''}`, icon: fav.has('DORM', d.id) ? HEART_SVG : undefined, label: `기숙사 ${d.name}`, onClick: () => useUi.setState({ tab: 'dorm', panelOpen: true }) };
    }), 'dorm');
    return () => api.setMarkers([], 'dorm');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, dorms, fav.sig]);

  useEffect(() => {
    if (!api) return;
    api.setMarkers((showHousing ? housing ?? [] : []).map((h) => {
      const [x, z] = toLocal(h.lat, h.lng);
      return { id: `h${h.id}`, x, z, color: h.recruiting ? '#2f9e57' : '#2f6fb3', text: `${h.name}${h.recruiting ? ' · 모집 중' : ''}`, icon: fav.has('HOUSING', h.id) ? HEART_SVG : undefined, label: `청년안심주택 ${h.name}`, onClick: () => { useDetailSel.getState().setHousing(h.id); useUi.setState({ tab: 'housing', panelOpen: true }); } };
    }), 'housing');
    return () => api.setMarkers([], 'housing');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, housing, showHousing, fav.sig]);

  return null;
}
