import { useSession } from '../app/state/session';

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
    res = await fetch(`${BASE}/api/v1${path}${buildQuery(init.query)}`, {
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
    if (res.status === 401 && token) useSession.getState().logout(); // 만료된 토큰
    throw new ApiError(d.code ?? `HTTP_${res.status}`, d.message ?? '요청을 처리하지 못했어요.', res.status, d.details ?? null);
  }
  return data as T;
}

function safeJson(t: string): unknown {
  try { return JSON.parse(t); } catch { return null; }
}
