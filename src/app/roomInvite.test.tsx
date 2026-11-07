import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { renderWithClient } from '../test/wrap';
import { FLOORPLAN_1 } from '../mock/fixtures/floorplan1';
import { buildInterior } from '../interior/buildInterior';
import { makeInput } from '../interior/input';
import { buildRoomScene } from '../interior/roomScene';
import { TourHud } from '../interior/TourHud';
import { jumpTargets } from '../interior/tourNav';
import { useNet } from '../net/useMultiplayer';
import { resetRoomInviteForTest, useRoomInvite } from '../net/useRoomInvite';
import { InviteButton } from './InviteButton';
import { useUi } from './state/ui';
import { useWorld } from './state/world';

const fetchMock = vi.fn();
const writeText = vi.fn();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

beforeEach(() => {
  fetchMock.mockResolvedValue(json({ token: 'inv_1', url: 'https://app.example/?invite=inv_1', expiresAt: 'x' }));
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  writeText.mockReset();
  useNet.setState({ status: 'open', selfId: 'p_1', count: 0, conn: null, invited: false });
  useUi.setState({ indoor: null });
  useWorld.setState({ status: 'ready', progress: 1, error: null });
  resetRoomInviteForTest();
  history.replaceState(null, '', '/');
});
afterEach(() => { cleanup(); fetchMock.mockReset(); vi.unstubAllGlobals(); });

test('동네에서 누른 초대는 서버가 준 링크 그대로 복사한다 (받은 사람은 내 옆에 선다)', async () => {
  renderWithClient(<InviteButton />);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.example/?invite=inv_1'));
  expect(await screen.findByText('링크를 복사했어요')).toBeTruthy();
});

test('방 투어 중 누른 초대는 링크에 도면·내 자리·방 이름을 덧붙인다', async () => {
  renderWithClient(<InviteButton room={() => ({ floorplanId: 7, title: '청아진 18타입', x: 1.9, z: 3.0, yaw: 0.4 })} />);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  const u = new URL(writeText.mock.calls[0][0]);
  expect(u.searchParams.get('invite')).toBe('inv_1'); // 서버 토큰은 그대로
  expect(u.searchParams.get('room')).toBe('7');
  expect(u.searchParams.get('at')).toBe('1.9,3,0.4');
  expect(u.searchParams.get('label')).toBe('청아진 18타입');
  expect(await screen.findByText('이 방 링크를 복사했어요')).toBeTruthy();
});

test('멀티플레이에 접속하지 않았으면 초대 버튼이 없다', () => {
  useNet.setState({ status: 'closed', selfId: null });
  renderWithClient(<InviteButton />);
  expect(screen.queryByRole('button')).toBeNull();
});

test('서버가 실패하면 링크를 만들지 못했다고 알린다', async () => {
  fetchMock.mockResolvedValue(json({ code: 'INTERNAL_ERROR', message: 'x' }, 500));
  renderWithClient(<InviteButton />);
  fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByText('링크를 만들지 못했어요')).toBeTruthy();
  expect(writeText).not.toHaveBeenCalled();
});

test('방 초대 링크로 들어오면 월드가 준비된 뒤 그 도면의 초대한 사람 자리로 입장하고, 주소창은 정리된다', () => {
  history.replaceState(null, '', '/?invite=inv_1&room=7&at=1.9,3,0.4&label=%EC%B2%AD%EC%95%84%EC%A7%84&solo=1');
  renderHook(() => useRoomInvite());
  expect(useUi.getState().indoor).toEqual({ floorplanId: 7, title: '청아진', start: { x: 1.9, z: 3, yaw: 0.4 }, invited: true });
  expect(location.search).toBe('?invite=inv_1&solo=1'); // 방 정보만 지운다 (invite 는 멀티플레이 쪽이 지운다)
});

test('월드가 아직 준비 전이면 기다리고, 준비되면 입장한다', () => {
  useWorld.setState({ status: 'loading' });
  history.replaceState(null, '', '/?room=7&at=1,2,3&label=x');
  renderHook(() => useRoomInvite());
  expect(useUi.getState().indoor).toBeNull();
  act(() => useWorld.setState({ status: 'ready' }));
  expect(useUi.getState().indoor?.floorplanId).toBe(7);
});

test('한 번만 입장한다: 나갔다가 다시 렌더돼도 또 들어가지 않는다', () => {
  history.replaceState(null, '', '/?room=7&at=1,2,3&label=x');
  const { rerender } = renderHook(() => useRoomInvite());
  expect(useUi.getState().indoor).not.toBeNull();
  act(() => useUi.getState().exitIndoor());
  rerender();
  expect(useUi.getState().indoor).toBeNull();
});

test('깨진 링크나 방 정보 없는 링크는 아무 일도 없다', () => {
  for (const s of ['/?room=abc&at=1,2,3', '/?room=7', '/?invite=inv_1']) {
    history.replaceState(null, '', s);
    renderHook(() => useRoomInvite());
    expect(useUi.getState().indoor, s).toBeNull();
    resetRoomInviteForTest();
  }
});

const tourHud = (invited: boolean) => {
  const built = buildInterior(FLOORPLAN_1), room = buildRoomScene(FLOORPLAN_1);
  const input = makeInput();
  input.pose = { x: 1.9, z: 3, yaw: 0.4, room: 3 };
  const jumps = jumpTargets(FLOORPLAN_1, room.info.lamps, built.spawn, [...built.wallPieces, ...room.solids]);
  return <TourHud title="청아진 18타입" floorplanId={1} invited={invited} plan={FLOORPLAN_1} input={input} pins={[]} jumps={jumps} hasFurniture showFurniture onFurniture={() => {}} time={0} onTime={() => {}} onExit={() => {}} onJump={() => {}} onPickPoint={() => {}} quiet={false} />;
};

test('방 투어 화면에 초대 버튼이 있고, 누르면 지금 서 있는 자리가 링크에 담긴다', async () => {
  renderWithClient(tourHud(false));
  fireEvent.click(screen.getByTitle(/지금 이 방으로 초대/));
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  const u = new URL(writeText.mock.calls[0][0]);
  expect(u.searchParams.get('room')).toBe('1');
  expect(u.searchParams.get('at')).toBe('1.9,3,0.4');
  expect(u.searchParams.get('label')).toBe('청아진 18타입');
});

test('초대받아 들어온 방 투어에는 안내가 뜨고, 그냥 들어온 방 투어에는 안 뜬다', () => {
  const { unmount } = renderWithClient(tourHud(true));
  expect(screen.getByText(/초대받은 방이에요/)).toBeTruthy();
  unmount();
  renderWithClient(tourHud(false));
  expect(screen.queryByText(/초대받은 방이에요/)).toBeNull();
});
