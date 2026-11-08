import { Fragment, useState } from 'react';
import { BellRing, Check, Pencil, TrendingDown, TrendingUp, X } from 'lucide-react';
import { manwon } from '../lib/money';
import { GRADE_META } from '../lib/grade';
import type { AddressResult, Grade, MyHome } from '../api/types';
import { AddressPicker } from './AddressPicker';
import { ITEM_LABEL, manToWon, thisMonth, useAlertActions, useAlerts, useMyHome, usePayments, useReport, useSaveHome, useSavePayment, useSaveUtility, useUtilities, validDaysBefore } from './features/more';
import { useSession } from './state/session';
import { UnitInput } from './forms/Field';
import { DateField, MonthStepper } from './forms/DateField';
import { addDays, addMonths, daysBetween, formatYm, formatYmd, parseYmd, todayYmd } from './forms/dates';
import { FormSection, LiveSummary, StickyActions } from './forms/FormSection';
import { CONVERSION_NOTE, convertedRentWon, isPositive, missingReason, wonToManText } from './forms/calc';
import './forms/forms.css';

/** 원 → 만원 입력칸 문자열 (없으면 빈칸) */
const toMan = (won: number | null | undefined) => (won == null ? '' : String(Math.round(won / 1000) / 10));

/** 내 집 등록·수정. 수정이면 지금 값이 채워진 채로 열린다 (예전엔 빈 폼이라 처음부터 다시 적어야 했다) */
function HomeForm({ initial, onDone, onCancel }: { initial?: MyHome | null; onDone: () => void; onCancel?: () => void }) {
  const save = useSaveHome();
  const [addr, setAddr] = useState<AddressResult | null>(initial ? { address: initial.address, roadAddress: null, dong: initial.dong, lat: initial.lat, lng: initial.lng } : null);
  const [f, setF] = useState(initial
    ? { deposit: toMan(initial.deposit), rent: toMan(initial.rent), mgmt: toMan(initial.mgmtFee), area: String(initial.areaM2), start: initial.contractStart, end: initial.contractEnd }
    : { deposit: '', rent: '', mgmt: '', area: '', start: '', end: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const put = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const touch = (k: string) => () => setTouched((o) => ({ ...o, [k]: true }));
  const deposit = manToWon(f.deposit), rent = manToWon(f.rent);
  const checks = { addr: !!addr, deposit: deposit != null, rent: rent != null, area: isPositive(f.area), start: !!f.start, end: !!f.end && (!f.start || f.start < f.end) };
  const valid = Object.values(checks).every(Boolean);
  const reason = missingReason([
    { label: '주소', ok: checks.addr }, { label: '보증금', ok: checks.deposit }, { label: '월세', ok: checks.rent },
    { label: '면적', ok: checks.area }, { label: '계약 시작', ok: checks.start }, { label: '계약 끝', ok: !!f.end },
  ]) ?? (checks.end ? null : '계약 끝은 시작보다 뒤여야 해요');
  const live = convertedRentWon(deposit, rent, manToWon(f.mgmt));
  const months = f.start && f.end && f.start < f.end ? Math.round(daysBetween(f.start, f.end) / 30.44) : null;
  const submit = () => {
    if (!valid) return;
    const body: MyHome = { address: addr!.roadAddress ?? addr!.address, dong: addr!.dong, lat: addr!.lat, lng: addr!.lng, deposit: deposit!, rent: rent!, mgmtFee: manToWon(f.mgmt), areaM2: Number(f.area), contractStart: f.start, contractEnd: f.end };
    save.mutate(body, { onSuccess: onDone });
  };
  // 계약 끝 빠른 선택: 시작일 기준 1년·2년 (하루 전날까지가 보통이지만 계약서 날짜를 그대로 쓰는 경우가 많아 같은 날로)
  const endQuick = f.start ? [{ label: '1년 계약', value: addMonths(f.start, 12) }, { label: '2년 계약', value: addMonths(f.start, 24) }] : undefined;
  return (
    <div className="ui-form2">
      {!initial && <p className="ui-form2-intro"><b>내 사건 기록</b><br />지금 사는 집을 등록하면 월 주거비와 적정가 대비 초과액을 보여줘요.</p>}
      {initial && <h3 className="ui-home-formtitle">내 집 정보 고치기</h3>}
      <FormSection title="위치"><AddressPicker value={addr} onPick={setAddr} /></FormSection>
      <FormSection title="금액" grid>
        <UnitInput label="보증금" unit="만원" value={f.deposit} onChange={put('deposit')} ariaLabel="보증금(만원)" onBlur={touch('deposit')} error={touched.deposit && !checks.deposit ? '숫자로 적어 주세요' : null} />
        <UnitInput label="월세" unit="만원" value={f.rent} onChange={put('rent')} ariaLabel="월세(만원)" onBlur={touch('rent')} error={touched.rent && !checks.rent ? '숫자로 적어 주세요' : null} />
        <UnitInput label="관리비" unit="만원" value={f.mgmt} onChange={put('mgmt')} ariaLabel="관리비(만원)" placeholder="선택" hint="모르면 비워 두세요" />
        <UnitInput label="면적" unit="㎡" inputMode="decimal" value={f.area} onChange={put('area')} ariaLabel="면적(㎡)" onBlur={touch('area')} error={touched.area && !checks.area ? '0보다 큰 숫자' : null} hint="평 × 3.3" />
        <div className="span2"><LiveSummary title="환산 월세" value={live == null ? null : wonToManText(live)} note={live == null ? '보증금과 월세를 넣으면 바로 계산해요' : CONVERSION_NOTE} /></div>
      </FormSection>
      <FormSection title="계약 기간" hint={months ? `${months}개월 계약` : undefined} grid>
        <DateField label="계약 시작" value={f.start} onChange={(v) => setF((o) => ({ ...o, start: v, end: o.end || (v ? addMonths(v, 24) : '') }))} quick={[{ label: '오늘', value: todayYmd() }]} />
        <DateField label="계약 끝" value={f.end} onChange={put('end')} min={f.start ? addDays(f.start, 1) : undefined} quick={endQuick}
          error={f.start && f.end && f.start >= f.end ? '시작보다 뒤여야 해요' : null} hint={!f.end && f.start ? '시작일을 고르면 2년 계약으로 채워져요' : undefined} />
      </FormSection>
      {save.isError && <p className="ui-field-error" role="alert">저장하지 못했어요</p>}
      <StickyActions reason={reason}>
        <div className="ui-sticky-row">
          {onCancel && <button type="button" className="ui-secondary" onClick={onCancel}>취소</button>}
          <button type="button" className="ui-primary" disabled={!valid || save.isPending} onClick={submit}>{initial ? '저장' : '등록'}</button>
        </div>
      </StickyActions>
    </div>
  );
}

/** 적정가 대비 누적 금액. 서버 값은 (환산 월세 − 적정가) 라 싼 집이면 음수 → '덜 냈어요', 1만 원 안쪽이면 '거의 같아요' */
export function excessPhrase(e: { monthly: number; cumulative: number }): string {
  if (Math.abs(e.cumulative) < 10_000) return Math.abs(e.monthly) < 10_000 ? '적정가와 거의 같게 내고 있어요' : `이번 달 적정가보다 ${manwon(Math.abs(e.monthly))} ${e.monthly > 0 ? '더' : '덜'} 냈어요`;
  return `지금까지 적정가보다 ${manwon(Math.abs(e.cumulative))} 원 ${e.cumulative > 0 ? '더' : '덜'} 냈어요 (한 달에 ${manwon(Math.abs(e.monthly))})`;
}
function ExcessLine({ excess }: { excess: { monthly: number; cumulative: number; grade: Grade } }) {
  const over = excess.cumulative >= 10_000 || (Math.abs(excess.cumulative) < 10_000 && excess.monthly >= 10_000);
  return <p className={over ? 'ui-over' : 'ui-card-sub'} style={over ? { color: GRADE_META[excess.grade].color } : undefined}>{excessPhrase(excess)}</p>;
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
        ? <ExcessLine excess={r.excess} />
        : <p className="ui-card-sub">적정가 대비 초과액은 판정 보류예요.</p>}
    </section>
  );
}

