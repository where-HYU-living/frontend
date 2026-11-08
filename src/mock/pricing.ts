import type { Grade, PriceCheck } from '../api/types';
import { CONVERSION_RATE } from '../app/forms/calc';

/** 계약 2-1장 등급 경계 */
export const GRADE_BOUNDS = { fair: 0.1, slight: 0.25, high: 0.5 } as const;
export { CONVERSION_RATE };

/** 환산 월세 = 월세 + 관리비 + 보증금 × 환산율 ÷ 12 (원, 반올림) */
export function convertedRent(rent: number, mgmtFee: number | null, deposit: number, rate: number = CONVERSION_RATE): number {
  return Math.round(rent + (mgmtFee ?? 0) + (deposit * rate) / 12);
}

/** 셋째 자리 반올림 */
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function excessRateOf(converted: number, fair: number): number {
  return round3((converted - fair) / fair);
}

/** excessRate(null=표본 부족) → 등급. 경계값은 아래쪽 등급에 포함(≤) */
export function gradeOf(excessRate: number | null): Grade {
  if (excessRate == null) return 'PENDING';
  const r = round3(excessRate);
  if (r <= GRADE_BOUNDS.fair) return 'FAIR';
  if (r <= GRADE_BOUNDS.slight) return 'SLIGHTLY_HIGH';
  if (r <= GRADE_BOUNDS.high) return 'HIGH';
  return 'CULPRIT';
}

export type MarketSample = { fairRent: number; sample: Omit<PriceCheck['sample'], never> };

export function buildPriceCheck(input: {
  rent: number;
  mgmtFee: number | null;
  deposit: number;
  contractMonths: number;
  market: MarketSample | null;
  budget?: { rentCap: number | null; depositCap: number | null } | null;
}): PriceCheck {
  const converted = convertedRent(input.rent, input.mgmtFee, input.deposit);
  const b = input.budget ?? null;
  const budget: PriceCheck['budget'] = b
    ? {
        rentCap: b.rentCap,
        depositCap: b.depositCap,
        overRent: b.rentCap == null ? null : Math.max(0, converted - b.rentCap),
        overDeposit: b.depositCap == null ? null : Math.max(0, input.deposit - b.depositCap),
      }
    : null;
  if (!input.market) {
    return {
      convertedRent: converted, fairRent: null, monthlyExcess: null, contractMonths: input.contractMonths, totalExcess: null, excessRate: null,
      grade: 'PENDING', conversionRate: CONVERSION_RATE,
      sample: { count: 0, scope: 'NONE', dongs: [], areaMinM2: null, areaMaxM2: null, from: null, to: null }, budget,
    };
  }
  const { fairRent, sample } = input.market;
  const monthlyExcess = converted - fairRent;
  const excessRate = excessRateOf(converted, fairRent);
  return {
    convertedRent: converted, fairRent, monthlyExcess, contractMonths: input.contractMonths, totalExcess: monthlyExcess * input.contractMonths,
    excessRate, grade: gradeOf(excessRate), conversionRate: CONVERSION_RATE, sample, budget,
  };
}
