import { GRADE_META } from '../lib/grade';
import { manwon } from '../lib/money';
import type { Grade, PriceCheck } from '../api/types';
import { ExcessGauge } from './dossier/ExcessGauge';
import { budgetLine, evidenceLine, excessRateLabel } from './dossier/dossierLogic';
import './dossier/dossier.css';

/** 판결 카드: 매물·양도 글 공통. 판정 보류면 숫자 대신 안내만. 등급별 톤 + 큰 숫자 + 2년 초과액 강조 */
export function VerdictCard({ pc, fallbackGrade, loggedIn, failed }: { pc: PriceCheck | undefined; fallbackGrade?: Grade; loggedIn: boolean; failed?: boolean }) {
  const grade = pc?.grade ?? fallbackGrade ?? 'PENDING';
  const g = GRADE_META[grade];
  const months = pc?.contractMonths;
  const span = months && months !== 24 ? `${months}개월` : '2년';
  const judged = !!pc && pc.grade !== 'PENDING' && pc.fairRent != null;
  const budget = budgetLine(pc?.budget);
  const evidence = evidenceLine(pc?.sample);
  return (
    <section className={`ui-verdict tone-${grade}`} style={{ borderColor: g.color }} aria-label="판결">
      <div className="ui-verdict-head">
        {judged ? (
          <div className="ui-verdict-rent"><small>환산 월세</small><strong>{manwon(pc.convertedRent)}</strong></div>
        ) : <span />}
        <span className="ui-card-badge" style={{ background: g.color }}>{g.label}</span>
      </div>
      <p className="ui-verdict-text">{g.verdict(pc?.totalExcess ?? null, months)}</p>
      {judged && <ExcessGauge pc={pc} />}
      {judged && pc.totalExcess != null && pc.totalExcess > 0 && (
        <div className="ui-verdict-total"><small>{span} 초과액</small><strong>{manwon(pc.totalExcess)} 원</strong></div>
      )}
      {judged && (
        <dl className="ui-verdict-mini">
          <dt>적정 월세</dt><dd>{manwon(pc.fairRent)}</dd>
          <dt>월 초과액</dt><dd>{manwon(pc.monthlyExcess)}</dd>
          {pc.excessRate != null && (<><dt>적정가 대비</dt><dd>{excessRateLabel(pc.excessRate)}</dd></>)}
          {pc.totalExcess != null && pc.totalExcess <= 0 && (<><dt>{span} 초과액</dt><dd>{manwon(pc.totalExcess)}</dd></>)}
        </dl>
      )}
      {pc && pc.grade === 'PENDING' && <p className="ui-card-sub">환산 월세 {manwon(pc.convertedRent)} · 비교할 거래가 부족해 판정을 보류했어요.</p>}
      {evidence && <p className="ui-evidence">근거: {evidence}</p>}
      {budget && <p className={`ui-budget${budget.over ? ' is-over ui-over' : ''}`}>{budget.text}</p>}
      {!loggedIn && <p className="ui-card-sub">로그인하고 예산을 정하면 예산 대비도 보여줘요.</p>}
      {failed && <p className="ui-card-sub">판정을 불러오지 못했어요.</p>}
    </section>
  );
}
