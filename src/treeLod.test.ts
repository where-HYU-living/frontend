import { expect, test } from 'vitest';
import { LOD_NEAR, lodFor } from './treeLod';

test('near is lod 0', () => expect(lodFor(50)).toBe(0));
test('mid is lod 1', () => expect(lodFor(200)).toBe(1));
test('far is hidden', () => expect(lodFor(600)).toBe(2));
test('hysteresis keeps lod 0 just past the near edge', () => expect(lodFor(LOD_NEAR + 5, 0)).toBe(0));
test('hysteresis lets go past the margin', () => expect(lodFor(LOD_NEAR + 20, 0)).toBe(1));
test('coming back needs to cross the margin too', () => expect(lodFor(LOD_NEAR - 5, 1)).toBe(1));
