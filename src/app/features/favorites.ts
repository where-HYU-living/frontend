import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { api } from '../../api/client';
import type { FavoriteType } from '../../api/types';
import { useSession } from '../state/session';
import { useFavorites } from './catalog';

export const favKey = (type: FavoriteType, id: number) => `${type}:${id}`;

/**
 * 낙관적 표시: 서버 응답을 기다리지 않고 하트를 먼저 바꿔 보여 준다 (key → 기대하는 찜 여부).
 * 응답이 오고 목록을 다시 받은 뒤에 지운다. 실패하면 바로 지워서 원래대로 돌아간다.
 */
export const useFavOverrides = create<{ o: Record<string, boolean>; set: (k: string, v: boolean) => void; clear: (k: string) => void }>((set) => ({
  o: {},
  set: (k, v) => set((s) => ({ o: { ...s.o, [k]: v } })),
  clear: (k) => set((s) => { const rest = { ...s.o }; delete rest[k]; return { o: rest }; }),
}));

/**
 * 지금 찜했는지 알려 주는 함수. 하트 버튼·목록 카드·3D 말풍선이 모두 이것 하나를 써서 같은 답을 낸다.
 * 기준은 `/me/favorites` 목록(종류 불문). 목록이 아직 없거나 게스트면 서버가 항목에 실어 준 favorited(hint)를 쓴다.
 * sig 는 찜이 바뀔 때만 바뀌는 문자열 — 말풍선을 다시 올릴지 판단하는 effect 의 의존값으로 쓴다.
 */
export function useFavoriteLookup() {
  const items = useFavorites().data;
  const overrides = useFavOverrides((s) => s.o);
  const set = useMemo(() => new Set((items ?? []).map((f) => favKey(f.type, f.targetId))), [items]);
  const loaded = !!items;
  const has = useCallback((type: FavoriteType, id: number, hint?: boolean) => {
    const k = favKey(type, id);
    if (k in overrides) return overrides[k];
    return loaded ? set.has(k) : hint ?? false;
  }, [overrides, set, loaded]);
  const sig = useMemo(() => `${loaded ? [...set].sort().join(',') : '-'}|${Object.entries(overrides).map(([k, v]) => `${k}${v ? '+' : '-'}`).join(',')}`, [set, loaded, overrides]);
  return { has, sig };
}

export function useIsFavorite(type: FavoriteType, id: number, hint?: boolean) {
  return useFavoriteLookup().has(type, id, hint);
}

/** 찜 토글: 게스트면 로그인 창(호출하는 쪽에서 requireLoginThen), 낙관적 표시, 실패하면 되돌림, 409 는 이미 찜한 것으로 본다 */
export function useToggleFavorite(type: FavoriteType, id: number) {
  const qc = useQueryClient();
  const key = favKey(type, id);
  return useMutation({
    mutationFn: async (next: boolean) => {
      try {
        if (next) await api('/me/favorites', { method: 'POST', body: { type, targetId: id } });
        else await api(`/me/favorites/${type}/${id}`, { method: 'DELETE' });
      } catch (e) {
        if (!(next && (e as { status?: number }).status === 409)) throw e;
      }
    },
    onMutate: (next) => { useFavOverrides.getState().set(key, next); },
    onError: () => { useFavOverrides.getState().clear(key); },
    onSettled: async () => {
      // 목록의 favorited 값과 상세를 다시 받는다. 종류별로 자기 캐시만 건드린다
      const refetch = [qc.invalidateQueries({ queryKey: ['favorites'] })];
      if (type === 'LISTING') refetch.push(qc.invalidateQueries({ queryKey: ['listings'] }), qc.invalidateQueries({ queryKey: ['listing', id] }));
      if (type === 'TRANSFER') refetch.push(qc.invalidateQueries({ queryKey: ['transfers'] }), qc.invalidateQueries({ queryKey: ['transfer', id] }));
      await Promise.allSettled(refetch);
      useFavOverrides.getState().clear(key);
    },
  });
}

export function requireLoginThen(fn: () => void) {
  if (useSession.getState().requireLogin()) fn();
}
