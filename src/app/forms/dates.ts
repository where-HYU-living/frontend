/** 날짜는 'YYYY-MM-DD', 달은 'YYYY-MM' 문자열로만 다룬다 (시간대 때문에 하루 밀리는 일이 없게 Date 는 로컬 연·월·일로만 쓴다) */
const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`; // m: 1~12
export const ym = (y: number, m: number) => `${y}-${pad(m)}`;
export const todayYmd = (d = new Date()) => ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());

export function parseYmd(s: string | null | undefined): { y: number; m: number; d: number } | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!r) return null;
  const y = +r[1], m = +r[2], d = +r[3];
  if (m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return { y, m, d };
}
export const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
/** 그 달 1일의 요일 (0=일) */
export const firstWeekday = (y: number, m: number) => new Date(y, m - 1, 1).getDay();

/** 날짜 더하기 (일). 달 끝을 넘으면 다음 달로 */
export function addDays(s: string, n: number): string {
  const p = parseYmd(s)!; const d = new Date(p.y, p.m - 1, p.d + n);
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
/** 달 더하기. 31일 + 1달처럼 없는 날은 그 달 마지막 날로 */
export function addMonths(s: string, n: number): string {
  const p = parseYmd(s)!; const t = p.y * 12 + (p.m - 1) + n, y = Math.floor(t / 12), m = (t % 12) + 1;
  return ymd(y, m, Math.min(p.d, daysIn(y, m)));
}
export function shiftMonth(s: string, n: number): string { // 'YYYY-MM'
  const [y, m] = s.split('-').map(Number); const t = y * 12 + (m - 1) + n;
  return ym(Math.floor(t / 12), (t % 12) + 1);
}

const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const WEEKDAYS = WD;
/** 2026-01-12 → '2026년 1월 12일 (월)' */
export function formatYmd(s: string): string {
  const p = parseYmd(s); if (!p) return s;
  return `${p.y}년 ${p.m}월 ${p.d}일 (${WD[new Date(p.y, p.m - 1, p.d).getDay()]})`;
}
/** 2026-11 → '2026년 11월' */
export const formatYm = (s: string) => { const [y, m] = s.split('-').map(Number); return `${y}년 ${m}월`; };

/** 두 날짜 사이 일수 (b - a) */
export function daysBetween(a: string, b: string): number {
  const p = parseYmd(a)!, q = parseYmd(b)!;
  return Math.round((Date.UTC(q.y, q.m - 1, q.d) - Date.UTC(p.y, p.m - 1, p.d)) / 86_400_000);
}
