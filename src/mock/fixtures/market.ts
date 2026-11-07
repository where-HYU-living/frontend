import type { MarketSample } from '../pricing';

/** 동별 ㎡당 환산 월세 중앙값(원)과 표본 수. 표본 5건 미만이면 판정 보류. */
export const DONG_MARKET: Record<string, { perM2: number; count: number; adjacent?: string[] }> = {
  행당동: { perM2: 30500, count: 23 },
  사근동: { perM2: 31500, count: 17 },
  마장동: { perM2: 28500, count: 12 },
  성수동: { perM2: 34000, count: 31 },
  도선동: { perM2: 29500, count: 9, adjacent: ['행당동'] },
  송정동: { perM2: 30000, count: 2 },
};

export const FALLBACK_PER_M2 = 30000;

export function marketFor(dong: string, areaM2: number): MarketSample | null {
  const m = DONG_MARKET[dong];
  if (!m || m.count < 5) return null;
  return {
    fairRent: Math.round((m.perM2 * areaM2) / 1000) * 1000,
    sample: {
      count: m.count,
      scope: m.adjacent ? 'ADJACENT' : 'DONG',
      dongs: [dong, ...(m.adjacent ?? [])],
      areaMinM2: Math.round(areaM2 * 0.7 * 10) / 10,
      areaMaxM2: Math.round(areaM2 * 1.3 * 10) / 10,
      from: '2025-11',
      to: '2026-10',
    },
  };
}
