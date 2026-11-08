import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import bundledDepartments from '../data/departments.json';
import campusPlaces from '../data/campusPlaces.json';
import type { Nearby, CampusBuilding, Announcement, AnnouncementStatus, Department, Dorm, EventType, FavoriteItem, FloorPlan, Housing, HousingDetail, Profile } from '../../api/types';
import { useSession } from '../state/session';

const get = <T,>(path: string, query?: Record<string, string | number | undefined>) => ({ signal }: { signal: AbortSignal }) => api<T>(path, { query, signal });

export const useDorms = () => useQuery({ queryKey: ['dorms'], queryFn: get<Dorm[]>('/dorms'), staleTime: 300_000 });
export const useHousingList = () => useQuery({ queryKey: ['housing'], queryFn: get<Housing[]>('/housing'), staleTime: 60_000 });
export const useHousingDetail = (id: number | null) => useQuery({ queryKey: ['housing', id], enabled: id != null, queryFn: get<HousingDetail>(`/housing/${id}`) });
export const useAnnouncements = (status?: AnnouncementStatus) => useQuery({ queryKey: ['announcements', status], queryFn: get<Announcement[]>('/housing/announcements', { status }) });
export const useFloorPlan = (id: number | null) => useQuery({ queryKey: ['floorplan', id], enabled: id != null, staleTime: Infinity, queryFn: get<FloorPlan>(`/floorplans/${id}`) });
/** 서버 목록을 쓰되, 서버가 없거나 비어 있으면 앱에 들어 있는 한양대 서울캠퍼스 목록(src/app/data/departments.json)으로 대신한다 */
export const useDepartments = () => useQuery({
  queryKey: ['departments'], staleTime: Infinity, retry: false,
  queryFn: async ({ signal }): Promise<Department[]> => {
    try {
      const list = await api<Department[]>('/departments', { signal });
      return list.length ? list : (bundledDepartments as Department[]);
    } catch { return bundledDepartments as Department[]; }
  },
});
/** 건물 id → 이름 (서버 /buildings, 없으면 앱에 들어 있는 건물 목록) */
export const useBuildingNames = () => {
  const q = useCampusBuildings();
  const names = new Map<number, string>(campusPlaces.map((p) => [p.id, p.name]));
  for (const b of q.data ?? []) names.set(b.id, b.name);
  return names;
};
export const useCampusBuildings = () => useQuery({ queryKey: ['buildings'], queryFn: get<CampusBuilding[]>('/buildings'), staleTime: Infinity, retry: false });
/** F5: 집 주변 300m 시설. 서버에 없거나 실패하면 빈 목록 취급 */
export const useNearby = (listingId: number | null) => useQuery({ queryKey: ['nearby', listingId], enabled: listingId != null, retry: false, staleTime: 300_000, queryFn: get<Nearby[]>(`/listings/${listingId}/nearby`, { radius: 300 }) });
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

const pad2 = (n: number) => String(n).padStart(2, '0');
export const ymOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
export const ymdOf = (d: Date) => `${ymOf(d)}-${pad2(d.getDate())}`;

/** YYYY-MM 에 n달 더하기 */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  return ymOf(new Date(y, m - 1 + n, 1));
}

/** 달력 칸: 일요일 시작, 앞뒤 빈칸은 null, 7의 배수 길이 */
export function monthCells(ym: string): (string | null)[] {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = Array(first).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${pad2(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** 처음 보여줄 달: 이번 달에 일정이 있으면 이번 달, 없으면 다가오는 첫 달, 그것도 없으면 가장 최근 달 */
export function initialMonth(months: string[], today: Date = new Date()): string {
  const now = ymOf(today);
  const sorted = [...months].sort();
  return sorted.includes(now) ? now : sorted.find((m) => m > now) ?? sorted[sorted.length - 1] ?? now;
}

/** 오늘 기준 D-day 문구 */
export function dday(date: string, today: Date = new Date()): string {
  const a = new Date(`${date}T00:00:00`), b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d = Math.round((a.getTime() - b.getTime()) / 86400000);
  return d === 0 ? 'D-day' : d > 0 ? `D-${d}` : `D+${-d}`;
}

