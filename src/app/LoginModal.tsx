import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { LoginResult } from '../api/types';
import { useSession } from './state/session';

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_DOMAIN: '한양대 메일(@hanyang.ac.kr)만 가능해요',
  CODE_MISMATCH: '인증 코드가 맞지 않아요',
  CODE_EXPIRED: '인증 코드가 만료됐어요. 다시 받아 주세요',
  TOO_MANY_REQUESTS: '1분 뒤 다시 보낼 수 있어요',
  NETWORK: '서버에 연결할 수 없어요',
};
const msgOf = (e: unknown) => (e instanceof ApiError ? MESSAGES[e.code] ?? e.message : '문제가 생겼어요');

export function LoginModal() {
  const { loginOpen, closeLogin, setLogin } = useSession();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!loginOpen) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(msgOf(e)); } finally { setBusy(false); }
  };
  const send = () => run(async () => { await api('/auth/email/send', { method: 'POST', body: { email: email.trim() } }); setSent(true); });
  const verify = () => run(async () => {
    const r = await api<LoginResult>('/auth/email/verify', { method: 'POST', body: { email: email.trim(), code: code.trim() } });
    setLogin(r.accessToken, r.user.nickname);
    setSent(false); setCode('');
  });

  return (
    <div className="ui-modal-back" onMouseDown={closeLogin}>
      <div className="ui-modal glass" role="dialog" aria-label="로그인" onMouseDown={(e) => e.stopPropagation()}>
        <h2>한양대 메일로 로그인</h2>
        <p className="ui-modal-sub">찜, 후기, 내 집 기록에 필요해요. 둘러보기는 로그인 없이 돼요.</p>
        <input type="email" placeholder="이름@hanyang.ac.kr" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} aria-label="학교 메일" />
        {sent && <input inputMode="numeric" maxLength={6} placeholder="인증 코드 6자리" value={code} onChange={(e) => setCode(e.target.value)} aria-label="인증 코드" autoFocus />}
        {error && <p className="ui-modal-error" role="alert">{error}</p>}
        <div className="ui-modal-actions">
          <button type="button" className="ghost" onClick={closeLogin}>닫기</button>
          {sent
            ? <button type="button" className="primary" disabled={busy || code.trim().length !== 6} onClick={verify}>확인</button>
            : <button type="button" className="primary" disabled={busy || !email.includes('@')} onClick={send}>인증 코드 받기</button>}
        </div>
      </div>
    </div>
  );
}