const UTIL_KEYS = ['electricity', 'gas', 'water', 'internet'] as const;

/**
 * 그 달의 기록 한 곳: 월세는 계약 월세 그대로면 버튼 한 번, 다르면 금액을 적는다.
 * 공과금은 이미 적은 값이 채워져 있고(서버는 달마다 통째로 덮어쓰므로 빈칸으로 저장하면 지워진다), 바뀐 게 있을 때만 저장 버튼이 켜진다.
 */
function MonthRecord({ month, home }: { month: string; home: MyHome }) {
  const pays = usePayments(), utils = useUtilities();
  if (pays.isLoading || utils.isLoading) return <p className="ui-card-sub">기록을 불러오는 중…</p>;
  const p = pays.data?.find((x) => x.month === month) ?? null;
  const u = utils.data?.find((x) => x.month === month) ?? null;
  return (
    <section className="ui-home-rec" aria-label={`${formatYm(month)} 기록`}>
      <h4 className="ui-home-h">{formatYm(month)} 기록</h4>
      <RentRow key={`r-${month}-${p?.amount ?? 'x'}`} month={month} home={home} paid={p} />
      <UtilityRows key={`u-${month}-${u ? UTIL_KEYS.map((k) => u[k]).join(',') : 'x'}`} month={month} saved={u} />
    </section>
  );
}

