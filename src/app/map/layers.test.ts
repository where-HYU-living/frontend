import { expect, test } from 'vitest';
import { mapLayers } from './KakaoMap';

test('지도에서는 탭이 곧 핀 필터다', () => {
  expect(mapLayers('home')).toEqual({ campus: false, listings: true, housing: false, dorms: false, transfers: false });
  expect(mapLayers('tour')).toEqual({ campus: true, listings: false, housing: false, dorms: false, transfers: false });
  expect(mapLayers('dorm')).toEqual({ campus: false, listings: false, housing: false, dorms: true, transfers: false });
  expect(mapLayers('housing')).toEqual({ campus: false, listings: false, housing: true, dorms: false, transfers: false });
  expect(mapLayers('transfer')).toEqual({ campus: false, listings: false, housing: false, dorms: false, transfers: true });
});

test('지도에 올릴 게 없는 탭은 캠퍼스·매물·단지를 모두 보여 준다', () => {
  for (const t of ['myhome', 'fav', 'inbox'] as const) expect(mapLayers(t)).toEqual({ campus: true, listings: true, housing: true, dorms: false, transfers: false });
});
