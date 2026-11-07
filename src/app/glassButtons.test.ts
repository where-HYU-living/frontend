import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

// 회귀 방지: 버튼 초기화 규칙이 .glass(우선순위 0,1,0)보다 세면 .glass 버튼의 배경이 지워져 밤에 안 보인다
test('button reset has zero specificity so .glass buttons keep their glass background', () => {
  const css = readFileSync('src/app/app.css', 'utf8');
  expect(css).toMatch(/:where\(\.ui-layer\) button \{[^}]*background: none/);
  expect(css).not.toMatch(/^\.ui-layer button \{[^}]*background: none/m);
});

test('glass buttons set their own text color so they stay readable on a dark sky', () => {
  const css = readFileSync('src/app/app.css', 'utf8');
  expect(css).toMatch(/\.textbtn, \.iconbtn, \.reopen \{ color: var\(--ui-ink\); \}/);
});

test('map switch button and clock have fixed widths so the top bar does not shift when text changes', () => {
  const css = readFileSync('src/app/app.css', 'utf8');
  expect(css).toMatch(/\.mapswitch \{ width: \d+px;/);
  expect(css).toMatch(/\.tod-clock \{[^}]*width: \d+px/);
});

test('glass surfaces and inputs set a dark text color (outside .ui-layer the body color is light cream)', () => {
  const css = readFileSync('src/app/app.css', 'utf8');
  expect(css).toMatch(/\.glass \{[^}]*color: var\(--ui-ink\)/);
  expect(css).toMatch(/\.ui-modal input[^{]*\{ color: var\(--ui-ink\)/);
});
