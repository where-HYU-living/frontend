import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Star, X } from 'lucide-react';
import { norm } from './campusSearch';

export type BuildingOption = { id: number; name: string };

/** 학과를 고르면 자동으로 채워지는 "내 건물"을 보여주고, 직접 추가·삭제·대표 변경을 할 수 있게 한다. 첫 번째가 대표(도보 시간 기준) */
export function BuildingPicker({ selected, options, onChange }: { selected: number[]; options: BuildingOption[]; onChange: (ids: number[]) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const nameOf = useMemo(() => new Map(options.map((o) => [o.id, o.name])), [options]);

  const candidates = useMemo(() => {
    const k = norm(q);
    return options.filter((o) => !selected.includes(o.id) && (!k || norm(o.name).includes(k)));
  }, [options, selected, q]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);

  const add = (id: number) => { onChange([...selected, id]); setQ(''); setOpen(false); };
  const remove = (id: number) => onChange(selected.filter((x) => x !== id));
  const makePrimary = (id: number) => onChange([id, ...selected.filter((x) => x !== id)]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, candidates.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && candidates[active]) { e.preventDefault(); add(candidates[active].id); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  };

  return (
    <div className="ui-bld" ref={box}>
      <div className="ui-bld-title">도보 시간을 잴 건물</div>
      <p className="ui-bld-hint">학과를 고르면 과 사무실 건물이 채워져요. 수업을 주로 듣는 건물로 바꾸거나 더할 수 있어요. 별을 누르면 그 건물이 대표(도보 시간 기준)가 돼요.</p>
      {selected.length === 0
        ? <p className="ui-card-sub">아직 고른 건물이 없어요.</p>
        : (
          <ul className="ui-bld-chips" aria-label="내 건물">
            {selected.map((id, i) => (
              <li key={id} className={i === 0 ? 'is-primary' : ''}>
                <span>{nameOf.get(id) ?? `건물 ${id}`}</span>
                {i === 0
                  ? <span className="ui-bld-tag">대표</span>
                  : <button type="button" aria-label={`${nameOf.get(id) ?? id} 대표로 지정`} title="대표로 지정" onClick={() => makePrimary(id)}><Star size={12} aria-hidden="true" /></button>}
                <button type="button" aria-label={`${nameOf.get(id) ?? id} 빼기`} onClick={() => remove(id)}><X size={12} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
      <div className="ui-dept-input ui-bld-add">
        <Plus size={15} aria-hidden="true" />
        <input
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-label="건물 추가"
          aria-activedescendant={open && candidates[active] ? `${listId}-${candidates[active].id}` : undefined}
          placeholder="건물 추가 (예: IT/BT관)" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
        />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label="건물 목록" className="ui-dept-list">
          {candidates.length === 0 && <li className="ui-dept-empty" role="presentation">검색 결과가 없어요</li>}
          {candidates.map((o, i) => (
            <li key={o.id} id={`${listId}-${o.id}`} role="option" aria-selected={false} className={i === active ? 'is-active' : ''}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); add(o.id); }}>
              <span>{o.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
