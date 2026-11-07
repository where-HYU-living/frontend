import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { filterDepartments, groupByCollege, type Dept } from './departments';

/** 학과 검색 선택창: 입력하면 학과·단과대 이름으로 걸러지고, 고르면 연결된 건물을 보여준다 */
export function DepartmentPicker({ departments, value, onChange }: {
  departments: Dept[]; value: number | null; onChange: (id: number | null) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const selected = departments.find((d) => d.id === value) ?? null;

  const filtered = useMemo(() => filterDepartments(departments, q), [departments, q]);
  const groups = useMemo(() => groupByCollege(filtered), [filtered]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]); // 화면 순서 = 키보드 이동 순서

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);

  const pick = (d: Dept) => { onChange(d.id); setQ(''); setOpen(false); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && flat[active]) { e.preventDefault(); pick(flat[active]); }
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); } }
  };

  return (
    <div className="ui-dept" ref={box}>
      {selected && (
        <div className="ui-dept-chosen">
          <div>
            <strong>{selected.name}</strong> <span className="ui-card-sub">{selected.college}</span>
          </div>
          <button type="button" className="ui-dept-clear" aria-label="학과 선택 지우기" onClick={() => onChange(null)}><X size={14} aria-hidden="true" /></button>
        </div>
      )}
      <div className="ui-dept-input">
        <Search size={15} aria-hidden="true" />
        <input
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-label="학과 검색"
          aria-activedescendant={open && flat[active] ? `${listId}-${flat[active].id}` : undefined}
          placeholder={selected ? '다른 학과 검색' : '학과 검색 (예: 컴퓨터, 경영)'}
          value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
        />
        <ChevronDown size={15} aria-hidden="true" />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label="학과 목록" className="ui-dept-list">
          {flat.length === 0 && <li className="ui-dept-empty" role="presentation">검색 결과가 없어요</li>}
          {groups.map((g) => (
            <li key={g.college} role="presentation">
              <div className="ui-dept-college">{g.college}</div>
              <ul role="presentation">
                {g.items.map((d) => {
                  const i = flat.indexOf(d);
                  return (
                    <li key={d.id} id={`${listId}-${d.id}`} role="option" aria-selected={d.id === value} className={i === active ? 'is-active' : ''}
                      onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(d); }}>
                      <span>{d.name}</span>
                      {d.id === value && <Check size={14} aria-hidden="true" />}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
