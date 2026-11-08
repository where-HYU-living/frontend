import { useLayoutEffect, useRef, useState } from 'react';
import { GRADE_INK } from '../../lib/grade';
import { manwon } from '../../lib/money';
import type { AiEstimate, Grade } from '../../api/types';
import { lineupScale, placeLabels, type Lane } from './dossierLogic';

/**
 * 가격 눈금자: 한 줄 위에 '실거래 적정가'(검은 눈금), 'AI 추정 범위'(빗금 띠), '이 집'(점)을 함께 놓는다.
 * 적정가와 이 집 사이를 칠하고 그 차이(+15.3만)를 그 자리에 적어, 숫자를 따로 읽지 않아도 '얼마나 벗어났는지'가 보이게 한다.
 * 이름표는 막대에 바로 붙여(위·아래) 어느 표시의 이름인지 헷갈리지 않게, 눈금 숫자는 맨 아래에 옅게.
 */
export function PriceLineup({ house, fair, ai, grade }: { house: number; fair: number | null; ai: AiEstimate | null; grade: Grade }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  useLayoutEffect(() => { if (box.current?.clientWidth) setW(box.current.clientWidth); }, []);
  const vals = [house, fair ?? 0, ai?.low ?? 0, ai?.high ?? 0].filter((v) => v > 0);
  const { min, max, ticks } = lineupScale(vals);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const ink = GRADE_INK[grade];
  const diff = fair != null ? house - fair : 0;
  const gap = fair != null && Math.abs(diff) >= 5_000 ? { from: pct(Math.min(house, fair)), to: pct(Math.max(house, fair)), over: diff > 0 } : null;
  const labels = placeLabels([
    { key: 'house', at: pct(house), text: `이 집 ${manwon(house)}` },
    ...(fair != null ? [{ key: 'fair', at: pct(fair), text: `실거래 적정 ${manwon(fair)}` }] : []),
    ...(ai ? [{ key: 'ai', at: pct(ai.fairRent), text: `AI ${manwon(ai.low)}~${manwon(ai.high)}` }] : []),
    ...(gap && gap.to - gap.from > 14 ? [{ key: 'gap', at: (gap.from + gap.to) / 2, text: `${diff > 0 ? '+' : '−'}${manwon(Math.abs(diff))}`, optional: true }] : []),
  ], w);
  const summary = [`이 집 환산 월세 ${manwon(house)}`, fair != null ? `실거래 적정가 ${manwon(fair)}` : null, ai ? `AI 추정 ${manwon(ai.low)}~${manwon(ai.high)}` : null].filter(Boolean).join(', ');
  const lane = (l: Lane) => labels.filter((x) => x.lane === l).map((x) => (
    <span key={x.key} className={`ui-lu-label is-${x.key} is-${x.align}`} style={{ left: `${x.left}%`, color: x.key === 'house' || x.key === 'gap' ? (x.key === 'gap' && !gap?.over ? 'var(--ui-good)' : ink) : undefined }}>{x.text}</span>
  ));
  const has = (l: Lane) => labels.some((x) => x.lane === l);
  return (
    <figure className="ui-lu" aria-label={summary}>
      {has('top') && <div className="ui-lu-lane is-top" aria-hidden="true">{lane('top')}</div>}
      <div className="ui-lu-lane is-above" aria-hidden="true">{lane('above')}</div>
      <div ref={box} className="ui-lu-track" aria-hidden="true">
        {ai && <span className="ui-lu-ai" style={{ left: `${pct(ai.low)}%`, width: `${Math.max(1.5, pct(ai.high) - pct(ai.low))}%` }} />}
        {gap && <span className={`ui-lu-gap${gap.over ? ' is-over' : ' is-under'}`} style={{ left: `${gap.from}%`, width: `${gap.to - gap.from}%`, background: gap.over ? ink : undefined }} />}
        {ai && <span className="ui-lu-aitick" style={{ left: `${pct(ai.fairRent)}%` }} />}
        {fair != null && <span className="ui-lu-fair" style={{ left: `${pct(fair)}%` }} />}
        <span className="ui-lu-house" style={{ left: `${pct(house)}%`, borderColor: ink }} />
      </div>
      <div className="ui-lu-lane is-below" aria-hidden="true">{lane('below')}</div>
      <div className="ui-lu-ticks" aria-hidden="true">
        {ticks.map((t, i) => <span key={t} style={{ left: `${pct(t)}%` }} className={i === 0 ? 'is-first' : i === ticks.length - 1 ? 'is-last' : ''}>{Math.round(t / 10000)}{i === ticks.length - 1 ? '만' : ''}</span>)}
      </div>
    </figure>
  );
}
