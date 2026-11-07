import { useEffect, useRef, useState } from 'react';
import { visiblePlaces } from '../data/hiddenBuildings';
import type { Place } from '../campusSearch';
import { useUi } from '../state/ui';
import { useGoToPoint } from '../goTo';
import { useWorld } from '../state/world';
import { KAKAO_ERRORS, loadKakao } from './loadKakao';
import { toLatLng, toLocal } from './geo';
import { useListings, useListingsUi } from '../features/listings';
import { GRADE_META, inkFor } from '../../lib/grade';
import { depositRent, manwon } from '../../lib/money';
import type { ListingSummary } from '../../api/types';
import { HeartButton } from '../HeartButton';

const ALL = visiblePlaces.filter((p) => p.center);

/** 이 확대 단계(카카오 level, 작을수록 확대) 이하에서만 건물 이름을 띄운다 */
const NAME_LEVEL = 3;
/** 가장 가까이 볼 수 있는 단계 */
const MIN_LEVEL = 2;
/** 캠퍼스 영역 바깥으로 중심이 벗어날 수 있는 여유 (영역 크기의 비율) */
const PAN_MARGIN = 0.15;

/** 이름 말풍선이 차지하는 화면 크기를 글자 수로 어림한다 (한글 12px, 그 외 7px + 여백) */
export const labelWidth = (name: string) => [...name].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 12 : 7), 20);

type Rect = { x0: number; x1: number; y0: number; y1: number };
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** 화면 좌표(핀 끝 기준) 목록에서 이름이 서로 겹치지 않는 것만 고른다. 먼저 온 것이 우선 */
export function pickVisibleLabels(items: { key: string; name: string; x: number; y: number }[], first?: string): Set<string> {
  const ordered = [...items].sort((a, b) => (a.key === first ? -1 : b.key === first ? 1 : a.name.length - b.name.length));
  const placed: Rect[] = [];
  const shown = new Set<string>();
  for (const it of ordered) {
    const w = labelWidth(it.name);
    const r = { x0: it.x - w / 2, x1: it.x + w / 2, y0: it.y - 56, y1: it.y - 30 }; // 핀(높이 28) 위쪽
    if (it.key !== first && placed.some((q) => overlaps(r, q))) continue;
    placed.push(r);
    shown.add(it.key);
  }
  return shown;
}

