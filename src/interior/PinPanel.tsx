import { Star, X } from 'lucide-react';
import type { Review } from '../api/types';
import { ReviewForm } from '../app/ReviewSection';
import type { Pin } from './pins';
import type { ReviewTarget } from './reviewTarget';

type Props = {
  target: ReviewTarget | null;
  draft: Pin | null;
  selected: Review | null;
  onClearDraft: () => void;
  onClearSelected: () => void;
};

/** 화면 아래 시트: 길게 눌러 찍은 자리의 후기 작성 폼, 또는 누른 핀의 후기 내용 */
export function PinPanel({ target, draft, selected, onClearDraft, onClearSelected }: Props) {
  if (draft) {
    return (
      <div className="ui-in-sheet glass" role="dialog" aria-label="핀 후기 쓰기">
        <div className="ui-in-sheet-head"><strong>이 자리에 후기 남기기</strong><button type="button" className="ui-in-x" aria-label="닫기" onClick={onClearDraft}><X size={16} /></button></div>
        {target
          ? <ReviewForm targetType={target.targetType} targetId={target.targetId} pin={draft} onDone={onClearDraft} onCancel={onClearDraft} />
          : <p className="ui-card-sub">이 실내가 어느 기숙사·주택의 것인지 알 수 없어 후기를 남길 수 없어요. 목록의 ‘실내 들어가기’로 다시 들어와 주세요.</p>}
      </div>
    );
  }
  if (selected) {
    return (
      <div className="ui-in-sheet glass" role="dialog" aria-label="핀 후기">
        <div className="ui-in-sheet-head">
          <strong className="ui-stars-inline" aria-label={`별점 ${selected.rating}점`}>{Array.from({ length: selected.rating }, (_, i) => <Star key={i} size={14} fill="currentColor" aria-hidden="true" />)}</strong>
          <span className="ui-card-sub">{selected.authorNickname}</span>
          <button type="button" className="ui-in-x" aria-label="닫기" onClick={onClearSelected}><X size={16} /></button>
        </div>
        <p className="ui-in-text">{selected.text || '(내용 없음)'}</p>
      </div>
    );
  }
  return null;
}
