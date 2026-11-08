import { BackButton } from './icons';
import { useEffect, useRef, useState } from 'react';
import { GRADE_META, inkFor } from '../lib/grade';
import { depositRent, manwon } from '../lib/money';
import type { AddressResult, RoomType, TransferBody, TransferDetail } from '../api/types';
import { manToWon, uploadPhoto, useTransfer, useTransferActions, useTransfers } from './features/more';
import { useSession } from './state/session';
import { VerdictCard } from './VerdictCard';
import { AddressPicker } from './AddressPicker';
import { HeartButton } from './HeartButton';
import { DossierCard } from './dossier/DossierCard';
import { useDetailSel } from './state/detail';
import { ChipSelect, Segmented } from './forms/Segmented';
import { Field, UnitInput } from './forms/Field';
import { FormSection, LiveSummary, StickyActions } from './forms/FormSection';
import { PhotoGrid } from './forms/PhotoGrid';
import { DateField } from './forms/DateField';
import { addMonths, todayYmd } from './forms/dates';
import { CONVERSION_NOTE, convertedRentWon, isPositive, isPositiveInt, missingReason, wonToManText } from './forms/calc';
import './forms/forms.css';
import { useGoTo } from './DormPanel';
import { WalkLink } from './route/RouteHud';

const ROOMS: [RoomType, string][] = [['OPEN', '오픈형'], ['SEPARATED', '분리형'], ['ONE_HALF', '1.5룸'], ['TWO_ROOM', '투룸'], ['DUPLEX', '복층']];

const MONTH_CHIPS = [3, 6, 9, 12];
const TITLE_MAX = 40;
const DRAFT_KEY = 'chatatda.transferDraft';

const man = (won: number | null) => (won == null ? '' : String(won / 10000));

type Draft = { addr: AddressResult | null; f: Record<string, string>; room: RoomType; photos: string[]; titleEdited: boolean };
const loadDraft = (): Draft | null => { try { const v = localStorage.getItem(DRAFT_KEY); return v ? JSON.parse(v) as Draft : null; } catch { return null; } };
const saveDraft = (d: Draft | null) => { try { if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY); } catch { /* 저장소를 못 쓰는 창 */ } };

/** 제목 자동 만들기: '행당동 분리형 8개월 양도' (동·방 구조·남은 개월 중 있는 것만) */
export function autoTitle(dong: string | undefined, roomLabel: string, months: string): string {
  return [dong || '', roomLabel, /^\d+$/.test(months) && +months > 0 ? `${months}개월` : '', '양도'].filter(Boolean).join(' ');
}

/**
 * K2 글쓰기 · K5 수정(initial 이 있으면 PUT).
 * 위치 → 금액 → 방 → 계약 → 사진·설명 → 제목 순. 제목은 앞에서 고른 값으로 자동으로 채워지고, 직접 고치면 그때부터는 손대지 않는다.
 * 새 글은 쓰는 중인 내용을 이 브라우저에 임시 저장해 두었다가 다시 열면 이어서 쓴다.
 */
