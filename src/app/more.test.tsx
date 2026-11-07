import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithClient } from '../test/wrap';
import { manToWon, thisMonth, validateReview, validDaysBefore } from './features/more';
import { ReviewSection } from './ReviewSection';
import { MyHomePanel, ReportCard } from './MyHomePanel';
import { TransferPanel } from './TransferPanel';
import { InboxPanel, unreadCount } from './InboxPanel';
import { LoginModal } from './LoginModal';
import { useSession } from './state/session';

const fetchMock = vi.fn();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); useSession.setState({ token: null, loginOpen: false }); });
afterEach(() => { cleanup(); fetchMock.mockReset(); vi.unstubAllGlobals(); });

test('pure validators', () => {
  const all = { noise: 3, light: 3, bugs: 3, landlord: 3, depositReturn: 3 };
  expect(validateReview(0, all, '')).toBe('별점을 골라 주세요');
  expect(validateReview(4, { noise: 3 }, '')).toBe('항목별 점수를 모두 골라 주세요');
  expect(validateReview(4, all, 'a'.repeat(501))).toBe('후기는 500자까지 쓸 수 있어요');
  expect(validateReview(4, all, 'a'.repeat(500))).toBeNull();
  expect([0, 1, 365, 366, 1.5].map(validDaysBefore)).toEqual([false, true, true, false, false]);
  expect([manToWon('45'), manToWon(''), manToWon('-1'), manToWon('abc')]).toEqual([450000, null, null, null]);
  expect(thisMonth(new Date(2026, 10, 7))).toBe('2026-11');
  expect(unreadCount([{ read: false }, { read: true }, { read: false }])).toBe(2);
});

test('reviews: empty state has no NaN, guest write opens login', async () => {
  fetchMock.mockResolvedValue(json({ average: null, count: 0, items: [] }));
  renderWithClient(<><ReviewSection targetType="LISTING" targetId={1} /><LoginModal /></>);
  expect(await screen.findByText('아직 후기가 없어요.')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/NaN/);
  fireEvent.click(screen.getByText('후기 쓰기'));
  expect(screen.getByRole('dialog', { name: '로그인' })).toBeTruthy();
});

test('reviews: submit stays disabled until rating and every score are chosen', async () => {
  useSession.setState({ token: 't' });
  fetchMock.mockResolvedValue(json({ average: 4.1, count: 1, items: [{ id: 1, rating: 4, scores: { noise: 4, light: 4, bugs: 4, landlord: 4, depositReturn: 4 }, text: '좋아요', pin: null, authorNickname: '한양1234', createdAt: 'x' }] }));
  renderWithClient(<ReviewSection targetType="LISTING" targetId={1} />);
  expect(await screen.findByText('좋아요')).toBeTruthy();
  fireEvent.click(screen.getByText('후기 쓰기'));
  const submit = screen.getByText('등록') as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  for (const n of ['별점', '방음', '채광', '벌레', '집주인', '보증금 반환']) fireEvent.click(screen.getByLabelText(`${n} 4점`));
  expect(submit.disabled).toBe(false);
});

test('report card: totals, previous month diff, cumulative excess, pending', async () => {
  useSession.setState({ token: 't' });
  const rep = { month: '2026-10', total: 742000, breakdown: { rent: 550000, mgmtFee: 80000, electricity: 42000, gas: 38000, water: 12000, internet: null }, prevTotal: 701000, diff: 41000, topIncrease: { item: 'gas', diff: 21000 }, excess: { monthly: 164000, cumulative: 1312000, grade: 'HIGH' } };
  fetchMock.mockResolvedValueOnce(json(rep));
  renderWithClient(<ReportCard month="2026-10" />);
  expect(await screen.findByText('이번 달 74.2만')).toBeTruthy();
  expect(screen.getByText('지난달보다 4.1만')).toBeTruthy();
  expect(screen.getByText('가스비 2.1만')).toBeTruthy();
  expect(screen.getAllByLabelText('올랐어요')).toHaveLength(2); // 아이콘으로 표시
  expect(screen.getByText(/지금까지 적정가보다 131.2만 원 더 냈어요/)).toBeTruthy();
  expect(screen.getByText('기록 없음')).toBeTruthy(); // 인터넷 null
  cleanup();
  fetchMock.mockResolvedValueOnce(json({ ...rep, prevTotal: null, diff: null, topIncrease: null, excess: null }));
  renderWithClient(<ReportCard month="2026-10" />);
  expect(await screen.findByText('적정가 대비 초과액은 판정 보류예요.')).toBeTruthy();
  expect(screen.queryByText(/지난달보다/)).toBeNull();
});

test('my home: guest sees login prompt, 404 shows the registration form', async () => {
  renderWithClient(<MyHomePanel />);
  expect(screen.getByText('로그인하면 내 집의 월세와 공과금을 기록할 수 있어요.')).toBeTruthy();
  cleanup();
  useSession.setState({ token: 't' });
  fetchMock.mockResolvedValue(json({ code: 'NOT_FOUND', message: 'x' }, 404));
  renderWithClient(<MyHomePanel />);
  expect(await screen.findByLabelText('보증금(만원)')).toBeTruthy();
  expect((screen.getByText('등록') as HTMLButtonElement).disabled).toBe(true); // 주소 없이는 등록 불가
});

