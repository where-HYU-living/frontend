import { expect, test } from 'vitest';
import { depositRent, manwon } from './money';
import { GRADE_META } from './grade';

test('manwon formats won as 만원, null as dash', () => {
  expect(manwon(550000)).toBe('55만');
  expect(manwon(555000)).toBe('55.5만');
  expect(manwon(10000000)).toBe('1,000만');
  expect(manwon(null)).toBe('-');
  expect(manwon(NaN)).toBe('-');
});

test('depositRent shows 보증금/월세 in 만원', () => {
  expect(depositRent(10000000, 550000)).toBe('1,000/55');
});

test('verdict text follows the contract', () => {
  expect(GRADE_META.CULPRIT.verdict(3936000)).toBe('찾았다. 2년간 393.6만 원을 써버릴 놈');
  expect(GRADE_META.CULPRIT.verdict(1000000, 8)).toBe('찾았다. 8개월간 100만 원을 써버릴 놈');
  expect(GRADE_META.PENDING.verdict(null)).toBe('비교할 거래가 부족해요');
  expect(GRADE_META.HIGH.color).toBe('#F2994A');
});
