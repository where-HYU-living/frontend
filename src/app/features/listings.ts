import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { api, type Query } from '../../api/client';
import type { Alternative, Grade, ListingDetail, ListingSummary, Page, PriceCheck } from '../../api/types';

export type Filters = { maxRentMan: string; maxDepositMan: string; grades: Grade[] };
export const NO_FILTERS: Filters = { maxRentMan: '', maxDepositMan: '', grades: [] };

const num = (s: string) => { const n = Number(s); return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null; };

/** 화면은 만원, 서버는 원. 빈 값은 생략 */
export function buildListingParams(f: Filters): Query {
  const rent = num(f.maxRentMan), dep = num(f.maxDepositMan);
  return { maxRent: rent == null ? undefined : rent * 10000, maxDeposit: dep == null ? undefined : dep * 10000, grade: f.grades, size: 100 };
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

export const useListings = (f: Filters) =>
  useQuery({ queryKey: ['listings', f], queryFn: ({ signal }) => api<Page<ListingSummary>>('/listings', { query: buildListingParams(f), signal }), staleTime: 60_000 });

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
