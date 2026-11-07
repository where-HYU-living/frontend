import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const fakeApi = {
  landmarks: [{ key: 'hero', name: '사자상 정면' }, { key: 'main', name: '본관' }],
  goToLandmark: vi.fn(() => true),
  teleport: vi.fn(() => true),
  getPose: () => ({ p: [0, 0, 0] as [number, number, number], heading: 0 }),
  dispose: vi.fn(),
};
vi.mock('../../world/WorldCanvas', () => ({ WorldCanvas: () => null }));
vi.mock('../../main', () => ({ initWorld: vi.fn(async () => fakeApi) }));

import { App } from '../App';
import { useUi } from '../state/ui';
import { useWorld } from '../state/world';

beforeEach(() => {
  useUi.setState({ tab: 'home', panelOpen: false });
  useWorld.setState({ status: 'loading', progress: 0, error: null, api: null });
});
afterEach(cleanup);

const renderReady = async () => {
  render(<App />);
  await act(async () => { useWorld.setState({ status: 'ready', progress: 1, api: fakeApi as never }); });
};

test('menu tabs appear exactly once', async () => {
  await renderReady();
  expect(screen.getAllByRole('tab', { name: '집 찾기' })).toHaveLength(1);
  expect(screen.getAllByRole('tab')).toHaveLength(5);
});

test('loading overlay goes away when 3D is ready', async () => {
  await renderReady();
  expect(screen.queryByRole('status')).toBeNull();
});

test('panel starts folded, tab opens it, fold button closes it', async () => {
  await renderReady();
  expect(screen.queryByRole('complementary')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '기숙사' }));
  expect(screen.getByRole('heading', { name: '기숙사' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '패널 접기' }));
  expect(screen.queryByRole('heading', { name: '기숙사' })).toBeNull();
  expect(screen.getByRole('button', { name: '기숙사 열기' })).toBeTruthy();
});

test('search suggests landmarks and moves the player', async () => {
  await renderReady();
  const input = screen.getByRole('textbox', { name: '검색' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '본관' } });
  fireEvent.click(screen.getByRole('button', { name: '본관' }));
  expect(fakeApi.goToLandmark).toHaveBeenCalledWith('main');
});
