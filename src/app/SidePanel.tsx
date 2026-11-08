import { ChevronLeft } from 'lucide-react';
import { useUi, type Tab } from './state/ui';
import { CampusTourPanel } from './CampusTourPanel';
import { ListingsPanel } from './ListingsPanel';
import { DormPanel } from './DormPanel';
import { HousingPanel } from './HousingPanel';
import { FavoritesPanel } from './FavoritesPanel';
import { MyHomePanel } from './MyHomePanel';
import { TransferPanel } from './TransferPanel';
import { InboxPanel } from './InboxPanel';

const EMPTY: Record<Tab, { title: string; body: string }> = {
  tour: { title: '캠퍼스 투어', body: '' },
  fav: { title: '찜 목록', body: '' },
  inbox: { title: '알림', body: '' },
  home: { title: '자취방', body: '매물 데이터가 연결되면 여기에 목록과 필터가 나와요.' },
  dorm: { title: '기숙사', body: '기숙사 정보가 연결되면 여기에 호실과 월 비용이 나와요.' },
  housing: { title: '청년안심주택', body: '단지와 공고 일정이 연결되면 여기에 나와요.' },
  transfer: { title: '양도', body: '양도 글이 연결되면 여기에 나와요.' },
  myhome: { title: '내 집 기록', body: '로그인하면 내 집의 월세와 공과금을 기록할 수 있어요.' },
};

export function SidePanel() {
  const { tab, panelOpen, setPanelOpen } = useUi();
  if (!panelOpen) return null; // 접힌 패널은 상단바 탭으로 다시 연다

  const e = EMPTY[tab];
  return (
    <aside className="ui-panel glass" aria-label={e.title}>
      <div className="ui-panel-head">
        <h2>{e.title}</h2>
        <button className="fold" type="button" aria-label="패널 접기" onClick={() => setPanelOpen(false)}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="ui-panel-body">
        {tab === 'tour' ? <CampusTourPanel />
          : tab === 'home' ? <ListingsPanel />
          : tab === 'dorm' ? <DormPanel />
          : tab === 'housing' ? <HousingPanel />
          : tab === 'fav' ? <FavoritesPanel />
          : tab === 'inbox' ? <InboxPanel />
          : tab === 'transfer' ? <TransferPanel />
          : tab === 'myhome' ? <MyHomePanel />
          : <p className="empty">{e.body}</p>}
      </div>
    </aside>
  );
}
