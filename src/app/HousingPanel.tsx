import { BackButton } from './icons';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { manwon } from '../lib/money';
import { dday, EVENT_LABEL, groupEventsByMonth, STATUS_LABEL, useAnnouncements, useHousingDetail, useHousingList, useSubscribe } from './features/catalog';
import { useGoTo } from './DormPanel';
import { useUi } from './state/ui';
import { useSession } from './state/session';
import { HeartButton } from './HeartButton';
import type { Housing } from '../api/types';
import './dossier/dossier.css';

function Detail({ id, onBack }: { id: number; onBack: () => void }) {
  const q = useHousingDetail(id);
  const sub = useSubscribe(id);
  const enter = useUi((s) => s.enterIndoor);
  const requireLogin = useSession((s) => s.requireLogin);
  if (q.isLoading) return <p className="empty">불러오는 중…</p>;
  if (!q.data) return <div><BackButton onClick={onBack} /><p className="empty">단지 정보를 불러오지 못했어요.</p></div>;
  const h = q.data;
  return (
    <div className="ui-detail">
      <BackButton onClick={onBack} />
      <div className="ui-detail-head"><h3>{h.name}</h3><HeartButton type="HOUSING" id={h.id} favorited={false} /></div>
      <p className="ui-card-sub">{h.address}</p>
      <p className="ui-card-sub">{h.walkMin == null ? '과 건물까지 도보 시간 정보 없음' : `과 건물까지 도보 ${h.walkMin}분`}{h.contact ? ` · 입주지원센터 ${h.contact}` : ''}</p>
      <button type="button" className="ui-primary" onClick={() => { if (requireLogin()) sub.mutate(!h.subscribed); }}>{h.subscribed ? '알림 받는 중 (끄기)' : 'D-day 알림 받기'}</button>
      {sub.isError && <p className="ui-heart-err" role="alert">알림 설정을 저장하지 못했어요</p>}
      <h4>주택형</h4>
      <ul className="ui-rows">
        {h.unitTypes.map((u) => (
          <li key={u.id}>
            <span>
              <span>{u.name} · {u.exclusiveAreaM2}㎡ <strong className="ui-dorm-cost">{manwon(u.convertedRent)}</strong></span>
              <span className="ui-card-sub">환산 월세 · 보증금 {manwon(u.deposit)} / 월 {manwon(u.rent)}{u.mgmtFee != null ? ` · 관리비 ${manwon(u.mgmtFee)}` : ''}</span>
            </span>
            {u.floorplanId != null && <button type="button" className="ui-mini" onClick={() => enter(u.floorplanId!, `${h.name} ${u.name}`)}>실내 들어가기</button>}
          </li>
        ))}
        {h.unitTypes.length === 0 && <li className="ui-card-sub">주택형 정보가 아직 없어요.</li>}
      </ul>
    </div>
  );
}

function Calendar({ names }: { names: Map<number, string> }) {
  const q = useAnnouncements();
  if (q.isLoading) return <p className="empty">불러오는 중…</p>;
  if (q.isError || !q.data) return <p className="empty">공고 일정을 불러오지 못했어요.</p>;
  const groups = groupEventsByMonth(q.data, (id) => names.get(id) ?? '');
  if (groups.size === 0) return <p className="empty">등록된 공고가 없어요.</p>;
  return (
    <div>
      {[...groups].map(([month, evs]) => (
        <section key={month}>
          <h4>{month.replace('-', '년 ')}월</h4>
          <ol className="ui-timeline">
            {evs.map((e, i) => {
              const dd = dday(e.date);
              return (
                <li key={i} className={`ui-tl-item${dd.startsWith('D+') ? ' is-past' : ''}$`}>
                  <span className="ui-tl-main"><span className="ui-tl-date">{e.date.slice(5)}</span><span>{e.housingName} {EVENT_LABEL[e.type]} <span className="ui-card-sub">{STATUS_LABEL[e.status]}</span></span></span>
                  <strong className="ui-dday">{dd}</strong>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

export function HousingPanel() {
  const q = useHousingList();
  const go = useGoTo();
  const [sel, setSel] = useState<number | null>(null);
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
        <ul className="ui-cards">
          {q.data.map((h: Housing) => (
            <li key={h.id}>
              <button type="button" className="ui-card" onClick={() => { setSel(h.id); go(h); }}>
                {h.recruiting && <span className="ui-card-badge" style={{ background: '#3BA55C' }}>모집 중</span>}
                <strong>{h.name}</strong>
                {h.nextEvent && <span className="ui-dc-rent"><strong className="ui-dday">{dday(h.nextEvent.date)}</strong> <span className="ui-dc-rent-label">{EVENT_LABEL[h.nextEvent.type]}</span></span>}
                <span className="ui-card-sub">{h.address}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="empty">등록된 단지가 아직 없어요.</p>)}
    </div>
  );
}
