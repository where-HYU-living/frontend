import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { toLocal } from './map/geo';
import { GRADE_META } from '../lib/grade';
import { depositRent, manwon } from '../lib/money';
import type { Grade, ListingSummary } from '../api/types';
import { ApiError } from '../api/client';
import { NO_FILTERS, useListings, useListingsUi } from './features/listings';
import { ListingDetailView } from './ListingDetailView';

const GRADES: Grade[] = ['FAIR', 'SLIGHTLY_HIGH', 'HIGH', 'CULPRIT', 'PENDING'];

/** 3D 에서 그 집 근처로 이동 */
export function useGoToListing() {
  const api = useWorld((s) => s.api);
  return (l: Pick<ListingSummary, 'lat' | 'lng'>) => { const [x, z] = toLocal(l.lat, l.lng); return api?.goToPlace(x, z) ?? false; };
}

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
      <div className="ui-filter">
        <label>월세 <input inputMode="numeric" value={filters.maxRentMan} onChange={(e) => set({ maxRentMan: e.target.value })} placeholder="상한" aria-label="월세 상한(만원)" /> 만 이하</label>
        <label>보증금 <input inputMode="numeric" value={filters.maxDepositMan} onChange={(e) => set({ maxDepositMan: e.target.value })} placeholder="상한" aria-label="보증금 상한(만원)" /> 만 이하</label>
        <label>도보 <input inputMode="numeric" value={filters.maxWalkMin} onChange={(e) => set({ maxWalkMin: e.target.value })} placeholder="분" aria-label="도보 시간 상한(분)" /> 분 이내 <span className="ui-card-sub">(내 과 건물 기준)</span></label>
        <label>구조 <select value={filters.roomType} onChange={(e) => set({ roomType: e.target.value as typeof filters.roomType })} aria-label="방 구조">
          <option value="">전체</option><option value="OPEN">오픈형</option><option value="SEPARATED">분리형</option><option value="ONE_HALF">1.5룸</option><option value="TWO_ROOM">투룸</option><option value="DUPLEX">복층</option>
        </select></label>
        <label className="ui-check"><input type="checkbox" checked={showHousing} onChange={(e) => setShowHousing(e.target.checked)} aria-label="청년안심주택 표시" /> 청년안심주택 단지 같이 보기</label>
        <div className="ui-chips" role="group" aria-label="초과 등급">
          {GRADES.map((g) => (
            <button key={g} type="button" className={filters.grades.includes(g) ? 'on' : ''} style={{ '--chip': GRADE_META[g].color } as React.CSSProperties} aria-pressed={filters.grades.includes(g)} onClick={() => toggle(g)}>
              {GRADE_META[g].label}
            </button>
          ))}
          {dirty && <button type="button" className="reset" onClick={() => setFilters(NO_FILTERS)}>초기화</button>}
        </div>
      </div>

      {q.isLoading && <p className="empty">불러오는 중…</p>}
      {q.isError && <p className="empty">{q.error instanceof ApiError && q.error.code === 'NETWORK' ? '서버에 연결할 수 없어요.' : '매물을 불러오지 못했어요.'}</p>}
      {q.isSuccess && items.length === 0 && <p className="empty">조건에 맞는 매물이 없어요.</p>}
      {q.isSuccess && items.length > 0 && <p className="ui-count">{q.data.total}개</p>}
      <ul className="ui-cards">
        {items.map((l) => (
          <li key={l.id}>
            <button type="button" className="ui-card" onClick={() => { select(l.id); go(l); }}>
              <span className="ui-card-badge" style={{ background: GRADE_META[l.grade].color }}>{GRADE_META[l.grade].label}</span>
              <strong>{depositRent(l.deposit, l.rent)}</strong>
              <span className="ui-card-sub">{l.title} · {l.areaM2}㎡ · 환산 {manwon(l.convertedRent)}</span>
              <span className="ui-card-sub">{l.walkMin == null ? '도보 정보 없음' : `과 건물까지 도보 ${l.walkMin}분`}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
