import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, ChevronDown, Heart, LogIn, LogOut, Map as MapIcon, Menu, Moon, MoreHorizontal, Mountain, Search, Shirt, Sun, User } from 'lucide-react';
import { clockLabel } from '../world/timeOfDay';
import { TABS, useUi } from './state/ui';
import { useWorld } from './state/world';
import { useSession } from './state/session';
import { useNotifications } from './features/more';
import { unreadCount } from './InboxPanel';
import { useSearch } from './features/search';
import { useKakaoPlaces } from './features/kakaoPlaces';
import { serviceTargetFor } from '../world/serviceArea';
import { SITES } from '../world/neighborhood';
import { useGoToPoint } from './goTo';
import { isVisitKind, useVisit } from './visit';
import { AvatarPicker, useAvatarState } from './avatar/AvatarPicker';
import { InviteButton } from './InviteButton';
import { GfxSettings } from './GfxSettings';
import type { SearchResult } from '../api/types';
import { toLatLng } from './map/geo';
import { useMapFocus } from './map/mapFocus';

const siteLatLng = (s: { x: number; z: number }) => { const [lat, lng] = toLatLng(s.x, s.z); return { lat, lng }; };

/** 한 번에 하나만 열리는 상단바 메뉴. 바깥을 누르거나 Esc 면 닫고, Esc 는 연 버튼으로 포커스를 돌려준다 */
type Pop = 'menu' | 'more' | 'avatar' | 'account' | null;
function usePopover() {
  const [open, setOpen] = useState<Pop>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(null); };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const btn = root.current?.querySelector<HTMLElement>(`[data-pop="${open === 'avatar' ? 'more' : open}"]`);
      setOpen(null); btn?.focus();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const toggle = (p: Exclude<Pop, null>) => setOpen((o) => (o === p ? null : p));
  return { open, setOpen, toggle, root };
}

function PopItem({ icon, children, onClick, current, badge }: { icon: ReactNode; children: ReactNode; onClick: () => void; current?: boolean; badge?: number }) {
  return (
    <li>
      <button type="button" className={`ui-tb-item${current ? ' is-current' : ''}`} aria-current={current ? 'page' : undefined} onClick={onClick}>
        {icon}<span>{children}</span>{badge ? <span className="ui-badge-num ui-tb-item-badge">{badge}</span> : null}
      </button>
    </li>
  );
}

/**
 * 상단바 (정보 위계):
 *  - 항상 보이는 것: 검색 · 6개 탭(현재 탭 표시) · 지도/3D 전환 · 찜 · 알림 · 계정
 *  - '⋯' 로 접은 것: 시간대 슬라이더 · 캐릭터 꾸미기 · 초대 (자주 안 씀)
 *  - 계정 메뉴: 내 정보 · 로그아웃
 *  - 폭 760px 이하: 한 줄 [검색][메뉴][⋯][계정] — 탭·지도·찜·알림은 '메뉴' 안으로 (기능은 그대로, 접근 경로만 바뀜)
 */
