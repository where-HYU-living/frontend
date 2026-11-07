import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { FavoriteType, ListingDetail } from '../../api/types';
import { useSession } from '../state/session';

/** 찜 토글: 게스트면 로그인 창, 낙관적 업데이트, 실패하면 되돌림, 409 는 이미 찜한 것으로 본다 */
export function useToggleFavorite(type: FavoriteType, id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: boolean) => {
      try {
        if (next) await api('/me/favorites', { method: 'POST', body: { type, targetId: id } });
        else await api(`/me/favorites/${type}/${id}`, { method: 'DELETE' });
      } catch (e) {
        if (!(next && (e as { status?: number }).status === 409)) throw e;
      }
    },
    onMutate: async (next) => {
      const key = ['listing', id];
      const prev = qc.getQueryData<ListingDetail>(key);
      if (prev) qc.setQueryData(key, { ...prev, favorited: next });
      return { prev };
    },
    onError: (_e, _n, ctx) => { if (ctx?.prev) qc.setQueryData(['listing', id], ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['listings'] }); qc.invalidateQueries({ queryKey: ['favorites'] }); },
  });
}

export function requireLoginThen(fn: () => void) {
  if (useSession.getState().requireLogin()) fn();
}
