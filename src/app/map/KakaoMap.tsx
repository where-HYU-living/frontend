import { useEffect, useRef, useState } from 'react';
import { visiblePlaces } from '../data/hiddenBuildings';
import type { Place } from '../campusSearch';
import { useUi } from '../state/ui';
import { useGoToCampus, useLandAt } from '../goTo';
import { useWorld } from '../state/world';
import { KAKAO_ERRORS, loadKakao } from './loadKakao';
import { toLatLng, toLocal } from './geo';
import { useListings, useListingsUi } from '../features/listings';
import { useHousingList } from '../features/catalog';
import { GRADE_META, inkFor } from '../../lib/grade';
import { depositRent, manwon } from '../../lib/money';
import type { ListingSummary } from '../../api/types';
import { HeartButton } from '../HeartButton';
import { useMapFocus, type MapTarget } from './mapFocus';
import { SITES } from '../../world/neighborhood';
import { CAMPUS_BOX, serviceTargetFor } from '../../world/serviceArea';
import { distLabel, planLanding } from '../../world/landing';
import { useRoute } from '../route/useRoute';

const ALL = visiblePlaces.filter((p) => p.center);

/** 이 확대 단계(카카오 level, 작을수록 확대) 이하에서만 건물 이름을 띄운다 */
const NAME_LEVEL = 3;
/** 가장 가까이 볼 수 있는 단계 */
const MIN_LEVEL = 2;
/** 가장 멀리 볼 수 있는 단계 (구 단위 — 동네 12곳과 검색한 곳이 한 화면에) */
const MAX_LEVEL = 8;
/** 검색 결과로 이동할 때 확대 단계 */
const FOCUS_LEVEL = 4;
/** 지도 중심이 서비스 영역(캠퍼스+동네 12곳+매물+검색한 곳) 바깥으로 벗어날 수 있는 여유 (영역 크기의 비율) */
const PAN_MARGIN = 0.25;
const PATCH_HALF = 330;

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

/** 정보 카드의 '가까운 매물·건물' (3D 좌표 거리, m) */
export type NearItem = { key: string; name: string; sub: string; d: number; lat: number; lng: number; kind: string; listing?: ListingSummary };
export function nearestItems(t: { lat: number; lng: number }, listings: ListingSummary[], housing: { id: number; name: string; lat: number; lng: number }[], n = 4, maxM = 1500): NearItem[] {
  const [x, z] = toLocal(t.lat, t.lng);
  const out: NearItem[] = [];
  for (const l of listings) { const [lx, lz] = toLocal(l.lat, l.lng); out.push({ key: `l${l.id}`, name: l.title, sub: `매물 · ${GRADE_META[l.grade].label}`, d: Math.hypot(lx - x, lz - z), lat: l.lat, lng: l.lng, kind: 'LISTING', listing: l }); }
  for (const h of housing) { const [hx, hz] = toLocal(h.lat, h.lng); out.push({ key: `h${h.id}`, name: h.name, sub: '청년안심주택', d: Math.hypot(hx - x, hz - z), lat: h.lat, lng: h.lng, kind: 'HOUSING' }); }
  for (const p of ALL) { const [lat, lng] = toLatLng(p.center![0], p.center![1]); out.push({ key: `b${p.no}`, name: p.name, sub: '캠퍼스 건물', d: Math.hypot(p.center![0] - x, p.center![1] - z), lat, lng, kind: 'BUILDING' }); }
  return out.filter((o) => o.d > 5 && o.d <= maxM).sort((a, b) => a.d - b.d).slice(0, n);
}

/**
 * "지도로 보기" (3-3): 캠퍼스 건물·매물·청년안심주택 핀, 3D 로 걸을 수 있는 영역(캠퍼스+동네 12곳) 표시,
 * 상단 검색 결과는 3D 로 가지 않고 여기서 마커·정보 카드(주소·서비스 안/밖·가까운 집/건물)로 보여 준다. 카드의 [3D로 가기] 로 넘어간다.
 * 지도 위치·확대·고른 곳은 useMapFocus 에 남아 3D ↔ 지도를 오가도 그대로다.
 */
