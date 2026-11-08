import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { addDays, addMonths, daysIn, firstWeekday, formatYm, formatYmd, parseYmd, shiftMonth, todayYmd, WEEKDAYS, ym, ymd } from './dates';

export type DateQuick = { label: string; value: string | null };

/** 바깥을 누르거나 Esc 면 닫는다 */
function useDismiss(open: boolean, root: React.RefObject<HTMLElement>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [open, root, close]);
}

/** 팝오버가 패널 오른쪽 밖으로 나가면 오른쪽에 맞춘다 */
function useAlign(open: boolean, root: React.RefObject<HTMLElement>, width: number) {
  const [right, setRight] = useState(false);
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const r = root.current.getBoundingClientRect();
    const bound = (root.current.closest('.ui-panel, .ui-modal') as HTMLElement | null)?.getBoundingClientRect().right ?? window.innerWidth;
    setRight(r.left + width > bound - 8);
  }, [open, root, width]);
  return right;
}

/**
 * 달력 (일 단위). 선택한 날·오늘 표시, min/max 밖은 못 고름. 위쪽 제목을 누르면 달 고르기로 바뀐다(연 단위로 빨리 이동).
 * 키보드: 화살표 ±1일/±1주, PageUp/PageDown ±1달(Shift 면 ±1년), Home/End 주의 처음·끝, Enter 고르기, Esc 닫기.
 */
function Calendar({ value, min, max, onPick, onClose, quick, label }: { value: string; min?: string; max?: string; onPick: (v: string | null) => void; onClose: () => void; quick?: DateQuick[]; label: string }) {
  const today = todayYmd();
  const start = parseYmd(value) ? value : (max && today > max ? max : min && today < min ? min : today);
  const [focus, setFocus] = useState(start);
  const [view, setView] = useState<'days' | 'months'>('days');
  const f = parseYmd(focus)!;
  const grid = useRef<HTMLDivElement>(null);
  const out = (d: string) => (!!min && d < min) || (!!max && d > max);
  const clamp = (d: string) => (min && d < min ? min : max && d > max ? max : d);

  useEffect(() => { if (view === 'days') (grid.current?.querySelector('[data-focus="1"]') as HTMLButtonElement | null)?.focus(); }, [focus, view]);

  const key = (e: React.KeyboardEvent) => {
    const k = e.key;
    const map: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1), ArrowRight: () => addDays(focus, 1), ArrowUp: () => addDays(focus, -7), ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1), PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
      Home: () => addDays(focus, -new Date(f.y, f.m - 1, f.d).getDay()), End: () => addDays(focus, 6 - new Date(f.y, f.m - 1, f.d).getDay()),
    };
    if (map[k]) { e.preventDefault(); setFocus(clamp(map[k]())); }
    else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };

  const lead = firstWeekday(f.y, f.m), n = daysIn(f.y, f.m);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => ymd(f.y, f.m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const go = (months: number) => setFocus(clamp(addMonths(focus, months)));

  return (
    <div className="ui-cal" role="dialog" aria-label={`${label} 달력`} onKeyDown={key}>
      <div className="ui-cal-head">
        <button type="button" className="ui-cal-nav" aria-label={view === 'days' ? '1년 전' : '1년 전'} onClick={() => go(-12)}><ChevronsLeft size={16} aria-hidden="true" /></button>
        {view === 'days' && <button type="button" className="ui-cal-nav" aria-label="이전 달" onClick={() => go(-1)}><ChevronLeft size={16} aria-hidden="true" /></button>}
        <button type="button" className="ui-cal-title" aria-live="polite" onClick={() => setView(view === 'days' ? 'months' : 'days')} title={view === 'days' ? '달 고르기' : '날짜로 돌아가기'}>
          {view === 'days' ? `${f.y}년 ${f.m}월` : `${f.y}년`}
        </button>
        {view === 'days' && <button type="button" className="ui-cal-nav" aria-label="다음 달" onClick={() => go(1)}><ChevronRight size={16} aria-hidden="true" /></button>}
        <button type="button" className="ui-cal-nav" aria-label="1년 뒤" onClick={() => go(12)}><ChevronsRight size={16} aria-hidden="true" /></button>
      </div>
      {view === 'months' ? (
        <div className="ui-cal-months" role="group" aria-label={`${f.y}년 달 고르기`}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const first = ymd(f.y, m, 1), last = ymd(f.y, m, daysIn(f.y, m));
            const disabled = (!!max && first > max) || (!!min && last < min);
            return <button key={m} type="button" disabled={disabled} className={m === f.m ? 'on' : ''} onClick={() => { setFocus(clamp(ymd(f.y, m, Math.min(f.d, daysIn(f.y, m))))); setView('days'); }}>{m}월</button>;
          })}
        </div>
      ) : (
        <div ref={grid} className="ui-cal-grid" role="grid" aria-label={`${f.y}년 ${f.m}월`}>
          {WEEKDAYS.map((w, i) => <span key={w} className={`ui-cal-wd${i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''}`} aria-hidden="true">{w}</span>)}
          {cells.map((d, i) => d == null ? <span key={`e${i}`} /> : (
            <button key={d} type="button" role="gridcell" tabIndex={d === focus ? 0 : -1} data-focus={d === focus ? '1' : undefined}
              aria-selected={d === value} aria-current={d === today ? 'date' : undefined} aria-label={formatYmd(d)} disabled={out(d)}
              className={['ui-cal-day', d === value && 'is-sel', d === today && 'is-today', i % 7 === 0 && 'is-sun', i % 7 === 6 && 'is-sat'].filter(Boolean).join(' ')}
              onClick={() => onPick(d)} onFocus={() => d !== focus && setFocus(d)}>{+d.slice(8)}</button>
          ))}
        </div>
      )}
      {!!quick?.length && (
        <div className="ui-cal-quick">
          {quick.map((q) => <button key={q.label} type="button" disabled={q.value != null && out(q.value)} className={q.value === value || (q.value == null && !value) ? 'on' : ''} onClick={() => onPick(q.value)}>{q.label}</button>)}
        </div>
      )}
    </div>
  );
}

