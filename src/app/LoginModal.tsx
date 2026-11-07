import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { LoginResult } from '../api/types';
import { useSession } from './state/session';
import { GoogleButton } from './auth/GoogleButton';
import { GOOGLE_CLIENT_ID } from './auth/loadGoogle';
import { Field } from './forms/Field';
import './forms/forms.css';

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_DOMAIN: '한양대 메일(@hanyang.ac.kr)만 가능해요. 한양대 구글 계정으로 로그인해 주세요',
  CODE_MISMATCH: '인증 코드가 맞지 않아요',
  CODE_EXPIRED: '인증 코드가 만료됐어요. 다시 받아 주세요',
  TOO_MANY_REQUESTS: '1분 뒤 다시 보낼 수 있어요',
  NETWORK: '서버에 연결할 수 없어요',
  INVALID_GOOGLE_TOKEN: '구글 로그인을 확인하지 못했어요. 다시 시도해 주세요',
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
  const google = (idToken: string) => run(async () => {
    const r = await api<LoginResult>('/auth/google', { method: 'POST', body: { idToken } });
    setLogin(r.accessToken, r.user.nickname);
  });
  const send = () => run(async () => { await api('/auth/email/send', { method: 'POST', body: { email: email.trim() } }); setSent(true); });
  const verify = () => run(async () => {
    const r = await api<LoginResult>('/auth/email/verify', { method: 'POST', body: { email: email.trim(), code: code.trim() } });
    setLogin(r.accessToken, r.user.nickname);
    setSent(false); setCode('');
  });

  return (
    <div className="ui-modal-back" onMouseDown={closeLogin}>
      <div className="ui-modal ui-modal-lg glass" role="dialog" aria-label="로그인" onMouseDown={(e) => e.stopPropagation()}>
        <h2>한양대 메일로 로그인</h2>
        <p className="ui-modal-sub">찜, 후기, 내 집 기록에 필요해요. 둘러보기는 로그인 없이 돼요.</p>
        {GOOGLE_CLIENT_ID && (<><GoogleButton clientId={GOOGLE_CLIENT_ID} onCredential={google} /><p className="ui-modal-or">또는 메일로 인증</p></>)}
        <Field label="학교 메일" hint={sent ? `${email.trim()} 로 코드를 보냈어요` : '한양대 메일(@hanyang.ac.kr)만 쓸 수 있어요'}>
          {(id, d) => <input id={id} type="email" placeholder="이름@hanyang.ac.kr" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} aria-label="학교 메일" aria-describedby={d} />}
        </Field>
        {sent && (
          <Field label="인증 코드" hint="메일함에 온 6자리 숫자를 넣어 주세요 (스팸함도 확인)">
            {(id, d) => <input id={id} inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} aria-label="인증 코드" aria-describedby={d} autoFocus style={{ letterSpacing: '.3em', textAlign: 'center' }} />}
          </Field>
        )}
        {error && <p className="ui-field-error" role="alert">{error}</p>}
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
