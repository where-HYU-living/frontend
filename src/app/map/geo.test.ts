import { expect, test } from 'vitest';
import { ORIGIN, toLatLng, toLocal } from './geo';

test('origin maps to the lion statue lat/lng', () => {
  const [lat, lng] = toLatLng(0, 0);
  expect([lat, lng]).toEqual([ORIGIN.lat, ORIGIN.lng]);
  const [x, z] = toLocal(ORIGIN.lat, ORIGIN.lng);
  expect(Math.abs(x) + Math.abs(z)).toBe(0);
});
test('south (+z) is lower latitude, east (+x) is higher longitude', () => {
  const [lat, lng] = toLatLng(100, 100);
  expect(lat).toBeLessThan(ORIGIN.lat);
  expect(lng).toBeGreaterThan(ORIGIN.lng);
});
test('100m is about 0.0009 degrees of latitude', () => {
  expect(ORIGIN.lat - toLatLng(0, 100)[0]).toBeCloseTo(0.000905, 5);
});
test('round trip stays within 1cm', () => {
  const [x, z] = toLocal(...toLatLng(321.5, -210.25));
  expect(x).toBeCloseTo(321.5, 2);
  expect(z).toBeCloseTo(-210.25, 2);
});
test('every campus place with a position lands near the campus', () => {
  const [lat, lng] = toLatLng(475.6, -428.5); // 805 개나리관, 가장 먼 건물 중 하나
  expect(Math.abs(lat - ORIGIN.lat)).toBeLessThan(0.01);
  expect(Math.abs(lng - ORIGIN.lng)).toBeLessThan(0.01);
});
