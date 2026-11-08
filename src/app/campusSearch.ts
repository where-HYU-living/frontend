/** entrance: 건물 입구(door, 외곽선 위)와 그 앞에 서는 자리(stand). 없으면 건물이 보이는 빈자리로 간다 */
export type Place = {
  id: number; no: string; name: string; en: string; group: 'dorm' | 'etc'; center: [number, number] | null;
  entrance?: { door: [number, number]; stand: [number, number] };
};

/** 띄어쓰기·대소문자를 무시해서 비교하려고 정리한다 */
export const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 이름 또는 번호에 검색어가 들어 있는 건물만. 검색어가 비면 전부 (번호순 유지) */
export function filterPlaces(places: Place[], query: string): Place[] {
  const q = norm(query);
  if (!q) return places;
  return places.filter((p) => norm(p.name).includes(q) || norm(p.no).includes(q));
}

export const GROUP_LABEL: Record<Place['group'], string> = { dorm: '기숙사', etc: '그 외 건물' };

/** 기숙사 → 그 외 순서로 묶는다. 비어 있는 묶음은 뺀다 */
export function groupPlaces(places: Place[]): { group: Place['group']; label: string; items: Place[] }[] {
  return (['dorm', 'etc'] as const)
    .map((group) => ({ group, label: GROUP_LABEL[group], items: places.filter((p) => p.group === group) }))
    .filter((g) => g.items.length > 0);
}
