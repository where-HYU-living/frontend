import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { buildPriceCheck } from '../../mock/pricing';
import { VerdictCard } from '../VerdictCard';

afterEach(cleanup);

const market = { fairRent: 479_000, sample: { count: 45, scope: 'DONG' as const, dongs: ['사근동'], areaMinM2: 7.7, areaMaxM2: 14.3, from: '2025-11', to: '2026-10' } };
const base = { rent: 950_000, mgmtFee: 50_000, deposit: 5_000_000, contractMonths: 24 };

test('AI 적정가가 있으면 적정 월세 옆에 범위와 같이 보여 준다', () => {
  render(<VerdictCard pc={buildPriceCheck({ ...base, market, aiEstimate: { fairRent: 490_000, low: 450_000, high: 550_000 } })} loggedIn />);
  expect(screen.getByText('적정 월세')).toBeTruthy();
  expect(screen.getByText('AI 적정가')).toBeTruthy();
  expect(screen.getByText('45만~55만')).toBeTruthy();
});

test('AI 적정가가 없으면 그 칸을 숨긴다', () => {
  render(<VerdictCard pc={buildPriceCheck({ ...base, market })} loggedIn />);
  expect(screen.queryByText('AI 적정가')).toBeNull();
});

test('판정 보류여도 AI 적정가는 한 줄로 보여 준다', () => {
  render(<VerdictCard pc={buildPriceCheck({ ...base, market: null, aiEstimate: { fairRent: 490_000, low: 450_000, high: 550_000 } })} loggedIn />);
  expect(screen.getByText(/AI 적정가 49만 \(적정 범위 45만~55만\)/)).toBeTruthy();
});
