import type { QueryClient } from '@tanstack/react-query';
import { useSession } from '../state/session';

/** 누가 보든 같은 값인 쿼리 (학과·건물·평면도·공고·주소·검색·주변 시설) */
const SHARED = new Set(['departments', 'buildings', 'floorplan', 'announcements', 'address', 'search', 'nearby']);
/** 내 계정의 기록 (/me/*). 열쇠에 토큰이 들어 있어 다른 사람이 로그인하면 새로 받지만, 이전 사람 것은 캐시에서 지운다 */
const MINE = new Set(['favorites', 'profile', 'home', 'payments', 'utilities', 'report', 'alerts', 'notifications']);

/** 서버가 사람마다 다르게 채우는 값(찜 여부·도보 분·예산 초과·내 글 여부)이 든 쿼리인가 */
export const isPersonal = (key: readonly unknown[]) => !SHARED.has(String(key[0]));

/** 과 건물·예산이 바뀌었을 때: 도보 분·예산이 들어간 목록·상세·판결을 다시 받는다 */
export function refreshPersonal(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => isPersonal(q.queryKey) && !MINE.has(String(q.queryKey[0])) });
}

/**
 * 로그인·로그아웃·계정 바꾸기: 이전 사람의 /me 기록은 지우고, 찜 표시 덮어쓰기를 비우고, 사람마다 다른 값이 든 목록·상세는 다시 받는다.
 * (이게 없으면 로그아웃해도 목록 하트와 3D 말풍선에 앞사람 찜이 남고, 로그인해도 도보 분이 '정보 없음'으로 남는다)
 */
export function watchSession(qc: QueryClient, onChange?: () => void) {
  return useSession.subscribe((s, p) => {
    if (s.token === p.token) return;
    onChange?.();
    qc.removeQueries({ predicate: (q) => MINE.has(String(q.queryKey[0])) && !q.queryKey.includes(s.token) });
    void refreshPersonal(qc);
  });
}
