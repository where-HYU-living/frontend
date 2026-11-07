import { describe, expect, it } from 'vitest';
import { serviceTargetFor } from './serviceArea';
import { toLatLng } from '../app/map/geo';
import { SITES } from './neighborhood';

const at = (x: number, z: number, cur: 'campus' | string = 'campus') => { const [la, lo] = toLatLng(x, z); return serviceTargetFor(la, lo, cur); };
describe('serviceTargetFor', () => {
  it('캠퍼스 안은 campus', () => { expect(at(-13, 1.5)?.area).toBe('campus'); expect(at(100, -100)?.area).toBe('campus'); });
  it('집 근처는 그 동네 (캠퍼스 가장자리와 겹쳐도 동네 우선)', () => {
    for (const s of SITES) expect(at(s.x + 10, s.z - 10)?.area, s.id).toBe(s.id);
  });
  it('집에서 멀리 떨어진 허공은 서비스 밖', () => { expect(at(3000, 3000)).toBeNull(); expect(at(-2000, -2500)).toBeNull(); });
  it('현재 동네 조각 안이면 월드를 바꾸지 않는다', () => { const l6 = SITES.find((s) => s.id === 'l6')!; expect(at(l6.x - 200, l6.z + 200, 'l6')?.area).toBe('l6'); });
});
