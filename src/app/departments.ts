import { norm } from './campusSearch';

export type Dept = { id: number; name: string; college: string; defaultBuildingIds: number[] };

/** 학과 이름 또는 단과대 이름에 검색어가 들어 있는 학과만 (띄어쓰기·대소문자 무시). 검색어가 비면 전부 */
export function filterDepartments(list: Dept[], query: string): Dept[] {
  const q = norm(query);
  if (!q) return list;
  return list.filter((d) => norm(d.name).includes(q) || norm(d.college).includes(q));
}

/** 단과대별로 묶는다 (단과대는 처음 나온 순서, 학과는 이름순) */
export function groupByCollege(list: Dept[]): { college: string; items: Dept[] }[] {
  const order: string[] = [];
  const map = new Map<string, Dept[]>();
  for (const d of list) {
    if (!map.has(d.college)) { map.set(d.college, []); order.push(d.college); }
    map.get(d.college)!.push(d);
  }
  return order.map((college) => ({ college, items: map.get(college)!.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko')) }));
}

/** 학과가 연결된 건물 이름들. 이름을 모르는 id 는 뺀다 */
export function buildingNamesOf(d: Dept, names: Map<number, string>): string[] {
  return d.defaultBuildingIds.map((id) => names.get(id)).filter((n): n is string => !!n);
}
