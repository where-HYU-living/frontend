import { useState } from 'react';
import { api } from '../api/client';
import { useNet, useMultiplayer } from '../net/useMultiplayer';
import { useUi } from './state/ui';

/** 접속 상태·이모트·한 줄 채팅·초대 링크 (왼쪽 아래) */
export function WorldChat() {
  useMultiplayer();
  const { status, count, conn, selfId } = useNet();
  const mapMode = useUi((s) => s.mapMode);
  const indoor = useUi((s) => s.indoor);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  if (mapMode === '2d' || indoor) return null;

  const invite = async () => {
    try {
      const r = await api<{ url: string }>('/invites', { method: 'POST', body: { playerId: selfId } });
      await navigator.clipboard.writeText(r.url);
      setNote('초대 링크를 복사했어요');
    } catch { setNote('초대 링크를 만들지 못했어요'); }
    setTimeout(() => setNote(''), 2500);
  };
  const send = () => { if (text.trim()) { conn?.sendChat(text.trim()); setText(''); } };

  return (
    <div className="ui-chat glass" aria-label="같이 걷기">
      <div className="ui-chat-status" aria-live="polite">
        {status === 'open' && `접속 중 · 주변 ${count}명`}
        {status === 'connecting' && '연결하는 중…'}
        {status === 'closed' && '혼자 둘러보는 중 (서버 연결 안 됨)'}
        {status === 'full' && '지금 사람이 너무 많아요. 혼자 둘러보세요'}
      </div>
      {status === 'open' && (
        <div className="ui-chat-row">
          {(['wave', 'heart', 'clap'] as const).map((e) => <button key={e} type="button" aria-label={e} onClick={() => conn?.sendEmote(e)}>{{ wave: '👋', heart: '❤️', clap: '👏' }[e]}</button>)}
          <input value={text} maxLength={40} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') send(); }} placeholder="한마디 (40자)" aria-label="채팅" />
          <button type="button" onClick={invite}>초대</button>
        </div>
      )}
      {note && <div className="ui-chat-note">{note}</div>}
    </div>
  );
}
