import { manwon } from '../../lib/money';
import type { PriceCheck } from '../../api/types';
import { caseNumber, excessRateLabel } from './dossierLogic';
import './dossier.css';

/** 원 → '₩12,966,000' (현상금처럼 원 단위 그대로) */
const bounty = (won: number) => `₩${Math.round(won).toLocaleString('ko-KR')}`;

/**
 * N2 수배 전단: 범인 등급 매물을 서부 현상수배 포스터처럼. 현상금 자리에 '2년 동안 더 내는 돈'.
 * 수치는 판정 그대로만 쓴다 (지어내지 않는다). 사진은 넣지 않는다.
 */
export function WantedFlyer({ id, title, pc }: { id: number; title: string; pc: PriceCheck }) {
  const span = pc.contractMonths === 24 ? '2년' : `${pc.contractMonths}개월`;
  return (
    <section className="ui-wanted" aria-label="수배 전단">
      <p className="ui-wanted-word" aria-hidden="true">WANTED</p>
      <p className="ui-wanted-sr">수배 · {caseNumber(id)}</p>
      <p className="ui-wanted-dead" aria-hidden="true">계약 전 반드시 비교할 것</p>
      <p className="ui-wanted-name">{title}</p>
      {pc.totalExcess != null && (
        <div className="ui-wanted-bounty">
          <span className="ui-wanted-bounty-label">{span} 동안 더 내는 돈</span>
          <strong>{bounty(pc.totalExcess)}<span aria-hidden="true">—</span></strong>
        </div>
      )}
      <div className="ui-wanted-foot">
        <p>적정가보다 <b>{excessRateLabel(pc.excessRate)}</b> 비싸요. 다달이 <b>{manwon(pc.monthlyExcess)} 원</b>씩 더 내요. 같은 동네 실거래 기준이에요.</p>
        <span className="ui-wanted-seal" aria-hidden="true">어디서<br />사냥</span>
      </div>
      <p className="ui-wanted-case" aria-hidden="true">{caseNumber(id)}</p>
    </section>
  );
}
