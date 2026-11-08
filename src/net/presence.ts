import { emptyWorld, type PlayerState, type WorldModel } from './worldReducer';

/**
 * 실내 방 투어 중인 내 위치. InteriorScene 이 들어갈 때 read 를 걸고 나갈 때 지운다.
 * useMultiplayer 는 이게 있으면 바깥 위치 대신 이 값(+room)을 보낸다.
 * yaw 는 실내 카메라 기준(앞 = (-sin, -cos)). 서버에는 바깥 캐릭터와 같은 heading(앞 = (sin, cos)) 으로 바꿔 보낸다.
 */
export type IndoorPose = { room: number; x: number; y: number; z: number; yaw: number };
export const indoorPresence: { read: (() => IndoorPose) | null } = { read: null };

/** 실내 카메라 yaw → 캐릭터 heading (바깥 player.heading 과 같은 기준) */
export const headingOfYaw = (yaw: number) => yaw + Math.PI;

/** 받은 월드 모델 (useMultiplayer 가 갱신, 실내 화면이 같은 방 사람을 그릴 때 읽는다) */
export const netModel: { current: WorldModel } = { current: emptyWorld() };

/** 같은 화면에 그릴 사람: 바깥(room 없음)이면 바깥 사람만, 실내면 같은 방 사람만 */
export function peersIn(players: Record<string, PlayerState>, room: number | null): [string, PlayerState][] {
  return Object.entries(players).filter(([, p]) => (p.room ?? null) === room);
}
