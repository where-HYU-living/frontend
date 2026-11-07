import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { renderWithClient } from '../../test/wrap';

let credentialCb: ((r: { credential?: string }) => void) | null = null;
const initialize = vi.fn((o: { callback: typeof credentialCb }) => { credentialCb = o.callback; });
const renderButton = vi.fn();
vi.mock('./loadGoogle', () => ({ GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', loadGoogle: () => Promise.resolve({ initialize, renderButton }) }));

import { LoginModal } from '../LoginModal';
import { useSession } from '../state/session';

const fetchMock = vi.fn();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); credentialCb = null; useSession.setState({ token: null, nickname: null, loginOpen: true }); });
afterEach(() => { cleanup(); fetchMock.mockReset(); initialize.mockClear(); renderButton.mockClear(); vi.unstubAllGlobals(); });

test('google button restricts the picker to hanyang.ac.kr and sends the id token to the server', async () => {
  fetchMock.mockResolvedValue(json({ accessToken: 'jwt', expiresIn: 1, user: { id: 1, email: 'a@hanyang.ac.kr', nickname: '한양1234' } }));
  renderWithClient(<LoginModal />);
  await waitFor(() => expect(renderButton).toHaveBeenCalled());
  expect(initialize.mock.calls[0][0]).toMatchObject({ client_id: 'cid.apps.googleusercontent.com', hd: 'hanyang.ac.kr' });
  credentialCb!({ credential: 'ID.TOKEN.JWT' });
  await waitFor(() => expect(useSession.getState().token).toBe('jwt'));
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toContain('/api/v1/auth/google');
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ idToken: 'ID.TOKEN.JWT' });
  expect(useSession.getState().loginOpen).toBe(false);
});

test('a non-hanyang google account shows a friendly message and stays logged out', async () => {
  fetchMock.mockResolvedValue(json({ code: 'INVALID_EMAIL_DOMAIN', message: 'x' }, 400));
  renderWithClient(<LoginModal />);
  await waitFor(() => expect(renderButton).toHaveBeenCalled());
  credentialCb!({ credential: 'T' });
  expect(await screen.findByText(/한양대 메일\(@hanyang.ac.kr\)만 가능해요/)).toBeTruthy();
  expect(useSession.getState().token).toBeNull();
});