function Form({ onDone, initial }: { onDone: () => void; initial?: TransferDetail }) {
  const { create, update } = useTransferActions();
  const save = initial ? update : create;
  const [draft] = useState(() => (initial ? null : loadDraft()));
  const [addr, setAddr] = useState<AddressResult | null>(initial ? { address: initial.address, roadAddress: null, dong: initial.dong, lat: initial.lat, lng: initial.lng } : draft?.addr ?? null);
  const blank = { title: '', deposit: '', rent: '', mgmt: '', area: '', floor: '', months: '', from: '', desc: '' };
  const [f, setF] = useState(initial
    ? { title: initial.title, deposit: man(initial.deposit), rent: man(initial.rent), mgmt: man(initial.mgmtFee), area: String(initial.areaM2), floor: initial.floor == null ? '' : String(initial.floor), months: String(initial.remainingMonths), from: initial.availableFrom ?? '', desc: initial.description ?? '' }
    : { ...blank, ...(draft?.f ?? {}) });
  const [room, setRoom] = useState<RoomType>(initial?.roomType ?? draft?.room ?? 'OPEN');
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? draft?.photos ?? []);
  const [titleEdited, setTitleEdited] = useState(!!initial || !!draft?.titleEdited);
  const [restored, setRestored] = useState(!!draft);
  const [upErr, setUpErr] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const put = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const touch = (k: string) => () => setTouched((o) => ({ ...o, [k]: true }));
  const roomLabel = ROOMS.find(([v]) => v === room)?.[1] ?? '';
  const suggested = autoTitle(addr?.dong, roomLabel, f.months);
  const titleValue = titleEdited ? f.title : (addr ? suggested : '');
  const deposit = manToWon(f.deposit), rent = manToWon(f.rent), months = Number(f.months);
  const title = titleValue.trim();
  const checks = {
    addr: !!addr, deposit: deposit != null, rent: rent != null, area: isPositive(f.area), months: isPositiveInt(f.months), title: title.length >= 2 && title.length <= TITLE_MAX,
  };
  const valid = Object.values(checks).every(Boolean);
  const order: { key: keyof typeof checks; label: string; sec: string }[] = [
    { key: 'addr', label: '주소', sec: 'where' }, { key: 'deposit', label: '보증금', sec: 'money' }, { key: 'rent', label: '월세', sec: 'money' },
    { key: 'area', label: '면적', sec: 'room' }, { key: 'months', label: '남은 계약', sec: 'contract' }, { key: 'title', label: '제목', sec: 'title' },
  ];
  const reason = missingReason(order.map((o) => ({ label: o.label, ok: checks[o.key] })));
  const err = (k: 'title' | 'deposit' | 'rent' | 'area' | 'months', msg: string) => (touched[k] && !checks[k] ? msg : null);
  const live = convertedRentWon(deposit, rent, manToWon(f.mgmt));
  const root = useRef<HTMLDivElement>(null);

  // 새 글: 쓰는 중인 내용을 임시 저장 (올리면 지운다)
  useEffect(() => {
    if (initial) return;
    const empty = !addr && !photos.length && Object.values(f).every((v) => v === '');
    saveDraft(empty ? null : { addr, f: { ...f, title: titleEdited ? f.title : '' }, room, photos, titleEdited });
  }, [initial, addr, f, room, photos, titleEdited]);

  /** '~ 입력이 필요해요' 를 누르면 처음으로 빈 칸이 있는 곳으로 */
  const goMissing = () => {
    const miss = order.find((o) => !checks[o.key]);
    if (!miss) return;
    setTouched((t) => ({ ...t, [miss.key]: true }));
    const sec = root.current?.querySelector(`[data-sec="${miss.sec}"]`) as HTMLElement | null;
    sec?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (sec?.querySelector('input, textarea, button') as HTMLElement | null)?.focus({ preventScroll: true });
  };

  const submit = () => {
    if (!valid || !addr) { goMissing(); return; }
    const body: TransferBody = { title, address: addr.roadAddress ?? addr.address, dong: addr.dong, lat: addr.lat, lng: addr.lng, deposit: deposit!, rent: rent!, mgmtFee: manToWon(f.mgmt), areaM2: Number(f.area), roomType: room, floor: f.floor.trim() === '' ? null : Number(f.floor), remainingMonths: months, availableFrom: f.from || null, description: f.desc, photoUrls: photos };
    const ok = () => { if (!initial) saveDraft(null); onDone(); };
    if (initial) update.mutate({ id: initial.id, body }, { onSuccess: ok });
    else create.mutate(body, { onSuccess: ok });
  };
  const upload = async (files: File[]) => {
    setUpErr(false); setUpBusy(true);
    const got: string[] = [];
    try { for (const file of files) got.push(await uploadPhoto(file)); } catch { setUpErr(true); }
    setPhotos((o) => [...o, ...got]); setUpBusy(false);
  };
  const startOver = () => { saveDraft(null); setAddr(null); setF(blank); setRoom('OPEN'); setPhotos([]); setTitleEdited(false); setTouched({}); setRestored(false); };

  return (
    <div className="ui-form2" ref={root}>
      {restored
        ? <p className="ui-form2-intro ui-form2-restored" role="status"><span>쓰던 글을 이어서 써요.</span><button type="button" className="ui-textlink" onClick={startOver}>새로 쓰기</button></p>
        : !initial && <p className="ui-form2-intro"><b>사건 접수 · 양도</b><br />남은 계약을 넘기는 글이에요. 집주인 동의가 필요하고, 거래는 당사자끼리 해요.</p>}

      <div data-sec="where"><FormSection title="1. 위치">
        <AddressPicker value={addr} onPick={setAddr} error={touched.addr && !addr ? '목록에서 주소를 골라 주세요' : null} />
      </FormSection></div>

      <div data-sec="money"><FormSection title="2. 금액" grid>
        <UnitInput label="보증금" unit="만원" value={f.deposit} onChange={put('deposit')} ariaLabel="보증금(만원)" onBlur={touch('deposit')} error={err('deposit', '숫자로 적어 주세요')} />
        <UnitInput label="월세" unit="만원" value={f.rent} onChange={put('rent')} ariaLabel="월세(만원)" onBlur={touch('rent')} error={err('rent', '숫자로 적어 주세요')} />
        <UnitInput label="관리비" unit="만원" value={f.mgmt} onChange={put('mgmt')} ariaLabel="관리비(만원)" placeholder="선택" hint="모르면 비워 두세요" className="span2" />
        <div className="span2"><LiveSummary title="환산 월세" value={live == null ? null : wonToManText(live)} note={live == null ? '보증금과 월세를 넣으면 바로 계산해요' : CONVERSION_NOTE} /></div>
      </FormSection></div>

      <div data-sec="room"><FormSection title="3. 방 정보" grid>
        <div className="span2 ui-field"><span className="ui-field-sublabel">방 구조</span><Segmented label="방 구조" options={ROOMS} value={room} onChange={setRoom} /></div>
        <UnitInput label="면적" unit="㎡" inputMode="decimal" value={f.area} onChange={put('area')} ariaLabel="면적(㎡)" onBlur={touch('area')} error={err('area', '0보다 큰 숫자')} hint="평 × 3.3" />
        <UnitInput label="층" unit="층" value={f.floor} onChange={put('floor')} ariaLabel="층" placeholder="선택" />
      </FormSection></div>

      <div data-sec="contract"><FormSection title="4. 계약" grid>
        <div className="span2 ui-field">
          <span className="ui-field-sublabel">남은 계약</span>
          <div className="ui-months-row">
            <ChipSelect label="남은 계약 빠른 선택" options={MONTH_CHIPS} suffix="개월" value={f.months} onPick={(v) => { put('months')(v); touch('months')(); }} />
            <UnitInput label="직접" unit="개월" value={f.months} onChange={put('months')} ariaLabel="남은 계약(개월)" onBlur={touch('months')} error={err('months', '1 이상의 정수')} className="ui-months-input" />
          </div>
        </div>
        <DateField label="입주 가능일" value={f.from} onChange={put('from')} min={todayYmd()} clearable placeholder="협의 (안 고르면)"
          quick={[{ label: '바로 가능', value: todayYmd() }, { label: '다음 달 1일', value: addMonths(todayYmd(), 1).slice(0, 8) + '01' }, { label: '협의', value: null }]} className="span2" />
      </FormSection></div>

      <div data-sec="photo"><FormSection title="5. 사진 · 설명">
        <PhotoGrid photos={photos} onAdd={upload} onRemove={(i) => setPhotos((o) => o.filter((_, j) => j !== i))} busy={upBusy} error={upErr ? '사진을 올리지 못했어요 (jpg/png, 5MB 이하)' : null} />
        <Field label="설명" hint={`옵션, 방향·소음·집주인 동의 여부 등 · ${f.desc.length}/2000자`}>{(id, d) => <textarea id={id} rows={4} maxLength={2000} value={f.desc} placeholder="예: 남향, 에어컨·냉장고 있어요. 집주인 동의 받았어요" onChange={(e) => put('desc')(e.target.value)} aria-label="설명" aria-describedby={d} />}</Field>
      </FormSection></div>

      <div data-sec="title"><FormSection title="6. 제목">
        <Field label="글 제목" error={err('title', '2자 이상 40자 이하로 적어 주세요')} hint={`${title.length}/${TITLE_MAX}자 · ${titleEdited ? '목록과 3D 말풍선에 이 제목이 보여요' : '앞에서 고른 내용으로 자동으로 만들었어요. 고쳐도 돼요'}`}>
          {(id, d) => <input id={id} value={titleValue} maxLength={TITLE_MAX} placeholder="주소를 고르면 자동으로 채워져요" aria-label="글 제목" aria-invalid={!checks.title && touched.title ? true : undefined} aria-describedby={d}
            onChange={(e) => { setTitleEdited(true); put('title')(e.target.value); }} onBlur={touch('title')} />}
        </Field>
        {titleEdited && addr && title !== suggested && <button type="button" className="ui-link" onClick={() => { setTitleEdited(false); put('title')(''); }}>자동 제목으로 되돌리기 “{suggested}”</button>}
      </FormSection></div>

      {save.isError && <p className="ui-field-error" role="alert">{initial ? '고친 내용을 저장하지 못했어요' : '글을 올리지 못했어요'}</p>}
      <StickyActions reason={reason} onReason={goMissing}>
        <button type="button" className="ui-primary" disabled={!valid || save.isPending || upBusy} onClick={submit}>{upBusy ? '사진 올리는 중…' : save.isPending ? '올리는 중…' : initial ? '고친 내용 저장' : '올리기'}</button>
      </StickyActions>
    </div>
  );
}

