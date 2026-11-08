/**
 * 캠퍼스 건물 이름표 위치 (순수 함수). 사자상·애지문처럼 건물 위에 "이름 / 번호" 를 띄운다.
 * 많아도 buildWorld 의 cullLabels(가까운 것·겹치지 않게·최대 14개)가 걸러 주고, 우선순위는 가장 낮아서 말풍선·랜드마크에 먼저 자리를 준다.
 */
type Pt = [number, number];
type PlaceLike = { no: string; name: string; center: Pt | null; entrance?: { door: Pt } };
type BuildingLike = { id: number; no?: string; pts: Pt[] };
/** door: true 면 (x,z) 는 입구 문 위치 → 문 위 낮은 높이(간판처럼). false 면 건물 중심 → 지붕 위 */
export type CampusLabelSpot = { name: string; sub: string; x: number; z: number; bid: number; door: boolean };

/** buildWorld 의 랜드마크 이름표(labelInfo)가 이미 있는 건물: 본관·역사관·애지문·노천극장 */
export const LANDMARK_LABEL_NOS: readonly string[] = ['101', '102', '104', '209'];

const area = (pts: Pt[]) => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

/**
 * @param places 보여 줄 캠퍼스 장소(숨긴 건물은 빼고 넘긴다)
 * @param buildings 3D 월드 건물. 같은 번호가 여럿이면(동이 나뉜 건물) 가장 큰 것의 높이를 쓴다
 */
export function campusLabelSpots(places: PlaceLike[], buildings: BuildingLike[]): CampusLabelSpot[] {
  const skip = new Set(LANDMARK_LABEL_NOS);
  const out: CampusLabelSpot[] = [];
  for (const p of places) {
    if (!p.center || skip.has(p.no)) continue;
    const same = buildings.filter((b) => b.no === p.no);
    if (!same.length) continue;
    const big = same.reduce((a, b) => (area(b.pts) > area(a.pts) ? b : a));
    // 입구가 있으면 문 위에 단다: 캠퍼스 투어로 문 앞에 서면 지붕 위 이름표는 화면 위로 벗어나 안 보였다
    const [x, z] = p.entrance?.door ?? p.center;
    out.push({ name: p.name, sub: p.no, x, z, bid: big.id, door: !!p.entrance });
  }
  return out;
}
