// 카카오맵 SDK 를 지도를 처음 열 때 한 번만 불러온다 (외부 요청은 이때만 생긴다).
// 타입 패키지가 없어서 쓰는 부분만 느슨하게 any 로 다룬다.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Kakao = any;

let loading: Promise<Kakao> | null = null;

export function loadKakao(key: string | undefined, timeoutMs = 10000): Promise<Kakao> {
  if (!key) return Promise.reject(new Error('NO_KEY'));
  if (loading) return loading;
  loading = new Promise<Kakao>((resolve, reject) => {
    const w = window as unknown as { kakao?: Kakao };
    if (w.kakao?.maps?.Map) return resolve(w.kakao);
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=services`;
    s.async = true;
    s.onload = () => w.kakao.maps.load(() => { clearTimeout(timer); resolve(w.kakao); });
    s.onerror = () => { clearTimeout(timer); reject(new Error('SCRIPT')); };
    document.head.appendChild(s);
  }).catch((e) => { loading = null; throw e; }); // 실패하면 다시 시도할 수 있게
  return loading;
}

export const KAKAO_ERRORS: Record<string, string> = {
  NO_KEY: '카카오맵 키가 없어요 (.env 의 VITE_KAKAO_JS_KEY)',
  SCRIPT: '카카오맵을 불러오지 못했어요. 인터넷 연결과 콘솔의 도메인 등록을 확인해주세요',
  TIMEOUT: '카카오맵 응답이 없어요. 콘솔에서 카카오맵 사용 설정과 도메인 등록을 확인해주세요',
};