/** "지도로 보기": 카카오맵에 캠퍼스 투어 건물을 핀으로 찍고, 핀을 누르면 3D 로 이동 */
export function KakaoMap() {
  const ref = useRef<HTMLDivElement>(null);
  const api = useWorld((s) => s.api);
  const setMapMode = useUi((s) => s.setMapMode);
  const goToPoint = useGoToPoint();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Place | null>(null);
  const [msg, setMsg] = useState('');
  const pins = useRef(new Map<string, HTMLElement>());
  const declutter = useRef<() => void>(() => {});
  const pickedNo = useRef<string | undefined>(undefined);
  // 매물 핀: 지도 객체는 위 effect 안에 있어 ref 로 꺼내 쓴다
  const mapRef = useRef<{ kakao: any; map: any; box: { sw: any; ne: any; padLat: number; padLng: number } } | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [pickedListing, setPickedListing] = useState<ListingSummary | null>(null);
  const filters = useListingsUi((s) => s.filters);
  const listings = useListings(filters).data?.items;

  useEffect(() => {
    let dead = false;
    const cleanup: Array<() => void> = [];
    loadKakao(import.meta.env.VITE_KAKAO_JS_KEY)
      .then((kakao) => {
        if (dead || !ref.current) return;
        const ll = (x: number, z: number) => new kakao.maps.LatLng(...toLatLng(x, z));
        const map = new kakao.maps.Map(ref.current, { center: ll(0, 0), level: 5 });
        const bounds = new kakao.maps.LatLngBounds();
        const overlay = (pos: unknown, el: HTMLElement, z: number, yAnchor: number) => {
          const o = new kakao.maps.CustomOverlay({ map, position: pos, content: el, xAnchor: 0.5, yAnchor, zIndex: z, clickable: true });
          cleanup.push(() => o.setMap(null));
        };
        const items: { place: Place; pos: unknown }[] = [];
        for (const p of ALL) {
          const pos = ll(p.center![0], p.center![1]);
          bounds.extend(pos);
          const el = document.createElement('button');
          el.type = 'button';
          el.className = `ui-map-pin ui-map-pin--${p.group}`;
          el.innerHTML = '<span class="ui-map-pin-name"></span><span class="ui-map-pin-head"></span>';
          (el.firstChild as HTMLElement).textContent = p.name;
          el.setAttribute('aria-label', `${p.no} ${p.name}`);
          el.addEventListener('click', (e) => { e.stopPropagation(); setMsg(''); setPickedListing(null); setPicked(p); });
          pins.current.set(p.no, el);
          items.push({ place: p, pos });
          overlay(pos, el, 1, 1); // 핀 끝이 건물 위치
        }
        const pose = api?.getPose();
        if (pose) {
          const me = document.createElement('div');
          me.className = 'ui-map-me';
          me.title = '내 위치';
          overlay(ll(pose.p[0], pose.p[2]), me, 5, 0.5);
        }
        // 확대하면 이름을 띄우되 겹치는 이름은 숨긴다. 축소하면 핀만.
        declutter.current = () => {
          const named = map.getLevel() <= NAME_LEVEL;
          ref.current?.classList.toggle('ui-map-names', named);
          if (!named) return;
          const proj = map.getProjection();
          const pts = items.map(({ place, pos }) => { const pt = proj.containerPointFromCoords(pos); return { key: place.no, name: place.name, x: pt.x, y: pt.y }; });
          const shown = pickVisibleLabels(pts, pickedNo.current);
          pins.current.forEach((el, no) => el.classList.toggle('is-name-hidden', !shown.has(no)));
        };
        map.setBounds(bounds);
        // 캠퍼스 전체가 보이는 단계보다 더 축소하지 못하게, 너무 가까이도 못 가게 고정
        map.setMaxLevel(map.getLevel());
        map.setMinLevel(MIN_LEVEL);
        // 드래그·줌으로 중심이 캠퍼스에서 멀어지면 되돌린다
        const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
        const box = { sw, ne, padLat: (ne.getLat() - sw.getLat()) * PAN_MARGIN, padLng: (ne.getLng() - sw.getLng()) * PAN_MARGIN };
        mapRef.current = { kakao, map, box };
        const clamp = () => {
          const { sw, ne, padLat, padLng } = box;
          const c = map.getCenter();
          const lat = Math.min(Math.max(c.getLat(), sw.getLat() - padLat), ne.getLat() + padLat);
          const lng = Math.min(Math.max(c.getLng(), sw.getLng() - padLng), ne.getLng() + padLng);
          if (lat !== c.getLat() || lng !== c.getLng()) map.panTo(new kakao.maps.LatLng(lat, lng));
        };
        // 이름 배치는 확대·이동이 끝난 뒤(idle)에 다시 계산해야 좌표가 정확하다
        kakao.maps.event.addListener(map, 'idle', () => { clamp(); declutter.current(); });
        kakao.maps.event.addListener(map, 'zoom_changed', () => declutter.current());
        declutter.current();
        kakao.maps.event.addListener(map, 'click', () => { setPicked(null); setPickedListing(null); });
        setStatus('ready');
      })
      .catch((e: Error) => { if (!dead) { setError(KAKAO_ERRORS[e.message] ?? e.message); setStatus('error'); } });
    return () => { dead = true; cleanup.forEach((f) => f()); pins.current.clear(); declutter.current = () => {}; mapRef.current = null; };
  }, [api]);

  // 매물 핀(등급 색). 매물이 캠퍼스 밖에 있으면 보이는 영역과 이동 제한을 매물까지 넓힌다
  useEffect(() => {
    const m = mapRef.current;
    if (status !== 'ready' || !m || !listings?.length) return;
    const { kakao, map, box } = m;
    const made: Array<{ setMap(x: null): void }> = [];
    const nb = new kakao.maps.LatLngBounds();
    nb.extend(box.sw); nb.extend(box.ne);
    for (const l of listings) {
      const pos = new kakao.maps.LatLng(l.lat, l.lng);
      nb.extend(pos);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ui-map-pin ui-map-listing';
      el.style.setProperty('--pin', GRADE_META[l.grade].color);
      el.innerHTML = '<span class="ui-map-pin-head"></span>';
      el.setAttribute('aria-label', `${l.title} ${GRADE_META[l.grade].label}`);
      el.addEventListener('click', (e) => { e.stopPropagation(); setPicked(null); setPickedListing(l); });
      made.push(new kakao.maps.CustomOverlay({ map, position: pos, content: el, xAnchor: 0.5, yAnchor: 1, zIndex: 3, clickable: true }));
    }
    const sw = nb.getSouthWest(), ne = nb.getNorthEast();
    if (sw.getLat() < box.sw.getLat() || sw.getLng() < box.sw.getLng() || ne.getLat() > box.ne.getLat() || ne.getLng() > box.ne.getLng()) {
      map.setMaxLevel(14);
      map.setBounds(nb);
      map.setMaxLevel(map.getLevel());
      box.sw = sw; box.ne = ne;
      box.padLat = (ne.getLat() - sw.getLat()) * PAN_MARGIN; box.padLng = (ne.getLng() - sw.getLng()) * PAN_MARGIN;
    }
    return () => made.forEach((o) => o.setMap(null));
  }, [listings, status]);

  // 고른 핀은 커지고 색이 채워지며 이름이 항상 보인다
  useEffect(() => {
    pickedNo.current = picked?.no;
    pins.current.forEach((el, no) => {
      el.classList.toggle('is-picked', no === picked?.no);
      (el.parentElement as HTMLElement | null)?.style.setProperty('z-index', no === picked?.no ? '9' : '1');
    });
    declutter.current();
  }, [picked, status]);

  const go = (p: Place) => {
    if (!api || !p.center) return;
    if (api.goToPlace(p.center[0], p.center[1])) setMapMode('3d');
    else setMsg(`${p.name} 앞으로는 갈 수 없어요`);
  };

  const goListing = (l: ListingSummary) => {
    useListingsUi.getState().select(l.id);
    useUi.setState({ tab: 'home', panelOpen: true });
    if (goToPoint(l)) setMapMode('3d');
    else setMsg('그 집 앞으로는 갈 수 없어요');
  };

  return (
    <div className="ui-map" role="region" aria-label="카카오 지도">
      <div ref={ref} className="ui-map-canvas" />
      {status === 'loading' && <p className="ui-map-note" role="status">지도를 불러오는 중</p>}
      {status === 'error' && <p className="ui-map-note" role="alert">{error}</p>}
      {pickedListing && (
        <div className="ui-map-card" role="dialog" aria-label={pickedListing.title}>
          <div className="ui-map-card-title">
            <span className="ui-map-card-no" style={{ background: GRADE_META[pickedListing.grade].color, color: inkFor(GRADE_META[pickedListing.grade].color) }}>{GRADE_META[pickedListing.grade].label}</span>
            {depositRent(pickedListing.deposit, pickedListing.rent)} · {pickedListing.title}
          </div>
          <p className="ui-map-card-msg">환산 {manwon(pickedListing.convertedRent)} · {pickedListing.walkMin == null ? '도보 정보 없음' : `도보 ${pickedListing.walkMin}분`}</p>
          {msg && <p className="ui-map-card-msg" role="status">{msg}</p>}
          <div className="ui-map-card-actions">
            <HeartButton type="LISTING" id={pickedListing.id} favorited={pickedListing.favorited} />
            <button type="button" className="ui-map-go" onClick={() => goListing(pickedListing)}>3D로 들어가기</button>
            <button type="button" className="ui-map-close" onClick={() => setPickedListing(null)}>닫기</button>
          </div>
        </div>
      )}
      {picked && (
        <div className="ui-map-card" role="dialog" aria-label={picked.name}>
          <div className="ui-map-card-title"><span className="ui-map-card-no">{picked.no}</span>{picked.name}</div>
          {msg && <p className="ui-map-card-msg" role="status">{msg}</p>}
          <div className="ui-map-card-actions">
            <button type="button" className="ui-map-go" onClick={() => go(picked)}>3D로 가기</button>
            <button type="button" className="ui-map-close" onClick={() => setPicked(null)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
