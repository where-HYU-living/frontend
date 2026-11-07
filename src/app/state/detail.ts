import { create } from 'zustand';

/**
 * 단지·양도 패널에서 열려 있는 상세. 패널 안의 useState 가 아니라 여기 두는 이유: 찜 목록에서 항목을 누르면
 * 그 탭으로 넘어가면서 상세까지 바로 열어야 하기 때문이다 (자취방은 useListingsUi 가 같은 역할).
 */
export const useDetailSel = create<{ housing: number | null; transfer: number | null; setHousing: (id: number | null) => void; setTransfer: (id: number | null) => void }>((set) => ({
  housing: null,
  transfer: null,
  setHousing: (housing) => set({ housing }),
  setTransfer: (transfer) => set({ transfer }),
}));
