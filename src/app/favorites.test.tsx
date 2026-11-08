import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithClient } from '../test/wrap';
import type { FavoriteItem, FavoriteType } from '../api/types';
import { DormPanel } from './DormPanel';
import { FavoritesPanel } from './FavoritesPanel';
import { HeartButton } from './HeartButton';
import { HousingPanel } from './HousingPanel';
import { PlaceMarkers } from './PlaceMarkers';
import { TransferMarkers } from './TransferMarkers';
import { useListingsUi, NO_FILTERS } from './features/listings';
import { useDetailSel } from './state/detail';
import { useSession } from './state/session';
import { useUi } from './state/ui';
import { useWorld } from './state/world';

const api = { landmarks: [], setMarkers: vi.fn(), setBeacons: vi.fn(), setTimeOfDay: vi.fn(), goToPlace: vi.fn(() => true), goToLandmark: vi.fn() };
const fetchMock = vi.fn();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

/** 가짜 서버: 찜 목록(favs)과 요청 기록. POST/DELETE 는 favs 를 실제로 바꾼다 */
let favs: FavoriteItem[] = [];
let calls: { path: string; method: string }[] = [];
let postStatus = 200;
const fav = (type: FavoriteType, targetId: number, o: Partial<FavoriteItem> = {}): FavoriteItem => ({ type, targetId, name: `${type}${targetId}`, lat: 37.5561, lng: 127.0443, convertedRent: 500000, grade: null, walkMin: 7, createdAt: 'x', ...o });
const routes: Record<string, unknown> = {
  '/dorms': [{ id: 1, name: '제1기숙사', lat: 37.55, lng: 127.04, roomTypes: [{ id: 1, name: '2인실', capacity: 2, semesterFee: 1200000, semesterMonths: 4, mealIncluded: false, monthlyCost: 300000, floorplanId: null }] }],
  '/housing': [{ id: 2, name: '왕십리역 청아진', address: '성동구', lat: 37.56, lng: 127.04, recruiting: false, nextEvent: null, subscribed: false }, { id: 3, name: '라봄성동', address: '성동구', lat: 37.57, lng: 127.04, recruiting: true, nextEvent: null, subscribed: false }],
  '/transfers': { items: [{ id: 5, title: '양도 원룸', address: 'a', dong: 'd', lat: 37.558, lng: 127.041, deposit: 1000000, rent: 500000, mgmtFee: null, areaM2: 18, floor: 3, roomType: 'OPEN', convertedRent: 600000, grade: 'FAIR', walkMin: null, thumbnailUrl: null, favorited: false, remainingMonths: 8, availableFrom: null, status: 'OPEN', authorNickname: 'a' }], page: 0, size: 100, total: 1 },
};

