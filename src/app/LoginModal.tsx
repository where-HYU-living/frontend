import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { LoginResult } from '../api/types';
import { useSession } from './state/session';
import { GoogleButton } from './auth/GoogleButton';
import { GOOGLE_CLIENT_ID } from './auth/loadGoogle';
import './forms/forms.css';

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_DOMAIN: '한양대 메일(@hanyang.ac.kr)만 가능해요. 한양대 구글 계정으로 로그인해 주세요',
  NETWORK: '서버에 연결할 수 없어요',
  INVALID_GOOGLE_TOKEN: '구글 로그인을 확인하지 못했어요. 다시 시도해 주세요',
};
const msgOf = (e: unknown) => (e instanceof ApiError ? MESSAGES[e.code] ?? e.message : '문제가 생겼어요');

/**
 * 로그인은 한양대 구글 계정 하나뿐이다 (도메인 검사는 서버).
 * 메일 코드 인증(/auth/email/*)은 화면에서 뺐지만 서버에는 남아 있다 — 자동 점검(final-qa)·백엔드 테스트가 그 길로 로그인한다.
 */
export function LoginModal() {
  const { loginOpen, closeLogin, setLogin } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!loginOpen) return null;

  const google = async (idToken: string) => {
    setBusy(true); setError('');
    try {
      const r = await api<LoginResult>('/auth/google', { method: 'POST', body: { idToken } });
      setLogin(r.accessToken, r.user.nickname);
    } catch (e) { setError(msgOf(e)); } finally { setBusy(false); }
  };

  return (
    <div className="ui-modal-back" onMouseDown={closeLogin}>
      <div className="ui-modal ui-modal-lg glass" role="dialog" aria-label="로그인" aria-busy={busy} onMouseDown={(e) => e.stopPropagation()}>
        <h2>한양대 구글 계정으로 로그인</h2>
        <p className="ui-modal-sub">찜, 후기, 내 집 기록에 필요해요. 둘러보기는 로그인 없이 돼요.</p>
        {GOOGLE_CLIENT_ID
          ? <GoogleButton clientId={GOOGLE_CLIENT_ID} onCredential={google} />
          : <p className="ui-modal-error" role="alert">지금은 로그인을 쓸 수 없어요 (구글 로그인 설정이 없어요).</p>}
        {error && <p className="ui-field-error" role="alert">{error}</p>}
        <div className="ui-modal-actions">
          <button type="button" className="ghost" onClick={closeLogin}>닫기</button>
        </div>
      </div>
    </div>
  );
}
