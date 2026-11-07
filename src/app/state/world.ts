import { create } from 'zustand';
import type { WorldApi } from '../../main';

type WorldState = {
  status: 'loading' | 'ready' | 'error';
  progress: number;
  error: string | null;
  api: WorldApi | null;
};

export const useWorld = create<WorldState>(() => ({ status: 'loading', progress: 0, error: null, api: null }));
