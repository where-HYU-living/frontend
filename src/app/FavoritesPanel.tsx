import { useState } from 'react';
import { Heart } from 'lucide-react';
import { manwon } from '../lib/money';
import type { FavoriteItem, FavoriteType } from '../api/types';
import { useFavorites } from './features/catalog';
import { useListingsUi } from './features/listings';
import { useSession } from './state/session';
import { useDetailSel } from './state/detail';
import { useUi, type Tab } from './state/ui';
import { useGoTo } from './DormPanel';
import { DossierCard } from './dossier/DossierCard';
import { GRADE_HINT } from './dossier/dossierLogic';
import { HeartButton } from './HeartButton';
import './venue.css';

const TYPE_LABEL: Record<FavoriteType, string> = { LISTING: '자취방', HOUSING: '청년안심주택', DORM: '기숙사', TRANSFER: '양도' };
const TYPE_ORDER: FavoriteType[] = ['LISTING', 'HOUSING', 'DORM', 'TRANSFER'];
/** 그 종류를 보여 주는 탭 */
const TAB_OF: Record<FavoriteType, Tab> = { LISTING: 'home', HOUSING: 'housing', DORM: 'dorm', TRANSFER: 'transfer' };
/** 종류마다 가격이 뜻하는 바가 다르다 */
const RENT_LABEL: Record<FavoriteType, string> = { LISTING: '환산 월세', HOUSING: '환산 월세', DORM: '한 달 비용', TRANSFER: '환산 월세' };

export function FavoritesPanel() {
  const token = useSession((s) => s.token);
  const openLogin = useSession((s) => s.openLogin);
  const q = useFavorites();
  const go = useGoTo();
  const [filter, setFilter] = useState<FavoriteType | 'ALL'>('ALL');

  if (!token) {
    return (
      <div className="ui-fav-guest">
        <Heart size={28} aria-hidden="true" />
        <p className="empty">로그인하면 찜한 집을 모아 볼 수 있어요.</p>
        <p className="ui-card-sub">자취방, 청년안심주택, 기숙사, 양도 글 어디서든 하트를 누르면 여기에 모여요.</p>
        <button type="button" className="ui-primary" onClick={openLogin}>로그인</button>
      </div>
    );
  }
  if (q.isLoading) return <p className="empty">불러오는 중…</p>;
  if (q.isError) return <p className="empty">찜 목록을 불러오지 못했어요.</p>;
  const all = q.data ?? [];
  if (!all.length) return <p className="empty">아직 찜한 곳이 없어요. 마음에 드는 집의 하트를 눌러 보세요.</p>;

  const counts = new Map<FavoriteType, number>();
  for (const f of all) counts.set(f.type, (counts.get(f.type) ?? 0) + 1);
  // 고른 종류의 마지막 찜을 풀면 그 칩이 사라지므로 전체로 돌아간다 (빈 목록에 아무 칩도 안 눌린 상태가 되지 않게)
  const active = filter !== 'ALL' && !counts.has(filter) ? 'ALL' : filter;
  const shown = active === 'ALL' ? all : all.filter((f) => f.type === active);

  /** 3D 에서 그 집 앞으로 가고, 그 종류의 탭을 열어 상세까지 보여 준다 */
  const open = (f: FavoriteItem) => {
    if (f.type === 'DORM') go(f); // 기숙사는 상세 화면이 따로 없어 그 자리로. 나머지는 정보만 열고 3D 이동은 상세의 버튼으로
    useUi.setState({ tab: TAB_OF[f.type], panelOpen: true });
    if (f.type === 'LISTING') useListingsUi.getState().select(f.targetId);
    if (f.type === 'HOUSING') useDetailSel.getState().setHousing(f.targetId);
    if (f.type === 'TRANSFER') useDetailSel.getState().setTransfer(f.targetId);
  };

  return (
    <div className="ui-fav">
      <div className="ui-fav-filter" role="group" aria-label="종류별로 보기">
        <button type="button" className={`ui-fav-chip${active === 'ALL' ? ' is-on' : ''}`} aria-pressed={active === 'ALL'} onClick={() => setFilter('ALL')}>전체 <b>{all.length}</b></button>
        {TYPE_ORDER.filter((t) => counts.has(t)).map((t) => (
          <button key={t} type="button" className={`ui-fav-chip${active === t ? ' is-on' : ''}`} aria-pressed={active === t} onClick={() => setFilter(t)}>{TYPE_LABEL[t]} <b>{counts.get(t)}</b></button>
        ))}
      </div>
      <ul className="ui-cards">
        {shown.map((f) => (
          <li key={`${f.type}${f.targetId}`} className="ui-heart-host">
            <DossierCard
              kind={TYPE_LABEL[f.type]}
              grade={f.grade}
              title={f.name}
              rentLabel={RENT_LABEL[f.type]}
              rent={f.convertedRent == null ? '정보 없음' : manwon(f.convertedRent)}
              hint={f.grade ? GRADE_HINT[f.grade] : null}
              meta={[f.walkMin == null ? '도보 정보 없음' : `도보 ${f.walkMin}분`]}
              onClick={() => open(f)}
            />
            <HeartButton type={f.type} id={f.targetId} name={f.name} className="ui-heart-abs" />
          </li>
        ))}
      </ul>
    </div>
  );
}
