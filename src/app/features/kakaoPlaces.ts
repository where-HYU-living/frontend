/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { loadKakao } from '../map/loadKakao';
import { useDebounced } from './search';

export type KakaoPlace = { id: string; name: string; address: string; category: string; lat: number; lng: number };
const HANYANG = { lat: 37.5561486, lng: 127.044341 };

/** 카카오맵 장소 검색(JS SDK services.Places). 한양대 주변 5km 안을 가까운 순으로. 키·SDK 가 없으면 빈 목록 */
export function searchKakaoPlaces(q: string, size = 8): Promise<KakaoPlace[]> {
  return loadKakao(import.meta.env.VITE_KAKAO_JS_KEY).then((kakao: any) => new Promise<KakaoPlace[]>((resolve) => {
    const places = kakao?.maps?.services?.Places && new kakao.maps.services.Places();
    if (!places) return resolve([]);
    places.keywordSearch(q, (data: any[], status: string) => {
      if (status !== kakao.maps.services.Status.OK) return resolve([]);
      resolve(data.map((d) => ({ id: d.id, name: d.place_name, address: d.road_address_name || d.address_name || '', category: d.category_group_name || '', lat: +d.y, lng: +d.x })));
    }, { location: new kakao.maps.LatLng(HANYANG.lat, HANYANG.lng), radius: 5000, sort: kakao.maps.services.SortBy.DISTANCE, size });
  })).catch(() => []);
}

export function useKakaoPlaces(q: string): KakaoPlace[] {
  const term = useDebounced(q.trim(), 350);
  const [res, setRes] = useState<{ term: string; items: KakaoPlace[] }>({ term: '', items: [] });
  useEffect(() => {
    if (term.length < 2) return;
    let dead = false;
    searchKakaoPlaces(term).then((items) => { if (!dead) setRes({ term, items }); });
    return () => { dead = true; };
  }, [term]);
  return term.length >= 2 && res.term === term ? res.items : [];
}
