// 목 모드 판정. 아주 가벼워야 한다(목 본체는 동적 import 로만 로드).
export function isMockMode(): boolean {
  if (import.meta.env.VITE_USE_MOCK === 'true') return true;
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('mock') === '1';
  } catch {
    return false;
  }
}
