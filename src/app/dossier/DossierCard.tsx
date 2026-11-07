import type { ReactNode } from 'react';
import { GRADE_META, inkFor } from '../../lib/grade';
import type { Grade } from '../../api/types';
import { isWanted } from './dossierLogic';
import './dossier.css';

/** 목록 카드 공통 위계: 등급 배지 + 환산 월세(큰 글씨) + 한 줄 요약 + 보조 정보 */
export function DossierCard({ kind, grade, title, rentLabel = '환산 월세', rent, deposit, hint, meta, onClick, read }: {
  /** 찜 목록처럼 종류가 섞인 곳에서 쓰는 종류 표시 (자취방·기숙사 …) */
  kind?: string; grade?: Grade | null; title: string; rentLabel?: string; rent: string; deposit?: string; hint?: string | null; meta?: ReactNode[]; onClick?: () => void; read?: boolean;
}) {
  const wanted = isWanted(grade ?? undefined);
  return (
    <button type="button" className={`ui-card ui-dc${wanted ? ' is-wanted' : ''}${read ? ' is-read' : ''}`} onClick={onClick}>
      <span className="ui-dc-top">
        {kind && <span className="ui-dc-kind">{kind}</span>}
        {grade && <span className="ui-card-badge" style={{ background: GRADE_META[grade].color, color: inkFor(GRADE_META[grade].color) }}>{GRADE_META[grade].label}</span>}
        <span className="ui-dc-title">{title}</span>
      </span>
      <span className="ui-dc-rent"><span className="ui-dc-rent-label">{rentLabel}</span> <strong>{rent}</strong></span>
      {deposit && <span className="ui-dc-deposit">{deposit}</span>}
      {hint && <span className="ui-dc-hint">{hint}</span>}
      {meta && meta.length > 0 && <span className="ui-dc-meta">{meta.map((m, i) => <span key={i}>{m}</span>)}</span>}
    </button>
  );
}
