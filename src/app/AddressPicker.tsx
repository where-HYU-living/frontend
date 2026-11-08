import { useEffect, useId, useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import type { AddressResult } from '../api/types';
import { useDebounced } from './features/search';
import { useAddressSearch } from './features/more';
import './forms/forms.css';

/**
 * 주소 검색(/geo/address) → 고르면 주소·동·좌표를 넘긴다. 직접 입력은 받지 않는다(좌표가 필요).
 * 고른 뒤에는 검색칸 대신 고른 주소 카드 + [바꾸기]. 결과는 화살표·Enter 로도 고른다.
 */
export function AddressPicker({ value, onPick, error }: { value: AddressResult | null; onPick: (a: AddressResult) => void; error?: string | null }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(!value);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const term = useDebounced(q.trim(), 300);
  const res = useAddressSearch(term);
  const list = term.length >= 2 ? res.data ?? [] : [];
  useEffect(() => setActive(0), [term]);
  useEffect(() => { if (editing && value) input.current?.focus(); }, [editing, value]);

  const pick = (a: AddressResult) => { onPick(a); setQ(''); setEditing(false); };

  if (value && !editing) {
    return (
      <div className="ui-addr2 span2">
        <span className="ui-field-label">주소</span>
        <div className="ui-addr2-card">
          <MapPin size={16} aria-hidden="true" />
          <span className="ui-addr2-main"><b>{value.roadAddress ?? value.address}</b><small>{value.dong}</small></span>
          <button type="button" className="ui-addr2-change" onClick={() => setEditing(true)}>바꾸기</button>
        </div>
      </div>
    );
  }

  const searching = term.length >= 2 && res.isFetching;
  return (
    <div className="ui-addr2 span2">
      <div className={`ui-field${error ? ' has-error' : ''}`}>
        <label className="ui-field-label" htmlFor={id}>주소</label>
        <span className="ui-addr2-box">
          <Search size={15} aria-hidden="true" />
          <input ref={input} id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="동 이름이나 도로명 (예: 행당동, 왕십리로)" aria-label="주소 검색"
            role="combobox" aria-expanded={list.length > 0} aria-controls={`${id}-list`} aria-activedescendant={list.length ? `${id}-o${active}` : undefined} aria-invalid={error ? true : undefined} autoComplete="off"
            onKeyDown={(e) => {
              if (!list.length) return;
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % list.length); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + list.length) % list.length); }
              else if (e.key === 'Enter') { e.preventDefault(); pick(list[active]); }
            }} />
          {value && <button type="button" className="ui-addr2-cancel" onClick={() => { setQ(''); setEditing(false); }}>취소</button>}
        </span>
        {error && <p className="ui-field-error" role="alert">{error}</p>}
      </div>
      {term.length < 2 && !error && <p className="ui-field-hint">두 글자 이상 적으면 바로 찾아요. 목록에서 골라 주세요</p>}
      {searching && !res.data && <p className="ui-field-hint" role="status">찾는 중…</p>}
      {res.isError && <p className="ui-field-hint">주소 검색을 쓸 수 없어요. 잠시 뒤 다시 해 보세요.</p>}
      {term.length >= 2 && res.data && res.data.length === 0 && <p className="ui-field-hint">검색 결과가 없어요. 동 이름만 적어 보세요.</p>}
      {list.length > 0 && (
        <ul id={`${id}-list`} className="ui-addr2-list" role="listbox" aria-label="주소 검색 결과">
          {list.map((a, i) => (
            <li key={i} id={`${id}-o${i}`} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} className={i === active ? 'is-active' : ''} onMouseEnter={() => setActive(i)} onClick={() => pick(a)}>
                <span>{a.roadAddress ?? a.address}</span>
                {a.roadAddress && <small>{a.address}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
