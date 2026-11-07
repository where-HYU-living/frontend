import { GRADE_META } from '../lib/grade';
import { manwon } from '../lib/money';
import { useFavorites } from './features/catalog';
import { useSession } from './state/session';
import { useGoTo } from './DormPanel';
import { DossierCard } from './dossier/DossierCard';
import { GRADE_HINT } from './dossier/dossierLogic';

const TYPE_LABEL = { LISTING: '자취방', HOUSING: '청년안심주택', DORM: '기숙사', TRANSFER: '양도' } as const;

export function FavoritesPanel() {
  const token = useSession((s) => s.token);
  const openLogin = useSession((s) => s.openLogin);
  const q = useFavorites();
  const go = useGoTo();
  if (!token) return <div><p className="empty">로그인하면 찜한 집을 모아 볼 수 있어요.</p><button type="button" className="ui-primary" onClick={openLogin}>로그인</button></div>;
  if (q.isLoading) return <p className="empty">불러오는 중…</p>;
  if (q.isError) return <p className="empty">찜 목록을 불러오지 못했어요.</p>;
  if (!q.data?.length) return <p className="empty">아직 찜한 곳이 없어요. 마음에 드는 집의 하트를 눌러 보세요.</p>;
  return (
    <ul className="ui-cards">
      {q.data.map((f) => (
        <li key={`${f.type}${f.targetId}`}>
          <DossierCard
            grade={f.grade}
            title={f.name}
            rent={f.convertedRent == null ? '정보 없음' : manwon(f.convertedRent)}
            hint={f.grade ? GRADE_HINT[f.grade] : null}
            meta={[TYPE_LABEL[f.type], f.walkMin == null ? '도보 정보 없음' : `도보 ${f.walkMin}분`]}
            onClick={() => go(f)}
          />
        </li>
      ))}
    </ul>
  );
}
