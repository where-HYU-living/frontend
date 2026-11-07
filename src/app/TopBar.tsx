import { useState } from 'react';
import { TABS, useUi } from './state/ui';
import { useWorld } from './state/world';
import { useSession } from './state/session';
import { useNotifications } from './features/more';
import { unreadCount } from './InboxPanel';
import { useSearch } from './features/search';
import { useListingsUi } from './features/listings';
import { toLocal } from './map/geo';
import type { SearchResult } from '../api/types';

export function TopBar() {
  const { tab, panelOpen, selectTab, mapMode, setMapMode, timeOfDay, setTimeOfDay } = useUi();
  const api = useWorld((s) => s.api);
  const { token, nickname, openLogin, logout } = useSession();
  const unread = unreadCount(useNotifications().data);
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);

  // 데이터가 붙기 전까지 검색은 캠퍼스 랜드마크만 찾는다
  const found = useSearch(q).data ?? [];
  const pick = (r: SearchResult) => {
    setFocused(false);
    if (r.type === 'LISTING' && r.id != null) { useListingsUi.getState().select(r.id); useUi.setState({ tab: 'home', panelOpen: true }); }
    const [x, z] = toLocal(r.lat, r.lng);
    api?.goToPlace(x, z);
  };
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
        {focused && (suggestions.length > 0 || found.length > 0) && (
          <ul className="suggest glass" role="listbox" aria-label="검색 결과">
            {found.map((r) => (
              <li key={`${r.type}${r.id ?? r.name}`}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)}>{r.name}{r.address ? ` · ${r.address}` : ''}</button>
              </li>
            ))}
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
      <div className="tod glass" role="group" aria-label="시간대">
        {([['day', '☀️', '낮'], ['evening', '🌇', '저녁'], ['night', '🌙', '밤']] as const).map(([k, icon, name]) => (
          <button key={k} type="button" aria-label={name} aria-pressed={timeOfDay === k} title={name} onClick={() => setTimeOfDay(k)}>{icon}</button>
        ))}
      </div>
      <button className="textbtn glass" type="button" onClick={() => setMapMode(mapMode === '3d' ? '2d' : '3d')}>
        {mapMode === '3d' ? '지도로 보기' : '3D로 보기'}
      </button>
      <button className="iconbtn glass" type="button" aria-label="찜 목록" onClick={() => selectTab('fav')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.3-9.2C1.5 8.6 3.4 5 6.9 5c2 0 3.5 1.1 5.1 3 1.6-1.9 3.1-3 5.1-3 3.5 0 5.4 3.6 4.2 6.8C19.5 16.4 12 21 12 21z" /></svg>
      </button>
      <button className="iconbtn glass ui-bell" type="button" aria-label={unread ? `알림 ${unread}개` : '알림'} onClick={() => selectTab('inbox')}>
        {unread > 0 && <span className="ui-badge-num">{unread}</span>}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
      </button>
      {token
        ? <>
            <button className="textbtn glass" type="button" onClick={() => useUi.setState({ profileOpen: true })} title="내 정보">{nickname ?? '내 계정'}</button>
            <button className="textbtn glass" type="button" onClick={logout}>로그아웃</button>
          </>
        : <button className="textbtn glass" type="button" onClick={openLogin}>로그인</button>}
    </header>
  );
}
