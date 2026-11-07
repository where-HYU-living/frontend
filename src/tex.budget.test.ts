import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { imageSize } from 'image-size';
import { expect, test } from 'vitest';

const DIR = 'public/tex';
const files = (kind: string) => readdirSync(DIR).filter((f) => f.includes(kind));
const maxSide = (f: string) => { const s = imageSize(readFileSync(join(DIR, f))); return Math.max(s.width ?? 0, s.height ?? 0); };

test('texture folder stays under 12MB', () => {
  const total = readdirSync(DIR).reduce((a, f) => a + statSync(join(DIR, f)).size, 0);
  expect(total).toBeLessThanOrEqual(12_000_000);
});
test('diffuse maps are at most 1024px', () => {
  for (const f of files('_diff')) expect(maxSide(f), f).toBeLessThanOrEqual(1024);
});
test('normal and roughness maps are at most 512px', () => {
  for (const f of [...files('_nor'), ...files('_rough')]) expect(maxSide(f), f).toBeLessThanOrEqual(512);
});
