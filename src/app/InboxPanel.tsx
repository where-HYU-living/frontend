import { useMarkRead, useNotifications } from './features/more';
import { useSession } from './state/session';

export const unreadCount = (list: { read: boolean }[] | undefined) => (list ?? []).filter((n) => !n.read).length;

export function InboxPanel() {
  const token = useSession((s) => s.token);
  const openLogin = useSession((s) => s.openLogin);
  const q = useNotifications();
  const mark = useMarkRead();
  if (!token) return <div><p className="empty">로그인하면 공고 D-day와 계약 만료 알림이 여기에 와요.</p><button type="button" className="ui-primary" onClick={openLogin}>로그인</button></div>;
  if (q.isLoading) return <p className="empty">불러오는 중…</p>;
  if (q.isError) return <p className="empty">알림을 불러오지 못했어요.</p>;
  if (!q.data?.length) return <p className="empty">새 알림이 없어요.</p>;
  return (
    <ul className="ui-cards">
      {q.data.map((n) => (
        <li key={n.id}>
          <button type="button" className={`ui-card${n.read ? ' is-read' : ''}`} onClick={() => !n.read && mark.mutate(n.id)}>
            <strong>{!n.read && <span className="ui-dot" aria-label="안 읽음" />}{n.title}</strong>
            <span className="ui-card-sub">{n.body}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
