import { useEffect } from 'react';
import { useUi } from '../app/state/ui';
import { useWorld } from '../app/state/world';
import { parseRoomInvite, stripRoomParams } from './inviteLink';

let consumed = false;

/**
 * 방 투어 중에 만든 초대 링크(`?room=&at=&label=`)로 들어오면, 월드가 준비된 뒤 그 도면의 초대한 사람 옆자리로 바로 들어간다.
 * 한 번만 처리하고 주소창에서 방 정보를 지운다 (새로고침해도 또 들어가지 않게). 멀티플레이 접속(?invite=)과는 따로 동작한다.
 */
export function useRoomInvite() {
  const ready = useWorld((s) => s.status === 'ready');
  useEffect(() => {
    if (!ready || consumed) return;
    const r = parseRoomInvite(location.search);
    if (!r) return;
    consumed = true;
    history.replaceState(null, '', `${location.pathname}${stripRoomParams(location.search)}${location.hash}`);
    useUi.getState().enterIndoor(r.floorplanId, r.title, { start: { x: r.x, z: r.z, yaw: r.yaw }, invited: true });
  }, [ready]);
}

/** 테스트용: 한 번만 처리하는 표시를 되돌린다 */
export const resetRoomInviteForTest = () => { consumed = false; };
