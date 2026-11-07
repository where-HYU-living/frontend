import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithClient } from '../test/wrap';
import { LIGHT_PRESETS } from '../world/timeOfDay';
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
  useUi.setState({ timeOfDay: 'day', showHousing: true });
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
  await waitFor(() => expect(api.setMarkers).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ text: '♥ 1,000/55' })]), 'listing'));
  const texts = (api.setMarkers.mock.calls.at(-1)![0] as { text: string }[]).map((m) => m.text);
  expect(texts).toEqual(['♥ 1,000/55', '1,000/55']);
});

test('time of day buttons drive the 3D lighting', async () => {
  renderWithClient(<><TopBar /><WorldEffects /></>);
  await waitFor(() => expect(api.setTimeOfDay).toHaveBeenCalledWith('day'));
  fireEvent.click(screen.getByLabelText('밤'));
  await waitFor(() => expect(api.setTimeOfDay).toHaveBeenLastCalledWith('night'));
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
  await waitFor(() => expect(api.setMarkers).toHaveBeenCalledWith([expect.objectContaining({ text: '🏪 GS25' })], 'nearby'));
  await act(async () => { useUi.setState({ showHousing: false }); });
  await waitFor(() => expect(api.setBeacons).toHaveBeenLastCalledWith([]));
});
