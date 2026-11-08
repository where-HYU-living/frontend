import { describe, expect, it } from 'vitest';
import { planLanding, distLabel } from './landing';
import { toLatLng } from '../app/map/geo';
import { SITES } from './neighborhood';
import { CAMPUS_BOX } from './serviceArea';

const at = (x: number, z: number) => { const [lat, lng] = toLatLng(x, z); return planLanding(lat, lng); };

describe('planLanding (지도 → 3D 도착 위치)', () => {
  it('캠퍼스 안이면 그 지점', () => {
    const p = at(100, -100);
    expect(p).toMatchObject({ area: 'campus', kind: 'inside', distM: 0 });
    expect(p.x).toBeCloseTo(100, 3); expect(p.z).toBeCloseTo(-100, 3);
  });
  it('동네 조각 안이면 그 동네 (집에서 200m 떨어진 곳도)', () => {
    const s = SITES.find((v) => v.id === 'h2')!;
    const p = at(s.x, s.z + 200);
    expect(p.kind).toBe('inside');
    const w = SITES.find((v) => v.id === p.area)!; // 조각이 겹치는 곳이면 다른 동네일 수 있다 — 그 조각 안이기만 하면 된다
    expect(Math.abs(w.x - s.x) < 330 && Math.abs(w.z - (s.z + 200)) < 330).toBe(true);
  });
  it('서비스 밖이면 가장 가까운 월드의 진입점 + 거리', () => {
    const s = SITES.find((v) => v.id === 'h5')!;
    const p = at(s.x + 1200, s.z); // 동네 조각(±330m) 밖, h5 에서 1.2km
    expect(p.kind).toBe('outside');
    expect(p.area).toBe('h5');
    expect([p.x, p.z]).toEqual([s.x, s.z]); // 집 앞(기본 자리)으로
    expect(p.distM).toBe(1200);
  });
  it('캠퍼스가 가장 가까우면 캠퍼스 범위 안쪽(40m)으로 당긴 점', () => {
    const p = at(100, CAMPUS_BOX.maxZ + 100); // 남쪽 바로 바깥
    expect(p).toMatchObject({ area: 'campus', kind: 'outside' });
    expect(p.z).toBe(CAMPUS_BOX.maxZ - 40);
    expect(p.x).toBeCloseTo(100, 3);
    expect(p.distM).toBe(140);
  });
  it('거리 문구', () => { expect(distLabel(350)).toBe('350m'); expect(distLabel(1234)).toBe('1.2km'); });
});
