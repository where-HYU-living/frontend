/** 섹션 제목 + 묶음. grid 면 안쪽 칸이 2열로 놓인다 */
export function FormSection({ title, hint, grid, children }: { title: string; hint?: string; grid?: boolean; children: React.ReactNode }) {
  return (
    <section className="ui-fsec" aria-label={title}>
      <h4 className="ui-fsec-title">{title}</h4>
      {hint && <p className="ui-fsec-hint">{hint}</p>}
      <div className={grid ? 'ui-fgrid' : 'ui-fstack'}>{children}</div>
    </section>
  );
}

/** 하단 고정 제출 영역. disabledReason 이 있으면 한 줄로 이유를 보여준다 */
export function StickyActions({ reason, children }: { reason?: string | null; children: React.ReactNode }) {
  return (
    <div className="ui-sticky">
      {reason && <p className="ui-sticky-reason" role="status">{reason}</p>}
      {children}
    </div>
  );
}

/** 입력 중 즉석 요약 (예: 환산 월세) */
export function LiveSummary({ title, value, note }: { title: string; value: string | null; note?: string }) {
  return (
    <div className="ui-live" aria-live="polite">
      <span className="ui-live-title">{title}</span>
      <strong className="ui-live-value">{value ?? '-'}</strong>
      {note && <span className="ui-live-note">{note}</span>}
    </div>
  );
}
