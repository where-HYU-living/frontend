import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithClient } from '../test/wrap';
import { DormPanel } from './DormPanel';
import { HousingPanel } from './HousingPanel';
import { FavoritesPanel } from './FavoritesPanel';
import { useSession } from './state/session';
import { useUi } from './state/ui';

const fetchMock = vi.fn();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); useSession.setState({ token: null }); useUi.setState({ indoor: null }); });
afterEach(() => { cleanup(); fetchMock.mockReset(); vi.unstubAllGlobals(); });

test('dorm card shows monthly cost with meal note and indoor button only with floorplan', async () => {
  fetchMock.mockResolvedValue(json([{ id: 1, name: '제1기숙사', lat: 37.55, lng: 127.04, roomTypes: [
    { id: 1, name: '2인실', capacity: 2, semesterFee: 1800000, semesterMonths: 6, mealIncluded: true, monthlyCost: 300000, floorplanId: 7 },
    { id: 2, name: '4인실', capacity: 4, semesterFee: 1200000, semesterMonths: 6, mealIncluded: false, monthlyCost: 200000, floorplanId: null },
  ] }]));
  renderWithClient(<DormPanel />);
  expect(await screen.findByText(/월 30만 원 \(식비 포함\)/)).toBeTruthy();
  expect(screen.getByText(/월 20만 원 \(식비 별도\)/)).toBeTruthy();
  expect(screen.getAllByText('실내 들어가기')).toHaveLength(1);
});

test('housing list shows recruiting badge and empty state', async () => {
  fetchMock.mockResolvedValueOnce(json([{ id: 1, name: '왕십리역 청아진', address: '성동구', lat: 1, lng: 1, recruiting: true, nextEvent: null, subscribed: false }]));
  renderWithClient(<HousingPanel />);
  expect(await screen.findByText('모집 중')).toBeTruthy();
  cleanup();
  fetchMock.mockResolvedValueOnce(json([]));
  renderWithClient(<HousingPanel />);
  expect(await screen.findByText('등록된 단지가 아직 없어요.')).toBeTruthy();
});

test('favorites asks guests to log in and lists items for members', async () => {
  renderWithClient(<FavoritesPanel />);
  expect(screen.getByText('로그인하면 찜한 집을 모아 볼 수 있어요.')).toBeTruthy();
  cleanup();
  useSession.setState({ token: 't' });
  fetchMock.mockResolvedValue(json([{ type: 'DORM', targetId: 1, name: '제1기숙사', lat: 1, lng: 1, convertedRent: 300000, grade: null, walkMin: null, createdAt: 'x' }]));
  renderWithClient(<FavoritesPanel />);
  expect(await screen.findByText('제1기숙사')).toBeTruthy();
  expect(document.querySelector('.ui-card-badge')).toBeNull(); // 기숙사는 등급 배지 없음
});