/**
 * 날짜 칸: 칸 어디를 눌러도 달력이 열린다 (브라우저 기본 date 입력은 작은 아이콘만 눌러야 열리고 '연도. 월. 일.' 이 보여 헷갈렸다).
 * quick: 달력 아래 빠른 선택(예: 오늘, 1년 계약, 협의=비우기). clearable 이면 칸 오른쪽 X 로 비운다.
 */
export function DateField({ label, value, onChange, min, max, hint, error, quick, placeholder = '날짜 고르기', clearable, className }: {
  label: string; value: string; onChange: (v: string) => void; min?: string; max?: string; hint?: string; error?: string | null;
  quick?: DateQuick[]; placeholder?: string; clearable?: boolean; className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); btn.current?.focus(); };
  useDismiss(open, root, () => setOpen(false));
  const right = useAlign(open, root, 300);
  const msg = error || hint;
  return (
    <div ref={root} className={`ui-field ui-date${error ? ' has-error' : ''}${className ? ` ${className}` : ''}`}>
      <span className="ui-field-label" id={`${id}-l`}>{label}</span>
      <div className="ui-date-row">
        <button ref={btn} type="button" className={`ui-date-btn${value ? '' : ' is-empty'}`} aria-haspopup="dialog" aria-expanded={open}
          aria-labelledby={`${id}-l ${id}-v`} aria-describedby={msg ? `${id}-m` : undefined} onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}>
          <CalendarDays size={16} aria-hidden="true" />
          <span id={`${id}-v`}>{value ? formatYmd(value) : placeholder}</span>
        </button>
        {clearable && value && <button type="button" className="ui-date-clear" aria-label={`${label} 지우기`} onClick={() => onChange('')}><X size={14} aria-hidden="true" /></button>}
      </div>
      {open && (
        <div className={`ui-cal-pop${right ? ' is-right' : ''}`}>
          <Calendar value={value} min={min} max={max} quick={quick} label={label} onClose={close} onPick={(v) => { onChange(v ?? ''); close(); }} />
        </div>
      )}
      {msg && <p id={`${id}-m`} className={error ? 'ui-field-error' : 'ui-field-hint'} role={error ? 'alert' : undefined}>{msg}</p>}
    </div>
  );
}

/** 달 고르기: ‹ 2026년 11월 › 와 가운데를 누르면 열두 달 표 (max 이후는 막는다) */
export function MonthStepper({ label, value, onChange, max }: { label: string; value: string; onChange: (v: string) => void; max?: string }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(+value.slice(0, 4));
  const root = useRef<HTMLDivElement>(null);
  useDismiss(open, root, () => setOpen(false));
  const next = shiftMonth(value, 1), canNext = !max || next <= max;
  return (
    <div ref={root} className="ui-mstep" role="group" aria-label={label}>
      <button type="button" className="ui-cal-nav" aria-label="이전 달" onClick={() => onChange(shiftMonth(value, -1))}><ChevronLeft size={18} aria-hidden="true" /></button>
      <button type="button" className="ui-mstep-title" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setYear(+value.slice(0, 4)); setOpen((o) => !o); }}>{formatYm(value)}</button>
      <button type="button" className="ui-cal-nav" aria-label="다음 달" disabled={!canNext} onClick={() => canNext && onChange(next)}><ChevronRight size={18} aria-hidden="true" /></button>
      {open && (
        <div className="ui-cal-pop is-center">
          <div className="ui-cal" role="dialog" aria-label={`${label} 고르기`} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
            <div className="ui-cal-head">
              <button type="button" className="ui-cal-nav" aria-label="1년 전" onClick={() => setYear(year - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
              <span className="ui-cal-title">{year}년</span>
              <button type="button" className="ui-cal-nav" aria-label="1년 뒤" disabled={!!max && ym(year + 1, 1) > max} onClick={() => setYear(year + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
            </div>
            <div className="ui-cal-months">
              {Array.from({ length: 12 }, (_, i) => ym(year, i + 1)).map((m) => (
                <button key={m} type="button" disabled={!!max && m > max} className={m === value ? 'on' : ''} onClick={() => { onChange(m); setOpen(false); }}>{+m.slice(5)}월</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