function Detail({ id, onBack }: { id: number; onBack: () => void }) {
  const q = useTransfer(id);
  const { finish } = useTransferActions();
  const go = useGoTo();
  const token = useSession((s) => s.token);
  const [editing, setEditing] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  if (q.isLoading) return <p className="empty">불러오는 중…</p>;
  if (editing && q.data) return <div><BackButton onClick={() => setEditing(false)} /><Form initial={q.data} onDone={() => setEditing(false)} /></div>;
  if (!q.data) return <div><BackButton onClick={onBack} /><p className="empty">양도 글을 불러오지 못했어요.</p></div>;
  const t = q.data;
  return (
    <div className="ui-detail">
      <BackButton onClick={onBack} />
      <div className="ui-detail-head"><h3>{t.title}</h3><HeartButton type="TRANSFER" id={t.id} favorited={t.favorited} name={t.title} /></div>
      <p className="ui-card-sub">{t.address} · {t.authorNickname}{t.status === 'DONE' ? ' · 양도 완료' : ''}</p>
      <VerdictCard pc={t.priceCheck} fallbackGrade={t.grade} loggedIn={!!token} />
      <dl className="ui-kv">
        <dt>보증금/월세</dt><dd>{manwon(t.deposit)} / {manwon(t.rent)}</dd>
        <dt>관리비</dt><dd>{t.mgmtFee == null ? '정보 없음' : manwon(t.mgmtFee)}</dd>
        <dt>남은 계약</dt><dd>{t.remainingMonths}개월</dd>
        <dt>입주 가능</dt><dd>{t.availableFrom ?? '협의'}</dd>
        <dt>도보</dt><dd><WalkLink walkMin={t.walkMin} from={{ lat: t.lat, lng: t.lng, name: t.title }} /></dd>
      </dl>
      {t.description && <p className="ui-desc">{t.description}</p>}
      <button type="button" className="ui-primary" onClick={() => go(t)}>3D로 보기</button>
      {t.mine && t.status === 'OPEN' && (
        <div className="ui-inline">
          <button type="button" className="ui-mini" onClick={() => setEditing(true)}>글 고치기</button>
          {/* 되돌릴 수 없어 한 번 더 묻는다 (브라우저 확인 창 대신 버튼 안에서) */}
          {confirmDone
            ? <><button type="button" className="ui-mini is-danger" disabled={finish.isPending} onClick={() => finish.mutate(t.id, { onSettled: () => setConfirmDone(false) })}>{finish.isPending ? '처리 중…' : '네, 양도 완료'}</button><button type="button" className="ui-mini" onClick={() => setConfirmDone(false)}>취소</button></>
            : <button type="button" className="ui-mini" onClick={() => setConfirmDone(true)}>양도 완료</button>}
        </div>
      )}
      {finish.isError && <p className="ui-field-error" role="alert">양도 완료로 바꾸지 못했어요. 잠시 뒤 다시 해 보세요.</p>}
    </div>
  );
}

