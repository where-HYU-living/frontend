import { useState } from 'react';
import { PenLine, Star } from 'lucide-react';
import type { Review, ReviewScores, ReviewTargetType } from '../api/types';
import { useAddReview, useReviews, validateReview } from './features/more';
import { useSession } from './state/session';

const ITEMS: [keyof ReviewScores, string][] = [['noise', '방음'], ['light', '채광'], ['bugs', '벌레'], ['landlord', '집주인'], ['depositReturn', '보증금 반환']];

function Stars({ value, onChange, label, size = 18 }: { value: number; onChange: (n: number) => void; label: string; size?: number }) {
  return (
    <span className="ui-stars" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${label} ${n}점`} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}><Star size={size} fill={n <= value ? 'currentColor' : 'none'} aria-hidden="true" /></button>
      ))}
    </span>
  );
}

/** 읽기 전용 별 (반 개 없이 반올림) */
function StarRow({ value, size = 13 }: { value: number; size?: number }) {
  const n = Math.round(value);
  return <span className="ui-rv-stars" aria-hidden="true">{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} fill={i <= n ? 'currentColor' : 'none'} className={i <= n ? 'on' : ''} />)}</span>;
}

const SCORE_WORD = ['', '별로예요', '아쉬워요', '보통이에요', '좋아요', '아주 좋아요'];

/** 후기 입력 폼. pin 이 있으면 실내 3D 의 그 위치에 붙는 핀 후기 (POST /reviews 의 pin = [x,y,z], floorplanId = 핀을 찍은 방) */
export function ReviewForm({ targetType, targetId, pin = null, floorplanId = null, onDone, onCancel }: { targetType: ReviewTargetType; targetId: number; pin?: [number, number, number] | null; floorplanId?: number | null; onDone: () => void; onCancel: () => void }) {
  const add = useAddReview(targetType, targetId);
  const [rating, setRating] = useState(0);
  const [scores, setScores] = useState<Partial<ReviewScores>>({});
  const [text, setText] = useState('');
  const err = validateReview(rating, scores, text);
  const left = ITEMS.filter(([k]) => !scores[k]).length;
  const submit = () => {
    if (err) return;
    add.mutate({ rating, scores: scores as ReviewScores, text, pin, floorplanId: pin ? floorplanId : null }, { onSuccess: onDone });
  };
  return (
    <div className="ui-review-form">
      {pin && <p className="ui-card-sub">실내에서 고른 위치에 핀으로 남겨요.</p>}
      <div className="ui-rv-overall">
        <span>전체적으로</span>
        <Stars value={rating} onChange={setRating} label="별점" size={26} />
        <small aria-live="polite">{rating ? SCORE_WORD[rating] : '별을 눌러 주세요'}</small>
      </div>
      <div className="ui-rv-items">
        {ITEMS.map(([k, name]) => <div key={k} className="ui-review-line"><span>{name}</span><Stars value={scores[k] ?? 0} onChange={(n) => setScores((o) => ({ ...o, [k]: n }))} label={name} /></div>)}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={pin ? '여기가 어땠나요? 예: 여기 곰팡이' : '살아 보니 어땠나요? 예: 겨울에 외풍이 있어요, 집주인이 수리를 빨리 해 줘요'} aria-label="후기 내용" rows={3} maxLength={600} />
      <p className={`ui-rv-count${text.length > 500 ? ' is-over' : ''}`}>{text.length}/500자</p>
      {text.length > 500 && <p className="ui-modal-error">후기는 500자까지 쓸 수 있어요</p>}
      {add.isError && <p className="ui-modal-error" role="alert">후기를 저장하지 못했어요</p>}
      <div className="ui-modal-actions">
        {err && <span className="ui-rv-need" role="status">{!rating ? '전체 별점을 골라 주세요' : left ? `항목 ${left}개가 남았어요` : err}</span>}
        <button type="button" className="ghost" onClick={onCancel}>취소</button><button type="button" className="primary" disabled={!!err || add.isPending} onClick={submit}>등록</button>
      </div>
    </div>
  );
}

/** 항목별 평균 (후기마다 점수가 있으니 화면에서 평균을 낸다) */
function itemAverages(items: Review[]): [string, number][] {
  if (!items.length) return [];
  return ITEMS.map(([k, name]) => [name, items.reduce((a, r) => a + (r.scores?.[k] ?? 0), 0) / items.length] as [string, number]).filter(([, v]) => v > 0);
}

export function ReviewSection({ targetType, targetId }: { targetType: ReviewTargetType; targetId: number }) {
  const q = useReviews(targetType, targetId);
  const requireLogin = useSession((s) => s.requireLogin);
  const [open, setOpen] = useState(false);
  const items = q.data?.items ?? [];
  const pinned = items.filter((r) => r.pin).length;
  const avgs = itemAverages(items);

  return (
    <section className="ui-reviews ui-ld-sec" aria-label="후기">
      <h4 className="ui-ld-h">한양대생 후기 {q.data && q.data.count > 0 && <span className="ui-rv-n">{q.data.count}</span>}</h4>
      {q.isLoading && <p className="ui-card-sub">불러오는 중…</p>}
      {q.isError && <p className="ui-card-sub">후기를 불러오지 못했어요.</p>}
      {q.data && q.data.count === 0 && <p className="ui-rv-empty">아직 후기가 없어요. 살아 봤다면 첫 후기를 남겨 주세요.</p>}
      {q.data && q.data.count > 0 && (
        <div className="ui-rv-sum">
          <div className="ui-rv-avg">
            <strong>{q.data.average == null ? '-' : q.data.average.toFixed(1)}</strong>
            <StarRow value={q.data.average ?? 0} size={14} />
            <span className="ui-card-sub">평균 {q.data.average == null ? '-' : q.data.average.toFixed(1)}점 · 후기 {q.data.count}개</span>
          </div>
          {avgs.length > 0 && (
            <dl className="ui-rv-bars">
              {avgs.map(([name, v]) => (
                <div key={name}><dt>{name}</dt><dd><span className="ui-rv-bar"><i style={{ width: `${(v / 5) * 100}%` }} /></span><b>{v.toFixed(1)}</b></dd></div>
              ))}
            </dl>
          )}
        </div>
      )}
      {items.length > 0 && (
        <ul className="ui-rv-list">
          {items.map((r) => (
            <li key={r.id}>
              <div className="ui-rv-meta">
                <strong className="ui-stars-inline" aria-label={`후기 별점 ${r.rating}점`}><StarRow value={r.rating} /></strong>
                <span>{r.authorNickname}</span>
                {r.pin && <span className="ui-rv-pin">실내 핀</span>}
              </div>
              {r.text && <p className="ui-rv-text">{r.text}</p>}
            </li>
          ))}
        </ul>
      )}
      {pinned > 0 && <p className="ui-card-sub">실내에 들어가면 핀 후기 {pinned}개가 남긴 자리에 보여요.</p>}
      {!open
        ? <button type="button" className="ui-rv-write" onClick={() => { if (requireLogin()) setOpen(true); }}><PenLine size={15} aria-hidden="true" />후기 쓰기</button>
        : <ReviewForm targetType={targetType} targetId={targetId} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />}
      {targetType !== 'LISTING' && <p className="ui-card-sub">기숙사·청년안심주택은 실내에 들어가 벽이나 바닥을 길게 눌러 위치와 함께 후기를 남길 수 있어요.</p>}
    </section>
  );
}
