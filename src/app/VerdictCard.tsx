import { GRADE_INK, GRADE_META } from '../lib/grade';
import { manwon } from '../lib/money';
import type { Grade, PriceCheck } from '../api/types';
import { PriceLineup } from './dossier/PriceLineup';
import { budgetLine, excessRateLabel } from './dossier/dossierLogic';
import './dossier/dossier.css';

/** 적정가와 이만큼 안쪽이면 '거의 같아요' 로 본다 (원) */
const SAME = 10_000;

/**
 * 판결 카드: 매물·양도 글 공통.
 * 맨 위 한 문장이 결론(적정가보다 월 얼마 비싼지/싼지), 그 아래 눈금자가 근거를 한눈에(실거래 적정가·AI 추정 범위·이 집),
 * 맨 아래 두 기준(실거래·AI)의 숫자와 출처. 등급은 사건 파일 도장으로.
 */
export function VerdictCard({ pc, fallbackGrade, loggedIn, failed }: { pc: PriceCheck | undefined; fallbackGrade?: Grade; loggedIn: boolean; failed?: boolean }) {
  const grade = pc?.grade ?? fallbackGrade ?? 'PENDING';
  const g = GRADE_META[grade], ink = GRADE_INK[grade];
  const months = pc?.contractMonths;
  const span = months && months !== 24 ? `${months}개월` : '2년';
  const judged = !!pc && pc.grade !== 'PENDING' && pc.fairRent != null;
  const budget = budgetLine(pc?.budget);
  const ai = pc?.aiEstimate ?? null;
  const diff = judged ? pc.convertedRent - pc.fairRent! : null;

  let claim: React.ReactNode;
  if (judged && diff != null && diff > SAME) {
    claim = (<>
      <p className="ui-vd-lead">적정가보다</p>
      <p className="ui-vd-big" style={{ color: ink }}>월 {manwon(diff)} <span>비싸요</span></p>
      {pc.totalExcess != null && pc.totalExcess > 0 && <p className="ui-vd-sub">{span}이면 <b>{manwon(pc.totalExcess)} 원</b>을 더 내요</p>}
    </>);
  } else if (judged && diff != null && diff < -SAME) {
    claim = (<>
      <p className="ui-vd-lead">적정가보다</p>
      <p className="ui-vd-big" style={{ color: ink }}>월 {manwon(-diff)} <span>싸요</span></p>
      <p className="ui-vd-sub">{span}이면 {manwon(-diff * (months ?? 24))} 원을 아껴요</p>
    </>);
  } else if (judged) {
    claim = (<>
      <p className="ui-vd-big" style={{ color: ink }}>적정가와 <span>거의 같아요</span></p>
      <p className="ui-vd-sub">이 동네 비슷한 방들이 내는 만큼이에요</p>
    </>);
  } else {
    claim = (<>
      <p className="ui-vd-big is-pending">판정을 미뤘어요</p>
      <p className="ui-vd-sub">{pc ? '이 동네 비슷한 방의 실거래가 부족해요.' : failed ? '판정을 불러오지 못했어요.' : '판정을 불러오는 중이에요.'}{ai ? ` AI는 월 ${manwon(ai.fairRent)} 정도로 봐요.` : ''}</p>
    </>);
  }

  return (
    <section className={`ui-verdict ui-vd tone-${grade}`} aria-label="판결">
      <div className="ui-vd-head">
        <div className="ui-vd-claim">{claim}</div>
        <div className="ui-vd-stamp" style={{ color: ink }} title={g.verdict(pc?.totalExcess ?? null, months)}>
          <span className="ui-vd-stamp-word">{g.label}</span>
          {judged && pc.excessRate != null && Math.abs(pc.excessRate) >= 0.01 && <span className="ui-vd-stamp-rate">{excessRateLabel(pc.excessRate)}</span>}
        </div>
      </div>

      {pc && (judged || ai) && <PriceLineup house={pc.convertedRent} fair={judged ? pc.fairRent : null} ai={ai} grade={grade} />}

      {pc && (
        <dl className="ui-vd-basis">
          <div className="ui-vd-b is-house"><dt>이 집 환산 월세</dt><dd>{manwon(pc.convertedRent)}</dd><small>월세·관리비에 보증금 이자를 더한 값</small></div>
          {judged && <div className="ui-vd-b is-fair"><dt>실거래 적정가</dt><dd>{manwon(pc.fairRent)}</dd><small>이 동네 비슷한 방들이 실제로 낸 값</small></div>}
          {ai && <div className="ui-vd-b is-ai"><dt>AI 적정가</dt><dd>{manwon(ai.fairRent)}</dd><small>{manwon(ai.low)}~{manwon(ai.high)} 사이로 추정</small></div>}
        </dl>
      )}

      {budget && <p className={`ui-budget${budget.over ? ' is-over ui-over' : ''}`}>{budget.text}</p>}
      {!loggedIn && <p className="ui-vd-note">로그인하고 예산을 정하면 예산 대비도 보여줘요.</p>}
      {failed && pc && <p className="ui-vd-note">판정을 불러오지 못했어요.</p>}
    </section>
  );
}
