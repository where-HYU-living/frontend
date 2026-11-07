import { BackButton } from './icons';
import { manwon } from '../lib/money';
import { ApiError } from '../api/client';
import { cheaperListings, useAlternatives, useListingDetail, useListings, useListingsUi, usePriceCheck } from './features/listings';
import { useGoToListing } from './ListingsPanel';
import { useSession } from './state/session';
import { HeartButton } from './HeartButton';
import { VerdictCard } from './VerdictCard';
import { ReviewSection } from './ReviewSection';
import { CompareSection } from './dossier/CompareSection';
import { WantedFlyer } from './dossier/WantedFlyer';
import { caseNumber } from './dossier/dossierLogic';
import { GRADE_META } from '../lib/grade';
import './dossier/dossier.css';

const ROOM: Record<string, string> = { OPEN: '오픈형', SEPARATED: '분리형', ONE_HALF: '1.5룸', TWO_ROOM: '투룸', DUPLEX: '복층' };

export function ListingDetailView({ id, onBack }: { id: number; onBack: () => void }) {
  const d = useListingDetail(id);
  const p = usePriceCheck(id);
  const alt = useAlternatives(id);
  const go = useGoToListing();
  const token = useSession((s) => s.token);
  const all = useListings(useListingsUi((s) => s.filters)).data?.items;
  const select = useListingsUi((s) => s.select);

  if (d.isLoading) return <p className="empty">불러오는 중…</p>;
  if (d.isError || !d.data) {
    return (
      <div>
        <BackButton onClick={onBack} />
        <p className="empty">{d.error instanceof ApiError && d.error.status === 404 ? '매물을 찾을 수 없어요.' : '매물을 불러오지 못했어요.'}</p>
      </div>
    );
  }
  const l = d.data;
  const pc = p.data;

  return (
    <div className="ui-detail">
      <BackButton onClick={onBack} />
      <div className="ui-case"><span>용의자 파일</span><span className="ui-case-tag">{caseNumber(l.id)}</span></div>
      <div className="ui-detail-head"><h3>{l.title}</h3><HeartButton type="LISTING" id={l.id} favorited={l.favorited} /></div>
      <p className="ui-card-sub">{l.address}</p>

      <VerdictCard pc={pc} fallbackGrade={l.grade} loggedIn={!!token} failed={p.isError} />
      {pc && pc.grade === 'CULPRIT' && <WantedFlyer id={l.id} title={l.title} pc={pc} />}

      <h4 className="ui-section-title">기본 정보</h4>
      <dl className="ui-kv">
        <dt>등급</dt><dd style={{ color: GRADE_META[pc?.grade ?? l.grade].color, fontWeight: 700 }}>{GRADE_META[pc?.grade ?? l.grade].label}</dd>
        <dt>보증금/월세</dt><dd>{manwon(l.deposit)} / {manwon(l.rent)}</dd>
        <dt>관리비</dt><dd>{l.mgmtFee == null ? '정보 없음' : manwon(l.mgmtFee)}</dd>
        <dt>면적·층</dt><dd>{l.areaM2}㎡ · {l.floor == null ? '층 정보 없음' : `${l.floor}층`}</dd>
        <dt>구조</dt><dd>{ROOM[l.roomType] ?? l.roomType}</dd>
        <dt>도보</dt><dd>{l.walkMin == null ? '도보 시간 정보 없음' : `과 건물까지 ${l.walkMin}분`}</dd>
        {l.options.length > 0 && (<><dt>옵션</dt><dd>{l.options.join(', ')}</dd></>)}
      </dl>
      {l.description && <p className="ui-desc">{l.description}</p>}

      <CompareSection data={alt.data} loading={alt.isLoading} />

      {all && all.length > 0 && (() => {
        const cheaper = cheaperListings(all, l);
        return cheaper.length === 0 ? null : (
          <section aria-label="더 싼 매물">
            <h4 className="ui-section-title">같은 예산에서 더 싼 매물</h4>
            <ul className="ui-alt">
              {cheaper.map((c) => (
                <li key={c.id}><button type="button" className="ui-link" onClick={() => { select(c.id); go(c); }}>{c.title}</button> · 환산 {manwon(c.convertedRent)} (월 {manwon(l.convertedRent - c.convertedRent)} 저렴)</li>
              ))}
            </ul>
          </section>
        );
      })()}
      <ReviewSection targetType="LISTING" targetId={l.id} />
      <button type="button" className="ui-primary" onClick={() => go(l)}>3D에서 보기</button>
    </div>
  );
}
