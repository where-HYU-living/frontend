import { create } from 'zustand';
import { api } from '../../api/client';
import { useSession } from '../state/session';
import { useUi } from '../state/ui';
import { estimateRoute, type LatLng } from './routeLogic';
import campusPlaces from '../data/campusPlaces.json';
import type { CampusBuilding, Profile } from '../../api/types';
import { toLatLng } from '../map/geo';

/** 4단계 F6: 집 → 내 과 건물 도보 경로. 3D(바닥 선·화살표)와 지도(폴리라인)가 같은 값을 그린다 */
export type WalkRoute = {
  from: { lat: number; lng: number; name: string };
  to: { id: number; name: string; lat: number; lng: number };
  minutes: number;
  distanceM: number;
  path: LatLng[];
  /** 서버(TMAP) 경로를 못 받아 직선으로 추정했으면 true */
  estimated: boolean;
};

type RouteState = {
  route: WalkRoute | null;
  /** 학과(과 건물)를 정하지 않아 경로를 못 그릴 때 안내를 띄운다 */
  needDept: boolean;
  loading: boolean;
  clear: () => void;
};

export const useRoute = create<RouteState>((set) => ({ route: null, needDept: false, loading: false, clear: () => set({ route: null, needDept: false, loading: false }) }));

type Place = { id: number; name: string; center: [number, number] | null };

/** 건물 id → 이름·위경도 (/buildings, 없으면 앱 내장 목록) */
export function buildingPoint(id: number, buildings?: CampusBuilding[]): { id: number; name: string; lat: number; lng: number } | null {
  const b = buildings?.find((x) => x.id === id);
  if (b) return { id, name: b.name, lat: b.lat, lng: b.lng };
  const p = (campusPlaces as unknown as Place[]).find((x) => x.id === id);
  if (!p?.center) return null;
  const [lat, lng] = toLatLng(p.center[0], p.center[1]);
  return { id, name: p.name, lat, lng };
}

/**
 * 경로 요청: 로그인·학과(과 건물)가 없으면 needDept 안내, 있으면 /walk 로 받아 route 에 넣는다.
 * 서버가 실패하면(외부 API·키 없음) 직선 추정으로 대신하고 estimated 로 표시한다.
 */
export async function showRoute(from: { lat: number; lng: number; name: string }, profile: Profile | null | undefined, buildings?: CampusBuilding[]): Promise<WalkRoute | null> {
  const token = useSession.getState().token;
  const bid = profile?.buildingIds?.[0];
  if (!token || bid == null) { useRoute.setState({ route: null, needDept: true, loading: false }); return null; }
  const to = buildingPoint(bid, buildings);
  if (!to) { useRoute.setState({ route: null, needDept: true, loading: false }); return null; }
  useRoute.setState({ loading: true, needDept: false });
  let r: WalkRoute;
  try {
    const w = await api<{ minutes: number; distanceM: number; path: LatLng[] }>('/walk', { query: { fromLat: from.lat, fromLng: from.lng, buildingId: bid } });
    if (!w.path?.length) throw new Error('empty');
    r = { from, to, minutes: w.minutes, distanceM: w.distanceM, path: w.path, estimated: false };
  } catch {
    r = { from, to, ...estimateRoute(from, to), estimated: true };
  }
  useRoute.setState({ route: r, loading: false, needDept: false });
  return r;
}

/** 학과 고르기로 보내기 (게스트면 로그인부터) */
export function pickDepartment() {
  if (useSession.getState().requireLogin()) useUi.setState({ profileOpen: true });
}

// 점검 스크립트용 (scripts/route-check.mjs)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__route = useRoute;
