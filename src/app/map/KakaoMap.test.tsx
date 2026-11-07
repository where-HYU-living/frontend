import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithClient } from '../../test/wrap';
import { useUi } from '../state/ui';
import { useWorld } from '../state/world';

const fns = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('./loadKakao', async (orig) => ({ ...(await orig<typeof import('./loadKakao')>()), loadKakao: fns.load }));
import { KakaoMap } from './KakaoMap';
import { TopBar } from '../TopBar';

const goToPlace = vi.fn(() => true);
beforeEach(() => {
  goToPlace.mockClear();
  useUi.setState({ mapMode: '2d' });
  useWorld.setState({ status: 'ready', api: { goToPlace, getPose: () => ({ p: [0, 0, 0], heading: 0 }), landmarks: [] } as never });
});
afterEach(cleanup);

test('shows the Korean message when the SDK fails to load', async () => {
  fns.load.mockRejectedValueOnce(new Error('SCRIPT'));
  renderWithClient(<KakaoMap />);
  await act(async () => {});
  expect(screen.getByRole('alert').textContent).toContain('카카오맵을 불러오지 못했어요');
});
test('shows the missing key message', async () => {
  fns.load.mockRejectedValueOnce(new Error('NO_KEY'));
  renderWithClient(<KakaoMap />);
  await act(async () => {});
  expect(screen.getByRole('alert').textContent).toContain('VITE_KAKAO_JS_KEY');
});
test('shows a loading note while the SDK is loading', () => {
  fns.load.mockReturnValueOnce(new Promise(() => {}));
  renderWithClient(<KakaoMap />);
  expect(screen.getByRole('status').textContent).toContain('불러오는 중');
});
test('top bar button toggles between map and 3D', () => {
  useUi.setState({ mapMode: '3d' });
  renderWithClient(<TopBar />);
  fireEvent.click(screen.getByRole('button', { name: '지도로 보기' }));
  expect(useUi.getState().mapMode).toBe('2d');
  fireEvent.click(screen.getByRole('button', { name: '3D로 보기' }));
  expect(useUi.getState().mapMode).toBe('3d');
});
