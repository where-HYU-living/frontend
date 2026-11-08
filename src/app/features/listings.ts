import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDebounced } from './search';
import { create } from 'zustand';
import { api, type Query } from '../../api/client';
import type { Alternative, Grade, RoomType, ListingDetail, ListingSummary, Page, PriceCheck } from '../../api/types';

export type Filters = { maxRentMan: string; maxDepositMan: string; maxMgmtMan: string; grades: Grade[]; maxWalkMin: string; roomType: RoomType | '' };
export const NO_FILTERS: Filters = { maxRentMan: '', maxDepositMan: '', maxMgmtMan: '', grades: [], maxWalkMin: '', roomType: '' };

const num = (s: string) => { const n = Number(s); return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null; };

/** 화면은 만원, 서버는 원. 빈 값은 생략 */
export function buildListingParams(f: Filters): Query {
  const rent = num(f.maxRentMan), dep = num(f.maxDepositMan), mgmt = num(f.maxMgmtMan ?? '');
  const walk = num(f.maxWalkMin);
  return { maxRent: rent == null ? undefined : rent * 10000, maxDeposit: dep == null ? undefined : dep * 10000, maxMgmtFee: mgmt == null ? undefined : Math.round(mgmt * 10000), grade: f.grades, maxWalkMin: walk == null || walk === 0 ? undefined : walk, roomType: f.roomType || undefined, size: 100 };
}

type ListingsUi = {
  filters: Filters;
  setFilters: (f: Filters) => void;
  selectedId: number | null;
  select: (id: number | null) => void;
};
export const useListingsUi = create<ListingsUi>((set) => ({
  filters: NO_FILTERS,
  setFilters: (filters) => set({ filters }),
  selectedId: null,
  select: (selectedId) => set({ selectedId }),
}));

/**
 * 필터 칸에 한 글자씩 칠 때마다 요청하지 않게 잠깐 기다렸다가(250ms) 받고, 새 결과가 올 때까지는 앞 결과를 그대로 보여 준다
 * (목록이 '불러오는 중'으로 비었다가 다시 차거나 3D 말풍선이 지워졌다 다시 생기는 깜빡임을 막는다)
 */
export const useListings = (f: Filters) => {
  const d = useDebounced(f, 250);
  return useQuery({ queryKey: ['listings', d], queryFn: ({ signal }) => api<Page<ListingSummary>>('/listings', { query: buildListingParams(d), signal }), staleTime: 60_000, placeholderData: keepPreviousData });
};

export const useListingDetail = (id: number | null) =>
  useQuery({ queryKey: ['listing', id], enabled: id != null, queryFn: ({ signal }) => api<ListingDetail>(`/listings/${id}`, { signal }) });

export const usePriceCheck = (id: number | null) =>
  useQuery({ queryKey: ['price-check', id], enabled: id != null, queryFn: ({ signal }) => api<PriceCheck>(`/listings/${id}/price-check`, { signal }) });

/** 서버에 아직 없을 수 있어 실패해도 화면은 그대로 둔다 */
export const useAlternatives = (id: number | null) =>
  useQuery({
    queryKey: ['alternatives', id], enabled: id != null, retry: false,
    queryFn: ({ signal }) => api<{ housing: Alternative[]; dorms: Alternative[] }>(`/listings/${id}/alternatives`, { signal }),
  });

/** D8: 같은 예산에서 더 싼 매물. 환산 월세가 더 낮은 것 중 가장 싼 n개 (판정 보류·자기 자신 제외) */
export function cheaperListings(all: ListingSummary[], current: { id: number; convertedRent: number }, n = 3): ListingSummary[] {
  return all
    .filter((l) => l.id !== current.id && l.grade !== 'PENDING' && l.convertedRent < current.convertedRent)
    .sort((a, b) => a.convertedRent - b.convertedRent)
    .slice(0, n);
}
