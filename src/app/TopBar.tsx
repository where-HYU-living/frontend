import { useState } from 'react';
import { Bell, Heart, Moon, Search, Sun } from 'lucide-react';
import { clockLabel } from '../world/timeOfDay';
import { TABS, useUi } from './state/ui';
import { useWorld } from './state/world';
import { useSession } from './state/session';
import { useNotifications } from './features/more';
import { unreadCount } from './InboxPanel';
import { useSearch } from './features/search';
import { useListingsUi } from './features/listings';
import { useKakaoPlaces } from './features/kakaoPlaces';
import { serviceTargetFor } from '../world/serviceArea';
import { SITES } from '../world/neighborhood';
import { useGoToPoint } from './goTo';
import { AvatarButton } from './avatar/AvatarPicker';
import { InviteButton } from './InviteButton';
import type { SearchResult } from '../api/types';
import { toLatLng } from './map/geo';

const siteLatLng = (s: { x: number; z: number }) => { const [lat, lng] = toLatLng(s.x, s.z); return { lat, lng }; };

export function TopBar() {
  const { tab, panelOpen, selectTab, mapMode, setMapMode, timeOfDay, setTimeOfDay } = useUi();
  const api = useWorld((s) => s.api);
  const { token, nickname, openLogin, logout } = useSession();
  const unread = unreadCount(useNotifications().data);
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);

  // 검색: 서버(매물·단지·기숙사·양도·주소) + 카카오맵 장소 검색(한양대 주변). 3D 로 걸어갈 수 있는 곳(캠퍼스·집 주변 12곳) 안의 결과만 이동 가능
  const typed = q.trim().length >= 2;
  const found = useSearch(q).data ?? [];
  const goToPoint = useGoToPoint();
  const areaId = useWorld((s) => s.areaId);
  const kakaoAll = useKakaoPlaces(q);
  const kakao = kakaoAll.map((k) => ({ ...k, walkable: serviceTargetFor(k.lat, k.lng, areaId ?? 'campus') != null }));
  const pick = (r: SearchResult) => {
    setFocused(false);
    if (r.type === 'LISTING' && r.id != null) { useListingsUi.getState().select(r.id); useUi.setState({ tab: 'home', panelOpen: true }); }
    goToPoint(r);
  };
  // 입력 전에는 우리 서비스의 집 주변 12곳, 입력하면 이름이 맞는 캠퍼스 랜드마크도 같이
  const q1 = q.trim();
  const sites = SITES.filter((s) => !q1 || s.name.includes(q1) || s.address.includes(q1));
  const landmarks = q1 ? (api?.landmarks ?? []).filter((l) => l.key !== 'hero' && l.name.includes(q1)) : [];

  return (
    <header className="topbar">
      <div className="search-wrap">
        <label className="search glass">
          <Search size={16} aria-hidden="true" />
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
        {focused && (sites.length > 0 || landmarks.length > 0 || found.length > 0 || kakao.length > 0) && (
          <ul className="suggest glass" role="listbox" aria-label="검색 결과">
            {found.map((r) => (
              <li key={`${r.type}${r.id ?? r.name}`}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)}>{r.name}{r.address ? ` · ${r.address}` : ''}</button>
              </li>
            ))}
            {typed && kakao.map((k) => (
              <li key={`k${k.id}`}>
                <button type="button" disabled={!k.walkable} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (goToPoint(k)) setFocused(false); }} title={k.walkable ? '3D 로 가기' : '3D 로 걸어볼 수 있는 곳(캠퍼스·집 주변 12곳) 밖이에요'}>
                  {k.name}{k.address ? ` · ${k.address}` : ''}{k.walkable ? '' : ' (3D 지원 지역 밖)'}
                </button>
              </li>
            ))}
            {landmarks.map((l) => (
              <li key={l.key}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { api?.goToLandmark(l.key); setFocused(false); }}>
                  {l.name}
                </button>
              </li>
            ))}
            {sites.map((s) => (
              <li key={s.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { goToPoint(siteLatLng(s)); setFocused(false); }}>
                  {s.name}<span className="ui-suggest-tag">{s.kind === 'housing' ? '청년안심주택' : '매물'}</span>
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
      <div className="tod glass">
        <Sun size={15} aria-hidden="true" />
        <input type="range" min={0} max={1000} step={1} value={Math.round(timeOfDay * 1000)} onChange={(e) => setTimeOfDay(Number(e.target.value) / 1000)} aria-label="시간대 (왼쪽 낮, 오른쪽 밤)" aria-valuetext={clockLabel(timeOfDay)} />
        <Moon size={15} aria-hidden="true" />
        <span className="tod-clock" aria-live="off">{clockLabel(timeOfDay)}</span>
      </div>
      <button className="textbtn glass mapswitch" type="button" onClick={() => setMapMode(mapMode === '3d' ? '2d' : '3d')}>
        {mapMode === '3d' ? '지도로 보기' : '3D로 보기'}
      </button>
      <AvatarButton />
      <InviteButton />
      <button className="iconbtn glass" type="button" aria-label="찜 목록" onClick={() => selectTab('fav')}>
        <Heart size={18} aria-hidden="true" />
      </button>
      <button className="iconbtn glass ui-bell" type="button" aria-label={unread ? `알림 ${unread}개` : '알림'} onClick={() => selectTab('inbox')}>
        {unread > 0 && <span className="ui-badge-num">{unread}</span>}
        <Bell size={18} aria-hidden="true" />
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
