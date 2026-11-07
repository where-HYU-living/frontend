import { expect, test } from 'vitest';
import { buildInterior } from './buildInterior';
import type { FloorPlan } from '../api/types';

const base = (o: Partial<FloorPlan>): FloorPlan => ({
  id: 1, name: 't', areaM2: 10, ceilingHeight: 2.4,
  walls: [{ from: [0, 0], to: [2.6, 0], thickness: 0.15 }], openings: [],
  rooms: [{ name: '거실', polygon: [[0, 0], [2.6, 0], [2.6, 4.2], [0, 4.2]] }], entrance: [1.3, 0], glbUrl: null, ...o,
});

test('plain wall is one piece with wall length and ceiling height', () => {
  const { wallPieces } = buildInterior(base({}));
  expect(wallPieces).toHaveLength(1);
  expect(wallPieces[0].size[0]).toBeCloseTo(2.6);
  expect(wallPieces[0].size[1]).toBeCloseTo(2.4);
});

test('door splits wall into two sides plus a lintel', () => {
  const { wallPieces } = buildInterior(base({ openings: [{ type: 'door', wall: 0, offset: 0.3, width: 0.9, height: 2.1, sill: 0 }] }));
  expect(wallPieces).toHaveLength(3);
  const lintel = wallPieces.find((b) => b.center[1] > 2.1)!;
  expect(lintel.size[1]).toBeCloseTo(0.3);
});

test('window splits into sides, below and above', () => {
  const { wallPieces } = buildInterior(base({ openings: [{ type: 'window', wall: 0, offset: 0.5, width: 1.6, height: 1.2, sill: 0.9 }] }));
  expect(wallPieces).toHaveLength(4);
});

test('spawn is 0.8m inside from the entrance', () => {
  const { spawn } = buildInterior(base({}));
  expect(spawn[0]).toBeCloseTo(1.3);
  expect(spawn[2]).toBeCloseTo(0.8);
});

test('wall pieces use plan (x, y) as three.js (x, z)', () => {
  const { wallPieces } = buildInterior(base({ walls: [{ from: [0, 1], to: [0, 3], thickness: 0.1 }] }));
  expect(wallPieces[0].center[0]).toBeCloseTo(0);
  expect(wallPieces[0].center[2]).toBeCloseTo(2);
});
