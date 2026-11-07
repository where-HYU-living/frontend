import { requireLoginThen, useToggleFavorite } from './features/favorites';
import type { FavoriteType } from '../api/types';

export function HeartButton({ type, id, favorited }: { type: FavoriteType; id: number; favorited: boolean }) {
  const m = useToggleFavorite(type, id);
  return (
    <span className="ui-heart-wrap">
      <button type="button" className={`ui-heart${favorited ? ' on' : ''}`} aria-label={favorited ? '찜함' : '찜하기'} aria-pressed={favorited} disabled={m.isPending} onClick={() => requireLoginThen(() => m.mutate(!favorited))}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill={favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.3-9.2C1.5 8.6 3.4 5 6.9 5c2 0 3.5 1.1 5.1 3 1.6-1.9 3.1-3 5.1-3 3.5 0 5.4 3.6 4.2 6.8C19.5 16.4 12 21 12 21z" /></svg>
      </button>
      {m.isError && <span className="ui-heart-err" role="alert">찜을 저장하지 못했어요</span>}
    </span>
  );
}
