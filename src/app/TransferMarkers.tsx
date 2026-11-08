import { useEffect } from 'react';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { useDetailSel } from './state/detail';
import { toLocal } from './map/geo';
import { depositRent } from '../lib/money';
import { GRADE_META } from '../lib/grade';
import { useFavoriteLookup } from './features/favorites';
import { useTransfers } from './features/more';
import { HEART_SVG } from './icons';

/** 양도 글 3D 말풍선 (등급 색, '양도' 표시) */
export function TransferMarkers() {
  const api = useWorld((s) => s.api);
  const items = useTransfers().data?.items;
  const fav = useFavoriteLookup();
  useEffect(() => {
    if (!api) return;
    api.setMarkers((items ?? []).filter((t) => t.status === 'OPEN').map((t) => {
      const [x, z] = toLocal(t.lat, t.lng);
      return { id: `t${t.id}`, x, z, color: GRADE_META[t.grade].color, text: `양도 ${depositRent(t.deposit, t.rent)}`, icon: fav.has('TRANSFER', t.id, t.favorited) ? HEART_SVG : undefined, label: `양도 ${t.title}`, onClick: () => { useDetailSel.getState().setTransfer(t.id); useUi.setState({ tab: 'transfer', panelOpen: true }); } };
    }), 'transfer');
    return () => api.setMarkers([], 'transfer');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, items, fav.sig]);
  return null;
}
