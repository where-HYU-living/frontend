import { expect, test } from 'vitest';
import { dday, groupEventsByMonth } from './catalog';
import type { Announcement } from '../../api/types';

test('groups events by month sorted ascending', () => {
  const anns: Announcement[] = [{ id: 1, housingId: 1, title: 't', status: 'OPEN', events: [{ type: 'APPLY_END', date: '2026-11-20' }, { type: 'NOTICE', date: '2026-11-05' }, { type: 'RESULT', date: '2026-12-01' }] }];
  const g = groupEventsByMonth(anns, () => '청아진');
  expect([...g.keys()]).toEqual(['2026-11', '2026-12']);
  expect(g.get('2026-11')!.map((e) => e.date)).toEqual(['2026-11-05', '2026-11-20']);
  expect(g.get('2026-11')![0].housingName).toBe('청아진');
});

test('dday counts days from today', () => {
  const today = new Date(2026, 10, 7);
  expect(dday('2026-11-07', today)).toBe('D-day');
  expect(dday('2026-11-10', today)).toBe('D-3');
  expect(dday('2026-11-05', today)).toBe('D+2');
});
