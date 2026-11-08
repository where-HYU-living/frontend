import { afterEach, expect, test } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DateField, MonthStepper } from './DateField';

afterEach(cleanup);

function Host({ init = '', min, quick }: { init?: string; min?: string; quick?: { label: string; value: string | null }[] }) {
  const [v, setV] = useState(init);
  return <><DateField label="계약 시작" value={v} onChange={setV} min={min} quick={quick} clearable /><output data-testid="v">{v}</output></>;
}

test('칸을 누르면 달력이 열리고, 날을 누르면 들어가고 닫힌다', () => {
  render(<Host init="2026-01-12" />);
  expect(screen.getByText('2026년 1월 12일 (월)')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^계약 시작 (?!지우기)/ }));
  expect(screen.getByRole('dialog', { name: '계약 시작 달력' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '다음 달' }));
  fireEvent.click(screen.getByRole('gridcell', { name: '2026년 2월 3일 (화)' }));
  expect(screen.getByTestId('v').textContent).toBe('2026-02-03');
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('키보드: 화살표로 옮기고 Enter 로 고른다, Esc 로 닫는다', () => {
  render(<Host init="2026-01-12" />);
  fireEvent.click(screen.getByRole('button', { name: /^계약 시작 (?!지우기)/ }));
  const dlg = screen.getByRole('dialog');
  fireEvent.keyDown(dlg, { key: 'ArrowRight' });
  fireEvent.keyDown(dlg, { key: 'ArrowDown' });
  const focused = document.activeElement as HTMLButtonElement;
  expect(focused.getAttribute('aria-label')).toBe('2026년 1월 20일 (화)');
  fireEvent.click(focused);
  expect(screen.getByTestId('v').textContent).toBe('2026-01-20');
  fireEvent.click(screen.getByRole('button', { name: /^계약 시작 (?!지우기)/ }));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('min 이전 날은 못 고르고, 빠른 선택(비우기 포함)과 X 로 지운다', () => {
  render(<Host init="2026-03-10" min="2026-03-05" quick={[{ label: '협의', value: null }]} />);
  fireEvent.click(screen.getByRole('button', { name: /^계약 시작 (?!지우기)/ }));
  expect((screen.getByRole('gridcell', { name: '2026년 3월 4일 (수)' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('협의'));
  expect(screen.getByTestId('v').textContent).toBe('');
  fireEvent.click(screen.getByRole('button', { name: /^계약 시작 (?!지우기)/ })); // 비어 있으면 오늘이 있는 달로 열린다
  fireEvent.click(screen.getAllByRole('gridcell').find((b) => !(b as HTMLButtonElement).disabled)!);
  expect(screen.getByTestId('v').textContent).not.toBe('');
  fireEvent.click(screen.getByRole('button', { name: '계약 시작 지우기' }));
  expect(screen.getByTestId('v').textContent).toBe('');
});

test('제목을 누르면 달 고르기로 바뀌어 연 단위로 빨리 간다', () => {
  render(<Host init="2026-01-12" />);
  fireEvent.click(screen.getByRole('button', { name: /^계약 시작 (?!지우기)/ }));
  fireEvent.click(screen.getByRole('button', { name: '1년 전' }));
  fireEvent.click(screen.getByText('2025년 1월'));
  fireEvent.click(screen.getByRole('button', { name: '8월' }));
  fireEvent.click(screen.getByRole('gridcell', { name: '2025년 8월 1일 (금)' }));
  expect(screen.getByTestId('v').textContent).toBe('2025-08-01');
});

test('MonthStepper: 앞뒤로 넘기고, max 다음 달은 막힌다', () => {
  function M() { const [v, setV] = useState('2026-11'); return <><MonthStepper label="기록 달" value={v} onChange={setV} max="2026-11" /><output data-testid="m">{v}</output></>; }
  render(<M />);
  expect((screen.getByRole('button', { name: '다음 달' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '이전 달' }));
  expect(screen.getByTestId('m').textContent).toBe('2026-10');
  fireEvent.click(screen.getByText('2026년 10월'));
  expect((screen.getByRole('button', { name: '12월' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '3월' }));
  expect(screen.getByTestId('m').textContent).toBe('2026-03');
});
