export type Vec3 = [number, number, number];
export type Sample = { t: number; p: Vec3; r: number };
export type PlayerState = { nickname: string; samples: Sample[]; a: string; emote?: { e: string; until: number }; chat?: { m: string; until: number } };
export type WorldModel = { selfId: string | null; players: Record<string, PlayerState> };

type Pub = { id: string; nickname?: string; p: Vec3; r: number; a: string };
export type ServerMsg =
  | { t: 'welcome'; selfId: string; spawn: { p: Vec3; r: number }; players: Pub[] }
  | { t: 'join'; player: Pub }
  | { t: 'leave'; id: string }
  | { t: 'state'; players: Pub[] }
  | { t: 'emote'; id: string; e: string }
  | { t: 'chat'; id: string; m: string }
  | { t: 'pong' }
  | { t: 'error'; code: string; message: string };

export const EMOTE_MS = 3000;
export const CHAT_MS = 5000;
const MAX_SAMPLES = 10;

export const emptyWorld = (): WorldModel => ({ selfId: null, players: {} });

const fresh = (p: Pub, now: number, prev?: PlayerState): PlayerState => ({
  nickname: p.nickname ?? prev?.nickname ?? '', a: p.a, emote: prev?.emote, chat: prev?.chat,
  samples: [...(prev?.samples ?? []), { t: now, p: p.p, r: p.r }].slice(-MAX_SAMPLES),
});

/** 서버 메시지 → 월드 모델. welcome 은 players 를 통째로 교체(재접속 시 사라진 사람 정리). 자기 자신은 제외 */
export function worldReducer(m: WorldModel, msg: ServerMsg, now: number): WorldModel {
  switch (msg.t) {
    case 'welcome': {
      const players: WorldModel['players'] = {};
      for (const p of msg.players) if (p.id !== msg.selfId) players[p.id] = fresh(p, now);
      return { selfId: msg.selfId, players };
    }
    case 'join':
      return msg.player.id === m.selfId ? m : { ...m, players: { ...m.players, [msg.player.id]: fresh(msg.player, now) } };
    case 'leave': {
      if (!(msg.id in m.players)) return m;
      const { [msg.id]: _gone, ...rest } = m.players;
      return { ...m, players: rest };
    }
    case 'state': {
      const players = { ...m.players };
      for (const p of msg.players) if (p.id !== m.selfId && players[p.id]) players[p.id] = fresh(p, now, players[p.id]);
      return { ...m, players };
    }
    case 'emote': {
      const p = m.players[msg.id];
      return p ? { ...m, players: { ...m.players, [msg.id]: { ...p, emote: { e: msg.e, until: now + EMOTE_MS } } } } : m;
    }
    case 'chat': {
      const p = m.players[msg.id];
      return p ? { ...m, players: { ...m.players, [msg.id]: { ...p, chat: { m: msg.m, until: now + CHAT_MS } } } } : m;
    }
    default:
      return m;
  }
}

/** 렌더 시각 = 현재 − 100ms 로 두 샘플 사이를 선형 보간. 샘플이 하나면 그대로 */
export const INTERP_DELAY = 100;
export function interpolate(samples: Sample[], renderTime: number): { p: Vec3; r: number } {
  if (samples.length === 0) return { p: [0, 0, 0], r: 0 };
  if (samples.length === 1 || renderTime <= samples[0].t) return { p: samples[0].p, r: samples[0].r };
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (renderTime <= b.t) {
      const k = (renderTime - a.t) / (b.t - a.t || 1);
      let dr = b.r - a.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); // 최단 각도
      return { p: [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k], r: a.r + dr * k };
    }
  }
  const l = samples[samples.length - 1];
  return { p: l.p, r: l.r };
}
