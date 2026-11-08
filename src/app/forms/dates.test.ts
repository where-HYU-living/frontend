import { expect, test } from 'vitest';
import { addDays, addMonths, daysBetween, formatYm, formatYmd, parseYmd, shiftMonth } from './dates';
import { cleanNumber, manReadable } from './calc';

test('날짜 계산: 달 끝·윤년·연 넘김', () => {
  expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  expect(addMonths('2026-01-12', 24)).toBe('2028-01-12');
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  expect(daysBetween('2026-01-12', '2028-01-12')).toBe(730);
  expect(parseYmd('2026-02-30')).toBeNull();
  expect(formatYmd('2026-01-12')).toBe('2026년 1월 12일 (월)');
  expect(formatYm('2026-11')).toBe('2026년 11월');
});

test('숫자 칸 정리와 만원 읽기', () => {
  expect(cleanNumber('1,000만')).toBe('1000');
  expect(cleanNumber('8.5.3', true)).toBe('8.53');
  expect(cleanNumber('8.5', false)).toBe('85');
  expect(manReadable('12000')).toBe('1억 2,000만 원');
  expect(manReadable('10000')).toBe('1억 원');
  expect(manReadable('550')).toBe('550만 원');
  expect(manReadable('')).toBeNull();
});