export function KakaoMap() {
  const ref = useRef<HTMLDivElement>(null);
  const api = useWorld((s) => s.api);
  const areaId = useWorld((s) => s.areaId);
  const setMapMode = useUi((s) => s.setMapMode);
  const landAt = useLandAt();
  const goToCampus = useGoToCampus();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Place | null>(null);
  const [msg, setMsg] = useState('');
  const pins = useRef(new Map<string, HTMLElement>());
  const declutter = useRef<() => void>(() => {});
  const pickedNo = useRef<string | undefined>(undefined);
  // 지도 객체는 첫 effect 안에서 만들어 ref 로 꺼내 쓴다
  const mapRef = useRef<{ kakao: any; map: any; extend: (lat: number, lng: number) => void } | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [pickedListing, setPickedListing] = useState<ListingSummary | null>(null);
  const filters = useListingsUi((s) => s.filters);
  const listings = useListings(filters).data?.items;
  const housing = useHousingList().data;
  const showHousing = useUi((s) => s.showHousing);
  const target = useMapFocus((s) => s.target);
  const seq = useMapFocus((s) => s.seq);
  const route = useRoute((s) => s.route);

  useEffect(() => {
    let dead = false;
    const cleanup: Array<() => void> = [];
    loadKakao(import.meta.env.VITE_KAKAO_JS_KEY)
      .then((kakao) => {
        if (dead || !ref.current) return;
        const ll = (x: number, z: number) => new kakao.maps.LatLng(...toLatLng(x, z));
        const saved = useMapFocus.getState().view;
        const map = new kakao.maps.Map(ref.current, { center: saved ? new kakao.maps.LatLng(saved.lat, saved.lng) : ll(0, 0), level: saved?.level ?? 5 });
        const bounds = new kakao.maps.LatLngBounds();
        const overlay = (pos: unknown, el: HTMLElement, z: number, yAnchor: number) => {
          const o = new kakao.maps.CustomOverlay({ map, position: pos, content: el, xAnchor: 0.5, yAnchor, zIndex: z, clickable: true });
          cleanup.push(() => o.setMap(null));
        };
        // 3D 로 걸어 볼 수 있는 영역: 캠퍼스 + 집 주변 12곳 (옅은 점선 사각형)
        const area = (minX: number, minZ: number, maxX: number, maxZ: number, color: string) => {
          const r = new kakao.maps.Rectangle({ map, bounds: new kakao.maps.LatLngBounds(ll(minX, maxZ), ll(maxX, minZ)), strokeWeight: 1.5, strokeColor: color, strokeOpacity: 0.7, strokeStyle: 'dash', fillColor: color, fillOpacity: 0.06 });
          cleanup.push(() => r.setMap(null));
        };
        area(CAMPUS_BOX.minX, CAMPUS_BOX.minZ, CAMPUS_BOX.maxX, CAMPUS_BOX.maxZ, '#0e4a84');
        const all = new kakao.maps.LatLngBounds(); // 이동 허용 범위
        all.extend(ll(CAMPUS_BOX.minX, CAMPUS_BOX.maxZ)); all.extend(ll(CAMPUS_BOX.maxX, CAMPUS_BOX.minZ));
        for (const s of SITES) {
          area(s.x - PATCH_HALF, s.z - PATCH_HALF, s.x + PATCH_HALF, s.z + PATCH_HALF, s.kind === 'housing' ? '#2f9e57' : '#d9480f');
          all.extend(ll(s.x - PATCH_HALF, s.z + PATCH_HALF)); all.extend(ll(s.x + PATCH_HALF, s.z - PATCH_HALF));
        }
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
          el.addEventListener('click', (e) => { e.stopPropagation(); setMsg(''); setPickedListing(null); useMapFocus.getState().clear(); setPicked(p); });
          pins.current.set(p.no, el);
          items.push({ place: p, pos });
          overlay(pos, el, 1, 1); // 핀 끝이 건물 위치
        }
        const pose = api?.getPose();
        if (pose) {
          const me = document.createElement('div');
          me.className = 'ui-map-me';
          me.title = '내 위치';
          me.setAttribute('aria-label', '3D 에서 내 위치');
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
        if (!saved) map.setBounds(bounds); // 처음엔 캠퍼스 전체, 다시 열면 보던 자리 그대로
        map.setMaxLevel(MAX_LEVEL);
        map.setMinLevel(MIN_LEVEL);
        const box = { sw: all.getSouthWest(), ne: all.getNorthEast(), padLat: 0, padLng: 0 };
        const repad = () => { box.padLat = (box.ne.getLat() - box.sw.getLat()) * PAN_MARGIN; box.padLng = (box.ne.getLng() - box.sw.getLng()) * PAN_MARGIN; };
        repad();
        const extend = (lat: number, lng: number) => {
          const b = new kakao.maps.LatLngBounds(box.sw, box.ne); b.extend(new kakao.maps.LatLng(lat, lng));
          box.sw = b.getSouthWest(); box.ne = b.getNorthEast(); repad();
        };
        mapRef.current = { kakao, map, extend };
        // 드래그·줌으로 중심이 서비스 영역에서 멀어지면 되돌린다
        const clamp = () => {
          const { sw, ne, padLat, padLng } = box;
          const c = map.getCenter();
          const lat = Math.min(Math.max(c.getLat(), sw.getLat() - padLat), ne.getLat() + padLat);
          const lng = Math.min(Math.max(c.getLng(), sw.getLng() - padLng), ne.getLng() + padLng);
          if (lat !== c.getLat() || lng !== c.getLng()) map.panTo(new kakao.maps.LatLng(lat, lng));
        };
        // 이름 배치는 확대·이동이 끝난 뒤(idle)에 다시 계산해야 좌표가 정확하다
        kakao.maps.event.addListener(map, 'idle', () => {
          clamp(); declutter.current();
          const c = map.getCenter();
          useMapFocus.setState({ view: { lat: c.getLat(), lng: c.getLng(), level: map.getLevel() } });
        });
        kakao.maps.event.addListener(map, 'zoom_changed', () => declutter.current());
        declutter.current();
        kakao.maps.event.addListener(map, 'click', () => { setPicked(null); setPickedListing(null); useMapFocus.getState().clear(); });
        setStatus('ready');
      })
      .catch((e: Error) => { if (!dead) { setError(KAKAO_ERRORS[e.message] ?? e.message); setStatus('error'); } });
    return () => { dead = true; cleanup.forEach((f) => f()); pins.current.clear(); declutter.current = () => {}; mapRef.current = null; };
  }, [api]);

  // 매물 핀(등급 색) · 청년안심주택 핀(초록)
  useEffect(() => {
    const m = mapRef.current;
    if (status !== 'ready' || !m) return;
    const { kakao, map } = m;
    const made: Array<{ setMap(x: null): void }> = [];
    const pin = (lat: number, lng: number, color: string, label: string, onClick: () => void, cls = '') => {
      m.extend(lat, lng);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `ui-map-pin ui-map-listing ${cls}`;
      el.style.setProperty('--pin', color);
      el.innerHTML = '<span class="ui-map-pin-head"></span>';
      el.setAttribute('aria-label', label);
      el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      made.push(new kakao.maps.CustomOverlay({ map, position: new kakao.maps.LatLng(lat, lng), content: el, xAnchor: 0.5, yAnchor: 1, zIndex: 3, clickable: true }));
    };
    for (const l of listings ?? []) pin(l.lat, l.lng, GRADE_META[l.grade].color, `${l.title} ${GRADE_META[l.grade].label}`, () => { setPicked(null); useMapFocus.getState().clear(); setPickedListing(l); });
    if (showHousing) for (const h of housing ?? []) pin(h.lat, h.lng, '#2f9e57', `청년안심주택 ${h.name}`, () => { setPicked(null); setPickedListing(null); useMapFocus.getState().focus({ name: h.name, address: h.address, lat: h.lat, lng: h.lng, kind: 'HOUSING' }); }, 'ui-map-housing');
    return () => made.forEach((o) => o.setMap(null));
  }, [listings, housing, showHousing, status]);

  // 검색 결과·고른 곳: 그 자리로 이동·확대하고 마커를 꽂는다
  useEffect(() => {
    const m = mapRef.current;
    if (status !== 'ready' || !m || !target) return;
    const { kakao, map } = m;
    m.extend(target.lat, target.lng);
    const pos = new kakao.maps.LatLng(target.lat, target.lng);
    if (map.getLevel() > FOCUS_LEVEL) map.setLevel(FOCUS_LEVEL);
    map.setCenter(pos);
    const el = document.createElement('div');
    el.className = 'ui-map-target';
    el.setAttribute('aria-label', `고른 곳 ${target.name}`);
    el.innerHTML = '<span class="ui-map-pin-head"></span>';
    const o = new kakao.maps.CustomOverlay({ map, position: pos, content: el, xAnchor: 0.5, yAnchor: 1, zIndex: 8 });
    setPicked(null); setPickedListing(null); setMsg('');
    return () => o.setMap(null);
  }, [target, seq, status]);

  // 4단계 F6: 집 → 과 건물 도보 길 (폴리라인 + 출발·도착 표시), 화면에 길 전체가 들어오게
  useEffect(() => {
    const m = mapRef.current;
    if (status !== 'ready' || !m || !route) return;
    const { kakao, map } = m;
    const pts = route.path.map(([lat, lng]) => new kakao.maps.LatLng(lat, lng));
    const b = new kakao.maps.LatLngBounds();
    for (const [lat, lng] of route.path) { b.extend(new kakao.maps.LatLng(lat, lng)); m.extend(lat, lng); }
    const line = new kakao.maps.Polyline({ map, path: pts, strokeWeight: 6, strokeColor: '#1c7ed6', strokeOpacity: 0.9, strokeStyle: route.estimated ? 'shortdash' : 'solid' });
    const end = (lat: number, lng: number, cls: string, text: string) => {
      const el = document.createElement('div'); el.className = `ui-map-route-end ${cls}`; el.textContent = text;
      return new kakao.maps.CustomOverlay({ map, position: new kakao.maps.LatLng(lat, lng), content: el, xAnchor: 0.5, yAnchor: 1.3, zIndex: 9 });
    };
    const a = end(route.path[0][0], route.path[0][1], 'is-from', '출발 · 집');
    const last = route.path[route.path.length - 1];
    const z = end(last[0], last[1], 'is-to', `도착 · ${route.to.name}`);
    map.setBounds(b, 80, 80, 160, 80);
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__routeMap = { points: pts.length, lengthM: Math.round(line.getLength()) };
    return () => { line.setMap(null); a.setMap(null); z.setMap(null); };
  }, [route, status]);

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
    if (!p.center) return;
    if (goToCampus(p.center[0], p.center[1])) setMapMode('3d');
    else setMsg(`${p.name} 앞으로는 갈 수 없어요`);
  };

  /** 정보 카드의 [3D로 가기]: 서비스 안이면 그 자리, 밖이면 가장 가까운 월드 진입점 + 안내 */
  const land = (t: { lat: number; lng: number; name: string }) => {
    const plan = landAt(t);
    useMapFocus.setState({ notice: plan.kind === 'outside' ? `${t.name} 은(는) 3D 지원 지역 밖이라 가장 가까운 ${plan.worldName}(으)로 왔어요 (직선 ${distLabel(plan.distM)})` : null });
    setMapMode('3d');
  };

  const goListing = (l: ListingSummary) => {
    useListingsUi.getState().select(l.id);
    useUi.setState({ tab: 'home', panelOpen: true });
    land({ lat: l.lat, lng: l.lng, name: l.title });
  };

  return (
    <div className="ui-map" role="region" aria-label="카카오 지도">
      <div ref={ref} className="ui-map-canvas" />
      {status === 'loading' && <p className="ui-map-note" role="status">지도를 불러오는 중</p>}
      {status === 'error' && <p className="ui-map-note" role="alert">{error}</p>}
      {status === 'ready' && <p className="ui-map-legend glass"><i className="is-campus" aria-hidden="true" />캠퍼스 <i className="is-listing" aria-hidden="true" />매물 동네 <i className="is-housing" aria-hidden="true" />청년안심주택 동네 · 점선 안은 3D 로 걸어볼 수 있어요</p>}
      {target && <TargetCard t={target} listings={listings ?? []} housing={housing ?? []} areaId={areaId}
        onGo={() => land(target)} onClose={() => useMapFocus.getState().clear()}
        onNear={(n) => { if (n.listing) { useMapFocus.getState().clear(); setPickedListing(n.listing); } else useMapFocus.getState().focus({ name: n.name, address: null, lat: n.lat, lng: n.lng, kind: n.kind }); }} />}
      {pickedListing && (
        <div className="ui-map-card" role="dialog" aria-label={pickedListing.title}>
          <div className="ui-map-card-title">
            <span className="ui-map-card-no" style={{ background: GRADE_META[pickedListing.grade].color, color: inkFor(GRADE_META[pickedListing.grade].color) }}>{GRADE_META[pickedListing.grade].label}</span>
            {depositRent(pickedListing.deposit, pickedListing.rent)} · {pickedListing.title}
          </div>
          <p className="ui-map-card-sub">환산 {manwon(pickedListing.convertedRent)} · {pickedListing.walkMin == null ? '도보 정보 없음' : `도보 ${pickedListing.walkMin}분`}</p>
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

const KIND_LABEL: Record<string, string> = { LISTING: '매물', HOUSING: '청년안심주택', DORM: '기숙사', TRANSFER: '양도 글', BUILDING: '캠퍼스 건물', ADDRESS: '주소', PLACE: '장소', SITE: '집 주변 동네' };

/** 검색으로 고른 곳의 정보 카드: 이름·주소·서비스 안/밖·가까운 매물/건물·[3D로 가기] */
function TargetCard({ t, listings, housing, areaId, onGo, onClose, onNear }: { t: MapTarget; listings: ListingSummary[]; housing: { id: number; name: string; lat: number; lng: number }[]; areaId: string | null; onGo: () => void; onClose: () => void; onNear: (n: NearItem) => void }) {
  const cur = (areaId ?? 'campus') as 'campus';
  const inside = serviceTargetFor(t.lat, t.lng, cur) != null;
  const plan = planLanding(t.lat, t.lng, cur);
  const near = nearestItems(t, listings, housing);
  return (
    <div className="ui-map-card" role="dialog" aria-label={`${t.name} 정보`}>
      <div className="ui-map-card-title">{t.kind && KIND_LABEL[t.kind] && <span className="ui-map-card-no">{KIND_LABEL[t.kind]}</span>}{t.name}</div>
      {t.address && <p className="ui-map-card-sub">{t.address}</p>}
      <p className={`ui-map-card-svc ${inside ? 'is-in' : 'is-out'}`} role="status">
        {inside ? `3D 로 걸어볼 수 있어요 · ${plan.worldName}` : `3D 지원 지역 밖이에요 · 가장 가까운 ${plan.worldName}까지 ${distLabel(plan.distM)}`}
      </p>
      {near.length > 0 && (
        <ul className="ui-map-near" aria-label="가까운 집·건물">
          {near.map((n) => (
            <li key={n.key}><button type="button" onClick={() => onNear(n)}><span>{n.name}</span><small>{n.sub} · {distLabel(n.d)}</small></button></li>
          ))}
        </ul>
      )}
      <div className="ui-map-card-actions">
        <button type="button" className="ui-map-go" onClick={onGo}>{inside ? '3D로 가기' : `가까운 ${plan.area === 'campus' ? '캠퍼스' : '동네'}로 3D 가기`}</button>
        <button type="button" className="ui-map-close" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
