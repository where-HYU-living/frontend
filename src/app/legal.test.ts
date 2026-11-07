import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

// 구글 OAuth 브랜드 확인: 홈페이지(JS 없이 받은 HTML)에 앱 이름·설명·개인정보처리방침 링크가 있어야 한다
const html = readFileSync('index.html', 'utf8');

test('static home page names the app and links privacy policy and terms without needing JavaScript', () => {
  expect(html).toContain('<footer id="legal">');
  expect(html).toMatch(/href="\/privacy\.html"[^>]*>개인정보처리방침/);
  expect(html).toMatch(/href="\/terms\.html"[^>]*>서비스 약관/);
  expect(html).toMatch(/<meta name="description" content="[^"]*어디서사냥/);
});

test('policy pages exist and name the same app', () => {
  for (const f of ['public/privacy.html', 'public/terms.html']) expect(readFileSync(f, 'utf8')).toContain('어디서사냥');
});
