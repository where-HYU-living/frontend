import { HAIR_SWATCHES, JACKETS, SKIN_SWATCHES } from '../world/avatar';
import type { ServerMsg, Vec3 } from './worldReducer';

/** 개발·측정용 가짜 접속자. `?peers=30` — 소켓 없이 서버 메시지(welcome + 10Hz state)를 만든다. 사람이 걷는 만큼만 움직인다 */
export function makeCrowd(n: number, center: Vec3 = [0, 0, 0]) {
  const ids = Array.from({ length: n }, (_, i) => `bot${i}`);
  const at = (i: number, t: number): { p: Vec3; r: number } => {
    const ang = (i / n) * Math.PI * 2 + t * (0.15 + (i % 5) * 0.03);
    const rad = 12 + (i % 7) * 9;
    const p: Vec3 = [center[0] + Math.cos(ang) * rad, 0, center[2] + Math.sin(ang) * rad];
    return { p, r: -ang };
  };
  const pub = (i: number, t: number, nick = true) => {
    const { p, r } = at(i, t);
    const look = { jacket: JACKETS[i % JACKETS.length].id, hair: HAIR_SWATCHES[i % HAIR_SWATCHES.length], skin: SKIN_SWATCHES[(i * 3) % SKIN_SWATCHES.length] };
    return { id: ids[i], ...(nick ? { nickname: `봇${i + 1}`, look } : {}), p, r, a: 'walk' };
  };
  return {
    welcome: (): ServerMsg => ({ t: 'welcome', selfId: 'me', spawn: { p: [0, 0, 0], r: 0 }, players: ids.map((_, i) => pub(i, 0)) }),
    /** t = 초. 매 틱 전원이 움직이는 최악의 경우 */
    state: (t: number): ServerMsg => ({ t: 'state', players: ids.map((_, i) => pub(i, t, false)) }),
  };
}

export const peersFromSearch = (search: string): number => {
  const v = Number(new URLSearchParams(search).get('peers'));
  return Number.isFinite(v) && v > 0 ? Math.min(100, Math.floor(v)) : 0;
};