test('transfer: guest cannot write, list shows items and empty state', async () => {
  fetchMock.mockResolvedValue(json({ items: [], page: 0, size: 100, total: 0 }));
  renderWithClient(<><TransferPanel /><LoginModal /></>);
  expect(await screen.findByText('올라온 양도 글이 아직 없어요.')).toBeTruthy();
  fireEvent.click(screen.getByText('양도 글 올리기'));
  expect(screen.getByRole('dialog', { name: '로그인' })).toBeTruthy();
});

test('transfer form: picking an address fills the form and money goes out in won', async () => {
  useSession.setState({ token: 't' });
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/geo/address')) return Promise.resolve(json([{ address: '성동구 행당동 1-1', roadAddress: null, dong: '행당동', lat: 37.558, lng: 127.041 }]));
    if (url.includes('/transfers') && init?.method === 'POST') return Promise.resolve(json({ id: 9 }, 201));
    return Promise.resolve(json({ items: [], page: 0, size: 100, total: 0 }));
  });
  renderWithClient(<TransferPanel />);
  fireEvent.click(await screen.findByText('양도 글 올리기'));
  fireEvent.change(screen.getByLabelText('글 제목'), { target: { value: '  행당동 분리형 8개월 양도  ' } });
  fireEvent.change(screen.getByLabelText('주소 검색'), { target: { value: '행당동' } });
  fireEvent.click(await screen.findByText('성동구 행당동 1-1'));
  fireEvent.change(screen.getByLabelText('보증금(만원)'), { target: { value: '500' } });
  fireEvent.change(screen.getByLabelText('월세(만원)'), { target: { value: '45' } });
  fireEvent.change(screen.getByLabelText('면적(㎡)'), { target: { value: '18' } });
  fireEvent.change(screen.getByLabelText('남은 계약(개월)'), { target: { value: '8' } });
  fireEvent.click(screen.getByText('올리기'));
  await waitFor(() => {
    const call = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toMatchObject({ title: '행당동 분리형 8개월 양도', rent: 450000, deposit: 5000000, dong: '행당동', lat: 37.558, remainingMonths: 8 }); // 제목은 공백을 지우고 그대로
  });
});

test('transfer form: title is required, can be suggested from the address, and shows its length', async () => {
  useSession.setState({ token: 't' });
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/geo/address')) return Promise.resolve(json([{ address: '성동구 행당동 1-1', roadAddress: null, dong: '행당동', lat: 37.558, lng: 127.041 }]));
    return Promise.resolve(json({ items: [], page: 0, size: 100, total: 0 }));
  });
  renderWithClient(<TransferPanel />);
  fireEvent.click(await screen.findByText('양도 글 올리기'));
  const title = screen.getByLabelText('글 제목') as HTMLInputElement;
  expect(title.maxLength).toBe(40);
  expect(screen.getByText(/0\/40자/)).toBeTruthy();
  // 주소를 고르면 제목을 제안하고, 누르면 채워진다
  fireEvent.change(screen.getByLabelText('주소 검색'), { target: { value: '행당동' } });
  fireEvent.click(await screen.findByText('성동구 행당동 1-1'));
  fireEvent.click(await screen.findByText(/이렇게 쓸까요/));
  expect(title.value).toBe('행당동 오픈형 양도');
  // 제목을 지우고 1글자만 적으면 올릴 수 없고 이유를 알려 준다
  fireEvent.change(title, { target: { value: '가' } });
  fireEvent.blur(title);
  expect(screen.getByText('2자 이상 40자 이하로 적어 주세요')).toBeTruthy();
  expect((screen.getByText('올리기') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/제목/, { selector: '.ui-sticky-reason, [class*="reason"], p' })).toBeTruthy();
});

test('transfer list: the title comes first on the card, then price and remaining months', async () => {
  fetchMock.mockResolvedValue(json({ items: [{ id: 5, title: '입대로 급하게 양도해요', address: 'a', dong: '행당동', lat: 37.558, lng: 127.041, deposit: 1000000, rent: 500000, mgmtFee: null, areaM2: 18, floor: 3, roomType: 'OPEN', convertedRent: 600000, grade: 'FAIR', walkMin: 7, thumbnailUrl: null, favorited: false, remainingMonths: 8, availableFrom: null, status: 'OPEN', authorNickname: 'a' }], page: 0, size: 100, total: 1 }));
  renderWithClient(<TransferPanel />);
  const title = await screen.findByText('입대로 급하게 양도해요');
  const card = title.closest('button')!;
  expect(title.className).toContain('ui-dc-title');
  expect(card.textContent).toContain('남은 계약 8개월');
  expect(card.textContent).toContain('100/50'); // 보증금/월세
  expect(card.querySelector('.ui-dc-top')!.textContent).toContain('입대로 급하게 양도해요'); // 제목은 맨 윗줄
});

test('inbox: unread marked with dot, click marks read', async () => {
  useSession.setState({ token: 't' });
  fetchMock.mockImplementation((_u: string, init?: RequestInit) => Promise.resolve(init?.method === 'PATCH' ? new Response(null, { status: 204 }) : json([{ id: 1, type: 'HOUSING_DDAY', title: '청아진 접수 D-1', body: '내일 접수 마감', targetType: null, targetId: null, createdAt: 'x', read: false }])));
  renderWithClient(<InboxPanel />);
  expect(await screen.findByText('청아진 접수 D-1')).toBeTruthy();
  expect(screen.getByLabelText('안 읽음')).toBeTruthy();
  fireEvent.click(screen.getByText('청아진 접수 D-1'));
  await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/me/notifications/1/read'))).toBe(true));
});
