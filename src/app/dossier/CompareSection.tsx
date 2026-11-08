import type { Alternative } from '../../api/types';
import { manwon } from '../../lib/money';
import { compareLine, TYPE_NAME } from './dossierLogic';
import './dossier.css';

type Cheaper = { id: number; name: string; convertedRent: number; monthly: number; onPick: () => void };

/**
 * N3 판결 & 비교 '이 돈이면': 표 한 장. 맨 위 줄이 이 집(기준), 아래로 근처 기숙사·청년안심주택을 2년 차이가 큰 순서로.
 * 같은 예산의 더 싼 매물은 같은 열(곳·환산 월세·차이)로 이어 붙여 한 번에 견준다. 매물 줄은 누르면 그 매물로.
 */
export function CompareSection({ data, loading, cheaper = [], myRent }: { data: { housing: Alternative[]; dorms: Alternative[] } | undefined; loading?: boolean; cheaper?: Cheaper[]; myRent?: number }) {
  const items = (data ? [...(data.housing ?? []), ...(data.dorms ?? [])] : []).sort((a, b) => b.twoYearDiff - a.twoYearDiff);
  const empty = !loading && items.length === 0 && cheaper.length === 0;
  return (
    <section aria-label="비교" className="ui-compare ui-ld-sec">
      <h4 className="ui-ld-h">이 돈이면</h4>
      {loading && <p className="ui-card-sub">비교할 곳을 찾는 중…</p>}
      {empty && <p className="ui-card-sub">비교할 근처 청년안심주택·기숙사 정보가 아직 없어요.</p>}
      {(items.length > 0 || cheaper.length > 0) && (
        <table className="ui-cmp-t">
          <thead>
            <tr><th scope="col">곳</th><th scope="col">환산 월세</th><th scope="col">2년 차이</th></tr>
          </thead>
          <tbody>
            {myRent != null && (
              <tr className="is-me"><th scope="row"><span className="ui-cmp-name">이 집</span></th><td>{manwon(myRent)}</td><td className="ui-cmp-d">기준</td></tr>
            )}
            {items.map((a) => {
              const c = compareLine(a);
              return (
                <tr key={`${a.type}${a.id}`} className={c.cheaper === true ? 'is-cheaper' : c.cheaper === false ? 'is-pricier' : ''}>
                  <th scope="row"><span className="ui-cmp-kind">{TYPE_NAME[a.type]}{a.walkMin != null ? `, 도보 ${a.walkMin}분` : ''}</span><span className="ui-cmp-name">{a.name}</span></th>
                  <td>{manwon(a.convertedRent)}</td>
                  <td className="ui-cmp-d" aria-label={c.phrase}>{c.cheaper == null ? '비슷' : `${c.cheaper ? '−' : '+'}${manwon(Math.abs(a.twoYearDiff))}`}</td>
                </tr>
              );
            })}
          </tbody>
          {cheaper.length > 0 && (
            <tbody aria-label="더 싼 매물">
              <tr className="is-group"><th scope="rowgroup" colSpan={3}>같은 예산에서 더 싼 자취방</th></tr>
              {cheaper.map((c) => (
                <tr key={c.id} className="is-cheaper is-link">
                  <th scope="row"><button type="button" onClick={c.onPick}><span className="ui-cmp-kind">자취방</span><span className="ui-cmp-name">{c.name}</span></button></th>
                  <td>{manwon(c.convertedRent)}</td>
                  <td className="ui-cmp-d" aria-label={`2년 ${manwon(c.monthly * 24)} 덜 들어요`}>−{manwon(c.monthly * 24)}</td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      )}
      {(items.length > 0 || cheaper.length > 0) && <p className="ui-cmp-foot">2년 차이는 이 집에 2년 살 때와 견준 돈이에요. <b className="is-good">−</b> 덜 들어요, <b className="is-bad">+</b> 더 들어요.</p>}
    </section>
  );
}
