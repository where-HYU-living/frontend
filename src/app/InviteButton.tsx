import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api } from '../api/client';
import { addRoomToInviteUrl, type RoomInvite } from '../net/inviteLink';
import { useNet } from '../net/useMultiplayer';

/**
 * 초대 링크 복사 버튼. 멀티플레이에 접속 중일 때만 보인다.
 * - 동네에서 누르면: 서버가 준 링크 그대로 (받은 사람은 내 옆에 선다)
 * - 방 투어 중에 누르면(room 을 주면): 링크에 도면·내 자리를 덧붙여서, 받은 사람이 같은 방의 내 옆에 선다
 * 서버는 초대 토큰만 알고 방 정보는 모른다 — 방 정보는 링크 뒤에 프론트가 붙인다.
 */
export function InviteButton({ room, className = 'textbtn glass ui-invite' }: { room?: () => RoomInvite | null; className?: string }) {
  const { status, selfId } = useNet();
  const [note, setNote] = useState('');
  if (status !== 'open' || !selfId) return null;
  const invite = async () => {
    try {
      const r = await api<{ url: string }>('/invites', { method: 'POST', body: { playerId: selfId } });
      const ctx = room?.();
      await navigator.clipboard.writeText(ctx ? addRoomToInviteUrl(r.url, ctx) : r.url);
      setNote(ctx ? '이 방 링크를 복사했어요' : '링크를 복사했어요');
    } catch { setNote('링크를 만들지 못했어요'); }
    setTimeout(() => setNote(''), 2500);
  };
  return (
    <button className={className} type="button" onClick={invite} title={room ? '친구·부모님을 지금 이 방으로 초대하는 링크 복사' : '친구·부모님을 내 옆으로 초대하는 링크 복사'}>
      <UserPlus size={15} aria-hidden="true" /><span>{note || '초대'}</span>
    </button>
  );
}
