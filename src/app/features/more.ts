import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import type { AddressResult, AppNotification, HomeAlert, MyHome, Page, Payment, Report, ReviewList, ReviewScores, ReviewTargetType, TransferBody, TransferDetail, TransferSummary, Utility } from '../../api/types';
import { useSession } from '../state/session';

const useToken = () => useSession((s) => s.token);
const inval = (qc: ReturnType<typeof useQueryClient>, ...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

// ----- 후기 -----
export const useReviews = (t: ReviewTargetType, id: number) =>
  useQuery({ queryKey: ['reviews', t, id], retry: false, queryFn: ({ signal }) => api<ReviewList>('/reviews', { query: { targetType: t, targetId: id }, signal }) });
export function useAddReview(t: ReviewTargetType, id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { rating: number; scores: ReviewScores; text: string; pin?: [number, number, number] | null; floorplanId?: number | null }) => api('/reviews', { method: 'POST', body: { targetType: t, targetId: id, pin: null, floorplanId: null, ...b } }),
    onSuccess: () => inval(qc, 'reviews'),
  });
}
/** 별점·항목 1~5 정수, 본문 500자 이하 */
export function validateReview(rating: number, scores: Partial<ReviewScores>, text: string): string | null {
  const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
  if (!ok(rating)) return '별점을 골라 주세요';
  if (!(['noise', 'light', 'bugs', 'landlord', 'depositReturn'] as const).every((k) => ok(scores[k]))) return '항목별 점수를 모두 골라 주세요';
  if (text.length > 500) return '후기는 500자까지 쓸 수 있어요';
  return null;
}

// ----- 내 집 기록 -----
/** 내 집 미등록은 404 → data === null 로 돌려준다 */
export const useMyHome = () => {
  const token = useToken();
  return useQuery({
    queryKey: ['home', token], enabled: !!token, retry: false,
    queryFn: async ({ signal }) => { try { return await api<MyHome>('/me/home', { signal }); } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; } },
  });
};
export const useSaveHome = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (b: MyHome) => api<MyHome>('/me/home', { method: 'PUT', body: b }), onSuccess: () => inval(qc, 'home', 'report') }); };
export const usePayments = () => { const token = useToken(); return useQuery({ queryKey: ['payments', token], enabled: !!token, retry: false, queryFn: () => api<Payment[]>('/me/payments') }); };
export const useSavePayment = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (b: Payment) => api('/me/payments', { method: 'POST', body: b }), onSuccess: () => inval(qc, 'payments', 'report') }); };
export const useUtilities = () => { const token = useToken(); return useQuery({ queryKey: ['utilities', token], enabled: !!token, retry: false, queryFn: () => api<Utility[]>('/me/utilities') }); };
export const useSaveUtility = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (b: Utility) => api('/me/utilities', { method: 'POST', body: b }), onSuccess: () => inval(qc, 'report', 'utilities') }); };
export const useReport = (month: string, enabled: boolean) => { const token = useToken(); return useQuery({ queryKey: ['report', month, token], enabled: !!token && enabled, retry: false, queryFn: () => api<Report>('/me/report', { query: { month } }) }); };
export const useAlerts = () => { const token = useToken(); return useQuery({ queryKey: ['alerts', token], enabled: !!token, retry: false, queryFn: () => api<HomeAlert[]>('/me/home/alerts') }); };
export function useAlertActions() {
  const qc = useQueryClient();
  const done = () => inval(qc, 'alerts');
  return {
    add: useMutation({ mutationFn: (daysBefore: number) => api('/me/home/alerts', { method: 'POST', body: { daysBefore, enabled: true } }), onSuccess: done }),
    toggle: useMutation({ mutationFn: (a: HomeAlert) => api(`/me/home/alerts/${a.id}`, { method: 'PATCH', body: { enabled: !a.enabled } }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: number) => api(`/me/home/alerts/${id}`, { method: 'DELETE' }), onSuccess: done }),
  };
}
export const validDaysBefore = (n: number) => Number.isInteger(n) && n >= 1 && n <= 365;

export const ITEM_LABEL: Record<string, string> = { rent: '월세', mgmtFee: '관리비', electricity: '전기', gas: '가스비', water: '수도', internet: '인터넷' };
/** 월 문자열 YYYY-MM */
export const thisMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// ----- 알림함 -----
export const useNotifications = () => { const token = useToken(); return useQuery({ queryKey: ['notifications', token], enabled: !!token, retry: false, refetchInterval: 120_000, queryFn: () => api<AppNotification[]>('/me/notifications') }); };
export const useMarkRead = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: number) => api(`/me/notifications/${id}/read`, { method: 'PATCH' }), onSuccess: () => inval(qc, 'notifications') }); };

// ----- 양도 -----
export const useTransfers = () => useQuery({ queryKey: ['transfers'], retry: false, staleTime: 60_000, queryFn: ({ signal }) => api<Page<TransferSummary>>('/transfers', { query: { size: 100 }, signal }) });
export const useTransfer = (id: number | null) => useQuery({ queryKey: ['transfer', id], enabled: id != null, queryFn: ({ signal }) => api<TransferDetail>(`/transfers/${id}`, { signal }) });
export function useTransferActions() {
  const qc = useQueryClient();
  const done = () => inval(qc, 'transfers', 'transfer');
  return {
    create: useMutation({ mutationFn: (b: TransferBody) => api<TransferDetail>('/transfers', { method: 'POST', body: b }), onSuccess: done }),
    update: useMutation({ mutationFn: ({ id, body }: { id: number; body: TransferBody }) => api<TransferDetail>(`/transfers/${id}`, { method: 'PUT', body }), onSuccess: done }),
    finish: useMutation({ mutationFn: (id: number) => api(`/transfers/${id}/status`, { method: 'PATCH', body: { status: 'DONE' } }), onSuccess: done }),
  };
}
export const useAddressSearch = (q: string) => useQuery({ queryKey: ['address', q], enabled: q.trim().length >= 2, retry: false, queryFn: ({ signal }) => api<AddressResult[]>('/geo/address', { query: { q: q.trim() }, signal }) });
export async function uploadPhoto(file: File): Promise<string> {
  const token = useSession.getState().token;
  const fd = new FormData(); fd.append('file', file);
  const base = ((import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8080').replace(/\/$/, '');
  const res = await fetch(`${base}/api/v1/uploads`, { method: 'POST', body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError('UPLOAD_FAILED', '사진을 올리지 못했어요.', res.status);
  return ((await res.json()) as { url: string }).url;
}

/** 금액 입력(만원 문자열) → 원, 빈칸·잘못된 값은 null */
export const manToWon = (s: string): number | null => { const n = Number(s); return s.trim() === '' || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 10000); };
