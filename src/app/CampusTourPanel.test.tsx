import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CampusTourPanel } from './CampusTourPanel';
import { useWorld } from './state/world';
import places from './data/campusPlaces.json';

const goToPlace = vi.fn(() => true);
const teleport = vi.fn(() => true);
beforeEach(() => {
  goToPlace.mockClear();
  teleport.mockClear();
  useWorld.setState({ status: 'ready', api: { goToPlace, teleport } as never });
});
type P = { name: string; center: [number, number]; entrance?: { door: [number, number]; stand: [number, number] } };
const withDoor = () => (places as unknown as P[]).find((x) => x.entrance && x.center)!;
afterEach(cleanup);

test('typing filters the list', () => {
  render(<CampusTourPanel />);
  fireEvent.change(screen.getByRole('textbox', { name: '캠퍼스 건물 검색' }), { target: { value: '개나리' } });
  expect(screen.getAllByRole('button')).toHaveLength(1);
});
test('입구가 없는 건물은 그 건물이 보이는 빈자리로 (3D 위치를 넘긴다)', () => {
  render(<CampusTourPanel />);
  fireEvent.click(screen.getByRole('button', { name: /건축관/ }));
  const p = (places as unknown as P[]).find((x) => x.name === '건축관')!;
  expect(p.entrance).toBeUndefined();
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
  fireEvent.click(screen.getByRole('button', { name: /건축관/ }));
  expect(screen.getByRole('status').textContent).toContain('갈 수 없어요');
});
test('동네 월드에서 누르면 캠퍼스 월드로 바꾸고 도착 후 그 건물로 (3-1 B 회귀)', async () => {
  const { useArea } = await import('./state/area');
  useWorld.setState({ areaId: 'h2' });
  useArea.setState({ area: { site: 'h2' }, pendingGoto: null });
  render(<CampusTourPanel />);
  fireEvent.click(screen.getByRole('button', { name: /건축관/ }));
  const p = (places as unknown as P[]).find((x) => x.name === '건축관')!;
  expect(goToPlace).not.toHaveBeenCalled(); // 동네 월드 api 에 캠퍼스 좌표를 넘기지 않는다
  expect(useArea.getState().area).toBe('campus');
  expect(useArea.getState().pendingGoto).toMatchObject({ area: 'campus', x: p.center[0], z: p.center[1] });
  useWorld.setState({ areaId: 'campus' });
});

test('입구가 있는 건물은 문 앞에 서서 문 쪽을 본다 (뒤편에 서지 않게)', () => {
  const p = withDoor();
  render(<CampusTourPanel />);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(p.name.replace(/[()]/g, '.')) }));
  expect(teleport).toHaveBeenCalledWith(p.entrance!.stand[0], p.entrance!.stand[1], p.entrance!.door[0], p.entrance!.door[1]);
  expect(goToPlace).not.toHaveBeenCalled();
});
test('문 앞이 막혀 있으면 예전처럼 건물이 보이는 빈자리로', () => {
  teleport.mockReturnValueOnce(false);
  const p = withDoor();
  render(<CampusTourPanel />);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(p.name.replace(/[()]/g, '.')) }));
  expect(goToPlace).toHaveBeenCalledWith(p.center[0], p.center[1]);
});
test('동네 월드에서 입구 있는 건물을 누르면 캠퍼스 도착 후 문 앞에 선다', async () => {
  const { useArea } = await import('./state/area');
  useWorld.setState({ areaId: 'h2' });
  useArea.setState({ area: { site: 'h2' }, pendingGoto: null });
  const p = withDoor();
  render(<CampusTourPanel />);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(p.name.replace(/[()]/g, '.')) }));
  expect(useArea.getState().pendingGoto).toMatchObject({ area: 'campus', x: p.entrance!.stand[0], z: p.entrance!.stand[1], stand: true, face: p.entrance!.door });
  useWorld.setState({ areaId: 'campus' });
});
