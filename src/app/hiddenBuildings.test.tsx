import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CampusTourPanel } from './CampusTourPanel';
import { HIDDEN_BUILDING_IDS, HIDDEN_BUILDING_NOS, visiblePlaces } from './data/hiddenBuildings';
import { useSearch } from './features/search';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('숨기는 건물은 807 · 809 · 810 · N10 이고, N10 은 내부 id 1004 로 연결된다', () => {
  expect([...HIDDEN_BUILDING_NOS]).toEqual(['807', '809', '810', 'N10']);
  expect([...HIDDEN_BUILDING_IDS].sort((a, b) => a - b)).toEqual([807, 809, 810, 1004]);
});

test('보여 주는 건물 목록에는 숨긴 건물이 없고 나머지 기숙사는 그대로 있다', () => {
  const nos = visiblePlaces.map((p) => p.no);
  for (const hidden of HIDDEN_BUILDING_NOS) expect(nos).not.toContain(hidden);
  for (const kept of ['801', '802', '803', '804', '805', '806', '101']) expect(nos).toContain(kept);
});

test('캠퍼스 투어 목록에 숨긴 건물이 안 나오고, 이름이나 번호로 검색해도 안 나온다', () => {
  render(<CampusTourPanel />);
  for (const name of ['게스트하우스', '제6학생생활관', '제7학생생활관', '사근동기숙사']) expect(screen.queryByText(name)).toBeNull();
  expect(screen.getByText('개나리관')).toBeTruthy(); // 다른 기숙사는 그대로
  const box = screen.getByLabelText('캠퍼스 건물 검색');
  for (const q of ['게스트', '제6학생', '제7학생', '사근동', '807', '809', '810', 'N10']) {
    fireEvent.change(box, { target: { value: q } });
    expect(screen.getByText('찾는 건물이 없어요'), q).toBeTruthy();
  }
});

test('통합 검색 결과에서도 숨긴 건물은 건물·기숙사 어느 쪽으로 와도 빠진다', async () => {
  const results = [
    { type: 'BUILDING', id: 807, name: '게스트하우스', address: null, lat: 1, lng: 1 },
    { type: 'DORM', id: 810, name: '제7학생생활관', address: null, lat: 1, lng: 1 },
    { type: 'BUILDING', id: 1004, name: '사근동기숙사', address: null, lat: 1, lng: 1 },
    { type: 'BUILDING', id: 805, name: '개나리관', address: null, lat: 1, lng: 1 },
    { type: 'DORM', id: 805, name: '개나리관', address: null, lat: 1, lng: 1 },
    { type: 'LISTING', id: 810, name: '행당동 원룸', address: 'a', lat: 1, lng: 1 }, // 매물 id 가 우연히 810 이어도 매물은 남는다
    { type: 'ADDRESS', id: null, name: '서울 성동구', address: null, lat: 1, lng: 1 },
  ];
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(results), { status: 200 })));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useSearch('기숙사'), { wrapper });
  await waitFor(() => expect(result.current.data).toBeTruthy(), { timeout: 3000 });
  expect(result.current.data!.map((r) => `${r.type}:${r.id}`)).toEqual(['BUILDING:805', 'DORM:805', 'LISTING:810', 'ADDRESS:null']);
});
