import { useState } from 'react';
import type { ReviewScores, ReviewTargetType } from '../api/types';
import { useAddReview, useReviews, validateReview } from './features/more';
import { useSession } from './state/session';

const ITEMS: [keyof ReviewScores, string][] = [['noise', '방음'], ['light', '채광'], ['bugs', '벌레'], ['landlord', '집주인'], ['depositReturn', '보증금 반환']];

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="ui-stars" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${label} ${n}점`} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>★</button>
      ))}
    </span>
  );
}

export function ReviewSection({ targetType, targetId }: { targetType: ReviewTargetType; targetId: number }) {
  const q = useReviews(targetType, targetId);
  const add = useAddReview(targetType, targetId);
  const requireLogin = useSession((s) => s.requireLogin);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [scores, setScores] = useState<Partial<ReviewScores>>({});
  const [text, setText] = useState('');
  const err = validateReview(rating, scores, text);

  const submit = () => {
    if (err) return;
    add.mutate({ rating, scores: scores as ReviewScores, text }, { onSuccess: () => { setOpen(false); setRating(0); setScores({}); setText(''); } });
  };

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
          <li key={r.id}><span><strong>{'★'.repeat(r.rating)}</strong> <span className="ui-card-sub">{r.authorNickname}</span>{r.text && <span>{r.text}</span>}</span></li>
        ))}
      </ul>
      {!open
        ? <button type="button" className="ui-mini" onClick={() => { if (requireLogin()) setOpen(true); }}>후기 쓰기</button>
        : (
          <div className="ui-review-form">
            <div className="ui-review-line">전체 <Stars value={rating} onChange={setRating} label="별점" /></div>
            {ITEMS.map(([k, name]) => <div key={k} className="ui-review-line">{name} <Stars value={scores[k] ?? 0} onChange={(n) => setScores({ ...scores, [k]: n })} label={name} /></div>)}
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="살아 보니 어땠나요? (500자 이하)" aria-label="후기 내용" rows={3} />
            {text.length > 500 && <p className="ui-modal-error">후기는 500자까지 쓸 수 있어요</p>}
            {add.isError && <p className="ui-modal-error" role="alert">후기를 저장하지 못했어요</p>}
            <div className="ui-modal-actions"><button type="button" className="ghost" onClick={() => setOpen(false)}>취소</button><button type="button" className="primary" disabled={!!err || add.isPending} onClick={submit}>등록</button></div>
          </div>
        )}
    </section>
  );
}
