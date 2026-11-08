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
  /** 월드가 바뀐 뒤(또는 이미 그 월드일 때) 옮겨 줄 위치 — 검색 결과로 이동할 때 쓴다 */
  pendingGoto: { area: string; x: number; z: number; stand?: boolean } | null;
  enter: (site: SiteId, from: Pose | null) => void;
  leave: () => void;
  consumeReturn: () => Pose | null;
  /** stand: 그 지점에 바로 서기(걸을 수 있으면). 아니면 그 지점이 보이는 빈자리로 */
  goTo: (area: string, x: number, z: number, from?: Pose | null, stand?: boolean) => void;
  consumeGoto: (area: string) => { x: number; z: number; stand?: boolean } | null;
};

/** ?area=l6 (디버그·공유용): 해당 동네로 바로 열기 */
const initialArea = (): Area => {
  try { const v = new URLSearchParams(location.search).get('area'); if (v && isSiteId(v)) return { site: v }; } catch { /* SSR·테스트 */ }
  return 'campus';
};

export const useArea = create<AreaState>((set, get) => ({
  area: initialArea(), returnPose: null, pendingReturn: null, pendingGoto: null,
  enter: (site, from) => set((s) => ({ area: { site }, returnPose: typeof s.area === 'string' ? from : s.returnPose })),
  leave: () => set((s) => ({ area: 'campus', pendingReturn: s.returnPose, returnPose: null })),
  consumeReturn: () => { const p = get().pendingReturn; if (p) set({ pendingReturn: null }); return p; },
  /** 'campus' 또는 동네 id 의 (x,z) 로 간다. 다른 월드면 월드를 바꾸고, 도착하면 옮긴다 */
  goTo: (area, x, z, from = null, stand = false) => {
    const cur = siteOf(get().area) ?? 'campus';
    set({ pendingGoto: { area, x, z, stand } });
    if (cur === area) return;
    if (area === 'campus') set({ area: 'campus', pendingReturn: null, returnPose: null });
    else get().enter(area, from);
  },
  consumeGoto: (area) => { const g = get().pendingGoto; if (!g || g.area !== area) return null; set({ pendingGoto: null }); return { x: g.x, z: g.z, stand: g.stand }; },
}));

export const siteOf = (a: Area): SiteId | null => (typeof a === 'string' ? null : a.site);

// 개발·점검 스크립트용 (Vite HMR 때문에 import('/src/…') 가 다른 인스턴스를 줄 수 있다)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__useArea = useArea;
