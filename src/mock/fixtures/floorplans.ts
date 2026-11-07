import type { FloorPlan } from '../../api/types';

// 단위 m, 좌표 [x(오른쪽), y(아래쪽)], 원점은 좌상단. 문/창의 offset 은 해당 벽 from 에서의 거리.
export const FLOORPLANS: FloorPlan[] = [
  {
    // 3.8m × 4.8m 오픈형. 위쪽 방/거실, 아래 왼쪽 주방, 아래 오른쪽 욕실. 현관은 아래 벽 왼쪽.
    id: 1, name: '청아진 18타입', areaM2: 18.22, ceilingHeight: 2.4,
    walls: [
      { from: [0, 0], to: [3.8, 0], thickness: 0.2 },
      { from: [3.8, 0], to: [3.8, 4.8], thickness: 0.2 },
      { from: [3.8, 4.8], to: [0, 4.8], thickness: 0.2 },
      { from: [0, 4.8], to: [0, 0], thickness: 0.2 },
      { from: [2.5, 3.3], to: [2.5, 4.8], thickness: 0.1 },
      { from: [2.5, 3.3], to: [3.8, 3.3], thickness: 0.1 },
    ],
    openings: [
      { type: 'door', wall: 2, offset: 2.5, width: 0.9, height: 2.1, sill: 0 },
      { type: 'window', wall: 0, offset: 1.0, width: 1.8, height: 1.3, sill: 0.9 },
      { type: 'window', wall: 1, offset: 0.6, width: 1.6, height: 1.2, sill: 0.9 },
      { type: 'window', wall: 3, offset: 0.5, width: 0.9, height: 1.0, sill: 1.0 },
      { type: 'door', wall: 5, offset: 0.25, width: 0.75, height: 2.0, sill: 0 },
    ],
    rooms: [
      { name: '방·거실', polygon: [[0, 0], [3.8, 0], [3.8, 3.3], [0, 3.3]] },
      { name: '주방', polygon: [[0, 3.3], [2.5, 3.3], [2.5, 4.8], [0, 4.8]] },
      { name: '욕실', polygon: [[2.5, 3.3], [3.8, 3.3], [3.8, 4.8], [2.5, 4.8]] },
    ],
    entrance: [0.85, 4.8], glbUrl: null,
  },
  {
    // 3.6m × 5.06m 분리형. 위쪽 침실, 아래 왼쪽 거실·주방, 가운데 오른쪽 욕실, 현관은 오른쪽 벽.
    id: 2, name: '청아진 18A타입', areaM2: 18.22, ceilingHeight: 2.4,
    walls: [
      { from: [0, 0], to: [3.6, 0], thickness: 0.2 },
      { from: [3.6, 0], to: [3.6, 5.06], thickness: 0.2 },
      { from: [3.6, 5.06], to: [0, 5.06], thickness: 0.2 },
      { from: [0, 5.06], to: [0, 0], thickness: 0.2 },
      { from: [0, 2.6], to: [3.6, 2.6], thickness: 0.1 },
      { from: [2.4, 2.6], to: [2.4, 3.9], thickness: 0.1 },
      { from: [2.4, 3.9], to: [3.6, 3.9], thickness: 0.1 },
    ],
    openings: [
      { type: 'door', wall: 1, offset: 3.95, width: 0.9, height: 2.1, sill: 0 },
      { type: 'window', wall: 0, offset: 0.9, width: 1.8, height: 1.3, sill: 0.9 },
      { type: 'window', wall: 3, offset: 0.8, width: 1.4, height: 1.2, sill: 0.9 },
      { type: 'window', wall: 2, offset: 1.2, width: 1.2, height: 1.2, sill: 0.9 },
      { type: 'door', wall: 4, offset: 0.5, width: 0.9, height: 2.0, sill: 0 },
      { type: 'door', wall: 6, offset: 0.2, width: 0.75, height: 2.0, sill: 0 },
    ],
    rooms: [
      { name: '침실', polygon: [[0, 0], [3.6, 0], [3.6, 2.6], [0, 2.6]] },
      { name: '거실·주방', polygon: [[0, 2.6], [2.4, 2.6], [2.4, 3.9], [3.6, 3.9], [3.6, 5.06], [0, 5.06]] },
      { name: '욕실', polygon: [[2.4, 2.6], [3.6, 2.6], [3.6, 3.9], [2.4, 3.9]] },
    ],
    entrance: [3.6, 4.4], glbUrl: null,
  },
  {
    // 기숙사 2인실 3.3m × 5.4m. 방 + 욕실.
    id: 3, name: '제1학생생활관 2인실', areaM2: 17.82, ceilingHeight: 2.4,
    walls: [
      { from: [0, 0], to: [3.3, 0], thickness: 0.2 },
      { from: [3.3, 0], to: [3.3, 5.4], thickness: 0.2 },
      { from: [3.3, 5.4], to: [0, 5.4], thickness: 0.2 },
      { from: [0, 5.4], to: [0, 0], thickness: 0.2 },
      { from: [0, 4.2], to: [1.7, 4.2], thickness: 0.1 },
      { from: [1.7, 4.2], to: [1.7, 5.4], thickness: 0.1 },
    ],
    openings: [
      { type: 'door', wall: 2, offset: 0.6, width: 0.9, height: 2.1, sill: 0 },
      { type: 'window', wall: 0, offset: 0.7, width: 1.9, height: 1.4, sill: 0.9 },
      { type: 'door', wall: 4, offset: 0.4, width: 0.75, height: 2.0, sill: 0 },
    ],
    rooms: [
      { name: '침실', polygon: [[0, 0], [3.3, 0], [3.3, 4.2], [0, 4.2]] },
      { name: '현관·수납', polygon: [[1.7, 4.2], [3.3, 4.2], [3.3, 5.4], [1.7, 5.4]] },
      { name: '욕실', polygon: [[0, 4.2], [1.7, 4.2], [1.7, 5.4], [0, 5.4]] },
    ],
    entrance: [2.25, 5.4], glbUrl: null,
  },
];
