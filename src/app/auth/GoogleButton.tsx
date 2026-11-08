import { useEffect, useRef, useState } from 'react';
import { loadGoogle } from './loadGoogle';

/** 구글 로그인 버튼. 계정을 고르면 ID 토큰(JWT)을 onCredential 로 넘긴다. 도메인 검사는 서버가 한다 */
export function GoogleButton({ clientId, onCredential }: { clientId: string; onCredential: (idToken: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    loadGoogle()
      .then((gid) => {
        if (dead || !ref.current) return;
        // hd 는 계정 선택창에 한양대 계정만 보이게 하는 힌트일 뿐이다 (우회 가능, 검증은 서버)
        gid.initialize({ client_id: clientId, hd: 'hanyang.ac.kr', callback: (r: { credential?: string }) => { if (r.credential) cb.current(r.credential); } });
        gid.renderButton(ref.current, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'ko', width: 280 });
      })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; };
  }, [clientId]);

  if (failed) return <p className="ui-modal-error" role="alert">구글 로그인을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.</p>;
  return <div ref={ref} className="ui-google" aria-label="Google로 로그인" />;
}
