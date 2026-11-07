import { useEffect } from 'react';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { toLocal } from './map/geo';
import { GRADE_META } from '../lib/grade';
import { depositRent } from '../lib/money';
import { useListings, useListingsUi } from './features/listings';

/** 매물 목록을 3D 말풍선(등급 색)으로 올린다. 클릭하면 집 찾기 탭에서 그 매물 상세를 연다 */
export function ListingMarkers() {
  const api = useWorld((s) => s.api);
  const filters = useListingsUi((s) => s.filters);
  const { data } = useListings(filters);

  useEffect(() => {
    if (!api) return;
    const items = (data?.items ?? []).map((l) => {
      const [x, z] = toLocal(l.lat, l.lng);
      const g = GRADE_META[l.grade];
      return {
        id: String(l.id), x, z, color: g.color,
        text: l.grade === 'PENDING' ? `${depositRent(l.deposit, l.rent)} ?` : depositRent(l.deposit, l.rent),
        label: `${l.title} ${g.label}`,
        onClick: () => { useListingsUi.getState().select(l.id); useUi.setState({ tab: 'home', panelOpen: true }); },
      };
    });
    api.setMarkers(items, 'listing');
    return () => api.setMarkers([], 'listing');
  }, [api, data]);

  return null;
}
