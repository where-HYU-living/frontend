import { Bell, ChevronLeft, ChevronRight, Phone } from 'lucide-react';
import { BackButton } from './icons';
import { InfoChip, SectionTitle, UnitCard } from './venue';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { manwon } from '../lib/money';
import { addMonths, dday, EVENT_LABEL, groupEventsByMonth, initialMonth, monthCells, STATUS_LABEL, useAnnouncements, useHousingDetail, useHousingList, useSubscribe, ymdOf } from './features/catalog';
import { useGoTo } from './DormPanel';
import { useDetailSel } from './state/detail';
import { useUi } from './state/ui';
import { useSession } from './state/session';
import { HeartButton } from './HeartButton';
import { NeighborhoodButton } from './NeighborhoodButton';
import { WalkLink } from './route/RouteHud';
import type { EventType, Housing } from '../api/types';
import { useMyHome } from './features/more';
import { convertedRentWon } from './forms/calc';
import './dossier/dossier.css';
import './venue.css';

function Detail({ id, onBack }: { id: number; onBack: () => void }) {
  const q = useHousingDetail(id);
  const sub = useSubscribe(id);
  const enter = useUi((s) => s.enterIndoor);
  const requireLogin = useSession((s) => s.requireLogin);
  const home = useMyHome().data;
  if (q.isLoading) return <p className="empty">불러오는 중…</p>;
  if (!q.data) return <div><BackButton onClick={onBack} /><p className="empty">단지 정보를 불러오지 못했어요.</p></div>;
  const h = q.data;
  // I19: 내 집(등록돼 있으면) 대비 월·2년 차이. 양수면 이 단지가 더 쌈
  const mine = home ? convertedRentWon(home.deposit, home.rent, home.mgmtFee) : null;
  const vsMine = (conv: number) => {
    if (mine == null) return null;
    const d = mine - conv;
    return d === 0 ? '내 집과 같아요' : `내 집보다 월 ${manwon(Math.abs(d))} ${d > 0 ? '싸요' : '비싸요'} (2년 ${manwon(Math.abs(d) * 24)})`;
  };
  return (
    <div className="ui-detail">
      <BackButton onClick={onBack} />
      <div className="ui-v-title"><h3>{h.name}</h3><HeartButton type="HOUSING" id={h.id} name={h.name} /></div>
      <p className="ui-v-addr">{h.address}</p>
      <NeighborhoodButton kind="housing" id={h.id} />
      <ul className="ui-v-chips">
        <li className="ui-v-chip-li"><WalkLink walkMin={h.walkMin} from={{ lat: h.lat, lng: h.lng, name: h.name }} className="ui-v-chip ui-walk-link" /></li>
        {h.contact && <InfoChip icon={<Phone size={14} aria-hidden="true" />}>입주지원센터 {h.contact}</InfoChip>}
      </ul>
      <button type="button" className={`ui-v-notify ${h.subscribed ? 'is-on' : 'is-off'}`} onClick={() => { if (requireLogin()) sub.mutate(!h.subscribed); }}>
        <Bell size={16} aria-hidden="true" />{h.subscribed ? <>알림 받는 중 <small>눌러서 끄기</small></> : 'D-day 알림 받기'}
      </button>
      {sub.isError && <p className="ui-heart-err" role="alert">알림 설정을 저장하지 못했어요</p>}
      <SectionTitle count={h.unitTypes.length}>주택형</SectionTitle>
      <ul className="ui-v-units">
        {h.unitTypes.map((u) => (
          <UnitCard key={u.id} name={u.name} chip={`${u.exclusiveAreaM2}㎡`} priceLabel="환산 월세" price={manwon(u.convertedRent)}
            facts={[{ label: '보증금', value: manwon(u.deposit) }, { label: '월세', value: manwon(u.rent) }, { label: '관리비', value: u.mgmtFee != null ? manwon(u.mgmtFee) : '-' }, ...(vsMine(u.convertedRent) ? [{ label: '내 집 대비', value: vsMine(u.convertedRent)! }] : [])]}
            floorplanId={u.floorplanId} onEnter={() => enter(u.floorplanId!, `${h.name} ${u.name}`)} />
        ))}
        {h.unitTypes.length === 0 && <li className="ui-card-sub">주택형 정보가 아직 없어요.</li>}
      </ul>
    </div>
  );
}

/** 일정 종류별 점 색: 접수(파랑)·마감(빨강)·발표(초록)·그 밖(회색) */
const EVENT_TONE: Record<EventType, 'apply' | 'due' | 'result' | 'etc'> = {
  NOTICE: 'etc', APPLY_START: 'apply', APPLY_END: 'due', DOCS_DUE: 'due', RESULT: 'result', CONTRACT: 'etc', MOVE_IN: 'etc',
};
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

