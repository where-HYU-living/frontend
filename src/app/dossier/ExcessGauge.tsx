import { GRADE_META } from '../../lib/grade';
import { manwon } from '../../lib/money';
import type { PriceCheck } from '../../api/types';
import { gaugeRatios } from './dossierLogic';
import './dossier.css';

/** 환산 월세(채움) vs 적정가(눈금) 막대. 적정가가 없으면 아무것도 그리지 않는다 */
export function ExcessGauge({ pc }: { pc: Pick<PriceCheck, 'convertedRent' | 'fairRent' | 'grade'> }) {
  const g = gaugeRatios(pc.convertedRent, pc.fairRent);
  if (!g) return null;
  const color = GRADE_META[pc.grade].color;
  return (
    <figure className="ui-gauge" aria-label={`환산 월세 ${manwon(pc.convertedRent)}, 적정 월세 ${manwon(pc.fairRent)}`}>
      <div className="ui-gauge-bar">
        <span className="ui-gauge-fill" style={{ width: `${g.over ? g.fairPct : g.rentPct}%`, background: 'var(--ui-gauge-ok)' }} />
        {g.over && <span className="ui-gauge-over" style={{ left: `${g.fairPct}%`, width: `${g.excessPct}%`, background: color }} />}
        <span className="ui-gauge-tick" style={{ left: `${g.fairPct}%` }} />
      </div>
      <figcaption className="ui-gauge-legend">
        <span>적정 {manwon(pc.fairRent)}</span>
        <span className="ui-gauge-now">이 집 {manwon(pc.convertedRent)}</span>
      </figcaption>
    </figure>
  );
}
