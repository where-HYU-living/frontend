import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { buildPriceCheck } from '../../mock/pricing';
import { VerdictCard } from '../VerdictCard';
import { lineupScale, placeLabels } from '../dossier/dossierLogic';

afterEach(cleanup);

const market = { fairRent: 479_000, sample: { count: 45, scope: 'DONG' as const, dongs: ['사근동'], areaMinM2: 7.7, areaMaxM2: 14.3, from: '2025-11', to: '2026-10' } };
const base = { rent: 950_000, mgmtFee: 50_000, deposit: 5_000_000, contractMonths: 24 };

test('결론이 맨 위 한 문장: 적정가보다 월 얼마 비싼지, 2년이면 얼마인지', () => {
  const pc = buildPriceCheck({ ...base, market });
  render(<VerdictCard pc={pc} loggedIn />);
  expect(screen.getByText('적정가보다')).toBeTruthy();
  expect(document.querySelector('.ui-vd-big')!.textContent).toMatch(/^월 .+만 비싸요$/);
  expect(document.querySelector('.ui-vd-sub')!.textContent).toMatch(/2년이면 .+만 원을 더 내요/);
  expect(screen.getByText('실거래 적정가')).toBeTruthy();
  expect(screen.getByRole('figure').getAttribute('aria-label')).toMatch(/이 집 환산 월세 .+, 실거래 적정가 47.9만/);
});

test('AI 적정가가 있으면 두 번째 기준으로 이름·숫자·범위를 보이고 눈금자에 띠로 올린다', () => {
  render(<VerdictCard pc={buildPriceCheck({ ...base, market, aiEstimate: { fairRent: 490_000, low: 450_000, high: 550_000 } })} loggedIn />);
  expect(screen.getByText('AI 적정가')).toBeTruthy();
  expect(screen.getByText('45만~55만 사이로 추정')).toBeTruthy();
  expect(document.querySelector('.ui-lu-ai')).toBeTruthy();
  expect(screen.getByRole('figure').getAttribute('aria-label')).toMatch(/AI 추정 45만~55만/);
});

test('AI 적정가가 없으면 그 줄과 띠를 숨긴다', () => {
  render(<VerdictCard pc={buildPriceCheck({ ...base, market })} loggedIn />);
  expect(screen.queryByText('AI 적정가')).toBeNull();
  expect(document.querySelector('.ui-lu-ai')).toBeNull();
});

test('판정 보류여도 AI 적정가는 문장과 눈금자로 보여 준다', () => {
  render(<VerdictCard pc={buildPriceCheck({ ...base, market: null, aiEstimate: { fairRent: 490_000, low: 450_000, high: 550_000 } })} loggedIn />);
  expect(screen.getByText('판정을 미뤘어요')).toBeTruthy();
  expect(screen.getByText(/AI는 월 49만 정도로 봐요/)).toBeTruthy();
  expect(document.querySelector('.ui-lu-ai')).toBeTruthy();
  expect(document.querySelector('.ui-lu-fair')).toBeNull();
});

test('적정가보다 싸면 아끼는 금액을 말한다', () => {
  render(<VerdictCard pc={buildPriceCheck({ rent: 300_000, mgmtFee: 0, deposit: 5_000_000, contractMonths: 24, market })} loggedIn />);
  expect(document.querySelector('.ui-vd-big')!.textContent).toMatch(/싸요$/);
  expect(document.querySelector('.ui-vd-sub')!.textContent).toMatch(/아껴요/);
});

test('눈금자: 값을 다 담는 범위와 깔끔한 눈금, 겹치는 이름표는 위·아래로 나눈다', () => {
  const s = lineupScale([708_000, 555_000, 390_000, 490_000]);
  expect(s.min).toBeLessThanOrEqual(390_000);
  expect(s.max).toBeGreaterThanOrEqual(708_000);
  expect(s.ticks.every((t) => t % 50_000 === 0)).toBe(true);
  const placed = placeLabels([{ key: 'house', at: 50, text: '이 집 70.8만' }, { key: 'fair', at: 48, text: '실거래 적정 55.5만' }, { key: 'ai', at: 52, text: 'AI 44만' }]);
  expect(placed.find((p) => p.key === 'house')!.lane).toBe('below');
  expect(placed.find((p) => p.key === 'fair')!.lane).toBe('above');
  const edge = placeLabels([{ key: 'fair', at: 98, text: '실거래 적정 55.5만' }]);
  expect(edge[0].align).toBe('end'); // 오른쪽 끝에서는 안쪽으로
});
