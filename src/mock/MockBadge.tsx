import { isMockMode } from './flag';

/** 목 서버 사용 중임을 알리는 작은 배지. 목 모드가 아니면 아무것도 그리지 않는다. */
export function MockBadge() {
  if (!isMockMode()) return null;
  return (
    <div
      role="status"
      aria-label="목 서버 사용 중"
      title="개발용 목 서버 응답을 쓰는 중이에요. 실제 서버와 연결돼 있지 않습니다."
      style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 9999, padding: '2px 8px', borderRadius: 999, background: '#ff6b00', color: '#fff', font: '700 11px/1.6 system-ui, sans-serif', letterSpacing: 1, opacity: 0.85, pointerEvents: 'none' }}
    >
      MOCK
    </div>
  );
}
