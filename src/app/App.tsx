import { WorldLayer } from './WorldLayer';
import { TopBar } from './TopBar';
import { SidePanel } from './SidePanel';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { KakaoMap } from './map/KakaoMap';

function Loading() {
  const { status, progress, error } = useWorld();
  if (status === 'ready') return null;
  return (
    <div className="loading" role="status">
      <div className="loading-card glass">
        <div className="loading-title">찾았다</div>
        <div className="loading-sub">{status === 'error' ? `불러오지 못했어요: ${error}` : '한양대 서울캠퍼스를 불러오는 중'}</div>
        {status !== 'error' && <div className="loading-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
      </div>
    </div>
  );
}

export function App() {
  const mapMode = useUi((s) => s.mapMode);
  return (
    <>
      <WorldLayer />
      {mapMode === '2d' && <KakaoMap />}
      <div className="ui-layer">
        <TopBar />
        {mapMode === '3d' && <SidePanel />}
      </div>
      <Loading />
    </>
  );
}
