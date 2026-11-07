import { lazy, Suspense } from 'react';
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
// 3-4 성능: 실내 3D·카카오 지도는 들어갈 때만 내려받는다 (첫 화면 번들에서 뺌)
const KakaoMap = lazy(() => import('./map/KakaoMap').then((m) => ({ default: m.KakaoMap })));
const InteriorScene = lazy(() => import('../interior/InteriorScene').then((m) => ({ default: m.InteriorScene })));
function Indoor() {
  const indoor = useUi((s) => s.indoor);
  if (!indoor) return null;
  return <Suspense fallback={<div className="loading" role="status"><div className="loading-card glass"><div className="loading-sub">실내를 불러오는 중</div></div></div>}><InteriorScene /></Suspense>;
}
import { MockBadge } from '../mock/MockBadge';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
// 점검 스크립트용 (scripts/*-check.mjs): 화면 상태를 숫자로 읽고 바꾼다. 개발 서버에서만
if (import.meta.env.DEV && typeof window !== 'undefined') {
  void Promise.all([import('./features/listings'), import('./state/detail'), import('../api/client')]).then(([l, d, c]) => {
    (window as unknown as Record<string, unknown>).__app = { useUi, useListingsUi: l.useListingsUi, useDetailSel: d.useDetailSel, queryClient, api: c.api };
  });
}

function Loading() {
  const { status, progress, error } = useWorld();
  if (status === 'ready') return null;
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
      <ListingMarkers />
      <PlaceMarkers />
      <WorldEffects />
      <NeighborhoodHud />
      <TransferMarkers />
      {mapMode === '2d' && <Suspense fallback={<p className="ui-map-note" role="status">지도를 불러오는 중</p>}><KakaoMap /></Suspense>}
      <div className="ui-layer">
        <TopBar />
        {mapMode === '3d' && <SidePanel />}
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
