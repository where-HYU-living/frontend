import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NeighborhoodButton, NeighborhoodHud } from './NeighborhoodButton';
import { useArea } from './state/area';
import { useWorld } from './state/world';
import { useUi } from './state/ui';
import { useDetailSel } from './state/detail';
import { useListingsUi } from './features/listings';
import { renderHook } from '@testing-library/react';
import { useVisit } from './visit';

const api = { getPose: () => ({ p: [5, 0, 7] as [number, number, number], heading: 1 }), setMarkers: () => {}, setBeacons: () => {}, teleport: () => true };
afterEach(cleanup);
beforeEach(() => { useArea.setState({ area: 'campus', returnPose: null, pendingReturn: null }); useWorld.setState({ api: api as never, status: 'ready' }); useUi.setState({ indoor: null, panelOpen: true, tab: 'tour', mapMode: '3d' }); useDetailSel.setState({ housing: null }); useListingsUi.setState({ selectedId: null }); });

describe('NeighborhoodButton', () => {
  it('동네가 있는 매물에만 보이고 누르면 들어간다', () => {
    const { rerender } = render(<NeighborhoodButton kind="listing" id={1} lat={37.55} lng={127.04} name="a" />);
    expect(screen.queryByText('주변 걸어보기')).toBeNull();
    rerender(<NeighborhoodButton kind="listing" id={6} lat={37.55} lng={127.04} name="b" />);
    fireEvent.click(screen.getByText('주변 걸어보기'));
    expect(useArea.getState().area).toEqual({ site: 'l6' });
    expect(useArea.getState().returnPose).toEqual({ x: 5, z: 7, yaw: 1 });
    expect(useUi.getState().panelOpen).toBe(false);
    expect(useUi.getState().tab).toBe('home');
    expect(useListingsUi.getState().selectedId).toBe(6);
  });
});

describe('useVisit (상세 패널·지도 핀 공통)', () => {
  it('지도에서 가도 패널에서 간 것과 같다: 그 동네·그 탭·그 상세, 패널은 접고 3D 로', () => {
    useUi.setState({ mapMode: '2d', tab: 'home' });
    const { result } = renderHook(() => useVisit());
    result.current({ kind: 'HOUSING', id: 3, lat: 37.58, lng: 127.04, name: '단지' });
    expect(useArea.getState().area).toEqual({ site: 'h3' });
    expect(useUi.getState()).toMatchObject({ tab: 'housing', panelOpen: false, mapMode: '3d' });
    expect(useDetailSel.getState().housing).toBe(3);
  });
});

describe('NeighborhoodHud', () => {
  it('캠퍼스에서는 안 보인다', () => {
    const { container } = render(<NeighborhoodHud />);
    expect(container.firstChild).toBeNull();
  });
  it('동네에서는 캠퍼스로·실내 보기가 있다', () => {
    useArea.setState({ area: { site: 'l6' } });
    render(<NeighborhoodHud />);
    fireEvent.click(screen.getByText('캠퍼스로'));
    expect(useArea.getState().area).toBe('campus');
  });
  it('[단지 정보] 는 그 단지 상세를 열고, 다시 누르면 접는다', () => {
    useArea.setState({ area: { site: 'h3' } });
    useUi.setState({ panelOpen: false });
    render(<NeighborhoodHud />);
    fireEvent.click(screen.getByText('단지 정보'));
    expect(useUi.getState()).toMatchObject({ tab: 'housing', panelOpen: true });
    expect(useDetailSel.getState().housing).toBe(3);
    fireEvent.click(screen.getByText('단지 정보'));
    expect(useUi.getState().panelOpen).toBe(false);
  });
  it('지도 화면에서는 안 보인다', () => {
    useArea.setState({ area: { site: 'l6' } });
    useUi.setState({ mapMode: '2d' });
    const { container } = render(<NeighborhoodHud />);
    expect(container.firstChild).toBeNull();
  });
  it('실내 보기는 그 집의 평면도로 들어간다', () => {
    useArea.setState({ area: { site: 'l6' } });
    render(<NeighborhoodHud />);
    fireEvent.click(screen.getByText('실내 보기'));
    expect(useUi.getState().indoor?.floorplanId).toBe(101);
  });
});

describe('초대 자리(stand)로 옮기기', () => {
  it('그 자리가 벽에 걸리면 바로 둘레의 빈자리에 선다 (30m 밖 "보이는 자리"로 가지 않는다)', () => {
    const tried: [number, number][] = [];
    const goToPlace = vi.fn(() => true), goToLandmark = vi.fn();
    // (100,100) 과 반지름 1m 안은 막혀 있고, 2m 부터 빈자리
    const teleport = (x: number, z: number) => { tried.push([x, z]); return Math.hypot(x - 100, z - 100) > 1.5; };
    useWorld.setState({ api: { ...api, teleport, goToPlace, goToLandmark } as never, status: 'ready', areaId: 'l6' });
    useArea.setState({ area: { site: 'l6' }, pendingGoto: { area: 'l6', x: 100, z: 100, stand: true } });
    render(<NeighborhoodHud />);
    const [x, z] = tried[tried.length - 1];
    expect(Math.hypot(x - 100, z - 100)).toBeCloseTo(2, 5);
    expect(goToPlace).not.toHaveBeenCalled();
    expect(goToLandmark).not.toHaveBeenCalled();
  });
});
