import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithClient } from '../test/wrap';
import { clockLabel, lightAt, LIGHT_PRESETS, starsAt } from '../world/timeOfDay';
import { buildListingParams, cheaperListings, NO_FILTERS, useListingsUi } from './features/listings';
import { WorldEffects } from './WorldEffects';
import { ListingMarkers } from './ListingMarkers';
import { ListingsPanel } from './ListingsPanel';
import { TopBar } from './TopBar';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { useSession } from './state/session';
import type { ListingSummary } from '../api/types';

const api = { landmarks: [], setMarkers: vi.fn(), setBeacons: vi.fn(), setTimeOfDay: vi.fn(), goToPlace: vi.fn(() => true), goToLandmark: vi.fn() };
const fetchMock = vi.fn();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const L = (o: Partial<ListingSummary>): ListingSummary => ({ id: 1, title: 't', address: 'a', dong: 'd', lat: 37.558, lng: 127.041, deposit: 10000000, rent: 550000, mgmtFee: null, areaM2: 18, floor: null, roomType: 'OPEN', convertedRent: 700000, grade: 'HIGH', walkMin: null, thumbnailUrl: null, favorited: false, ...o });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  Object.values(api).forEach((f) => typeof f === 'function' && 'mockClear' in f && (f as ReturnType<typeof vi.fn>).mockClear());
  useWorld.setState({ status: 'ready', progress: 1, error: null, api: api as never });
  useUi.setState({ timeOfDay: 0, showHousing: true });
  useListingsUi.setState({ filters: NO_FILTERS, selectedId: null });
  useSession.setState({ token: null });
});
afterEach(() => { cleanup(); fetchMock.mockReset(); vi.unstubAllGlobals(); });

test('night is darker than day, evening in between', () => {
  const P = LIGHT_PRESETS;
  expect(P.night.sun).toBeLessThan(P.evening.sun);
  expect(P.evening.sun).toBeLessThan(P.day.sun);
  expect(P.night.env).toBeLessThan(P.day.env);
  expect(P.night.bg).toBeLessThan(P.day.bg);
});

test('lightAt blends smoothly: endpoints are the presets, sun only ever dims as t grows', () => {
  const same = (a: ReturnType<typeof lightAt>, b: ReturnType<typeof lightAt>) => {
    expect(a.sun).toBeCloseTo(b.sun, 6); expect(a.sunColor).toBe(b.sunColor); expect(a.fog).toBe(b.fog);
    expect(a.env).toBeCloseTo(b.env, 6); expect(a.bg).toBeCloseTo(b.bg, 6); expect(a.exposure).toBeCloseTo(b.exposure, 6);
    a.sunDir.forEach((v, i) => expect(v).toBeCloseTo(b.sunDir[i], 6));
  };
  same(lightAt(0), LIGHT_PRESETS.day);
  same(lightAt(0.5), LIGHT_PRESETS.evening);
  same(lightAt(1), LIGHT_PRESETS.night);
  same(lightAt(-3), LIGHT_PRESETS.day); // 범위 밖은 끝값
  let prev = Infinity;
  for (let i = 0; i <= 100; i++) { const sun = lightAt(i / 100).sun; expect(sun).toBeLessThanOrEqual(prev); prev = sun; }
  expect(lightAt(0.25).fog).not.toBe(LIGHT_PRESETS.day.fog); // 색도 중간값
});

test('stars appear only toward night, clock shows 12:00 pm → 12:00 am', () => {
  expect(starsAt(0)).toBe(0);
  expect(starsAt(0.5)).toBe(0);
  expect(starsAt(1)).toBe(1);
  expect(starsAt(0.8)).toBeGreaterThan(0);
  expect(starsAt(0.8)).toBeLessThan(1);
  expect(clockLabel(0)).toBe('오후 12:00');
  expect(clockLabel(0.5)).toBe('오후 6:00');
  expect(clockLabel(1)).toBe('오전 12:00');
  expect(clockLabel(0.25)).toBe('오후 3:00');
});

test('cheaperListings picks lower converted rent, skips pending and itself, cheapest first, max 3', () => {
  const cur = L({ id: 1, convertedRent: 700000 });
  const all = [cur, L({ id: 2, convertedRent: 500000 }), L({ id: 3, convertedRent: 600000 }), L({ id: 4, convertedRent: 400000, grade: 'PENDING' }), L({ id: 5, convertedRent: 450000 }), L({ id: 6, convertedRent: 480000 }), L({ id: 7, convertedRent: 800000 })];
  expect(cheaperListings(all, cur).map((l) => l.id)).toEqual([5, 6, 2]);
  expect(cheaperListings([cur], cur)).toEqual([]);
});

