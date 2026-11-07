import { create } from 'zustand';
import { isSiteId, type SiteId } from '../../world/neighborhood';

export type Pose = { x: number; z: number; yaw?: number };
export type Area = 'campus' | { site: SiteId };

type AreaState = {
  area: Area;
  /** 동네로 들어가기 전 캠퍼스 위치 — 돌아올 때 한 번 쓰고 비운다 */
  returnPose: Pose | null;
  /** 돌아온 뒤 캠퍼스 월드가 준비되면 옮겨 줄 위치 */
  pendingReturn: Pose | null;
  enter: (site: SiteId, from: Pose | null) => void;
  leave: () => void;
  consumeReturn: () => Pose | null;
};

/** ?area=l6 (디버그·공유용): 해당 동네로 바로 열기 */
const initialArea = (): Area => {
  try { const v = new URLSearchParams(location.search).get('area'); if (v && isSiteId(v)) return { site: v }; } catch { /* SSR·테스트 */ }
  return 'campus';
};

export const useArea = create<AreaState>((set, get) => ({
  area: initialArea(), returnPose: null, pendingReturn: null,
  enter: (site, from) => set((s) => ({ area: { site }, returnPose: typeof s.area === 'string' ? from : s.returnPose })),
  leave: () => set((s) => ({ area: 'campus', pendingReturn: s.returnPose, returnPose: null })),
  consumeReturn: () => { const p = get().pendingReturn; if (p) set({ pendingReturn: null }); return p; },
}));

export const siteOf = (a: Area): SiteId | null => (typeof a === 'string' ? null : a.site);

// 개발·점검 스크립트용 (Vite HMR 때문에 import('/src/…') 가 다른 인스턴스를 줄 수 있다)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__useArea = useArea;
