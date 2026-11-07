import { BackButton } from './icons';
import { useState } from 'react';
import { GRADE_META } from '../lib/grade';
import { depositRent, manwon } from '../lib/money';
import type { AddressResult, RoomType, TransferBody } from '../api/types';
import { manToWon, uploadPhoto, useTransfer, useTransferActions, useTransfers } from './features/more';
import { useSession } from './state/session';
import { VerdictCard } from './VerdictCard';
import { AddressPicker } from './AddressPicker';
import { HeartButton } from './HeartButton';
import { useGoTo } from './DormPanel';

const ROOMS: [RoomType, string][] = [['OPEN', '오픈형'], ['SEPARATED', '분리형'], ['ONE_HALF', '1.5룸'], ['TWO_ROOM', '투룸'], ['DUPLEX', '복층']];

function Form({ onDone }: { onDone: () => void }) {
  const { create } = useTransferActions();
  const [addr, setAddr] = useState<AddressResult | null>(null);
  const [f, setF] = useState({ deposit: '', rent: '', mgmt: '', area: '', floor: '', months: '', from: '', desc: '' });
  const [room, setRoom] = useState<RoomType>('OPEN');
  const [photos, setPhotos] = useState<string[]>([]);
  const [upErr, setUpErr] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const deposit = manToWon(f.deposit), rent = manToWon(f.rent), months = Number(f.months);
  const valid = !!addr && deposit != null && rent != null && Number(f.area) > 0 && Number.isInteger(months) && months > 0;

  const submit = () => {
    if (!valid || !addr) return;
    const body: TransferBody = { address: addr.roadAddress ?? addr.address, dong: addr.dong, lat: addr.lat, lng: addr.lng, deposit: deposit!, rent: rent!, mgmtFee: manToWon(f.mgmt), areaM2: Number(f.area), roomType: room, floor: f.floor.trim() === '' ? null : Number(f.floor), remainingMonths: months, availableFrom: f.from || null, description: f.desc, photoUrls: photos };
    create.mutate(body, { onSuccess: onDone });
  };
  const upload = async (file: File | undefined) => { if (!file) return; setUpErr(false); try { setPhotos([...photos, await uploadPhoto(file)]); } catch { setUpErr(true); } };

  return (
    <div className="ui-form">
      <p className="ui-card-sub">남은 계약을 넘기는 글이에요. 집주인 동의가 필요하고, 거래는 당사자끼리 해요.</p>
      <AddressPicker value={addr} onPick={setAddr} />
      <label>보증금(만원)<input inputMode="numeric" value={f.deposit} onChange={set('deposit')} aria-label="보증금(만원)" /></label>
      <label>월세(만원)<input inputMode="numeric" value={f.rent} onChange={set('rent')} aria-label="월세(만원)" /></label>
      <label>관리비(만원)<input inputMode="numeric" value={f.mgmt} onChange={set('mgmt')} aria-label="관리비(만원)" placeholder="모르면 비워 두세요" /></label>
      <label>면적(㎡)<input inputMode="decimal" value={f.area} onChange={set('area')} aria-label="면적(㎡)" /></label>
      <label>층<input inputMode="numeric" value={f.floor} onChange={set('floor')} aria-label="층" /></label>
      <label>방 구조<select value={room} onChange={(e) => setRoom(e.target.value as RoomType)} aria-label="방 구조">{ROOMS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
      <label>남은 계약(개월)<input inputMode="numeric" value={f.months} onChange={set('months')} aria-label="남은 계약(개월)" /></label>
      <label>입주 가능일<input type="date" value={f.from} onChange={set('from')} aria-label="입주 가능일" /></label>
      <label>설명<textarea rows={3} value={f.desc} onChange={set('desc')} aria-label="설명" /></label>
      <label>사진<input type="file" accept="image/jpeg,image/png" onChange={(e) => upload(e.target.files?.[0])} aria-label="사진" /></label>
      {photos.length > 0 && <p className="ui-card-sub">사진 {photos.length}장 올림</p>}
      {upErr && <p className="ui-modal-error" role="alert">사진을 올리지 못했어요 (jpg/png, 5MB 이하)</p>}
      {create.isError && <p className="ui-modal-error" role="alert">글을 올리지 못했어요</p>}
      <button type="button" className="ui-primary" disabled={!valid || create.isPending} onClick={submit}>올리기</button>
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
      <div className="ui-detail-head"><h3>{t.title}</h3><HeartButton type="TRANSFER" id={t.id} favorited={t.favorited} /></div>
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
  const [sel, setSel] = useState<number | null>(null);
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
          <li key={t.id}>
            <button type="button" className="ui-card" onClick={() => { setSel(t.id); go(t); }}>
              <span className="ui-card-badge" style={{ background: GRADE_META[t.grade].color }}>{GRADE_META[t.grade].label}</span>
              <strong>{depositRent(t.deposit, t.rent)}</strong>
              <span className="ui-card-sub">{t.title} · 남은 {t.remainingMonths}개월 · 환산 {manwon(t.convertedRent)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
