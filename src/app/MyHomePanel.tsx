import { Fragment, useState } from 'react';
import { manwon } from '../lib/money';
import { GRADE_META } from '../lib/grade';
import type { AddressResult, MyHome } from '../api/types';
import { AddressPicker } from './AddressPicker';
import { ITEM_LABEL, manToWon, thisMonth, useAlertActions, useAlerts, useMyHome, useReport, useSaveHome, useSavePayment, useSaveUtility, validDaysBefore } from './features/more';
import { useSession } from './state/session';

function HomeForm({ onDone }: { onDone: () => void }) {
  const save = useSaveHome();
  const [addr, setAddr] = useState<AddressResult | null>(null);
  const [f, setF] = useState({ deposit: '', rent: '', mgmt: '', area: '', start: '', end: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const deposit = manToWon(f.deposit), rent = manToWon(f.rent);
  const valid = addr && deposit != null && rent != null && Number(f.area) > 0 && f.start && f.end && f.start <= f.end;
  const submit = () => {
    if (!valid) return;
    const body: MyHome = { address: addr!.roadAddress ?? addr!.address, dong: addr!.dong, lat: addr!.lat, lng: addr!.lng, deposit: deposit!, rent: rent!, mgmtFee: manToWon(f.mgmt), areaM2: Number(f.area), contractStart: f.start, contractEnd: f.end };
    save.mutate(body, { onSuccess: onDone });
  };
  return (
    <div className="ui-form">
      <p className="ui-card-sub">지금 사는 집을 등록하면 월 주거비와 적정가 대비 초과액을 보여줘요.</p>
      <AddressPicker value={addr} onPick={setAddr} />
      <label>보증금(만원)<input inputMode="numeric" value={f.deposit} onChange={set('deposit')} aria-label="보증금(만원)" /></label>
      <label>월세(만원)<input inputMode="numeric" value={f.rent} onChange={set('rent')} aria-label="월세(만원)" /></label>
      <label>관리비(만원)<input inputMode="numeric" value={f.mgmt} onChange={set('mgmt')} aria-label="관리비(만원)" placeholder="모르면 비워 두세요" /></label>
      <label>면적(㎡)<input inputMode="decimal" value={f.area} onChange={set('area')} aria-label="면적(㎡)" /></label>
      <label>계약 시작<input type="date" value={f.start} onChange={set('start')} aria-label="계약 시작" /></label>
      <label>계약 끝<input type="date" value={f.end} onChange={set('end')} aria-label="계약 끝" /></label>
      {save.isError && <p className="ui-modal-error" role="alert">저장하지 못했어요</p>}
      <button type="button" className="ui-primary" disabled={!valid || save.isPending} onClick={submit}>등록</button>
    </div>
  );
}

export function ReportCard({ month }: { month: string }) {
  const q = useReport(month, true);
  if (q.isLoading) return <p className="ui-card-sub">리포트를 만드는 중…</p>;
  if (q.isError || !q.data) return <p className="ui-card-sub">리포트를 불러오지 못했어요.</p>;
  const r = q.data;
  return (
    <section className="ui-verdict" aria-label="월간 리포트">
      <p className="ui-verdict-text">이번 달 {manwon(r.total)}</p>
      {r.prevTotal != null && r.diff != null && <p className="ui-card-sub">지난달보다 {manwon(Math.abs(r.diff))} {r.diff >= 0 ? '↑' : '↓'}</p>}
      {r.topIncrease && r.topIncrease.diff > 0 && <p className="ui-card-sub">{ITEM_LABEL[r.topIncrease.item] ?? r.topIncrease.item} {manwon(r.topIncrease.diff)} ↑</p>}
      <dl className="ui-kv">
        {(Object.entries(r.breakdown) as [string, number | null][]).map(([k, v]) => (<Fragment key={k}><dt>{ITEM_LABEL[k] ?? k}</dt><dd>{v == null ? '기록 없음' : manwon(v)}</dd></Fragment>))}
      </dl>
      {r.excess
        ? <p className="ui-over" style={{ color: GRADE_META[r.excess.grade].color }}>지금까지 적정가보다 {manwon(r.excess.cumulative)} 원 더 냈어요 (이번 달 {manwon(r.excess.monthly)})</p>
        : <p className="ui-card-sub">적정가 대비 초과액은 판정 보류예요.</p>}
    </section>
  );
}

function Monthly({ month }: { month: string }) {
  const pay = useSavePayment(), util = useSaveUtility();
  const [amount, setAmount] = useState('');
  const [u, setU] = useState({ electricity: '', gas: '', water: '', internet: '' });
  return (
    <section>
      <h4>{month} 기록</h4>
      <div className="ui-form">
        <label>월세 낸 금액(만원)<input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="낸 월세(만원)" /></label>
        <button type="button" className="ui-mini" disabled={manToWon(amount) == null || pay.isPending} onClick={() => pay.mutate({ month, amount: manToWon(amount)!, paidAt: new Date().toISOString().slice(0, 10) })}>월세 기록</button>
        {(['electricity', 'gas', 'water', 'internet'] as const).map((k) => (
          <label key={k}>{ITEM_LABEL[k]}(만원)<input inputMode="decimal" value={u[k]} onChange={(e) => setU({ ...u, [k]: e.target.value })} aria-label={`${ITEM_LABEL[k]}(만원)`} placeholder="모르면 비워 두세요" /></label>
        ))}
        <button type="button" className="ui-mini" disabled={util.isPending} onClick={() => util.mutate({ month, electricity: manToWon(u.electricity), gas: manToWon(u.gas), water: manToWon(u.water), internet: manToWon(u.internet) })}>공과금 기록</button>
        {(pay.isError || util.isError) && <p className="ui-modal-error" role="alert">저장하지 못했어요</p>}
        {(pay.isSuccess || util.isSuccess) && <p className="ui-card-sub">저장했어요</p>}
      </div>
    </section>
  );
}

function Alerts() {
  const q = useAlerts();
  const { add, toggle, remove } = useAlertActions();
  const [days, setDays] = useState('60');
  const n = Number(days);
  return (
    <section>
      <h4>계약 만료 알림</h4>
      <ul className="ui-rows">
        {q.data?.map((a) => (
          <li key={a.id}><span>만료 {a.daysBefore}일 전{a.enabled ? '' : ' (꺼짐)'}</span>
            <span className="ui-inline"><button type="button" className="ui-mini" onClick={() => toggle.mutate(a)}>{a.enabled ? '끄기' : '켜기'}</button><button type="button" className="ui-mini" onClick={() => remove.mutate(a.id)}>삭제</button></span></li>
        ))}
        {q.isError && <li className="ui-card-sub">알림 설정을 불러오지 못했어요.</li>}
      </ul>
      <div className="ui-inline"><input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} aria-label="알림 일수" className="ui-narrow" /> 일 전
        <button type="button" className="ui-mini" disabled={!validDaysBefore(n) || add.isPending} onClick={() => add.mutate(n)}>추가</button></div>
      {!validDaysBefore(n) && <p className="ui-modal-error">1~365일 사이로 넣어 주세요</p>}
    </section>
  );
}

export function MyHomePanel() {
  const token = useSession((s) => s.token);
  const openLogin = useSession((s) => s.openLogin);
  const home = useMyHome();
  const [editing, setEditing] = useState(false);
  const month = thisMonth();
  if (!token) return <div><p className="empty">로그인하면 내 집의 월세와 공과금을 기록할 수 있어요.</p><button type="button" className="ui-primary" onClick={openLogin}>로그인</button></div>;
  if (home.isLoading) return <p className="empty">불러오는 중…</p>;
  if (home.isError) return <p className="empty">내 집 정보를 불러오지 못했어요.</p>;
  if (home.data === null || editing) return <HomeForm onDone={() => setEditing(false)} />;
  const h = home.data!;
  return (
    <div className="ui-detail">
      <h3>{h.address}</h3>
      <p className="ui-card-sub">보증금 {manwon(h.deposit)} / 월세 {manwon(h.rent)} / 관리비 {h.mgmtFee == null ? '정보 없음' : manwon(h.mgmtFee)} · 계약 {h.contractStart} ~ {h.contractEnd}</p>
      <button type="button" className="ui-back" onClick={() => setEditing(true)}>수정</button>
      <ReportCard month={month} />
      <Monthly month={month} />
      <Alerts />
    </div>
  );
}
