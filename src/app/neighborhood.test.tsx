import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NeighborhoodButton, NeighborhoodHud } from './NeighborhoodButton';
import { useArea } from './state/area';
import { useWorld } from './state/world';
import { useUi } from './state/ui';

const api = { getPose: () => ({ p: [5, 0, 7] as [number, number, number], heading: 1 }), setMarkers: () => {}, setBeacons: () => {}, teleport: () => true };
afterEach(cleanup);
beforeEach(() => { useArea.setState({ area: 'campus', returnPose: null, pendingReturn: null }); useWorld.setState({ api: api as never, status: 'ready' }); useUi.setState({ indoor: null, panelOpen: true }); });

describe('NeighborhoodButton', () => {
  it('동네가 있는 매물에만 보이고 누르면 들어간다', () => {
    const { rerender } = render(<NeighborhoodButton kind="listing" id={1} />);
    expect(screen.queryByText('주변 걸어보기')).toBeNull();
    rerender(<NeighborhoodButton kind="listing" id={6} />);
    fireEvent.click(screen.getByText('주변 걸어보기'));
    expect(useArea.getState().area).toEqual({ site: 'l6' });
    expect(useArea.getState().returnPose).toEqual({ x: 5, z: 7, yaw: 1 });
    expect(useUi.getState().panelOpen).toBe(false);
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
  it('실내 보기는 그 집의 평면도로 들어간다', () => {
    useArea.setState({ area: { site: 'l6' } });
    render(<NeighborhoodHud />);
    fireEvent.click(screen.getByText('실내 보기'));
    expect(useUi.getState().indoor?.floorplanId).toBe(101);
  });
});
