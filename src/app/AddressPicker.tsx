import { useState } from 'react';
import type { AddressResult } from '../api/types';
import { useDebounced } from './features/search';
import { useAddressSearch } from './features/more';

/** 주소 검색(/geo/address) → 고르면 주소·동·좌표를 넘긴다. 직접 입력은 받지 않는다(좌표가 필요) */
export function AddressPicker({ value, onPick }: { value: AddressResult | null; onPick: (a: AddressResult) => void }) {
  const [q, setQ] = useState('');
  const term = useDebounced(q, 300);
  const res = useAddressSearch(term);
  return (
    <div className="ui-addr">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={value ? value.roadAddress ?? value.address : '주소 검색 (예: 행당동 000)'} aria-label="주소 검색" />
      {value && <p className="ui-card-sub">선택: {value.roadAddress ?? value.address} ({value.dong})</p>}
      {res.isError && <p className="ui-card-sub">주소 검색을 쓸 수 없어요. 잠시 뒤 다시 해 보세요.</p>}
      {res.data && res.data.length === 0 && <p className="ui-card-sub">검색 결과가 없어요.</p>}
      <ul className="ui-rows">
        {res.data?.map((a, i) => (<li key={i}><button type="button" className="ui-link" onClick={() => { onPick(a); setQ(''); }}>{a.roadAddress ?? a.address}</button></li>))}
      </ul>
    </div>
  );
}
