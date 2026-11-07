/** E1: 문 앞 실내 진입 — 근접 판정·문 목록 만들기 (순수 함수) */
export type Door = { id: string; x: number; z: number; title: string; floorplanId: number };

export const DOOR_RADIUS = 5;

/** (x,z) 에서 radius 안에 있는 가장 가까운 문. 없으면 null */
export function nearestDoor<T extends { x: number; z: number }>(doors: readonly T[], x: number, z: number, radius = DOOR_RADIUS): T | null {
  let best: T | null = null, bd = radius * radius;
  for (const d of doors) {
    const dd = (d.x - x) ** 2 + (d.z - z) ** 2;
    if (dd <= bd) { bd = dd; best = d; }
  }
  return best;
}

export type DoorSrc = { id: string; x: number; z: number; title: string; floorplanId?: number | null };

/** floorplanId 가 있는 것만, 같은 평면도+같은 자리(2m 격자)는 하나로. 좌표 변환은 호출자가 toLocal 로 넘긴다 */
export function buildDoors(srcs: readonly DoorSrc[]): Door[] {
  const seen = new Set<string>();
  const out: Door[] = [];
  for (const s of srcs) {
    if (s.floorplanId == null || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    const key = `${s.floorplanId}@${Math.round(s.x / 2)},${Math.round(s.z / 2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: s.id, x: s.x, z: s.z, title: s.title, floorplanId: s.floorplanId });
  }
  return out;
}

export const doorPromptText = (title: string, touch: boolean) => `${title} · ${touch ? '들어가기' : '들어가기 (E)'}`;
