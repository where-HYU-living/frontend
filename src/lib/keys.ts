/**
 * 글자를 치는 중인 키인가 (입력칸·글상자·선택 상자·편집 가능 요소).
 * 3D 이동(WASD·방향키)과 단축키(E·Esc)는 이때 무시해야 후기를 쓰다 캐릭터가 걷거나 실내에서 튕겨 나가지 않는다.
 */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}
