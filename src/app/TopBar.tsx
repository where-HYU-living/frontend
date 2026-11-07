import { useState } from 'react';
import { TABS, useUi } from './state/ui';
import { useWorld } from './state/world';

export function TopBar() {
  const { tab, panelOpen, selectTab, mapMode, setMapMode } = useUi();
  const api = useWorld((s) => s.api);
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);

  // 데이터가 붙기 전까지 검색은 캠퍼스 랜드마크만 찾는다
  const suggestions = (api?.landmarks ?? []).filter((l) => !q.trim() || l.name.includes(q.trim()));

  return (
    <header className="topbar">
      <div className="search-wrap">
        <label className="search glass">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setFocused(true); }}
            onClick={() => setFocused(true)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            placeholder="동네, 건물, 단지 이름"
            aria-label="검색"
          />
        </label>
        {focused && suggestions.length > 0 && (
          <ul className="suggest glass" role="listbox" aria-label="검색 결과">
            {suggestions.map((l) => (
              <li key={l.key}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { api?.goToLandmark(l.key); setFocused(false); }}>
                  {l.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <nav className="tabs glass" role="tablist" aria-label="메뉴">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={panelOpen && tab === t.id} onClick={() => selectTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="grow" />
      <button className="textbtn glass" type="button" onClick={() => setMapMode(mapMode === '3d' ? '2d' : '3d')}>
        {mapMode === '3d' ? '지도로 보기' : '3D로 보기'}
      </button>
      <button className="iconbtn glass" type="button" aria-label="알림">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
      </button>
      <button className="textbtn glass" type="button">로그인</button>
    </header>
  );
}
