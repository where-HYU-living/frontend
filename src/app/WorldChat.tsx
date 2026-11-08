import { useEffect, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { CHAT_MS, useNet, useMultiplayer } from '../net/useMultiplayer';
import { useRoomInvite } from '../net/useRoomInvite';
import { useUi } from './state/ui';
import { EMOTE } from './icons';

/**
 * 접속 인원·이모트·한 줄 채팅 (왼쪽 아래). 초대는 상단바 InviteButton.
 * 실내(방 투어)에서도 뜬다: 같은 방 사람끼리 보이므로 말·이모트도 거기서 보낸다. 1인칭이라 내 말풍선이 안 보이니 방금 보낸 말을 한 줄 보여 준다.
 */
export function WorldChat() {
  useMultiplayer();
  useRoomInvite();
  const { status, count, roomCount, conn, invited } = useNet();
  const mapMode = useUi((s) => s.mapMode);
  const indoor = useUi((s) => s.indoor);
  const [text, setText] = useState('');
  const [mine, setMine] = useState<string | null>(null);
  useEffect(() => { if (!mine) return; const t = setTimeout(() => setMine(null), CHAT_MS); return () => clearTimeout(t); }, [mine]);
  if (mapMode === '2d' && !indoor) return null;

  const send = () => { const m = text.trim(); if (m) { conn?.sendChat(m); setText(''); setMine(m); } };

  return (
    <div className={`ui-chat glass${indoor ? ' is-indoor' : ''}`} aria-label={indoor ? '이 방에 있는 사람과 이야기하기' : '같이 걷기'}>
      <div className="ui-chat-head">
        <div className="ui-chat-status" aria-live="polite">
          {status === 'open' && (indoor
            ? <><i className="ui-chat-dot" aria-hidden="true" />이 방 {roomCount + 1}명 <span className="ui-chat-sub">· 전체 {count + 1}명</span></>
            : <><i className="ui-chat-dot" aria-hidden="true" />접속 중 {count + 1}명</>)}
          {status === 'connecting' && '연결하는 중…'}
          {status === 'closed' && '혼자 둘러보는 중 (서버 연결 안 됨)'}
          {status === 'full' && '지금 사람이 너무 많아요. 혼자 둘러보세요'}
        </div>
        {status === 'open' && (
          <div className="ui-chat-emotes">
            {(Object.keys(EMOTE) as (keyof typeof EMOTE)[]).map((e) => { const { Icon, label, color } = EMOTE[e]; return <button key={e} type="button" aria-label={label} title={label} onClick={() => conn?.sendEmote(e)}><Icon size={17} color={color} strokeWidth={2.4} aria-hidden="true" /></button>; })}
          </div>
        )}
      </div>
      {status === 'open' && (
        <div className="ui-chat-input">
          <input value={text} maxLength={40} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') send(); }} placeholder="한마디 (40자)" aria-label="채팅" />
          <button type="button" className="ui-chat-send" aria-label="보내기" disabled={!text.trim()} onClick={send}><SendHorizontal size={16} aria-hidden="true" /></button>
        </div>
      )}
      {indoor && mine && <div className="ui-chat-mine" role="status">나: {mine}</div>}
      {invited && <div className="ui-chat-note" role="status">초대한 사람 옆으로 왔어요</div>}
    </div>
  );
}
