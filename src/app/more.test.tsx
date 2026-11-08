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
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); useSession.setState({ token: null, loginOpen: false }); localStorage.clear(); });
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
  expect(await screen.findByText(/아직 후기가 없어요/)).toBeTruthy();
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

const HOME = { address: '서울 성동구 행당동 행당로 19-4', dong: '행당동', lat: 37.558, lng: 127.04, deposit: 20000000, rent: 860000, mgmtFee: 100000, areaM2: 20, contractStart: '2026-01-12', contractEnd: '2028-01-12' };
function homeServer(state: { payments: { month: string; amount: number; paidAt: string }[]; utilities: Record<string, unknown>[]; alerts: { id: number; daysBefore: number; enabled: boolean }[] }) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const m = init?.method ?? 'GET', body = init?.body ? JSON.parse(init.body as string) : null;
    if (url.includes('/me/home/alerts')) {
      if (m === 'POST') { state.alerts.push({ id: state.alerts.length + 10, daysBefore: body.daysBefore, enabled: true }); return Promise.resolve(json(state.alerts.at(-1), 201)); }
      if (m === 'DELETE') { const id = Number(url.split('/').pop()); state.alerts = state.alerts.filter((a) => a.id !== id); return Promise.resolve(new Response(null, { status: 204 })); }
      return Promise.resolve(json(state.alerts));
    }
    if (url.includes('/me/home')) return Promise.resolve(json(HOME));
    if (url.includes('/me/payments')) { if (m === 'POST') { state.payments.push(body); return Promise.resolve(json(body, 201)); } return Promise.resolve(json(state.payments)); }
    if (url.includes('/me/utilities')) { if (m === 'POST') { state.utilities.push(body); return Promise.resolve(json(body, 201)); } return Promise.resolve(json(state.utilities)); }
    if (url.includes('/me/report')) return Promise.resolve(json({ month: thisMonth(), total: 960000, breakdown: { rent: 860000, mgmtFee: 100000, electricity: null, gas: null, water: null, internet: null }, prevTotal: null, diff: null, topIncrease: null, excess: null }));
    return Promise.resolve(json({}));
  });
}

test('my home: 계약 월세 그대로면 버튼 한 번으로 기록, 공과금은 이미 적은 값이 채워지고 바꿨을 때만 저장', async () => {
  useSession.setState({ token: 't' });
  const st = { payments: [] as { month: string; amount: number; paidAt: string }[], utilities: [{ month: thisMonth(), electricity: 30000, gas: null, water: null, internet: null }], alerts: [] };
  homeServer(st);
  renderWithClient(<MyHomePanel />);
  fireEvent.click(await screen.findByText('월세 86만 냈어요'));
  await waitFor(() => expect(st.payments[0]).toMatchObject({ month: thisMonth(), amount: 860000 }));
  expect(await screen.findByText(/냈어요/, { selector: '.ui-home-row-main' })).toBeTruthy();
  const elec = screen.getByLabelText('전기(만원)') as HTMLInputElement;
  expect(elec.value).toBe('3'); // 저장된 값이 채워져 있다 (빈칸으로 덮어쓰지 않게)
  const save = screen.getByText(/저장돼 있어요/).closest('button') as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('가스비(만원)'), { target: { value: '2.5' } });
  fireEvent.click(screen.getByText('공과금 기록'));
  await waitFor(() => expect(st.utilities.at(-1)).toMatchObject({ electricity: 30000, gas: 25000, water: null }));
});

