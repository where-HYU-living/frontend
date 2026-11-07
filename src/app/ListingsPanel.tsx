import { useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { toLocal } from './map/geo';
import { GRADE_META, inkFor } from '../lib/grade';
import { depositRent, manwon } from '../lib/money';
import type { Grade, ListingSummary } from '../api/types';
import { ApiError } from '../api/client';
import { NO_FILTERS, useListings, useListingsUi } from './features/listings';
import { ListingDetailView } from './ListingDetailView';
import { Field, UnitInput } from './forms/Field';
import './forms/forms.css';
import { useGoToPoint } from './goTo';
import './venue.css';
import { DossierCard } from './dossier/DossierCard';
import { HeartButton } from './HeartButton';
import { GRADE_HINT } from './dossier/dossierLogic';

const ROOM_FILTER: [Filters['roomType'], string][] = [['', '전체'], ['OPEN', '오픈형'], ['SEPARATED', '분리형'], ['ONE_HALF', '1.5룸'], ['TWO_ROOM', '투룸'], ['DUPLEX', '복층']];
const GRADES: Grade[] = ['FAIR', 'SLIGHTLY_HIGH', 'HIGH', 'CULPRIT', 'PENDING'];

/** 3D 에서 그 집 근처로 이동 */
export function useGoToListing() {
  return useGoToPoint();
}

type Filters = Parameters<typeof useListings>[0];

export function ListingsPanel() {
  const { filters, setFilters, selectedId, select } = useListingsUi();
  const q = useListings(filters);
  const go = useGoToListing();
  const { showHousing, setShowHousing } = useUi();
  const [open, setOpen] = useState(false);

  if (selectedId != null) return <ListingDetailView id={selectedId} onBack={() => select(null)} />;

  const set = (patch: Partial<typeof filters>) => setFilters({ ...filters, ...patch });
  const toggle = (g: Grade) => set({ grades: filters.grades.includes(g) ? filters.grades.filter((x) => x !== g) : [...filters.grades, g] });
  const dirty = filters.maxRentMan !== '' || filters.maxDepositMan !== '' || filters.grades.length > 0 || filters.maxWalkMin !== '' || filters.roomType !== '';
  const items = q.data?.items ?? [];
  const activeCount = [filters.maxRentMan, filters.maxDepositMan, filters.maxWalkMin, filters.roomType].filter((v) => v !== '').length + (filters.grades.length ? 1 : 0);
  const summary = [
    filters.maxRentMan !== '' && `월세 ${filters.maxRentMan}만 이하`,
    filters.maxDepositMan !== '' && `보증금 ${filters.maxDepositMan}만 이하`,
    filters.maxWalkMin !== '' && `도보 ${filters.maxWalkMin}분 이내`,
    filters.roomType !== '' && (ROOM_FILTER.find(([v]) => v === filters.roomType)?.[1] ?? ''),
  ].filter((x): x is string => !!x);

  return (
    <div className="ui-listings">
      <div className="ui-v-filter">
        <div className="ui-v-filter-bar">
          <button type="button" className="ui-v-filterbtn" aria-expanded={open} aria-controls="ui-v-filter-body" onClick={() => setOpen((v) => !v)}>
            <SlidersHorizontal size={15} aria-hidden="true" />조건
            {activeCount > 0 && <span className="ui-v-filter-n" aria-label={`${activeCount}개 적용 중`}>{activeCount}</span>}
            <ChevronDown size={15} className={open ? 'is-open' : ''} aria-hidden="true" />
          </button>
          <div className="ui-v-grades" role="group" aria-label="가격 등급">
            {GRADES.map((g) => (
              <button key={g} type="button" className={`ui-v-grade${filters.grades.includes(g) ? ' is-on' : ''}`} style={{ '--g': GRADE_META[g].color, '--g-ink': inkFor(GRADE_META[g].color) } as React.CSSProperties} aria-pressed={filters.grades.includes(g)} onClick={() => toggle(g)}>
                <i aria-hidden="true" />{GRADE_META[g].label}
              </button>
            ))}
          </div>
        </div>
        {open && (
          <div id="ui-v-filter-body" className="ui-v-filter-body">
            <div className="ui-fgrid">
              <UnitInput label="월세" unit="만" value={filters.maxRentMan} onChange={(v) => set({ maxRentMan: v })} placeholder="제한 없음" ariaLabel="월세 상한(만원)" />
              <UnitInput label="보증금" unit="만" value={filters.maxDepositMan} onChange={(v) => set({ maxDepositMan: v })} placeholder="제한 없음" ariaLabel="보증금 상한(만원)" />
              <UnitInput label="내 과 건물까지 도보" unit="분" value={filters.maxWalkMin} onChange={(v) => set({ maxWalkMin: v })} placeholder="제한 없음" ariaLabel="도보 시간 상한(분)" />
              <Field label="방 구조">
                {(id) => <select id={id} value={filters.roomType} onChange={(e) => set({ roomType: e.target.value as Filters['roomType'] })} aria-label="방 구조">{ROOM_FILTER.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>}
              </Field>
            </div>
            <label className="ui-check"><input type="checkbox" checked={showHousing} onChange={(e) => setShowHousing(e.target.checked)} aria-label="청년안심주택 표시" /> 지도에 청년안심주택 단지도 보기</label>
            <div className="ui-v-filter-foot"><button type="button" className="ui-v-reset" disabled={!dirty} onClick={() => setFilters(NO_FILTERS)}>조건 모두 지우기</button></div>
          </div>
        )}
        {q.isSuccess && (
          <p className="ui-v-summary"><b>{q.data.total}개</b>{summary.map((t) => <span key={t}>{t}</span>)}</p>
        )}
      </div>

      {q.isLoading && <p className="empty">불러오는 중…</p>}
      {q.isError && <p className="empty">{q.error instanceof ApiError && q.error.code === 'NETWORK' ? '서버에 연결할 수 없어요.' : '매물을 불러오지 못했어요.'}</p>}
      {q.isSuccess && items.length === 0 && <p className="empty">조건에 맞는 매물이 없어요.</p>}
      <ul className="ui-cards">
        {items.map((l) => (
          <li key={l.id} className="ui-heart-host">
            <DossierCard
              grade={l.grade}
              title={l.title}
              rent={manwon(l.convertedRent)}
              deposit={depositRent(l.deposit, l.rent)}
              hint={GRADE_HINT[l.grade]}
              meta={[`${l.areaM2}㎡`, l.floor == null ? '층 정보 없음' : `${l.floor}층`, l.walkMin == null ? '도보 정보 없음' : `도보 ${l.walkMin}분`]}
              onClick={() => { select(l.id); go(l); }}
            />
            <HeartButton type="LISTING" id={l.id} favorited={l.favorited} name={l.title} className="ui-heart-abs" />
          </li>
        ))}
      </ul>
    </div>
  );
}
