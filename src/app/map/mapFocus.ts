import { create } from 'zustand';

/** 지도 모드에서 검색·찜 등으로 고른 지점. KakaoMap 이 이동·줌·마커·정보 카드를 띄운다 (3D 로 가지 않음) */
export type MapTarget = { name: string; address: string | null; lat: number; lng: number; /** SearchType·'PLACE'·'SITE' 등 */ kind: string | null; /** 집 핀이면 그 집 id (3D로 가기 → useVisit) */ id?: number };

type MapFocusState = {
  target: MapTarget | null;
  /** 같은 지점을 다시 골라도 effect 가 돌도록 */
  seq: number;
  /** 지도를 닫았다 다시 열 때 보던 자리 (중심·확대) */
  view: { lat: number; lng: number; level: number } | null;
  /** 지도에서 3D 로 넘어간 뒤 한 번 보여 줄 안내 */
  notice: string | null;
  focus: (t: MapTarget) => void;
  clear: () => void;
};

export const useMapFocus = create<MapFocusState>((set) => ({
  target: null,
  seq: 0,
  view: null,
  notice: null,
  focus: (target) => set((s) => ({ target, seq: s.seq + 1 })),
  clear: () => set({ target: null }),
}));

// 점검 스크립트용 (scripts/map-check.mjs)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__mapFocus = useMapFocus;