test('my home: 알림 칩을 누르면 바로 켜지고 다시 누르면 꺼진다', async () => {
  useSession.setState({ token: 't' });
  const st = { payments: [], utilities: [], alerts: [] as { id: number; daysBefore: number; enabled: boolean }[] };
  homeServer(st);
  renderWithClient(<MyHomePanel />);
  const chip = await screen.findByRole('button', { name: '30일 전' });
  expect(chip.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(chip);
  await waitFor(() => expect(screen.getByRole('button', { name: '30일 전' }).getAttribute('aria-pressed')).toBe('true'));
  fireEvent.click(screen.getByRole('button', { name: '30일 전' }));
  await waitFor(() => expect(st.alerts).toHaveLength(0));
});

test('my home: 수정은 지금 값이 채워진 채로 열리고 취소할 수 있다', async () => {
  useSession.setState({ token: 't' });
  homeServer({ payments: [], utilities: [], alerts: [] });
  renderWithClient(<MyHomePanel />);
  fireEvent.click(await screen.findByText('수정'));
  expect((screen.getByLabelText('보증금(만원)') as HTMLInputElement).value).toBe('2000');
  expect((screen.getByLabelText('월세(만원)') as HTMLInputElement).value).toBe('86');
  expect(screen.getByText('2026년 1월 12일 (월)')).toBeTruthy();
  expect(screen.getByText('서울 성동구 행당동 행당로 19-4')).toBeTruthy();
  expect((screen.getByText('저장') as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByText('취소'));
  expect(await screen.findByText('월세 86만 냈어요')).toBeTruthy();
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

test('transfer form: title fills itself from address·room·months, can be edited and reverted, and is required', async () => {
  useSession.setState({ token: 't' });
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/geo/address')) return Promise.resolve(json([{ address: '성동구 행당동 1-1', roadAddress: null, dong: '행당동', lat: 37.558, lng: 127.041 }]));
    return Promise.resolve(json({ items: [], page: 0, size: 100, total: 0 }));
  });
  renderWithClient(<TransferPanel />);
  fireEvent.click(await screen.findByText('양도 글 올리기'));
  const title = screen.getByLabelText('글 제목') as HTMLInputElement;
  expect(title.maxLength).toBe(40);
  expect(title.value).toBe('');
  // 주소를 고르면 제목이 자동으로 채워지고, 방 구조·남은 개월을 고르면 따라 바뀐다
  fireEvent.change(screen.getByLabelText('주소 검색'), { target: { value: '행당동' } });
  fireEvent.click(await screen.findByText('성동구 행당동 1-1'));
  expect(title.value).toBe('행당동 오픈형 양도');
  fireEvent.click(screen.getByRole('radio', { name: '분리형' }));
  fireEvent.click(screen.getByRole('button', { name: '6개월' }));
  expect(title.value).toBe('행당동 분리형 6개월 양도');
  // 직접 고치면 그 뒤로는 자동으로 바꾸지 않고, 되돌리기로 다시 자동 제목
  fireEvent.change(title, { target: { value: '가' } });
  fireEvent.blur(title);
  expect(screen.getByText('2자 이상 40자 이하로 적어 주세요')).toBeTruthy();
  expect((screen.getByText('올리기') as HTMLButtonElement).disabled).toBe(true);
  expect(document.querySelector('.ui-sticky-reason button')?.textContent).toMatch(/입력이 필요해요|비었어요/); // 눌러서 빈 칸으로 간다
  fireEvent.click(screen.getByRole('radio', { name: '1.5룸' }));
  expect(title.value).toBe('가');
  fireEvent.click(screen.getByText(/자동 제목으로 되돌리기/));
  expect(title.value).toBe('행당동 1.5룸 6개월 양도');
});

test('transfer form: unfinished new post is kept as a draft and restored, 새로 쓰기 clears it', async () => {
  useSession.setState({ token: 't' });
  fetchMock.mockResolvedValue(json({ items: [], page: 0, size: 100, total: 0 }));
  renderWithClient(<TransferPanel />);
  fireEvent.click(await screen.findByText('양도 글 올리기'));
  fireEvent.change(screen.getByLabelText('보증금(만원)'), { target: { value: '1,000만' } }); // 숫자만 남는다
  expect((screen.getByLabelText('보증금(만원)') as HTMLInputElement).value).toBe('1000');
  expect(screen.getByText('1,000만 원')).toBeTruthy(); // 읽기 쉽게
  cleanup();
  renderWithClient(<TransferPanel />);
  fireEvent.click(await screen.findByText('양도 글 올리기'));
  expect(screen.getByText('쓰던 글을 이어서 써요.')).toBeTruthy();
  expect((screen.getByLabelText('보증금(만원)') as HTMLInputElement).value).toBe('1000');
  fireEvent.click(screen.getByText('새로 쓰기'));
  expect((screen.getByLabelText('보증금(만원)') as HTMLInputElement).value).toBe('');
  expect(localStorage.getItem('chatatda.transferDraft')).toBeNull();
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