function Calendar({ names }: { names: Map<number, string> }) {
  const q = useAnnouncements();
  const [month, setMonth] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  if (q.isLoading) return <p className="empty">불러오는 중…</p>;
  if (q.isError || !q.data) return <p className="empty">공고 일정을 불러오지 못했어요.</p>;
  const groups = groupEventsByMonth(q.data, (id) => names.get(id) ?? '');
  if (groups.size === 0) return <p className="empty">등록된 공고가 없어요.</p>;
  const ym = month ?? initialMonth([...groups.keys()]);
  const evs = groups.get(ym) ?? [];
  const byDay = new Map<string, typeof evs>();
  for (const e of evs) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const today = ymdOf(new Date());
  const shown = day ? byDay.get(day) ?? [] : evs;
  const move = (n: number) => { setMonth(addMonths(ym, n)); setDay(null); };
  const [y, m] = ym.split('-');
  return (
    <div className="ui-cal">
      <div className="ui-cal-head">
        <button type="button" className="ui-cal-nav" aria-label="이전 달" onClick={() => move(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <strong>{y}년 {Number(m)}월</strong>
        <button type="button" className="ui-cal-nav" aria-label="다음 달" onClick={() => move(1)}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
      <div className="ui-cal-grid" role="grid">
        {WEEK.map((w, i) => <span key={w} className={`ui-cal-wd${i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''}`}>{w}</span>)}
        {monthCells(ym).map((d, i) => {
          if (!d) return <span key={i} className="ui-cal-cell is-blank" />;
          const list = byDay.get(d) ?? [];
          const cls = ['ui-cal-cell', d === today && 'is-today', d < today && 'is-past', d === day && 'is-sel', list.length > 0 && 'has-ev', i % 7 === 0 && 'is-sun', i % 7 === 6 && 'is-sat'].filter(Boolean).join(' ');
          return (
            <button key={d} type="button" className={cls} disabled={!list.length} aria-pressed={d === day}
              aria-label={`${Number(d.slice(8))}일${list.length ? ` 일정 ${list.length}개` : ''}`} onClick={() => setDay(d === day ? null : d)}>
              <span className="ui-cal-num">{Number(d.slice(8))}</span>
              {list.length > 0 && (
                <span className="ui-cal-dots">
                  {list.slice(0, 3).map((e, k) => <i key={k} className={`ui-cal-dot is-${EVENT_TONE[e.type]}`} />)}
                  {list.length > 3 && <small>+{list.length - 3}</small>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <ul className="ui-cal-legend" aria-hidden="true">
        <li><i className="ui-cal-dot is-apply" />접수</li><li><i className="ui-cal-dot is-due" />마감</li><li><i className="ui-cal-dot is-result" />발표</li><li><i className="ui-cal-dot is-etc" />공고·계약·입주</li>
      </ul>
      <h4 className="ui-cal-sub">{day ? `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 일정` : '이달 일정'}{day && <button type="button" className="ui-cal-all" onClick={() => setDay(null)}>이달 전체 보기</button>}</h4>
      {shown.length === 0 ? <p className="empty">이 달에는 일정이 없어요.</p> : (
        <ol className="ui-timeline">
          {shown.map((e, i) => {
            const dd = dday(e.date);
            return (
              <li key={i} className={`ui-tl-item${dd.startsWith('D+') ? ' is-past' : ''}`}>
                <span className="ui-tl-main"><span className="ui-tl-date">{e.date.slice(5)}</span><span>{e.housingName} {EVENT_LABEL[e.type]} <span className="ui-card-sub">{STATUS_LABEL[e.status]}</span></span></span>
                <strong className="ui-dday">{dd}</strong>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function HousingPanel() {
  const q = useHousingList();
  const go = useGoTo();
  const sel = useDetailSel((s) => s.housing), setSel = useDetailSel((s) => s.setHousing);
  const [view, setView] = useState<'list' | 'cal'>('list');
  if (sel != null) return <Detail id={sel} onBack={() => setSel(null)} />;
  if (q.isLoading) return <p className="empty">불러오는 중…</p>;
  if (q.isError) return <p className="empty">{q.error instanceof ApiError && q.error.code === 'NETWORK' ? '서버에 연결할 수 없어요.' : '단지 정보를 불러오지 못했어요.'}</p>;
  const names = new Map((q.data ?? []).map((h) => [h.id, h.name]));
  return (
    <div>
      <div className="ui-seg" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}>단지</button>
        <button type="button" role="tab" aria-selected={view === 'cal'} onClick={() => setView('cal')}>공고 캘린더</button>
      </div>
      {view === 'cal' ? <Calendar names={names} /> : (q.data?.length ? (
        <ul className="ui-v-places">
          {q.data.map((h: Housing) => (
            <li key={h.id} className="ui-heart-host">
              <button type="button" className="ui-v-place" onClick={() => { setSel(h.id); go(h); }}>
                {(h.recruiting || h.nextEvent) && (
                  <span className="ui-v-place-top">
                    {h.recruiting && <span className="ui-v-tag is-go">모집 중</span>}
                    {h.nextEvent && <span className="ui-v-dday"><b>{dday(h.nextEvent.date)}</b>{EVENT_LABEL[h.nextEvent.type]}</span>}
                  </span>
                )}
                <strong className="ui-v-place-name">{h.name}</strong>
                <span className="ui-v-place-addr">{h.address}</span>
                {(h.minConvertedRent != null || h.walkMin != null) && (
                  <span className="ui-v-place-meta">
                    {h.minConvertedRent != null && <span>환산 월세 <b>{manwon(h.minConvertedRent)}</b>부터</span>}
                    {h.walkMin != null && <span>도보 <b>{h.walkMin}분</b></span>}
                  </span>
                )}
              </button>
              <HeartButton type="HOUSING" id={h.id} name={h.name} className="ui-heart-abs" />
            </li>
          ))}
        </ul>
      ) : <p className="empty">등록된 단지가 아직 없어요.</p>)}
    </div>
  );
}
