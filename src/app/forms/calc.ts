/** 폼 계산 순수 함수 (화면과 분리해 테스트) */

/** 서버 판정과 같은 전월세전환율 (backend `pricing.conversion-rate`, price-check 응답 conversionRate) */
export const CONVERSION_RATE = 0.046;
export const CONVERSION_NOTE = '월세 + 관리비 + 보증금 × 4.6% ÷ 12';

/** 환산 월세(원) = 월세 + 관리비 + 보증금 × 전환율 ÷ 12. 월세·보증금 중 하나라도 없으면 null, 관리비는 없으면 0 */
export function convertedRentWon(depositWon: number | null, rentWon: number | null, mgmtWon: number | null): number | null {
  if (depositWon == null || rentWon == null) return null;
  return Math.round(rentWon + (mgmtWon ?? 0) + (depositWon * CONVERSION_RATE) / 12);
}

/** 원 → "62.5만원" 같은 즉석 요약용 문구 */
export function wonToManText(won: number): string {
  const m = Math.round(won / 1000) / 10;
  return `${m.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만원`;
}

/** 칸 이름과 비어 있는지 → 제출 버튼 옆에 보여줄 "~가 비었어요" 한 줄. 다 채워졌으면 null */
export function missingReason(items: { label: string; ok: boolean }[]): string | null {
  const miss = items.filter((i) => !i.ok).map((i) => i.label);
  if (miss.length === 0) return null;
  const shown = miss.slice(0, 3).join(', ');
  return miss.length > 3 ? `${shown} 외 ${miss.length - 3}개가 비었어요` : `${shown} 입력이 필요해요`;
}

/** 양수 숫자 문자열인가 (빈 문자열·0·음수·NaN 은 false) */
export const isPositive = (s: string): boolean => s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) > 0;
/** 0 이상 숫자 문자열인가 */
export const isNonNegative = (s: string): boolean => s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) >= 0;
/** 양의 정수 문자열인가 */
export const isPositiveInt = (s: string): boolean => isPositive(s) && Number.isInteger(Number(s));

/** 숫자 칸 입력 정리: 숫자만(decimal 이면 소수점 하나까지). 붙여넣은 '1,000' '55만' 같은 것도 숫자만 남긴다 */
export function cleanNumber(s: string, decimal = false): string {
  if (!decimal) return s.replace(/[^\d]/g, '');
  const t = s.replace(/[^\d.]/g, ''), i = t.indexOf('.');
  return i < 0 ? t : t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '');
}

/** 만원 단위 숫자 문자열 → '1억 2,000만 원' 처럼 읽기 쉽게 (큰 보증금을 0 하나 틀리게 적는 일을 막는다). 비었거나 숫자가 아니면 null */
export function manReadable(s: string): string | null {
  const n = Number(s);
  if (s.trim() === '' || !Number.isFinite(n) || n <= 0) return null;
  const eok = Math.floor(n / 10000), rest = Math.round((n - eok * 10000) * 10) / 10;
  const r = rest ? `${rest.toLocaleString('ko-KR')}만` : '';
  return eok ? `${eok}억${r ? ` ${r}` : ''} 원` : `${r} 원`;
}
