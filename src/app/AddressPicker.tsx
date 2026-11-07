import { useState } from 'react';
import { MapPin } from 'lucide-react';
import type { AddressResult } from '../api/types';
import { useDebounced } from './features/search';
import { useAddressSearch } from './features/more';
import { Field } from './forms/Field';
import './forms/forms.css';

/** 주소 검색(/geo/address) → 고르면 주소·동·좌표를 넘긴다. 직접 입력은 받지 않는다(좌표가 필요) */
export function AddressPicker({ value, onPick, error }: { value: AddressResult | null; onPick: (a: AddressResult) => void; error?: string | null }) {
  const [q, setQ] = useState('');
  const term = useDebounced(q, 300);
  const res = useAddressSearch(term);
  return (
    <div className="ui-addr2 span2">
      <Field label="주소" hint={value ? undefined : '도로명이나 동 이름으로 검색한 뒤 목록에서 골라요'} error={error}>
        {(id, desc) => <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={value ? value.roadAddress ?? value.address : '주소 검색 (예: 행당동 000)'} aria-label="주소 검색" aria-describedby={desc} aria-invalid={error ? true : undefined} />}
      </Field>
      {value && <p className="ui-addr2-picked"><MapPin size={13} aria-hidden="true" style={{ verticalAlign: -2 }} /> 선택: {value.roadAddress ?? value.address} ({value.dong})</p>}
      {res.isError && <p className="ui-field-hint">주소 검색을 쓸 수 없어요. 잠시 뒤 다시 해 보세요.</p>}
      {res.data && res.data.length === 0 && <p className="ui-field-hint">검색 결과가 없어요.</p>}
      {res.data && res.data.length > 0 && (
        <ul className="ui-addr2-list">
          {res.data.map((a, i) => (<li key={i}><button type="button" onClick={() => { onPick(a); setQ(''); }}>{a.roadAddress ?? a.address}</button></li>))}
        </ul>
      )}
    </div>
  );
}
