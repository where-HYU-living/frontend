import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { toLocal } from './map/geo';
import { GRADE_META } from '../lib/grade';
import { depositRent, manwon } from '../lib/money';
import type { Grade, ListingSummary } from '../api/types';
import { ApiError } from '../api/client';
import { NO_FILTERS, useListings, useListingsUi } from './features/listings';
import { ListingDetailView } from './ListingDetailView';
import { Field, UnitInput } from './forms/Field';
import './forms/forms.css';
import { DossierCard } from './dossier/DossierCard';
import { GRADE_HINT } from './dossier/dossierLogic';

const ROOM_FILTER: [Filters['roomType'], string][] = [['', '전체'], ['OPEN', '오픈형'], ['SEPARATED', '분리형'], ['ONE_HALF', '1.5룸'], ['TWO_ROOM', '투룸'], ['DUPLEX', '복층']];
const GRADES: Grade[] = ['FAIR', 'SLIGHTLY_HIGH', 'HIGH', 'CULPRIT', 'PENDING'];

/** 3D 에서 그 집 근처로 이동 */
export function useGoToListing() {
  const api = useWorld((s) => s.api);
  return (l: Pick<ListingSummary, 'lat' | 'lng'>) => { const [x, z] = toLocal(l.lat, l.lng); return api?.goToPlace(x, z) ?? false; };
}

type Filters = Parameters<typeof useListings>[0];

export function ListingsPanel() {
  const { filters, setFilters, selectedId, select } = useListingsUi();
  const q = useListings(filters);
  const go = useGoToListing();
  const { showHousing, setShowHousing } = useUi();

  if (selectedId != null) return <ListingDetailView id={selectedId} onBack={() => select(null)} />;

  const set = (patch: Partial<typeof filters>) => setFilters({ ...filters, ...patch });
  const toggle = (g: Grade) => set({ grades: filters.grades.includes(g) ? filters.grades.filter((x) => x !== g) : [...filters.grades, g] });
  const dirty = filters.maxRentMan !== '' || filters.maxDepositMan !== '' || filters.grades.length > 0 || filters.maxWalkMin !== '' || filters.roomType !== '';
  const items = q.data?.items ?? [];

  return (
    <div className="ui-listings">
      <div className="ui-filter2">
        <div className="ui-filter2-head"><span>수사 조건</span>{dirty && <button type="button" onClick={() => setFilters(NO_FILTERS)}>초기화</button>}</div>
        <div className="ui-fgrid">
          <UnitInput label="월세 상한" unit="만" value={filters.maxRentMan} onChange={(v) => set({ maxRentMan: v })} placeholder="상한" ariaLabel="월세 상한(만원)" />
          <UnitInput label="보증금 상한" unit="만" value={filters.maxDepositMan} onChange={(v) => set({ maxDepositMan: v })} placeholder="상한" ariaLabel="보증금 상한(만원)" />
          <UnitInput label="도보(내 과 건물)" unit="분" value={filters.maxWalkMin} onChange={(v) => set({ maxWalkMin: v })} placeholder="이내" ariaLabel="도보 시간 상한(분)" />
        </div>
        <Field label="방 구조">
          {(id) => <select id={id} value={filters.roomType} onChange={(e) => set({ roomType: e.target.value as Filters['roomType'] })} aria-label="방 구조">{ROOM_FILTER.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>}
        </Field>
        <div className="ui-chips" role="group" aria-label="초과 등급">
          {GRADES.map((g) => (
            <button key={g} type="button" className={filters.grades.includes(g) ? 'on' : ''} style={{ '--chip': GRADE_META[g].color } as React.CSSProperties} aria-pressed={filters.grades.includes(g)} onClick={() => toggle(g)}>
              {GRADE_META[g].label}
            </button>
          ))}
        </div>
        <label className="ui-check"><input type="checkbox" checked={showHousing} onChange={(e) => setShowHousing(e.target.checked)} aria-label="청년안심주택 표시" /> 청년안심주택 단지 같이 보기</label>
      </div>

      {q.isLoading && <p className="empty">불러오는 중…</p>}
      {q.isError && <p className="empty">{q.error instanceof ApiError && q.error.code === 'NETWORK' ? '서버에 연결할 수 없어요.' : '매물을 불러오지 못했어요.'}</p>}
      {q.isSuccess && items.length === 0 && <p className="empty">조건에 맞는 매물이 없어요.</p>}
      {q.isSuccess && items.length > 0 && <p className="ui-count">{q.data.total}개</p>}
      <ul className="ui-cards">
        {items.map((l) => (
          <li key={l.id}>
            <DossierCard
              grade={l.grade}
              title={l.title}
              rent={manwon(l.convertedRent)}
              deposit={depositRent(l.deposit, l.rent)}
              hint={GRADE_HINT[l.grade]}
              meta={[`${l.areaM2}㎡`, l.floor == null ? '층 정보 없음' : `${l.floor}층`, l.walkMin == null ? '도보 정보 없음' : `도보 ${l.walkMin}분`]}
              onClick={() => { select(l.id); go(l); }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
