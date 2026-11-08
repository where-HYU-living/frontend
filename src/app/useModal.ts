import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * 대화상자 키보드 처리: 열리면 첫 조작 요소로 초점, Tab 은 대화상자 안에서만 돌고, Esc 로 닫고, 닫히면 원래 자리로 초점을 돌려준다.
 * Esc 는 캡처 단계에서 받아 멈춰서, 뒤에 있는 실내 투어(Esc = 나가기)까지 같이 닫히지 않는다.
 */
export function useModal<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const box = ref.current;
    // 첫 입력칸이 아니라 대화상자 자체에 초점: 입력칸에 초점이 가면 자동 완성 목록이 저절로 펼쳐져 아래 칸을 덮는다
    if (box && !box.contains(document.activeElement)) { if (!box.hasAttribute('tabindex')) box.tabIndex = -1; box.focus({ preventScroll: true }); }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); return; }
      if (e.key !== 'Tab' || !box) return;
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); if (prev?.isConnected) prev.focus({ preventScroll: true }); };
  }, [open]);
  return ref;
}
