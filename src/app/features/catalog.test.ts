import { expect, test } from 'vitest';
import { addMonths, dday, groupEventsByMonth, initialMonth, monthCells } from './catalog';
import type { Announcement } from '../../api/types';

test('groups events by month sorted ascending', () => {
  const anns: Announcement[] = [{ id: 1, housingId: 1, title: 't', status: 'OPEN', events: [{ type: 'APPLY_END', date: '2026-11-20' }, { type: 'NOTICE', date: '2026-11-05' }, { type: 'RESULT', date: '2026-12-01' }] }];
  const g = groupEventsByMonth(anns, () => '청아진');
  expect([...g.keys()]).toEqual(['2026-11', '2026-12']);
  expect(g.get('2026-11')!.map((e) => e.date)).toEqual(['2026-11-05', '2026-11-20']);
  expect(g.get('2026-11')![0].housingName).toBe('청아진');
});

test('monthCells pads to whole weeks starting Sunday', () => {
  const c = monthCells('2026-11'); // 2026-11-01 은 일요일, 30일
  expect(c[0]).toBe('2026-11-01');
  expect(c.length % 7).toBe(0);
  expect(c.filter(Boolean)).toHaveLength(30);
  const d = monthCells('2026-12'); // 12-01 은 화요일
  expect(d.slice(0, 3)).toEqual([null, null, '2026-12-01']);
  expect(addMonths('2026-12', 1)).toBe('2027-01');
  expect(addMonths('2026-01', -1)).toBe('2025-12');
});

test('initialMonth prefers this month, then next upcoming, then latest', () => {
  const today = new Date(2026, 10, 8);
  expect(initialMonth(['2026-10', '2026-11'], today)).toBe('2026-11');
  expect(initialMonth(['2026-10', '2027-01', '2026-12'], today)).toBe('2026-12');
  expect(initialMonth(['2026-08', '2026-09'], today)).toBe('2026-09');
  expect(initialMonth([], today)).toBe('2026-11');
});

test('dday counts days from today', () => {
  const today = new Date(2026, 10, 7);
  expect(dday('2026-11-07', today)).toBe('D-day');
  expect(dday('2026-11-10', today)).toBe('D-3');
  expect(dday('2026-11-05', today)).toBe('D+2');
});