function RentRow({ month, home, paid }: { month: string; home: MyHome; paid: { amount: number; paidAt: string } | null }) {
  const pay = useSavePayment();
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState(paid ? toMan(paid.amount) : toMan(home.rent));
  const paidAt = month === thisMonth() ? todayYmd() : `${month}-${String(Math.min(28, +home.contractStart.slice(8) || 1)).padStart(2, '0')}`; // 지난달 기록이면 그 달 계약일(없으면 1일)
  const save = (won: number) => pay.mutate({ month, amount: won, paidAt }, { onSuccess: () => setCustom(false) });
  const won = manToWon(amount);
  if (paid && !custom) {
    const d = parseYmd(paid.paidAt);
    return (
      <div className="ui-home-row is-done">
        <Check size={16} aria-hidden="true" />
        <span className="ui-home-row-main">월세 <b>{manwon(paid.amount)}</b> 냈어요{d ? <small> · {d.m}월 {d.d}일 기록</small> : null}</span>
        <button type="button" className="ui-textlink" onClick={() => setCustom(true)}>바꾸기</button>
      </div>
    );
  }
  return (
    <div className="ui-home-pay">
      {!custom ? (
        <>
          <button type="button" className="ui-primary ui-home-paybtn" disabled={pay.isPending} onClick={() => save(home.rent)}>월세 {manwon(home.rent)} 냈어요</button>
          <button type="button" className="ui-textlink" onClick={() => setCustom(true)}>다른 금액이에요</button>
        </>
      ) : (
        <div className="ui-home-payedit">
          <UnitInput label="낸 월세" unit="만원" value={amount} onChange={setAmount} ariaLabel="낸 월세(만원)" />
          <div className="ui-home-payedit-btns">
            <button type="button" className="ui-secondary" onClick={() => setCustom(false)}>취소</button>
            <button type="button" className="ui-primary" disabled={won == null || pay.isPending} onClick={() => won != null && save(won)}>월세 기록</button>
          </div>
        </div>
      )}
      {pay.isError && <p className="ui-field-error" role="alert">월세를 저장하지 못했어요</p>}
    </div>
  );
}

function UtilityRows({ month, saved }: { month: string; saved: { electricity: number | null; gas: number | null; water: number | null; internet: number | null } | null }) {
  const util = useSaveUtility();
  const init = Object.fromEntries(UTIL_KEYS.map((k) => [k, toMan(saved?.[k])])) as Record<(typeof UTIL_KEYS)[number], string>;
  const [u, setU] = useState(init);
  const dirty = UTIL_KEYS.some((k) => u[k] !== init[k]);
  const sum = UTIL_KEYS.reduce((a, k) => a + (manToWon(u[k]) ?? 0), 0);
  return (
    <div className="ui-home-util">
      <div className="ui-home-util-head"><span>공과금</span><small>{sum ? `합계 ${manwon(sum)}` : '모르는 항목은 비워 두세요'}</small></div>
      <div className="ui-fgrid ui-home-util-grid">
        {UTIL_KEYS.map((k) => (
          <UnitInput key={k} label={ITEM_LABEL[k]} unit="만원" inputMode="decimal" value={u[k]} onChange={(v) => setU((o) => ({ ...o, [k]: v }))} ariaLabel={`${ITEM_LABEL[k]}(만원)`} placeholder="-" />
        ))}
      </div>
      <button type="button" className={`ui-home-utilsave${!dirty && saved ? ' is-saved' : ''}`} disabled={!dirty || util.isPending}
        onClick={() => util.mutate({ month, electricity: manToWon(u.electricity), gas: manToWon(u.gas), water: manToWon(u.water), internet: manToWon(u.internet) })}>
        {util.isPending ? '저장하는 중…' : dirty ? '공과금 기록' : saved ? <><Check size={14} aria-hidden="true" /> 저장돼 있어요</> : '공과금 기록'}
      </button>
      {util.isError && <p className="ui-field-error" role="alert">공과금을 저장하지 못했어요</p>}
    </div>
  );
}

