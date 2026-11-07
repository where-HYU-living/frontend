import { describe, expect, it } from 'vitest';
import { SITES, isSiteId, neighborhoodUrl, siteForHousing, siteForListing, siteMeta } from './neighborhood';
import { useArea } from '../app/state/area';

describe('동네 목록', () => {
  it('평면도 있는 매물 7건·단지 5곳만 동네가 있다', () => {
    expect([4, 6, 10, 17, 18, 19, 20].map(siteForListing)).toEqual(['l4', 'l6', 'l10', 'l17', 'l18', 'l19', 'l20']);
    expect(siteForListing(1)).toBeNull();
    expect(siteForHousing(5)).toBe('h5');
    expect(siteForHousing(9)).toBeNull();
    expect(SITES).toHaveLength(12);
  });
  it('url·id 규칙', () => {
    expect(neighborhoodUrl('l6')).toBe('/neighborhoods/l6.json');
    expect(isSiteId('h3')).toBe(true); expect(isSiteId('campus')).toBe(false);
    expect(siteMeta('l6')?.floorplanId).toBe(101);
  });
});

describe('useArea', () => {
  it('들어갔다 나오면 캠퍼스 위치를 한 번만 돌려준다', () => {
    useArea.setState({ area: 'campus', returnPose: null, pendingReturn: null });
    useArea.getState().enter('l6', { x: 10, z: 20 });
    expect(useArea.getState().area).toEqual({ site: 'l6' });
    useArea.getState().enter('h1', { x: 99, z: 99 }); // 동네에서 다른 동네로: 원래 캠퍼스 위치 유지
    useArea.getState().leave();
    expect(useArea.getState().area).toBe('campus');
    expect(useArea.getState().consumeReturn()).toEqual({ x: 10, z: 20 });
    expect(useArea.getState().consumeReturn()).toBeNull();
  });
});
