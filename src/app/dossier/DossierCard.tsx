import type { ReactNode } from 'react';
import { GRADE_INK, GRADE_META } from '../../lib/grade';
import type { Grade } from '../../api/types';
import { GRADE_HINT, isWanted } from './dossierLogic';
import { SeverityMeter } from './SeverityMeter';
import './dossier.css';

/**
 * 목록 카드: 제목 → 환산 월세(가장 큰 글씨)·보증금/월세 → 판정 한 줄(4칸 막대 + 등급 + 시세 대비 문장, 등급 색 글자) → 면적·층·도보.
 * 예전엔 색 알약 배지와 회색 작은 문장이 따로 있어 '시세보다 꽤 높아요' 가 안 읽혔다 → 판정을 한 줄로 묶고 글자에 색을 준다.
 */
export function DossierCard({ kind, grade, title, rentLabel = '환산', rent, deposit, hint, meta, onClick, read }: {
  /** 찜 목록처럼 종류가 섞인 곳에서 쓰는 종류 표시 (자취방·기숙사 …) */
  kind?: string; grade?: Grade | null; title: string; rentLabel?: string; rent: string; deposit?: string; hint?: string | null; meta?: ReactNode[]; onClick?: () => void; read?: boolean;
}) {
  const wanted = isWanted(grade ?? undefined);
  const say = grade ? hint ?? GRADE_HINT[grade] : hint;
  return (
    <button type="button" className={`ui-card ui-dc${wanted ? ' is-wanted' : ''}${read ? ' is-read' : ''}`} onClick={onClick}>
      <span className="ui-dc-top">
        {kind && <span className="ui-dc-kind">{kind}</span>}
        <span className="ui-dc-title">{title}</span>
      </span>
      <span className="ui-dc-price">
        <strong className="ui-dc-rent">{rent}</strong>
        <span className="ui-dc-rent-label">{rentLabel}</span>
        {deposit && <span className="ui-dc-deposit">{deposit}</span>}
      </span>
      {grade && (
        <span className="ui-dc-verdict" style={{ color: GRADE_INK[grade] }}>
          <SeverityMeter grade={grade} />
          <b className="ui-dc-grade">{GRADE_META[grade].label}</b>
          {say && <span className="ui-dc-say">{say}</span>}
        </span>
      )}
      {!grade && say && <span className="ui-dc-hint">{say}</span>}
      {meta && meta.length > 0 && <span className="ui-dc-meta">{meta.map((m, i) => <span key={i}>{m}</span>)}</span>}
    </button>
  );
}
