import { GRADE_INK, GRADE_LEVEL, GRADE_META } from '../../lib/grade';
import type { Grade } from '../../api/types';

/** 비싼 정도 4칸 막대 (적정 1칸 ~ 범인 4칸, 판정 보류는 빈 점선). 색 배지 대신 크기를 길이로 읽게 한다. 늘 등급 글자 옆에 두므로 화면 읽기에서는 숨긴다 */
export function SeverityMeter({ grade, size = 'sm' }: { grade: Grade; size?: 'sm' | 'md' }) {
  const n = GRADE_LEVEL[grade];
  return (
    <span className={`ui-sev ui-sev-${size}${grade === 'PENDING' ? ' is-pending' : ''}`} style={{ color: GRADE_INK[grade] }} aria-hidden="true" data-grade={GRADE_META[grade].label}>
      {[1, 2, 3, 4].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}
    </span>
  );
}