beforeEach(() => {
  favs = []; calls = []; postStatus = 200;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.replace('/api/v1', ''), method = init?.method ?? 'GET';
    calls.push({ path, method });
    if (path === '/me/favorites' && method === 'GET') return json(favs);
    if (path === '/me/favorites' && method === 'POST') {
      const b = JSON.parse(String(init?.body));
      if (postStatus === 200 || postStatus === 409) favs = [...favs, fav(b.type, b.targetId)];
      return postStatus === 200 ? json(fav(b.type, b.targetId), 201) : json({ code: postStatus === 409 ? 'ALREADY_EXISTS' : 'INTERNAL_ERROR', message: 'x' }, postStatus);
    }
    if (path.startsWith('/me/favorites/') && method === 'DELETE') { const [, , , t, i] = path.split('/'); favs = favs.filter((f) => !(f.type === t && f.targetId === Number(i))); return new Response(null, { status: 204 }); }
    if (path in routes) return json(routes[path]);
    return json({ code: 'NOT_FOUND', message: 'x' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  Object.values(api).forEach((f) => typeof f === 'function' && 'mockClear' in f && (f as ReturnType<typeof vi.fn>).mockClear());
  useWorld.setState({ status: 'ready', progress: 1, error: null, api: api as never });
  useSession.setState({ token: 't' });
  useUi.setState({ tab: 'fav', panelOpen: true, showHousing: true });
  useListingsUi.setState({ filters: NO_FILTERS, selectedId: null });
  useDetailSel.setState({ housing: null, transfer: null });
});
afterEach(() => { cleanup(); fetchMock.mockReset(); vi.unstubAllGlobals(); });

const hearts = () => screen.getAllByRole('button', { name: /(^| )찜$/ }); // 이름표: '<집 이름> 찜' (눌림은 aria-pressed)

test('하트 상태는 종류와 상관없이 /me/favorites 목록에서 정해진다 (같은 id 라도 종류가 다르면 따로)', async () => {
  favs = [fav('HOUSING', 1), fav('DORM', 3)];
  renderWithClient(<><HeartButton type="HOUSING" id={1} /><HeartButton type="HOUSING" id={2} /><HeartButton type="DORM" id={3} /><HeartButton type="TRANSFER" id={3} /></>);
  await waitFor(() => expect(hearts().map((h) => h.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true', 'false']));
});

test('찜한 하트를 누르면 DELETE 로 취소한다 (예전에는 단지 하트가 항상 POST 만 보냈다)', async () => {
  favs = [fav('HOUSING', 1)];
  renderWithClient(<HeartButton type="HOUSING" id={1} />);
  await waitFor(() => expect(hearts()[0].getAttribute('aria-pressed')).toBe('true'));
  fireEvent.click(hearts()[0]);
  expect(hearts()[0].getAttribute('aria-pressed')).toBe('false'); // 서버 응답 전에 바로 바뀐다
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/me/favorites/HOUSING/1')).toBe(true));
  expect(calls.some((c) => c.method === 'POST')).toBe(false);
  await waitFor(() => expect(favs).toEqual([]));
  expect(hearts()[0].getAttribute('aria-pressed')).toBe('false'); // 목록을 다시 받은 뒤에도 그대로
});

test('빈 하트를 누르면 POST 로 찜하고 하트가 먼저 채워진다', async () => {
  renderWithClient(<HeartButton type="DORM" id={1} />);
  await waitFor(() => expect(calls.some((c) => c.path === '/me/favorites' && c.method === 'GET')).toBe(true));
  fireEvent.click(hearts()[0]);
  expect(hearts()[0].getAttribute('aria-pressed')).toBe('true');
  await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
  await waitFor(() => expect(favs.map((f) => `${f.type}${f.targetId}`)).toEqual(['DORM1']));
  expect(hearts()[0].getAttribute('aria-pressed')).toBe('true');
});

test('서버 오류면 하트를 원래대로 되돌리고 안내한다', async () => {
  postStatus = 500;
  renderWithClient(<HeartButton type="DORM" id={1} />);
  await waitFor(() => expect(calls.some((c) => c.method === 'GET')).toBe(true));
  fireEvent.click(hearts()[0]);
  expect(await screen.findByText('찜을 저장하지 못했어요')).toBeTruthy();
  expect(hearts()[0].getAttribute('aria-pressed')).toBe('false');
});

test('이미 찜한 것(409)은 성공으로 본다', async () => {
  postStatus = 409;
  renderWithClient(<HeartButton type="HOUSING" id={2} />);
  await waitFor(() => expect(calls.some((c) => c.method === 'GET')).toBe(true));
  fireEvent.click(hearts()[0]);
  await waitFor(() => expect(favs).toHaveLength(1));
  expect(screen.queryByText('찜을 저장하지 못했어요')).toBeNull();
  expect(hearts()[0].getAttribute('aria-pressed')).toBe('true');
});

test('양도 글을 찜해도 id 가 같은 자취방 하트는 켜지지 않는다 (예전엔 캐시 키가 섞였다)', async () => {
  renderWithClient(<><HeartButton type="LISTING" id={5} /><HeartButton type="TRANSFER" id={5} /></>);
  await waitFor(() => expect(calls.some((c) => c.method === 'GET')).toBe(true));
  fireEvent.click(hearts()[1]);
  await waitFor(() => expect(favs.map((f) => f.type)).toEqual(['TRANSFER']));
  expect(hearts().map((h) => h.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
});

test('청년안심주택 목록 카드마다 하트가 있고 찜한 단지는 채워져 있다', async () => {
  favs = [fav('HOUSING', 3)];
  renderWithClient(<HousingPanel />);
  await screen.findByText('왕십리역 청아진');
  await waitFor(() => expect(hearts().map((h) => h.getAttribute('aria-pressed'))).toEqual(['false', 'true']));
});

test('기숙사마다 머리에 하트가 있다', async () => {
  favs = [fav('DORM', 1)];
  renderWithClient(<DormPanel />);
  await screen.findByText('제1기숙사');
  await waitFor(() => expect(hearts()).toHaveLength(1));
  await waitFor(() => expect(hearts()[0].getAttribute('aria-pressed')).toBe('true'));
});

test('찜한 기숙사·단지·양도는 3D 말풍선에 하트가 붙는다', async () => {
  favs = [fav('DORM', 1), fav('HOUSING', 3), fav('TRANSFER', 5)];
  renderWithClient(<><PlaceMarkers /><TransferMarkers /></>);
  const icons = (group: string) => (api.setMarkers.mock.calls.filter((c) => c[1] === group).at(-1)?.[0] as { id: string; icon?: string }[] | undefined)?.map((m) => [m.id, !!m.icon]);
  await waitFor(() => expect(icons('dorm')).toEqual([['d1', true]]));
  await waitFor(() => expect(icons('housing')).toEqual([['h2', false], ['h3', true]]));
  await waitFor(() => expect(icons('transfer')).toEqual([['t5', true]]));
});

test('말풍선 하트는 찜을 누르는 즉시 바뀐다', async () => {
  renderWithClient(<><HeartButton type="DORM" id={1} /><PlaceMarkers /></>);
  const last = () => (api.setMarkers.mock.calls.filter((c) => c[1] === 'dorm').at(-1)?.[0] as { icon?: string }[] | undefined)?.[0]?.icon;
  await waitFor(() => expect(last()).toBeUndefined());
  await waitFor(() => expect(calls.some((c) => c.method === 'GET')).toBe(true));
  fireEvent.click(hearts()[0]);
  await waitFor(() => expect(last()).toContain('<svg'));
});

test('찜 목록: 종류별 개수 필터, 카드에서 바로 취소, 누르면 그 탭의 상세만 열린다(3D 이동은 상세 버튼으로)', async () => {
  favs = [fav('LISTING', 7, { grade: 'HIGH' }), fav('HOUSING', 2), fav('DORM', 1, { convertedRent: 300000 }), fav('HOUSING', 3)];
  renderWithClient(<FavoritesPanel />);
  const filter = within(await screen.findByRole('group', { name: '종류별로 보기' })); // 카드 이름도 종류로 시작하므로 필터 묶음 안에서만 찾는다
  expect(filter.getByRole('button', { name: /^전체/ }).textContent).toContain('4');
  expect(filter.getByRole('button', { name: /^청년안심주택/ }).textContent).toContain('2');
  expect(filter.queryByRole('button', { name: /^양도/ })).toBeNull(); // 없는 종류는 칩도 없다

  fireEvent.click(filter.getByRole('button', { name: /^기숙사/ }));
  expect(screen.queryByText('HOUSING2')).toBeNull();
  expect(screen.getByText('DORM1')).toBeTruthy();
  expect(screen.getByText('한 달 비용')).toBeTruthy(); // 기숙사는 환산 월세가 아니라 한 달 비용

  fireEvent.click(filter.getByRole('button', { name: /^전체/ }));
  fireEvent.click(screen.getByText('HOUSING3'));
  expect(api.goToPlace).not.toHaveBeenCalled();
  expect(useUi.getState().tab).toBe('housing');
  expect(useDetailSel.getState().housing).toBe(3);

  const card = screen.getByText('LISTING7').closest('li')!;
  fireEvent.click(within(card).getByRole('button', { name: /찜$/, pressed: true }));
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/me/favorites/LISTING/7')).toBe(true));
  await waitFor(() => expect(screen.queryByText('LISTING7')).toBeNull()); // 취소하면 목록에서 사라진다
});

test('찜 목록에서 자취방을 누르면 매물 찾기 탭에서 그 매물 상세를 연다', async () => {
  favs = [fav('LISTING', 7)];
  renderWithClient(<FavoritesPanel />);
  fireEvent.click(await screen.findByText('LISTING7'));
  expect(useUi.getState().tab).toBe('home');
  expect(useListingsUi.getState().selectedId).toBe(7);
});

test('게스트는 찜 목록 대신 로그인 안내를 본다', () => {
  useSession.setState({ token: null });
  renderWithClient(<FavoritesPanel />);
  expect(screen.getByText('로그인하면 찜한 집을 모아 볼 수 있어요.')).toBeTruthy();
  expect(screen.getByRole('button', { name: '로그인' })).toBeTruthy();
});
