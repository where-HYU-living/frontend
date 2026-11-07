import { create } from 'zustand';

export type Tab = 'home' | 'dorm' | 'housing' | 'transfer' | 'myhome';

export const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: '집 찾기' },
  { id: 'dorm', label: '기숙사' },
  { id: 'housing', label: '청년안심주택' },
  { id: 'transfer', label: '양도' },
  { id: 'myhome', label: '내 집 기록' },
];

type UiState = {
  tab: Tab;
  panelOpen: boolean;
  /** 탭을 누르면 그 탭 패널을 연다. 이미 열린 같은 탭을 다시 누르면 접는다 */
  selectTab: (tab: Tab) => void;
  setPanelOpen: (open: boolean) => void;
};

export const useUi = create<UiState>((set, get) => ({
  tab: 'home',
  panelOpen: false,
  selectTab: (tab) => {
    const s = get();
    set(s.panelOpen && s.tab === tab ? { panelOpen: false } : { tab, panelOpen: true });
  },
  setPanelOpen: (panelOpen) => set({ panelOpen }),
}));
