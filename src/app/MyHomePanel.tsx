import { Fragment, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { manwon } from '../lib/money';
import { GRADE_META } from '../lib/grade';
import type { AddressResult, MyHome } from '../api/types';
import { AddressPicker } from './AddressPicker';
import { ITEM_LABEL, manToWon, thisMonth, useAlertActions, useAlerts, useMyHome, useReport, useSaveHome, useSavePayment, useSaveUtility, validDaysBefore } from './features/more';
import { useSession } from './state/session';
import { ChipSelect } from './forms/Segmented';
import { Field, UnitInput } from './forms/Field';
import { FormSection, LiveSummary, StickyActions } from './forms/FormSection';
import { convertedRentWon, isPositive, missingReason, wonToManText } from './forms/calc';
import './forms/forms.css';

function HomeForm({ onDone }: { onDone: () => void }) {
  const save = useSaveHome();
  const [addr, setAddr] = useState<AddressResult | null>(null);
  const [f, setF] = useState({ deposit: '', rent: '', mgmt: '', area: '', start: '', end: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const put = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const touch = (k: string) => () => setTouched((o) => ({ ...o, [k]: true }));
  const deposit = manToWon(f.deposit), rent = manToWon(f.rent);
  const checks = { addr: !!addr, deposit: deposit != null, rent: rent != null, area: isPositive(f.area), start: !!f.start, end: !!f.end && (!f.start || f.start <= f.end) };
  const valid = Object.values(checks).every(Boolean);
  const reason = missingReason([
    { label: '주소', ok: checks.addr }, { label: '보증금', ok: checks.deposit }, { label: '월세', ok: checks.rent },
    { label: '면적', ok: checks.area }, { label: '계약 시작', ok: checks.start }, { label: '계약 끝', ok: !!f.end },
  ]) ?? (checks.end ? null : '계약 끝이 시작보다 빠를 수 없어요');
  const live = convertedRentWon(deposit, rent, manToWon(f.mgmt));
  const submit = () => {
    if (!valid) return;
    const body: MyHome = { address: addr!.roadAddress ?? addr!.address, dong: addr!.dong, lat: addr!.lat, lng: addr!.lng, deposit: deposit!, rent: rent!, mgmtFee: manToWon(f.mgmt), areaM2: Number(f.area), contractStart: f.start, contractEnd: f.end };
    save.mutate(body, { onSuccess: onDone });
  };
  return (
    <div className="ui-form2">
      <p className="ui-form2-intro"><b>내 사건 기록</b><br />지금 사는 집을 등록하면 월 주거비와 적정가 대비 초과액을 보여줘요.</p>
      <FormSection title="1. 위치"><AddressPicker value={addr} onPick={setAddr} /></FormSection>
      <FormSection title="2. 금액" grid>
        <UnitInput label="보증금" unit="만원" value={f.deposit} onChange={put('deposit')} ariaLabel="보증금(만원)" onBlur={touch('deposit')} error={touched.deposit && !checks.deposit ? '숫자로 적어 주세요' : null} />
        <UnitInput label="월세" unit="만원" value={f.rent} onChange={put('rent')} ariaLabel="월세(만원)" onBlur={touch('rent')} error={touched.rent && !checks.rent ? '숫자로 적어 주세요' : null} />
        <UnitInput label="관리비" unit="만원" value={f.mgmt} onChange={put('mgmt')} ariaLabel="관리비(만원)" placeholder="선택" hint="모르면 비워 두세요" />
        <UnitInput label="면적" unit="㎡" inputMode="decimal" value={f.area} onChange={put('area')} ariaLabel="면적(㎡)" onBlur={touch('area')} error={touched.area && !checks.area ? '0보다 큰 숫자' : null} />
        <div className="span2"><LiveSummary title="환산 월세" value={live == null ? null : wonToManText(live)} note={live == null ? '보증금과 월세를 넣으면 바로 계산해요' : '월세 + 관리비 + 보증금 × 6% ÷ 12'} /></div>
      </FormSection>
      <FormSection title="3. 계약 기간" grid>
        <Field label="계약 시작">{(id) => <input id={id} type="date" value={f.start} onChange={(e) => put('start')(e.target.value)} aria-label="계약 시작" />}</Field>
        <Field label="계약 끝" error={f.start && f.end && f.start > f.end ? '시작보다 빠를 수 없어요' : null}>{(id) => <input id={id} type="date" value={f.end} min={f.start || undefined} onChange={(e) => put('end')(e.target.value)} aria-label="계약 끝" />}</Field>
      </FormSection>
      {save.isError && <p className="ui-field-error" role="alert">저장하지 못했어요</p>}
      <StickyActions reason={reason}>
        <button type="button" className="ui-primary" disabled={!valid || save.isPending} onClick={submit}>등록</button>
      </StickyActions>
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
      {r.prevTotal != null && r.diff != null && <p className="ui-card-sub">지난달보다 {manwon(Math.abs(r.diff))} {r.diff >= 0 ? <TrendingUp size={13} aria-label="올랐어요" /> : <TrendingDown size={13} aria-label="내렸어요" />}</p>}
      {r.topIncrease && r.topIncrease.diff > 0 && <p className="ui-card-sub">{ITEM_LABEL[r.topIncrease.item] ?? r.topIncrease.item} {manwon(r.topIncrease.diff)} <TrendingUp size={13} aria-label="올랐어요" /></p>}
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
    <div className="ui-form2" style={{ marginTop: 16 }}>
      <FormSection title={`${month} 월세 기록`}>
        <div className="ui-fgrid">
          <UnitInput label="월세 낸 금액" unit="만원" value={amount} onChange={setAmount} ariaLabel="낸 월세(만원)" />
          <button type="button" className="ui-mini ui-form2-btn" disabled={manToWon(amount) == null || pay.isPending} onClick={() => pay.mutate({ month, amount: manToWon(amount)!, paidAt: new Date().toISOString().slice(0, 10) })}>월세 기록</button>
        </div>
      </FormSection>
      <FormSection title={`${month} 공과금`} hint="모르는 항목은 비워 두세요" grid>
        {(['electricity', 'gas', 'water', 'internet'] as const).map((k) => (
          <UnitInput key={k} label={ITEM_LABEL[k]} unit="만원" inputMode="decimal" value={u[k]} onChange={(v) => setU({ ...u, [k]: v })} ariaLabel={`${ITEM_LABEL[k]}(만원)`} />
        ))}
        <button type="button" className="ui-mini ui-form2-btn span2" disabled={util.isPending} onClick={() => util.mutate({ month, electricity: manToWon(u.electricity), gas: manToWon(u.gas), water: manToWon(u.water), internet: manToWon(u.internet) })}>공과금 기록</button>
      </FormSection>
      {(pay.isError || util.isError) && <p className="ui-field-error" role="alert">저장하지 못했어요</p>}
      {(pay.isSuccess || util.isSuccess) && <p className="ui-field-hint">저장했어요</p>}
    </div>
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
      <div className="ui-alert-add">
        <ChipSelect label="알림 일수 빠른 선택" options={[30, 60, 90]} suffix="일 전" value={days} onPick={setDays} />
        <div className="ui-fgrid">
          <UnitInput label="직접 입력" unit="일 전" value={days} onChange={setDays} ariaLabel="알림 일수" error={validDaysBefore(n) ? null : '1~365일 사이로 넣어 주세요'} />
          <button type="button" className="ui-mini ui-form2-btn" disabled={!validDaysBefore(n) || add.isPending} onClick={() => add.mutate(n)}>추가</button>
        </div>
      </div>
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