/** H2·H3: 지금까지 남긴 월세·공과금 기록 (최신 달부터). 줄을 누르면 그 달로 */
function History({ month, onPick }: { month: string; onPick: (month: string) => void }) {
  const pay = usePayments().data ?? [];
  const util = useUtilities().data ?? [];
  const months = [...new Set([...pay.map((p) => p.month), ...util.map((u) => u.month)])].sort().reverse().slice(0, 12);
  if (months.length === 0) return null;
  return (
    <section aria-label="지난 기록">
      <h4 className="ui-home-h">지난 기록</h4>
      <ul className="ui-home-hist">
        {months.map((m) => {
          const p = pay.find((x) => x.month === m), u = util.find((x) => x.month === m);
          const utilSum = u && UTIL_KEYS.some((k) => u[k] != null) ? UTIL_KEYS.reduce<number>((a, k) => a + (u[k] ?? 0), 0) : null; // 전부 비어 있으면 0만이 아니라 '기록 없음'
          return (
            <li key={m}>
              <button type="button" className={m === month ? 'is-on' : ''} aria-current={m === month ? 'true' : undefined} onClick={() => onPick(m)}>
                <span className="ui-home-hist-m">{formatYm(m)}</span>
                <span>월세 {p ? manwon(p.amount) : '기록 없음'} · 공과금 {utilSum == null ? '기록 없음' : manwon(utilSum)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ALERT_PRESETS = [30, 60, 90];

/** 계약 만료 알림: 30·60·90일은 칩을 눌러 바로 켜고 끈다. 그 밖의 날은 '다른 날로' 에서 */
function Alerts({ contractEnd }: { contractEnd: string }) {
  const q = useAlerts();
  const { add, toggle, remove } = useAlertActions();
  const [customOpen, setCustomOpen] = useState(false);
  const [days, setDays] = useState('');
  const n = Number(days);
  const list = q.data ?? [];
  const busy = add.isPending || remove.isPending || toggle.isPending;
  const when = (d: number) => { const s = addDays(contractEnd, -d); return s < todayYmd() ? '이미 지난 날' : formatYmd(s); };
  const flip = (d: number) => {
    const a = list.find((x) => x.daysBefore === d);
    if (!a) add.mutate(d);
    else if (!a.enabled) toggle.mutate(a);
    else remove.mutate(a.id);
  };
  const others = list.filter((a) => !ALERT_PRESETS.includes(a.daysBefore));
  return (
    <section aria-label="계약 만료 알림">
      <h4 className="ui-home-h"><BellRing size={15} aria-hidden="true" /> 계약 만료 알림</h4>
      <p className="ui-card-sub">계약 끝({formatYmd(contractEnd)}) 며칠 전에 알려 드릴까요? 눌러서 켜고 꺼요.</p>
      <div className="ui-home-alerts" role="group" aria-label="알림 빠른 선택">
        {ALERT_PRESETS.map((d) => {
          const a = list.find((x) => x.daysBefore === d), on = !!a?.enabled;
          return (
            <button key={d} type="button" className={on ? 'on' : ''} aria-pressed={on} disabled={busy} onClick={() => flip(d)} title={`${when(d)}에 알림`}>
              {on && <Check size={13} aria-hidden="true" />}{d}일 전
            </button>
          );
        })}
        {!customOpen && <button type="button" className="ui-home-alerts-more" onClick={() => setCustomOpen(true)}>다른 날로</button>}
      </div>
      {others.length > 0 && (
        <ul className="ui-rows">
          {others.map((a) => (
            <li key={a.id}><span>만료 {a.daysBefore}일 전 <small className="ui-card-sub">· {when(a.daysBefore)}</small>{a.enabled ? '' : ' (꺼짐)'}</span>
              <span className="ui-inline">
                <button type="button" className="ui-mini" onClick={() => toggle.mutate(a)}>{a.enabled ? '끄기' : '켜기'}</button>
                <button type="button" className="ui-mini" aria-label={`${a.daysBefore}일 전 알림 삭제`} onClick={() => remove.mutate(a.id)}><X size={13} aria-hidden="true" /></button>
              </span></li>
          ))}
        </ul>
      )}
      {customOpen && (
        <div className="ui-home-alert-add">
          <UnitInput label="직접 입력" unit="일 전" value={days} onChange={setDays} ariaLabel="알림 일수" placeholder="예: 45"
            error={days && !validDaysBefore(n) ? '1~365일 사이로 넣어 주세요' : null} hint={validDaysBefore(n) ? `${when(n)}에 알려 드려요` : undefined} />
          <div className="ui-home-payedit-btns">
            <button type="button" className="ui-secondary" onClick={() => { setCustomOpen(false); setDays(''); }}>취소</button>
            <button type="button" className="ui-primary" disabled={!validDaysBefore(n) || add.isPending} onClick={() => add.mutate(n, { onSuccess: () => { setDays(''); setCustomOpen(false); } })}>추가</button>
          </div>
        </div>
      )}
      {q.isError && <p className="ui-card-sub">알림 설정을 불러오지 못했어요.</p>}
    </section>
  );
}

/** 계약 진행 막대: 시작~끝 중 오늘 위치와 만료까지 남은 날 */
function ContractBar({ start, end }: { start: string; end: string }) {
  const today = todayYmd();
  const total = Math.max(1, daysBetween(start, end)), done = Math.min(total, Math.max(0, daysBetween(start, today)));
  const left = daysBetween(today, end);
  return (
    <div className="ui-home-contract">
      <div className="ui-home-contract-top">
        <span>{start.replaceAll('-', '.')} ~ {end.replaceAll('-', '.')}</span>
        <b className={left <= 60 ? 'is-soon' : ''}>{left > 0 ? `만료까지 ${left}일` : left === 0 ? '오늘 만료' : '계약 끝남'}</b>
      </div>
      <div className="ui-home-contract-bar" role="progressbar" aria-label="계약 기간 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((done / total) * 100)}>
        <span style={{ width: `${(done / total) * 100}%` }} />
      </div>
    </div>
  );
}

export function MyHomePanel() {
  const token = useSession((s) => s.token);
  const openLogin = useSession((s) => s.openLogin);
  const home = useMyHome();
  const [editing, setEditing] = useState(false);
  const [month, setMonth] = useState(thisMonth());
  if (!token) return <div><p className="empty">로그인하면 내 집의 월세와 공과금을 기록할 수 있어요.</p><button type="button" className="ui-primary" onClick={openLogin}>로그인</button></div>;
  if (home.isLoading) return <p className="empty">불러오는 중…</p>;
  if (home.isError) return <p className="empty">내 집 정보를 불러오지 못했어요.</p>;
  if (home.data === null) return <HomeForm onDone={() => setEditing(false)} />;
  const h = home.data!;
  if (editing) return <HomeForm initial={h} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />;
  return (
    <div className="ui-detail ui-home">
      <section className="ui-home-card" aria-label="내 집">
        <div className="ui-home-card-head">
          <h3>{h.address}</h3>
          <button type="button" className="ui-textlink" onClick={() => setEditing(true)}><Pencil size={13} aria-hidden="true" /> 수정</button>
        </div>
        <ul className="ui-home-facts">
          <li><small>보증금</small><b>{manwon(h.deposit)}</b></li>
          <li><small>월세</small><b>{manwon(h.rent)}</b></li>
          <li><small>관리비</small><b>{h.mgmtFee == null ? '정보 없음' : manwon(h.mgmtFee)}</b></li>
        </ul>
        <ContractBar start={h.contractStart} end={h.contractEnd} />
      </section>
      <MonthStepper label="기록·리포트 달" value={month} onChange={setMonth} max={thisMonth()} />
      <ReportCard month={month} />
      <MonthRecord month={month} home={h} />
      <History month={month} onPick={setMonth} />
      <Alerts contractEnd={h.contractEnd} />
    </div>
  );
}
