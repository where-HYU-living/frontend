import { create } from 'zustand';

/** 지도 모드에서 검색·찜 등으로 고른 지점. KakaoMap 이 이동·줌·마커·정보 카드를 띄운다 (3D 로 가지 않음) */
export type MapTarget = { name: string; address: string | null; lat: number; lng: number; /** SearchType·'PLACE'·'SITE' 등 */ kind: string | null };

type MapFocusState = {
  target: MapTarget | null;
  /** 같은 지점을 다시 골라도 effect 가 돌도록 */
  seq: number;
  focus: (t: MapTarget) => void;
  clear: () => void;
};

export const useMapFocus = create<MapFocusState>((set) => ({
  target: null,
  seq: 0,
  focus: (target) => set((s) => ({ target, seq: s.seq + 1 })),
  clear: () => set({ target: null }),
}));
