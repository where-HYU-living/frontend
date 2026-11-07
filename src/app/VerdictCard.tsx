import { GRADE_META } from '../lib/grade';
import { manwon } from '../lib/money';
import type { Grade, PriceCheck } from '../api/types';

/** 판결 카드: 매물·양도 글 공통. 판정 보류면 숫자 대신 안내만 */
export function VerdictCard({ pc, fallbackGrade, loggedIn, failed }: { pc: PriceCheck | undefined; fallbackGrade?: Grade; loggedIn: boolean; failed?: boolean }) {
  const g = GRADE_META[pc?.grade ?? fallbackGrade ?? 'PENDING'];
  const months = pc?.contractMonths;
  const span = months && months !== 24 ? `${months}개월` : '2년';
  return (
    <section className="ui-verdict" style={{ borderColor: g.color }} aria-label="판결">
      <span className="ui-card-badge" style={{ background: g.color }}>{g.label}</span>
      <p className="ui-verdict-text">{g.verdict(pc?.totalExcess ?? null, months)}</p>
      {pc && pc.grade !== 'PENDING' && pc.fairRent != null && (
        <dl className="ui-kv">
          <dt>환산 월세</dt><dd>{manwon(pc.convertedRent)}</dd>
          <dt>적정 월세</dt><dd>{manwon(pc.fairRent)}</dd>
          <dt>월 초과액</dt><dd>{manwon(pc.monthlyExcess)}</dd>
          <dt>{span} 초과액</dt><dd>{manwon(pc.totalExcess)}</dd>
        </dl>
      )}
      {pc && pc.grade === 'PENDING' && <p className="ui-card-sub">환산 월세 {manwon(pc.convertedRent)} · 비교할 거래가 부족해 판정을 보류했어요.</p>}
      {pc && pc.sample.count > 0 && <p className="ui-card-sub">{pc.sample.dongs.join('·')} 거래 {pc.sample.count}건 기준{pc.sample.scope === 'ADJACENT' ? ' (인접 동 포함)' : ''}</p>}
      {pc?.budget && (pc.budget.overRent ?? 0) > 0 && <p className="ui-over">예산보다 월 {manwon(pc.budget.overRent)} 원 초과</p>}
      {pc?.budget && pc.budget.overRent === 0 && <p className="ui-card-sub">예산 안이에요</p>}
      {!loggedIn && <p className="ui-card-sub">로그인하고 예산을 정하면 예산 대비도 보여줘요.</p>}
      {failed && <p className="ui-card-sub">판정을 불러오지 못했어요.</p>}
    </section>
  );
}
