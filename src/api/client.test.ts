import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, buildQuery } from './client';
import { useSession } from '../app/state/session';

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); useSession.setState({ token: null }); });
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); });

const res = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

test('buildQuery drops empty values and joins arrays', () => {
  expect(buildQuery({ maxRent: 500000, grade: undefined, x: null, g: ['HIGH', 'CULPRIT'], e: [] })).toBe('?maxRent=500000&g=HIGH%2CCULPRIT');
  expect(buildQuery({})).toBe('');
});

test('adds bearer token when logged in', async () => {
  useSession.setState({ token: 't' });
  fetchMock.mockResolvedValue(res(200, {}));
  await api('/listings');
  expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/listings');
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer t');
});

test('parses error body into ApiError', async () => {
  fetchMock.mockResolvedValue(res(404, { code: 'NOT_FOUND', message: '없어요', details: null }));
  await expect(api('/listings/1')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
});

test('204 resolves undefined, network failure becomes NETWORK', async () => {
  fetchMock.mockResolvedValueOnce(res(204));
  await expect(api('/x', { method: 'POST' })).resolves.toBeUndefined();
  fetchMock.mockRejectedValueOnce(new TypeError('fail'));
  const e = (await api('/x').catch((x: unknown) => x)) as ApiError;
  expect(e).toBeInstanceOf(ApiError);
  expect(e.code).toBe('NETWORK');
});

test('401 with a stored token logs out', async () => {
  useSession.setState({ token: 'old' });
  fetchMock.mockResolvedValue(res(401, { code: 'UNAUTHORIZED', message: '만료' }));
  await api('/me/profile').catch(() => {});
  expect(useSession.getState().token).toBeNull();
});
