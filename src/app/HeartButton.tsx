import { Heart } from 'lucide-react';
import { requireLoginThen, useToggleFavorite } from './features/favorites';
import type { FavoriteType } from '../api/types';

export function HeartButton({ type, id, favorited }: { type: FavoriteType; id: number; favorited: boolean }) {
  const m = useToggleFavorite(type, id);
  return (
    <span className="ui-heart-wrap">
      <button type="button" className={`ui-heart${favorited ? ' on' : ''}`} aria-label={favorited ? '찜함' : '찜하기'} aria-pressed={favorited} disabled={m.isPending} onClick={() => requireLoginThen(() => m.mutate(!favorited))}>
        <Heart size={20} fill={favorited ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
      {m.isError && <span className="ui-heart-err" role="alert">찜을 저장하지 못했어요</span>}
    </span>
  );
}
