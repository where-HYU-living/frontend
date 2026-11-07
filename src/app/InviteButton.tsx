import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api } from '../api/client';
import { useNet } from '../net/useMultiplayer';

/** 상단바의 초대 버튼 — 내 자리로 오는 링크를 복사한다. 멀티플레이에 접속 중일 때만 보인다 */
export function InviteButton() {
  const { status, selfId } = useNet();
  const [note, setNote] = useState('');
  if (status !== 'open' || !selfId) return null;
  const invite = async () => {
    try {
      const r = await api<{ url: string }>('/invites', { method: 'POST', body: { playerId: selfId } });
      await navigator.clipboard.writeText(r.url);
      setNote('링크를 복사했어요');
    } catch { setNote('링크를 만들지 못했어요'); }
    setTimeout(() => setNote(''), 2500);
  };
  return (
    <button className="textbtn glass ui-invite" type="button" onClick={invite} title="친구·부모님을 내 옆으로 초대하는 링크 복사">
      <UserPlus size={15} aria-hidden="true" /> {note || '초대'}
    </button>
  );
}
