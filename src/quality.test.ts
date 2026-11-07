import { expect, test } from 'vitest';
import { pickQuality } from './quality';

const base = { search: '', dpr: 1, cores: 16, mobile: false };

test('explicit ?q wins', () => expect(pickQuality({ ...base, search: '?q=low' }).name).toBe('low'));
test('mobile defaults to low', () => expect(pickQuality({ ...base, dpr: 3, cores: 8, mobile: true }).name).toBe('low'));
test('retina laptop defaults to med', () => expect(pickQuality({ ...base, dpr: 2, cores: 10 }).name).toBe('med'));
test('big desktop defaults to high', () => expect(pickQuality(base).name).toBe('high'));
test('med has no tree shadows and 1024 shadow map', () => {
  const q = pickQuality({ ...base, search: '?q=med' });
  expect([q.treeShadows, q.shadowMap]).toEqual([false, 1024]);
});
test('unknown q falls back to auto', () => expect(pickQuality({ ...base, search: '?q=ultra' }).name).toBe('high'));
