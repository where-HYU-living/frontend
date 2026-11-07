import { manwon } from '../../lib/money';
import type { PriceCheck } from '../../api/types';
import { caseNumber, excessRateLabel } from './dossierLogic';
import './dossier.css';

/** N2 수배 전단: 범인 등급 매물. 수치만 보여준다 */
export function WantedFlyer({ id, title, pc }: { id: number; title: string; pc: PriceCheck }) {
  const span = pc.contractMonths === 24 ? '2년' : `${pc.contractMonths}개월`;
  return (
    <section className="ui-wanted" aria-label="수배 전단">
      <p className="ui-wanted-top">수배 전단 · {caseNumber(id)}</p>
      <p className="ui-wanted-title">시세 초과 매물</p>
      <p className="ui-wanted-name">{title}</p>
      <dl className="ui-wanted-kv">
        <dt>적정가 대비</dt><dd>{excessRateLabel(pc.excessRate)}</dd>
        <dt>월 초과액</dt><dd>{manwon(pc.monthlyExcess)}</dd>
        <dt>{span} 초과액</dt><dd className="ui-wanted-big">{manwon(pc.totalExcess)}</dd>
      </dl>
      <p className="ui-wanted-foot">같은 동네 실거래 기준 수치예요.</p>
    </section>
  );
}
