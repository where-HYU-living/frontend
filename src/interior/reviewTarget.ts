import type { Dorm, HousingDetail, ReviewTargetType } from '../api/types';

export type ReviewTarget = { targetType: ReviewTargetType; targetId: number };

/**
 * 실내(평면도 id)에 후기를 달 대상. 기숙사 호실 유형·청년안심주택 주택형이 그 평면도를 쓰면 그 대상(DORM/HOUSING).
 * 동네 패널이 이미 불러 둔 목록에서 찾으므로 새 요청이 없다. 못 찾으면 null.
 */
export function findReviewTarget(floorplanId: number, dorms: Dorm[] = [], housings: HousingDetail[] = []): ReviewTarget | null {
  for (const d of dorms) if (d.roomTypes.some((r) => r.floorplanId === floorplanId)) return { targetType: 'DORM', targetId: d.id };
  for (const h of housings) if (h.unitTypes.some((u) => u.floorplanId === floorplanId)) return { targetType: 'HOUSING', targetId: h.id };
  return null;
}
