import { expect, test } from 'vitest';
import { buildPriceCheck, convertedRent, excessRateOf, gradeOf } from './pricing';

test('환산 월세 = 월세 + 관리비 + 보증금×0.046÷12', () => {
  expect(convertedRent(550000, 80000, 10000000)).toBe(668333);
  expect(convertedRent(500000, null, 0)).toBe(500000);
});

test('등급 경계 0.10 / 0.25 / 0.50 은 아래 등급에 포함', () => {
  expect(gradeOf(null)).toBe('PENDING');
  expect(gradeOf(-0.2)).toBe('FAIR');
  expect(gradeOf(0.1)).toBe('FAIR');
  expect(gradeOf(0.101)).toBe('SLIGHTLY_HIGH');
  expect(gradeOf(0.25)).toBe('SLIGHTLY_HIGH');
  expect(gradeOf(0.251)).toBe('HIGH');
  expect(gradeOf(0.5)).toBe('HIGH');
  expect(gradeOf(0.501)).toBe('CULPRIT');
  expect(gradeOf(0.1004)).toBe('FAIR'); // 셋째 자리 반올림 후 판정
});

test('초과율은 셋째 자리 반올림', () => {
  expect(excessRateOf(712000, 548000)).toBe(0.299);
});

test('판정 보류는 공정가·초과액이 null', () => {
  const pc = buildPriceCheck({ rent: 500000, mgmtFee: 50000, deposit: 1000000, contractMonths: 24, market: null });
  expect(pc.grade).toBe('PENDING');
  expect(pc.fairRent).toBeNull();
  expect(pc.totalExcess).toBeNull();
  expect(pc.sample.scope).toBe('NONE');
});

test('예산 초과분 계산', () => {
  const pc = buildPriceCheck({
    rent: 600000, mgmtFee: 100000, deposit: 10000000, contractMonths: 24,
    market: { fairRent: 548000, sample: { count: 23, scope: 'DONG', dongs: ['행당동'], areaMinM2: 12.6, areaMaxM2: 23.4, from: '2025-11', to: '2026-10' } },
    budget: { rentCap: 600000, depositCap: 5000000, },
  });
  expect(pc.convertedRent).toBe(738333);
  expect(pc.budget).toEqual({ rentCap: 600000, depositCap: 5000000, overRent: 138333, overDeposit: 5000000 });
  expect(pc.totalExcess).toBe((738333 - 548000) * 24);
});
