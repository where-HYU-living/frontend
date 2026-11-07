import { create } from 'zustand';

export type Tab = 'home' | 'tour' | 'dorm' | 'housing' | 'transfer' | 'myhome' | 'fav' | 'inbox';

export const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: '집 찾기' },
  { id: 'tour', label: '캠퍼스 투어' },
  { id: 'dorm', label: '기숙사' },
  { id: 'housing', label: '청년안심주택' },
  { id: 'transfer', label: '양도' },
  { id: 'myhome', label: '내 집 기록' },
];

type UiState = {
  tab: Tab;
  /** '3d' = 걸어다니는 화면, '2d' = 카카오 지도 */
  mapMode: '3d' | '2d';
  setMapMode: (m: '3d' | '2d') => void;
  panelOpen: boolean;
  /** 탭을 누르면 그 탭 패널을 연다. 이미 열린 같은 탭을 다시 누르면 접는다 */
  selectTab: (tab: Tab) => void;
  setPanelOpen: (open: boolean) => void;
  /** 실내 3D 보는 중이면 평면도 id. 나가면 null (동네 3D 는 그 자리 그대로 남아 있다) */
  /** 시간대 슬라이더 위치: 0 = 낮(왼쪽) ~ 1 = 밤(오른쪽) */
  timeOfDay: number;
  setTimeOfDay: (t: number) => void;
  /** 3D·지도에 청년안심주택 단지를 보일지 (C3 '청년안심주택 여부' 필터) */
  showHousing: boolean;
  setShowHousing: (v: boolean) => void;
  profileOpen: boolean;
  /** start: 들어가서 설 자리(초대받은 경우 초대한 사람이 있던 자리). invited: 초대 링크로 들어옴 */
  indoor: { floorplanId: number; title: string; start?: { x: number; z: number; yaw: number }; invited?: boolean } | null;
  enterIndoor: (floorplanId: number, title: string, opts?: { start?: { x: number; z: number; yaw: number }; invited?: boolean }) => void;
  exitIndoor: () => void;
};

export const useUi = create<UiState>((set, get) => ({
  tab: 'home',
  panelOpen: false,
  mapMode: '3d',
  setMapMode: (mapMode) => set({ mapMode }),
  selectTab: (tab) => {
    const s = get();
    set(s.panelOpen && s.tab === tab ? { panelOpen: false } : { tab, panelOpen: true });
  },
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  timeOfDay: 0,
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  showHousing: true,
  setShowHousing: (showHousing) => set({ showHousing }),
  profileOpen: false,
  indoor: null,
  enterIndoor: (floorplanId, title, opts) => set({ indoor: { floorplanId, title, ...opts } }),
  exitIndoor: () => set({ indoor: null }),
}));
