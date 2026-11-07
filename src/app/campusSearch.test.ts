import { expect, test } from 'vitest';
import places from './data/campusPlaces.json';
import { filterPlaces, groupPlaces, type Place } from './campusSearch';

const ALL = places as Place[];
const names = (ps: Place[]) => ps.map((p) => p.name);

test('empty query returns every place', () => expect(filterPlaces(ALL, '  ')).toHaveLength(ALL.length));
test('matches a part of the name', () => {
  expect(names(filterPlaces(ALL, '공학관'))).toEqual(expect.arrayContaining(['제1공학관', '제2공학관']));
});
test('ignores spaces in the query and the name', () => {
  expect(names(filterPlaces(ALL, '제 1 공학관'))).toContain('제1공학관');
});
test('matches by building number', () => {
  expect(names(filterPlaces(ALL, '805'))).toEqual(['개나리관']);
});
test('no match returns empty', () => expect(filterPlaces(ALL, 'zzz')).toEqual([]));
test('groups dorms first and drops empty groups', () => {
  const g = groupPlaces(ALL);
  expect(g.map((x) => x.label)).toEqual(['기숙사', '그 외 건물']);
  expect(groupPlaces(filterPlaces(ALL, '개나리')).map((x) => x.group)).toEqual(['dorm']);
});
test('dorm group has the 8xx dorms', () => {
  const dorm = groupPlaces(ALL)[0].items.map((p) => p.no);
  expect(dorm).toEqual(expect.arrayContaining(['801', '805', '810']));
});
test('Hanyang Women\'s College (9xx) is not in the list', () => {
  expect(ALL.some((p) => p.no.startsWith('9'))).toBe(false);
});
