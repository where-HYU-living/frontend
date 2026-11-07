import { expect, test } from 'vitest';
import { labelWidth, pickVisibleLabels } from './KakaoMap';

const at = (key: string, name: string, x: number, y: number) => ({ key, name, x, y });

test('korean characters are wider than ascii', () => {
  expect(labelWidth('본관')).toBe(44);
  expect(labelWidth('IT')).toBe(34);
});
test('far apart labels are all shown', () => {
  const shown = pickVisibleLabels([at('a', '본관', 100, 300), at('b', '역사관', 600, 300)]);
  expect([...shown].sort()).toEqual(['a', 'b']);
});
test('overlapping labels keep only one, the shorter name first', () => {
  const shown = pickVisibleLabels([at('long', '제2학생생활관·한양테크노숙사', 300, 300), at('short', '본관', 310, 300)]);
  expect([...shown]).toEqual(['short']);
});
test('the picked label always wins and is always shown', () => {
  const shown = pickVisibleLabels([at('short', '본관', 310, 300), at('long', '제2학생생활관·한양테크노숙사', 300, 300)], 'long');
  expect(shown.has('long')).toBe(true);
  expect(shown.has('short')).toBe(false);
});
test('labels one above the other (different pin heights) do not collide when far enough', () => {
  const shown = pickVisibleLabels([at('a', '본관', 300, 300), at('b', '역사관', 300, 400)]);
  expect(shown.size).toBe(2);
});
test('empty input is fine', () => expect(pickVisibleLabels([]).size).toBe(0));
