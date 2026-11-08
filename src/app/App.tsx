import { lazy, Suspense, useEffect } from 'react';
import { WorldLayer } from './WorldLayer';
import { TopBar } from './TopBar';
import { SidePanel } from './SidePanel';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { LandingNotice } from './map/LandingNotice';
import { RouteHud } from './route/RouteHud';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginModal } from './LoginModal';
import { ListingMarkers } from './ListingMarkers';
import { PlaceMarkers } from './PlaceMarkers';
import { WorldEffects } from './WorldEffects';
import { NeighborhoodHud } from './NeighborhoodButton';
import { TransferMarkers } from './TransferMarkers';
import { ProfileModal } from './ProfileModal';
import { WorldChat } from './WorldChat';
import { ErrorBoundary } from './ErrorBoundary';
import { watchSession } from './features/personal';
import { useFavOverrides } from './features/favorites';
import { useProfile } from './features/catalog';
import { useSession } from './state/session';
import { ApiError } from '../api/client';
import './forms/forms.css';
// 3-4 성능: 실내 3D·카카오 지도는 들어갈 때만 내려받는다 (첫 화면 번들에서 뺌)
const KakaoMap = lazy(() => import('./map/KakaoMap').then((m) => ({ default: m.KakaoMap })));
const InteriorScene = lazy(() => import('../interior/InteriorScene').then((m) => ({ default: m.InteriorScene })));
function Indoor() {
  const indoor = useUi((s) => s.indoor);
  if (!indoor) return null;
  return <ErrorBoundary label="실내 3D" place="center" onClose={() => useUi.getState().exitIndoor()}><Suspense fallback={<div className="loading" role="status"><div className="loading-card glass"><div className="loading-sub">실내를 불러오는 중</div></div></div>}><InteriorScene /></Suspense></ErrorBoundary>;
}
import { MockBadge } from '../mock/MockBadge';

// 4xx(없음·권한·검증)는 다시 해도 같으니 바로 실패로 보여 주고, 네트워크·5xx 만 한 번 더
const retry = (n: number, e: unknown) => n < 1 && !(e instanceof ApiError && e.status >= 400 && e.status < 500);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry, refetchOnWindowFocus: false } } });
// 로그인 계정이 바뀌면 앞사람 기록·찜 표시를 지우고 사람마다 다른 값(찜·도보 분·예산)을 다시 받는다
watchSession(queryClient, () => useFavOverrides.setState({ o: {} }));
// 점검 스크립트용 (scripts/*-check.mjs): 화면 상태를 숫자로 읽고 바꾼다. 개발 서버에서만
if (import.meta.env.DEV && typeof window !== 'undefined') {
  void Promise.all([import('./features/listings'), import('./state/detail'), import('../api/client'), import('./state/session')]).then(([l, d, c, s]) => {
    (window as unknown as Record<string, unknown>).__app = { useUi, useListingsUi: l.useListingsUi, useDetailSel: d.useDetailSel, useSession: s.useSession, queryClient, api: c.api };
  });
}

/** 새로고침하면 세션엔 토큰만 남는다 → 내 정보의 닉네임으로 채운다 (상단 계정 버튼·같이 걷기 이름표가 '손님'이 되지 않게) */
function NicknameSync() {
  const nick = useProfile().data?.nickname;
  useEffect(() => { if (nick && useSession.getState().token && useSession.getState().nickname !== nick) useSession.setState({ nickname: nick }); }, [nick]);
  return null;
}

function Loading() {
  const { status, progress, error } = useWorld();
  // 키보드(Tab·Enter)로 메뉴 버튼을 누르는 길도 막는다 (React 18 은 inert 속성을 몰라서 직접 건다)
  useEffect(() => {
    const layer = document.querySelector<HTMLElement>('.ui-layer');
    if (!layer || status !== 'loading') return;
    layer.inert = true;
    return () => { layer.inert = false; };
  }, [status]);
  if (status === 'ready') return null;
  // 불러오는 동안에도 3D 가 사자상 앞에서 그려지므로 화면을 가리지 않고 아래쪽에 작은 진행 막대만 띄운다.
  // 다만 투명한 막으로 클릭·터치를 모두 받아서, 다 불러오기 전에는 이동(검색·길찾기·월드 전환 포함)을 못 하게 한다
  if (status !== 'error') {
    const pct = Math.round(progress * 100);
    return (
      // 시작 화면(사자상 앞, progress 0.5)이 다 지어지기 전에는 안개색으로 가렸다가 페이드로 걷는다 → 바닥부터 올라오는 모습이 안 보인다
      <div className={`ui-loadblock${progress < 0.5 ? ' is-veiled' : ''}`} role="status" aria-label={`캠퍼스를 불러오는 중 ${pct}%`} onPointerDown={(e) => e.preventDefault()}>
        <div className="ui-loadpill glass">
          <span className="ui-loadpill-text">불러오는 중 {pct}%</span>
          <div className="loading-bar"><span style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
    );
  }
  return (
    <div className="loading" role="status">
      <div className="loading-card glass">
        <div className="loading-title">어디서사냥</div>
        <div className="loading-sub">{status === 'error' ? `불러오지 못했어요: ${error}` : '한양대 서울캠퍼스를 불러오는 중'}</div>
        {status !== 'error' && <div className="loading-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
      </div>
    </div>
  );
}

export function App() {
  const mapMode = useUi((s) => s.mapMode);
  return (
    <QueryClientProvider client={queryClient}>
      <WorldLayer />
      <NicknameSync />
      <ListingMarkers />
      <PlaceMarkers />
      <WorldEffects />
      <NeighborhoodHud />
      <TransferMarkers />
      {mapMode === '2d' && <ErrorBoundary label="지도" place="center" onClose={() => useUi.getState().setMapMode('3d')}><Suspense fallback={<p className="ui-map-note" role="status">지도를 불러오는 중</p>}><KakaoMap /></Suspense></ErrorBoundary>}
      <div className="ui-layer">
        <TopBar />
        {mapMode === '3d' && <ErrorBoundary label="이 화면" place="panel" onClose={() => useUi.getState().setPanelOpen(false)}><SidePanel /></ErrorBoundary>}
      </div>
      <LandingNotice />
      <RouteHud />
      <WorldChat />
      <Indoor />
      <LoginModal />
      <ProfileModal />
      <Loading />
      <MockBadge />
    </QueryClientProvider>
  );
}
