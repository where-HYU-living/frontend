import { describe, expect, it } from 'vitest';
import { convertedRentWon, isPositive, isPositiveInt, missingReason, wonToManText } from './calc';

describe('convertedRentWon', () => {
  it('월세 + 관리비 + 보증금×0.06÷12', () => {
    // 보증금 1000만, 월세 50만, 관리비 5만 → 50 + 5 + 5 = 60만
    expect(convertedRentWon(10_000_000, 500_000, 50_000)).toBe(600_000);
  });
  it('관리비가 없으면 0 으로 계산', () => {
    expect(convertedRentWon(10_000_000, 500_000, null)).toBe(550_000);
  });
  it('보증금·월세가 없으면 null', () => {
    expect(convertedRentWon(null, 500_000, 0)).toBeNull();
    expect(convertedRentWon(1, null, 0)).toBeNull();
  });
});

describe('문구·검증', () => {
  it('wonToManText', () => { expect(wonToManText(625_000)).toBe('62.5만원'); });
  it('missingReason', () => {
    expect(missingReason([{ label: '주소', ok: true }])).toBeNull();
    expect(missingReason([{ label: '주소', ok: false }, { label: '월세', ok: false }])).toBe('주소, 월세 입력이 필요해요');
    expect(missingReason(['a', 'b', 'c', 'd', 'e'].map((label) => ({ label, ok: false })))).toBe('a, b, c 외 2개가 비었어요');
  });
  it('숫자 검사', () => {
    expect(isPositive('')).toBe(false); expect(isPositive('0')).toBe(false); expect(isPositive('18.5')).toBe(true);
    expect(isPositiveInt('8')).toBe(true); expect(isPositiveInt('8.5')).toBe(false);
  });
});
