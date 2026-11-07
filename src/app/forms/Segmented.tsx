/** 보기가 적은 단일 선택 (방 구조 등). 라디오 그룹 의미를 달고 화살표 키로 옮겨 다닌다 */
export function Segmented<T extends string>({ label, options, value, onChange, className }: { label: string; options: [T, string][]; value: T; onChange: (v: T) => void; className?: string }) {
  const move = (i: number, d: number) => { const n = options[(i + d + options.length) % options.length]; onChange(n[0]); };
  return (
    <div className={`ui-segmented${className ? ` ${className}` : ''}`} role="radiogroup" aria-label={label}>
      {options.map(([v, name], i) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} tabIndex={value === v ? 0 : -1} className={value === v ? 'on' : ''}
          onClick={() => onChange(v)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
          }}>{name}</button>
      ))}
    </div>
  );
}

/** 빠른 선택 칩 (개월 6/12/18/24 등). 눌린 값이 현재 값과 같으면 강조 */
export function ChipSelect({ label, options, value, onPick, suffix = '' }: { label: string; options: number[]; value: string; onPick: (v: string) => void; suffix?: string }) {
  return (
    <div className="ui-chipselect" role="group" aria-label={label}>
      {options.map((n) => (
        <button key={n} type="button" className={value === String(n) ? 'on' : ''} aria-pressed={value === String(n)} onClick={() => onPick(String(n))}>{n}{suffix}</button>
      ))}
    </div>
  );
}
