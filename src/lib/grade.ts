import type { Grade } from '../api/types';
import { manwon } from './money';

type Meta = { color: string; label: string; verdict: (totalExcessWon: number | null, months?: number) => string };
const span = (months?: number) => (!months || months === 24 ? '2년' : `${months}개월`);

/** 계약 2-2: 등급 색·라벨·판결 문구 */
export const GRADE_META: Record<Grade, Meta> = {
  FAIR: { color: '#3BA55C', label: '적정', verdict: () => '시세대로예요' },
  SLIGHTLY_HIGH: { color: '#F2C94C', label: '조금 비쌈', verdict: (t, m) => `${span(m)}이면 ${manwon(t)} 원 더 내요` },
  HIGH: { color: '#F2994A', label: '비쌈', verdict: () => '이 집이 내 돈을 써버릴 놈일 수 있어요' },
  CULPRIT: { color: '#EB5757', label: '범인', verdict: (t, m) => `찾았다. ${span(m)}간 ${manwon(t)} 원을 써버릴 놈` },
  PENDING: { color: '#9E9E9E', label: '판정 보류', verdict: () => '비교할 거래가 부족해요' },
};
