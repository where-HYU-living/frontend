import { useId } from 'react';
import { cleanNumber, manReadable } from './calc';

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

/**
 * 단위 접미사(만원, ㎡, 개월, 층)가 입력칸 안쪽 오른쪽에 붙는 숫자 입력.
 * 숫자 말고는 들어가지 않는다(decimal 이면 소수점 하나). 단위가 만원이면 아래에 '1억 2,000만 원' 처럼 읽어 준다.
 */
export function UnitInput({ label, unit, value, onChange, ariaLabel, inputMode = 'numeric', placeholder, hint, error, onBlur, className, inputRef }: {
  label: string; unit: string; value: string; onChange: (v: string) => void; ariaLabel: string;
  inputMode?: 'numeric' | 'decimal'; placeholder?: string; hint?: string; error?: string | null; onBlur?: () => void; className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const readable = unit === '만원' && !error ? manReadable(value) : null;
  return (
    <Field label={label} hint={readable ?? hint} error={error} className={className}>
      {(id, desc) => (
        <span className="ui-unit">
          <input ref={inputRef} id={id} inputMode={inputMode} value={value} placeholder={placeholder} aria-label={ariaLabel} aria-invalid={error ? true : undefined} aria-describedby={desc}
            enterKeyHint="next" autoComplete="off" onChange={(e) => onChange(cleanNumber(e.target.value, inputMode === 'decimal' || unit === '만원'))} onBlur={onBlur} />
          <span className="ui-unit-suffix" aria-hidden="true">{unit}</span>
        </span>
      )}
    </Field>
  );
}
