import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithClient } from '../test/wrap';
import { ListingsPanel } from './ListingsPanel';
import { LoginModal } from './LoginModal';
import { HeartButton } from './HeartButton';
import { NO_FILTERS, useListingsUi } from './features/listings';
import { useSession } from './state/session';

const fetchMock = vi.fn();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const item = (o: object) => ({ id: 1, title: '행당동 원룸', address: 'a', dong: '행당동', lat: 37.558, lng: 127.041, deposit: 10000000, rent: 550000, mgmtFee: null, areaM2: 18.2, floor: null, roomType: 'OPEN', convertedRent: 712000, grade: 'HIGH', walkMin: null, thumbnailUrl: null, favorited: false, ...o });

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); useListingsUi.setState({ filters: NO_FILTERS, selectedId: null }); useSession.setState({ token: null, loginOpen: false }); });
afterEach(() => { cleanup(); fetchMock.mockReset(); vi.unstubAllGlobals(); });

test('lists listings with grade badge and null walk time as 정보 없음', async () => {
  fetchMock.mockResolvedValue(json({ items: [item({}), item({ id: 2, grade: 'PENDING', title: '표본 없음' })], page: 0, size: 100, total: 2 }));
  renderWithClient(<ListingsPanel />);
  expect((await screen.findAllByText('1,000/55')).length).toBe(2);
  expect([...document.querySelectorAll('.ui-card-badge')].map((e) => e.textContent)).toEqual(['비쌈', '판정 보류']);
  expect(screen.getAllByText('도보 정보 없음').length).toBe(2);
  expect(document.body.textContent).not.toMatch(/NaN|undefined/);
});

test('shows an empty message and a connection error message', async () => {
  fetchMock.mockResolvedValueOnce(json({ items: [], page: 0, size: 100, total: 0 }));
  renderWithClient(<ListingsPanel />);
  expect(await screen.findByText('조건에 맞는 매물이 없어요.')).toBeTruthy();
  cleanup();
  fetchMock.mockRejectedValue(new TypeError('x'));
  useListingsUi.setState({ filters: { ...NO_FILTERS, maxRentMan: '1' } });
  renderWithClient(<ListingsPanel />);
  expect(await screen.findByText('서버에 연결할 수 없어요.')).toBeTruthy();
});

test('grade chip and rent filter go to the request in won', async () => {
  fetchMock.mockResolvedValue(json({ items: [], page: 0, size: 100, total: 0 }));
  renderWithClient(<ListingsPanel />);
  fireEvent.click(screen.getByText('범인'));
  fireEvent.change(screen.getByLabelText('월세 상한(만원)'), { target: { value: '60' } });
  await waitFor(() => {
    const url = fetchMock.mock.calls.at(-1)![0] as string;
    expect(url).toContain('grade=CULPRIT');
    expect(url).toContain('maxRent=600000');
  });
});

test('guest heart click opens login and sends no request', () => {
  renderWithClient(<><HeartButton type="LISTING" id={1} favorited={false} /><LoginModal /></>);
  fireEvent.click(screen.getByLabelText('찜하기'));
  expect(screen.getByRole('dialog', { name: '로그인' })).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('login rejects non-hanyang mail with a friendly message', async () => {
  useSession.setState({ loginOpen: true });
  fetchMock.mockResolvedValue(json({ code: 'INVALID_EMAIL_DOMAIN', message: 'x' }, 400));
  renderWithClient(<LoginModal />);
  fireEvent.change(screen.getByLabelText('학교 메일'), { target: { value: 'a@gmail.com' } });
  fireEvent.click(screen.getByText('인증 코드 받기'));
  expect(await screen.findByText(/한양대 메일\(@hanyang.ac.kr\)만 가능해요/)).toBeTruthy();
});
