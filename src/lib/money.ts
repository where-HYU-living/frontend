/** 원 → "55만", "55.5만", "1,000만". null 은 "-" (0으로 바꾸지 않는다) */
export function manwon(won: number | null | undefined): string {
  if (won == null || Number.isNaN(won)) return '-';
  const m = Math.round(won / 1000) / 10; // 소수 첫째 자리까지
  return `${m.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만`;
}

/** 말풍선용 "보증금/월세" (만원 단위, 소수 없이) */
export function depositRent(deposit: number, rent: number): string {
  const m = (w: number) => Math.round(w / 10000).toLocaleString('ko-KR');
  return `${m(deposit)}/${m(rent)}`;
}
