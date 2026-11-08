import { useSession } from '../app/state/session';
import { isMockMode } from '../mock/flag';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public details: unknown = null) {
    super(message);
  }
}

const BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8080').replace(/\/$/, '');

export type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export function buildQuery(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** 계약 규약: /api/v1 접두사, 토큰 있으면 Bearer, 실패 응답은 ApiError, 204 는 undefined */
export async function api<T>(path: string, init: { method?: string; body?: unknown; query?: Query; signal?: AbortSignal } = {}): Promise<T> {
  const token = useSession.getState().token;
  let res: Response;
  try {
    res = await doFetch(`${BASE}/api/v1${path}${buildQuery(init.query)}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('NETWORK', '서버에 연결할 수 없어요.', 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; message?: string; details?: unknown };
    // 만료된 토큰: 이 요청을 보낸 토큰이 아직 지금 토큰일 때만 (늦게 온 401 이 새로 로그인한 사람을 내보내지 않게).
    // 저장·쓰기 요청이었으면 로그인 창을 띄워 다시 로그인하고 이어서 하게 한다
    if (res.status === 401 && token && useSession.getState().token === token) {
      useSession.getState().logout();
      if ((init.method ?? 'GET') !== 'GET') useSession.getState().openLogin();
    }
    throw new ApiError(d.code ?? `HTTP_${res.status}`, d.message ?? '요청을 처리하지 못했어요.', res.status, d.details ?? null);
  }
  if (text && data === null) throw new ApiError('BAD_RESPONSE', '서버 응답을 읽지 못했어요.', res.status); // 2xx 인데 JSON 이 아님 (프록시 오류 화면 등)
  return data as T;
}

/** 목 모드(VITE_USE_MOCK=true 또는 ?mock=1)면 메모리 목 서버로, 아니면 진짜 fetch. 목 본체는 동적 import. */
const doFetch: typeof fetch = (input, init) =>
  isMockMode()
    ? import('../mock/server').then((m) => m.mockFetch(String(input), { method: init?.method, headers: init?.headers as Record<string, string>, body: init?.body, signal: init?.signal ?? undefined }))
    : fetch(input, init);

function safeJson(t: string): unknown {
  try { return JSON.parse(t); } catch { return null; }
}
