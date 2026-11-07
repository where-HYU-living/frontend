import { expect, test } from 'vitest';
import { summarizeFrames } from './stats';

test('summarizes 60fps frames', () => {
  const r = summarizeFrames(Array(100).fill(16.7));
  expect(r.p50).toBeCloseTo(16.7);
  expect(r.fps).toBeCloseTo(59.9, 0);
});
test('p95 picks the slow tail', () => {
  const ms = [...Array(95).fill(10), ...Array(5).fill(100)];
  expect(summarizeFrames(ms).p95).toBe(100);
});
test('empty input is all zero', () => expect(summarizeFrames([])).toEqual({ p50: 0, p95: 0, fps: 0 }));
