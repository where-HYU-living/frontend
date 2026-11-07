import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithClient } from '../test/wrap';
import { buildingNamesOf, filterDepartments, groupByCollege, type Dept } from './departments';
import { DepartmentPicker } from './DepartmentPicker';
import { ProfileModal } from './ProfileModal';
import { useSession } from './state/session';
import { useUi } from './state/ui';
import { useState } from 'react';

const DEPTS: Dept[] = [
  { id: 1, name: '컴퓨터소프트웨어학부', college: '공과대학', defaultBuildingIds: [212, 1005] },
  { id: 2, name: '기계공학부', college: '공과대학', defaultBuildingIds: [213] },
  { id: 3, name: '경영학부', college: '경영대학', defaultBuildingIds: [706] },
  { id: 4, name: '국어국문학과', college: '인문과학대학', defaultBuildingIds: [] },
];
const NAMES = new Map([[212, '제1공학관'], [1005, '연구지원센터'], [213, '구자겸기계관'], [706, '경영관']]);

test('filter matches department or college name, ignoring spaces and case', () => {
  expect(filterDepartments(DEPTS, '').length).toBe(4);
  expect(filterDepartments(DEPTS, '컴퓨터').map((d) => d.id)).toEqual([1]);
  expect(filterDepartments(DEPTS, '공과 대학').map((d) => d.id)).toEqual([1, 2]); // 단과대 이름으로도
  expect(filterDepartments(DEPTS, '없는학과')).toEqual([]);
});

test('groups by college in first-seen order, departments sorted by name', () => {
  const g = groupByCollege(DEPTS);
  expect(g.map((x) => x.college)).toEqual(['공과대학', '경영대학', '인문과학대학']);
  expect(g[0].items.map((d) => d.name)).toEqual(['기계공학부', '컴퓨터소프트웨어학부']);
});

test('building names skip unknown ids', () => {
  expect(buildingNamesOf(DEPTS[0], NAMES)).toEqual(['제1공학관', '연구지원센터']);
  expect(buildingNamesOf({ ...DEPTS[0], defaultBuildingIds: [212, 999] }, NAMES)).toEqual(['제1공학관']);
  expect(buildingNamesOf(DEPTS[3], NAMES)).toEqual([]);
});

function Harness({ onChange }: { onChange?: (id: number | null) => void }) {
  const [v, setV] = useState<number | null>(null);
  return <DepartmentPicker departments={DEPTS} value={v} buildingNames={NAMES} onChange={(id) => { setV(id); onChange?.(id); }} />;
}

afterEach(cleanup);

test('typing narrows the list, picking shows the mapped buildings, clear removes it', () => {
  const onChange = vi.fn();
  renderWithClient(<Harness onChange={onChange} />);
  const input = screen.getByLabelText('학과 검색');
  fireEvent.focus(input);
  expect(screen.getAllByRole('option')).toHaveLength(4);
  fireEvent.change(input, { target: { value: '경영' } });
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['경영학부']);
  fireEvent.mouseDown(screen.getByRole('option', { name: '경영학부' }));
  expect(onChange).toHaveBeenLastCalledWith(3);
  expect(screen.getByText('학과 사무실 건물: 경영관')).toBeTruthy();
  expect(screen.queryByRole('listbox')).toBeNull(); // 고르면 닫힘
  fireEvent.click(screen.getByLabelText('학과 선택 지우기'));
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(screen.queryByText('학과 사무실 건물: 경영관')).toBeNull();
});

test('keyboard: arrows move, enter picks; department without a building says so; empty search shows a message', () => {
  const onChange = vi.fn();
  renderWithClient(<Harness onChange={onChange} />);
  const input = screen.getByLabelText('학과 검색');
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: 'ArrowDown' }); // 목록 순서: 공과(기계,컴퓨터) → 경영 → 인문 → 두 번째 = 컴퓨터
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).toHaveBeenLastCalledWith(1);
  fireEvent.change(input, { target: { value: '국어' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByText('건물 정보가 아직 없어요')).toBeTruthy();
  fireEvent.change(input, { target: { value: 'zzzz' } });
  expect(screen.getByText('검색 결과가 없어요')).toBeTruthy();
});

const fetchMock = vi.fn();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); useSession.setState({ token: 't', loginOpen: false }); useUi.setState({ profileOpen: true }); try { sessionStorage.setItem('chatatda.onboarded', '1'); } catch { /* */ } });
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); });

test('profile modal: server department list is searchable and save sends departmentId + its buildings', async () => {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/departments')) return Promise.resolve(json(DEPTS));
    if (url.includes('/me/profile') && init?.method === 'PUT') return Promise.resolve(json({ id: 1 }));
    if (url.includes('/me/profile')) return Promise.resolve(json({ id: 1, email: 'a', nickname: 'n', departmentId: null, buildingIds: [], budget: null }));
    return Promise.resolve(json([]));
  });
  renderWithClient(<ProfileModal />);
  const input = await screen.findByLabelText('학과 검색');
  fireEvent.change(input, { target: { value: '기계' } });
  fireEvent.mouseDown(await screen.findByRole('option', { name: '기계공학부' }));
  fireEvent.click(screen.getByText('저장'));
  await waitFor(() => {
    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT');
    expect(JSON.parse((put![1] as RequestInit).body as string)).toMatchObject({ departmentId: 2, buildingIds: [213] });
  });
});

test('profile modal falls back to the bundled Hanyang department list when the server is down', async () => {
  fetchMock.mockRejectedValue(new TypeError('offline'));
  renderWithClient(<ProfileModal />);
  fireEvent.focus(await screen.findByLabelText('학과 검색'));
  expect((await screen.findAllByRole('option')).length).toBeGreaterThan(0);
});

test('bundled list covers Hanyang Seoul: every department has a college and known buildings', async () => {
  const { default: bundled } = await import('./data/departments.json');
  const places = (await import('./data/campusPlaces.json')).default as { id: number }[];
  const ids = new Set(places.map((p) => p.id));
  expect(bundled.length).toBeGreaterThanOrEqual(50);
  expect(new Set(bundled.map((d) => d.name)).size).toBe(bundled.length); // 이름 중복 없음
  for (const d of bundled) {
    expect(d.college).toBeTruthy();
    expect(d.defaultBuildingIds.length).toBeGreaterThan(0);
    for (const b of d.defaultBuildingIds) expect(ids.has(b)).toBe(true); // 건물 id 는 앱 건물 목록에 있어야 한다
  }
  expect(bundled.some((d) => d.name === '컴퓨터소프트웨어학부')).toBe(true);
});