export function TransferPanel() {
  const q = useTransfers();
  const requireLogin = useSession((s) => s.requireLogin);
  const sel = useDetailSel((s) => s.transfer), setSel = useDetailSel((s) => s.setTransfer);
  const [writing, setWriting] = useState(false);
  if (writing) return <div><BackButton onClick={() => setWriting(false)} /><Form onDone={() => setWriting(false)} /></div>;
  if (sel != null) return <Detail id={sel} onBack={() => setSel(null)} />;
  return (
    <div>
      <button type="button" className="ui-primary" onClick={() => { if (requireLogin()) setWriting(true); }}>양도 글 올리기</button>
      {q.isLoading && <p className="empty">불러오는 중…</p>}
      {q.isError && <p className="empty">양도 글을 불러오지 못했어요.</p>}
      {q.data && q.data.items.length === 0 && <p className="empty">올라온 양도 글이 아직 없어요.</p>}
      <ul className="ui-cards" style={{ marginTop: 10 }}>
        {q.data?.items.map((t) => (
          <li key={t.id} className="ui-heart-host">
            <DossierCard
              grade={t.grade}
              title={t.title}
              rent={manwon(t.convertedRent)}
              deposit={`보증금/월세 ${depositRent(t.deposit, t.rent)}`}
              meta={[`남은 계약 ${t.remainingMonths}개월`, `${t.areaM2}㎡`, t.walkMin == null ? '도보 정보 없음' : `도보 ${t.walkMin}분`]}
              onClick={() => setSel(t.id)} // 정보만 연다. 3D 이동은 상세의 [3D로 보기]로
            />
            <HeartButton type="TRANSFER" id={t.id} favorited={t.favorited} name={t.title} className="ui-heart-abs" />
          </li>
        ))}
      </ul>
    </div>
  );
}
