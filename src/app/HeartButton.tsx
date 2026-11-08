import { Heart } from 'lucide-react';
import { requireLoginThen, useIsFavorite, useToggleFavorite } from './features/favorites';
import type { FavoriteType } from '../api/types';

/**
 * 찜 하트. 찜했는지는 `/me/favorites` 목록에서 스스로 알아낸다 (자취방·단지·기숙사·양도 모두 같은 방식).
 * favorited 는 목록 응답이 실어 준 값으로, 찜 목록이 도착하기 전의 첫 화면에만 쓰는 힌트다.
 * name 을 주면 마우스를 올렸을 때 "○○ 찜하기" 로 무엇을 찜하는지 보인다.
 */
export function HeartButton({ type, id, favorited, name, className }: { type: FavoriteType; id: number; favorited?: boolean; name?: string; className?: string }) {
  const on = useIsFavorite(type, id, favorited);
  const m = useToggleFavorite(type, id);
  return (
    <span className={`ui-heart-wrap${className ? ` ${className}` : ''}`}>
      <button type="button" className={`ui-heart${on ? ' on' : ''}`} aria-label={name ? `${name} 찜` : '찜'} aria-pressed={on} title={name ? `${name} ${on ? '찜 취소' : '찜하기'}` : on ? '찜 취소' : '찜하기'} disabled={m.isPending} onClick={() => requireLoginThen(() => m.mutate(!on))}>
        <Heart size={20} fill={on ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
      {m.isError && <span className="ui-heart-err" role="alert">찜을 저장하지 못했어요</span>}
    </span>
  );
}