export function TopBar() {
  const { tab, panelOpen, selectTab, mapMode, setMapMode, timeOfDay, setTimeOfDay } = useUi();
  const api = useWorld((s) => s.api);
  const { token, nickname, openLogin, logout } = useSession();
  const unread = unreadCount(useNotifications().data);
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const pop = usePopover();
  const avatar = useAvatarState();

  // 검색: 서버(매물·단지·기숙사·양도·주소) + 카카오맵 장소 검색(한양대 주변). 3D 로 걸어갈 수 있는 곳(캠퍼스·집 주변 12곳) 안의 결과만 이동 가능
  // 지도 모드에서는 3D 로 가지 않고 지도 위에 마커·정보 카드를 띄운다 (3-3)
  const typed = q.trim().length >= 2;
  const found = useSearch(q).data ?? [];
  const goToPoint = useGoToPoint();
  const visit = useVisit();
  const areaId = useWorld((s) => s.areaId);
  const kakaoAll = useKakaoPlaces(q);
  // 카카오 장소 중 우리 캠퍼스 랜드마크·건물과 같은 곳은 뺀다: 이름이 그 이름으로 끝나면 같은 곳으로 본다
  // (예: '한양대학교 서울캠퍼스 애지문' ≈ 랜드마크 '애지문(한양대역 2번 출구)', '… 사자상' ≈ 건물 '사자상')
  const core = (n: string) => n.replace(/\(.*?\)/g, '').replace(/\s+/g, '');
  const ours = [...(api?.landmarks ?? []).filter((l) => l.key !== 'hero').map((l) => core(l.name)), ...found.filter((r) => r.type === 'BUILDING').map((r) => core(r.name))].filter((n) => n.length >= 2);
  const kakao = kakaoAll
    .filter((k) => !ours.some((n) => core(k.name).endsWith(n)))
    .map((k) => ({ ...k, walkable: serviceTargetFor(k.lat, k.lng, areaId ?? 'campus') != null }));
  const onMap = mapMode === '2d';
  const showOnMap = (p: { name: string; address?: string | null; lat: number; lng: number; kind?: string; id?: number | null }) => {
    useMapFocus.getState().focus({ name: p.name, address: p.address ?? null, lat: p.lat, lng: p.lng, kind: p.kind ?? null, id: p.id ?? undefined });
    setFocused(false);
  };
  const pick = (r: SearchResult) => {
    setFocused(false);
    if (onMap) return showOnMap({ ...r, kind: r.type });
    // 집(매물·단지·기숙사·양도)은 상세 패널·지도 핀과 같은 길로 (그 탭·그 상세를 골라 두고 집 앞에 선다)
    if (r.id != null && isVisitKind(r.type)) return visit({ kind: r.type, id: r.id, lat: r.lat, lng: r.lng, name: r.name });
    goToPoint(r);
  };
  // 입력 전에는 우리 서비스의 집 주변 12곳, 입력하면 이름이 맞는 캠퍼스 랜드마크도 같이
  const q1 = q.trim();
  const sites = SITES.filter((s) => !q1 || s.name.includes(q1) || s.address.includes(q1));
  // 같은 곳이 서버 검색(캠퍼스 건물)과 3D 랜드마크에 둘 다 있으면(예: 사자상) 한 번만 — 서버 결과를 남긴다
  const shown = new Set([...found.map((r) => r.name.replace(/\s+/g, '')), ...(typed ? kakao.map((k) => k.name.replace(/\s+/g, '')) : [])]);
  const landmarks = q1 && !onMap ? (api?.landmarks ?? []).filter((l) => l.key !== 'hero' && l.name.includes(q1) && !shown.has(l.name.replace(/\s+/g, ''))) : [];
  const current = TABS.find((t) => t.id === tab)?.label ?? '메뉴';
  const go = (fn: () => void) => () => { pop.setOpen(null); fn(); };
  const mapLabel = onMap ? '3D로 보기' : '지도로 보기';

  return (
    <header className="topbar" ref={pop.root as React.RefObject<HTMLElement>}>
      <div className="search-wrap">
        <label className="search glass">
          <Search size={16} aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setFocused(true); }}
            onClick={() => setFocused(true)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            placeholder={onMap ? '지도에서 찾기 (동네·건물·역)' : '동네, 건물, 단지 이름'}
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
                <button type="button" disabled={!onMap && !k.walkable} onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { if (onMap) showOnMap({ ...k, id: null, kind: 'PLACE' }); else if (goToPoint(k)) setFocused(false); }}
                  title={onMap ? '지도에서 보기' : k.walkable ? '3D 로 가기' : '3D 로 걸어볼 수 있는 곳(캠퍼스·집 주변 12곳) 밖이에요'}>
                  {k.name}{k.address ? ` · ${k.address}` : ''}{!onMap && !k.walkable ? ' (3D 지원 지역 밖)' : ''}
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
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { if (onMap) showOnMap({ name: s.name, address: s.address, ...siteLatLng(s), kind: 'SITE' }); else { goToPoint(siteLatLng(s)); setFocused(false); } }}>
                  {s.name}<span className="ui-suggest-tag">{s.kind === 'housing' ? '청년안심주택' : '매물'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <nav className="tabs glass ui-tb-desk" role="tablist" aria-label="메뉴">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id && panelOpen ? 'is-open' : undefined} onClick={() => selectTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="grow" />
      <button className="textbtn glass mapswitch ui-tb-desk" type="button" aria-pressed={onMap} onClick={() => setMapMode(onMap ? '3d' : '2d')}>
        {onMap ? <Mountain size={16} aria-hidden="true" /> : <MapIcon size={16} aria-hidden="true" />}{mapLabel}
      </button>
      <button className="iconbtn glass ui-tb-desk" type="button" aria-label="찜 목록" aria-pressed={panelOpen && tab === 'fav'} onClick={() => selectTab('fav')}>
        <Heart size={18} aria-hidden="true" />
      </button>
      <button className="iconbtn glass ui-bell ui-tb-desk" type="button" aria-label={unread ? `알림 ${unread}개` : '알림'} aria-pressed={panelOpen && tab === 'inbox'} onClick={() => selectTab('inbox')}>
        {unread > 0 && <span className="ui-badge-num" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
        <Bell size={18} aria-hidden="true" />
      </button>

      {/* 좁은 화면: 탭·지도·찜·알림을 한 메뉴로 */}
      <div className="ui-tb-wrap ui-tb-mob">
        <button className="textbtn glass ui-tb-menubtn" type="button" data-pop="menu" aria-haspopup="true" aria-expanded={pop.open === 'menu'} onClick={() => pop.toggle('menu')}>
          <Menu size={16} aria-hidden="true" /><span>{current}</span>{unread > 0 && <span className="ui-badge-num" aria-label={`안 읽은 알림 ${unread}개`}>{unread > 9 ? '9+' : unread}</span>}
        </button>
        {pop.open === 'menu' && (
          <ul className="ui-tb-pop glass" aria-label="메뉴">
            {TABS.map((t) => <PopItem key={t.id} icon={<span className="ui-tb-dot" aria-hidden="true" />} current={tab === t.id} onClick={go(() => useUi.setState({ tab: t.id, panelOpen: true }))}>{t.label}</PopItem>)}
            <PopItem icon={onMap ? <Mountain size={16} aria-hidden="true" /> : <MapIcon size={16} aria-hidden="true" />} onClick={go(() => setMapMode(onMap ? '3d' : '2d'))}>{mapLabel}</PopItem>
            <PopItem icon={<Heart size={16} aria-hidden="true" />} current={tab === 'fav'} onClick={go(() => useUi.setState({ tab: 'fav', panelOpen: true }))}>찜 목록</PopItem>
            <PopItem icon={<Bell size={16} aria-hidden="true" />} current={tab === 'inbox'} badge={unread} onClick={go(() => useUi.setState({ tab: 'inbox', panelOpen: true }))}>알림</PopItem>
          </ul>
        )}
      </div>

      {/* 자주 안 쓰는 것: 시간대·캐릭터 꾸미기·초대 */}
      <div className="ui-tb-wrap">
        <button className="iconbtn glass" type="button" data-pop="more" aria-label="더 보기" title="시간대 · 캐릭터 꾸미기 · 초대" aria-haspopup="true" aria-expanded={pop.open === 'more' || pop.open === 'avatar'} onClick={() => pop.toggle('more')}>
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
        {pop.open === 'more' && (
          <div className="ui-tb-pop glass ui-tb-more" role="group" aria-label="더 보기">
            <div className="tod">
              <Sun size={15} aria-hidden="true" />
              <input type="range" min={0} max={1000} step={1} value={Math.round(timeOfDay * 1000)} onChange={(e) => setTimeOfDay(Number(e.target.value) / 1000)} aria-label="시간대 (왼쪽 낮, 오른쪽 밤)" aria-valuetext={clockLabel(timeOfDay)} />
              <Moon size={15} aria-hidden="true" />
              <span className="tod-clock" aria-live="off">{clockLabel(timeOfDay)}</span>
            </div>
            <ul>
              <PopItem icon={<Shirt size={16} aria-hidden="true" />} onClick={() => pop.setOpen('avatar')}>캐릭터 꾸미기</PopItem>
              <li><InviteButton className="ui-tb-item" /></li>
            </ul>
            <GfxSettings />
          </div>
        )}
        {pop.open === 'avatar' && <AvatarPicker look={avatar.look} onChange={avatar.change} deptName={avatar.deptName} />}
      </div>

      <div className="ui-tb-wrap ui-tb-wrap-acc">
        {token
          ? <>
              <button className="textbtn glass ui-tb-account" type="button" data-pop="account" aria-haspopup="true" aria-expanded={pop.open === 'account'} aria-label={`내 계정 ${nickname ?? ''}`.trim()} onClick={() => pop.toggle('account')}>
                <User size={16} aria-hidden="true" /><span className="ui-tb-name">{nickname ?? '내 계정'}</span><ChevronDown size={14} aria-hidden="true" />
              </button>
              {pop.open === 'account' && (
                <ul className="ui-tb-pop glass" aria-label="내 계정">
                  <PopItem icon={<User size={16} aria-hidden="true" />} onClick={go(() => useUi.setState({ profileOpen: true }))}>내 정보</PopItem>
                  <PopItem icon={<LogOut size={16} aria-hidden="true" />} onClick={go(logout)}>로그아웃</PopItem>
                </ul>
              )}
            </>
          : <button className="textbtn glass ui-tb-account" type="button" onClick={openLogin} aria-label="로그인"><LogIn size={16} aria-hidden="true" /><span className="ui-tb-name">로그인</span></button>}
      </div>
    </header>
  );
}