test('walk and room type filters reach the request, empty ones are omitted', () => {
  const p = buildListingParams({ ...NO_FILTERS, maxWalkMin: '10', roomType: 'SEPARATED' });
  expect(p.maxWalkMin).toBe(10);
  expect(p.roomType).toBe('SEPARATED');
  const e = buildListingParams(NO_FILTERS);
  expect(e.maxWalkMin).toBeUndefined();
  expect(e.roomType).toBeUndefined();
});

test('filter panel sends walk, room type; housing toggle updates ui state', async () => {
  fetchMock.mockResolvedValue(json({ items: [], page: 0, size: 100, total: 0 }));
  renderWithClient(<ListingsPanel />);
  fireEvent.click(screen.getByRole('button', { name: /조건/ })); // 조건은 접혀 있다
  fireEvent.change(screen.getByLabelText('도보 시간 상한(분)'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('방 구조'), { target: { value: 'SEPARATED' } });
  await waitFor(() => {
    const url = fetchMock.mock.calls.at(-1)![0] as string;
    expect(url).toContain('maxWalkMin=10');
    expect(url).toContain('roomType=SEPARATED');
  });
  fireEvent.click(screen.getByLabelText('청년안심주택 표시'));
  expect(useUi.getState().showHousing).toBe(false);
});

test('favorited listings get a heart on the 3D marker', async () => {
  fetchMock.mockResolvedValue(json({ items: [L({ id: 1, favorited: true }), L({ id: 2, favorited: false })], page: 0, size: 100, total: 2 }));
  renderWithClient(<ListingMarkers />);
  await waitFor(() => expect(api.setMarkers).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ text: '1,000/55', icon: expect.stringContaining('<svg') })]), 'listing'));
  const items = api.setMarkers.mock.calls.at(-1)![0] as { text: string; icon?: string }[];
  expect(items.map((m) => !!m.icon)).toEqual([true, false]); // 찜한 것만 하트 아이콘
});

test('dragging the time slider moves the 3D lighting and shows the clock', async () => {
  renderWithClient(<><TopBar /><WorldEffects /></>);
  await waitFor(() => expect(api.setTimeOfDay).toHaveBeenCalledWith(0));
  expect(screen.getByText('오후 12:00')).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/시간대/), { target: { value: '1000' } });
  await waitFor(() => expect(api.setTimeOfDay).toHaveBeenLastCalledWith(1));
  expect(screen.getByText('오전 12:00')).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/시간대/), { target: { value: '500' } });
  await waitFor(() => expect(api.setTimeOfDay).toHaveBeenLastCalledWith(0.5));
  expect(screen.getByText('오후 6:00')).toBeTruthy();
});

test('my department building, recruiting beacons and nearby icons are pushed to 3D', async () => {
  useSession.setState({ token: 't' });
  useListingsUi.setState({ selectedId: 7 });
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/me/profile')) return Promise.resolve(json({ id: 1, email: 'a', nickname: 'n', departmentId: 1, buildingIds: [3], budget: null }));
    if (url.includes('/buildings')) return Promise.resolve(json([{ id: 3, name: '공업센터본관', type: 'CAMPUS', lat: 37.556, lng: 127.045 }, { id: 4, name: '다른건물', type: 'CAMPUS', lat: 37.557, lng: 127.046 }]));
    if (url.includes('/housing') && !url.includes('announcements')) return Promise.resolve(json([{ id: 1, name: '청아진', address: 'a', lat: 37.561, lng: 127.037, recruiting: true, nextEvent: null, subscribed: false }, { id: 2, name: '라봄', address: 'a', lat: 37.562, lng: 127.038, recruiting: false, nextEvent: null, subscribed: false }]));
    if (url.includes('/listings/7/nearby')) return Promise.resolve(json([{ category: 'CONVENIENCE', name: 'GS25', lat: 37.5581, lng: 127.0411, distanceM: 80 }]));
    if (url.includes('/listings/7')) return Promise.resolve(json({ ...L({ id: 7 }), options: [], photos: [], floorplanId: null, builtYear: null, description: null }));
    return Promise.resolve(json([]));
  });
  renderWithClient(<WorldEffects />);
  await waitFor(() => expect(api.setMarkers).toHaveBeenCalledWith([expect.objectContaining({ text: '내 과 건물 · 공업센터본관' })], 'mybuilding'));
  await waitFor(() => expect(api.setBeacons).toHaveBeenCalledWith([expect.objectContaining({ color: '#2f9e57' })])); // 모집 중 1곳만
  await waitFor(() => expect(api.setMarkers).toHaveBeenCalledWith([expect.objectContaining({ text: 'GS25', icon: expect.stringContaining('<svg') })], 'nearby'));
  await act(async () => { useUi.setState({ showHousing: false }); });
  await waitFor(() => expect(api.setBeacons).toHaveBeenLastCalledWith([]));
});
