import { expect, test } from 'vitest';
import { budgetLine, caseNumber, compareLine, evidenceLine, excessLine, excessRateLabel, gaugeRatios, isWanted } from './dossierLogic';

test('caseNumber pads', () => { expect(caseNumber(7)).toBe('사건 No. 0007'); expect(caseNumber(12345)).toBe('사건 No. 12345'); });

test('gauge: over / under / missing', () => {
  const g = gaugeRatios(1500000, 1000000)!;
  expect(g.over).toBe(true);
  expect(g.rentPct).toBeCloseTo(90.9, 1);
  expect(g.fairPct).toBeCloseTo(60.6, 1);
  expect(g.excessPct).toBeCloseTo(30.3, 1);
  const u = gaugeRatios(800000, 1000000)!;
  expect(u.over).toBe(false); expect(u.excessPct).toBe(0); expect(u.fairPct).toBeGreaterThan(u.rentPct);
  expect(gaugeRatios(800000, null)).toBeNull();
  expect(gaugeRatios(0, 1000)).toBeNull();
});

test('excess labels', () => {
  expect(excessRateLabel(0.62)).toBe('+62%'); expect(excessRateLabel(-0.1)).toBe('-10%'); expect(excessRateLabel(null)).toBe('-');
  expect(excessLine(250000, 6000000)).toBe('월 25만 초과 · 2년 600만');
  expect(excessLine(250000, 2000000, 8)).toContain('8개월');
  expect(excessLine(-1, -1)).toBe('적정가 이하예요');
  expect(excessLine(null, null)).toBeNull();
});

test('budget line', () => {
  expect(budgetLine(null)).toBeNull();
  expect(budgetLine({ rentCap: 600000, depositCap: null, overRent: 100000, overDeposit: null })).toEqual({ text: '월세 예산보다 10만 초과', over: true });
  expect(budgetLine({ rentCap: 600000, depositCap: 1, overRent: 0, overDeposit: 0 })).toEqual({ text: '월세 예산 안 · 보증금 예산 안', over: false });
  expect(budgetLine({ rentCap: null, depositCap: null, overRent: null, overDeposit: null })).toBeNull();
});

test('evidence line', () => {
  expect(evidenceLine(undefined)).toBeNull();
  expect(evidenceLine({ count: 0, scope: 'NONE', dongs: [], areaMinM2: null, areaMaxM2: null, from: null, to: null })).toBeNull();
  expect(evidenceLine({ count: 14, scope: 'ADJACENT', dongs: ['행당동', '사근동'], areaMinM2: 13, areaMaxM2: 24, from: '2025-11-01', to: '2026-10-30' }))
    .toBe('행당동·사근동 실거래 14건 · 인접 동 포함 · 13~24㎡ · 2025-11~2026-10');
});

test('compare line follows contract sign', () => {
  expect(compareLine({ name: '청아진', twoYearDiff: 5376000 })).toEqual({ text: '청아진, 2년 537.6만 덜 들어요', phrase: '2년 537.6만 덜 들어요', cheaper: true });
  expect(compareLine({ name: '기숙사', twoYearDiff: -1200000 }).cheaper).toBe(false);
  expect(compareLine({ name: 'x', twoYearDiff: 0 }).cheaper).toBeNull();
});

test('wanted only for CULPRIT', () => { expect(isWanted('CULPRIT')).toBe(true); expect(isWanted('HIGH')).toBe(false); expect(isWanted(undefined)).toBe(false); });
