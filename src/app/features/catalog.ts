import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Announcement, AnnouncementStatus, Department, Dorm, EventType, FavoriteItem, FloorPlan, Housing, HousingDetail, Profile } from '../../api/types';
import { useSession } from '../state/session';

const get = <T,>(path: string, query?: Record<string, string | number | undefined>) => ({ signal }: { signal: AbortSignal }) => api<T>(path, { query, signal });

export const useDorms = () => useQuery({ queryKey: ['dorms'], queryFn: get<Dorm[]>('/dorms'), staleTime: 300_000 });
export const useHousingList = () => useQuery({ queryKey: ['housing'], queryFn: get<Housing[]>('/housing'), staleTime: 60_000 });
export const useHousingDetail = (id: number | null) => useQuery({ queryKey: ['housing', id], enabled: id != null, queryFn: get<HousingDetail>(`/housing/${id}`) });
export const useAnnouncements = (status?: AnnouncementStatus) => useQuery({ queryKey: ['announcements', status], queryFn: get<Announcement[]>('/housing/announcements', { status }) });
export const useFloorPlan = (id: number | null) => useQuery({ queryKey: ['floorplan', id], enabled: id != null, staleTime: Infinity, queryFn: get<FloorPlan>(`/floorplans/${id}`) });
export const useDepartments = () => useQuery({ queryKey: ['departments'], queryFn: get<Department[]>('/departments'), staleTime: Infinity });
export const useFavorites = () => {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: ['favorites', !!token], enabled: !!token, queryFn: get<FavoriteItem[]>('/me/favorites') });
};
export const useProfile = () => {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: ['profile', token], enabled: !!token, retry: false, queryFn: get<Profile>('/me/profile') });
};

export function useSubscribe(housingId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => api(`/housing/${housingId}/subscribe`, { method: on ? 'POST' : 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['housing'] }); },
  });
}

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<Profile, 'departmentId' | 'buildingIds' | 'budget'>>) => api<Profile>('/me/profile', { method: 'PUT', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); qc.invalidateQueries({ queryKey: ['listings'] }); },
  });
}

// ----- 순수 함수 (테스트 대상) -----
export const STATUS_LABEL: Record<AnnouncementStatus, string> = { UPCOMING: '예정', OPEN: '접수 중', CLOSED: '마감', ANNOUNCED: '발표 완료', ADDITIONAL: '추가모집' };
export const EVENT_LABEL: Record<EventType, string> = { NOTICE: '모집공고', APPLY_START: '접수 시작', APPLY_END: '접수 마감', DOCS_DUE: '서류 마감', RESULT: '발표', CONTRACT: '계약', MOVE_IN: '입주' };

/** 공고 일정을 월(YYYY-MM)별로 묶고 날짜 오름차순으로 정렬 */
export function groupEventsByMonth(anns: Announcement[], housingName: (id: number) => string = () => ''): Map<string, { date: string; type: EventType; housingName: string; status: AnnouncementStatus }[]> {
  const all = anns.flatMap((a) => a.events.map((e) => ({ date: e.date, type: e.type, housingName: housingName(a.housingId), status: a.status })));
  all.sort((x, y) => x.date.localeCompare(y.date));
  const m = new Map<string, typeof all>();
  for (const e of all) { const k = e.date.slice(0, 7); m.set(k, [...(m.get(k) ?? []), e]); }
  return m;
}

/** 오늘 기준 D-day 문구 */
export function dday(date: string, today: Date = new Date()): string {
  const a = new Date(`${date}T00:00:00`), b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d = Math.round((a.getTime() - b.getTime()) / 86400000);
  return d === 0 ? 'D-day' : d > 0 ? `D-${d}` : `D+${-d}`;
}
