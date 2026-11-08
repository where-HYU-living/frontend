// 최종 QA(2026-11)에서 고친 것들이 다시 깨지지 않게
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { isTypingTarget } from '../lib/keys';
import { excessPhrase } from './MyHomePanel';
import { isPersonal, refreshPersonal, watchSession } from './features/personal';
import { useSession } from './state/session';
import { ErrorBoundary } from './ErrorBoundary';
import { api } from '../api/client';

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); useSession.setState({ token: null, nickname: null, loginOpen: false }); });
afterEach(() => { cleanup(); fetchMock.mockReset(); vi.unstubAllGlobals(); });

test('입력칸·글상자·선택 상자에서 치는 키는 3D 이동으로 보지 않는다', () => {
  for (const tag of ['input', 'textarea', 'select']) expect(isTypingTarget(document.createElement(tag))).toBe(true);
  expect(isTypingTarget(document.createElement('canvas'))).toBe(false);
  expect(isTypingTarget(window)).toBe(false);
  expect(isTypingTarget(null)).toBe(false);
});

test('월간 리포트: 적정가보다 싸면 "덜 냈어요", 비싸면 "더 냈어요", 1만 원 안쪽이면 거의 같다', () => {
  expect(excessPhrase({ monthly: 540_000, cumulative: 1_620_000 })).toBe('지금까지 적정가보다 162만 원 더 냈어요 (한 달에 54만)');
  expect(excessPhrase({ monthly: -40_000, cumulative: -120_000 })).toBe('지금까지 적정가보다 12만 원 덜 냈어요 (한 달에 4만)');
  expect(excessPhrase({ monthly: 3_000, cumulative: 0 })).toBe('적정가와 거의 같게 내고 있어요');
  expect(excessPhrase({ monthly: 50_000, cumulative: 0 })).toBe('이번 달 적정가보다 5만 더 냈어요'); // 계약 첫 달
  expect(excessPhrase({ monthly: -50_000, cumulative: 0 })).not.toMatch(/-/);
});

test('사람마다 다른 값이 든 쿼리: 목록·상세·판결은 다시 받고, 학과·건물·평면도 같은 공용 값은 그대로', () => {
  expect(isPersonal(['listings', {}])).toBe(true);
  expect(isPersonal(['price-check', 1])).toBe(true);
  expect(isPersonal(['housing'])).toBe(true);
  expect(isPersonal(['departments'])).toBe(false);
  expect(isPersonal(['floorplan', 3])).toBe(false);
});

test('로그아웃·다른 계정 로그인: 앞사람 /me 기록을 지우고 목록은 다시 받게 표시한다', async () => {
  const qc = new QueryClient();
  useSession.setState({ token: 'A' });
  qc.setQueryData(['favorites', 'A'], [{ type: 'LISTING', targetId: 1 }]);
  qc.setQueryData(['home', 'A'], { address: 'a' });
  qc.setQueryData(['listings', {}], { items: [{ id: 1, favorited: true }] });
  qc.setQueryData(['departments'], [{ id: 1 }]);
  const cleared = vi.fn();
  const off = watchSession(qc, cleared);
  useSession.setState({ token: 'B' });
  expect(cleared).toHaveBeenCalledTimes(1);
  expect(qc.getQueryData(['favorites', 'A'])).toBeUndefined();
  expect(qc.getQueryData(['home', 'A'])).toBeUndefined();
  expect(qc.getQueryState(['listings', {}])?.isInvalidated).toBe(true);
  expect(qc.getQueryState(['departments'])?.isInvalidated).toBe(false);
  useSession.setState({ nickname: 'x' }); // 토큰이 그대로면 아무것도 안 한다
  expect(cleared).toHaveBeenCalledTimes(1);
  off();
  await refreshPersonal(qc);
});

test('늦게 온 401 은 새로 로그인한 사람을 내보내지 않는다', async () => {
  useSession.setState({ token: 'old' });
  let release!: (r: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise<Response>((r) => { release = r; }));
  const p = api('/me/profile').catch((e) => e);
  useSession.setState({ token: 'new' }); // 응답이 오기 전에 다른 계정으로 로그인
  release(new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'x' }), { status: 401 }));
  await p;
  expect(useSession.getState().token).toBe('new');
});

test('저장 요청이 401 이면 로그아웃하고 로그인 창을 띄운다', async () => {
  useSession.setState({ token: 't' });
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'x' }), { status: 401 }));
  await api('/me/home', { method: 'PUT', body: {} }).catch(() => null);
  expect(useSession.getState().token).toBeNull();
  expect(useSession.getState().loginOpen).toBe(true);
});

test('2xx 인데 JSON 이 아니면 오류로 본다 (빈 화면 대신 오류 안내)', async () => {
  fetchMock.mockResolvedValueOnce(new Response('<html>gateway</html>', { status: 200 }));
  await expect(api('/listings')).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
});

test('오류 경계: 화면 일부가 터져도 그 자리만 안내로 바뀌고 닫기를 누를 수 있다', () => {
  const Boom = () => { throw new Error('boom'); };
  const onClose = vi.fn();
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<div><p>3D 화면</p><ErrorBoundary label="지도" place="center" onClose={onClose}><Boom /></ErrorBoundary></div>);
  expect(screen.getByText('3D 화면')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('지도을(를) 보여 주지 못했어요');
  fireEvent.click(screen.getByRole('button', { name: '닫기' }));
  expect(onClose).toHaveBeenCalled();
  spy.mockRestore();
});

test('새 배포 뒤 옛 코드 조각을 못 불러오면 새로고침을 권한다', () => {
  const Stale = () => { throw new Error('Failed to fetch dynamically imported module: /assets/KakaoMap-old.js'); };
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<ErrorBoundary label="지도" place="center"><Stale /></ErrorBoundary>);
  expect(screen.getByRole('alert').textContent).toContain('새 버전이 올라왔어요');
  expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  spy.mockRestore();
});
