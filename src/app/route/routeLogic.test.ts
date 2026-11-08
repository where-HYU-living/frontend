import { describe, expect, it } from 'vitest';
import { clipToWorld, estimateRoute, firstPointIn, minutesFor, pathLengthM, type LatLng } from './routeLogic';
import { toLatLng } from '../map/geo';

const ll = (x: number, z: number): LatLng => toLatLng(x, z) as LatLng;

describe('도보 경로 계산 (F6)', () => {
  it('경로 길이는 3D 좌표 거리 합', () => {
    expect(pathLengthM([ll(0, 0), ll(300, 0), ll(300, 400)])).toBeCloseTo(700, 0);
  });
  it('월드 범위 밖 구간은 잘라내고 길이를 나눈다', () => {
    const b = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    const r = clipToWorld([ll(0, 0), ll(300, 0)], b, 0);
    expect(r.totalM).toBeCloseTo(300, 0);
    expect(r.shownM).toBeGreaterThan(97); expect(r.shownM).toBeLessThan(100);
    expect(r.outsideM).toBeGreaterThan(199);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0][0].x).toBeCloseTo(0, 3);
  });
  it('남은 구간 분은 거리 비율', () => { expect(minutesFor(600, 1200, 20)).toBe(10); });
  it('직선 추정: 1.25배·80m/분', () => {
    const e = estimateRoute({ lat: ll(0, 0)[0], lng: ll(0, 0)[1] }, { lat: ll(800, 0)[0], lng: ll(800, 0)[1] });
    expect(e.distanceM).toBe(1000); expect(e.minutes).toBe(13);
  });
  it('캠퍼스 범위에 처음 들어가는 점', () => {
    const p = firstPointIn([ll(-500, 0), ll(500, 0)], { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, 10);
    expect(p!.x).toBeGreaterThan(-91); expect(p!.x).toBeLessThan(-80);
  });
});
