import { useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { useNet, useMultiplayer } from '../net/useMultiplayer';
import { useUi } from './state/ui';
import { EMOTE } from './icons';

/** 접속 인원·이모트·한 줄 채팅 (왼쪽 아래). 초대는 상단바 InviteButton */
export function WorldChat() {
  useMultiplayer();
  const { status, count, conn, invited } = useNet();
  const mapMode = useUi((s) => s.mapMode);
  const indoor = useUi((s) => s.indoor);
  const [text, setText] = useState('');
  if (mapMode === '2d' || indoor) return null;

  const send = () => { if (text.trim()) { conn?.sendChat(text.trim()); setText(''); } };

  return (
    <div className="ui-chat glass" aria-label="같이 걷기">
      <div className="ui-chat-head">
        <div className="ui-chat-status" aria-live="polite">
          {status === 'open' && <><i className="ui-chat-dot" aria-hidden="true" />접속 중 {count + 1}명</>}
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
      {invited && <div className="ui-chat-note" role="status">초대한 사람 옆으로 왔어요</div>}
    </div>
  );
}
