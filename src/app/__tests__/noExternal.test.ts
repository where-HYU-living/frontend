import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

test('index.html loads nothing from the network', () => {
  expect(readFileSync('index.html', 'utf8')).not.toMatch(/https?:\/\//);
});

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test('no source file hardcodes an external cdn/font url', () => {
  const bad = walk('src').filter((f) => /\.(css|tsx?|js)$/.test(f) && /https?:\/\/(cdn|fonts)/.test(readFileSync(f, 'utf8')));
  expect(bad).toEqual([]);
});
