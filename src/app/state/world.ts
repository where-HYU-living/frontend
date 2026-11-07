import { create } from 'zustand';
import type { WorldApi } from '../../main';

type WorldState = {
  status: 'loading' | 'ready' | 'error';
  progress: number;
  error: string | null;
  api: WorldApi | null;
  /** api 가 어느 월드의 것인지: 'campus' 또는 동네 id. 월드를 바꾸는 중에는 옛 api 를 쓰지 않게 구분한다 */
  areaId: string | null;
};

export const useWorld = create<WorldState>(() => ({ status: 'loading', progress: 0, error: null, api: null, areaId: null }));
