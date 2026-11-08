import { MapPin } from 'lucide-react';
import { manwon } from '../lib/money';
import { HeartButton } from './HeartButton';
import { UnitCard } from './venue';
import { useDorms } from './features/catalog';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { toLocal } from './map/geo';
import { ApiError } from '../api/client';
import type { Dorm } from '../api/types';
import './dossier/dossier.css';
import { useGoToPoint } from './goTo';
import './venue.css';

export function useGoTo() {
  return useGoToPoint();
}

export function DormPanel() {
  const q = useDorms();
  const go = useGoTo();
  const enter = useUi((s) => s.enterIndoor);
  if (q.isLoading) return <p className="empty">불러오는 중…</p>;
  if (q.isError) return <p className="empty">{q.error instanceof ApiError && q.error.code === 'NETWORK' ? '서버에 연결할 수 없어요.' : '기숙사 정보를 불러오지 못했어요.'}</p>;
  if (!q.data?.length) return <p className="empty">등록된 기숙사가 아직 없어요.</p>;
  return (
    <ul className="ui-v-dorms">
      {q.data.map((d: Dorm) => (
        <li key={d.id} className="ui-v-dorm">
          <div className="ui-v-dorm-head">
            <h3>{d.name}</h3>
            <span className="ui-v-dorm-actions">
              <button type="button" className="ui-v-link" onClick={() => go(d)}><MapPin size={14} aria-hidden="true" />3D에서 보기</button>
              <HeartButton type="DORM" id={d.id} name={d.name} />
            </span>
          </div>
          {d.walkMin != null && <p className="ui-v-dorm-sub">과 건물까지 도보 {d.walkMin}분</p>}
          <ul className="ui-v-units">
            {d.roomTypes.map((r) => (
              <UnitCard key={r.id} name={r.name} chip={`${r.capacity}인`} priceLabel="한 달" price={manwon(r.monthlyCost)}
                facts={[{ label: '식비', value: r.mealIncluded ? '포함' : '별도' }, { label: '한 학기', value: manwon(r.semesterFee) }, { label: '기간', value: `${r.semesterMonths}개월` }]}
                floorplanId={r.floorplanId} onEnter={() => enter(r.floorplanId!, `${d.name} ${r.name}`)} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
