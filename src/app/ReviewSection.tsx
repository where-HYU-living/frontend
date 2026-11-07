import { useState } from 'react';
import { Star } from 'lucide-react';
import type { ReviewScores, ReviewTargetType } from '../api/types';
import { useAddReview, useReviews, validateReview } from './features/more';
import { useSession } from './state/session';

const ITEMS: [keyof ReviewScores, string][] = [['noise', '방음'], ['light', '채광'], ['bugs', '벌레'], ['landlord', '집주인'], ['depositReturn', '보증금 반환']];

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="ui-stars" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${label} ${n}점`} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}><Star size={18} fill={n <= value ? 'currentColor' : 'none'} aria-hidden="true" /></button>
      ))}
    </span>
  );
}

/** 후기 입력 폼. pin 이 있으면 실내 3D 의 그 위치에 붙는 핀 후기 (POST /reviews 의 pin = [x,y,z]) */
export function ReviewForm({ targetType, targetId, pin = null, onDone, onCancel }: { targetType: ReviewTargetType; targetId: number; pin?: [number, number, number] | null; onDone: () => void; onCancel: () => void }) {
  const add = useAddReview(targetType, targetId);
  const [rating, setRating] = useState(0);
  const [scores, setScores] = useState<Partial<ReviewScores>>({});
  const [text, setText] = useState('');
  const err = validateReview(rating, scores, text);
  const submit = () => {
    if (err) return;
    add.mutate({ rating, scores: scores as ReviewScores, text, pin }, { onSuccess: onDone });
  };
  return (
    <div className="ui-review-form">
      {pin && <p className="ui-card-sub">실내에서 고른 위치에 핀으로 남겨요.</p>}
      <div className="ui-review-line">전체 <Stars value={rating} onChange={setRating} label="별점" /></div>
      {ITEMS.map(([k, name]) => <div key={k} className="ui-review-line">{name} <Stars value={scores[k] ?? 0} onChange={(n) => setScores({ ...scores, [k]: n })} label={name} /></div>)}
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={pin ? '여기가 어땠나요? 예: 여기 곰팡이 (500자 이하)' : '살아 보니 어땠나요? (500자 이하)'} aria-label="후기 내용" rows={3} />
      {text.length > 500 && <p className="ui-modal-error">후기는 500자까지 쓸 수 있어요</p>}
      {add.isError && <p className="ui-modal-error" role="alert">후기를 저장하지 못했어요</p>}
      <div className="ui-modal-actions"><button type="button" className="ghost" onClick={onCancel}>취소</button><button type="button" className="primary" disabled={!!err || add.isPending} onClick={submit}>등록</button></div>
    </div>
  );
}

export function ReviewSection({ targetType, targetId }: { targetType: ReviewTargetType; targetId: number }) {
  const q = useReviews(targetType, targetId);
  const requireLogin = useSession((s) => s.requireLogin);
  const [open, setOpen] = useState(false);
  const pinned = q.data?.items.filter((r) => r.pin).length ?? 0;

  return (
    <section className="ui-reviews" aria-label="후기">
      <h4>한양대생 후기</h4>
      {q.isLoading && <p className="ui-card-sub">불러오는 중…</p>}
      {q.isError && <p className="ui-card-sub">후기를 불러오지 못했어요.</p>}
      {q.data && (q.data.count === 0
        ? <p className="ui-card-sub">아직 후기가 없어요.</p>
        : <p className="ui-card-sub">평균 {q.data.average == null ? '-' : q.data.average.toFixed(1)}점 · 후기 {q.data.count}개</p>)}
      <ul className="ui-rows ui-review-list">
        {q.data?.items.map((r) => (
          <li key={r.id}><span><strong className="ui-stars-inline" aria-label={`후기 별점 ${r.rating}점`}>{Array.from({ length: r.rating }, (_, i) => <Star key={i} size={13} fill="currentColor" aria-hidden="true" />)}</strong> <span className="ui-card-sub">{r.authorNickname}</span>{r.pin && <span className="ui-card-sub"> · 실내 핀</span>}{r.text && <span>{r.text}</span>}</span></li>
        ))}
      </ul>
      {pinned > 0 && <p className="ui-card-sub">실내 핀 후기 {pinned}개 · 실내에 들어가면 남긴 자리에 핀으로 보여요.</p>}
      {!open
        ? <button type="button" className="ui-mini" onClick={() => { if (requireLogin()) setOpen(true); }}>후기 쓰기</button>
        : <ReviewForm targetType={targetType} targetId={targetId} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />}
      {targetType !== 'LISTING' && <p className="ui-card-sub">기숙사·청년안심주택은 실내에 들어가 벽이나 바닥을 길게 눌러 위치와 함께 후기를 남길 수 있어요.</p>}
    </section>
  );
}
