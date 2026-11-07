import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Dorm, HousingDetail, ReviewList } from '../api/types';
import { findReviewTarget, type ReviewTarget } from './reviewTarget';

/** 동네 패널이 이미 받아 둔 기숙사·단지 정보에서 이 평면도의 후기 대상을 찾는다 */
export function useIndoorTarget(floorplanId: number | null): ReviewTarget | null {
  const qc = useQueryClient();
  if (floorplanId == null) return null;
  const dorms = qc.getQueriesData<Dorm[]>({ queryKey: ['dorms'] }).flatMap(([, d]) => d ?? []);
  const housings = qc.getQueriesData<HousingDetail>({ queryKey: ['housing'] }).map(([, d]) => d).filter((d): d is HousingDetail => !!d && !Array.isArray(d) && 'unitTypes' in d);
  return findReviewTarget(floorplanId, dorms, housings);
}

/** ReviewSection 과 같은 쿼리 키 → 캐시 공유. 대상이 없으면 요청하지 않는다 */
export const useIndoorReviews = (target: ReviewTarget | null) =>
  useQuery({
    queryKey: ['reviews', target?.targetType, target?.targetId], enabled: !!target, retry: false,
    queryFn: ({ signal }) => api<ReviewList>('/reviews', { query: { targetType: target!.targetType, targetId: target!.targetId }, signal }),
  });
