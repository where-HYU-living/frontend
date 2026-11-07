import { WorldLayer } from './WorldLayer';
import { TopBar } from './TopBar';
import { SidePanel } from './SidePanel';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { KakaoMap } from './map/KakaoMap';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginModal } from './LoginModal';
import { ListingMarkers } from './ListingMarkers';
import { PlaceMarkers } from './PlaceMarkers';
import { WorldEffects } from './WorldEffects';
import { TransferMarkers } from './TransferMarkers';
import { ProfileModal } from './ProfileModal';
import { WorldChat } from './WorldChat';
import { InteriorScene } from '../interior/InteriorScene';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

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
      <TransferMarkers />
      {mapMode === '2d' && <KakaoMap />}
      <div className="ui-layer">
        <TopBar />
        {mapMode === '3d' && <SidePanel />}
      </div>
      <WorldChat />
      <InteriorScene />
      <LoginModal />
      <ProfileModal />
      <Loading />
    </QueryClientProvider>
  );
}
