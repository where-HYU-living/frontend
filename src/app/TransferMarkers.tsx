import { useEffect } from 'react';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { toLocal } from './map/geo';
import { depositRent } from '../lib/money';
import { GRADE_META } from '../lib/grade';
import { useTransfers } from './features/more';

/** 양도 글 3D 말풍선 (등급 색, '양도' 표시) */
export function TransferMarkers() {
  const api = useWorld((s) => s.api);
  const items = useTransfers().data?.items;
  useEffect(() => {
    if (!api) return;
    api.setMarkers((items ?? []).filter((t) => t.status === 'OPEN').map((t) => {
      const [x, z] = toLocal(t.lat, t.lng);
      return { id: `t${t.id}`, x, z, color: GRADE_META[t.grade].color, text: `양도 ${depositRent(t.deposit, t.rent)}`, label: `양도 ${t.title}`, onClick: () => useUi.setState({ tab: 'transfer', panelOpen: true }) };
    }), 'transfer');
    return () => api.setMarkers([], 'transfer');
  }, [api, items]);
  return null;
}
