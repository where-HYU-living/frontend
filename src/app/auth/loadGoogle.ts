// 구글 로그인(Google Identity Services)을 로그인 창을 처음 열 때 한 번만 불러온다.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type GoogleId = any;

let loading: Promise<GoogleId> | null = null;

export function loadGoogle(timeoutMs = 10000): Promise<GoogleId> {
  if (loading) return loading;
  loading = new Promise<GoogleId>((resolve, reject) => {
    const w = window as unknown as { google?: { accounts?: { id?: GoogleId } } };
    if (w.google?.accounts?.id) return resolve(w.google.accounts.id);
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => { clearTimeout(timer); w.google?.accounts?.id ? resolve(w.google.accounts.id) : reject(new Error('SCRIPT')); };
    s.onerror = () => { clearTimeout(timer); reject(new Error('SCRIPT')); };
    document.head.appendChild(s);
  }).catch((e) => { loading = null; throw e; });
  return loading;
}

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
