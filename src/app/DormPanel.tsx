import { manwon } from '../lib/money';
import { useDorms } from './features/catalog';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { toLocal } from './map/geo';
import { ApiError } from '../api/client';
import type { Dorm } from '../api/types';

export function useGoTo() {
  const api = useWorld((s) => s.api);
  return (p: { lat: number; lng: number }) => { const [x, z] = toLocal(p.lat, p.lng); return api?.goToPlace(x, z) ?? false; };
}

export function DormPanel() {
  const q = useDorms();
  const go = useGoTo();
  const enter = useUi((s) => s.enterIndoor);
  if (q.isLoading) return <p className="empty">불러오는 중…</p>;
  if (q.isError) return <p className="empty">{q.error instanceof ApiError && q.error.code === 'NETWORK' ? '서버에 연결할 수 없어요.' : '기숙사 정보를 불러오지 못했어요.'}</p>;
  if (!q.data?.length) return <p className="empty">등록된 기숙사가 아직 없어요.</p>;
  return (
    <ul className="ui-cards">
      {q.data.map((d: Dorm) => (
        <li key={d.id} className="ui-block">
          <button type="button" className="ui-block-head" onClick={() => go(d)}><strong>{d.name}</strong><span className="ui-card-sub">3D에서 보기</span></button>
          <ul className="ui-rows">
            {d.roomTypes.map((r) => (
              <li key={r.id}>
                <span>{r.name} · {r.capacity}인 <span className="ui-card-sub">월 {manwon(r.monthlyCost)} 원 {r.mealIncluded ? '(식비 포함)' : '(식비 별도)'}</span></span>
                {r.floorplanId != null && <button type="button" className="ui-mini" onClick={() => enter(r.floorplanId!, `${d.name} ${r.name}`)}>실내 들어가기</button>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
