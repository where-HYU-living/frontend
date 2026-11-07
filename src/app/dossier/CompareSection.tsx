import type { Alternative } from '../../api/types';
import { manwon } from '../../lib/money';
import { compareLine, TYPE_NAME } from './dossierLogic';
import './dossier.css';

/** N3 판결 & 비교: 근처 청년안심주택·기숙사와 환산 월세·2년 차이. 없으면 안전한 빈 상태 */
export function CompareSection({ data, loading }: { data: { housing: Alternative[]; dorms: Alternative[] } | undefined; loading?: boolean }) {
  const items = data ? [...(data.housing ?? []), ...(data.dorms ?? [])] : [];
  return (
    <section aria-label="비교" className="ui-compare">
      <h4>판결 &amp; 비교 <span className="ui-card-sub">근처 청년안심주택·기숙사</span></h4>
      {loading && <p className="ui-card-sub">비교할 곳을 찾는 중…</p>}
      {!loading && items.length === 0 && <p className="ui-card-sub">비교할 근처 청년안심주택·기숙사 정보가 아직 없어요.</p>}
      <ul className="ui-cmp-list">
        {items.map((a) => {
          const c = compareLine(a);
          return (
            <li key={`${a.type}${a.id}`} className={`ui-cmp ${c.cheaper === true ? 'is-cheaper' : c.cheaper === false ? 'is-pricier' : ''}`}>
              <span className="ui-cmp-kind">{TYPE_NAME[a.type]}</span>
              <strong className="ui-cmp-name">{a.name}</strong>
              <span className="ui-cmp-rent">환산 월세 {manwon(a.convertedRent)}{a.walkMin != null ? ` · 도보 ${a.walkMin}분` : ''}</span>
              <span className="ui-cmp-diff">{c.phrase}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
