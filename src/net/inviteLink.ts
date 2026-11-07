/**
 * 방 투어 중에 만든 초대 링크가 싣는 방 정보. 서버가 주는 링크(`/?invite=토큰`) 뒤에 프론트가 덧붙이므로 서버는 몰라도 된다.
 *   room  = 도면 id (정수)
 *   at    = "x,z,yaw"  초대한 사람이 서 있던 실내 자리와 시선 (장면 좌표, m, 라디안)
 *   label = 방 이름 (화면 제목용)
 * 링크는 누구나 만들 수 있는 입력이라 읽을 때 형식과 범위를 검사한다.
 */
export type RoomInvite = { floorplanId: number; title: string; x: number; z: number; yaw: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const KEYS = ['room', 'at', 'label'] as const;

export function addRoomToInviteUrl(url: string, ctx: RoomInvite): string {
  const u = new URL(url, typeof location !== 'undefined' ? location.origin : 'http://localhost');
  u.searchParams.set('room', String(ctx.floorplanId));
  u.searchParams.set('at', `${r2(ctx.x)},${r2(ctx.z)},${r2(ctx.yaw)}`);
  u.searchParams.set('label', ctx.title);
  return u.toString();
}

export function parseRoomInvite(search: string): RoomInvite | null {
  const q = new URLSearchParams(search);
  const floorplanId = Number(q.get('room'));
  const at = (q.get('at') ?? '').split(',').map(Number);
  if (!q.get('room') || !Number.isInteger(floorplanId) || floorplanId <= 0) return null;
  if (at.length !== 3 || at.some((v) => !Number.isFinite(v))) return null;
  if (Math.abs(at[0]) > 200 || Math.abs(at[1]) > 200) return null; // 집 안이라고 보기 어려운 값
  return { floorplanId, title: (q.get('label') ?? '').trim().slice(0, 60) || '초대받은 방', x: at[0], z: at[1], yaw: at[2] };
}

/** 방 정보를 쓰고 난 뒤 주소창에서 지울 때: 방 정보만 뺀 새 search ('?a=b' 또는 '') */
export function stripRoomParams(search: string): string {
  const q = new URLSearchParams(search);
  for (const k of KEYS) q.delete(k);
  const s = q.toString();
  return s ? `?${s}` : '';
}
