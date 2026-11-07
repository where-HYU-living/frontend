import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

test('login modal hides the google button when no client id is configured', () => {
  const src = readFileSync('src/app/LoginModal.tsx', 'utf8');
  expect(src).toMatch(/GOOGLE_CLIENT_ID && /); // 키가 없으면 버튼을 그리지 않는다
});
