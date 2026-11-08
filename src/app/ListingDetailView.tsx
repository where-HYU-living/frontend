import { BackButton } from './icons';
import { manwon } from '../lib/money';
import { ApiError } from '../api/client';
import { cheaperListings, useAlternatives, useListingDetail, useListings, useListingsUi, usePriceCheck } from './features/listings';
import { useGoToListing } from './ListingsPanel';
import { useSession } from './state/session';
import { HeartButton } from './HeartButton';
import { NeighborhoodButton } from './NeighborhoodButton';
import { WalkLink } from './route/RouteHud';
import { VerdictCard } from './VerdictCard';
import { ReviewSection } from './ReviewSection';
import { CompareSection } from './dossier/CompareSection';
import { WantedFlyer } from './dossier/WantedFlyer';
import { caseNumber } from './dossier/dossierLogic';
import { Box } from 'lucide-react';
import { CONVERSION_RATE } from './forms/calc';
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
  const interest = Math.round((l.deposit * CONVERSION_RATE) / 12);
  const pyeong = Math.round((l.areaM2 / 3.3058) * 10) / 10;
  const cheaper = all && all.length > 0 ? cheaperListings(all, l) : [];

  return (
    <div className="ui-detail ui-ld">
      <BackButton onClick={onBack} />
      <div className="ui-case"><span>용의자 파일</span><span className="ui-case-tag">{caseNumber(l.id)}</span></div>
      <header className="ui-ld-head">
        <div className="ui-ld-name"><h3>{l.title}</h3><p>{l.address}</p></div>
        <HeartButton type="LISTING" id={l.id} favorited={l.favorited} name={l.title} />
      </header>
      <div className="ui-ld-actions">
        <button type="button" className="ui-ld-go" onClick={() => go(l)}><Box size={16} aria-hidden="true" />3D에서 보기</button>
        <NeighborhoodButton kind="listing" id={l.id} lat={l.lat} lng={l.lng} name={l.title} />
      </div>

      <VerdictCard pc={pc} fallbackGrade={l.grade} loggedIn={!!token} failed={p.isError} />
      {pc && pc.grade === 'CULPRIT' && <WantedFlyer id={l.id} title={l.title} pc={pc} />}

      <section className="ui-ld-sec" aria-label="매달 드는 돈">
        <h4 className="ui-ld-h">매달 드는 돈</h4>
        <ul className="ui-ld-cost">
          <li><span>월세</span><b>{manwon(l.rent)}</b></li>
          <li><span>관리비</span><b>{l.mgmtFee == null ? '정보 없음' : manwon(l.mgmtFee)}</b></li>
          <li><span>보증금 {manwon(l.deposit)}의 이자<small>연 {Math.round(CONVERSION_RATE * 1000) / 10}%로 쳐서</small></span><b>{manwon(interest)}</b></li>
          <li className="is-total"><span>환산 월세</span><b>{manwon(l.convertedRent)}</b></li>
        </ul>
      </section>

      <section className="ui-ld-sec" aria-label="집 정보">
        <h4 className="ui-ld-h">집 정보</h4>
        <dl className="ui-ld-facts">
          <div><dt>면적</dt><dd>{l.areaM2}㎡ <small>약 {pyeong}평</small></dd></div>
          <div><dt>층</dt><dd>{l.floor == null ? '정보 없음' : `${l.floor}층`}</dd></div>
          <div><dt>구조</dt><dd>{ROOM[l.roomType] ?? l.roomType}</dd></div>
          <div><dt>내 과 건물까지</dt><dd><WalkLink walkMin={l.walkMin} from={{ lat: l.lat, lng: l.lng, name: l.title }} /></dd></div>
        </dl>
        {l.options.length > 0 && <ul className="ui-ld-opts" aria-label="옵션">{l.options.map((o) => <li key={o}>{o}</li>)}</ul>}
        {l.description && <p className="ui-desc">{l.description}</p>}
      </section>

      <CompareSection data={alt.data} loading={alt.isLoading} myRent={l.convertedRent}
        cheaper={cheaper.map((c) => ({ id: c.id, name: c.title, convertedRent: c.convertedRent, monthly: l.convertedRent - c.convertedRent, onPick: () => select(c.id) }))} />
      <ReviewSection targetType="LISTING" targetId={l.id} />
    </div>
  );
}
