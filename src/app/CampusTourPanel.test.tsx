import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CampusTourPanel } from './CampusTourPanel';
import { useWorld } from './state/world';
import places from './data/campusPlaces.json';

const goToPlace = vi.fn(() => true);
beforeEach(() => {
  goToPlace.mockClear();
  useWorld.setState({ status: 'ready', api: { goToPlace } as never });
});
afterEach(cleanup);

test('typing filters the list', () => {
  render(<CampusTourPanel />);
  fireEvent.change(screen.getByRole('textbox', { name: '캠퍼스 건물 검색' }), { target: { value: '개나리' } });
  expect(screen.getAllByRole('button')).toHaveLength(1);
});
test('clicking a place sends its 3D position', () => {
  render(<CampusTourPanel />);
  fireEvent.click(screen.getByRole('button', { name: /제1공학관/ }));
  const p = (places as unknown as { name: string; center: [number, number] }[]).find((x) => x.name === '제1공학관')!;
  expect(goToPlace).toHaveBeenCalledWith(p.center[0], p.center[1]);
});
test('a place without 3D position is disabled', () => {
  render(<CampusTourPanel />);
  const b = screen.getByRole('button', { name: /제2교육관/ }) as HTMLButtonElement;
  expect(b.disabled).toBe(true);
  fireEvent.click(b);
  expect(goToPlace).not.toHaveBeenCalled();
});
test('shows a message when nothing matches', () => {
  render(<CampusTourPanel />);
  fireEvent.change(screen.getByRole('textbox', { name: '캠퍼스 건물 검색' }), { target: { value: 'zzz' } });
  expect(screen.getByText('찾는 건물이 없어요')).toBeTruthy();
});
test('shows a message when the player cannot go there', () => {
  goToPlace.mockReturnValueOnce(false);
  render(<CampusTourPanel />);
  fireEvent.click(screen.getByRole('button', { name: /제1공학관/ }));
  expect(screen.getByRole('status').textContent).toContain('갈 수 없어요');
});
