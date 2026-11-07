import { BackButton } from './icons';
import { useState } from 'react';
import { GRADE_META, inkFor } from '../lib/grade';
import { depositRent, manwon } from '../lib/money';
import type { AddressResult, RoomType, TransferBody } from '../api/types';
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
import { convertedRentWon, isPositive, isPositiveInt, missingReason, wonToManText } from './forms/calc';
import './forms/forms.css';
import { useGoTo } from './DormPanel';

const ROOMS: [RoomType, string][] = [['OPEN', '오픈형'], ['SEPARATED', '분리형'], ['ONE_HALF', '1.5룸'], ['TWO_ROOM', '투룸'], ['DUPLEX', '복층']];

const MONTH_CHIPS = [6, 12, 18, 24];
const TITLE_MAX = 40;

function Form({ onDone }: { onDone: () => void }) {
  const { create } = useTransferActions();
  const [addr, setAddr] = useState<AddressResult | null>(null);
  const [f, setF] = useState({ title: '', deposit: '', rent: '', mgmt: '', area: '', floor: '', months: '', from: '', desc: '' });
  const [room, setRoom] = useState<RoomType>('OPEN');
  const [photos, setPhotos] = useState<string[]>([]);
  const [upErr, setUpErr] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const put = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const touch = (k: string) => () => setTouched((o) => ({ ...o, [k]: true }));
  const deposit = manToWon(f.deposit), rent = manToWon(f.rent), months = Number(f.months);
  const title = f.title.trim();
  const roomLabel = ROOMS.find(([v]) => v === room)?.[1] ?? '';
  const suggestion = addr ? `${addr.dong || '내 방'} ${roomLabel} 양도` : null; // 주소를 고르면 이런 제목을 제안한다
  const checks = {
    title: title.length >= 2 && title.length <= TITLE_MAX, addr: !!addr, deposit: deposit != null, rent: rent != null, area: isPositive(f.area), months: isPositiveInt(f.months),
  };
  const valid = Object.values(checks).every(Boolean);
  const reason = missingReason([
    { label: '제목', ok: checks.title }, { label: '주소', ok: checks.addr }, { label: '보증금', ok: checks.deposit }, { label: '월세', ok: checks.rent },
    { label: '면적', ok: checks.area }, { label: '남은 계약', ok: checks.months },
  ]);
  const err = (k: 'title' | 'deposit' | 'rent' | 'area' | 'months', msg: string) => (touched[k] && !checks[k] ? msg : null);
  const live = convertedRentWon(deposit, rent, manToWon(f.mgmt));

  const submit = () => {
    if (!valid || !addr) return;
    const body: TransferBody = { title, address: addr.roadAddress ?? addr.address, dong: addr.dong, lat: addr.lat, lng: addr.lng, deposit: deposit!, rent: rent!, mgmtFee: manToWon(f.mgmt), areaM2: Number(f.area), roomType: room, floor: f.floor.trim() === '' ? null : Number(f.floor), remainingMonths: months, availableFrom: f.from || null, description: f.desc, photoUrls: photos };
    create.mutate(body, { onSuccess: onDone });
  };
  const upload = async (files: File[]) => {
    setUpErr(false); setUpBusy(true);
    const got: string[] = [];
    try { for (const file of files) got.push(await uploadPhoto(file)); } catch { setUpErr(true); }
    setPhotos((o) => [...o, ...got]); setUpBusy(false);
  };

  return (
    <div className="ui-form2">
      <p className="ui-form2-intro"><b>사건 접수 · 양도</b><br />남은 계약을 넘기는 글이에요. 집주인 동의가 필요하고, 거래는 당사자끼리 해요.</p>

      <FormSection title="1. 제목">
        <Field label="글 제목" error={err('title', '2자 이상 40자 이하로 적어 주세요')} hint={`${title.length}/${TITLE_MAX}자. 목록과 3D 말풍선에 이 제목이 보여요`}>
          {(id, d) => <input id={id} value={f.title} maxLength={TITLE_MAX} placeholder="예: 행당동 분리형 8개월 양도, 가구 다 드려요" aria-label="글 제목" aria-invalid={!checks.title && touched.title ? true : undefined} aria-describedby={d} onChange={(e) => put('title')(e.target.value)} onBlur={touch('title')} />}
        </Field>
        {suggestion && title === '' && <button type="button" className="ui-link" onClick={() => put('title')(suggestion)}>이렇게 쓸까요? “{suggestion}”</button>}
      </FormSection>

      <FormSection title="2. 위치">
        <AddressPicker value={addr} onPick={setAddr} />
      </FormSection>

      <FormSection title="3. 금액" grid>
        <UnitInput label="보증금" unit="만원" value={f.deposit} onChange={put('deposit')} ariaLabel="보증금(만원)" onBlur={touch('deposit')} error={err('deposit', '숫자로 적어 주세요')} />
        <UnitInput label="월세" unit="만원" value={f.rent} onChange={put('rent')} ariaLabel="월세(만원)" onBlur={touch('rent')} error={err('rent', '숫자로 적어 주세요')} />
        <UnitInput label="관리비" unit="만원" value={f.mgmt} onChange={put('mgmt')} ariaLabel="관리비(만원)" placeholder="선택" hint="모르면 비워 두세요" className="span2" />
        <div className="span2"><LiveSummary title="환산 월세" value={live == null ? null : wonToManText(live)} note={live == null ? '보증금과 월세를 넣으면 바로 계산해요' : '월세 + 관리비 + 보증금 × 6% ÷ 12'} /></div>
      </FormSection>

      <FormSection title="4. 방 정보" grid>
        <div className="span2 ui-field"><span className="ui-field-sublabel">방 구조</span><Segmented label="방 구조" options={ROOMS} value={room} onChange={setRoom} /></div>
        <UnitInput label="면적" unit="㎡" inputMode="decimal" value={f.area} onChange={put('area')} ariaLabel="면적(㎡)" onBlur={touch('area')} error={err('area', '0보다 큰 숫자')} />
        <UnitInput label="층" unit="층" value={f.floor} onChange={put('floor')} ariaLabel="층" placeholder="선택" />
      </FormSection>

      <FormSection title="5. 계약" grid>
        <UnitInput label="남은 계약" unit="개월" value={f.months} onChange={put('months')} ariaLabel="남은 계약(개월)" onBlur={touch('months')} error={err('months', '1 이상의 정수')} />
        <Field label="입주 가능일">{(id) => <input id={id} type="date" value={f.from} onChange={(e) => put('from')(e.target.value)} aria-label="입주 가능일" />}</Field>
        <div className="span2"><ChipSelect label="남은 계약 빠른 선택" options={MONTH_CHIPS} suffix="개월" value={f.months} onPick={(v) => { put('months')(v); touch('months')(); }} /></div>
      </FormSection>

      <FormSection title="6. 사진 · 설명">
        <PhotoGrid photos={photos} onAdd={upload} onRemove={(i) => setPhotos((o) => o.filter((_, j) => j !== i))} busy={upBusy} error={upErr ? '사진을 올리지 못했어요 (jpg/png, 5MB 이하)' : null} />
        <Field label="설명" hint="옵션, 방향·소음·집주인 동의 여부 등">{(id, d) => <textarea id={id} rows={4} value={f.desc} onChange={(e) => put('desc')(e.target.value)} aria-label="설명" aria-describedby={d} />}</Field>
      </FormSection>

      {create.isError && <p className="ui-field-error" role="alert">글을 올리지 못했어요</p>}
      <StickyActions reason={reason}>
        <button type="button" className="ui-primary" disabled={!valid || create.isPending} onClick={submit}>올리기</button>
      </StickyActions>
    </div>
  );
}

function Detail({ id, onBack }: { id: number; onBack: () => void }) {
  const q = useTransfer(id);
  const { finish } = useTransferActions();
  const go = useGoTo();
  const token = useSession((s) => s.token);
  if (q.isLoading) return <p className="empty">불러오는 중…</p>;
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
        <dt>도보</dt><dd>{t.walkMin == null ? '도보 시간 정보 없음' : `과 건물까지 ${t.walkMin}분`}</dd>
      </dl>
      {t.description && <p className="ui-desc">{t.description}</p>}
      <button type="button" className="ui-primary" onClick={() => go(t)}>3D로 보기</button>
      {t.mine && t.status === 'OPEN' && <button type="button" className="ui-mini" onClick={() => finish.mutate(t.id)}>양도 완료</button>}
    </div>
  );
}

export function TransferPanel() {
  const q = useTransfers();
  const requireLogin = useSession((s) => s.requireLogin);
  const go = useGoTo();
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
              onClick={() => { setSel(t.id); go(t); }}
            />
            <HeartButton type="TRANSFER" id={t.id} favorited={t.favorited} name={t.title} className="ui-heart-abs" />
          </li>
        ))}
      </ul>
    </div>
  );
}
