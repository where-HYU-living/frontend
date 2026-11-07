import { useId } from 'react';

/** 라벨(위, 작게) + 입력칸 + 힌트/오류(아래). children 은 id 를 받는 함수 */
export function Field({ label, hint, error, className, children }: { label: string; hint?: string; error?: string | null; className?: string; children: (id: string, describedBy: string | undefined) => React.ReactNode }) {
  const id = useId();
  const msgId = `${id}-msg`;
  const msg = error || hint;
  return (
    <div className={`ui-field${error ? ' has-error' : ''}${className ? ` ${className}` : ''}`}>
      <label className="ui-field-label" htmlFor={id}>{label}</label>
      {children(id, msg ? msgId : undefined)}
      {msg && <p id={msgId} className={error ? 'ui-field-error' : 'ui-field-hint'} role={error ? 'alert' : undefined}>{msg}</p>}
    </div>
  );
}

/** 단위 접미사(만원, ㎡, 개월, 층)가 입력칸 안쪽 오른쪽에 붙는 숫자 입력 */
export function UnitInput({ label, unit, value, onChange, ariaLabel, inputMode = 'numeric', placeholder, hint, error, onBlur, className }: {
  label: string; unit: string; value: string; onChange: (v: string) => void; ariaLabel: string;
  inputMode?: 'numeric' | 'decimal'; placeholder?: string; hint?: string; error?: string | null; onBlur?: () => void; className?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, desc) => (
        <span className="ui-unit">
          <input id={id} inputMode={inputMode} value={value} placeholder={placeholder} aria-label={ariaLabel} aria-invalid={error ? true : undefined} aria-describedby={desc}
            onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
          <span className="ui-unit-suffix" aria-hidden="true">{unit}</span>
        </span>
      )}
    </Field>
  );
}
